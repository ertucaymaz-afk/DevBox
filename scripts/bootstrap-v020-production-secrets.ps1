[CmdletBinding()]
param(
  [string]$Repository = 'ertucaymaz-afk/DevBox',
  [string]$Ref = 'codex/v0.1.20-vercel-production-modernization',
  [SecureString]$VercelToken,
  [SecureString]$DatabaseUrl,
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

function New-UrlSafeSecret([int]$Bytes = 48) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) }
  finally { $rng.Dispose() }
  return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
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

if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'REPOSITORY_FORMAT_INVALID' }
if ($Ref -notmatch '^[A-Za-z0-9._/-]+$') { throw 'REF_FORMAT_INVALID' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GITHUB_CLI_REQUIRED: https://cli.github.com/'
}

Write-Host "DEVBOX_V020_SECRET_BOOTSTRAP repository=$Repository ref=$Ref"
Invoke-Gh -Arguments @('auth', 'status', '--hostname', 'github.com')
Invoke-Gh -Arguments @('repo', 'view', $Repository, '--json', 'nameWithOwner') | Out-Null

if ($null -eq $VercelToken) {
  $VercelToken = Read-Host 'Vercel access token' -AsSecureString
}
if ($null -eq $DatabaseUrl) {
  $DatabaseUrl = Read-Host 'Neon production PostgreSQL connection string' -AsSecureString
}

$vercelPlain = Get-PlainText $VercelToken
$databasePlain = Get-PlainText $DatabaseUrl
if ($vercelPlain.Length -lt 8) { throw 'VERCEL_TOKEN_INVALID_OR_EMPTY' }
if ($databasePlain -notmatch '^postgres(?:ql)?://') { throw 'DATABASE_URL_MUST_BE_POSTGRESQL' }

$controlPlaneToken = New-UrlSafeSecret 48
$adminToken = New-UrlSafeSecret 48

try {
  Set-GhSecret 'VERCEL_TOKEN' $vercelPlain
  Set-GhSecret 'DEVBOX_DATABASE_URL' $databasePlain
  Set-GhSecret 'DEVBOX_CONTROL_PLANE_TOKEN' $controlPlaneToken
  Set-GhSecret 'DEVBOX_CONTROL_ADMIN_TOKEN' $adminToken

  $secretRows = Invoke-Gh -Arguments @('secret', 'list', '--repo', $Repository, '--app', 'actions', '--json', 'name') -Capture
  $secretJson = $secretRows -join "`n"
  foreach ($required in @('VERCEL_TOKEN', 'DEVBOX_DATABASE_URL', 'DEVBOX_CONTROL_PLANE_TOKEN', 'DEVBOX_CONTROL_ADMIN_TOKEN')) {
    if ($secretJson -notmatch ('"name"\s*:\s*"' + [Regex]::Escape($required) + '"')) {
      throw "SECRET_LIST_VERIFY_FAILED:$required"
    }
  }
  Write-Host 'DEVBOX_V020_SECRET_BOOTSTRAP_PASS secrets=4 values=masked'

  if (-not $NoTrigger) {
    Write-Host 'Promotion workflow tetikleniyor...'
    & gh workflow run 'v020-production-promote.yml' --repo $Repository --ref $Ref
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'workflow_dispatch tetiklenemedi; canonical PR üzerindeki son failed promotion run yeniden deneniyor.'
      $runRows = Invoke-Gh -Arguments @('run', 'list', '--repo', $Repository, '--workflow', 'v0.1.20 production promotion', '--branch', $Ref, '--limit', '1', '--json', 'databaseId,conclusion,status') -Capture
      $runs = ($runRows -join "`n") | ConvertFrom-Json
      $run = @($runs) | Select-Object -First 1
      if ($null -eq $run -or -not $run.databaseId) { throw 'PROMOTION_RUN_NOT_FOUND' }
      Invoke-Gh -Arguments @('run', 'rerun', [string]$run.databaseId, '--repo', $Repository, '--failed')
    }
    Write-Host 'PROMOTION_TRIGGER_PASS secrets=masked'
  }
}
finally {
  $vercelPlain = $null
  $databasePlain = $null
  $controlPlaneToken = $null
  $adminToken = $null
  [GC]::Collect()
}
