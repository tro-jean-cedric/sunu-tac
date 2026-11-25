@echo off
rem Dump the database to backups\tac-YYYYMMDD-HHMM.dump (same format as ./tac.sh backup).
rem Schedule it daily in Task Scheduler, and copy backups\ off this PC.
cd /d "%~dp0"
if not exist backups mkdir backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set STAMP=%%i
rem dump inside the container, then copy the file out (no binary data through the Windows console)
docker compose exec -T db pg_dump -U tac -d tac -Fc -f /tmp/backup.dump || (echo Backup FAILED & exit /b 1)
docker compose cp db:/tmp/backup.dump "backups\tac-%STAMP%.dump" || (echo Backup FAILED & exit /b 1)
docker compose exec -T db rm -f /tmp/backup.dump
rem keep 30 days
powershell -NoProfile -Command "Get-ChildItem backups\*.dump | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item"
echo Backup written: backups\tac-%STAMP%.dump
