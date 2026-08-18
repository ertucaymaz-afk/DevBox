param(
  [Parameter(Mandatory = $true)]
  [string]$Workspace
)

$ErrorActionPreference = "Stop"
$Workspace = [System.IO.Path]::GetFullPath($Workspace)
$Installer = [System.IO.Path]::GetFullPath((Join-Path $Workspace "release\DevBox-Setup.exe"))
$UnpackedExe = [System.IO.Path]::GetFullPath((Join-Path $Workspace "release\win-unpacked\DevBox.exe"))
$InstallDirectory = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "Programs\DevBox"
$InstalledExe = Join-Path $InstallDirectory "DevBox.exe"
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "DevBox.lnk"
$StartMenuRoot = [Environment]::GetFolderPath("Programs")
$EvidenceDirectory = Join-Path $Workspace "outputs"
$EvidencePath = Join-Path $EvidenceDirectory "installer-runtime-acceptance.json"

function Stop-InstalledDevBox {
  $running = @(Get-CimInstance Win32_Process -Filter "Name = 'DevBox.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($InstallDirectory, [System.StringComparison]::OrdinalIgnoreCase)
  })
  foreach ($item in $running) {
    Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Resolve-ShortcutTarget([string]$ShortcutPath) {
  if (-not (Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) { return $null }
  $wsh = New-Object -ComObject WScript.Shell
  return [System.IO.Path]::GetFullPath($wsh.CreateShortcut($ShortcutPath).TargetPath)
}

if (-not $Installer.StartsWith($Workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "INSTALLER_OUTSIDE_WORKSPACE" }
if (-not $UnpackedExe.StartsWith($Workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "UNPACKED_EXE_OUTSIDE_WORKSPACE" }
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) { throw "INSTALLER_MISSING" }
if (-not (Test-Path -LiteralPath $UnpackedExe -PathType Leaf)) { throw "UNPACKED_EXE_MISSING" }

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
Stop-InstalledDevBox

$setup = Start-Process -FilePath $Installer -ArgumentList "/S" -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw "INSTALLER_FAILED:$($setup.ExitCode)" }
if (-not (Test-Path -LiteralPath $InstalledExe -PathType Leaf)) { throw "INSTALLED_EXE_MISSING" }

$installedHash = (Get-FileHash -LiteralPath $InstalledExe -Algorithm SHA256).Hash.ToLowerInvariant()
$unpackedHash = (Get-FileHash -LiteralPath $UnpackedExe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($installedHash -ne $unpackedHash) { throw "INSTALLED_EXE_HASH_MISMATCH" }

$desktopTarget = Resolve-ShortcutTarget $DesktopShortcut
if (-not $desktopTarget -or -not $desktopTarget.Equals($InstalledExe, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "DESKTOP_SHORTCUT_TARGET_INVALID"
}
$startMenuCandidates = @(Get-ChildItem -LiteralPath $StartMenuRoot -Filter "DevBox.lnk" -File -Recurse -ErrorAction SilentlyContinue)
$startMenuShortcut = $startMenuCandidates | Where-Object {
  $target = Resolve-ShortcutTarget $_.FullName
  $target -and $target.Equals($InstalledExe, [System.StringComparison]::OrdinalIgnoreCase)
} | Select-Object -First 1
if (-not $startMenuShortcut) { throw "START_MENU_SHORTCUT_MISSING_OR_INVALID" }

$uninstaller = Get-ChildItem -LiteralPath $InstallDirectory -Filter "Uninstall*.exe" -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $uninstaller) { throw "UNINSTALLER_MISSING" }

$launched = Start-Process -FilePath $InstalledExe -PassThru
$launchDeadline = [DateTime]::UtcNow.AddSeconds(20)
$liveProcesses = @()
do {
  Start-Sleep -Milliseconds 500
  $liveProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'DevBox.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.Equals($InstalledExe, [System.StringComparison]::OrdinalIgnoreCase)
  })
} while ($liveProcesses.Count -eq 0 -and [DateTime]::UtcNow -lt $launchDeadline)
if ($liveProcesses.Count -eq 0) { throw "INSTALLED_APP_DID_NOT_START" }

$liveCount = $liveProcesses.Count
Stop-InstalledDevBox
Start-Sleep -Milliseconds 500

$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "UNINSTALLER_FAILED:$($uninstall.ExitCode)" }

$uninstallDeadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  Start-Sleep -Milliseconds 500
  $installedStillExists = Test-Path -LiteralPath $InstalledExe -PathType Leaf
} while ($installedStillExists -and [DateTime]::UtcNow -lt $uninstallDeadline)
if ($installedStillExists) { throw "UNINSTALL_DID_NOT_REMOVE_APP" }
if (Test-Path -LiteralPath $DesktopShortcut -PathType Leaf) { throw "UNINSTALL_LEFT_DESKTOP_SHORTCUT" }
$remainingStartMenu = @(Get-ChildItem -LiteralPath $StartMenuRoot -Filter "DevBox.lnk" -File -Recurse -ErrorAction SilentlyContinue)
if ($remainingStartMenu.Count -gt 0) { throw "UNINSTALL_LEFT_START_MENU_SHORTCUT" }

$evidence = [ordered]@{
  verdict = "PASS"
  installerExitCode = $setup.ExitCode
  uninstallExitCode = $uninstall.ExitCode
  installedPath = $InstalledExe
  installedSha256 = $installedHash
  unpackedSha256 = $unpackedHash
  desktopShortcut = $DesktopShortcut
  startMenuShortcut = $startMenuShortcut.FullName
  uninstaller = $uninstaller.FullName
  launchedProcessId = $launched.Id
  liveProcessCount = $liveCount
  installedExeRemoved = -not (Test-Path -LiteralPath $InstalledExe -PathType Leaf)
  desktopShortcutRemoved = -not (Test-Path -LiteralPath $DesktopShortcut -PathType Leaf)
  startMenuShortcutRemoved = $remainingStartMenu.Count -eq 0
  verifiedAt = [DateTime]::UtcNow.ToString("o")
}
$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $EvidencePath -Encoding utf8NoBOM
$evidence | ConvertTo-Json -Depth 5
