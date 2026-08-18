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

Write-Host "DEVBOX_V017_TYPE_HOTFIX_APPLIED cancellationSites=$($matches.Count) dapTypes=4"
