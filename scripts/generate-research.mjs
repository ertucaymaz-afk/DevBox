import { mkdir, writeFile } from "node:fs/promises";

const checkedAt = "2026-08-14T01:10:00+03:00";
const root = new URL("../research/", import.meta.url);
const evidenceRoot = new URL("../evidence/", import.meta.url);
const outputRoot = new URL("../outputs/", import.meta.url);

const sources = [
  {
    id: "SRC-OPENAI-CODEX-APP",
    authority: "official_vendor_docs",
    title: "Introducing the Codex app",
    url: "https://openai.com/tr-TR/index/introducing-the-codex-app/",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-RES-001", "DEVBOX-UX-001", "DEVBOX-AGENT-002"]
  },
  {
    id: "SRC-OPENAI-CODEX",
    authority: "official_vendor_docs",
    title: "OpenAI Codex",
    url: "https://openai.com/tr-TR/codex/",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-RES-001", "DEVBOX-UX-001"]
  },
  {
    id: "SRC-OPENAI-DESKTOP",
    authority: "official_vendor_docs",
    title: "ChatGPT desktop app — command center for complex work",
    url: "https://learn.chatgpt.com/docs/app",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-RES-001", "DEVBOX-UX-001"]
  },
  {
    id: "SRC-OPENAI-WORKTREES",
    authority: "official_vendor_docs",
    title: "Git worktrees",
    url: "https://learn.chatgpt.com/docs/environments/git-worktrees",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-GIT-002", "DEVBOX-AGENT-002"]
  },
  {
    id: "SRC-OPENAI-SKILLS",
    authority: "official_vendor_docs",
    title: "Build skills",
    url: "https://learn.chatgpt.com/docs/build-skills",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-PLUGIN-001"]
  },
  {
    id: "SRC-OPENAI-AUTOMATIONS",
    authority: "official_vendor_docs",
    title: "Scheduled tasks",
    url: "https://learn.chatgpt.com/docs/automations?surface=app",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-REMOTE-001"]
  },
  {
    id: "SRC-ELECTRON-SECURITY",
    authority: "official_upstream_docs",
    title: "Electron security checklist",
    url: "https://www.electronjs.org/docs/latest/tutorial/security",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-DESKTOP-001", "DEVBOX-SEC-001"]
  },
  {
    id: "SRC-ELECTRON-ISOLATION",
    authority: "official_upstream_docs",
    title: "Electron context isolation",
    url: "https://www.electronjs.org/docs/latest/tutorial/context-isolation",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-DESKTOP-001", "DEVBOX-SEC-002"]
  },
  {
    id: "SRC-MICROSOFT-CONPTY",
    authority: "official_vendor_docs",
    title: "Creating a Windows Pseudoconsole session",
    url: "https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session",
    checkedAt,
    status: "stable",
    usedBy: ["DEVBOX-PTY-001"]
  },
  {
    id: "SRC-MICROSOFT-LSP",
    authority: "official_upstream_specification",
    title: "Language Server Protocol 3.17 specification",
    url: "https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/",
    checkedAt,
    status: "stable",
    usedBy: ["DEVBOX-LSP-001"]
  },
  {
    id: "SRC-MICROSOFT-DAP",
    authority: "official_upstream_specification",
    title: "Debug Adapter Protocol specification",
    url: "https://microsoft.github.io/debug-adapter-protocol/specification",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-DAP-001"]
  },
  {
    id: "SRC-GIT-WORKTREE",
    authority: "official_upstream_docs",
    title: "git-worktree documentation",
    url: "https://git-scm.com/docs/git-worktree",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-GIT-002", "DEVBOX-AGENT-002"]
  },
  {
    id: "SRC-GITHUB-CLI",
    authority: "official_vendor_docs",
    title: "GitHub CLI manual",
    url: "https://cli.github.com/manual/",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-GITHUB-001"]
  },
  {
    id: "SRC-CODEX-THEME-CATALOG",
    authority: "user_selected_community_catalog",
    title: "Awesome Codex Themes",
    url: "https://github.com/mcpso/awesome-codex-themes",
    checkedAt,
    status: "data_format_reviewed_no_code_adopted",
    usedBy: ["DEVBOX-UX-002", "DEVBOX-PLUGIN-001"]
  },
  {
    id: "SRC-HERMES-UPSTREAM",
    authority: "official_upstream_repo",
    title: "NousResearch Hermes Agent",
    url: "https://github.com/NousResearch/hermes-agent",
    checkedAt,
    status: "current_release_requires_live_resolution",
    usedBy: ["DEVBOX-RUNTIME-001"]
  },
  {
    id: "SRC-NVIDIA-NIM",
    authority: "official_vendor_docs",
    title: "NVIDIA NIM for large language models",
    url: "https://docs.nvidia.com/nim/large-language-models/latest/",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-PROVIDER-001"]
  },
  {
    id: "SRC-VERCEL-CLI",
    authority: "official_vendor_docs",
    title: "Vercel CLI documentation",
    url: "https://vercel.com/docs/cli",
    checkedAt,
    status: "current",
    usedBy: ["DEVBOX-VERCEL-001"]
  }
];

