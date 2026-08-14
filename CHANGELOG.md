# Changelog

All notable DevBox changes are recorded here. DevBox follows semantic versioning while the `0.x` line remains a functional preview.

## [0.1.0] - 2026-08-14

### Added

- Conversation-first Windows desktop layout with compact navigation, project context, message history, composer, settings, API Evolution, integrations, file, Git, terminal, worktree and test surfaces.
- Real local project selection and bounded file operations, SHA-256 previews, right-click clipboard actions, edit/copy/quote/regenerate message actions, and drag-and-drop attachments up to 300 MiB per file.
- Real `node-pty`/ConPTY terminal sessions with resize, input, output and termination lifecycle.
- SQLite WAL persistence for projects, conversations, settings, attachments, message feedback, API Evolution campaigns and durable jobs.
- Loopback-only bearer-authenticated DevBox v1 HTTP API.
- Health-checked NVIDIA NIM/Hermes chat route and an authenticated official Codex CLI route for read-only API Evolution analysis, with NVIDIA fallback only after a real Codex failure.
- Fourteen API Evolution tracks, a 24-cycle daily ceiling, 60-minute scheduling, editable durable directive, evidence links and restart recovery.
- GitHub, Vercel, SSH host-key pinning, LSP/DAP discovery, worktree and signed-package lifecycle command paths that report unavailable prerequisites instead of inventing success.
- Windows NSIS packaging, release manifest, SHA-256 inventory, CycloneDX SBOM, third-party notices and a fail-closed Authenticode build path.
- Apache-2.0 licensing, contribution/security/privacy policies, public CI and SignPath Foundation application material.

### Changed

- Reduced navigation and conversation density to match the supplied Codex-style reference more closely; the separate visible `Çalış` mode was removed from the main conversation surface.
- Added an animated SVG DevBox wordmark and increased safe spacing between the brand and navigation.
- Simplified Settings into focused internal sections and added an explicit close control.
- Added contextual automatic conversation titles, project/conversation path context and absolute tooltip plus compact visible timestamps.
- Replaced the misleading always-green conversation marker with real running/error state indicators; opening a conversation no longer leaves a false unread signal.
- Changed task deletion to a result-bearing IPC contract: cancelling the native confirmation leaves the task intact, while confirming deletes both SQLite data and the visible row.
- Converted message operations to compact icon controls while keeping accessible labels and real clipboard/edit/quote/regenerate/feedback behavior.
- Migrated legacy API Evolution campaigns from 4 daily cycles and 360-minute intervals to 24 daily cycles and 60-minute intervals, while filling all fourteen missing tracks without erasing earlier results.

### Verification

- TypeScript main and renderer type checks pass.
- Unit and contract tests include database migration/integrity, durable jobs, agent routing and real close/reopen API Evolution persistence.
- Electron Playwright E2E covers task creation, deletion cancellation, confirmed deletion, settings close behavior, secure preload bridge and production build startup.
- The product-truth audit rejects production test-mode switches and mock/demo/simulation markers and verifies the packaged file allowlist.

### Known release gates

- The current installer is Authenticode `NotSigned` until SignPath Foundation approves the open-source application and provisions its trust root.
- Full editor diagnostics/debugger UI for LSP/DAP, restart-resumable multi-machine worker scheduling, signed marketplace hosting, signed automatic update/repair/rollback, clean-VM mutation tests and multi-hour failure/soak matrices are not release-complete.
- This release intentionally does not claim that a SignPath application, certificate, signature or third-party service mutation succeeded unless its external system provides evidence.

