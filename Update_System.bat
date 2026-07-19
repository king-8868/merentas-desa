@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Merentas Desa - Update_System

REM ============================================================================
REM Merentas Desa - Windows one-click updater (v1.9.1 revision)
REM ============================================================================
REM What this does, in order:
REM   0. Checks Node/npm are installed, and that new_version\ looks complete
REM      (package.json, server.js, templates\borang-pengakuan.pdf all present)
REM   1. Backs up data\ AND the current program code into
REM      backup_before_update\update-YYYYMMDD-HHMMSS\ - BEFORE touching
REM      anything else. If this backup fails, nothing else happens.
REM   2. Copies new_version\ into a private staging folder first (proves the
REM      whole new-version tree can be read/copied cleanly), THEN copies that
REM      staging folder onto this live folder - adds/overwrites program files
REM      only, never deletes existing files it doesn't know about.
REM   3. Never touches data\, backup\, logs\, backup_before_update\, .env, any
REM      Cloudflare config, or this tool's own 3 files (see EXCLUDE_* below).
REM   4. Wipes node_modules and runs `npm ci` (falls back to `npm install` if
REM      npm ci isn't possible) so dependencies always exactly match the new
REM      package-lock.json - never a stale mix of old + new packages.
REM   5. Stops any server already running on PORT, then starts a fresh one.
REM   6. Verifies: server responds, templates\borang-pengakuan.pdf exists,
REM      data\ is still readable, pdf-lib actually got installed.
REM
REM If a critical step fails, this tool NEVER claims success. Depending on
REM how far it got, it either auto-rolls-back the code copy (cheap, safe,
REM done automatically) or tells you to run RESTORE_LAST_BACKUP.bat (once
REM npm/the server have been touched, auto-chaining another install here
REM would be riskier than the one proven, explicit restore tool). Nothing is
REM ever silently deleted. See "更新说明.txt" for plain-language recovery
REM steps.
REM ============================================================================

REM ---- Configuration ----------------------------------------------------
set "LIVE_DIR=%~dp0"
set "NEW_VERSION_DIR=%LIVE_DIR%new_version"
set "BACKUP_ROOT=%LIVE_DIR%backup_before_update"
set "PORT=3000"

REM Folders that must NEVER be overwritten, deleted, or read as "new code" by
REM this tool - applies to both the backup step and the update step.
set "EXCLUDE_DIRS=data backup logs backup_before_update new_version .git node_modules cloudflared .cloudflared"

REM Cloudflare/local-secret files - never touched by either robocopy step.
REM If your Cloudflare setup uses a different file name than the defaults
REM below, add it here (space-separated), then save this file and re-run it.
set "EXCLUDE_FILES_CF=cloudflared.exe cloudflared.yml config.yml *.pem .env"

REM This tool's own 3 files - excluded ONLY from the "copy new_version onto
REM live" step (step 3 below), so a future new_version that happens to also
REM contain copies of these can never overwrite the ones actually running.
REM They ARE included in the code backup (step 1) on purpose - that gives you
REM a dated history of this tool itself, which is harmless.
set "EXCLUDE_FILES_SELF=Update_System.bat RESTORE_LAST_BACKUP.bat 更新说明.txt"
REM ------------------------------------------------------------------------

echo.
echo ============================================================
echo   MERENTAS DESA SYSTEM UPDATE
echo ============================================================
echo Live folder: %LIVE_DIR%
echo.

REM ---- Step 0a: Node / npm present? ---------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed, or not on PATH.
  echo Please install Node.js 18 or newer from https://nodejs.org first,
  echo then run this tool again. Nothing was changed.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not installed, or not on PATH ^(usually installed
  echo together with Node.js - try reinstalling Node.js^). Nothing was changed.
  pause
  exit /b 1
)