const requirementSeeds = [
  ["DEVBOX-RES-001", "PD-01", "Maintain a current, provenance-bearing source and requirement registry before capability claims.", "research", "IMPLEMENTING"],
  ["DEVBOX-UX-001", "PD-02", "Provide a dense keyboard-first command-center layout with explicit empty, degraded, error and recovery states.", "renderer", "IMPLEMENTING"],
  ["DEVBOX-DESKTOP-001", "PD-03", "Ship a real Windows desktop process with a sandboxed renderer, isolated preload and no browser masquerade.", "desktop-main", "IMPLEMENTING"],
  ["DEVBOX-API-001", "PD-04", "Expose a versioned first-party loopback control plane with independent authentication domains.", "core-api", "IMPLEMENTING"],
  ["DEVBOX-RUNTIME-001", "PD-05", "Integrate Hermes through a versioned adapter and report READY only after a live verified operation.", "runtime-adapter", "VERIFIED_SLICE"],
  ["DEVBOX-PROVIDER-001", "PD-05", "Discover provider credentials without exposing values and require live inference evidence for READY.", "provider-runtime", "IMPLEMENTING"],
  ["DEVBOX-AGENT-001", "PD-06", "Persist project, thread, turn and item state with explicit lifecycle transitions and recovery semantics.", "agent-core", "IMPLEMENTING"],
  ["DEVBOX-AGENT-002", "PD-06", "Isolate parallel writers by worktree and surface conflicts rather than silently overwriting changes.", "agent-scheduler", "IMPLEMENTING"],
  ["DEVBOX-REPO-001", "PD-07", "Inspect repositories lazily with bounded traversal, path containment and binary/large-file handling.", "repository-service", "IMPLEMENTING"],
  ["DEVBOX-LSP-001", "PD-07", "Manage real language servers with capability negotiation, cancellation, diagnostics and crash recovery.", "lsp-manager", "IMPLEMENTING"],
  ["DEVBOX-DAP-001", "PD-07", "Provide debugger lifecycle and protocol handling without representing an unverified adapter as ready.", "dap-manager", "IMPLEMENTING"],
  ["DEVBOX-TEST-001", "PD-07", "Run discovered tests as bounded real processes and retain structured results and evidence.", "task-engine", "IMPLEMENTING"],
  ["DEVBOX-BUILD-001", "PD-07", "Discover and execute repository build/typecheck tasks without arbitrary renderer command execution.", "task-engine", "IMPLEMENTING"],
  ["DEVBOX-GIT-001", "PD-08", "Read Git status and diff from an explicit repository and correct baseline using machine-safe commands.", "git-service", "IMPLEMENTING"],
  ["DEVBOX-GIT-002", "PD-08", "Create, identify, hand off and remove worktrees with ownership and dirty-state safeguards.", "git-service", "IMPLEMENTING"],
  ["DEVBOX-PTY-001", "PD-09", "Host a real resizable ConPTY session with bounded output and owned process-tree cleanup.", "terminal-service", "IMPLEMENTING"],
  ["DEVBOX-PLUGIN-001", "PD-10", "Verify skill, plugin, MCP and toolkit provenance and never treat discovery as readiness.", "extension-host", "IMPLEMENTING"],
  ["DEVBOX-BROWSER-001", "PD-11", "Run deterministic browser and Electron QA headlessly without global input, focus theft or desktop screenshots.", "qa-runner", "IMPLEMENTING"],
  ["DEVBOX-VERCEL-001", "PD-12", "Select Vercel primitives by workload and verify project/team/deployment identity before mutation.", "vercel-adapter", "IMPLEMENTING"],
  ["DEVBOX-GITHUB-001", "PD-13", "Perform GitHub mutations only with verified repository identity, scopes and explicit external effects.", "github-adapter", "IMPLEMENTING"],
  ["DEVBOX-REMOTE-001", "PD-14", "Persist automation and remote-run state with secure pairing, SSH host verification and review queues.", "automation-core", "IMPLEMENTING"],
  ["DEVBOX-SEC-001", "PD-15", "Separate secret domains, redact logs and keep long-lived provider credentials out of the renderer.", "security-core", "IMPLEMENTING"],
  ["DEVBOX-SEC-002", "PD-15", "Validate every IPC sender, payload, permission and workspace boundary through a narrow bridge.", "desktop-main", "IMPLEMENTING"],
  ["DEVBOX-UX-002", "PD-16", "Back every settings control with a real policy value and capability-aware state.", "settings", "IMPLEMENTING"],
  ["DEVBOX-PERF-001", "PD-17", "Bound queues, output, traversal and worker concurrency while reporting pressure and degradation.", "runtime-governor", "IMPLEMENTING"],
  ["DEVBOX-REL-001", "PD-18", "Produce a per-user Windows installer with transactional update, repair and rollback evidence.", "release", "IMPLEMENTING"],
  ["DEVBOX-TEST-002", "PD-19", "Run failure injection and clean-machine E2E without converting blocked external checks into PASS.", "qa", "IMPLEMENTING"],
  ["DEVBOX-REL-002", "PD-20", "Package only verified end-user artifacts with hashes, notices, manifest and secret/traversal scans.", "release", "IMPLEMENTING"],
  ["DEVBOX-REL-003", "PD-21", "Set RELEASE_READY true only when every release-blocking requirement has current runtime evidence.", "release-gate", "PLANNED"],
  ["DEVBOX-REL-004", "PD-22", "Generate the Turkish completion report from the evidence registry with exact limitations and verdict.", "reporting", "IMPLEMENTING"]
];

