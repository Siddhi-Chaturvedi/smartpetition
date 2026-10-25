@echo off
setlocal EnableDelayedExpansion
title SmartPetition Stop
rem ============================================================================
rem  SmartPetition - stop backend and frontend servers
rem ============================================================================

echo.
echo  Stopping SmartPetition ...
echo.

rem --- close the server console windows by title -----------------------------
taskkill /FI "WINDOWTITLE eq SmartPetitionBackend*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq SmartPetitionFrontend*" /T /F >nul 2>nul

rem --- kill anything still listening on the app ports ------------------------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":8000 .*LISTENING"') do (
    echo  Killing PID %%p ^(port 8000^)
    taskkill /PID %%p /T /F >nul 2>nul
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":5173 .*LISTENING"') do (
    echo  Killing PID %%p ^(port 5173^)
    taskkill /PID %%p /T /F >nul 2>nul
)

echo.
echo  [OK] SmartPetition stopped. Your database file (backend\smartpetition.db)
echo       and uploads (backend\storage\uploads) are preserved.
echo.
pause
endlocal
