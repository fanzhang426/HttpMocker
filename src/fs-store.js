import fs from 'node:fs/promises';
import path from 'node:path';
import { setCaptureStoreMaxRecentRequests, writeCaptures } from './capture-store.js';
import { config, normalizeMaxRecentRequests } from './config.js';

const initialState = {
  version: 1,
  settings: {
    captureFilter: '',
    displayFilter: '',
    recordingEnabled: true,
    captureMergeRules: {},
    captureMergeEnabled: true,
    captureTreeViewEnabled: false,
    apiNotes: {},
    apiNoteFailures: {},
    apiDetails: {},
    apiDetailFailures: {},
    captureTabs: [],
    activeCaptureTabId: '',
    domainHistory: [],
    domainProjectPaths: {},
    domainProjectsInitialized: false,
    requireDomainHistorySelection: false,
    aiNotesEnabled: false,
    aiProvider: 'none',
    language: 'zh-CN',
    appearance: 'system',
    showListNotes: true,
    maxRecentRequests: config.maxRecentRequests
  },
  rules: [],
  remoteRules: []
};

let stateUpdateQueue = Promise.resolve();
let cachedState;
let cachedStateMtimeMs = 0;

export async function ensureStorage() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.localsDir, { recursive: true });
  await fs.mkdir(config.certsDir, { recursive: true });

  try {
    await fs.access(config.statePath);
  } catch {
    await writeJson(config.statePath, initialState);
  }
  await migrateCapturesFromState();
}

export async function readState() {
  return structuredClone(await loadCachedState());
}

export async function readSettings() {
  const state = await loadCachedState();
  return structuredClone(state.settings);
}

export async function readProxyConfig() {
  const state = await loadCachedState();
  return {
    settings: structuredClone(state.settings),
    rules: structuredClone(state.rules),
    remoteRules: structuredClone(state.remoteRules)
  };
}

async function loadCachedState() {
  await ensureStorage();
  try {
    const stat = await fs.stat(config.statePath);
    if (cachedState && cachedStateMtimeMs === stat.mtimeMs) {
      return cachedState;
    }
    const raw = await fs.readFile(config.statePath, 'utf8');
    const state = normalizeState(JSON.parse(raw));
    setCaptureStoreMaxRecentRequests(state.settings.maxRecentRequests);
    cachedState = state;
    cachedStateMtimeMs = stat.mtimeMs;
    return state;
  } catch {
    return { ...initialState, rules: [], remoteRules: [] };
  }
}

export async function writeState(state) {
  await ensureStorage();
  const normalized = normalizeState(state);
  await writeJson(config.statePath, normalized);
  const stat = await fs.stat(config.statePath);
  setCaptureStoreMaxRecentRequests(normalized.settings.maxRecentRequests);
  cachedState = normalized;
  cachedStateMtimeMs = stat.mtimeMs;
}

export function updateState(mutator) {
  const run = async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeState(state);
    return result;
  };

  const next = stateUpdateQueue.then(run, run);
  stateUpdateQueue = next.catch(() => {});
  return next;
}

export async function readTextFile(filePath) {
  const safePath = resolveInside(config.localsDir, filePath);
  return fs.readFile(safePath, 'utf8');
}

export async function writeTextFile(filePath, content) {
  const safePath = resolveInside(config.localsDir, filePath);
  await fs.mkdir(path.dirname(safePath), { recursive: true });
  await fs.writeFile(safePath, content, 'utf8');
}

export async function writeBufferFile(filePath, buffer) {
  const safePath = resolveInside(config.localsDir, filePath);
  await fs.mkdir(path.dirname(safePath), { recursive: true });
  await fs.writeFile(safePath, buffer);
}

export async function readBufferFile(filePath) {
  const safePath = resolveInside(config.localsDir, filePath);
  return fs.readFile(safePath);
}

export async function deleteLocalFile(filePath) {
  const safePath = resolveInside(config.localsDir, filePath);
  await fs.rm(safePath, { force: true });
  await removeEmptyParents(path.dirname(safePath));
}

export async function clearLocalFiles() {
  await fs.rm(config.localsDir, { recursive: true, force: true });
  await fs.mkdir(config.localsDir, { recursive: true });
}

