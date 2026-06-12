import { config } from './config.js';
import { ensureStorage, readSettings } from './fs-store.js';
import { createApiServer } from './api.js';
import { startProxy } from './proxy.js';
import { getLanUrls } from './urls.js';
import { enqueueMissingCodexNotes } from './codex-notes.js';
import { attachTerminalServer, stopTerminalSessions } from './terminal-session.js';
import { cleanupRuntimeCaches } from './cache-cleanup.js';

let uiRuntime;
let proxyRuntime;
let runtimeOptions = {};

export async function startRuntime(options = {}) {
  const { proxy = true } = options;
  runtimeOptions = options;
  await startUiRuntime();
  if (proxy) {
    await startProxyRuntime();
  }
  return runtimeStatus();
}

export async function startUiRuntime() {
  if (uiRuntime) return uiRuntime;

  await ensureStorage();
  cleanupRuntimeCaches().catch((error) => {
    console.warn('Failed to cleanup runtime caches:', error.message);
  });

  const app = createApiServer({
    getRuntimeStatus: runtimeStatus,
    startProxyRuntime,
    stopProxyRuntime,
    selectProjectDirectory: runtimeOptions.selectProjectDirectory
  });
  const uiServer = await listenUi(app);
  attachTerminalServer(uiServer);
  trackServerSockets(uiServer);

  uiRuntime = {
    uiServer,
    uiUrl: `http://127.0.0.1:${config.uiPort}`,
    uiPort: config.uiPort
  };
  const settings = await readSettings();
  if (settings.aiNotesEnabled !== false && settings.aiProvider !== 'none' && settings.showListNotes !== false) {
    enqueueMissingCodexNotes().catch((error) => {
      console.error('Failed to enqueue missing Codex notes:', error.message);
    });
  }

  return uiRuntime;
}

export async function startProxyRuntime() {
  if (proxyRuntime) return proxyRuntime;

  await ensureStorage();

  const proxy = await startProxy();
  proxyRuntime = {
    proxy,
    proxyPort: config.proxyPort
  };

  return proxyRuntime;
}

export async function stopRuntime() {
  const currentUi = uiRuntime;
  const currentProxy = proxyRuntime;
  uiRuntime = null;
  proxyRuntime = null;

  await stopTerminalSessions();
  await Promise.allSettled([
    closeServer(currentUi?.uiServer),
    closeProxy(currentProxy?.proxy)
  ]);
}

export async function stopUiRuntime() {
  const current = uiRuntime;
  uiRuntime = null;
  await stopTerminalSessions();
  await closeServer(current?.uiServer);
}

export async function stopProxyRuntime() {
  const current = proxyRuntime;
  proxyRuntime = null;
  await closeProxy(current?.proxy);
}

export function runtimeStatus() {
  return {
    running: Boolean(uiRuntime && proxyRuntime),
    uiRunning: Boolean(uiRuntime),
    proxyRunning: Boolean(proxyRuntime),
    uiUrl: uiRuntime?.uiUrl || `http://127.0.0.1:${config.uiPort}`,
    proxyPort: config.proxyPort,
    uiPort: config.uiPort
  };
}

function listenUi(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(config.uiPort, config.host, () => {
      console.log(`Local UI listening on http://127.0.0.1:${config.uiPort}`);
      for (const url of getLanUrls(config.uiPort)) {
        console.log(`Local UI available on ${url}`);
      }
      resolve(server);
    });
    server.once('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.closeIdleConnections?.();
    for (const socket of server.__httpMockerSockets || []) {
      socket.destroy();
    }
    server.close(() => resolve());
    setTimeout(resolve, 1000);
  });
}

function trackServerSockets(server) {
  const sockets = new Set();
  server.__httpMockerSockets = sockets;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });
}

function closeProxy(proxy) {
  return new Promise((resolve) => {
    if (!proxy?.httpServer) {
      resolve();
      return;
    }
    proxy.httpServer.once('close', resolve);
    proxy.close();
    setTimeout(resolve, 1000);
  });
}
