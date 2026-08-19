[CmdletBinding()]
param(
  [string]$Repository = 'ertucaymaz-afk/DevBox',
  [string]$Ref = 'codex/v0.1.20-web-ecosystem-v1',
  [string]$VercelTeamId = 'team_PNUxk74M7XR8MFlKl676ZHlv',
  [string]$VercelProbeProjectId = 'prj_mJCrN5G6w4R32axSWYSLSuuAdmBz',
  [SecureString]$VercelToken,
  [switch]$NoTrigger
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PlainText([SecureString]$Value) {
  if ($null -eq $Value) { return '' }
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Invoke-Gh([string[]]$Arguments, [switch]$Capture) {
  if ($Capture) {
    $output = & gh @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "GH_COMMAND_FAILED:$($Arguments -join ' '):$($output -join ' ')" }
    return @($output)
  }
  & gh @Arguments
  if ($LASTEXITCODE -ne 0) { throw "GH_COMMAND_FAILED:$($Arguments -join ' ')" }
}

function Set-GhSecret([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "SECRET_VALUE_EMPTY:$Name" }
  $gh = (Get-Command gh -ErrorAction Stop).Source
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $gh
  $psi.Arguments = "secret set $Name --repo $Repository --app actions"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $psi
  if (-not $process.Start()) { throw "GH_SECRET_PROCESS_START_FAILED:$Name" }
  try {
    $process.StandardInput.Write($Value)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
      $detail = (($stderr + ' ' + $stdout).Trim() -replace '\s+', ' ')
      throw "GH_SECRET_SET_FAILED:${Name}:$detail"
    }
  }
  finally { $process.Dispose() }
  Write-Host "SECRET_SET_PASS name=$Name value=masked"
}

function Assert-VercelAccess([string]$Token) {
  if ($Token.Length -lt 8) { throw 'VERCEL_TOKEN_INVALID_OR_EMPTY' }
  $encodedProject = [Uri]::EscapeDataString($VercelProbeProjectId)
  $encodedTeam = [Uri]::EscapeDataString($VercelTeamId)
  try {
    $project = Invoke-RestMethod -Method Get -Uri "https://api.vercel.com/v9/projects/${encodedProject}?teamId=${encodedTeam}" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 15 -ErrorAction Stop
  } catch {
    throw 'VERCEL_TOKEN_TEAM_ACCESS_FAILED'
  }
  if ([string]$project.id -ne $VercelProbeProjectId) { throw 'VERCEL_TOKEN_PROJECT_SCOPE_MISMATCH' }
  Write-Host "VERCEL_WEB_PREFLIGHT_PASS team=$VercelTeamId token=masked"
}

if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'REPOSITORY_FORMAT_INVALID' }
if ($Ref -notmatch '^[A-Za-z0-9._/-]+$') { throw 'REF_FORMAT_INVALID' }
if ($VercelTeamId -notmatch '^team_[A-Za-z0-9]+$') { throw 'VERCEL_TEAM_ID_INVALID' }
if ($VercelProbeProjectId -notmatch '^prj_[A-Za-z0-9]+$') { throw 'VERCEL_PROBE_PROJECT_ID_INVALID' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GITHUB_CLI_REQUIRED: https://cli.github.com/' }

Write-Host "DEVBOX_WEB_VERCEL_BOOTSTRAP repository=$Repository ref=$Ref token=masked"
Invoke-Gh -Arguments @('auth', 'status', '--hostname', 'github.com')
Invoke-Gh -Arguments @('repo', 'view', $Repository, '--json', 'nameWithOwner') | Out-Null
Invoke-Gh -Arguments @('api', "repos/$Repository/git/ref/heads/$Ref", '--jq', '.ref') | Out-Null

if ($null -eq $VercelToken) {
  $VercelToken = Read-Host 'Vercel access token' -AsSecureString
}
$plain = Get-PlainText $VercelToken
try {
  Assert-VercelAccess $plain
  Set-GhSecret 'VERCEL_TOKEN' $plain

  $secretRows = Invoke-Gh -Arguments @('secret', 'list', '--repo', $Repository, '--app', 'actions', '--json', 'name') -Capture
  $secretJson = $secretRows -join "`n"
  if ($secretJson -notmatch '"name"\s*:\s*"VERCEL_TOKEN"') { throw 'VERCEL_SECRET_LIST_VERIFY_FAILED' }
  Write-Host 'DEVBOX_WEB_VERCEL_SECRET_BOOTSTRAP_PASS secret=VERCEL_TOKEN value=masked persistedLocally=false'

  if (-not $NoTrigger) {
    $runRows = Invoke-Gh -Arguments @('run', 'list', '--repo', $Repository, '--workflow', 'DevBox web production activation', '--branch', $Ref, '--limit', '10', '--json', 'databaseId,conclusion,status,headSha,event') -Capture
    $runs = @((($runRows -join "`n") | ConvertFrom-Json))
    $run = $runs | Where-Object { $_.status -eq 'completed' -and $_.conclusion -eq 'failure' } | Select-Object -First 1
    if ($null -eq $run -or -not $run.databaseId) { throw 'DEVBOX_WEB_FAILED_RUN_NOT_FOUND' }
    Invoke-Gh -Arguments @('run', 'rerun', [string]$run.databaseId, '--repo', $Repository, '--failed')
    Write-Host "DEVBOX_WEB_PRODUCTION_RERUN_REQUESTED run=$($run.databaseId) token=masked"
  }
}
finally {
  $plain = $null
  [GC]::Collect()
}
