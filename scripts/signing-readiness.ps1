$ErrorActionPreference = "Stop"

function Add-Check {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Detail
  )
  $script:Checks.Add([ordered]@{ name = $Name; passed = $Passed; detail = $Detail })
  if (-not $Passed) { $script:Ready = $false }
}

$Mode = if ([string]::IsNullOrWhiteSpace($env:DEVBOX_SIGNING_MODE)) { "store" } else { $env:DEVBOX_SIGNING_MODE.Trim().ToLowerInvariant() }
$Checks = [System.Collections.Generic.List[object]]::new()
$Ready = $true
$Action = ""

if ($Mode -eq "store") {
  $Now = Get-Date
  $EligibleCertificates = @(Get-ChildItem -Path Cert:\CurrentUser\My, Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
    Where-Object {
      $_.HasPrivateKey -and
      $_.NotBefore -le $Now -and
      $_.NotAfter -gt $Now -and
      ($_.EnhancedKeyUsageList | Where-Object { $_.ObjectId.Value -eq "1.3.6.1.5.5.7.3.3" })
    })
  Add-Check "eligible-certificate-candidates" ($EligibleCertificates.Count -gt 0) "Found $($EligibleCertificates.Count) non-expired Code Signing certificate(s) with an available private key in CurrentUser/My or LocalMachine/My."

  $Thumbprint = ($env:DEVBOX_SIGNING_CERT_SHA1 -replace "\s", "").ToUpperInvariant()
  Add-Check "thumbprint-format" ($Thumbprint -match "^[A-F0-9]{40}$") "DEVBOX_SIGNING_CERT_SHA1 must identify one exact Windows certificate-store certificate."

  $Certificate = $null
  if ($Thumbprint -match "^[A-F0-9]{40}$") {
    $Certificate = Get-ChildItem -Path Cert:\CurrentUser\My, Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
      Where-Object { $_.Thumbprint -eq $Thumbprint } |
      Select-Object -First 1
  }

  Add-Check "certificate-found" ($null -ne $Certificate) "The certificate must exist in CurrentUser/My or LocalMachine/My."
  if ($null -ne $Certificate) {
    $CodeSigningEku = $Certificate.EnhancedKeyUsageList | Where-Object { $_.ObjectId.Value -eq "1.3.6.1.5.5.7.3.3" }
    Add-Check "private-key" ([bool]$Certificate.HasPrivateKey) "A hardware-backed/private signing key must be available to SignTool."
    Add-Check "valid-now" ($Certificate.NotBefore -le $Now -and $Certificate.NotAfter -gt $Now) "The certificate must be inside its validity period."
    Add-Check "code-signing-eku" ($null -ne $CodeSigningEku) "Enhanced Key Usage must include Code Signing (1.3.6.1.5.5.7.3.3)."
  }

  $Action = if ($Ready) {
    "Run pnpm package:signed. The build will fail if Electron Builder cannot produce and verify an Authenticode signature."
  } else {
    "Obtain an identity-validated public code-signing certificate and private key/token, install its public certificate in Windows, then set DEVBOX_SIGNING_CERT_SHA1 to its thumbprint."
  }
} elseif ($Mode -eq "azure") {
  foreach ($Name in @(
    "DEVBOX_AZURE_PUBLISHER_NAME",
    "DEVBOX_AZURE_SIGN_ENDPOINT",
    "DEVBOX_AZURE_CERT_PROFILE",
    "DEVBOX_AZURE_SIGN_ACCOUNT"
  )) {
    Add-Check $Name (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))) "$Name is required for Microsoft Artifact Signing."
  }

  $HasWorkloadIdentity = -not [string]::IsNullOrWhiteSpace($env:AZURE_TENANT_ID) -and
    -not [string]::IsNullOrWhiteSpace($env:AZURE_CLIENT_ID) -and
    -not [string]::IsNullOrWhiteSpace($env:AZURE_FEDERATED_TOKEN_FILE)
  $HasClientSecret = -not [string]::IsNullOrWhiteSpace($env:AZURE_TENANT_ID) -and
    -not [string]::IsNullOrWhiteSpace($env:AZURE_CLIENT_ID) -and
    -not [string]::IsNullOrWhiteSpace($env:AZURE_CLIENT_SECRET)
  $HasClientCertificate = -not [string]::IsNullOrWhiteSpace($env:AZURE_TENANT_ID) -and
    -not [string]::IsNullOrWhiteSpace($env:AZURE_CLIENT_ID) -and
    -not [string]::IsNullOrWhiteSpace($env:AZURE_CLIENT_CERTIFICATE_PATH)
  Add-Check "azure-identity" ($HasWorkloadIdentity -or $HasClientSecret -or $HasClientCertificate) "Configure one supported non-interactive Azure Identity credential; secrets are never printed."

  $Action = if ($Ready) {
    "Run pnpm package:signed. Electron Builder will use Azure Identity and Microsoft Artifact Signing; it must return a verifiable Authenticode signature."
  } else {
    "Complete the Artifact Signing account/profile/role assignment and configure one supported Azure Identity credential."
  }
} else {
  Add-Check "signing-mode" $false "DEVBOX_SIGNING_MODE must be 'store' or 'azure'."
  $Action = "Select a supported signing mode."
}

$Result = [ordered]@{
  schemaVersion = 1
  product = "DevBox"
  mode = $Mode
  status = if ($Ready) { "READY" } else { "BLOCKED" }
  checks = $Checks
  action = $Action
}

$Result | ConvertTo-Json -Depth 6
if (-not $Ready) { exit 2 }
