const { app, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DevApiAgentRuntime } = require('./agent-runtime.cjs');

function trustedSender(event) {
  const senderUrl = String(event?.senderFrame?.url ?? '');
  if (!senderUrl.startsWith('devapi://desktop/')) throw new Error('DEVAPI_IPC_UNTRUSTED_SENDER');
}

const runtime = new DevApiAgentRuntime({ app, ipcMain, safeStorage, dialog: require('electron').dialog });

app.whenReady().then(async () => {
  runtime.register(trustedSender);
  runtime.openDb();
  const smokePath = process.env.DEVAPI_AGENT_SMOKE_OUTPUT;
  if (smokePath) {
    const health = runtime.runtimeHealth();
    const selfTest = await runtime.selfTest();
    const state = health.state === 'HEALTHY' && selfTest.state === 'RUNTIME_VERIFIED' ? 'AGENT_LOCAL_RUNTIME_VERIFIED' : 'FAILED';
    fs.mkdirSync(path.dirname(smokePath), { recursive: true });
    fs.writeFileSync(smokePath, JSON.stringify({ schemaVersion: 2, state, health, selfTest }, null, 2), 'utf8');
  }
}).catch(() => { app.exit(1); });

require('./main.cjs');
