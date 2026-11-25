@echo off
rem Replace the database with a dump:  restore.bat backups\tac-20261125-0200.dump
rem Also restores a dump made on the Mac with ./tac.sh backup.
cd /d "%~dp0"
if "%~1"=="" (echo Usage: restore.bat path\to\file.dump & exit /b 1)
if not exist "%~1" (echo File not found: %~1 & exit /b 1)
echo This REPLACES all data in the SUNU TAC database with %~1
set /p OK=Type YES to continue:
if /i not "%OK%"=="YES" (echo Cancelled. & exit /b 1)
docker compose cp "%~1" db:/tmp/restore.dump || (echo Restore FAILED & exit /b 1)
docker compose exec -T db pg_restore -U tac -d tac --clean --if-exists --no-owner /tmp/restore.dump
docker compose exec -T db rm -f /tmp/restore.dump
docker compose restart api
echo Restored from %~1
