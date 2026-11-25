# SUNU TAC - native Windows install / update (no Docker).
# Run install.cmd as Administrator from the extracted package folder.
#   First run : copies the program to C:\sunu-tac, creates the database and .env, installs the service.
#   Next runs : backs up the database, replaces the program files (keeps .env, data, backups, logs), restarts.
param(
    [string]$InstallDir = "C:\sunu-tac",
    [string]$ServiceName = "SunuTAC"
)
$ErrorActionPreference = "Stop"
$Pkg = $PSScriptRoot

function Say($m) { Write-Host "> $m" -ForegroundColor Cyan }
function Ok($m)  { Write-Host "OK $m" -ForegroundColor Green }
function Die($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
function RandomHex($bytes) {
    $b = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}
function WriteUtf8($path, $text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false)) }
function EnvValue($envText, $key) {
    $m = [regex]::Match($envText, "(?m)^$key=(.*)$")
    if ($m.Success) { $m.Groups[1].Value.Trim() } else { "" }
}

# --- checks -------------------------------------------------------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Die "run install.cmd as Administrator (right-click > Run as administrator)" }
if (-not (Test-Path "$Pkg\program\python\python.exe")) { Die "run this from the extracted package folder (program\ missing)" }

$psql = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending | Select-Object -First 1
if (-not $psql) {
    Die "PostgreSQL is not installed. Install PostgreSQL 16 (Windows x86-64, EDB installer), then run install.cmd again."
}
$pgBin = $psql.DirectoryName
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService -and $pgService.Status -ne "Running") { Start-Service $pgService.Name }
Ok "PostgreSQL found: $pgBin"

$envFile = Join-Path $InstallDir ".env"
$firstInstall = -not (Test-Path $envFile)
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

# --- update: backup first, then stop ------------------------------------------------------------------
if (-not $firstInstall) {
    Say "existing install found in $InstallDir - backing up the database before updating"
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$InstallDir\backup.ps1"
    if ($LASTEXITCODE -ne 0) { Die "backup failed - update aborted, nothing was changed" }
}
if ($svc -and $svc.Status -ne "Stopped") { Say "stopping the service"; Stop-Service $ServiceName; Start-Sleep 2 }

# --- program files ------------------------------------------------------------------------------------
Say "copying program files to $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir, "$InstallDir\logs", "$InstallDir\backups",
    "$InstallDir\data\tts-cache" | Out-Null
foreach ($d in "backend", "shared", "web", "python", "service") {
    robocopy "$Pkg\program\$d" "$InstallDir\$d" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Die "copy of $d failed (robocopy code $LASTEXITCODE)" }
}
foreach ($f in "backup.ps1", "backup.cmd", "restore.ps1", "restore.cmd", "VERSION.txt", ".env.example", "README.txt") {
    Copy-Item "$Pkg\$f" "$InstallDir\$f" -Force
}
$global:LASTEXITCODE = 0

# --- first install: database + .env -------------------------------------------------------------------
if ($firstInstall) {
    Say "creating the database 'tac' (PostgreSQL superuser 'postgres' password needed once)"
    $sec = Read-Host "Password of the PostgreSQL 'postgres' user" -AsSecureString
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    $dbPass = RandomHex 16
    $q = { param($sql) & "$pgBin\psql.exe" -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc $sql }
    $hasRole = & $q "SELECT 1 FROM pg_roles WHERE rolname='tac'"
    if ($LASTEXITCODE -ne 0) { Die "cannot connect to PostgreSQL as 'postgres' (wrong password?)" }
    if ($hasRole -match "1") { & $q "ALTER ROLE tac WITH LOGIN PASSWORD '$dbPass'" | Out-Null }
    else { & $q "CREATE ROLE tac WITH LOGIN PASSWORD '$dbPass'" | Out-Null }
    $hasDb = & $q "SELECT 1 FROM pg_database WHERE datname='tac'"
    if (-not ($hasDb -match "1")) { & $q "CREATE DATABASE tac OWNER tac ENCODING 'UTF8' TEMPLATE template0" | Out-Null }
    if ($LASTEXITCODE -ne 0) { Die "database creation failed" }
    Remove-Item Env:PGPASSWORD
    Ok "database ready (user 'tac')"

    $adminPass = (RandomHex 6) + "Aa!"
    $text = [IO.File]::ReadAllText("$Pkg\.env.example")
    $text = $text -replace "(?m)^DATABASE_URL=.*$", "DATABASE_URL=postgresql+psycopg://tac:$dbPass@localhost:5432/tac"
    $text = $text -replace "(?m)^JWT_SECRET=.*$", "JWT_SECRET=$(RandomHex 32)"
    $text = $text -replace "(?m)^ADMIN_PASSWORD=.*$", "ADMIN_PASSWORD=$adminPass"
    $text = $text -replace "(?m)^WEB_DIR=.*$", "WEB_DIR=$InstallDir\web"
    $text = $text -replace "(?m)^TTS_CACHE_DIR=.*$", "TTS_CACHE_DIR=$InstallDir\data\tts-cache"
    WriteUtf8 $envFile $text
    Ok ".env created: $envFile"
}

