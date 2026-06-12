import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { readCaptures } from './capture-store.js';
import { readState, updateState } from './fs-store.js';
import { bodyForEditor, captureTargetKey, requestBodyForEditor } from './match.js';
import { emitCodexQueueChanged, emitSettingsChanged } from './events.js';

const maxQueueLength = 100;
const maxPromptBodyChars = 6000;
const taskDedupeWindowMs = 10 * 60 * 1000;
const failureTtlMs = 60 * 1000;
const supportedLanguages = new Set(['zh-CN', 'en', 'ja', 'ko', 'ru', 'hi', 'es', 'de', 'fr', 'ar']);

const state = {
  pending: [],
  running: null,
  completed: 0,
  failed: 0,
  lastError: '',
  lastErrorAt: 0,
  recent: new Map(),
  detailPending: [],
  detailRunning: null,
  detailCompleted: 0,
  detailFailed: 0,
  detailLastError: '',
  detailLastErrorAt: 0,
  cancelToken: 0
};

let processing = false;
let detailProcessing = false;

export function codexQueueStatus() {
  expireFailureState();
  return {
    pending: state.pending.length,
    running: Boolean(state.running),
    current: state.running ? {
      key: state.running.key,
      path: state.running.capture.path,
      host: state.running.capture.host
    } : null,
    completed: state.completed,
    failed: state.failed,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
    details: detailQueueStatus()
  };
}

function detailQueueStatus() {
  expireDetailFailureState();
  return {
    pending: state.detailPending.length,
    running: Boolean(state.detailRunning),
    current: state.detailRunning ? {
      key: state.detailRunning.key,
      path: state.detailRunning.capture.path,
      host: state.detailRunning.capture.host
    } : null,
    completed: state.detailCompleted,
    failed: state.detailFailed,
    lastError: state.detailLastError,
    lastErrorAt: state.detailLastErrorAt
  };
}

export async function enqueueCodexNote(capture, options = {}) {
  const force = Boolean(options.force);
  const settings = (await readState()).settings || {};
  if (settings.aiNotesEnabled === false) return false;
  if (settings.showListNotes === false) return false;
  if (settings.aiProvider === 'none') return false;

  const tabs = Array.isArray(settings.captureTabs) ? settings.captureTabs : [];
  const tab = tabs.find((candidate) => {
    return candidate.projectPath && matchesKeyword(capture, candidate.filter);
  });
  if (!tab) return false;

  const key = captureTargetKey(capture);
  if (settings.apiNotes?.[key] && !force) return false;
  if (settings.apiNoteFailures?.[key] && !force) return false;
  if (state.pending.some((task) => task.key === key) || state.running?.key === key) return false;

  if (force) {
    await clearNoteFailure(key);
  }

  const recentAt = state.recent.get(key) || 0;
  if (!force && Date.now() - recentAt < taskDedupeWindowMs) return false;
  state.recent.set(key, Date.now());

  state.pending.push({
    id: `${Date.now()}-${createHash('sha1').update(key).digest('hex').slice(0, 8)}`,
    key,
    cancelToken: state.cancelToken,
    projectPath: tab.projectPath,
    tabId: tab.id,
    capture: compactCapture(capture)
  });
  if (state.pending.length > maxQueueLength) {
    state.pending.splice(0, state.pending.length - maxQueueLength);
  }
  notifyCodexQueueChanged();
  processQueue().catch((error) => {
    state.lastError = error.message || 'Codex queue failed.';
    state.lastErrorAt = Date.now();
    notifyCodexQueueChanged();
  });
  return true;
}

export async function retryCodexNotesForCaptures(captures = []) {
  const settings = (await readState()).settings || {};
  if (settings.showListNotes === false) return { queued: 0, status: codexQueueStatus() };
  let queued = 0;
  state.failed = 0;
  state.lastError = '';
  state.lastErrorAt = 0;
  state.recent.clear();
  notifyCodexQueueChanged();
  for (const capture of captures) {
    if (await enqueueCodexNote(capture, { force: true })) queued += 1;
  }
  return { queued, status: codexQueueStatus() };
}

export async function enqueueMissingCodexNotes() {
  const store = await readState();
  if (store.settings?.aiNotesEnabled === false) return { queued: 0, status: codexQueueStatus() };
  if (store.settings?.showListNotes === false) return { queued: 0, status: codexQueueStatus() };
  const captures = await readCaptures();
  const rules = Array.isArray(store.rules) ? store.rules.map(captureLikeForNoteQueue) : [];
  const remoteRules = Array.isArray(store.remoteRules)
    ? store.remoteRules.filter((rule) => rule?.scope !== 'global').map(captureLikeForNoteQueue)
    : [];
  let queued = 0;
  for (const item of [...captures, ...rules, ...remoteRules]) {
    if (await enqueueCodexNote(item)) queued += 1;
  }
  return { queued, status: codexQueueStatus() };
}

