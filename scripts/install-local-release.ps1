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
$ShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "DevBox.lnk"

if (-not $Installer.StartsWith($Workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "INSTALLER_OUTSIDE_WORKSPACE" }
if (-not $UnpackedExe.StartsWith($Workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "UNPACKED_EXE_OUTSIDE_WORKSPACE" }
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) { throw "INSTALLER_MISSING" }
if (-not (Test-Path -LiteralPath $UnpackedExe -PathType Leaf)) { throw "UNPACKED_EXE_MISSING" }

$Running = @(Get-CimInstance Win32_Process -Filter "Name = 'DevBox.exe'" -ErrorAction SilentlyContinue | Where-Object {
  $_.ExecutablePath -and $_.ExecutablePath.StartsWith($InstallDirectory, [System.StringComparison]::OrdinalIgnoreCase)
})
foreach ($Item in $Running) {
  Stop-Process -Id $Item.ProcessId -Force -ErrorAction Stop
}

$Setup = Start-Process -FilePath $Installer -ArgumentList "/S" -Wait -PassThru
if ($Setup.ExitCode -ne 0) { throw "INSTALLER_FAILED:$($Setup.ExitCode)" }
if (-not (Test-Path -LiteralPath $InstalledExe -PathType Leaf)) { throw "INSTALLED_EXE_MISSING" }

$InstalledHash = (Get-FileHash -LiteralPath $InstalledExe -Algorithm SHA256).Hash
$UnpackedHash = (Get-FileHash -LiteralPath $UnpackedExe -Algorithm SHA256).Hash
if ($InstalledHash -ne $UnpackedHash) { throw "INSTALLED_EXE_HASH_MISMATCH" }

$Wsh = New-Object -ComObject WScript.Shell
$Shortcut = $Wsh.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $InstalledExe
$Shortcut.WorkingDirectory = $InstallDirectory
$Shortcut.IconLocation = "$InstalledExe,0"
$Shortcut.Description = "DevBox"
$Shortcut.Save()

$Launched = Start-Process -FilePath $InstalledExe -PassThru
Start-Sleep -Seconds 3
$LiveProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'DevBox.exe'" -ErrorAction SilentlyContinue | Where-Object {
  $_.ExecutablePath -and $_.ExecutablePath.Equals($InstalledExe, [System.StringComparison]::OrdinalIgnoreCase)
})
if ($LiveProcesses.Count -eq 0) { throw "INSTALLED_APP_DID_NOT_START" }

[pscustomobject]@{
  InstallerExitCode = $Setup.ExitCode
  InstalledPath = $InstalledExe
  InstalledSHA256 = $InstalledHash
  UnpackedSHA256 = $UnpackedHash
  ShortcutPath = $ShortcutPath
  ShortcutTarget = $InstalledExe
  ShortcutLastWriteTime = (Get-Item -LiteralPath $ShortcutPath).LastWriteTime.ToString("o")
  LaunchedProcessId = $Launched.Id
  LiveProcessCount = $LiveProcesses.Count
} | ConvertTo-Json -Depth 4