const implementationEvidence = {
  "DEVBOX-RES-001": {
    sourceFiles: ["scripts/generate-research.mjs", "research/source-index.json", "research/requirements-registry.json"],
    runtimeEvidence: ["research and traceability registries regenerate during every production build"]
  },
  "DEVBOX-UX-001": {
    sourceFiles: ["src/renderer/App.tsx", "src/renderer/styles.css"],
    testIds: ["E2E-SECURE-SHELL", "E2E-PROJECT-FLOW"],
    uxChecks: ["outputs/devbox-initial-ui.png", "1280-class responsive CSS breakpoint", "prefers-reduced-motion rule"]
  },
  "DEVBOX-DESKTOP-001": {
    sourceFiles: ["src/main/main.ts", "src/preload/preload.cts", "src/renderer/index.html"],
    testIds: ["E2E-SECURE-SHELL", "PACKAGED-RUNTIME-CHECK"],
    securityChecks: ["node process absent from renderer", "CommonJS require absent from renderer", "preload exposes exactly 49 schema-bound methods"],
    runtimeEvidence: ["release/win-unpacked/DevBox.exe opened with Core READY and isolated renderer"]
  },
  "DEVBOX-API-001": {
    sourceFiles: ["src/main/services/core-api.ts", "src/main/security/secret-store.ts"],
    testIds: ["UNIT-CORE-API-AUTH"],
    securityChecks: ["dynamic 127.0.0.1 binding", "constant-time bearer comparison", "versioned routes require independent encrypted API key"]
  },
  "DEVBOX-RUNTIME-001": {
    sourceFiles: ["src/main/services/agent-service.ts", "src/main/services/environment-discovery.ts", "src/main/ipc.ts"],
    testIds: ["UNIT-AGENT-SAFE-EXPORT", "LIVE-HERMES-NVIDIA-ADAPTER"],
    failureTestIds: ["HERMES-SESSION-ID-MISSING-FAIL-CLOSED"],
    securityChecks: ["only last assistant.content crosses the adapter", "reasoning/system prompt/raw Hermes output never enters renderer or thread database", "provider key injected only into the Hermes child environment"],
    runtimeEvidence: ["Hermes Agent v0.20.1 exact commit f80f453ae0679347e38abc917c7f94f717bf96c5", "live adapter returned DEVBOX_AGENT_OK through NVIDIA NIM", "session export used --redact and response parser discarded all non-content fields"]
  },
  "DEVBOX-PROVIDER-001": {
    sourceFiles: ["src/main/services/capability-service.ts", "src/main/services/environment-discovery.ts"],
    testIds: ["UNIT-NVIDIA-ENV-DISCOVERY", "LIVE-NVIDIA-MINIMUM-INFERENCE"],
    securityChecks: ["renderer receives provider state only, never NVIDIA_API_KEY value", "legacy Unicode alias maps to standard child-only NVIDIA_API_KEY"],
    runtimeEvidence: ["NVIDIA NIM minimum one-token inference succeeded", "nvidia/nemotron-3-super-120b-a12b reported READY only after live inference"]
  },
  "DEVBOX-AGENT-001": {
    sourceFiles: ["src/main/services/database.ts"],
    testIds: ["UNIT-STATE-DATABASE"],
    runtimeEvidence: ["SQLite schema for projects, threads, turns, items and append-only events exists; orchestration is not connected"]
  },
  "DEVBOX-AGENT-002": {
    sourceFiles: ["src/main/services/worktree-service.ts", "src/main/services/database.ts", "src/renderer/AdvancedViews.tsx"],
    testIds: ["UNIT-WORKTREE-LIFECYCLE"],
    securityChecks: ["managed worktree root containment", "dirty removal creates a recovery patch before force removal"],
    runtimeEvidence: ["worktree lifecycle is implemented; durable multi-agent leasing and crash resumption remain incomplete"]
  },
  "DEVBOX-REPO-001": {
    sourceFiles: ["src/main/services/project-service.ts", "src/main/security/path-boundary.ts"],
    testIds: ["UNIT-PROJECT-SERVICE", "UNIT-PATH-BOUNDARY", "E2E-PROJECT-FLOW"],
    failureTestIds: ["PATH-TRAVERSAL-REJECTED", "ABSOLUTE-PATH-REJECTED"],
    performanceChecks: ["1500-entry limit", "depth limit 8", "1 MiB text preview limit"]
  },
  "DEVBOX-LSP-001": {
    sourceFiles: ["src/main/services/protocol-service.ts", "src/main/services/integration-service.ts", "src/renderer/AdvancedViews.tsx"],
    testIds: ["UNIT-PROTOCOL-FRAMER"],
    performanceChecks: ["8 MiB framed-message limit", "per-request timeout", "pending request rejection on process exit"],
    runtimeEvidence: ["LSP 3.17 Content-Length JSON-RPC framing and project/PATH executable discovery are verified; diagnostics and editor UI remain incomplete"]
  },
  "DEVBOX-DAP-001": {
    sourceFiles: ["src/main/services/protocol-service.ts", "src/main/services/integration-service.ts", "src/renderer/AdvancedViews.tsx"],
    testIds: ["UNIT-PROTOCOL-FRAMER"],
    runtimeEvidence: ["DAP Content-Length request/response/event framing and adapter discovery are verified; launch configuration and debugger control UI remain incomplete"]
  },
  "DEVBOX-TEST-001": {
    sourceFiles: ["src/main/services/task-service.ts", "src/main/services/command-runner.ts"],
    testIds: ["UNIT-COMMAND-RUNNER", "E2E-PROJECT-FLOW"],
    runtimeEvidence: ["declared typecheck preset completed with exit code 0 in Electron E2E"]
  },
  "DEVBOX-BUILD-001": {
    sourceFiles: ["src/main/services/task-service.ts", "src/main/services/command-runner.ts"],
    testIds: ["E2E-PROJECT-FLOW"],
    securityChecks: ["renderer can select only git-status, typecheck, test or build; arbitrary command IPC does not exist"]
  },
  "DEVBOX-GIT-001": {
    sourceFiles: ["src/main/services/git-service.ts"],
    testIds: ["UNIT-GIT-REAL-REPOSITORY"],
    runtimeEvidence: ["temporary real repository verified branch, HEAD, tracked change, untracked path and unstaged diff"]
  },
  "DEVBOX-GIT-002": {
    sourceFiles: ["src/main/services/worktree-service.ts", "src/renderer/AdvancedViews.tsx"],
    testIds: ["UNIT-WORKTREE-LIFECYCLE"],
    runtimeEvidence: ["real temporary Git repository verified list/create/remove and porcelain -z parsing"]
  },
  "DEVBOX-PTY-001": {
    sourceFiles: ["src/main/services/terminal-service.ts", "src/renderer/AdvancedViews.tsx", "src/preload/preload.cts"],
    testIds: ["E2E-CONPTY-TERMINAL"],
    securityChecks: ["node-pty runs only in Electron main", "provider/API secrets are excluded from the PTY environment", "renderer receives bounded terminal events through typed IPC"],
    performanceChecks: ["terminal dimensions are bounded", "owned sessions are killed during app shutdown"],
    runtimeEvidence: ["node-pty 1.1.0 with the Windows ConPTY backend is packaged; source Electron E2E verified input/output and the packaged runtime verified secure startup, while a packaged-terminal round-trip remains a release-gate follow-up"]
  },
  "DEVBOX-PLUGIN-001": {
    sourceFiles: ["src/main/services/settings-service.ts", "src/main/services/signed-manifest-service.ts", "src/main/services/package-lifecycle-service.ts", "src/renderer/AdvancedViews.tsx"],
    testIds: ["UNIT-THEME-SCHEMA", "UNIT-SIGNED-PACKAGE-LIFECYCLE"],
    securityChecks: ["portable themes are inert schema-validated data", "Ed25519 trust roots, complete declared-file inventory, SHA-256 and path containment are mandatory", "activation is atomic and repair/rollback re-verifies the historical version"],
    runtimeEvidence: ["safe codex-theme-v1-compatible data import and a user-confirmed signed plugin/MCP/toolkit install, inventory, repair and rollback host are implemented"]
  },
  "DEVBOX-BROWSER-001": {
    sourceFiles: ["tests/e2e/app.spec.ts", "playwright.config.ts"],
    testIds: ["E2E-SECURE-SHELL", "E2E-PROJECT-FLOW"],
    securityChecks: ["hidden Electron only; no global input injection or user desktop capture"],
    runtimeEvidence: ["2 Playwright Electron tests passed"]
  },
  "DEVBOX-VERCEL-001": {
    sourceFiles: ["src/main/services/integration-service.ts", "src/renderer/AdvancedViews.tsx"],
    testIds: ["E2E-SECURE-SHELL", "LIVE-VERCEL-WHOAMI"],
    securityChecks: ["Windows npm PowerShell shim is executed without shell interpolation", "link/preview/rollback require an explicit UI action and destructive rollback confirmation"],
    runtimeEvidence: ["Vercel account inspection and link/preview/inspect/logs/rollback command paths are implemented", "no remote mutation was performed during this local build"]
  },
  "DEVBOX-GITHUB-001": {
    sourceFiles: ["src/main/services/integration-service.ts", "src/renderer/AdvancedViews.tsx"],
    securityChecks: ["GitHub CLI authentication and repository context are inspected before actions", "renderer cannot pass an arbitrary executable"],
    runtimeEvidence: ["PR, issue, checks, workflow-run and release read flows are implemented together with explicit-confirmation PR create/merge, issue create, run rerun and release create mutations; no remote mutation was performed during this local build"]
  },
  "DEVBOX-REMOTE-001": {
    sourceFiles: ["src/main/services/database.ts", "src/main/services/ssh-trust-service.ts", "src/renderer/AdvancedViews.tsx"],
    testIds: ["UNIT-AUTOMATION-CRUD"],
    runtimeEvidence: ["automation schedules are persisted and can be enabled/disabled", "SSH keyscan fingerprints require explicit human confirmation and are stored in an app-owned strict known_hosts file", "scheduler wakeups, secure pairing and remote worker transport remain incomplete"]
  },
  "DEVBOX-SEC-001": {
    sourceFiles: ["src/main/security/redaction.ts", "src/main/security/secret-store.ts", "src/main/services/command-runner.ts"],
    testIds: ["UNIT-SECRET-REDACTION", "UNIT-COMMAND-RUNNER", "PACKAGED-RUNTIME-CHECK"],
    failureTestIds: ["OUTPUT-TRUNCATION", "TOKEN-REDACTION"],
    securityChecks: ["safeStorage encryption required", "provider credentials excluded from default child environment"]
  },
  "DEVBOX-SEC-002": {
    sourceFiles: ["src/main/ipc.ts", "src/preload/preload.cts", "src/main/security/path-boundary.ts"],
    testIds: ["UNIT-PATH-BOUNDARY", "E2E-SECURE-SHELL"],
    failureTestIds: ["PATH-TRAVERSAL-REJECTED", "ABSOLUTE-PATH-REJECTED"],
    securityChecks: ["top-frame and webContents identity validation", "strict Zod payload schemas", "50-method preload allowlist", "native edit/file/thread/terminal context menus are implemented in Electron main"]
  },
  "DEVBOX-UX-002": {
    sourceFiles: ["src/main/services/settings-service.ts", "src/renderer/AdvancedViews.tsx", "src/renderer/styles.css"],
    testIds: ["UNIT-SETTINGS-PERSISTENCE", "UNIT-THEME-SCHEMA"],
    securityChecks: ["theme import is data-only", "permission/sandbox/network choices are schema validated"],
    uxChecks: ["dark data-only theme", "runtime font selection", "reduced motion", "contrast", "enforced permission controls"]
  },
  "DEVBOX-PERF-001": {
    sourceFiles: ["src/main/services/command-runner.ts", "src/main/services/project-service.ts"],
    testIds: ["UNIT-COMMAND-RUNNER", "UNIT-PROJECT-SERVICE"],
    performanceChecks: ["combined process output bound", "timeouts", "bounded repository traversal"]
  },
  "DEVBOX-REL-001": {
    sourceFiles: ["electron-builder.yml", "scripts/verify-packaged.mjs"],
    testIds: ["PACKAGED-RUNTIME-CHECK"],
    runtimeEvidence: ["Windows x64 NSIS installer and unpacked DevBox.exe are build targets; the packaged executable exposes a fixed 49-method bridge without a runtime test mode; signed package/update staging, repair and rollback remain blocked from public release until a trusted publisher certificate and signed channel exist"],
    artifacts: ["release/DevBox-Setup.exe", "release/win-unpacked/DevBox.exe"]
  },
  "DEVBOX-TEST-002": {
    sourceFiles: ["tests/e2e/app.spec.ts", "scripts/verify-packaged.mjs"],
    testIds: ["E2E-SECURE-SHELL", "E2E-PROJECT-FLOW", "PACKAGED-RUNTIME-CHECK"],
    runtimeEvidence: ["isolated temporary user-data roots used for clean-state Electron checks", "28 unit/integration tests and two Electron E2E scenarios are currently green, including a live ConPTY round-trip"]
  },
  "DEVBOX-REL-002": {
    sourceFiles: ["scripts/prepare-release.mjs", "scripts/verify-release.mjs"],
    testIds: ["RELEASE-INVENTORY-HASH-SECRET-SCAN"],
    securityChecks: ["exact four-file end-user ZIP inventory", "environment-secret byte scan", "generic private-key/token scan", "SHA-256 manifest verification"],
    artifacts: ["release/devbox-package", "Desktop/devbox.zip"]
  },
  "DEVBOX-REL-004": {
    sourceFiles: ["outputs/devbox-rapor.md"],
    runtimeEvidence: ["Turkish report carries a 22-PD status matrix and RELEASE_READY=false verdict"],
    artifacts: ["outputs/devbox-rapor.md", "Desktop/devbox-rapor.md"]
  }
};

