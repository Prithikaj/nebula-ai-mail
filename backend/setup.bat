@echo off
echo Setting up Nebula AI Mail backend...
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt
echo.
echo Setup complete! 
echo.
echo Next steps:
echo 1. Copy .env.example to .env
echo 2. Fill in your credentials in .env
echo 3. Run: uvicorn main:app --reload
