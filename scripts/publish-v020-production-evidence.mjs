import { readFile, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN?.trim() || "";
const repository = process.env.GITHUB_REPOSITORY?.trim() || "";
const branch = process.env.GITHUB_REF_NAME?.trim() || "";
const expectedHead = process.env.GITHUB_SHA?.trim() || "";
const eventName = process.env.GITHUB_EVENT_NAME?.trim() || "";
const githubOutput = process.env.GITHUB_OUTPUT?.trim() || "";

function fail(code, detail = "") { throw new Error(`V020_EVIDENCE_PUBLISH_FAIL:${code}${detail ? `:${String(detail).slice(0, 400)}` : ""}`); }
if (token.length < 20) fail("TOKEN_MISSING");
if (repository !== "ertucaymaz-afk/DevBox") fail("REPOSITORY", repository);
if (branch !== "codex/v0.1.20-vercel-production-modernization") fail("BRANCH", branch);
if (!/^[a-f0-9]{40}$/u.test(expectedHead)) fail("EXPECTED_HEAD", expectedHead);
if (eventName === "pull_request" || eventName === "pull_request_target") fail("PULL_REQUEST_PUBLISH_FORBIDDEN");

const [owner, repo] = repository.split("/");
const apiRoot = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
const headers = {
  authorization: `Bearer ${token}`,
  accept: "application/vnd.github+json",
  "content-type": "application/json",
  "user-agent": "DevBox-v0.1.20-evidence-publisher",
  "x-github-api-version": "2022-11-28"
};

async function github(pathname, { method = "GET", body } = {}) {
  const response = await fetch(`${apiRoot}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { fail("GITHUB_JSON", `${method}:${pathname}:${response.status}`); }
  }
  if (!response.ok) fail("GITHUB_HTTP", `${method}:${pathname}:${response.status}:${data?.message ?? "unknown"}`);
  return data;
}
function branchPath(value) { return value.split("/").map(encodeURIComponent).join("/"); }

const ref = await github(`/git/ref/heads/${branchPath(branch)}`);
const remoteHead = String(ref?.object?.sha ?? "");
if (remoteHead !== expectedHead) fail("HEAD_DRIFT", `${remoteHead || "missing"}!=${expectedHead}`);
const parent = await github(`/git/commits/${expectedHead}`);
const baseTree = String(parent?.tree?.sha ?? "");
if (!/^[a-f0-9]{40}$/u.test(baseTree)) fail("BASE_TREE", baseTree);

const paths = ["cloud/production-evidence.json", "cloud/product-links.json"];
const treeEntries = [];
for (const path of paths) {
  const content = await readFile(path, "utf8");
  JSON.parse(content);
  const blob = await github("/git/blobs", { method: "POST", body: { content, encoding: "utf-8" } });
  const sha = String(blob?.sha ?? "");
  if (!/^[a-f0-9]{40}$/u.test(sha)) fail("BLOB_SHA", path);
  treeEntries.push({ path, mode: "100644", type: "blob", sha });
}

const tree = await github("/git/trees", { method: "POST", body: { base_tree: baseTree, tree: treeEntries } });
const treeSha = String(tree?.sha ?? "");
if (!/^[a-f0-9]{40}$/u.test(treeSha)) fail("TREE_SHA", treeSha);
const commit = await github("/git/commits", {
  method: "POST",
  body: {
    message: "chore(release): record verified v0.1.20 production evidence",
    tree: treeSha,
    parents: [expectedHead]
  }
});
const commitSha = String(commit?.sha ?? "");
if (!/^[a-f0-9]{40}$/u.test(commitSha)) fail("COMMIT_SHA", commitSha);

await github(`/git/refs/heads/${branchPath(branch)}`, { method: "PATCH", body: { sha: commitSha, force: false } });
if (githubOutput) await writeFile(githubOutput, `evidence_commit_sha=${commitSha}\n`, { flag: "a" });
console.log(`V020_EVIDENCE_PUBLISH_PASS branch=${branch} parent=${expectedHead} commit=${commitSha} files=2 atomic=true force=false secrets=0`);