export async function getCodexDetail(capture) {
  const settings = (await readState()).settings || {};
  const key = captureTargetKey(capture);
  return String(settings.apiDetails?.[key] || '').trim();
}

export async function enqueueCodexDetail(capture, options = {}) {
  const force = Boolean(options.force);
  const settings = (await readState()).settings || {};
  if (settings.aiNotesEnabled === false) {
    throw new Error('AI备注已停止。请先点击开始AI备注。');
  }
  if (settings.aiProvider === 'none') {
    throw new Error('AI 已禁用。请在右上角开启 AI。');
  }

  const tabs = Array.isArray(settings.captureTabs) ? settings.captureTabs : [];
  const tab = tabs.find((candidate) => {
    return candidate.projectPath && matchesKeyword(capture, candidate.filter);
  });
  if (!tab) {
    throw new Error('没有为当前接口关联本地项目。');
  }

  const key = captureTargetKey(capture);
  if (settings.apiDetails?.[key] && !force) return false;
  if (state.detailPending.some((task) => task.key === key) || state.detailRunning?.key === key) return false;

  if (force) {
    await clearDetailFailure(key);
  }

  state.detailPending.push({
    id: `${Date.now()}-detail-${createHash('sha1').update(key).digest('hex').slice(0, 8)}`,
    key,
    cancelToken: state.cancelToken,
    projectPath: tab.projectPath,
    tabId: tab.id,
    capture: compactCapture(capture)
  });
  if (state.detailPending.length > maxQueueLength) {
    state.detailPending.splice(0, state.detailPending.length - maxQueueLength);
  }
  notifyCodexQueueChanged();
  processDetailQueue().catch((error) => {
    state.detailLastError = error.message || 'Codex detail queue failed.';
    state.detailLastErrorAt = Date.now();
    notifyCodexQueueChanged();
  });
  return true;
}

export function stopCodexNotes() {
  state.cancelToken += 1;
  state.pending = [];
  state.detailPending = [];
  state.running = null;
  state.detailRunning = null;
  notifyCodexQueueChanged();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (state.pending.length) {
      const task = state.pending.shift();
      state.running = task;
      notifyCodexQueueChanged();
      try {
        const note = await analyzeWithAi(task);
        if (isCanceledTask(task)) continue;
        if (!note) {
          throw new Error('AI 没有生成备注。');
        }
        await updateState((store) => {
          store.settings = {
            ...store.settings,
            apiNotes: {
              ...(store.settings?.apiNotes || {}),
              [task.key]: note
            }
          };
          if (store.settings.apiNoteFailures?.[task.key]) {
            store.settings.apiNoteFailures = {
              ...(store.settings.apiNoteFailures || {})
            };
            delete store.settings.apiNoteFailures[task.key];
          }
        });
        state.completed += 1;
        emitSettingsChanged({ reason: 'noteGenerated', key: task.key });
      } catch (error) {
        if (isCanceledTask(task)) continue;
        await recordNoteFailure(task, error);
        state.failed += 1;
        state.lastError = error.message || 'Codex analysis failed.';
        state.lastErrorAt = Date.now();
        emitSettingsChanged({ reason: 'noteFailed', key: task.key });
      } finally {
        state.running = null;
        notifyCodexQueueChanged();
      }
    }
  } finally {
    processing = false;
  }
}

async function processDetailQueue() {
  if (detailProcessing) return;
  detailProcessing = true;
  try {
    while (state.detailPending.length) {
      const task = state.detailPending.shift();
      state.detailRunning = task;
      notifyCodexQueueChanged();
      try {
        const detail = await analyzeDetailWithAi(task);
        if (isCanceledTask(task)) continue;
        if (!detail) {
          throw new Error('AI 没有生成详细说明。');
        }
        await updateState((store) => {
          store.settings = {
            ...store.settings,
            apiDetails: {
              ...(store.settings?.apiDetails || {}),
              [task.key]: detail
            }
          };
          if (store.settings.apiDetailFailures?.[task.key]) {
            store.settings.apiDetailFailures = {
              ...(store.settings.apiDetailFailures || {})
            };
            delete store.settings.apiDetailFailures[task.key];
          }
        });
        state.detailCompleted += 1;
        emitSettingsChanged({ reason: 'detailGenerated', key: task.key });
      } catch (error) {
        if (isCanceledTask(task)) continue;
        await recordDetailFailure(task, error);
        state.detailFailed += 1;
        state.detailLastError = error.message || 'Codex detail analysis failed.';
        state.detailLastErrorAt = Date.now();
        emitSettingsChanged({ reason: 'detailFailed', key: task.key });
      } finally {
        state.detailRunning = null;
        notifyCodexQueueChanged();
      }
    }
  } finally {
    detailProcessing = false;
  }
}