REM ---- Step 0b: does new_version look like a real, complete package? -----
echo [1/6] Checking update package...
if not exist "%NEW_VERSION_DIR%\" (
  echo [ERROR] Could not find the folder: %NEW_VERSION_DIR%
  echo.
  echo Please create a folder named exactly "new_version" next to this tool,
  echo and copy the new version's files into it ^(public, routes, lib,
  echo templates, server.js, package.json, package-lock.json^).
  echo See "更新说明.txt" for details. Nothing was changed.
  pause
  exit /b 1
)
if not exist "%NEW_VERSION_DIR%\package.json" (
  echo [ERROR] %NEW_VERSION_DIR%\package.json not found - the update package
  echo looks incomplete. Nothing was changed.
  pause
  exit /b 1
)
if not exist "%NEW_VERSION_DIR%\server.js" (
  echo [ERROR] %NEW_VERSION_DIR%\server.js not found - the update package
  echo looks incomplete. Nothing was changed.
  pause
  exit /b 1
)
if not exist "%NEW_VERSION_DIR%\templates\borang-pengakuan.pdf" (
  echo [ERROR] %NEW_VERSION_DIR%\templates\borang-pengakuan.pdf not found.
  echo The Document Generator ^(Borang Kebenaran^) would fail without it.
  echo The update package looks incomplete. Nothing was changed.
  pause
  exit /b 1
)

REM Read old/new version numbers via PowerShell, passed through environment
REM variables (not string-interpolated into the -Command text) so this works
REM correctly even when LIVE_DIR contains spaces.
set "MD_NEW_PKG=%NEW_VERSION_DIR%\package.json"
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "try { (Get-Content -Raw $env:MD_NEW_PKG | ConvertFrom-Json).version } catch { 'unknown' }"`) do set "NEW_VERSION=%%v"
if not defined NEW_VERSION set "NEW_VERSION=unknown"

set "CURRENT_VERSION=(not installed yet)"
if exist "%LIVE_DIR%package.json" (
  set "MD_CUR_PKG=%LIVE_DIR%package.json"
  for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "try { (Get-Content -Raw $env:MD_CUR_PKG | ConvertFrom-Json).version } catch { 'unknown' }"`) do set "CURRENT_VERSION=%%v"
)

echo   Update package looks complete.
echo.
echo ============================================================
echo Current Version : %CURRENT_VERSION%
echo New Version     : %NEW_VERSION%
echo ============================================================
echo.

REM ---- Step 1: backup ------------------------------------------------------
echo [2/6] Creating backup...
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"`) do set "TS=%%i"
if not defined TS (
  echo [ERROR] Could not generate a timestamp ^(PowerShell unavailable?^).
  echo Nothing was changed.
  pause
  exit /b 1
)
set "BACKUP_DIR=%BACKUP_ROOT%\update-%TS%"

mkdir "%BACKUP_DIR%" 2>nul
if not exist "%BACKUP_DIR%\" (
  echo [ERROR] Could not create backup folder: %BACKUP_DIR%
  echo Update aborted - nothing changed.
  pause
  exit /b 1
)

if exist "%LIVE_DIR%data\" (
  robocopy "%LIVE_DIR%data" "%BACKUP_DIR%\data" /E /R:2 /W:1 >nul
  if !ERRORLEVEL! GEQ 8 (
    echo [ERROR] Failed to back up data\. Update aborted - nothing changed.
    pause
    exit /b 1
  )
) else (
  echo   ^(no data\ folder found yet - nothing to back up^)
)

robocopy "%LIVE_DIR%." "%BACKUP_DIR%\code" /E /R:2 /W:1 /XD %EXCLUDE_DIRS% /XF %EXCLUDE_FILES_CF% >nul
if !ERRORLEVEL! GEQ 8 (
  echo [ERROR] Failed to back up current program code. Update aborted - nothing changed.
  echo Your data\ backup ^(if any^) is still safe in:
  echo   %BACKUP_DIR%
  pause
  exit /b 1
)
echo   Backup saved to: %BACKUP_DIR%
echo.

