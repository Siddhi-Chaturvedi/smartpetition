@echo off
setlocal EnableDelayedExpansion
title SmartPetition Test Runner
rem ============================================================================
rem  SmartPetition - run the full automated test suite
rem  Backend: pytest (isolated SQLite test DB) | Frontend: vitest + RTL
rem ============================================================================

cd /d "%~dp0"
set "ROOT=%~dp0"
set "VENV=%ROOT%.venv"
set "BACKEND_RESULT=SKIPPED"
set "FRONTEND_RESULT=SKIPPED"

echo.
echo  ============================================================
echo    SmartPetition test suite
echo  ============================================================
echo.

rem ------------------------------------------------------------------ backend
if not exist "%VENV%\Scripts\python.exe" (
    echo  [WARN] No virtual environment found. Run start_smartpetition.bat once first.
) else (
    if not exist "%ROOT%backend\app\ai\model\classifier.joblib" (
        echo  [..] Training AI model for tests ...
        pushd "%ROOT%backend"
        "%VENV%\Scripts\python.exe" -m app.ai.data.generate_dataset >nul
        "%VENV%\Scripts\python.exe" -m app.ai.train_model >nul
        popd
    )
    echo  [..] Running backend tests ^(pytest^)...
    echo  ------------------------------------------------------------
    pushd "%ROOT%backend"
    "%VENV%\Scripts\python.exe" -m pytest
    if errorlevel 1 (set "BACKEND_RESULT=FAILED") else (set "BACKEND_RESULT=PASSED")
    popd
    echo  ------------------------------------------------------------
)

rem ----------------------------------------------------------------- frontend
where node >nul 2>nul
if errorlevel 1 (
    echo  [WARN] Node.js not found - skipping frontend tests.
    echo         Install: winget install OpenJS.NodeJS.LTS
) else (
    if not exist "%ROOT%frontend\node_modules" (
        echo  [..] Installing frontend dependencies ...
        pushd "%ROOT%frontend"
        call npm install --no-audit --no-fund
        popd
    )
    echo.
    echo  [..] Running frontend tests ^(vitest + React Testing Library^)...
    echo  ------------------------------------------------------------
    pushd "%ROOT%frontend"
    call npm test
    if errorlevel 1 (set "FRONTEND_RESULT=FAILED") else (set "FRONTEND_RESULT=PASSED")
    popd
    echo  ------------------------------------------------------------
)

echo.
echo  ============================================================
echo    RESULTS   Backend: !BACKEND_RESULT!    Frontend: !FRONTEND_RESULT!
echo  ============================================================
echo.
if "!BACKEND_RESULT!"=="FAILED" exit /b 1
if "!FRONTEND_RESULT!"=="FAILED" exit /b 1
pause
endlocal
exit /b 0
