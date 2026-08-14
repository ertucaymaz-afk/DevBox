# DevBox

DevBox is a Windows-first, evidence-backed engineering desktop for local projects, chat-driven agent tasks, Git work, real ConPTY terminals, durable job history, provider-backed engineering research, and explicit integrations.

The project is being developed in public. It does not use demo responses, simulated integrations, fake progress, or placeholder success states. A capability is reported as ready only when the runtime can discover and exercise its real implementation; unavailable capabilities remain visibly unavailable.

## Current release

The current `0.1.x` line is a functional preview, not a declaration that every long-term release gate is complete. The source tree includes:

- an Electron/React Windows desktop shell with a conversation-first layout;
- real local project selection, bounded file access, Git status/diff, editable messages, clipboard/context-menu actions, and file drag-and-drop;
- file attachments up to 300 MiB each, stored locally with SHA-256 identity and no archive execution;
- a real `node-pty`/ConPTY interactive terminal path;
- a loopback-only, bearer-authenticated DevBox v1 HTTP API;
- SQLite-backed threads, settings, evidence, durable jobs, leases, recovery, and worktree lifecycle operations;
- real NVIDIA NIM/Hermes provider calls when the user supplies credentials and permits network access;
- GitHub, Vercel, SSH, LSP/DAP discovery, and signed-package lifecycle command paths that fail closed when prerequisites are absent;
- reproducible TypeScript build, unit/contract tests, packaging checks, release manifest, SHA-256 inventory, and CycloneDX SBOM generation.

The release manifest shipped with each download is the authoritative machine-readable statement of signing state and remaining gates. An unsigned artifact is explicitly labelled `NOT_SIGNED`; it is never presented as Authenticode-signed.

## Install and uninstall

Download `DevBox-Setup.exe` or `devbox.zip` from the [GitHub Releases page](https://github.com/ertucaymaz-afk/DevBox/releases). Verify the SHA-256 value from `SHA256SUMS.txt` before installing. The installer is per-user and creates a Start menu entry and desktop shortcut.

Uninstall DevBox from **Windows Settings → Apps → Installed apps → DevBox → Uninstall**. Uninstallation leaves user data in the per-user application data directory so that an accidental uninstall does not destroy task history. Users can remove that data manually after exporting anything they need.

## Build from source

Prerequisites:

- Windows 11 or a supported Windows environment;
- Node.js 24 or newer;
- pnpm 11.19.0;
- Git.

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm verify
pnpm package:installer
pnpm release:prepare
pnpm release:verify
```

`pnpm verify` runs type checking, tests, the production build, and the product-truth audit. Packaging uses Electron Builder/NSIS. The signed packaging path, `pnpm package:signed`, fails closed unless a real, usable Authenticode identity is configured.

## Privacy and security

DevBox has no product analytics or advertising telemetry. Local project data, conversations, settings, attachments, and evidence remain on the machine unless a user explicitly invokes an external provider or integration. Provider and integration behavior is documented in [PRIVACY.md](PRIVACY.md). Vulnerability reporting and supported security controls are documented in [SECURITY.md](SECURITY.md).

## Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

DevBox is applying to the SignPath Foundation open-source program. Until the application is approved and the repository is connected to the SignPath trust root, release metadata will continue to state `NOT_SIGNED`. After onboarding, only artifacts built from this public repository by the protected GitHub Actions release workflow, submitted through the official SignPath integration, and approved under the release signing policy will be distributed as signed DevBox releases.

Project roles:

- Author: [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)
- Reviewer: [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)
- Signing approver: [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)

As the project grows, author, reviewer, and signing-approver duties will be separated across maintainers. Every signed release will require a manual approval and a source-origin-verifiable build. See [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md).

## Contributing

Contributions are welcome under the Apache License 2.0. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and do not submit credentials, private user data, generated release directories, or unverified claims.

## License

Copyright 2026 DevBox contributors. Licensed under the [Apache License 2.0](LICENSE).