function notifyCodexQueueChanged() {
  emitCodexQueueChanged({ source: 'notes' });
}

function isCanceledTask(task) {
  return task.cancelToken !== state.cancelToken;
}

async function recordNoteFailure(task, error) {
  await updateState((store) => {
    store.settings = {
      ...store.settings,
      apiNoteFailures: {
        ...(store.settings?.apiNoteFailures || {}),
        [task.key]: {
          message: String(error?.message || '备注分析失败。').slice(0, 500),
          failedAt: new Date().toISOString()
        }
      }
    };
  });
}

async function clearNoteFailure(key) {
  await updateState((store) => {
    if (!store.settings?.apiNoteFailures?.[key]) return;
    store.settings = {
      ...store.settings,
      apiNoteFailures: {
        ...(store.settings?.apiNoteFailures || {})
      }
    };
    delete store.settings.apiNoteFailures[key];
  });
}

async function recordDetailFailure(task, error) {
  await updateState((store) => {
    store.settings = {
      ...store.settings,
      apiDetailFailures: {
        ...(store.settings?.apiDetailFailures || {}),
        [task.key]: {
          message: String(error?.message || '详细说明生成失败。').slice(0, 500),
          failedAt: new Date().toISOString()
        }
      }
    };
  });
}

async function clearDetailFailure(key) {
  await updateState((store) => {
    if (!store.settings?.apiDetailFailures?.[key]) return;
    store.settings = {
      ...store.settings,
      apiDetailFailures: {
        ...(store.settings?.apiDetailFailures || {})
      }
    };
    delete store.settings.apiDetailFailures[key];
  });
}

function captureLikeForNoteQueue(item = {}) {
  const url = buildUrl(item, { includeQuery: true });
  return {
    ...item,
    url,
    statusCode: item.statusCode || 0,
    requestHeaders: item.requestHeaders || {},
    responseHeaders: item.responseHeaders || {},
    contentType: item.contentType || '',
    bodyBase64: item.bodyBase64 || '',
    editable: Boolean(item.editable),
    requestBodyBase64: item.requestBodyBase64 || '',
    requestBodyEditable: Boolean(item.requestBodyEditable),
    requestBodyTruncated: Boolean(item.requestBodyTruncated)
  };
}

function buildUrl(item, options = {}) {
  const protocol = item.protocol || 'https';
  const port = portSegment(protocol, item.port);
  const itemPath = item.path || '/';
  const query = options.includeQuery && item.query ? `?${item.query}` : '';
  return `${protocol}://${item.host}${port}${itemPath}${query}`;
}

function portSegment(protocol, port) {
  const numericPort = Number(port);
  if (!Number.isFinite(numericPort)) return '';
  if (protocol === 'http' && numericPort === 80) return '';
  if (protocol === 'https' && numericPort === 443) return '';
  return `:${numericPort}`;
}

function expireFailureState() {
  if (!state.lastErrorAt || Date.now() - state.lastErrorAt < failureTtlMs) return;
  state.failed = 0;
  state.lastError = '';
  state.lastErrorAt = 0;
}

function expireDetailFailureState() {
  if (!state.detailLastErrorAt || Date.now() - state.detailLastErrorAt < failureTtlMs) return;
  state.detailFailed = 0;
  state.detailLastError = '';
  state.detailLastErrorAt = 0;
}

