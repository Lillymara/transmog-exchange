# supabase_run.ps1 — runs a .sql file against the Transmog Exchange project
# via the Supabase Management API. Called by Claude Code.
#
# Usage: .\supabase_run.ps1 migrate_v2.sql

param([Parameter(Mandatory)][string]$SqlFile)

$configPath = Join-Path $PSScriptRoot ".supabase_config.json"
if (-not (Test-Path $configPath)) {
    Write-Error "Missing .supabase_config.json — create it with your Supabase management token."
    exit 1
}

$cfg        = Get-Content $configPath | ConvertFrom-Json
$projectRef = $cfg.project_ref
$token      = $cfg.management_token
$sql        = Get-Content (Join-Path $PSScriptRoot $SqlFile) -Raw

$response = Invoke-RestMethod `
    -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
    -Body (ConvertTo-Json @{ query = $sql } -Compress)

$response | ConvertTo-Json -Depth 10