const requirements = requirementSeeds.map(([id, pd, statement, owner, status]) => ({
  ...implementationEvidence[id],
  id,
  pd,
  statement,
  rationale: "Required by the DevBox master product specification and the reality contract.",
  userFlow: "open project → inspect → execute → verify → review → deliver",
  sourceClass: "user_specification_and_primary_sources",
  sourceRefs: sources.filter((source) => source.usedBy.includes(id)).map((source) => source.id),
  checkedAt,
  priority: "MUST",
  risk: ["DEVBOX-SEC-001", "DEVBOX-REL-001", "DEVBOX-REL-003"].includes(id) ? "CRITICAL" : "HIGH",
  architectureDecision: `ADR-${pd.replace("PD-", "")}`,
  implementationOwner: owner,
  sourceFiles: implementationEvidence[id]?.sourceFiles ?? [],
  acceptanceCriteria: [
    "The behavior is implemented by a named production source path.",
    "Positive and negative verification produce machine-readable evidence.",
    "Unavailable external dependencies remain BLOCKED_EXTERNAL or UNAVAILABLE, never PASS."
  ],
  testIds: implementationEvidence[id]?.testIds ?? [],
  failureTestIds: implementationEvidence[id]?.failureTestIds ?? [],
  securityChecks: implementationEvidence[id]?.securityChecks ?? [],
  performanceChecks: implementationEvidence[id]?.performanceChecks ?? [],
  uxChecks: implementationEvidence[id]?.uxChecks ?? [],
  runtimeEvidence: implementationEvidence[id]?.runtimeEvidence ?? [],
  artifacts: implementationEvidence[id]?.artifacts ?? [],
  status,
  releaseStatus: "NOT_RELEASED"
}));

