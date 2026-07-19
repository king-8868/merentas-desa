@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Merentas Desa - Restore Backup

REM ============================================================================
REM Merentas Desa - restores a backup made by Update_System.bat (data\, and
REM the program code if that backup includes it).
REM
REM Only ever reads from backup_before_update\ - never deletes any backup.
REM Before restoring, this tool ALSO takes one more "emergency" backup of
REM whatever is currently here, in case the restore itself turns out to be a
REM mistake - so this tool can never make things unrecoverable.
REM ============================================================================

set "LIVE_DIR=%~dp0"
set "BACKUP_ROOT=%LIVE_DIR%backup_before_update"
set "PORT=3000"
set "EXCLUDE_DIRS=data backup logs backup_before_update new_version .git node_modules cloudflared .cloudflared"
set "EXCLUDE_FILES_CF=cloudflared.exe cloudflared.yml config.yml *.pem .env"
set "EXCLUDE_FILES_SELF=Update_System.bat RESTORE_LAST_BACKUP.bat 更新说明.txt"

echo.
echo ============================================================
echo   Merentas Desa - Restore Backup
echo ============================================================
echo.

if not exist "%BACKUP_ROOT%\" (
  echo [ERROR] No backups found - %BACKUP_ROOT% does not exist.
  echo Nothing to restore.
  pause
  exit /b 1
)

REM ---- List recent backups (newest first), let the user pick -------------
REM Folder names are update-YYYYMMDD-HHMMSS (or the older YYYYMMDD_HHMMSS
REM format, or emergency-before-restore-...), so a plain reverse-name sort
REM puts the most recent first regardless of which naming era they're from.
set "COUNT=0"
for /f "delims=" %%d in ('dir "%BACKUP_ROOT%" /b /ad /o-n 2^>nul') do (
  set /a COUNT+=1
  set "BK[!COUNT!]=%%d"
  if !COUNT! GEQ 10 goto :list_done
)
:list_done

if "%COUNT%"=="0" (
  echo [ERROR] No backup folders found inside:
  echo   %BACKUP_ROOT%
  pause
  exit /b 1
)

echo Recent backups ^(newest first^):
for /l %%i in (1,1,%COUNT%) do (
  echo   [%%i] !BK[%%i]!
)
echo.
set "PICK=1"
set /p PICK="Which one to restore? Press Enter for the newest [1]: "
if not defined PICK set "PICK=1"

set "LATEST="
if defined BK[%PICK%] set "LATEST=!BK[%PICK%]!"
if not defined LATEST (
  echo [ERROR] "%PICK%" is not a valid choice. Nothing changed.
  pause
  exit /b 1
)

set "SRC=%BACKUP_ROOT%\%LATEST%"
echo.
echo Selected backup: %LATEST%
echo   %SRC%
echo.
echo This will restore data\ ^(and program code, if this backup has it^)
echo from the folder above, OVERWRITING what is currently here.
echo A safety copy of what's here right now will be taken first, into an
echo "emergency-before-restore-..." folder, so this can be undone too.
echo.
set /p CONFIRM="Continue? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
  echo Cancelled. Nothing changed.
  pause
  exit /b 0
)
echo.

REM ---- Step 1: emergency backup of the CURRENT state before we touch it ---
echo Step 1/5: Backing up current state first ^(in case this restore is a mistake^) ...
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"`) do set "TS=%%i"
if not defined TS (
  echo [ERROR] Could not generate a timestamp ^(PowerShell unavailable?^).
  echo Restore aborted - nothing changed.
  pause
  exit /b 1
)
set "EMERGENCY_DIR=%BACKUP_ROOT%\emergency-before-restore-%TS%"
mkdir "%EMERGENCY_DIR%" 2>nul

if exist "%LIVE_DIR%data\" (
  robocopy "%LIVE_DIR%data" "%EMERGENCY_DIR%\data" /E /R:2 /W:1 >nul
  if !ERRORLEVEL! GEQ 8 (
    echo [ERROR] Could not back up current data\ before restoring. Restore
    echo aborted - nothing changed, so your current data is untouched.
    pause
    exit /b 1
  )
)
robocopy "%LIVE_DIR%." "%EMERGENCY_DIR%\code" /E /R:2 /W:1 /XD %EXCLUDE_DIRS% /XF %EXCLUDE_FILES_CF% >nul
if !ERRORLEVEL! GEQ 8 (
  echo [ERROR] Could not back up current program code before restoring.
  echo Restore aborted - nothing changed.
  pause
  exit /b 1
)
echo   Emergency backup saved to: %EMERGENCY_DIR%
echo.

