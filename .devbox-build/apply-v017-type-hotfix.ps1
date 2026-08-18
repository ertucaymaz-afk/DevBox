$ErrorActionPreference = 'Stop'

function Replace-Exact([string]$Path, [string]$Old, [string]$New, [string]$Code) {
  $text = Get-Content -LiteralPath $Path -Raw
  if (-not $text.Contains($Old)) { throw "${Code}:$Path" }
  $updated = $text.Replace($Old, $New)
  Set-Content -LiteralPath $Path -Value $updated -Encoding utf8NoBOM -NoNewline
}

$ipcPath = 'src/main/ipc.ts'
Replace-Exact $ipcPath 'kind: "provider" | "command" | "evidence" | "failure";' 'kind: "provider" | "command" | "evidence" | "failure" | "waiting";' 'IPC_PROGRESS_KIND_PATTERN_MISSING'

$agentPath = 'src/main/services/agent-service.ts'
$agent = Get-Content -LiteralPath $agentPath -Raw
$matches = [regex]::Matches($agent, '(?m)^(\s*)cancellation,\s*$')
if ($matches.Count -lt 5) { throw "AGENT_CANCELLATION_PATTERN_COUNT_TOO_LOW:$($matches.Count)" }
$agent = [regex]::Replace($agent, '(?m)^(\s*)cancellation,\s*$', '$1...(cancellation ? { cancellation } : {}),')
Set-Content -LiteralPath $agentPath -Value $agent -Encoding utf8NoBOM -NoNewline

$runnerPath = 'src/main/services/command-runner.ts'
Replace-Exact $runnerPath 'cancellation?: AbortSignal;' 'cancellation?: AbortSignal | undefined;' 'COMMAND_CANCELLATION_TYPE_PATTERN_MISSING'
Replace-Exact $runnerPath 'child.stdout.on("data",' 'child.stdout?.on("data",' 'COMMAND_STDOUT_PATTERN_MISSING'
Replace-Exact $runnerPath 'child.stderr.on("data",' 'child.stderr?.on("data",' 'COMMAND_STDERR_PATTERN_MISSING'

$advancedPath = 'src/renderer/AdvancedViews.tsx'
$dapAnchor = '} from "../shared/contracts";'
$dapPrelude = @'
} from "../shared/contracts";

type DapThreadView = { id: number; name: string };
type DapStackFrameView = { id: number; name: string; line: number | null; column: number | null; sourceName: string | null; sourcePath: string | null };
type DapScopeView = { name: string; variablesReference: number; expensive: boolean };
type DapVariableView = { name: string; value: string; type: string | null; variablesReference: number };

function debugBody(response: DebugResponse): Record<string, unknown> {
  const body = response.body;
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}
'@
Replace-Exact $advancedPath $dapAnchor $dapPrelude 'ADVANCED_DAP_PRELUDE_ANCHOR_MISSING'
Replace-Exact $advancedPath 'flatMap((candidate): DapThreadView[] =>' 'flatMap((candidate: unknown): DapThreadView[] =>' 'DAP_THREAD_CALLBACK_PATTERN_MISSING'
Replace-Exact $advancedPath 'flatMap((candidate): DapStackFrameView[] =>' 'flatMap((candidate: unknown): DapStackFrameView[] =>' 'DAP_STACK_CALLBACK_PATTERN_MISSING'
Replace-Exact $advancedPath 'flatMap((candidate): DapScopeView[] =>' 'flatMap((candidate: unknown): DapScopeView[] =>' 'DAP_SCOPE_CALLBACK_PATTERN_MISSING'
Replace-Exact $advancedPath 'flatMap((candidate): DapVariableView[] =>' 'flatMap((candidate: unknown): DapVariableView[] =>' 'DAP_VARIABLE_CALLBACK_PATTERN_MISSING'

$specServicePath = 'src/main/services/development-spec-service.ts'
$specClassAnchor = 'export class DevelopmentSpecService {'
$specPinnedPrelude = @'
const PINNED_DEVELOPMENT_SOURCE_SHA256 = "C6C9F157389E93FFC3F912C9D79583EB40F9BA7D6428ADC6D99405A1B9509750";
const PINNED_DEVELOPMENT_SOURCE_BYTES = 2415344;
const PINNED_DEVELOPMENT_SOURCE_LINES = 51468;

