@echo off
rem Pull the latest images and (re)start SUNU TAC. Also used for the first start.
cd /d "%~dp0"
if not exist .env (
  echo Missing .env next to this file - copy .env.example to .env and fill it in.
  pause & exit /b 1
)
docker compose pull || (echo Pull failed - did you run: docker login ghcr.io ? & pause & exit /b 1)
docker compose up -d --remove-orphans
docker image prune -f >nul
docker compose ps
echo.
echo SUNU TAC is running: test http://localhost:8080/   -   HR console http://localhost:8080/admin/
pause
