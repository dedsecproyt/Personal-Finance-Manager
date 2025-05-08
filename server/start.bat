@echo off
REM Check if Python is installed
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed. Please install Python and try again.
    pause
    exit /b
)

REM Check if pip is installed
python -m pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo pip is not installed. Attempting to install pip...
    python -m ensurepip --upgrade
    if %errorlevel% neq 0 (
        echo Failed to install pip. Please install pip and try again.
        pause
        exit /b
    )
)

REM Check if requirements.txt exists
if not exist requirements.txt (
    echo requirements.txt not found. Please ensure it is in the same directory as this script.
    pause
    exit /b
)

REM Check and install dependencies only if not already installed
echo Checking and installing dependencies...
pip install --disable-pip-version-check --no-cache-dir --requirement requirements.txt --exists-action i

REM Run the application
echo Starting the application...
python app.py
pause