from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from bson.objectid import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import os
import time

app = Flask(__name__)
CORS(app)

# Configuration
app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017/personal_finance_manager")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "your_secret_key")
mongo = PyMongo(app)

# Collections
categories = mongo.db.categories
transactions = mongo.db.transactions
users = mongo.db.users

# Helper Function: Serialize MongoDB ObjectId
def serialize_document(doc):
    """Convert ObjectId fields to strings for JSON serialization."""
    doc["_id"] = str(doc["_id"])
    if "user_id" in doc and isinstance(doc["user_id"], ObjectId):
        doc["user_id"] = str(doc["user_id"])
    if "category" in doc and isinstance(doc["category"], ObjectId):
        doc["category"] = str(doc["category"])
    return doc

# User Registration
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    if not data.get("username") or not data.get("password"):
        return jsonify({"error": "Username and password are required"}), 400

    if users.find_one({"username": data["username"]}):
        return jsonify({"error": "Username already exists"}), 400

    hashed_password = generate_password_hash(data["password"], method="pbkdf2:sha256")
    new_user = {
        "username": data["username"],
        "password": hashed_password,
        "created_at": datetime.datetime.utcnow(),
    }
    result = users.insert_one(new_user)
    return jsonify({"message": "User registered successfully", "_id": str(result.inserted_id)}), 201

# User Login
@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    if not data.get("username") or not data.get("password"):
        return jsonify({"error": "Username and password are required"}), 400

    user = users.find_one({"username": data["username"]})
    if not user or not check_password_hash(user["password"], data["password"]):
        return jsonify({"error": "Invalid username or password"}), 401

    token = jwt.encode(
        {"user_id": str(user["_id"]), "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)},
        app.config["SECRET_KEY"],
        algorithm="HS256",
    )
    return jsonify({"token": token}), 200

# Authorization Middleware
def token_required(f):
    def wrapper(*args, **kwargs):
        token = request.headers.get("Authorization")
        if not token:
            return jsonify({"error": "Token is missing"}), 401

        try:
            data = jwt.decode(token.replace("Bearer ", ""), app.config["SECRET_KEY"], algorithms=["HS256"])
            current_user = users.find_one({"_id": ObjectId(data["user_id"])})
            if not current_user:
                raise ValueError("User not found")
        except Exception as e:
            return jsonify({"error": "Token is invalid"}), 401

        return f(current_user, *args, **kwargs)

    wrapper.__name__ = f.__name__
    return wrapper

# Get Categories
@app.route("/api/categories", methods=["GET"])
@token_required
def get_categories(current_user):
    all_categories = list(categories.find({"user_id": current_user["_id"]}))
    serialized_categories = [serialize_document(cat) for cat in all_categories]
    return jsonify(serialized_categories)

# Add Category
@app.route("/api/categories", methods=["POST"])
@token_required
def add_category(current_user):
    data = request.json
    if not data.get("name"):
        return jsonify({"error": "Category name is required"}), 400

    if categories.find_one({"name": data["name"], "user_id": current_user["_id"]}):
        return jsonify({"error": "Category with this name already exists"}), 400
    new_category = {"name": data["name"], "user_id": current_user["_id"], "created_at": datetime.datetime.utcnow()}
    result = categories.insert_one(new_category)
    return jsonify({"_id": str(result.inserted_id), "name": data["name"]})

# Delete Category
@app.route("/api/categories/<id>", methods=["DELETE"])
@token_required
def delete_category(current_user, id):
    result = categories.delete_one({"_id": ObjectId(id), "user_id": current_user["_id"]})
    return jsonify({"message": "Category deleted"}) if result.deleted_count else jsonify({"message": "Category not found"}), 404

# Get Transactions
@app.route("/api/transactions", methods=["GET"])
@token_required
def get_transactions(current_user):
    all_transactions = list(transactions.find({"user_id": current_user["_id"]}))
    serialized_transactions = []
    for tran in all_transactions:
        tran = serialize_document(tran)
        category = categories.find_one({"_id": ObjectId(tran["category"]), "user_id": current_user["_id"]})
        tran["category"] = category["name"] if category else "Unknown"
        serialized_transactions.append(tran)
    return jsonify(serialized_transactions)

# Add Transaction
@app.route("/api/transactions", methods=["POST"])
@token_required
def add_transaction(current_user):
    data = request.json
    if not data.get("category") or not data.get("amount") or not data.get("type"):
        return jsonify({"error": "Category, amount, and type are required"}), 400

    category = categories.find_one({"_id": ObjectId(data["category"]), "user_id": current_user["_id"]})
    if not category:
        return jsonify({"error": "Category not found"}), 404
    new_transaction = {
        "category": ObjectId(data["category"]),
        "amount": data["amount"],
        "type": data["type"],
        "date": data.get("date", None),
        "user_id": current_user["_id"],
        "created_at": datetime.datetime.utcnow(),
    }
    result = transactions.insert_one(new_transaction)
    new_transaction["_id"] = str(result.inserted_id)
    return jsonify(new_transaction)

# Delete Transaction
@app.route("/api/transactions/<id>", methods=["DELETE"])
@token_required
def delete_transaction(current_user, id):
    result = transactions.delete_one({"_id": ObjectId(id), "user_id": current_user["_id"]})
    return jsonify({"message": "Transaction deleted"}) if result.deleted_count else jsonify({"message": "Transaction not found"}), 404

# Long Polling for Updates
@app.route("/api/updates", methods=["GET"])
@token_required
def get_updates(current_user):
    timeout = 30  # Maximum wait time in seconds
    poll_interval = 1  # Check every second for updates
    last_check = datetime.datetime.utcnow()
    while (datetime.datetime.utcnow() - last_check).seconds < timeout:
        recent_categories = list(categories.find({"user_id": current_user["_id"], "created_at": {"$gte": last_check}}))
        recent_transactions = list(transactions.find({"user_id": current_user["_id"], "created_at": {"$gte": last_check}}))
        if recent_categories or recent_transactions:
            return jsonify({
                "categoriesUpdated": [serialize_document(cat) for cat in recent_categories],
                "transactionsUpdated": [serialize_document(tran) for tran in recent_transactions]
            })
        time.sleep(poll_interval)
    return jsonify({"categoriesUpdated": [], "transactionsUpdated": []})

if __name__ == "__main__":
    app.run(debug=True, port=5000)