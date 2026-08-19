import { readFile, writeFile } from "node:fs/promises";

const scriptFile = "scripts/bootstrap-v020-production-secrets.ps1";
const workflowFile = ".github/workflows/v020-bootstrap-verify.yml";
let source = (await readFile(scriptFile, "utf8")).replace(/\r\n/gu, "\n");
let workflow = (await readFile(workflowFile, "utf8")).replace(/\r\n/gu, "\n");

function replaceOnce(input, before, after, code) {
  const first = input.indexOf(before);
  const last = input.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`${code}: expected exactly one anchor`);
  return input.slice(0, first) + after + input.slice(first + before.length);
}

source = replaceOnce(
  source,
  `  [string]$ControlPlaneUrl = 'https://devapi-virid.vercel.app',\n  [SecureString]$VercelToken,`,
  `  [string]$ControlPlaneUrl = 'https://devapi-virid.vercel.app',\n  [string]$VercelTeamId = 'team_PNUxk74M7XR8MFlKl676ZHlv',\n  [string]$DevApiProjectId = 'prj_mJCrN5G6w4R32axSWYSLSuuAdmBz',\n  [SecureString]$VercelToken,`,
  "BOOTSTRAP_VERCEL_SCOPE_PARAMS"
);

source = replaceOnce(
  source,
  `function Invoke-Gh([string[]]$Arguments, [switch]$Capture) {`,
  `function Assert-VercelProjectAccess([string]$Token) {\n  if ([string]::IsNullOrWhiteSpace($Token)) { throw 'VERCEL_TOKEN_INVALID_OR_EMPTY' }\n  $project = $null\n  $encodedProject = [Uri]::EscapeDataString($DevApiProjectId)\n  $encodedTeam = [Uri]::EscapeDataString($VercelTeamId)\n  try {\n    $project = Invoke-RestMethod -Method Get -Uri \"https://api.vercel.com/v9/projects/\${encodedProject}?teamId=\${encodedTeam}\" -Headers @{ Authorization = \"Bearer $Token\" } -TimeoutSec 15 -ErrorAction Stop\n  } catch {\n    throw 'VERCEL_TOKEN_PROJECT_ACCESS_FAILED'\n  }\n  if ([string]$project.id -ne $DevApiProjectId) { throw 'VERCEL_PROJECT_SCOPE_MISMATCH' }\n  Write-Host \"VERCEL_PREFLIGHT_PASS project=$DevApiProjectId team=$VercelTeamId token=masked\"\n}\n\nfunction Assert-PostgresConnectionUri([string]$Value) {\n  $uri = $null\n  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) { throw 'DATABASE_URL_INVALID' }\n  if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw 'DATABASE_URL_MUST_BE_POSTGRESQL' }\n  if ([string]::IsNullOrWhiteSpace($uri.Host)) { throw 'DATABASE_URL_HOST_MISSING' }\n  if ([string]::IsNullOrWhiteSpace($uri.UserInfo)) { throw 'DATABASE_URL_CREDENTIALS_MISSING' }\n  Write-Host \"DATABASE_PREFLIGHT_PASS scheme=$($uri.Scheme) host=masked credentials=masked\"\n}\n\nfunction Invoke-Gh([string[]]$Arguments, [switch]$Capture) {`,
  "BOOTSTRAP_PREFLIGHT_FUNCTIONS"
);

source = replaceOnce(
  source,
  `if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'REPOSITORY_FORMAT_INVALID' }\nif ($Ref -notmatch '^[A-Za-z0-9._/-]+$') { throw 'REF_FORMAT_INVALID' }`,
  `if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'REPOSITORY_FORMAT_INVALID' }\nif ($Ref -notmatch '^[A-Za-z0-9._/-]+$') { throw 'REF_FORMAT_INVALID' }\nif ($VercelTeamId -notmatch '^team_[A-Za-z0-9]+$') { throw 'VERCEL_TEAM_ID_INVALID' }\nif ($DevApiProjectId -notmatch '^prj_[A-Za-z0-9]+$') { throw 'DEVAPI_PROJECT_ID_INVALID' }`,
  "BOOTSTRAP_ID_VALIDATION"
);

