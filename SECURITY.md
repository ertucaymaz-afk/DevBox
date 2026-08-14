# Security policy

## Supported versions

DevBox is currently a public preview. Only the latest published release and the default branch receive security fixes.

## Report a vulnerability

Do not open a public issue containing exploit details, credentials, private project data, or sensitive logs. Use GitHub private vulnerability reporting for this repository when available. If that channel is unavailable, open a minimal public issue asking the maintainer to establish a private contact channel; do not include the vulnerability details in that issue.

Include the affected version/commit, Windows version, reproducible steps, security impact, and any relevant redacted evidence. Reports are acknowledged as soon as practicable. A fix, mitigation, or coordinated disclosure timeline depends on severity and reproducibility.

## Security boundaries

- Renderer code has no direct Node.js access; privileged operations cross validated IPC contracts.
- Project file operations are bounded to a selected canonical root.
- The HTTP API binds to loopback and requires a bearer key.
- External provider credentials remain in the main/child-process boundary and are not returned to the renderer.
- High-impact integrations and process operations are governed by the active permission profile.
- SSH trust is pinned explicitly; signed package operations fail closed when trust or signature validation is missing.
- Release artifacts include hashes and a machine-readable signing verdict.

Security scanners and tests are used to improve DevBox itself. DevBox is not marketed or distributed as an exploitation, malware, credential-harvesting, or vulnerability weaponization tool.
