const API_BASE = 'http://localhost:5000/api';

// DOM Elements
const loginContainer = document.getElementById('login-container');
const registrationContainer = document.getElementById('registration-container');
const mainContainer = document.getElementById('main-container');
const loginForm = document.getElementById('login-form');
const registrationForm = document.getElementById('registration-form');
const categoryForm = document.getElementById('category-form');
const transactionForm = document.getElementById('transaction-form');
const categoriesList = document.getElementById('categories-list');
const transactionsList = document.getElementById('transactions-list');
const transactionCategorySelect = document.getElementById('transaction-category');
const expenseChartCanvas = document.getElementById('expense-chart');
const showRegistrationLink = document.getElementById('show-registration');
const showLoginLink = document.getElementById('show-login');

let expenseChart;
let sessionToken = null;

//Clock_Pages
function updateClock() {
  const clockElement = document.getElementById('clock');
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  clockElement.textContent = `${hours}:${minutes}:${seconds}`;
}
// Update the clock every second
setInterval(updateClock, 1000);
// Initialize the clock immediately
updateClock();

// Show Registration Form
showRegistrationLink.addEventListener('click', (e) => {
  e.preventDefault();
  loginContainer.style.display = 'none';
  registrationContainer.style.display = 'block';
});

// Show Login Form
showLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  registrationContainer.style.display = 'none';
  loginContainer.style.display = 'block';
});

// Theme Toggle Logic
  const themeToggleButton = document.getElementById('theme-toggle');
    themeToggleButton.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
    });
// Handle Registration
registrationForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;

  if (password !== confirmPassword) {
    alert('Passwords do not match!');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      alert('Registration successful. Please log in.');
      registrationContainer.style.display = 'none';
      loginContainer.style.display = 'block';
    } else {
      const error = await res.json();
      alert(error.message || 'Registration failed.');
    }
  } catch (err) {
    console.error('Error during registration:', err);
  }
});

// Handle Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      const data = await res.json();
      sessionToken = data.token;
      loginContainer.style.display = 'none';
      mainContainer.style.display = 'flex';
      loadCategories();
      loadTransactions();
      startAutoUpdate();
    } else {
      const error = await res.json();
      alert(error.message || 'Login failed.');
    }
  } catch (err) {
    console.error('Error during login:', err);
  }
});

// Fetch Categories
async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const categories = await res.json();
    categoriesList.innerHTML = '';
    transactionCategorySelect.innerHTML = '<option value="">Select Category</option>';
    categories.forEach((category) => {
      const li = document.createElement('li');
      li.innerHTML = `
        ${category.name}
        <button data-id="${category._id}" class="delete-category">Delete</button>
      `;
      categoriesList.appendChild(li);

      const option = document.createElement('option');
      option.value = category._id;
      option.textContent = category.name;
      transactionCategorySelect.appendChild(option);
    });

    // Attach delete handlers
    document.querySelectorAll('.delete-category').forEach((button) =>
      button.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        await deleteCategory(id);
        loadCategories();
      })
    );
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

// Fetch Transactions
async function loadTransactions() {
  try {
    const res = await fetch(`${API_BASE}/transactions`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const transactions = await res.json();
    transactionsList.innerHTML = '';
    const summary = {};

    transactions.forEach((transaction) => {
      const li = document.createElement('li');
      li.innerHTML = `
        ${transaction.type} - ${transaction.amount} (Category: ${transaction.category})
        <button data-id="${transaction._id}" class="delete-transaction">Delete</button>
      `;
      transactionsList.appendChild(li);

      if (transaction.type === 'expense') {
        if (!summary[transaction.category]) {
          summary[transaction.category] = 0;
        }
        summary[transaction.category] += transaction.amount;
      }
    });

    updateExpenseChart(summary);

    // Attach delete handlers
    document.querySelectorAll('.delete-transaction').forEach((button) =>
      button.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        await deleteTransaction(id);
        loadTransactions();
      })
    );
  } catch (err) {
    console.error('Error loading transactions:', err);
  }
}

// Add Category
categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('category-name').value;

  try {
    await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    categoryForm.reset();
    loadCategories();
  } catch (err) {
    console.error('Error adding category:', err);
  }
});

// Add Transaction
transactionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const category = transactionCategorySelect.value;
  const amount = parseFloat(document.getElementById('transaction-amount').value);
  const type = document.getElementById('transaction-type').value;

  try {
    await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ category, amount, type }),
    });
    transactionForm.reset();
    loadTransactions();
  } catch (err) {
    console.error('Error adding transaction:', err);
  }
});

