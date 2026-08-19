param(
  [string]$Repo = "ertucaymaz-afk/DevBox",
  [string]$Ref = "codex/devapi-autonomous-evolution-v1",
  [string]$Scope = "",
  [switch]$NoTrigger
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "DEVAPI_BOOTSTRAP_COMMAND_MISSING:$Name"
  }
}

function SecureString-ToPlain([Security.SecureString]$Value) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Set-GitHubSecretFromStdin([string]$Name, [string]$Value) {
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = "gh"
  $psi.ArgumentList.Add("secret")
  $psi.ArgumentList.Add("set")
  $psi.ArgumentList.Add($Name)
  $psi.ArgumentList.Add("--repo")
  $psi.ArgumentList.Add($Repo)
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $process = [Diagnostics.Process]::Start($psi)
  try {
    $process.StandardInput.Write($Value)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "DEVAPI_GH_SECRET_SET_FAILED:$Name:$stderr" }
    return $stdout.Trim()
  }
  finally { $process.Dispose() }
}

Require-Command "gh"

$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) { throw "DEVAPI_GITHUB_AUTH_REQUIRED" }

if ([string]::IsNullOrWhiteSpace($Scope)) {
  $Scope = (Read-Host "Vercel team/scope slug (örnek: nice)").Trim()
}
if ($Scope -notmatch '^[A-Za-z0-9._-]{1,100}$') { throw "DEVAPI_VERCEL_SCOPE_INVALID" }

$secureToken = Read-Host "Vercel token (ekranda görünmez, diske yazılmaz)" -AsSecureString
$token = SecureString-ToPlain $secureToken
try {
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 20) { throw "DEVAPI_VERCEL_TOKEN_INVALID" }

  [void](Set-GitHubSecretFromStdin "VERCEL_TOKEN" $token)
  [void](Set-GitHubSecretFromStdin "DEVAPI_VERCEL_SCOPE" $Scope)

  $secretList = gh secret list --repo $Repo
  if ($LASTEXITCODE -ne 0) { throw "DEVAPI_GITHUB_SECRET_LIST_FAILED" }
  if ($secretList -notmatch '(?m)^VERCEL_TOKEN\s') { throw "DEVAPI_VERCEL_TOKEN_SECRET_NOT_CONFIRMED" }
  if ($secretList -notmatch '(?m)^DEVAPI_VERCEL_SCOPE\s') { throw "DEVAPI_VERCEL_SCOPE_SECRET_NOT_CONFIRMED" }

  Write-Host "DEVAPI_VERCEL_BOOTSTRAP_PASS secrets=2 persistedLocally=false suffix=.vercel.app"

  if (-not $NoTrigger) {
    gh workflow run "DevAPI five-site production deploy" --repo $Repo --ref $Ref
    if ($LASTEXITCODE -ne 0) { throw "DEVAPI_VERCEL_WORKFLOW_TRIGGER_FAILED" }
    Write-Host "DEVAPI_VERCEL_DEPLOY_TRIGGERED workflow=DevAPI five-site production deploy ref=$Ref"
  }
}
finally {
  $token = $null
  $secureToken.Dispose()
}