$envText = [IO.File]::ReadAllText($envFile)
$port = EnvValue $envText "HTTP_PORT"; if (-not $port) { $port = "8080" }

# --- python check + migrations ------------------------------------------------------------------------
$py = "$InstallDir\python\python.exe"
Push-Location "$InstallDir\backend"
try {
    # no 2>&1 on native commands: Windows PowerShell 5.1 turns redirected stderr (alembic logs) into errors
    & $py -c "import psycopg, pydantic_core, argon2, uvicorn, fastapi"
    if ($LASTEXITCODE -ne 0) {
        Die "Python packages failed to load. Install the Microsoft Visual C++ Redistributable 2015-2022 (x64) and retry."
    }
    Say "updating the database schema"
    & $py -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { Die "database migration failed - check DATABASE_URL in $envFile" }
} finally { Pop-Location }

# --- Windows service (WinSW) --------------------------------------------------------------------------
$depend = if ($pgService) { "<depend>$($pgService.Name)</depend>" } else { "" }
$xml = @"
<service>
  <id>$ServiceName</id>
  <name>SUNU TAC</name>
  <description>SUNU Attitude+ (TAC) - test, HR console and API on port $port</description>
  <executable>$py</executable>
  <arguments>-m uvicorn app.main:app --host 0.0.0.0 --port $port --proxy-headers</arguments>
  <workingdirectory>$InstallDir\backend</workingdirectory>
  <env name="PYTHONUNBUFFERED" value="1"/>
  $depend
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>15 sec</stoptimeout>
  <logpath>$InstallDir\logs</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>8</keepFiles></log>
</service>
"@
# WinSW: <id>.exe reads <id>.xml next to it, re-read at every service start (port/args changes apply on restart)
WriteUtf8 "$InstallDir\service\$ServiceName.xml" $xml
Copy-Item "$InstallDir\service\WinSW-x64.exe" "$InstallDir\service\$ServiceName.exe" -Force
if (-not $svc) {
    Say "installing the Windows service '$ServiceName'"
    & "$InstallDir\service\$ServiceName.exe" install
    if ($LASTEXITCODE -ne 0) { Die "service installation failed" }
}

# --- firewall + nightly backup ------------------------------------------------------------------------
if (-not (Get-NetFirewallRule -DisplayName "SUNU TAC $port" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "SUNU TAC $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
    Ok "firewall: port $port opened"
}
if (-not (Get-ScheduledTask -TaskName "SUNU TAC backup" -ErrorAction SilentlyContinue)) {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\backup.ps1`""
    $trigger = New-ScheduledTaskTrigger -Daily -At 2am
    Register-ScheduledTask -TaskName "SUNU TAC backup" -Action $action -Trigger $trigger -User "SYSTEM" `
        -RunLevel Highest -Description "Daily database dump to $InstallDir\backups (30 days kept)" | Out-Null
    Ok "scheduled task: daily backup at 02:00"
}

# --- start + health check -----------------------------------------------------------------------------
Say "starting the service"
Start-Service $ServiceName
$up = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep 2
    try { Invoke-WebRequest "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 3 | Out-Null; $up = $true; break } catch {}
}
if (-not $up) { Die "the service does not answer - see $InstallDir\logs\$ServiceName.err.log" }

Write-Host ""
Ok "SUNU TAC $((Get-Content "$InstallDir\VERSION.txt" -Raw).Trim()) is running"
Write-Host "   Employee test : http://$($env:COMPUTERNAME):$port/"
Write-Host "   HR console    : http://$($env:COMPUTERNAME):$port/admin/"
if ($firstInstall) {
    Write-Host ""
    Write-Host "   Console login : admin.drh / $adminPass   (also in $envFile)" -ForegroundColor Yellow
    Write-Host "   Next: fill LDAP_BIND_DN / LDAP_BIND_PASSWORD in $envFile, then: Restart-Service $ServiceName"
}
