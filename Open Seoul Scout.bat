@echo off
rem Double-click to open Seoul Scout in your browser. It needs Python: https://www.python.org/downloads/
rem Keep the black window open while you use the map; closing it stops the map.
cd /d "%~dp0"

py --version >nul 2>nul
if not errorlevel 1 (
    py serve.py %*
    goto end
)
python --version >nul 2>nul
if not errorlevel 1 (
    python serve.py %*
    goto end
)
echo Python is not installed on this computer.
echo Install it from https://www.python.org/downloads/ and double-click this file again.

:end
pause
