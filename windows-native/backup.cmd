@echo off
rem SUNU TAC - back up the database now (also runs every night at 02:00).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1"
pause
