@echo off
echo Starting Hospital Platform Backend Server...
cd /d "%~dp0"
set VENV_PATH=%CD%\backend\venv
"%VENV_PATH%\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
pause
