@echo off
rem SUNU TAC - restore a dump. Usage: restore.cmd C:\sunu-tac\backups\tac-XXXX.dump  (as administrator)
if "%~1"=="" (echo Usage: restore.cmd path\to\file.dump & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore.ps1" -File "%~1"
pause
