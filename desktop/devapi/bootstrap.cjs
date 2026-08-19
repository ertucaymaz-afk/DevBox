const { app, ipcMain, safeStorage } = require('electron');
const { DevApiAgentRuntime } = require('./agent-runtime.cjs');

function trustedSender(event) {
  const senderUrl = String(event?.senderFrame?.url ?? '');
  if (!senderUrl.startsWith('devapi://desktop/')) throw new Error('DEVAPI_IPC_UNTRUSTED_SENDER');
}

const runtime = new DevApiAgentRuntime({
  app,
  ipcMain,
  safeStorage,
  dialog: require('electron').dialog
});

app.whenReady().then(() => {
  runtime.register(trustedSender);
  runtime.openDb();
}).catch(() => {
  app.exit(1);
});

require('./main.cjs');