// Delete Category
async function deleteCategory(id) {
  try {
    await fetch(`${API_BASE}/categories/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
  } catch (err) {
    console.error('Error deleting category:', err);
  }
}

// Delete Transaction
async function deleteTransaction(id) {
  try {
    await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
  } catch (err) {
    console.error('Error deleting transaction:', err);
  }
}

// Update Expense Chart
function updateExpenseChart(data) {
  const labels = Object.keys(data);
  const values = Object.values(data);

  if (expenseChart) {
    expenseChart.destroy();
  }

  expenseChart = new Chart(expenseChartCanvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'Expense Summary by Category' },
      },
    },
  });
}

// Fetch and Display Operations
async function loadOperations() {
  try {
    const res = await fetch(`${API_BASE}/operations`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const operations = await res.json();
    const operationsTable = document.getElementById('operations-table').querySelector('tbody');
    operationsTable.innerHTML = '';

    operations.forEach((operation) => {
      const date = new Date(operation.created_at);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${date.toLocaleDateString()}</td>
        <td>${date.toLocaleTimeString()}</td>
        <td>${operation.category}</td>
        <td>${operation.type}</td>
        <td>${operation.amount}</td>
        <td>
          <button class="edit-operation" data-id="${operation._id}">Edit</button>
          <button class="delete-operation" data-id="${operation._id}">Delete</button>
        </td>
      `;
      operationsTable.appendChild(row);
    });

    // Attach event listeners for edit and delete
    document.querySelectorAll('.edit-operation').forEach((button) =>
      button.addEventListener('click', (e) => editOperation(e.target.dataset.id))
    );
    document.querySelectorAll('.delete-operation').forEach((button) =>
      button.addEventListener('click', (e) => deleteOperation(e.target.dataset.id))
    );
  } catch (err) {
    console.error('Error loading operations:', err);
  }
}

// Edit Operation
async function editOperation(id) {
  const newAmount = prompt('Enter the new amount:');
  if (!newAmount) return;

  try {
    await fetch(`${API_BASE}/operations/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: parseFloat(newAmount) }),
    });
    loadOperations();
  } catch (err) {
    console.error('Error editing operation:', err);
  }
}

// Delete Operation
async function deleteOperation(id) {
  if (!confirm('Are you sure you want to delete this operation?')) return;

  try {
    await fetch(`${API_BASE}/operations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    loadOperations();
  } catch (err) {
    console.error('Error deleting operation:', err);
  }
}

// Generate Report
async function generateReport(startDate, endDate) {
  try {
    const res = await fetch(`${API_BASE}/reports?start_date=${startDate}&end_date=${endDate}`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const report = await res.json();

    // Update report summary
    document.getElementById('total-expenses').textContent = `Total Expenses: ${report.total_expenses}`;
    document.getElementById('total-revenues').textContent = `Total Revenues: ${report.total_revenues}`;
    document.getElementById('balance').textContent = `Balance: ${report.balance}`;

    // Fetch and display report by categories
    const categoriesRes = await fetch(
      `${API_BASE}/reports/categories?start_date=${startDate}&end_date=${endDate}`,
      { headers: { Authorization: `Bearer ${sessionToken}` } }
    );
    const categoriesReport = await categoriesRes.json();

    const categoriesList = document.getElementById('categories-report');
    categoriesList.innerHTML = '';
    for (const [category, data] of Object.entries(categoriesReport)) {
      const li = document.createElement('li');
      li.textContent = `${category}: Expenses - ${data.expenses}, Revenues - ${data.revenues}`;
      categoriesList.appendChild(li);
    }
  } catch (err) {
    console.error('Error generating report:', err);
  }
}

// Handle Report Form Submission
const reportForm = document.getElementById('report-form');
reportForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  if (!startDate || !endDate) {
    alert('Please select a valid date range.');
    return;
  }

  generateReport(startDate, endDate);
});

// Initial load of operations
loadOperations();

// Real-Time Polling
async function pollUpdates() {
  try {
    const res = await fetch(`${API_BASE}/updates`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    if (res.status === 401) {
      handleAuthError();
      return;
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch updates: ${res.statusText}`);
    }

    const data = await res.json();
    console.log('Updates:', data);
    if (data.categoriesUpdated) {
      console.log('Categories updated. Reloading categories...');
      loadCategories();
    }
    if (data.transactionsUpdated) {
      console.log('Transactions updated. Reloading transactions...');
      loadTransactions();
    }
    pollUpdates();
  } catch (err) {
    console.error('Error polling updates:', err);
    setTimeout(pollUpdates, 5000);
  }
}
pollUpdates();