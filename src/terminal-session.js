import os from 'node:os';
import path from 'node:path';
import pty from 'node-pty';
import { WebSocketServer } from 'ws';
import { config } from './config.js';

const terminalSessions = new Map();
let terminalWss;

export function terminalInfo() {
  return {
    cwd: terminalRootDir(),
    running: [...terminalSessions.values()].some((session) => Boolean(session.ptyProcess)),
    sessions: terminalSessions.size
  };
}

export function resetTerminal() {
  for (const session of terminalSessions.values()) {
    session.dispose();
  }
  terminalSessions.clear();
  return terminalInfo();
}

export async function stopTerminalSessions() {
  const sessions = [...terminalSessions.values()];
  terminalSessions.clear();
  await Promise.allSettled(sessions.map((session) => session.dispose({ wait: true })));
}

export function attachTerminalServer(server) {
  if (terminalWss) return terminalWss;
  terminalWss = new WebSocketServer({
    noServer: true
  });

  server.on('upgrade', (req, socket, head) => {
    let target;
    try {
      target = new URL(req.url || '/', 'http://127.0.0.1');
    } catch {
      socket.destroy();
      return;
    }
    if (target.pathname !== '/api/terminal/socket') return;

    terminalWss.handleUpgrade(req, socket, head, (ws) => {
      ws.__httpMockerTerminal = {
        id: normalizeTerminalId(target.searchParams.get('id')),
        cwd: normalizeTerminalCwd(target.searchParams.get('cwd')),
        reset: target.searchParams.get('reset') === '1'
      };
      terminalWss.emit('connection', ws, req);
    });
  });

  terminalWss.on('connection', (ws) => {
    const meta = ws.__httpMockerTerminal || {};
    const session = ensureTerminalSession(meta.id, {
      cwd: meta.cwd,
      reset: meta.reset
    });
    session.attach(ws);
  });

  return terminalWss;
}

function ensureTerminalSession(id, options = {}) {
  const key = normalizeTerminalId(id);
  const existing = terminalSessions.get(key);
  if (existing && options.reset) {
    existing.dispose();
    terminalSessions.delete(key);
  } else if (existing && !existing.disposed) {
    return existing;
  }
  const session = new TerminalSession(key, {
    cwd: options.cwd
  });
  terminalSessions.set(key, session);
  return session;
}

class TerminalSession {
  constructor(id, options = {}) {
    this.id = id;
    this.clients = new Set();
    this.outputBuffer = '';
    this.disposed = false;
    this.cwd = normalizeTerminalCwd(options.cwd);
    this.ptyProcess = pty.spawn(shellPath(), ['-l'], {
      name: 'xterm-256color',
      cols: 100,
      rows: 24,
      cwd: this.cwd,
      env: terminalEnv()
    });

    this.ptyProcess.onData((data) => {
      if (this.disposed) return;
      this.appendOutput(data);
      this.broadcast({ type: 'data', data });
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      if (this.disposed) {
        this.resolveExit?.();
        return;
      }
      this.appendOutput(`\r\n[terminal exited: ${signal || exitCode}]\r\n`);
      this.broadcast({ type: 'exit', exitCode, signal });
      this.ptyProcess = null;
      this.resolveExit?.();
    });
  }

  attach(ws) {
    this.clients.add(ws);
    if (this.outputBuffer) {
      this.send(ws, { type: 'data', data: this.outputBuffer });
    }

    ws.on('message', (raw) => {
      const message = parseWsMessage(raw);
      if (!message || !this.ptyProcess) return;
      if (message.type === 'input') {
        this.ptyProcess.write(String(message.data || ''));
        return;
      }
      if (message.type === 'resize') {
        const cols = clampInteger(message.cols, 20, 400);
        const rows = clampInteger(message.rows, 4, 120);
        if (cols && rows) this.ptyProcess.resize(cols, rows);
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  dispose(options = {}) {
    if (this.disposed) return this.exitPromise || Promise.resolve();
    this.disposed = true;
    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve;
      setTimeout(resolve, 800);
    });
    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();
    try {
      this.ptyProcess?.kill();
    } catch {
      // The app may already be tearing down the native PTY handle.
    }
    this.ptyProcess = null;
    return options.wait ? this.exitPromise : undefined;
  }

  appendOutput(data) {
    this.outputBuffer += String(data || '');
    if (this.outputBuffer.length > 200000) {
      this.outputBuffer = this.outputBuffer.slice(-200000);
    }
  }

  broadcast(message) {
    for (const ws of this.clients) {
      this.send(ws, message);
    }
  }

  send(ws, message) {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(message));
  }
}

function parseWsMessage(raw) {
  try {
    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
  } catch {
    return null;
  }
}

function clampInteger(value, min, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}

function terminalRootDir() {
  return String(config.rootDir || '').endsWith('.asar')
    ? os.homedir()
    : config.rootDir;
}

function normalizeTerminalId(value) {
  return String(value || 'default').replace(/[^\w.-]/g, '_').slice(0, 120) || 'default';
}

function normalizeTerminalCwd(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return terminalRootDir();
  try {
    return path.resolve(candidate);
  } catch {
    return terminalRootDir();
  }
}

function shellPath() {
  return process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');
}

function terminalEnv() {
  const env = { ...process.env };
  const home = env.HOME || os.homedir?.() || '';
  const extraPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    home ? path.join(home, '.local', 'bin') : ''
  ].filter(Boolean);
  const paths = env.PATH ? env.PATH.split(':') : [];
  for (const item of extraPaths) {
    if (!paths.includes(item)) paths.push(item);
  }
  env.PATH = paths.join(':');
  env.TERM = env.TERM || 'xterm-256color';
  return env;
}
