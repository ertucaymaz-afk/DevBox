const { app, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DevApiAgentRuntime } = require('./agent-runtime.cjs');
const { runLocalSelfTest } = require('./self-test.cjs');

function trustedSender(event) {
  const senderUrl = String(event?.senderFrame?.url ?? '');
  if (!senderUrl.startsWith('devapi://desktop/')) throw new Error('DEVAPI_IPC_UNTRUSTED_SENDER');
}
function safeError(error) {
  return String(error?.message ?? error ?? 'UNKNOWN').replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED]');
}

const runtime = new DevApiAgentRuntime({ app, ipcMain, safeStorage, dialog: require('electron').dialog });

app.whenReady().then(async () => {
  runtime.register(trustedSender);
  runtime.openDb();
  const smokePath = process.env.DEVAPI_AGENT_SMOKE_OUTPUT;
  if (smokePath) {
    const health = runtime.runtimeHealth();
    let selfTest;
    try { selfTest = await runLocalSelfTest(runtime); }
    catch (error) { selfTest = { state: 'FAILED', checks: [{ id: 'uncaught-selftest', state: 'FAILED', detail: safeError(error) }], checkedAt: new Date().toISOString() }; }
    const state = health.state === 'HEALTHY' && selfTest.state === 'RUNTIME_VERIFIED' ? 'AGENT_LOCAL_RUNTIME_VERIFIED' : 'FAILED';
    fs.mkdirSync(path.dirname(smokePath), { recursive: true });
    fs.writeFileSync(smokePath, JSON.stringify({ schemaVersion: 3, state, health, selfTest }, null, 2), 'utf8');
  }
}).catch((error) => {
  try {
    const smokePath = process.env.DEVAPI_AGENT_SMOKE_OUTPUT;
    if (smokePath) {
      fs.mkdirSync(path.dirname(smokePath), { recursive: true });
      fs.writeFileSync(smokePath, JSON.stringify({ schemaVersion: 3, state: 'FAILED', bootstrapError: safeError(error), checkedAt: new Date().toISOString() }, null, 2), 'utf8');
    }
  } catch {}
  app.exit(1);
});

require('./main.cjs');
