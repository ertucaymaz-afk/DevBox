param(
  [Parameter(Mandatory = $true)]
  [string]$Workspace
)

$ErrorActionPreference = "Stop"
$Workspace = [System.IO.Path]::GetFullPath($Workspace)
$Outputs = [System.IO.Path]::GetFullPath((Join-Path $Workspace "outputs"))
$Desktop = [Environment]::GetFolderPath("Desktop")
$Package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Workspace "package.json") | ConvertFrom-Json
$Name = "DevBox-source-v$($Package.version).zip"
$OutputArchive = Join-Path $Outputs $Name
$DesktopArchive = Join-Path $Desktop $Name
$Nonce = [Guid]::NewGuid().ToString("N")
$NextArchive = Join-Path $Outputs "$Name.$Nonce.next"

if (-not $Outputs.StartsWith($Workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "OUTPUTS_OUTSIDE_WORKSPACE" }
if (-not (Test-Path -LiteralPath (Join-Path $Workspace ".git") -PathType Container)) { throw "SOURCE_ARCHIVE_REQUIRES_GIT_REPOSITORY" }
if (-not (Test-Path -LiteralPath $Desktop -PathType Container)) { throw "DESKTOP_MISSING" }
if (-not (Test-Path -LiteralPath $Outputs -PathType Container)) { New-Item -ItemType Directory -Path $Outputs | Out-Null }

$Status = & git -C $Workspace status --porcelain=v1 --untracked-files=all
if ($LASTEXITCODE -ne 0) { throw "GIT_STATUS_FAILED" }
if ($Status) { throw "SOURCE_ARCHIVE_REQUIRES_CLEAN_WORKTREE" }

$Prefix = "DevBox-$($Package.version)-source/"
& git -C $Workspace archive --format=zip "--prefix=$Prefix" --output=$NextArchive HEAD
if ($LASTEXITCODE -ne 0) { throw "GIT_ARCHIVE_FAILED" }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive = [System.IO.Compression.ZipFile]::OpenRead($NextArchive)
try {
  $Entries = @($Archive.Entries | ForEach-Object { $_.FullName })
  foreach ($Required in @("README.md", "CHANGELOG.md", "docs/RELEASE_NOTES.md", "docs/GELISTIRME-MD-ALIM-RAPORU.md", "specs/development/geliştirme-spec-task-graph.json", "LICENSE", "package.json", "pnpm-lock.yaml")) {
    if (-not ($Entries -contains "$Prefix$Required")) { throw "SOURCE_ARCHIVE_MISSING:$Required" }
  }
  $Forbidden = @($Entries | Where-Object { $_ -match "(^|/)(node_modules|dist|release|outputs|evidence|research|work|\.git)(/|$)" })
  if ($Forbidden.Count -gt 0) { throw "SOURCE_ARCHIVE_FORBIDDEN_ENTRY:$($Forbidden[0])" }
} finally {
  $Archive.Dispose()
}

[System.IO.File]::Move($NextArchive, $OutputArchive, $true)
$DesktopNext = Join-Path $Desktop "$Name.$Nonce.next"
Copy-Item -LiteralPath $OutputArchive -Destination $DesktopNext
[System.IO.File]::Move($DesktopNext, $DesktopArchive, $true)

$OutputHash = (Get-FileHash -LiteralPath $OutputArchive -Algorithm SHA256).Hash
$DesktopHash = (Get-FileHash -LiteralPath $DesktopArchive -Algorithm SHA256).Hash
if ($OutputHash -ne $DesktopHash) { throw "SOURCE_ARCHIVE_DESKTOP_HASH_MISMATCH" }

[pscustomobject]@{
  OutputArchive = $OutputArchive
  DesktopArchive = $DesktopArchive
  Bytes = (Get-Item -LiteralPath $OutputArchive).Length
  SHA256 = $OutputHash
  Commit = (& git -C $Workspace rev-parse HEAD).Trim()
} | ConvertTo-Json -Depth 3
