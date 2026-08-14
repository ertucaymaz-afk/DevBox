# DevBox privacy policy

Last updated: 2026-08-14

DevBox is a local-first Windows desktop application. The project does not operate an analytics service, advertising service, user-profile database, or background telemetry endpoint.

## Data stored locally

DevBox may store the following data in the current Windows user profile:

- selected project paths and project metadata;
- task and message history;
- user settings and permission policies;
- attachment metadata and local copies selected by the user;
- SHA-256 content identities, command results, integration evidence, and durable-job state;
- locally stored trust records such as SSH known-host fingerprints and signed-package metadata.

This information is used to provide the application features, recover interrupted work, and show truthful evidence. DevBox does not sell this data or transmit it to the DevBox maintainers.

## Data sent to third parties

Network access is controlled by the selected permission profile and can be disabled. Data leaves the machine only when a user enables or invokes a real external operation. Depending on that operation:

- NVIDIA NIM may receive the user task, a bounded conversation context, and a development/research instruction. The NVIDIA API key is read by the main process and is not exposed to the renderer.
- GitHub CLI may send repository, pull-request, issue, check, workflow, or release data to the GitHub account configured on the machine.
- Vercel CLI may send project and deployment data to the Vercel account configured on the machine.
- SSH operations contact the exact host selected by the user and use strict host-key trust records.
- package, MCP, plugin, or toolkit operations process only explicitly selected artifacts and fail closed when signature/trust prerequisites are absent.

These providers process data under their own terms and privacy policies. DevBox does not proxy those requests through a DevBox-operated server.

## Attachments and archives

Attachments are limited to 300 MiB per file. Archive formats can be attached as inert files; DevBox does not execute or automatically extract them. Attachment previews are bounded and binary data is not rendered as executable content.

## Retention and deletion

Data remains on the device until the user deletes tasks/attachments or removes the application data. The Windows uninstaller intentionally preserves user data to prevent accidental loss. After uninstalling, a user may delete the DevBox directory under the current user's application-data location.

## Security reports and questions

Use the private vulnerability-reporting process described in [SECURITY.md](SECURITY.md). For non-sensitive privacy questions, open a GitHub issue without including personal data, credentials, private repository contents, or logs containing secrets.
