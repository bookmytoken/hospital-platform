@echo off
echo Stopping Hospital Platform Backend Server...
taskkill /F /IM python.exe /T 2>nul
echo Server stopped successfully.
pause
