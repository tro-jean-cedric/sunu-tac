# SUNU TAC - replace the database with a dump:  restore.cmd C:\sunu-tac\backups\tac-20261125-0200.dump
# Also restores a dump made on the Mac with ./tac.sh backup.
param([Parameter(Mandatory = $true)][string]$File, [string]$ServiceName = "SunuTAC")
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not (Test-Path $File)) { Write-Host "ERROR: file not found: $File"; exit 1 }
$envText = [IO.File]::ReadAllText("$root\.env")
$m = [regex]::Match($envText, "(?m)^DATABASE_URL=postgresql\+psycopg://([^:]+):([^@]+)@([^:/]+):(\d+)/([^\s?]+)")
if (-not $m.Success) { Write-Host "ERROR: DATABASE_URL not found in $root\.env"; exit 1 }
$pgRestore = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_restore.exe" |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending | Select-Object -First 1

Write-Host "This REPLACES all data in the SUNU TAC database with $File" -ForegroundColor Yellow
if ((Read-Host "Type YES to continue") -ne "YES") { Write-Host "Cancelled."; exit 1 }

Stop-Service $ServiceName -ErrorAction SilentlyContinue
$env:PGPASSWORD = $m.Groups[2].Value
& $pgRestore.FullName -h $m.Groups[3].Value -p $m.Groups[4].Value -U $m.Groups[1].Value -d $m.Groups[5].Value `
    --clean --if-exists --no-owner $File
$code = $LASTEXITCODE
Remove-Item Env:PGPASSWORD
Start-Service $ServiceName
if ($code -ne 0) { Write-Host "Restore finished with warnings/errors (code $code) - check the output above." -ForegroundColor Yellow }
else { Write-Host "Restored from $File" -ForegroundColor Green }