async function analyzeWithAi(task) {
  if (!task.projectPath || !fs.existsSync(task.projectPath)) {
    throw new Error('关联项目路径不存在。');
  }
  const settings = (await readState()).settings || {};
  const provider = settings.aiProvider || 'codex';
  if (provider === 'none') return null;

  const outputPath = path.join(os.tmpdir(), `http-mocker-ai-note-${task.id}.txt`);
  const prompt = buildPrompt(task.capture, settings.language);
  try {
    await execAi(provider, task.projectPath, outputPath, prompt);
    return normalizeNote(fs.readFileSync(outputPath, 'utf8'));
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

async function analyzeDetailWithAi(task) {
  if (!task.projectPath || !fs.existsSync(task.projectPath)) {
    throw new Error('关联项目路径不存在。');
  }
  const settings = (await readState()).settings || {};
  const provider = settings.aiProvider || 'codex';
  if (provider === 'none') return null;

  const outputPath = path.join(os.tmpdir(), `http-mocker-ai-detail-${task.id}.md`);
  const prompt = buildDetailPrompt(task.capture, settings.language);
  try {
    await execAi(provider, task.projectPath, outputPath, prompt);
    return normalizeDetail(fs.readFileSync(outputPath, 'utf8'));
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

function getAiEnv() {
  const env = { ...process.env };
  const home = os.homedir();
  const extraPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(home, '.local', 'bin')
  ];
  if (env.PATH) {
    const paths = env.PATH.split(':');
    for (const p of extraPaths) {
      if (!paths.includes(p)) paths.push(p);
    }
    env.PATH = paths.join(':');
  } else {
    env.PATH = extraPaths.join(':');
  }
  return env;
}

async function ensureAiAvailable(provider) {
  const cmd = providerCommand(provider);
  return new Promise((resolve, reject) => {
    execFile(cmd, ['--version'], { timeout: 5000, env: getAiEnv() }, (error) => {
      if (error) {
        const msg = error.code === 'ENOENT'
          ? `${cmd} 命令未找到。请确保已安装并添加到 PATH。`
          : `${provider.charAt(0).toUpperCase() + provider.slice(1)} CLI 不可用: ${error.message}`;
        reject(new Error(msg));
        return;
      }
      resolve();
    });
  });
}

async function execAi(provider, cwd, outputPath, prompt) {
  await ensureAiAvailable(provider);
  if (provider === 'cursor') {
    return execCursor(cwd, outputPath, prompt);
  }
  if (provider === 'claude') {
    return execClaude(cwd, outputPath, prompt);
  }
  return execCodex(cwd, outputPath, prompt);
}

function providerCommand(provider) {
  if (provider === 'cursor') return 'cursor-agent';
  if (provider === 'claude') return 'claude';
  return 'codex';
}

function execCursor(cwd, outputPath, prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('cursor-agent', [
      'exec',
      '-p',
      '--trust',
      '--sandbox',
      'enabled',
      '--workspace',
      cwd,
      prompt
    ], {
      cwd,
      env: getAiEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (error) => {
      reject(new Error(error.code === 'ENOENT'
        ? 'cursor-agent 命令未找到。请确认 Cursor CLI 已安装并位于 /opt/homebrew/bin、/usr/local/bin 或 ~/.local/bin。'
        : error.message));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Cursor CLI exited with code ${code}.`));
        return;
      }
      try {
        fs.writeFileSync(outputPath, stdout, 'utf8');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function execClaude(cwd, outputPath, prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', [
      '-p',
      '--permission-mode',
      'dontAsk',
      prompt
    ], {
      cwd,
      env: getAiEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (error) => {
      reject(new Error(error.code === 'ENOENT'
        ? 'claude 命令未找到。请确认 Claude CLI 已安装并位于 /opt/homebrew/bin、/usr/local/bin 或 ~/.local/bin。'
        : error.message));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Claude CLI exited with code ${code}.`));
        return;
      }
      try {
        fs.writeFileSync(outputPath, stdout, 'utf8');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function execCodex(cwd, outputPath, prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', [
      '-c',
      'features.codex_hooks=false',
      'exec',
      '--cd',
      cwd,
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--ephemeral',
      '--output-last-message',
      outputPath,
      prompt
    ], {
      cwd,
      env: getAiEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Codex CLI exited with code ${code}.`));
    });
  });
}

function buildPrompt(capture, language = 'zh-CN') {
  const noteInstruction = noteLanguageInstruction(language);
  return [
    noteInstruction.role,
    noteInstruction.context,
    noteInstruction.output,
    noteInstruction.fallback,
    '',
    noteInstruction.captureLabel,
    JSON.stringify(capture, null, 2)
  ].join('\n');
}

function buildDetailPrompt(capture, language = 'zh-CN') {
  const detailInstruction = detailLanguageInstruction(language);
  return [
    detailInstruction.role,
    detailInstruction.context,
    detailInstruction.output,
    detailInstruction.structure,
    ...detailInstruction.headings.map((heading) => `## ${heading}`),
    detailInstruction.format,
    detailInstruction.uncertain,
    detailInstruction.safety,
    '',
    detailInstruction.captureLabel,
    JSON.stringify(capture, null, 2)
  ].join('\n');
}

function normalizeLanguage(value) {
  const language = String(value || 'zh-CN');
  return supportedLanguages.has(language) ? language : 'zh-CN';
}

function noteLanguageInstruction(language) {
  const normalized = normalizeLanguage(language);
  const instructions = {
    'zh-CN': {
      role: '你正在为 HttpMocker 生成接口备注。',
      context: '请只读当前工程，搜索这个接口的调用位置、路由封装、请求方法名、业务上下文。',
      output: '只输出一句中文备注，40 字以内，不要 Markdown，不要解释过程。',
      fallback: '如果无法从工程判断，输出你基于 path/参数推断出的用途，并以“可能是”开头。',
      captureLabel: '接口信息：'
    },
    en: {
      role: 'You are generating an API note for HttpMocker.',
      context: 'Only read the current project. Search for this API usage, route wrappers, request method names, and business context.',
      output: 'Output one English note only, within 40 words. Do not use Markdown or explain your process.',
      fallback: 'If the project does not reveal the purpose, infer it from the path and parameters and start with "Likely".',
      captureLabel: 'API information:'
    },
    ja: {
      role: 'HttpMocker の API メモを生成します。',
      context: '現在のプロジェクトだけを読み、この API の呼び出し箇所、ルートラッパー、リクエストメソッド名、業務コンテキストを探してください。',
      output: '日本語のメモを 1 文だけ、40 語以内で出力してください。Markdown や説明過程は不要です。',
      fallback: 'プロジェクトから判断できない場合は path/パラメータから用途を推測し、「おそらく」で始めてください。',
      captureLabel: 'API 情報:'
    },
    ko: {
      role: 'HttpMocker의 API 메모를 생성합니다.',
      context: '현재 프로젝트만 읽고 이 API의 호출 위치, 라우트 래퍼, 요청 메서드명, 비즈니스 맥락을 찾으세요.',
      output: '한국어 메모 한 문장만 40단어 이내로 출력하세요. Markdown이나 과정 설명은 쓰지 마세요.',
      fallback: '프로젝트에서 판단할 수 없으면 path/파라미터로 용도를 추론하고 "아마"로 시작하세요.',
      captureLabel: 'API 정보:'
    },
    ru: {
      role: 'Вы создаете заметку API для HttpMocker.',
      context: 'Читайте только текущий проект. Найдите места вызова API, обертки маршрутов, имена методов запроса и бизнес-контекст.',
      output: 'Выведите только одну заметку на русском языке, до 40 слов. Не используйте Markdown и не объясняйте ход рассуждений.',
      fallback: 'Если проект не раскрывает назначение, сделайте вывод по path/параметрам и начните с "Вероятно".',
      captureLabel: 'Информация API:'
    },
    hi: {
      role: 'आप HttpMocker के लिए API नोट बना रहे हैं।',
      context: 'केवल मौजूदा प्रोजेक्ट पढ़ें। इस API के उपयोग, route wrapper, request method name और business context खोजें।',
      output: 'केवल एक हिंदी नोट, 40 शब्दों के भीतर आउटपुट करें। Markdown या प्रक्रिया की व्याख्या न दें।',
      fallback: 'अगर प्रोजेक्ट से उद्देश्य स्पष्ट न हो, तो path/parameters से अनुमान लगाकर "संभवतः" से शुरू करें।',
      captureLabel: 'API जानकारी:'
    },
    es: {
      role: 'Estás generando una nota de API para HttpMocker.',
      context: 'Lee solo el proyecto actual. Busca usos de esta API, envoltorios de rutas, nombres de métodos de solicitud y contexto de negocio.',
      output: 'Genera solo una nota en español, de menos de 40 palabras. No uses Markdown ni expliques el proceso.',
      fallback: 'Si el proyecto no permite determinarlo, infiere el uso por path/parámetros y empieza con "Probablemente".',
      captureLabel: 'Información de la API:'
    },
    de: {
      role: 'Du erstellst eine API-Notiz für HttpMocker.',
      context: 'Lies nur das aktuelle Projekt. Suche nach Aufrufstellen dieser API, Route-Wrappern, Request-Methodennamen und fachlichem Kontext.',
      output: 'Gib nur eine deutsche Notiz mit höchstens 40 Wörtern aus. Verwende kein Markdown und erkläre den Prozess nicht.',
      fallback: 'Wenn der Zweck im Projekt nicht erkennbar ist, leite ihn aus path/Parametern ab und beginne mit "Wahrscheinlich".',
      captureLabel: 'API-Informationen:'
    },
    fr: {
      role: 'Vous générez une note API pour HttpMocker.',
      context: 'Lisez uniquement le projet actuel. Recherchez les usages de cette API, les wrappers de routes, les noms de méthodes de requête et le contexte métier.',
      output: 'Produisez une seule note en français, en moins de 40 mots. N’utilisez pas Markdown et n’expliquez pas le raisonnement.',
      fallback: 'Si le projet ne permet pas de conclure, déduisez l’usage depuis le path/paramètres et commencez par "Probablement".',
      captureLabel: 'Informations API :'
    },
    ar: {
      role: 'أنت تنشئ ملاحظة API لـ HttpMocker.',
      context: 'اقرأ المشروع الحالي فقط. ابحث عن مواضع استخدام هذا الـ API، وأغلفة المسارات، وأسماء طرق الطلب، وسياق العمل.',
      output: 'أخرج ملاحظة عربية واحدة فقط في حدود 40 كلمة. لا تستخدم Markdown ولا تشرح العملية.',
      fallback: 'إذا لم يتضح الغرض من المشروع، فاستنتجه من path/المعاملات وابدأ بـ "على الأرجح".',
      captureLabel: 'معلومات API:'
    }
  };
  return instructions[normalized] || instructions['zh-CN'];
}

function detailLanguageInstruction(language) {
  const normalized = normalizeLanguage(language);
  const instructions = {
    'zh-CN': {
      role: '你正在为 HttpMocker 生成接口详细说明。',
      context: '请只读当前工程，搜索这个接口的调用位置、路由封装、请求方法名、业务上下文、请求参数和响应字段的使用位置。',
      output: '只输出中文 Markdown 正文，不要使用代码围栏包裹，不要输出 HTML、JSON、前言或解释过程。',
      structure: '结构必须固定使用以下二级标题：',
      headings: ['用途', '请求参数', '请求体字段', '响应字段', '代码依据'],
      format: '标题下使用短段落或列表说明，字段名和方法名使用反引号标记。',
      uncertain: '参数和字段尽量说明业务含义；如果工程里无法确认，请明确写“推测”。',
      safety: '不要输出完整请求体、完整响应体、base64 或敏感数据。整体控制在 1200 字以内。',
      captureLabel: '接口信息：'
    },
    en: {
      role: 'You are generating an API detail note for HttpMocker.',
      context: 'Only read the current project. Search for this API usage, route wrappers, request method names, business context, request parameter usage, and response field usage.',
      output: 'Output English Markdown body only. Do not use code fences, HTML, JSON, prefaces, or process explanations.',
      structure: 'Use exactly these level-2 headings:',
      headings: ['Purpose', 'Request Parameters', 'Request Body Fields', 'Response Fields', 'Code Evidence'],
      format: 'Use short paragraphs or lists under each heading. Mark field names and method names with backticks.',
      uncertain: 'Explain business meaning where possible. If the project cannot confirm it, explicitly write "Inferred".',
      safety: 'Do not output full request bodies, full response bodies, base64, or sensitive data. Keep the whole note within 1200 words.',
      captureLabel: 'API information:'
    },
    ja: {
      role: 'HttpMocker の API 詳細説明を生成します。',
      context: '現在のプロジェクトだけを読み、この API の呼び出し箇所、ルートラッパー、リクエストメソッド名、業務コンテキスト、リクエストパラメータとレスポンスフィールドの使用箇所を探してください。',
      output: '日本語の Markdown 本文だけを出力してください。コードフェンス、HTML、JSON、前置き、説明過程は不要です。',
      structure: '次の二級見出しだけを固定で使用してください:',
      headings: ['用途', 'リクエストパラメータ', 'リクエストボディフィールド', 'レスポンスフィールド', 'コード根拠'],
      format: '各見出しの下は短い段落またはリストで説明し、フィールド名とメソッド名はバッククォートで囲んでください。',
      uncertain: 'パラメータとフィールドは可能な限り業務上の意味を説明し、確認できない場合は「推測」と明記してください。',
      safety: '完全なリクエストボディ、完全なレスポンスボディ、base64、機密データは出力しないでください。全体は 1200 語以内にしてください。',
      captureLabel: 'API 情報:'
    },
    ko: {
      role: 'HttpMocker의 API 상세 설명을 생성합니다.',
      context: '현재 프로젝트만 읽고 이 API의 호출 위치, 라우트 래퍼, 요청 메서드명, 비즈니스 맥락, 요청 파라미터와 응답 필드의 사용 위치를 찾으세요.',
      output: '한국어 Markdown 본문만 출력하세요. 코드 펜스, HTML, JSON, 서문, 과정 설명은 쓰지 마세요.',
      structure: '다음 2단계 제목만 고정으로 사용하세요:',
      headings: ['용도', '요청 파라미터', '요청 본문 필드', '응답 필드', '코드 근거'],
      format: '각 제목 아래에는 짧은 문단이나 목록을 사용하고, 필드명과 메서드명은 백틱으로 표시하세요.',
      uncertain: '파라미터와 필드는 가능한 한 비즈니스 의미를 설명하고, 확인할 수 없으면 "추론"이라고 명시하세요.',
      safety: '전체 요청 본문, 전체 응답 본문, base64 또는 민감 데이터를 출력하지 마세요. 전체는 1200단어 이내로 제한하세요.',
      captureLabel: 'API 정보:'
    },
    ru: {
      role: 'Вы создаете подробное описание API для HttpMocker.',
      context: 'Читайте только текущий проект. Найдите места вызова API, обертки маршрутов, имена методов запроса, бизнес-контекст, использование параметров запроса и полей ответа.',
      output: 'Выведите только Markdown-текст на русском языке. Не используйте code fences, HTML, JSON, вступления или объяснение процесса.',
      structure: 'Используйте строго эти заголовки второго уровня:',
      headings: ['Назначение', 'Параметры запроса', 'Поля тела запроса', 'Поля ответа', 'Кодовые основания'],
      format: 'Под заголовками используйте короткие абзацы или списки. Имена полей и методов выделяйте обратными кавычками.',
      uncertain: 'По возможности объясняйте бизнес-смысл параметров и полей. Если проект не подтверждает вывод, явно пишите "Предположение".',
      safety: 'Не выводите полное тело запроса, полное тело ответа, base64 или чувствительные данные. Общий объем до 1200 слов.',
      captureLabel: 'Информация API:'
    },
    hi: {
      role: 'आप HttpMocker के लिए API का विस्तृत विवरण बना रहे हैं।',
      context: 'केवल मौजूदा प्रोजेक्ट पढ़ें। इस API के उपयोग, route wrapper, request method name, business context, request parameters और response fields के उपयोग खोजें।',
      output: 'केवल हिंदी Markdown body आउटपुट करें। code fence, HTML, JSON, भूमिका या प्रक्रिया की व्याख्या न दें।',
      structure: 'सिर्फ ये level-2 headings इस्तेमाल करें:',
      headings: ['उद्देश्य', 'Request Parameters', 'Request Body Fields', 'Response Fields', 'Code Evidence'],
      format: 'हर heading के नीचे छोटे paragraphs या lists लिखें। field names और method names को backticks में रखें।',
      uncertain: 'जहां संभव हो parameters और fields का business meaning बताएं। अगर प्रोजेक्ट से पुष्टि न हो, तो साफ़ "अनुमानित" लिखें।',
      safety: 'पूरा request body, पूरा response body, base64 या sensitive data आउटपुट न करें। कुल सामग्री 1200 शब्दों के भीतर रखें।',
      captureLabel: 'API जानकारी:'
    },
    es: {
      role: 'Estás generando una explicación detallada de API para HttpMocker.',
      context: 'Lee solo el proyecto actual. Busca usos de esta API, envoltorios de rutas, nombres de métodos, contexto de negocio y usos de parámetros de solicitud y campos de respuesta.',
      output: 'Genera solo cuerpo Markdown en español. No uses bloques de código, HTML, JSON, introducciones ni explicaciones del proceso.',
      structure: 'Usa exactamente estos encabezados de nivel 2:',
      headings: ['Propósito', 'Parámetros de solicitud', 'Campos del cuerpo de solicitud', 'Campos de respuesta', 'Evidencia en código'],
      format: 'Bajo cada encabezado usa párrafos cortos o listas. Marca nombres de campos y métodos con backticks.',
      uncertain: 'Explica el significado de negocio cuando sea posible. Si el proyecto no lo confirma, escribe explícitamente "Inferido".',
      safety: 'No incluyas cuerpos completos de solicitud, respuestas completas, base64 ni datos sensibles. Mantén todo dentro de 1200 palabras.',
      captureLabel: 'Información de la API:'
    },
    de: {
      role: 'Du erstellst eine ausführliche API-Beschreibung für HttpMocker.',
      context: 'Lies nur das aktuelle Projekt. Suche nach API-Aufrufen, Route-Wrappern, Request-Methodennamen, fachlichem Kontext sowie Nutzung von Request-Parametern und Response-Feldern.',
      output: 'Gib nur deutschen Markdown-Text aus. Keine Codeblöcke, kein HTML, kein JSON, keine Einleitung und keine Prozesserklärung.',
      structure: 'Verwende genau diese Überschriften der Ebene 2:',
      headings: ['Zweck', 'Request-Parameter', 'Request-Body-Felder', 'Response-Felder', 'Codebelege'],
      format: 'Nutze unter jeder Überschrift kurze Absätze oder Listen. Markiere Feld- und Methodennamen mit Backticks.',
      uncertain: 'Erkläre möglichst die fachliche Bedeutung von Parametern und Feldern. Wenn das Projekt es nicht bestätigt, schreibe ausdrücklich "Abgeleitet".',
      safety: 'Gib keine vollständigen Request-Bodys, vollständigen Response-Bodys, base64 oder sensiblen Daten aus. Insgesamt höchstens 1200 Wörter.',
      captureLabel: 'API-Informationen:'
    },
    fr: {
      role: 'Vous générez une description détaillée d’API pour HttpMocker.',
      context: 'Lisez uniquement le projet actuel. Recherchez les usages de cette API, les wrappers de routes, les noms de méthodes, le contexte métier, ainsi que l’usage des paramètres de requête et des champs de réponse.',
      output: 'Produisez uniquement un corps Markdown en français. N’utilisez pas de blocs de code, HTML, JSON, introduction ou explication du processus.',
      structure: 'Utilisez exactement ces titres de niveau 2 :',
      headings: ['Objectif', 'Paramètres de requête', 'Champs du corps de requête', 'Champs de réponse', 'Preuves dans le code'],
      format: 'Sous chaque titre, utilisez des paragraphes courts ou des listes. Encadrez les noms de champs et de méthodes avec des backticks.',
      uncertain: 'Expliquez le sens métier si possible. Si le projet ne le confirme pas, écrivez explicitement "Déduit".',
      safety: 'N’incluez pas de corps de requête complet, de réponse complète, de base64 ni de données sensibles. Limitez l’ensemble à 1200 mots.',
      captureLabel: 'Informations API :'
    },
    ar: {
      role: 'أنت تنشئ شرحا تفصيليا للـ API في HttpMocker.',
      context: 'اقرأ المشروع الحالي فقط. ابحث عن استخدامات هذا الـ API، وأغلفة المسارات، وأسماء طرق الطلب، وسياق العمل، واستخدام معاملات الطلب وحقول الاستجابة.',
      output: 'أخرج متن Markdown باللغة العربية فقط. لا تستخدم حواجز كود أو HTML أو JSON أو مقدمات أو شرحا للعملية.',
      structure: 'استخدم عناوين المستوى الثاني التالية فقط:',
      headings: ['الغرض', 'معاملات الطلب', 'حقول جسم الطلب', 'حقول الاستجابة', 'دليل الكود'],
      format: 'استخدم فقرات قصيرة أو قوائم تحت كل عنوان. ضع أسماء الحقول والطرق بين backticks.',
      uncertain: 'اشرح المعنى العملي للمعاملات والحقول قدر الإمكان. إذا لم يؤكد المشروع ذلك، فاكتب صراحة "مستنتج".',
      safety: 'لا تخرج جسم الطلب الكامل أو الاستجابة الكاملة أو base64 أو بيانات حساسة. اجعل النص كله في حدود 1200 كلمة.',
      captureLabel: 'معلومات API:'
    }
  };
  return instructions[normalized] || instructions['zh-CN'];
}

function compactCapture(capture) {
  const responseBody = safeBodyForEditor(capture);
  const requestBody = safeRequestBodyForEditor(capture);
  return {
    method: capture.method,
    host: capture.host,
    path: capture.path,
    query: capture.query || '',
    statusCode: capture.statusCode,
    requestHeaders: pickHeaders(capture.requestHeaders),
    responseHeaders: pickHeaders(capture.responseHeaders),
    requestBody: truncate(requestBody.body || requestBody.note || ''),
    responseBody: truncate(responseBody.body || responseBody.note || '')
  };
}

function safeBodyForEditor(capture) {
  try {
    return bodyForEditor(capture);
  } catch {
    return { body: '' };
  }
}

function safeRequestBodyForEditor(capture) {
  try {
    return requestBodyForEditor(capture);
  } catch {
    return { body: '' };
  }
}

function pickHeaders(headers = {}) {
  const wanted = ['content-type', 'accept'];
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (wanted.includes(key.toLowerCase())) result[key] = value;
  }
  return result;
}

function truncate(value) {
  const text = String(value || '');
  return text.length > maxPromptBodyChars
    ? `${text.slice(0, maxPromptBodyChars)}\n...<truncated>`
    : text;
}

function normalizeNote(value) {
  return String(value || '')
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function normalizeDetail(value) {
  return String(value || '')
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
    .slice(0, 20000);
}

function matchesKeyword(capture, keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return true;
  return [
    capture.method,
    capture.url,
    capture.host,
    capture.path,
    capture.query,
    capture.contentType
  ].filter(Boolean).join(' ').toLowerCase().includes(query);
}