function normalizeState(state) {
  return {
    version: 1,
    settings: {
      captureFilter: String(state?.settings?.captureFilter || ''),
      displayFilter: String(state?.settings?.displayFilter || ''),
      recordingEnabled: state?.settings?.recordingEnabled !== false,
      captureMergeRules: normalizeCaptureMergeRules(state?.settings?.captureMergeRules),
      captureMergeEnabled: state?.settings?.captureMergeEnabled !== false,
      captureTreeViewEnabled: state?.settings?.captureTreeViewEnabled === true,
      apiNotes: normalizeApiNotes(state?.settings?.apiNotes),
      apiNoteFailures: normalizeApiNoteFailures(state?.settings?.apiNoteFailures),
      apiDetails: normalizeApiDetails(state?.settings?.apiDetails),
      apiDetailFailures: normalizeApiNoteFailures(state?.settings?.apiDetailFailures),
      captureTabs: normalizeCaptureTabs(state?.settings?.captureTabs),
      activeCaptureTabId: String(state?.settings?.activeCaptureTabId || ''),
      domainHistory: normalizeDomainHistory(state?.settings?.domainHistory, state?.settings?.captureTabs),
      domainProjectPaths: normalizeDomainProjectPaths(state?.settings?.domainProjectPaths, state?.settings?.captureTabs),
      domainProjectsInitialized: state?.settings?.domainProjectsInitialized === true ||
        normalizeCaptureTabs(state?.settings?.captureTabs).length > 0 ||
        Boolean(String(state?.settings?.captureFilter || '').trim()),
      requireDomainHistorySelection: state?.settings?.requireDomainHistorySelection === true,
      aiNotesEnabled: state?.settings?.aiProvider && state.settings.aiProvider !== 'none'
        ? state?.settings?.aiNotesEnabled !== false
        : state?.settings?.aiNotesEnabled === true,
      aiProvider: normalizeAiProvider(state?.settings?.aiProvider),
      language: normalizeLanguage(state?.settings?.language),
      appearance: normalizeAppearance(state?.settings?.appearance),
      showListNotes: state?.settings?.showListNotes !== false,
      maxRecentRequests: normalizeMaxRecentRequests(state?.settings?.maxRecentRequests)
    },
    rules: Array.isArray(state?.rules) ? state.rules : [],
    remoteRules: Array.isArray(state?.remoteRules) ? state.remoteRules : []
  };
}

async function migrateCapturesFromState() {
  let raw;
  try {
    raw = await fs.readFile(config.statePath, 'utf8');
  } catch {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed?.captures)) return;

  await writeCaptures(parsed.captures);
  delete parsed.captures;
  await writeJson(config.statePath, normalizeState(parsed));
}

function normalizeAiProvider(value) {
  const provider = String(value || 'none');
  return ['none', 'codex', 'cursor', 'claude'].includes(provider) ? provider : 'none';
}

function normalizeLanguage(value) {
  const language = String(value || 'zh-CN');
  return ['zh-CN', 'en', 'ja', 'ko', 'ru', 'hi', 'es', 'de', 'fr', 'ar'].includes(language) ? language : 'zh-CN';
}

function normalizeAppearance(value) {
  const appearance = String(value || 'system');
  return ['system', 'light', 'dark'].includes(appearance) ? appearance : 'system';
}

function normalizeCaptureMergeRules(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, rule] of Object.entries(value)) {
    if (!key || !rule || typeof rule !== 'object' || Array.isArray(rule)) continue;
    const normalized = {};
    if (rule.query === true) normalized.query = true;
    if (rule.body === true) normalized.body = true;
    const queryTemplate = Object.hasOwn(rule, 'queryTemplate') ? String(rule.queryTemplate ?? '').replace(/^\?/, '') : '';
    const bodyTemplate = String(rule.bodyTemplate || '');
    const requestContentType = String(rule.requestContentType || '');
    if (Object.hasOwn(rule, 'queryTemplate')) normalized.queryTemplate = queryTemplate;
    if (bodyTemplate) normalized.bodyTemplate = bodyTemplate.slice(0, 200000);
    if (requestContentType) normalized.requestContentType = requestContentType.slice(0, 200);
    const variants = normalizeCaptureMergeVariants(rule.variants);
    if (Object.keys(variants).length) normalized.variants = variants;
    if (Object.keys(normalized).length) result[key] = normalized;
  }
  return result;
}

function normalizeCaptureMergeVariants(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, rule] of Object.entries(value)) {
    if (!key || !rule || typeof rule !== 'object' || Array.isArray(rule)) continue;
    const normalized = {};
    const queryTemplate = Object.hasOwn(rule, 'queryTemplate') ? String(rule.queryTemplate ?? '').replace(/^\?/, '') : '';
    const bodyTemplate = String(rule.bodyTemplate || '');
    const requestContentType = String(rule.requestContentType || '');
    if (Object.hasOwn(rule, 'queryTemplate')) normalized.queryTemplate = queryTemplate;
    if (bodyTemplate) normalized.bodyTemplate = bodyTemplate.slice(0, 200000);
    if (requestContentType) normalized.requestContentType = requestContentType.slice(0, 200);
    if (Object.keys(normalized).length) result[key] = normalized;
  }
  return result;
}

function normalizeApiNotes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, note] of Object.entries(value)) {
    const text = String(note || '').trim();
    if (key && text) result[key] = text;
  }
  return result;
}

function normalizeApiDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, note] of Object.entries(value)) {
    const text = String(note || '').trim();
    if (key && text) result[key] = text.slice(0, 20000);
  }
  return result;
}

function normalizeApiNoteFailures(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, failure] of Object.entries(value)) {
    if (!key || !failure || typeof failure !== 'object' || Array.isArray(failure)) continue;
    result[key] = {
      message: String(failure.message || '备注分析失败。').slice(0, 500),
      failedAt: String(failure.failedAt || '')
    };
  }
  return result;
}

function normalizeCaptureTabs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((tab) => ({
    id: String(tab?.id || ''),
    name: String(tab?.name || '').trim(),
    filter: String(tab?.filter || '').trim(),
    displayFilter: String(tab?.displayFilter || '').trim(),
    projectPath: String(tab?.projectPath || '').trim(),
    terminal: normalizeTerminalState(tab?.terminal),
    previewTabs: normalizePreviewWorkspaceTabs(tab?.previewTabs),
    activePreviewTabId: normalizePreviewWorkspaceActiveTabId(tab?.activePreviewTabId, tab?.previewTabs)
  })).filter((tab) => tab.id);
}

function normalizePreviewWorkspaceTabs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((tab) => {
    const type = normalizePreviewWorkspaceTabType(tab?.type);
    const targetId = String(tab?.targetId || '').trim();
    if (!type || !targetId) return null;
    return {
      id: `${type}:${targetId}`,
      type,
      targetId,
      bodyTab: normalizePreviewBodyTab(tab?.bodyTab),
      title: String(tab?.title || '').trim().slice(0, 500)
    };
  }).filter(Boolean).slice(-10);
}

function normalizePreviewWorkspaceTabType(type) {
  const value = String(type || '').trim();
  return ['capture', 'rule', 'remote'].includes(value) ? value : '';
}

function normalizePreviewBodyTab(tab) {
  const value = String(tab || '').trim();
  return ['overview', 'query', 'requestHead', 'request', 'responseHead', 'response'].includes(value)
    ? value
    : 'response';
}

function normalizePreviewWorkspaceActiveTabId(tabId, tabs = []) {
  const id = String(tabId || '').trim();
  const normalizedTabs = normalizePreviewWorkspaceTabs(tabs);
  if (normalizedTabs.some((tab) => tab.id === id)) return id;
  return normalizedTabs.length ? normalizedTabs[normalizedTabs.length - 1].id : '';
}

function normalizeTerminalState(value) {
  const rawTabs = Array.isArray(value?.tabs) ? value.tabs : [];
  const tabs = rawTabs.map((tab, index) => ({
    id: String(tab?.id || '').trim(),
    name: String(tab?.name || '').trim() || (index > 0 ? `本地 (${index + 1})` : '本地')
  })).filter((tab) => tab.id).slice(0, 12);
  const activeId = String(value?.activeId || '').trim();
  return {
    open: value?.open === true,
    activeId: tabs.some((tab) => tab.id === activeId) ? activeId : tabs[0]?.id || '',
    tabs
  };
}

function normalizeDomainHistory(value, tabs = []) {
  const domains = [];
  const pushDomain = (domain) => {
    const normalized = normalizeHostInput(domain);
    if (normalized && !domains.includes(normalized)) domains.push(normalized);
  };
  if (Array.isArray(value)) {
    for (const domain of value) pushDomain(domain);
  }
  if (Array.isArray(tabs)) {
    for (const tab of tabs) pushDomain(tab?.filter);
  }
  return domains.slice(0, 80);
}

function normalizeDomainProjectPaths(value, tabs = []) {
  const result = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [domain, projectPath] of Object.entries(value)) {
      const normalized = normalizeHostInput(domain);
      const normalizedPath = String(projectPath || '').trim();
      if (normalized && normalizedPath) result[normalized] = normalizedPath;
    }
  }
  if (Array.isArray(tabs)) {
    for (const tab of tabs) {
      const normalized = normalizeHostInput(tab?.filter);
      const projectPath = String(tab?.projectPath || '').trim();
      if (normalized && projectPath) result[normalized] = projectPath;
    }
  }
  return result;
}

function normalizeHostInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text.includes('://') ? text : `https://${text}`).hostname;
  } catch {
    return text.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].trim();
  }
}

async function writeJson(filePath, value) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function resolveInside(baseDir, requestedPath) {
  const resolved = path.resolve(baseDir, requestedPath);
  const base = path.resolve(baseDir);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error('Refusing to access a path outside the local files directory.');
  }
  return resolved;
}

async function removeEmptyParents(startDir) {
  const base = path.resolve(config.localsDir);
  let current = path.resolve(startDir);

  while (current !== base && current.startsWith(`${base}${path.sep}`)) {
    try {
      await fs.rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}
