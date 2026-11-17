@echo off
rem Starts HoloNet Trader from the project folder (development build).
rem This is for developers. Players should use the installer instead (HoloNet Trader Setup.exe).
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org ^(the LTS version^), then run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run: installing dependencies, this can take a few minutes...
  call npm install || (echo Install failed. & pause & exit /b 1)
)

if not exist "out\main\index.js" (
  echo First run: building HoloNet Trader...
  call npm run build || (echo Build failed. & pause & exit /b 1)
)

start "" /min cmd /c "npm start"