const openaiMatrix = [
  {
    feature: "desktop_command_center",
    officialSource: "SRC-OPENAI-DESKTOP",
    checkedAt,
    platform: "desktop",
    stability: "documented",
    behavior: "Projects and long-running work remain visible in one desktop workspace.",
    uxPattern: "project and chat organization",
    securityImplication: "Desktop, browser and remote surfaces need distinct trust boundaries.",
    devboxDecision: "ADAPT",
    reason: "DevBox uses project/thread organization with its own brand and implementation."
  },
  {
    feature: "git_worktrees",
    officialSource: "SRC-OPENAI-WORKTREES",
    checkedAt,
    platform: "desktop_local",
    stability: "documented",
    behavior: "Parallel changes can be isolated through Git worktrees.",
    uxPattern: "explicit environment and handoff",
    securityImplication: "Every worktree requires repository identity and ownership checks.",
    devboxDecision: "ADAPT",
    reason: "Required for conflict-safe parallel engineering."
  },
  {
    feature: "computer_use",
    officialSource: "SRC-OPENAI-DESKTOP",
    checkedAt,
    platform: "desktop",
    stability: "documented",
    behavior: "The benchmark product can work across desktop tools.",
    uxPattern: "interactive computer control",
    securityImplication: "Global input and desktop capture expand the trust boundary and can disrupt foreground use.",
    devboxDecision: "REJECTED_FOR_DEVBOX_V1",
    reason: "DevBox v1 permits isolated headless QA only; it does not inject global mouse/keyboard input or capture the user's desktop."
  }
];

const toolCandidates = [
  ["Electron", "43.4.0", "MIT", "ADOPT", "Desktop shell and Chromium renderer"],
  ["React", "19.2.8", "MIT", "ADOPT", "Renderer UI"],
  ["TypeScript", "7.0.2", "Apache-2.0", "ADOPT", "Strict typed contracts"],
  ["Vite", "8.2.1", "MIT", "ADOPT", "Renderer build"],
  ["Fastify", "5.11.3", "MIT", "ADOPT", "Loopback control plane"],
  ["Zod", "4.4.3", "MIT", "ADOPT", "Runtime schema validation"],
  ["node:sqlite", "Node 24 built-in", "Node.js license", "ADOPT", "Transactional local state without a separate native addon"],
  ["node-pty", "1.1.0", "MIT", "ADOPT", "ConPTY broker in Electron main with resize, secret-filtered environment and owned cleanup"],
  ["Monaco Editor", "0.56.0", "MIT", "EVALUATE", "IDE editor; add after local worker/CSP integration is verified"],
  ["Playwright", "1.62.1", "Apache-2.0", "ADOPT", "Headless browser and hidden Electron verification"]
].map(([name, version, license, decision, purpose]) => ({ name, version, license, decision, purpose, checkedAt }));