source = replaceOnce(
  source,
  `Invoke-Gh -Arguments @('auth', 'status', '--hostname', 'github.com')\nInvoke-Gh -Arguments @('repo', 'view', $Repository, '--json', 'nameWithOwner') | Out-Null\n`,
  `Invoke-Gh -Arguments @('auth', 'status', '--hostname', 'github.com')\nInvoke-Gh -Arguments @('repo', 'view', $Repository, '--json', 'nameWithOwner') | Out-Null\nInvoke-Gh -Arguments @('api', \"repos/$Repository/git/ref/heads/$Ref\", '--jq', '.ref') | Out-Null\nInvoke-Gh -Arguments @('workflow', 'view', 'v020-production-promote.yml', '--repo', $Repository) | Out-Null\nWrite-Host \"RELEASE_TARGET_PREFLIGHT_PASS ref=$Ref workflow=v020-production-promote.yml\"\n`,
  "BOOTSTRAP_RELEASE_TARGET_PREFLIGHT"
);

source = replaceOnce(
  source,
  `if ($vercelPlain.Length -lt 8) { throw 'VERCEL_TOKEN_INVALID_OR_EMPTY' }\nif ($databasePlain -notmatch '^postgres(?:ql)?://') { throw 'DATABASE_URL_MUST_BE_POSTGRESQL' }\n\n$controlPlaneToken = New-UrlSafeSecret 48`,
  `if ($vercelPlain.Length -lt 8) { throw 'VERCEL_TOKEN_INVALID_OR_EMPTY' }\nAssert-PostgresConnectionUri $databasePlain\nAssert-VercelProjectAccess $vercelPlain\n\n$controlPlaneToken = New-UrlSafeSecret 48`,
  "BOOTSTRAP_CREDENTIAL_PREFLIGHT_CALLS"
);

workflow = replaceOnce(
  workflow,
  `          if (-not $source.Contains('value=masked')) { throw 'V020_BOOTSTRAP_MASKED_EVIDENCE_MISSING' }\n          Write-Host 'V020_BOOTSTRAP_SECRET_GUARD_PASS values=not-embedded stdin=true'`,
  `          if (-not $source.Contains('value=masked')) { throw 'V020_BOOTSTRAP_MASKED_EVIDENCE_MISSING' }\n          foreach ($required in @(\n            'Assert-VercelProjectAccess',\n            'https://api.vercel.com/v9/projects/',\n            'VERCEL_PREFLIGHT_PASS',\n            'Assert-PostgresConnectionUri',\n            'DATABASE_PREFLIGHT_PASS',\n            'git/ref/heads/$Ref',\n            \"workflow', 'view', 'v020-production-promote.yml\",\n            'RELEASE_TARGET_PREFLIGHT_PASS'\n          )) {\n            if (-not $source.Contains($required)) { throw \"V020_BOOTSTRAP_PREFLIGHT_MISSING:$required\" }\n          }\n          foreach ($forbidden in @('Write-Host $Token','Write-Output $Token','Write-Host $databasePlain')) {\n            if ($source.Contains($forbidden)) { throw \"V020_BOOTSTRAP_PREFLIGHT_LEAK_PATTERN:$forbidden\" }\n          }\n          Write-Host 'V020_BOOTSTRAP_SECRET_GUARD_PASS values=not-embedded stdin=true preflight=release-target+vercel+database-uri'`,
  "BOOTSTRAP_VERIFY_PREFLIGHT_GUARD"
);

for (const required of [
  "Assert-VercelProjectAccess",
  "VERCEL_PREFLIGHT_PASS",
  "Assert-PostgresConnectionUri",
  "DATABASE_PREFLIGHT_PASS",
  "RELEASE_TARGET_PREFLIGHT_PASS",
  "v020-production-promote.yml"
]) {
  if (!source.includes(required) && !workflow.includes(required)) throw new Error(`BOOTSTRAP_PREFLIGHT_REQUIRED_MISSING:${required}`);
}

await writeFile(scriptFile, source, "utf8");
await writeFile(workflowFile, workflow, "utf8");
console.log("V020_BOOTSTRAP_PREFLIGHT_PATCH_PASS");
