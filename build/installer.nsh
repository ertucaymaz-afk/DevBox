; DevBox NSIS build-resource include shim.
; electron-builder adds BUILD_RESOURCES_DIR to the NSIS include search path when
; this conventional installer.nsh file exists. That lets the reviewed
; build/allowOnlyOneInstallerInstance.nsh resource satisfy the upstream
; installer template without replacing the complete installer.nsi script.
!define DEVBOX_NSIS_BUILD_RESOURCE_INCLUDE 1