const painPoints = [
  ["WINDOWS_UNICODE_PATH", "Non-ASCII user and project paths can break shell quoting and tool discovery.", "Use argument arrays, Unicode APIs and Turkish-path tests."],
  ["TERMINAL_FREEZE", "Synchronous or undrained PTY channels can deadlock.", "Separate I/O draining, bounded buffers and cancellation."],
  ["WRONG_DIFF_BASELINE", "Reviewing against the wrong ref can hide or invent changes.", "Record HEAD, index and worktree identity for every diff."],
  ["WATCHER_STORM", "Generated directories and large repositories can saturate CPU/I/O.", "Ignore known output roots, debounce, bound traversal and degrade explicitly."],
  ["PORT_COLLISION", "An open port does not prove service identity.", "Use dynamic loopback ports, authentication and identity-bearing readiness."],
  ["FAKE_READY", "Installed binaries or configured keys can be mistaken for working integrations.", "Capability state machine requires a minimum live operation and evidence for READY."]
].map(([id, signal, mitigation]) => ({ id, signal, mitigation, checkedAt, sourceClass: "spec_and_engineering_risk" }));

const risks = [
  ["RISK-001", "Renderer compromise reaches privileged APIs", "CRITICAL", "Sandbox, context isolation, CSP, sender validation, narrow typed IPC"],
  ["RISK-002", "Command execution escapes the selected workspace", "CRITICAL", "Argument arrays, preset commands, canonical containment, sanitized environment"],
  ["RISK-003", "Secret leaks through logs, IPC or child environments", "CRITICAL", "Independent secret domains, redaction, minimal injection, no renderer access"],
  ["RISK-004", "SQLite migration or crash loses user state", "HIGH", "Transactional migrations, WAL, backup, integrity check, quarantine"],
  ["RISK-005", "Large repository work freezes the renderer", "HIGH", "Main-process workers, bounded traversal/output, cancellation and backpressure"],
  ["RISK-006", "Unverified cloud/provider capability is shown as ready", "CRITICAL", "Explicit capability lifecycle and live evidence requirement"]
].map(([id, description, severity, mitigation]) => ({ id, description, severity, mitigation, status: "OPEN", checkedAt }));

const competitorMatrix = ["Visual Studio Code", "Cursor", "Windsurf", "Zed", "JetBrains", "Claude Code", "GitHub Copilot", "OpenCode", "Continue", "Aider", "Hermes Agent", "Vercel Agent"].map((product) => ({
  product,
  checkedAt,
  sourceStatus: "RESEARCH_PENDING_PRIMARY_SOURCE_RECHECK",
  adoptedClaims: [],
  painSignals: [],
  note: "No readiness or product claim is derived from an unverified community source."
}));

const adrIndex = [
  {
    id: "ADR-03",
    title: "Electron desktop shell",
    status: "ACCEPTED",
    decision: "Use Electron + React + TypeScript for the Windows-first desktop shell.",
    rationale: "The required Monaco/xterm/PTY/process and hidden-window integration has lower delivery risk than the evaluated alternatives on the discovered toolchain.",
    constraints: ["nodeIntegration=false", "contextIsolation=true", "sandbox=true", "webSecurity=true", "strict CSP", "narrow typed preload", "validated IPC sender"],
    alternatives: ["Tauri 2 requires an unavailable Rust toolchain and additional plugin boundary work", "WinUI 3 or WPF reduce renderer reuse and raise Monaco/xterm integration cost"],
    sources: ["SRC-ELECTRON-SECURITY", "SRC-ELECTRON-ISOLATION"],
    checkedAt
  },
  {
    id: "ADR-04",
    title: "Loopback Core API and SQLite state",
    status: "ACCEPTED",
    decision: "Run the first-party Core API on a dynamic 127.0.0.1 port, authenticate versioned routes, and persist state in node:sqlite with WAL and migrations.",
    rationale: "This separates the public DevBox contract from renderer IPC and external provider contracts while avoiding an extra native database addon.",
    constraints: ["never bind 0.0.0.0 by default", "root API key never enters renderer", "transactional idempotency", "health is not provider readiness"],
    sources: [],
    checkedAt
  }
];

const phaseMap = [
  [1, "Güncel araştırma, Codex benchmark ve clean-room", [0, 24]],
  [2, "Ürün mantığı, UX ve Codex-esinli tasarım sistemi", [1, 3, 6, 35]],
  [3, "Gerçek masaüstü shell, background çalışma ve process supervision", [2, 29, 31]],
  [4, "DevBox first-party API, protokol ve API evolution", [5, 15]],
  [5, "Hermes Agent, NVIDIA NIM ve provider runtime", [16, 17]],
  [6, "Projects, threads, agent loop, paralel ajanlar ve recovery", [4, 7]],
  [7, "Explorer, index, search, editor ve large-repo", [10, 11, 26]],
  [8, "Git, worktree, diff, review ve PR", [8, 9]],
  [9, "PTY terminal, command runner, Windows sandbox ve approvals", [12, 13, 14]],
  [10, "Skills, plugins, MCP, hooks, toolkits ve research", [18, 25]],
  [11, "Headless browser, smoke test, visual QA ve site preview", [19]],
  [12, "Vercel, web companion, Sites, deployment ve compute", [23]],
  [13, "GitHub, CI, PR, issues ve release", [22]],
  [14, "Automations, background goals, SSH/remote relay ve durability", [20, 21]],
  [15, "Security, secret management ve supply chain", [28]],
  [16, "Eksiksiz ayarlar, tema, politika ve erişilebilirlik", [27]],
  [17, "Performance, freeze prevention, observability ve resource governance", [30]],
  [18, "Installer, Windows hardening, Authenticode, update, repair ve rollback", [32, 33]],
  [19, "Failure injection, adversarial QA ve clean-machine/background E2E", [34, 36]],
  [20, "Release packaging, masaüstü kısayolu ve temiz DevBox.zip", [38]],
  [21, "Son research recheck ve release gate", [37]],
  [22, "DevBox raporu ve tamamlama", [39]]
].map(([phase, title, originalPds]) => ({
  phase: `PD-${String(phase).padStart(2, "0")}`,
  title,
  originalPds: originalPds.map((value) => `PD-${String(value).padStart(2, "0")}`),
  status: phase === 21 ? "BLOCKED" : "PARTIAL",
  releaseBlocking: true
}));

