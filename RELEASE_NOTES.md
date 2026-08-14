# DevBox 0.1.0 functional preview

This package contains the latest DevBox source or Windows installer, depending on the archive name:

- `DevBox-source-v0.1.0.zip` is the low-size, Apache-2.0 source archive. It excludes `node_modules`, build output, installers, runtime databases, evidence, local secrets and caches.
- `devbox.zip` is the installable Windows delivery archive. It contains the NSIS installer, checksums, release manifest and third-party notices; it is not a source archive.

## User-visible corrections in this build

- Task deletion now waits for the native confirmation result. Cancel keeps the task; confirm removes the persistent SQLite record and refreshes the sidebar.
- Settings has an explicit close button and a smaller set of focused internal sections.
- Conversation titles are derived from the first meaningful user request and stay editable.
- Sidebar rows and individual messages show real timestamps; the conversation header shows project/history context.
- The former always-green row marker now represents only real running/error state, eliminating the false unread appearance.
- API Evolution is no longer capped at four visible cycles. It has fourteen tracks, stores up to 120 task records, runs at most 24 automatic cycles per UTC day at a minimum 60-minute interval, and persists its directive/results in SQLite WAL across restarts.
- API Evolution first uses a health-checked, logged-in official Codex CLI in ephemeral read-only mode. If that real call fails, DevBox may use the configured NVIDIA NIM/Hermes route; if neither works, the task is recorded as failed rather than fabricated.
- Chat remains on the user-configured NVIDIA/Hermes route and reports configuration or provider failures explicitly.

## Signing status

The installer supplied with this preview is unsigned unless `release-manifest.json` says `VALID`. The public repository and SignPath Foundation application package are prepared, but only SignPath can approve the project and issue the real open-source code-signing identity. DevBox does not substitute a self-signed certificate or claim an external approval before it exists.

See [CHANGELOG.md](CHANGELOG.md), [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md), and [SECURITY.md](SECURITY.md) for details.