REM ---- Step 2: stage new_version, then copy staging onto live -------------
echo [3/6] Updating application files...
set "STAGING_DIR=%TEMP%\md_staging_%TS%"
robocopy "%NEW_VERSION_DIR%" "%STAGING_DIR%" /E /R:2 /W:1 >nul
if !ERRORLEVEL! GEQ 8 (
  echo [ERROR] Could not stage the new version ^(copy from new_version\ to a
  echo temporary folder failed^). This usually means a file in new_version\ is
  echo unreadable or locked. Nothing in your live folder was touched.
  echo Your backup is still safe in:
  echo   %BACKUP_DIR%
  rd /s /q "%STAGING_DIR%" 2>nul
  pause
  exit /b 1
)
if not exist "%STAGING_DIR%\server.js" (
  echo [ERROR] Staged copy is missing server.js - something went wrong while
  echo copying new_version\. Nothing in your live folder was touched.
  rd /s /q "%STAGING_DIR%" 2>nul
  pause
  exit /b 1
)

REM /IS (Include Same) forces robocopy to re-copy a file even if it looks
REM unchanged by timestamp+size - without it, a new_version file that
REM coincidentally shares the live file's size and modified time would be
REM silently skipped instead of applied. Cheap insurance, no downside.
robocopy "%STAGING_DIR%" "%LIVE_DIR%." /E /IS /R:2 /W:1 /XD %EXCLUDE_DIRS% /XF %EXCLUDE_FILES_CF% %EXCLUDE_FILES_SELF% >nul
set "COPY_RC=!ERRORLEVEL!"
rd /s /q "%STAGING_DIR%" 2>nul

if !COPY_RC! GEQ 8 (
  echo [ERROR] Copying new version files failed ^(robocopy code !COPY_RC!^) -
  echo your live folder may now be a mix of old and new files.
  echo Attempting automatic rollback of program code from backup...
  robocopy "%BACKUP_DIR%\code" "%LIVE_DIR%." /E /R:2 /W:1 /XD %EXCLUDE_DIRS% /XF %EXCLUDE_FILES_CF% %EXCLUDE_FILES_SELF% >nul
  if !ERRORLEVEL! GEQ 8 (
    echo [ERROR] Automatic rollback ALSO failed. Please double-click
    echo RESTORE_LAST_BACKUP.bat now, or restore manually from:
    echo   %BACKUP_DIR%
  ) else (
    echo   Automatic rollback succeeded - your live folder is back to the
    echo   previous version. The system was NOT updated. Please check
    echo   new_version\ and try again.
  )
  pause
  exit /b 1
)