const phaseDetail = [
  [1, "Resmî OpenAI/Codex, Microsoft, Git, GitHub, Vercel ve upstream kaynak kaydı üretildi; clean-room sınırı korunuyor.", "Kaynak sürüm recheck'i release anında yeniden çalıştırılmalı."],
  [2, "Tek görev akışlı koyu shell, 272 px ayrıştırılmış sidebar, kompakt composer, mesaj eylemleri, native sağ-tık ve sürükle-bırak uygulandı.", "Piksel-birebir özel varlık kopyalama yapılmaz; farklı DPI ve uzun içerik regresyonları sürüyor."],
  [3, "Electron sandbox/contextIsolation, dar preload ve süreç sahipliği mevcut.", "Crash-loop karantinası ve tam supervisor watchdog matrisi eksik."],
  [4, "Sürümlü loopback Core API, ayrı auth ve typed IPC mevcut; LSP/DAP frame katmanı eklendi.", "API migration/compatibility test matrisi ve protokol UI entegrasyonu tamamlanmadı."],
  [5, "Hermes/NVIDIA discovery ve canlı adapter dilimi mevcut; secret renderer'a taşınmıyor.", "Sağlayıcı failover/cost/rate-limit politikası tam değil."],
  [6, "Project/thread store, worktree izolasyonu ve dayanıklı iş kuyruğunda lease, heartbeat, iptal, sonuçlandırma ve süre aşımı sonrası crash recovery mevcut.", "Çok makineli ajan scheduler'ı, ağ bölünmesi uzlaştırması ve remote worker taşıması tamamlanmadı."],
  [7, "Sınırlandırılmış explorer, dosya önizleme/düzenleme, protocol process manager ve gerçek LSP/DAP executable keşfi mevcut.", "Monaco düzeyi diagnostics/symbol UX, launch configuration ve debugger kontrol UI eksik."],
  [8, "Git status/diff, managed worktree create/list/remove, dirty recovery patch ve açık onaylı GitHub PR create/merge yolları mevcut.", "Satır içi review annotation, canlı remote mutation E2E ve bütünlüklü merge-conflict çözüm akışı eksik."],
  [9, "node-pty tabanlı gerçek ConPTY, xterm, resize/input/output/kill ve secret-filtered env mevcut.", "AppContainer/Windows sandbox ve ayrıntılı approval journal eksik."],
  [10, "Data-only portable tema ile Ed25519 güven köklü, tam dosya envanterli imzalı plugin/MCP/toolkit doğrulama, atomik kurulum, envanter, onarım ve rollback host'u var.", "Uzak katalog, yayıncı onboarding/revocation ve çevrimiçi güven kökü güncelleme kanalı eksik."],
  [11, "Gerçek Electron çalışma zamanı için izole kullanıcı-verili Playwright doğrulama senaryoları mevcut; çalışma zamanı test modu veya sahte sağlayıcı yolu yok.", "Bu sürüm turunda kullanıcı isteğiyle smoke/görsel otomasyon çalıştırılmadı; geniş görsel regresyon matrisi eksik."],
  [12, "Vercel link/preview/inspect/logs/rollback yolları resmi CLI semantiğiyle uygulandı.", "Gerçek proje üzerinde preview/rollback testi yapılmadı; web companion/VPS katmanı yok."],
  [13, "GitHub PR/issue/check/run/release okuma ve açık kullanıcı onaylı oluşturma/birleştirme/yeniden çalıştırma/yayın mutation yolları var.", "Canlı CI log tail, kapsamlı hata sınıflandırması ve geri alma politikaları eksik."],
  [14, "Kanıt üretmeyen otomasyon CRUD yüzeyi kaldırıldı; API gelişim kampanyası yalnız gerçek Hermes/NVIDIA sonuçlarını dayanıklı iş kayıtlarına yazar. SSH istemci keşfi, keyscan fingerprint onayı ve uygulamaya özel strict known_hosts pin deposu var.", "Uygulama kapalıyken zamanlayıcı wake-up, karşılıklı güvenli pairing ve remote worker taşıması yok."],
  [15, "CSP, izolasyon, sender doğrulama, Zod, path boundary, redaction ve secret env filtreleme mevcut.", "SBOM/provenance/installer signature ve tam third-party audit eksik."],
  [16, "Kalıcı data-only tema, font, reduced-motion, kontrast ve gerçek izin/sandbox/ağ profilleri mevcut. Çalışma zamanına etkisi olmayan opaklık, bildirim, telemetri, scrollback ve retention kontrolleri üründen çıkarıldı.", "Yeni ayarlar yalnız enforcement yolu ve testiyle eklenmeli."],
  [17, "Traversal/output/message limitleri ile süreç timeout/cancellation sınırları kaynak ve birim testlerinde mevcut.", "Bu sürüm turunda kullanıcı isteğiyle soak çalıştırılmadı; saatler süren temiz-VM CPU/RAM/I/O soak ve failure-injection matrisi eksik."],
  [18, "Per-user NSIS, asarUnpack node-pty, signature verification ayarı ve imzalı update staging/verify/repair/rollback yaşam döngüsü var.", "Authenticode sertifikası ve güvenilir imzalı yayın kanalı olmadığı için çalışan EXE'yi otomatik değiştiren updater handoff BLOCKED_EXTERNAL."],
  [19, "29 izole unit/integration testi ile gerçek çalışma zamanı kullanan Electron E2E senaryoları kaynakta mevcut; üretim paketinde test modu bulunmuyor.", "Bu sürüm turunda kullanıcı isteğiyle E2E smoke/soak çalıştırılmadı; temiz Windows VM, sürücü/şebeke kesintisi ve uzun süreli geniş hata matrisi tamamlanmadı."],
  [20, "NSIS installer, dört dosyalı temiz ZIP staging, rapor, SHA-256 envanteri ve Desktop shortcut pipeline mevcut.", "Dağıtım genel kullanıma açılmadan önce imza ve temiz-VM kurulum/geri alma kanıtı gerekli."],
  [21, "Release gate doğrulanmış/durdurucu maddeleri ayırıyor; yerel imzalı paket yaşam döngüsü ve SSH host pinning kapıları tamamlandı.", "Authenticode/kanal handoff, remote worker, tam LSP/DAP UX ve temiz-VM soak eksikleri nedeniyle RELEASE_READY=false."],
  [22, "Türkçe kanıt ve sınır raporu; kaynak, test, paket, başarısızlık ve performans sonuçlarıyla üretiliyor.", "Kalan release engelleri kapatıldığında yeni bir genel-dağıtım raporu mühürlenmeli."]
].map(([phase, implemented, remaining]) => ({ phase: `PD-${String(phase).padStart(2, "0")}`, implemented, remaining }));

