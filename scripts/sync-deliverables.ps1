param(
  [Parameter(Mandatory = $true)]
  [string]$Workspace
)

$ErrorActionPreference = "Stop"
$Workspace = [System.IO.Path]::GetFullPath($Workspace)
$Stage = [System.IO.Path]::GetFullPath((Join-Path $Workspace "release\devbox-package"))
$Outputs = [System.IO.Path]::GetFullPath((Join-Path $Workspace "outputs"))
$Desktop = [Environment]::GetFolderPath("Desktop")

if (-not $Stage.StartsWith($Workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "STAGE_OUTSIDE_WORKSPACE" }
if (-not $Outputs.StartsWith($Workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "OUTPUTS_OUTSIDE_WORKSPACE" }
if (-not (Test-Path -LiteralPath $Stage -PathType Container)) { throw "STAGE_MISSING" }
if (-not (Test-Path -LiteralPath $Desktop -PathType Container)) { throw "DESKTOP_MISSING" }
if (-not (Test-Path -LiteralPath $Outputs -PathType Container)) {
  New-Item -ItemType Directory -Path $Outputs | Out-Null
}

$Required = @("DevBox-Setup.exe", "SHA256SUMS.txt", "THIRD-PARTY-NOTICES.txt", "release-manifest.json")
foreach ($Name in $Required) {
  if (-not (Test-Path -LiteralPath (Join-Path $Stage $Name) -PathType Leaf)) { throw "MISSING_STAGE_FILE:$Name" }
}

$Nonce = [Guid]::NewGuid().ToString("N")
$SourceInstaller = Join-Path $Stage "DevBox-Setup.exe"
$OutputInstaller = Join-Path $Outputs "DevBox-Setup.exe"
$OutputInstallerNext = Join-Path $Outputs "DevBox-Setup.$Nonce.next.exe"
$OutputZip = Join-Path $Outputs "devbox.zip"
$OutputZipNext = Join-Path $Outputs "devbox.$Nonce.next.zip"
$DesktopZip = Join-Path $Desktop "devbox.zip"
$DesktopZipNext = Join-Path $Desktop "devbox.$Nonce.next.zip"

Copy-Item -LiteralPath $SourceInstaller -Destination $OutputInstallerNext
[System.IO.File]::Move($OutputInstallerNext, $OutputInstaller, $true)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive = [System.IO.Compression.ZipFile]::Open($OutputZipNext, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($Name in $Required) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $Archive,
      (Join-Path $Stage $Name),
      $Name,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $Archive.Dispose()
}

$Check = [System.IO.Compression.ZipFile]::OpenRead($OutputZipNext)
try {
  $Entries = @($Check.Entries | ForEach-Object { $_.FullName } | Sort-Object)
  $Expected = @($Required | Sort-Object)
  if (Compare-Object -ReferenceObject $Expected -DifferenceObject $Entries) { throw "ZIP_INVENTORY_MISMATCH" }
} finally {
  $Check.Dispose()
}

[System.IO.File]::Move($OutputZipNext, $OutputZip, $true)
Copy-Item -LiteralPath $OutputZip -Destination $DesktopZipNext
[System.IO.File]::Move($DesktopZipNext, $DesktopZip, $true)

$ReleaseHash = (Get-FileHash -LiteralPath $SourceInstaller -Algorithm SHA256).Hash
$OutputHash = (Get-FileHash -LiteralPath $OutputInstaller -Algorithm SHA256).Hash
$OutputZipHash = (Get-FileHash -LiteralPath $OutputZip -Algorithm SHA256).Hash
$DesktopZipHash = (Get-FileHash -LiteralPath $DesktopZip -Algorithm SHA256).Hash
if ($ReleaseHash -ne $OutputHash) { throw "OUTPUT_INSTALLER_HASH_MISMATCH" }
if ($OutputZipHash -ne $DesktopZipHash) { throw "DESKTOP_ZIP_HASH_MISMATCH" }

[pscustomobject]@{
  ReleaseInstallerSHA256 = $ReleaseHash
  OutputInstallerSHA256 = $OutputHash
  OutputZipSHA256 = $OutputZipHash
  DesktopZipSHA256 = $DesktopZipHash
  ZipEntries = $Required
} | ConvertTo-Json -Depth 4