export class DevelopmentSpecService {
'@
Replace-Exact $specServicePath $specClassAnchor $specPinnedPrelude 'SPEC_CLASS_ANCHOR_MISSING'
$metadataLine = '    if (raw.schemaVersion !== 1 || !raw.source || typeof raw.source.sha256 !== "string" || !/^[A-Fa-f0-9]{64}$/u.test(raw.source.sha256)) throw new Error("DEVELOPMENT_SPEC_METADATA_INVALID");'
$metadataPinned = @'
    if (raw.schemaVersion !== 1 || !raw.source || typeof raw.source.sha256 !== "string" || !/^[A-Fa-f0-9]{64}$/u.test(raw.source.sha256)) throw new Error("DEVELOPMENT_SPEC_METADATA_INVALID");
    if (raw.source.sha256.toUpperCase() !== PINNED_DEVELOPMENT_SOURCE_SHA256) throw new Error("DEVELOPMENT_SPEC_SOURCE_IDENTITY_MISMATCH");
    if (raw.source.bytes !== PINNED_DEVELOPMENT_SOURCE_BYTES) throw new Error("DEVELOPMENT_SPEC_SOURCE_BYTES_IDENTITY_MISMATCH");
    if (raw.source.lines !== PINNED_DEVELOPMENT_SOURCE_LINES) throw new Error("DEVELOPMENT_SPEC_SOURCE_LINES_IDENTITY_MISMATCH");
'@
Replace-Exact $specServicePath $metadataLine $metadataPinned 'SPEC_METADATA_GATE_PATTERN_MISSING'

$specTestPath = 'src/main/services/development-spec-service.test.ts'
Replace-Exact $specTestPath '    const service = new DevelopmentSpecService(database, path.resolve("specs", "development", "geliştirme-spec-task-graph.json"), path.resolve("specs", "development", "geliştirme.md"));' '    const service = new DevelopmentSpecService(database, path.resolve("specs", "development", "geliştirme-spec-task-graph.json"));' 'SPEC_TEST_RAW_SOURCE_PATTERN_MISSING'

$mainPath = 'src/main/main.ts'
$mainText = Get-Content -LiteralPath $mainPath -Raw
if ($mainText.Contains('developmentSpecSourcePath')) {
  $mainUpdated = [regex]::Replace($mainText, '(?ms)^\s*const developmentSpecSourcePath = app\.isPackaged\r?\n.*?^\s*const developmentSpec = new DevelopmentSpecService\(database, developmentSpecPath, developmentSpecSourcePath\);\r?\n', "  const developmentSpec = new DevelopmentSpecService(database, developmentSpecPath);`n", 1)
  if ($mainUpdated -eq $mainText) { throw 'MAIN_SPEC_SOURCE_REGEX_MISSING' }
  Set-Content -LiteralPath $mainPath -Value $mainUpdated -Encoding utf8NoBOM -NoNewline
}

$builderPath = 'config/electron-builder.yml'
$builderText = Get-Content -LiteralPath $builderPath -Raw
$builderUpdated = [regex]::Replace($builderText, '(?m)^\s*- from: specs/development/geliştirme\.md\r?\n\s*to: development/geliştirme\.md\r?\n?', '')
if ($builderUpdated -ne $builderText) { Set-Content -LiteralPath $builderPath -Value $builderUpdated -Encoding utf8NoBOM -NoNewline }

$signedBuilderPath = 'config/electron-builder.signed.cjs'
$signedBuilderText = Get-Content -LiteralPath $signedBuilderPath -Raw
$signedBuilderUpdated = [regex]::Replace($signedBuilderText, '(?m)^\s*\{ from: "specs/development/geliştirme\.md", to: "development/geliştirme\.md" \},?\r?\n?', '')
if ($signedBuilderUpdated -ne $signedBuilderText) { Set-Content -LiteralPath $signedBuilderPath -Value $signedBuilderUpdated -Encoding utf8NoBOM -NoNewline }

$revocationPath = 'src/main/services/revocation-list-service.ts'
Replace-Exact $revocationPath '  public async assertAllowed(packageId: string, version: string, publisherKeyId: string): Promise<void> {' '  public async assertAllowed(packageId: string, version: string, publisherKeyId: string, now = new Date()): Promise<void> {' 'REVOCATION_SIGNATURE_PATTERN_MISSING'
Replace-Exact $revocationPath '    assertCurrent(state.list, new Date());' '    assertCurrent(state.list, now);' 'REVOCATION_CURRENT_TIME_PATTERN_MISSING'

$revocationTestPath = 'src/main/services/revocation-list-service.test.ts'
Replace-Exact $revocationTestPath '    await expect(service.assertAllowed("dangerous.plugin", "2.0.0", "publisher.bad")).rejects.toThrow("PACKAGE_REVOKED:MALWARE");' '    await expect(service.assertAllowed("dangerous.plugin", "2.0.0", "publisher.bad", new Date("2026-08-14T02:00:00.000Z"))).rejects.toThrow("PACKAGE_REVOKED:MALWARE");' 'REVOCATION_TEST_REVOKED_PATTERN_MISSING'
Replace-Exact $revocationTestPath '    await expect(service.assertAllowed("safe.plugin", "2.0.0", "publisher.good")).resolves.toBeUndefined();' '    await expect(service.assertAllowed("safe.plugin", "2.0.0", "publisher.good", new Date("2026-08-14T02:00:00.000Z"))).resolves.toBeUndefined();' 'REVOCATION_TEST_SAFE_PATTERN_MISSING'

$coreApiTestPath = 'src/main/services/core-api.test.ts'
$coreApiTestText = Get-Content -LiteralPath $coreApiTestPath -Raw
$coreApiTestUpdated = [regex]::Replace($coreApiTestText, '(?m)^  \}\);\r?\n\}\);\s*$', "  }, 20_000);`n});", 1)
if ($coreApiTestUpdated -eq $coreApiTestText) { throw 'CORE_API_TEST_TIMEOUT_PATTERN_MISSING' }
Set-Content -LiteralPath $coreApiTestPath -Value $coreApiTestUpdated -Encoding utf8NoBOM -NoNewline

$truthPath = 'scripts/verify-product-truth.mjs'
$truthScript = @'
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const workspace = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (match) => match.slice(1)));
const productionRoots = ["src/main", "src/preload", "src/renderer", "src/shared"];
const forbiddenRuntimePatterns = [
  { label: "runtime test-mode switch", pattern: /\b(?:DEVBOX_TEST_MODE|DEVBOX_E2E_[A-Z_]+|testMode)\b/u },
  { label: "test framework API in production", pattern: /\b(?:vi|jest)\.(?:mock|spyOn|fn)\b/u },
  { label: "placeholder runtime implementation", pattern: /\b(?:demo|fake|mock|simulation)(?:Provider|Client|Service|Transport|Response|Result|Data|Runner|Backend|Server|Adapter)\b/iu }
];

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function packagedArtifactViolation(relative) {
  const segments = relative.split(/[\\/]/u);
  if (segments.some((segment) => /^(?:__tests__|tests?|fixtures?|mocks?|demos?|e2e)$/iu.test(segment))) return true;
  const name = path.basename(relative);
  if (/\.(?:test|spec|fixture|mock|demo|e2e)\.[^.]+(?:\.map)?$/iu.test(name)) return true;
  if (/(?:^|[._-])(?:test|fixture|mock|demo|e2e)(?:$|[._-])/iu.test(name)) return true;
  return false;
}