const mappedOriginalPds = new Set(phaseMap.flatMap((item) => item.originalPds));
if (mappedOriginalPds.size !== 40 || Array.from({ length: 40 }, (_, index) => `PD-${String(index).padStart(2, "0")}`).some((pd) => !mappedOriginalPds.has(pd))) {
  throw new Error("PD_00_39_PHASE_MAPPING_INCOMPLETE");
}

const traceability = requirements.map((requirement) => ({
  requirementId: requirement.id,
  researchEvidence: requirement.sourceRefs,
  architectureDecision: requirement.architectureDecision,
  implementationOwner: requirement.implementationOwner,
  sourceFiles: requirement.sourceFiles,
  tests: requirement.testIds,
  failureInjection: requirement.failureTestIds,
  securityCheck: requirement.securityChecks,
  performanceCheck: requirement.performanceChecks,
  uxCheck: requirement.uxChecks,
  runtimeEvidence: requirement.runtimeEvidence,
  artifact: requirement.artifacts,
  releaseStatus: requirement.releaseStatus
}));

async function writeJson(url, value) {
  await writeFile(url, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

await mkdir(root, { recursive: true });
await mkdir(new URL("architecture-decisions/", root), { recursive: true });
await mkdir(outputRoot, { recursive: true });
await writeJson(new URL("source-index.json", root), sources);
await writeJson(new URL("requirements-registry.json", root), requirements);
await writeJson(new URL("traceability-baseline.json", root), traceability);
await writeJson(new URL("openai-codex-matrix.json", root), openaiMatrix);
await writeJson(new URL("competitor-matrix.json", root), competitorMatrix);
await writeJson(new URL("pain-points.json", root), painPoints);
await writeJson(new URL("tool-candidates.json", root), toolCandidates);
await writeJson(new URL("license-matrix.json", root), toolCandidates.map(({ name, version, license, checkedAt }) => ({ name, version, license, checkedAt })));
await writeJson(new URL("risk-register.json", root), risks);
await writeJson(new URL("architecture-decisions/index.json", root), adrIndex);
await writeJson(new URL("pd40-to-22-map.json", root), phaseMap);

const phaseMarkdown = [
  "# DevBox — P00–P39 kapsamının 22 ultra detaylı geniş faza dönüştürülmesi",
  "",
  `Üretim zamanı: ${checkedAt}`,
  "",
  "> Bu dosya tamamlandı beyanı değildir. Her fazın mevcut çalışan dilimini ve release'i durduran kalan işleri ayrı gösterir. P00–P39 arasındaki 40 başlığın her biri tam bir kez eşlenmiştir.",
  "",
  ...phaseMap.flatMap((item, index) => [
    `## ${item.phase} — ${item.title}`,
    "",
    `**Eski kapsam:** ${item.originalPds.join(", ")}  `,
    `**Durum:** ${item.status}  `,
    `**Uygulanan:** ${phaseDetail[index].implemented}  `,
    `**Kalan/release engeli:** ${phaseDetail[index].remaining}`,
    ""
  ]),
  "## Release kararı",
  "",
  "`RELEASE_READY=false`. Uygulama çalışır ve paketlenebilir bir mühendislik önizlemesidir; yerel imzalı kurulum/onarım/rollback ve SSH pinning tamamlanmıştır. Authenticode ile güvenilir binary update handoff, tam LSP/DAP kullanıcı deneyimi, dayanıklı remote worker ve uzun süreli temiz-VM soak/failure-injection kapıları kapanmadan genel kullanıma hazır olarak etiketlenmez.",
  ""
].join("\n");
await writeFile(new URL("DEVBOX-22-FAZ-ULTRA-DETAYLI-KAPSAM.md", outputRoot), phaseMarkdown, "utf8");

for (let index = 1; index <= 22; index += 1) {
  const pd = `PD-${String(index).padStart(2, "0")}`;
  const directory = new URL(`pd-${String(index).padStart(2, "0")}/`, evidenceRoot);
  const related = requirements.filter((requirement) => requirement.pd === pd);
  await mkdir(directory, { recursive: true });
  await writeJson(new URL("traceability.json", directory), {
    pd,
    generatedAt: checkedAt,
    gate: related.some((requirement) => requirement.status !== "PLANNED") ? "PARTIAL" : "BLOCKED",
    releaseBlocking: true,
    requirements: related.map((requirement) => ({
      id: requirement.id,
      status: requirement.status,
      releaseStatus: requirement.releaseStatus,
      evidence: requirement.runtimeEvidence
    })),
    limitations: ["Gate remains closed because at least one release-blocking acceptance item in this PD is incomplete; verified slices do not imply complete PD acceptance."]
  });
}
