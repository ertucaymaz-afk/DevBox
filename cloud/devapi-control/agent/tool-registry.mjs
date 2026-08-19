const RISK_CLASSES = new Set(["R0", "R1", "R2", "R3", "R4"]);
const STATES = new Set(["SOURCE_READY", "RUNTIME_VERIFIED", "NOT_RUN", "BLOCKED", "BLOCKED_EXTERNAL", "UNAVAILABLE", "FAILED"]);

const TOOLS = Object.freeze([
  {
    toolId: "repo.read",
    namespace: "repo",
    description: "Repository dosyasını salt-okunur inceleme politikası.",
    riskClass: "R0",
    requiresApproval: false,
    state: "SOURCE_READY",
    implementation: "repo-intelligence"
  },
  {
    toolId: "repo.search",
    namespace: "repo",
    description: "Repository içinde dosya/symbol/import araması politikası.",
    riskClass: "R0",
    requiresApproval: false,
    state: "SOURCE_READY",
    implementation: "repo-intelligence"
  },
  {
    toolId: "web.search",
    namespace: "web.search",
    description: "OpenAI Responses API web_search üzerinden primary-source-first web araştırma executor'ı. API anahtarı yoksa fail-closed BLOCKED_EXTERNAL kalır.",
    riskClass: "R0",
    requiresApproval: false,
    state: "SOURCE_READY",
    implementation: "openai-responses-web-search"
  },
  {
    toolId: "browser.inspect",
    namespace: "browser",
    description: "Tarayıcı/DOM/console/network inceleme sözleşmesi. Browser worker henüz bağlanmadı.",
    riskClass: "R1",
    requiresApproval: false,
    state: "UNAVAILABLE",
    implementation: null
  },
  {
    toolId: "shell.exec",
    namespace: "shell",
    description: "İzole sandbox içinde sınırlandırılmış shell yürütme politikası. Sandbox runtime henüz bağlanmadı.",
    riskClass: "R2",
    requiresApproval: true,
    state: "UNAVAILABLE",
    implementation: null
  },
  {
    toolId: "fs.patch",
    namespace: "repo",
    description: "Yalnız atanmış worktree içinde patch uygulama politikası. Worktree runtime henüz bağlanmadı.",
    riskClass: "R2",
    requiresApproval: true,
    state: "UNAVAILABLE",
    implementation: null
  },
  {
    toolId: "git.worktree.create",
    namespace: "git",
    description: "Task başına izole worktree oluşturma politikası. Worker runtime henüz bağlanmadı.",
    riskClass: "R2",
    requiresApproval: true,
    state: "UNAVAILABLE",
    implementation: null
  },
  {
    toolId: "deploy.production",
    namespace: "deploy",
    description: "Production promotion politikası. İnsan onayı ve doğrulanmış release evidence gerektirir.",
    riskClass: "R3",
    requiresApproval: true,
    state: "UNAVAILABLE",
    implementation: null
  },
  {
    toolId: "secret.read",
    namespace: "security",
    description: "Agent tarafından ham secret okuma yasaktır.",
    riskClass: "R4",
    requiresApproval: true,
    state: "BLOCKED",
    implementation: null
  }
]);

export function validateToolRegistry() {
  const ids = new Set();
  for (const tool of TOOLS) {
    if (!/^[a-z][a-z0-9.-]+$/u.test(tool.toolId)) throw new Error(`TOOL_ID_INVALID:${tool.toolId}`);
    if (ids.has(tool.toolId)) throw new Error(`TOOL_ID_DUPLICATE:${tool.toolId}`);
    ids.add(tool.toolId);
    if (!RISK_CLASSES.has(tool.riskClass)) throw new Error(`TOOL_RISK_INVALID:${tool.toolId}`);
    if (!STATES.has(tool.state)) throw new Error(`TOOL_STATE_INVALID:${tool.toolId}`);
    if (tool.state === "RUNTIME_VERIFIED" && !tool.implementation) throw new Error(`TOOL_RUNTIME_WITHOUT_IMPLEMENTATION:${tool.toolId}`);
    if (tool.riskClass === "R4" && tool.state !== "BLOCKED") throw new Error(`TOOL_R4_MUST_BE_BLOCKED:${tool.toolId}`);
  }
  return true;
}

export function listToolCapabilities() {
  validateToolRegistry();
  return TOOLS.map(({ implementation, ...tool }) => ({
    ...tool,
    implementation: implementation ? "SOURCE_PRESENT" : null
  }));
}

export function getToolPolicy(toolId) {
  validateToolRegistry();
  return TOOLS.find((tool) => tool.toolId === toolId) ?? null;
}