REM Post-copy sanity check: the version now on disk must actually be the new
REM one, and the PDF template must be present - catches a partially-applied
REM copy that robocopy itself didn't flag as an error.
set "MD_LIVE_PKG=%LIVE_DIR%package.json"
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "try { (Get-Content -Raw $env:MD_LIVE_PKG | ConvertFrom-Json).version } catch { 'unknown' }"`) do set "APPLIED_VERSION=%%v"
if not "!APPLIED_VERSION!"=="%NEW_VERSION%" (
  echo [ERROR] After copying, package.json shows version "!APPLIED_VERSION!"
  echo but expected "%NEW_VERSION%" - the update did not apply cleanly.
  echo Please double-click RESTORE_LAST_BACKUP.bat, or restore manually from:
  echo   %BACKUP_DIR%
  pause
  exit /b 1
)
if not exist "%LIVE_DIR%templates\borang-pengakuan.pdf" (
  echo [ERROR] templates\borang-pengakuan.pdf is missing after the update.
  echo Please double-click RESTORE_LAST_BACKUP.bat, or restore manually from:
  echo   %BACKUP_DIR%
  pause
  exit /b 1
)
echo   Done. Now running version %NEW_VERSION%.
echo.

REM ---- Step 3: dependencies -------------------------------------------------
echo [4/6] Installing dependencies...
cd /d "%LIVE_DIR%"

if exist "%LIVE_DIR%node_modules\" (
  echo   Removing old node_modules ^(so it can't mix old/new packages^)...
  rd /s /q "%LIVE_DIR%node_modules" 2>nul
)

set "NPM_OK=0"
if exist "%LIVE_DIR%package-lock.json" (
  echo   Running npm ci ^(exact install from package-lock.json^)...
  call npm ci
  if not errorlevel 1 set "NPM_OK=1"
)
if "!NPM_OK!"=="0" (
  echo   Running npm install ...
  call npm install
  if not errorlevel 1 set "NPM_OK=1"
)
if "!NPM_OK!"=="0" (
  echo [ERROR] npm install failed. Program files were updated, but
  echo dependencies are incomplete - the server will likely not start.
  echo Please double-click RESTORE_LAST_BACKUP.bat, or restore manually from:
  echo   %BACKUP_DIR%
  pause
  exit /b 1
)

if not exist "%LIVE_DIR%node_modules\pdf-lib\" (
  echo [ERROR] pdf-lib did not get installed ^(node_modules\pdf-lib not found^)
  echo - the Document Generator ^(Borang Kebenaran^) will not work. This is
  echo usually a network/npm registry problem. Please check your internet
  echo connection and try again, or double-click RESTORE_LAST_BACKUP.bat to
  echo go back to the previous working version.
  pause
  exit /b 1
)
echo   Dependencies installed ^(pdf-lib confirmed^).
echo.

REM ---- Step 4: stop any server already running on PORT ---------------------
echo [5/6] Starting server...
REM Only kill the PID on this port if it's actually node.exe - this can
REM still kill an unrelated OTHER Node project that happens to be using the
REM same port, but it will never kill a non-Node program. If something else
REM (not node.exe) holds the port, this leaves it alone and warns instead.
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

start "MerentasDesa-Server" /min cmd /k "node server.js"
echo   Server starting in a new minimized window - do not close that window.
timeout /t 3 /nobreak >nul
echo.

REM ---- Step 5: verify everything actually works -----------------------------
echo [6/6] Verifying system...

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%PORT%/login.html' -TimeoutSec 5).StatusCode } catch { 0 }"`) do set "HTTP_CODE=%%i"

set "VERIFY_FAILED=0"
if not "%HTTP_CODE%"=="200" (
  echo   [ERROR] Server did not respond correctly at http://localhost:%PORT%/login.html ^(got: %HTTP_CODE%^)
  set "VERIFY_FAILED=1"
)
if not exist "%LIVE_DIR%templates\borang-pengakuan.pdf" (
  echo   [ERROR] templates\borang-pengakuan.pdf missing.
  set "VERIFY_FAILED=1"
)
if exist "%LIVE_DIR%data\" (
  if not exist "%LIVE_DIR%data\schools.json" (
    echo   [ERROR] data\schools.json not found - data\ may not be readable.
    set "VERIFY_FAILED=1"
  )
)

if "!VERIFY_FAILED!"=="1" (
  echo.
  echo [ERROR] Update verification failed - see above.
  echo Stopping the server that was just started ^(it may be in a broken state^)...
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    tasklist /FI "PID eq %%p" /FI "IMAGENAME eq node.exe" 2>nul | findstr /I "node.exe" >nul
    if not errorlevel 1 taskkill /PID %%p /F >nul 2>&1
  )
  echo.
  echo Nothing was deleted. Your previous data and code are safe in:
  echo   %BACKUP_DIR%
  echo Please double-click RESTORE_LAST_BACKUP.bat to go back to the
  echo previous working version. See "更新说明.txt" for full steps.
  (
    echo Merentas Desa update failed - %TS%
    echo Current Version was: %CURRENT_VERSION%
    echo Attempted New Version: %NEW_VERSION%
    echo HTTP check result: %HTTP_CODE%
  ) > "%BACKUP_DIR%\update-error.log"
  echo A short error log was saved to: %BACKUP_DIR%\update-error.log
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   UPDATE SUCCESSFUL
echo ============================================================
echo Current Version : %NEW_VERSION%
echo Backup          : %BACKUP_DIR%
echo.
echo Open: http://localhost:%PORT%
echo.
echo Do not close the small "MerentasDesa-Server" window - closing it stops
echo the system.
echo.
pause
endlocal
