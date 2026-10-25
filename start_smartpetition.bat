@echo off
setlocal EnableDelayedExpansion
title SmartPetition Launcher
rem ============================================================================
rem  SmartPetition - one-click local startup for Windows 10/11
rem  * checks Python / Node, creates venv, installs deps, trains AI model,
rem    starts backend + frontend, waits for health, then opens the browser.
rem  * NEVER closes silently: on any failure the window stays open with the
rem    error and a fix hint.
rem ============================================================================

cd /d "%~dp0"
set "ROOT=%~dp0"
set "VENV=%ROOT%.venv"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"

echo.
echo  ============================================================
echo    SmartPetition - Automated Grievance Management System
echo  ============================================================
echo   Project root : %ROOT%
echo.

rem ---------------------------------------------------------------- Python check
set "PY_CMD="
where py >nul 2>nul && (
    py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>nul && set "PY_CMD=py -3"
)
if not defined PY_CMD (
    where python >nul 2>nul && (
        python -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>nul && set "PY_CMD=python"
    )
)
if not defined PY_CMD (
    echo  [ERROR] Python 3.11+ was not found.
    echo.
    echo  Install it with ONE of these, then run this script again:
    echo     winget install Python.Python.3.12
    echo     or download from https://www.python.org/downloads/windows/
    echo  IMPORTANT: tick "Add python.exe to PATH" during installation.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('%PY_CMD% --version 2^>^&1') do echo  [OK] Found %%v
echo.

rem ------------------------------------------------------- port conflict check
netstat -ano | findstr /r /c:":%BACKEND_PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo  [ERROR] Port %BACKEND_PORT% is already in use - SmartPetition backend
    echo          may already be running, or another app holds the port.
    echo          Run stop_smartpetition.bat first, or free the port:
    echo             netstat -ano ^| findstr :%BACKEND_PORT%
    echo             taskkill /PID ^<pid^> /F
    echo.
    pause
    exit /b 1
)

rem ------------------------------------------------------------------- venv
if not exist "%VENV%\Scripts\python.exe" (
    echo  [..] Creating virtual environment .venv ...
    %PY_CMD% -m venv "%VENV%"
    if errorlevel 1 (
        echo  [ERROR] Could not create the virtual environment.
        echo          Try: %PY_CMD% -m pip install --upgrade pip   then re-run.
        pause
        exit /b 1
    )
) else (
    echo  [OK] Virtual environment found
)

rem ------------------------------------------------------- python dependencies
echo  [..] Installing backend dependencies ^(first run takes a few minutes^)...
"%VENV%\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r "%ROOT%backend\requirements.txt"
if errorlevel 1 (
    echo  [ERROR] Backend dependency installation failed. Check your network
    echo          connection and the pip output above, then run this script again.
    pause
    exit /b 1
)
echo  [OK] Backend dependencies installed

rem --------------------------------------------------------------- AI model
if not exist "%ROOT%backend\app\ai\model\classifier.joblib" (
    echo  [..] Training the AI classification model ^(synthetic demo dataset^)...
    pushd "%ROOT%backend"
    "%VENV%\Scripts\python.exe" -m app.ai.data.generate_dataset
    "%VENV%\Scripts\python.exe" -m app.ai.train_model
    popd
    if not exist "%ROOT%backend\app\ai\model\classifier.joblib" (
        echo  [WARN] Model training failed - the app will start with the labeled
        echo         rule-based fallback classifier. You can retrain later with:
        echo            cd backend ^&^& ..\.venv\Scripts\python -m app.ai.train_model
    ) else (
        echo  [OK] AI model trained
    )
) else (
    echo  [OK] AI model found
)
echo.

rem ------------------------------------------------------------------ Node.js
set "NODE_OK=0"
where node >nul 2>nul && set "NODE_OK=1"
if "%NODE_OK%"=="0" (
    echo  [WARN] Node.js was NOT found - the React frontend cannot start.
    echo         Install Node.js LTS and re-run this script:
    echo            winget install OpenJS.NodeJS.LTS
    echo            or https://nodejs.org/en/download
    echo         The backend will still start; API docs: http://localhost:%BACKEND_PORT%/docs
    echo.
)

rem ------------------------------------------------- frontend dependencies
if "%NODE_OK%"=="1" (
    if not exist "%ROOT%frontend\node_modules" (
        echo  [..] Installing frontend dependencies ^(first run takes a few minutes^)...
        pushd "%ROOT%frontend"
        call npm install --no-audit --no-fund
        popd
        if errorlevel 1 (
            echo  [ERROR] npm install failed. Check the output above and your network.
            pause
            exit /b 1
        )
    )
    echo  [OK] Frontend dependencies ready
)
echo.

rem ------------------------------------------------------------ start backend
echo  [..] Starting backend on http://localhost:%BACKEND_PORT% ...
start "SmartPetitionBackend" cmd /k "cd /d %ROOT%backend && %VENV%\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %BACKEND_PORT%"

echo  [..] Waiting for backend health check ...
set "BACKEND_UP=0"
for /l %%i in (1,1,40) do (
    if "!BACKEND_UP!"=="0" (
        powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%BACKEND_PORT%/api/v1/health; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
        if not errorlevel 1 set "BACKEND_UP=1"
        if "!BACKEND_UP!"=="0" timeout /t 2 /nobreak >nul
    )
)
if "%BACKEND_UP%"=="0" (
    echo  [ERROR] Backend did not become healthy within ~80 seconds.
    echo          Look at the "SmartPetitionBackend" window for the traceback,
    echo          and see docs\TROUBLESHOOTING.md for common fixes.
    echo.
    pause
    exit /b 1
)
echo  [OK] Backend is healthy: http://localhost:%BACKEND_PORT%/api/v1/health
echo       Interactive API docs:  http://localhost:%BACKEND_PORT%/docs

rem ----------------------------------------------------------- start frontend
if "%NODE_OK%"=="1" (
    echo  [..] Starting frontend on http://localhost:%FRONTEND_PORT% ...
    start "SmartPetitionFrontend" cmd /k "cd /d %ROOT%frontend && npm run dev"

    echo  [..] Waiting for frontend ...
    set "FRONTEND_UP=0"
    for /l %%i in (1,45) do (
        if "!FRONTEND_UP!"=="0" (
            powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%FRONTEND_PORT%/; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
            if not errorlevel 1 set "FRONTEND_UP=1"
            if "!FRONTEND_UP!"=="0" timeout /t 2 /nobreak >nul
        )
    )
    if "!FRONTEND_UP!"=="1" (
        echo  [OK] Frontend is ready.
        echo.
        echo  ============================================================
        echo    SmartPetition is RUNNING
        echo      App:        http://localhost:%FRONTEND_PORT%
        echo      API docs:   http://localhost:%BACKEND_PORT%/docs
        echo    Opening your browser now...
        echo    To stop everything: run stop_smartpetition.bat
        echo  ============================================================
        start "" http://localhost:%FRONTEND_PORT%
    ) else (
        echo  [ERROR] Frontend did not answer on port %FRONTEND_PORT%.
        echo          Check the "SmartPetitionFrontend" window for errors.
        echo          The backend IS running: http://localhost:%BACKEND_PORT%/docs
        echo          NOTE: the frontend is NOT running - do not assume it is.
    )
) else (
    echo  [WARN] Skipping frontend ^(Node.js missing - see instructions above^).
    echo         Backend API docs: http://localhost:%BACKEND_PORT%/docs
)

echo.
echo  This launcher window can stay open or be closed; the server windows
echo  "SmartPetitionBackend" and "SmartPetitionFrontend" keep the app alive.
echo.
pause
endlocal