REM ---- Step 2: stop server --------------------------------------------------
echo Step 2/5: Stopping any server currently running on port %PORT% ...
REM Only kill the PID on this port if it's actually node.exe - see the same
REM comment in Update_System.bat for why.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  tasklist /FI "PID eq %%p" /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
  if not errorlevel 1 (
    taskkill /PID %%p /F >nul 2>&1
  ) else (
    echo   [WARN] Port %PORT% is in use by a non-Node process ^(PID %%p^) -
    echo   not killing it. Please close whatever is using port %PORT%
    echo   manually, then re-run this tool.
  )
)
timeout /t 1 /nobreak >nul
echo.

REM ---- Step 3: restore data + code ------------------------------------------
echo Step 3/5: Restoring data\ ...
if exist "%SRC%\data\" (
  robocopy "%SRC%\data" "%LIVE_DIR%data" /E /R:2 /W:1 >nul
  if !ERRORLEVEL! GEQ 8 (
    echo [ERROR] Failed to restore data\. Your current data is safely kept in:
    echo   %EMERGENCY_DIR%\data
    echo Please check the backup manually at:
    echo   %SRC%\data
    pause
    exit /b 1
  )
  echo   data\ restored.
) else (
  echo   ^(this backup has no data\ folder - skipped^)
)
echo.

echo Step 4/5: Restoring program code ^(if this backup includes it^) ...
if exist "%SRC%\code\" (
  robocopy "%SRC%\code" "%LIVE_DIR%." /E /IS /R:2 /W:1 /XD %EXCLUDE_DIRS% /XF %EXCLUDE_FILES_CF% %EXCLUDE_FILES_SELF% >nul
  if !ERRORLEVEL! GEQ 8 (
    echo [ERROR] Failed to restore program code from the backup. data\ was
    echo already restored above, but the code copy failed - the live folder
    echo may now be a mix of old and older code. Your pre-restore state is
    echo safe in:
    echo   %EMERGENCY_DIR%
    pause
    exit /b 1
  )
  echo   Program code restored.

  echo   Reinstalling dependencies to match the restored package-lock.json ...
  cd /d "%LIVE_DIR%"
  if exist "%LIVE_DIR%node_modules\" rd /s /q "%LIVE_DIR%node_modules" 2>nul
  set "NPM_OK=0"
  if exist "%LIVE_DIR%package-lock.json" (
    call npm ci
    if not errorlevel 1 set "NPM_OK=1"
  )
  if "!NPM_OK!"=="0" (
    call npm install
    if not errorlevel 1 set "NPM_OK=1"
  )
  if "!NPM_OK!"=="0" (
    echo [ERROR] npm install failed after restoring code. The restored code is
    echo on disk, but dependencies are incomplete - the server will likely not
    echo start. Your pre-restore state is safe in:
    echo   %EMERGENCY_DIR%
    pause
    exit /b 1
  )
) else (
  echo   ^(this backup has no code\ folder - skipped, dependencies unchanged^)
)
echo.

REM ---- Step 5: restart and verify --------------------------------------------
echo Step 5/5: Starting server and verifying ...
start "MerentasDesa-Server" /min cmd /k "node server.js"
timeout /t 3 /nobreak >nul

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%PORT%/login.html' -TimeoutSec 5).StatusCode } catch { 0 }"`) do set "HTTP_CODE=%%i"

if "%HTTP_CODE%"=="200" (
  echo.
  echo ============================================================
  echo   RESTORE SUCCESSFUL
  echo ============================================================
  echo Restored from: %SRC%
  echo Pre-restore safety copy saved at: %EMERGENCY_DIR%
  echo Server is running at http://localhost:%PORT%
) else (
  echo.
  echo ============================================================
  echo   RESTORE FINISHED, BUT SERVER DID NOT RESPOND
  echo ============================================================
  echo Restored from: %SRC%
  echo Pre-restore safety copy saved at: %EMERGENCY_DIR%
  echo http://localhost:%PORT%/login.html returned: %HTTP_CODE%
  echo.
  echo Try starting the server manually with: node server.js
  echo and check the console output for the actual error.
)

echo.
pause
endlocal
