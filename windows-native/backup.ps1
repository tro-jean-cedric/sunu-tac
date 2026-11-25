# SUNU TAC - dump the database to backups\tac-YYYYMMDD-HHMM.dump (same format as ./tac.sh backup).
# Runs daily at 02:00 (scheduled task created by install.ps1). Keeps 30 days. Copy backups\ off this server.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$envText = [IO.File]::ReadAllText("$root\.env")
$m = [regex]::Match($envText, "(?m)^DATABASE_URL=postgresql\+psycopg://([^:]+):([^@]+)@([^:/]+):(\d+)/([^\s?]+)")
if (-not $m.Success) { Write-Host "ERROR: DATABASE_URL not found in $root\.env"; exit 1 }
$pgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending | Select-Object -First 1
if (-not $pgDump) { Write-Host "ERROR: pg_dump.exe not found"; exit 1 }

New-Item -ItemType Directory -Force -Path "$root\backups" | Out-Null
$file = "$root\backups\tac-$(Get-Date -Format yyyyMMdd-HHmm).dump"
$env:PGPASSWORD = $m.Groups[2].Value
& $pgDump.FullName -h $m.Groups[3].Value -p $m.Groups[4].Value -U $m.Groups[1].Value -d $m.Groups[5].Value -Fc -f $file
$code = $LASTEXITCODE
Remove-Item Env:PGPASSWORD
if ($code -ne 0) { Write-Host "ERROR: backup failed"; exit 1 }

Get-ChildItem "$root\backups\*.dump" | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item
Write-Host "Backup written: $file"