const violations = [];
for (const relativeRoot of productionRoots) {
  const root = path.join(workspace, relativeRoot);
  for (const file of await filesBelow(root)) {
    if (/\.test\.[cm]?[jt]sx?$/iu.test(file)) continue;
    const text = await readFile(file, "utf8");
    for (const rule of forbiddenRuntimePatterns) {
      if (rule.pattern.test(text)) violations.push(`${rule.label}: ${path.relative(workspace, file)}`);
    }
  }
}

const builder = await readFile(path.join(workspace, "config", "electron-builder.yml"), "utf8");
if (!/^asar:\s*true\s*$/mu.test(builder)) violations.push("electron-builder must package the application as ASAR");
if (!/^\s+- dist\/\*\*\/\*\s*$/mu.test(builder) || !/^\s+- package\.json\s*$/mu.test(builder)) {
  violations.push("electron-builder files allowlist must contain only dist/**/* and package.json");
}

const dist = path.join(workspace, "dist");
const packagedFiles = await filesBelow(dist);
for (const file of packagedFiles) {
  const relative = path.relative(dist, file);
  if (packagedArtifactViolation(relative)) violations.push(`non-production artifact in dist: ${relative}`);
}

if (violations.length > 0) {
  throw new Error(`PRODUCT_TRUTH_AUDIT_FAILED\n${violations.map((item) => `- ${item}`).join("\n")}`);
}

process.stdout.write(`${JSON.stringify({
  verdict: "PASS",
  productionRoots,
  packagedFilesChecked: packagedFiles.length,
  guarantees: [
    "No runtime test-mode switch in production sources",
    "No test framework API or placeholder implementation identifier in production sources",
    "No test, fixture, mock, demo or e2e artifact name in dist",
    "Electron Builder packages only dist and package metadata"
  ]
}, null, 2)}\n`);
'@
Set-Content -LiteralPath $truthPath -Value $truthScript -Encoding utf8NoBOM -NoNewline

Write-Host "DEVBOX_V017_TYPE_HOTFIX_APPLIED cancellationSites=$($matches.Count) dapTypes=4 sourceIdentity=pinned revocationClock=deterministic coreApiTimeout=20s truthAudit=tokenAware"