@echo off
echo Starting Hospital Platform Backend Server...
call backend\venv\Scripts\activate.bat
python -m uvicorn backend.main:app --reload
pause
