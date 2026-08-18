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
$mainSourceBlock = @'
  const developmentSpecSourcePath = app.isPackaged
    ? path.join(process.resourcesPath, "development", "geliştirme.md")
    : path.join(app.getAppPath(), "specs", "development", "geliştirme.md");
  const developmentSpec = new DevelopmentSpecService(database, developmentSpecPath, developmentSpecSourcePath);
'@
$mainSourceReplacement = @'
  const developmentSpec = new DevelopmentSpecService(database, developmentSpecPath);
'@
Replace-Exact $mainPath $mainSourceBlock $mainSourceReplacement 'MAIN_SPEC_SOURCE_BLOCK_MISSING'

$builderPath = 'config/electron-builder.yml'
$builderText = Get-Content -LiteralPath $builderPath -Raw
$builderUpdated = [regex]::Replace($builderText, '(?m)^\s*- from: specs/development/geliştirme\.md\r?\n\s*to: development/geliştirme\.md\r?\n?', '')
if ($builderUpdated -eq $builderText) { throw 'BUILDER_RAW_SPEC_RESOURCE_PATTERN_MISSING' }
Set-Content -LiteralPath $builderPath -Value $builderUpdated -Encoding utf8NoBOM -NoNewline

$signedBuilderPath = 'config/electron-builder.signed.cjs'
$signedBuilderText = Get-Content -LiteralPath $signedBuilderPath -Raw
$signedBuilderUpdated = [regex]::Replace($signedBuilderText, '(?m)^\s*\{ from: "specs/development/geliştirme\.md", to: "development/geliştirme\.md" \},?\r?\n?', '')
if ($signedBuilderUpdated -eq $signedBuilderText) { throw 'SIGNED_BUILDER_RAW_SPEC_RESOURCE_PATTERN_MISSING' }
Set-Content -LiteralPath $signedBuilderPath -Value $signedBuilderUpdated -Encoding utf8NoBOM -NoNewline

$revocationPath = 'src/main/services/revocation-list-service.ts'
Replace-Exact $revocationPath '  public async assertAllowed(packageId: string, version: string, publisherKeyId: string): Promise<void> {' '  public async assertAllowed(packageId: string, version: string, publisherKeyId: string, now = new Date()): Promise<void> {' 'REVOCATION_SIGNATURE_PATTERN_MISSING'
Replace-Exact $revocationPath '    assertCurrent(state.list, new Date());' '    assertCurrent(state.list, now);' 'REVOCATION_CURRENT_TIME_PATTERN_MISSING'

$revocationTestPath = 'src/main/services/revocation-list-service.test.ts'
Replace-Exact $revocationTestPath '    await expect(service.assertAllowed("dangerous.plugin", "2.0.0", "publisher.bad")).rejects.toThrow("PACKAGE_REVOKED:MALWARE");' '    await expect(service.assertAllowed("dangerous.plugin", "2.0.0", "publisher.bad", new Date("2026-08-14T02:00:00.000Z"))).rejects.toThrow("PACKAGE_REVOKED:MALWARE");' 'REVOCATION_TEST_REVOKED_PATTERN_MISSING'
Replace-Exact $revocationTestPath '    await expect(service.assertAllowed("safe.plugin", "2.0.0", "publisher.good")).resolves.toBeUndefined();' '    await expect(service.assertAllowed("safe.plugin", "2.0.0", "publisher.good", new Date("2026-08-14T02:00:00.000Z"))).resolves.toBeUndefined();' 'REVOCATION_TEST_SAFE_PATTERN_MISSING'

Write-Host "DEVBOX_V017_TYPE_HOTFIX_APPLIED cancellationSites=$($matches.Count) dapTypes=4 sourceIdentity=pinned revocationClock=deterministic"
