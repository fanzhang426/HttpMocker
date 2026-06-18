import bodyParser from 'body-parser';
import express from 'express';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import {
  clearAdbCaptivePortalUrls,
  clearAdbHttpProxy,
  listAdbDevices,
  readAdbHttpProxy,
  selectAdbDevice,
  setAdbCaptivePortalUrls,
  setAdbHttpProxy,
  adbExecutable
} from './adb-utils.js';
import { config, normalizeMaxRecentRequests } from './config.js';
import {
  clearLocalFiles,
  deleteLocalFile,
  readBufferFile,
  readSettings,
  readState,
  readTextFile,
  updateState,
  writeBufferFile,
  writeTextFile
} from './fs-store.js';
import {
  clearCaptures,
  deleteCaptureGroup,
  findCapture,
  keepLatestCapturePerGroup,
  readCaptures,
  writeCaptures
} from './capture-store.js';
import {
  rememberManagedAdbProxy,
  removeSavedAdbProxySession
} from './adb-proxy-session.js';
import {
  buildCapture,
  bodyForEditor,
  captureRequestKeyWithOptions,
  captureTargetKey,
  createRuleFromCapture,
  hashRequestBody,
  queryIncludesRequired,
  requestBodyForEditor,
  requestBodyIncludesRequired,
  requestBodyFieldsFromText,
  ruleLocalFilePath,
  stripVolatileCapture
} from './match.js';
import {
  applyBodyChanges,
  applyHeaderChanges,
  applyQueryChanges,
  createGlobalRemoteRule,
  createRemoteRuleFromCapture,
  normalizeRemoteSteps,
  orderRemoteRules,
  parseRemoteScript,
  remoteStepCommand,
  remoteRequestBodyFieldsFromText,
  serializeDslSteps,
  updateRemoteRuleFromCapture
} from './remote-rules.js';
import { getLanIps } from './urls.js';
import {
  codexQueueStatus,
  enqueueCodexDetail,
  enqueueCodexNote,
  enqueueMissingCodexNotes,
  getCodexDetail,
  retryCodexNotesForCaptures,
  stopCodexNotes
} from './codex-notes.js';
import { applyPythonRulesForStage } from './python-rules.js';
import { aiRuleQueueStatus, enqueueAiRuleJob, stopAiRuleJobs } from './ai-rule-jobs.js';
import {
  addEventClient,
  emitCapturesChanged,
  emitRulesChanged,
  emitSettingsChanged
} from './events.js';
import {
  terminalInfo
} from './terminal-session.js';
import { cleanupAiTerminalPrompts } from './cache-cleanup.js';
import { getUpdateInfo } from './update-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');
let cachedProxyCa;
let adbTrackChild;
let adbTrackClients = new Set();
let adbTrackLastKey = '';
let adbTrackRefreshTimer;
let adbTrackRefreshInFlight = false;
let adbTrackRefreshPending = false;

const aiProviders = [
  { id: 'codex', label: 'Codex', command: 'codex' },
  { id: 'cursor', label: 'Cursor', command: 'cursor-agent' },
  { id: 'claude', label: 'Claude', command: 'claude' }
];

const duplicateRuleCreateWarning = '已创建规则，但它与已有规则的匹配范围重复，已自动关闭启用。';
const duplicateRuleEditWarning = '已保存规则，但它与已有规则的匹配范围重复，已自动关闭启用。';

export function createApiServer(runtimeControls = {}) {
  const app = express();

  app.use(bodyParser.json({ limit: '20mb' }));
  app.get(['/generate_204', '/gen_204'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
  });
  app.use('/vendor/diff', express.static(path.resolve(__dirname, '..', 'node_modules', 'diff', 'lib'), {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }));
  app.use('/vendor/xterm', express.static(path.resolve(__dirname, '..', 'node_modules', '@xterm', 'xterm'), {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }));
  app.use('/vendor/xterm-addon-fit', express.static(path.resolve(__dirname, '..', 'node_modules', '@xterm', 'addon-fit'), {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }));
  app.use(express.static(publicDir, {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }));

  app.get('/api/health', async (_req, res, next) => {
    try {
      const settings = await readSettings();
      const runtimeStatus = runtimeControls.getRuntimeStatus?.() || {};
      res.json({
        ok: true,
        proxyPort: config.proxyPort,
        uiPort: config.uiPort,
        uiRunning: Boolean(runtimeStatus.uiRunning ?? true),
        proxyRunning: Boolean(runtimeStatus.proxyRunning),
        recordingEnabled: settings.recordingEnabled !== false,
        aiNotesEnabled: settings.aiNotesEnabled !== false,
        codexQueue: combinedCodexQueueStatus(),
        lanIps: getLanIps()
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/update', async (req, res, next) => {
    try {
      res.json(await getUpdateInfo({ force: req.query.force === '1' }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const removeClient = addEventClient(res, {
      codexQueue: combinedCodexQueueStatus()
    });
    req.on('close', removeClient);
  });

  app.get('/api/ai/providers', async (_req, res, next) => {
    try {
      const providers = aiProviders
        .map((provider) => {
          const path = whichCommand(provider.command);
          return {
            ...provider,
            available: Boolean(path),
            path
          };
        })
        .filter((provider) => provider.available);
      res.json({ providers });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/terminal', async (_req, res, next) => {
    try {
      res.json(terminalInfo());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/proxy/start', async (_req, res, next) => {
    try {
      if (!runtimeControls.startProxyRuntime) {
        res.status(501).json({ error: 'Proxy control is not available in this mode.' });
        return;
      }
      await runtimeControls.startProxyRuntime();
      res.json({ ok: true, status: runtimeControls.getRuntimeStatus?.() || {} });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/proxy/stop', async (_req, res, next) => {
    try {
      if (!runtimeControls.stopProxyRuntime) {
        res.status(501).json({ error: 'Proxy control is not available in this mode.' });
        return;
      }
      await runtimeControls.stopProxyRuntime();
      res.json({ ok: true, status: runtimeControls.getRuntimeStatus?.() || {} });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/recording/start', async (_req, res, next) => {
    try {
      const settings = await updateState((state) => {
        state.settings = {
          ...state.settings,
          recordingEnabled: true
        };
        return state.settings;
      });
      res.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/recording/stop', async (_req, res, next) => {
    try {
      const settings = await updateState((state) => {
        state.settings = {
          ...state.settings,
          recordingEnabled: false
        };
        return state.settings;
      });
      res.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/adb/devices', async (_req, res, next) => {
    try {
      res.json({ devices: await listAdbDevices() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/adb/devices/track', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const client = { res, closed: false };
    adbTrackClients.add(client);
    startSharedAdbTracker();
    scheduleSharedAdbDeviceRefresh(0);

    req.on('close', () => {
      client.closed = true;
      adbTrackClients.delete(client);
      if (!adbTrackClients.size) {
        stopSharedAdbTracker();
      }
    });
  });

  app.get('/api/adb/proxy/status', async (_req, res, next) => {
    try {
      const devices = await listAdbDevices();
      const expectedProxy = expectedAdbProxyValue();
      const withProxy = await Promise.all(devices.map(async (device) => {
        if (!device.available) {
          return {
            ...device,
            proxy: '',
            proxyEnabled: false,
            matchesCurrentProxy: false
          };
        }
        const proxy = await readAdbHttpProxy(device.id).catch(() => '');
        return {
          ...device,
          proxy,
          proxyEnabled: Boolean(proxy && proxy !== ':0'),
          matchesCurrentProxy: proxy === expectedProxy
        };
      }));
      res.json({ devices: withProxy, expectedProxy });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/adb/proxy/set', async (req, res, next) => {
    try {
      const devices = await listAdbDevices();
      const selected = selectAdbDevice(devices, req.body?.deviceId);
      if (selected.needsSelection) {
        res.status(409).json({ error: 'Multiple devices connected.', devices });
        return;
      }
      if (!selected.device) {
        res.status(404).json({ error: 'No available adb device.' });
        return;
      }

      const ip = req.body?.host ? String(req.body.host) : getLanIps()[0];
      if (!ip) {
        res.status(400).json({ error: 'No LAN IP available for proxy.' });
        return;
      }
      const proxyValue = `${ip}:${config.proxyPort}`;
      await setAdbHttpProxy(selected.device.id, proxyValue);
      const captivePortalUrl = `http://${ip}:${config.uiPort}/generate_204`;
      await setAdbCaptivePortalUrls(selected.device.id, captivePortalUrl);
      await rememberManagedAdbProxy(selected.device, proxyValue, captivePortalUrl);
      res.json({ ok: true, device: selected.device, proxy: proxyValue, captivePortalUrl });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/adb/proxy/clear', async (req, res, next) => {
    try {
      const devices = await listAdbDevices();
      const selected = selectAdbDevice(devices, req.body?.deviceId);
      if (selected.needsSelection) {
        res.status(409).json({ error: 'Multiple devices connected.', devices });
        return;
      }
      if (!selected.device) {
        res.status(404).json({ error: 'No available adb device.' });
        return;
      }

      await clearAdbHttpProxy(selected.device.id);
      await clearAdbCaptivePortalUrls(selected.device.id);
      await removeSavedAdbProxySession();
      res.json({ ok: true, device: selected.device });
    } catch (error) {
      next(error);
    }
  });

  app.get('/ca.pem', (_req, res) => {
    res.download(path.join(config.certsDir, 'certs', 'ca.pem'), 'http-mocker-ca.pem');
  });

  app.get('/api/captures', async (_req, res, next) => {
    try {
      const [settings, captures] = await Promise.all([
        readSettings(),
        readCaptures()
      ]);
      res.json({
        captures: groupedCaptureSummaries(captures, settings)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/search', async (req, res, next) => {
    try {
      const query = String(req.query?.q || '').trim();
      if (!query) {
        res.json({ query: '', domain: currentSearchDomain(await readSettings(), req.query?.domain), groups: [] });
        return;
      }
      const [settings, captures] = await Promise.all([
        readSettings(),
        readCaptures()
      ]);
      res.json(searchCaptures(captures, settings, query, req.query?.domain));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/settings', async (_req, res, next) => {
    try {
      res.json({ settings: await readSettings() });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/settings', async (req, res, next) => {
    try {
      const settings = await updateState((state) => {
        const body = req.body || {};
        state.settings = {
          ...state.settings
        };
        if (Object.hasOwn(body, 'captureFilter')) {
          state.settings.captureFilter = String(body.captureFilter || '');
        }
        if (Object.hasOwn(body, 'displayFilter')) {
          state.settings.displayFilter = String(body.displayFilter || '');
        }
        if (Object.hasOwn(body, 'recordingEnabled')) {
          state.settings.recordingEnabled = body.recordingEnabled !== false;
        }
        if (Object.hasOwn(body, 'captureMergeRules') && isPlainObject(body.captureMergeRules)) {
          const nextCaptureMergeRules = normalizeCaptureMergeRules(body.captureMergeRules);
          if (body.validateCaptureMergeRules === true) {
            assertNoCaptureMergeRuleConflict(nextCaptureMergeRules, body.captureMergeValidation);
          }
          state.settings.captureMergeRules = nextCaptureMergeRules;
        }
        if (Object.hasOwn(body, 'captureMergeEnabled')) {
          state.settings.captureMergeEnabled = body.captureMergeEnabled !== false;
        }
        if (Object.hasOwn(body, 'captureTreeViewEnabled')) {
          state.settings.captureTreeViewEnabled = body.captureTreeViewEnabled === true;
        }
        if (Object.hasOwn(body, 'captureTabs') && Array.isArray(body.captureTabs)) {
          state.settings.captureTabs = normalizeCaptureTabs(body.captureTabs);
        }
        if (Object.hasOwn(body, 'activeCaptureTabId')) {
          state.settings.activeCaptureTabId = String(body.activeCaptureTabId || '');
        }
        if (Object.hasOwn(body, 'domainHistory') && Array.isArray(body.domainHistory)) {
          state.settings.domainHistory = normalizeDomainHistory(body.domainHistory, state.settings.captureTabs);
        }
        if (Object.hasOwn(body, 'domainProjectPaths')) {
          state.settings.domainProjectPaths = normalizeDomainProjectPaths(body.domainProjectPaths, state.settings.captureTabs);
        }
        if (Object.hasOwn(body, 'domainProjectsInitialized')) {
          state.settings.domainProjectsInitialized = body.domainProjectsInitialized === true;
        }
        if (Object.hasOwn(body, 'requireDomainHistorySelection')) {
          state.settings.requireDomainHistorySelection = body.requireDomainHistorySelection === true;
        }
        if (Object.hasOwn(body, 'aiNotesEnabled')) {
          state.settings.aiNotesEnabled = body.aiNotesEnabled !== false;
        }
        if (Object.hasOwn(body, 'aiProvider')) {
          state.settings.aiProvider = normalizeAiProvider(body.aiProvider);
        }
        if (Object.hasOwn(body, 'language')) {
          state.settings.language = normalizeLanguage(body.language);
        }
        if (Object.hasOwn(body, 'appearance')) {
          state.settings.appearance = normalizeAppearance(body.appearance);
        }
        if (Object.hasOwn(body, 'showListNotes')) {
          state.settings.showListNotes = body.showListNotes !== false;
        }
        if (Object.hasOwn(body, 'maxRecentRequests')) {
          state.settings.maxRecentRequests = normalizeMaxRecentRequests(body.maxRecentRequests);
        }
        return state.settings;
      });
      res.json({ settings });
      emitSettingsChanged({ reason: 'settings' });
      const settingsBody = req.body || {};
      if (Object.hasOwn(settingsBody, 'appearance')) {
        runtimeControls.applyNativeAppearance?.(settings.appearance);
      }
      if (Object.hasOwn(settingsBody, 'maxRecentRequests')) {
        await writeCaptures(await readCaptures());
      }
      if (
        Object.hasOwn(settingsBody, 'captureMergeRules') ||
        Object.hasOwn(settingsBody, 'captureMergeEnabled') ||
        Object.hasOwn(settingsBody, 'captureTreeViewEnabled') ||
        Object.hasOwn(settingsBody, 'maxRecentRequests')
      ) {
        emitCapturesChanged({ mode: 'snapshot', reason: 'mergeRules' });
      }
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/notes', async (req, res, next) => {
    try {
      const key = String(req.body?.key || '');
      const note = String(req.body?.note || '').trim();
      if (!key) {
        res.status(400).json({ error: 'Missing note key.' });
        return;
      }
      const settings = await updateState((state) => {
        state.settings = {
          ...state.settings,
          apiNotes: {
            ...(state.settings?.apiNotes || {})
          }
        };
        if (note) {
          state.settings.apiNotes[key] = note;
          if (state.settings.apiNoteFailures?.[key]) {
            state.settings.apiNoteFailures = {
              ...(state.settings.apiNoteFailures || {})
            };
            delete state.settings.apiNoteFailures[key];
          }
        } else {
          delete state.settings.apiNotes[key];
        }
        return state.settings;
      });
      res.json({ ok: true, key, note: settings.apiNotes?.[key] || '' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/project-path/select', async (_req, res, next) => {
    try {
      if (!runtimeControls.selectProjectDirectory) {
        res.status(501).json({ error: '路径选择器只在 macOS App 中可用。' });
        return;
      }
      const projectPath = await runtimeControls.selectProjectDirectory();
      res.json({ projectPath: projectPath || '' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/codex-notes/start', async (_req, res, next) => {
    try {
      await updateState((state) => {
        state.settings = {
          ...state.settings,
          aiNotesEnabled: true
        };
      });
      const result = await enqueueMissingCodexNotes();
      res.json({ ok: true, settings: await readSettings(), ...result });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/codex-notes/stop', async (_req, res, next) => {
    try {
      stopCodexNotes();
      const settings = await updateState((state) => {
        state.settings = {
          ...state.settings,
          aiNotesEnabled: false
        };
        return state.settings;
      });
      res.json({ ok: true, settings, status: combinedCodexQueueStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/ai/stop', async (_req, res, next) => {
    try {
      stopCodexNotes();
      await stopAiRuleJobs();
      const settings = await updateState((state) => {
        state.settings = {
          ...state.settings,
          aiNotesEnabled: false
        };
        return state.settings;
      });
      res.json({ ok: true, settings, status: combinedCodexQueueStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/ai/start', async (_req, res, next) => {
    try {
      await updateState((state) => {
        state.settings = {
          ...state.settings,
          aiNotesEnabled: true
        };
      });
      const result = await enqueueMissingCodexNotes();
      res.json({ ok: true, settings: await readSettings(), status: combinedCodexQueueStatus(), queued: result.queued });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/ai/terminal-session', async (req, res, next) => {
    try {
      const provider = normalizeAiProvider(req.body?.provider);
      if (provider === 'none') {
        res.status(400).json({ error: 'AI provider is not selected.' });
        return;
      }
      const providerInfo = aiProviders.find((item) => item.id === provider);
      const commandPath = providerInfo ? whichCommand(providerInfo.command) : '';
      if (!providerInfo || !commandPath) {
        res.status(404).json({ error: `${providerInfo?.label || provider} CLI is not available.` });
        return;
      }
      const projectPath = normalizeProjectPath(req.body?.projectPath);
      if (!projectPath) {
        res.status(400).json({ error: 'Project path is required.' });
        return;
      }
      const prompt = String(req.body?.prompt || '').trim();
      if (!prompt) {
        res.status(400).json({ error: 'Prompt is required.' });
        return;
      }
      const promptPath = await writeAiTerminalPrompt(prompt);
      res.json({
        ok: true,
        provider,
        promptPath,
        command: aiTerminalCommand(provider, projectPath, promptPath)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/codex-notes/retry', async (_req, res, next) => {
    try {
      const result = await retryCodexNotesForCaptures(await readCaptures());
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/codex-notes/enqueue-missing', async (_req, res, next) => {
    try {
      const result = await enqueueMissingCodexNotes();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/captures/:id/analyze-note', async (req, res, next) => {
    try {
      const capture = await findCapture(req.params.id);
      if (!capture) {
        res.status(404).json({ error: 'Capture not found.' });
        return;
      }
      const queued = await enqueueCodexNote(capture, { force: true });
      res.json({ queued, status: codexQueueStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/captures/:id/detail-note', async (req, res, next) => {
    try {
      const capture = await findCapture(req.params.id);
      if (!capture) {
        res.status(404).json({ error: 'Capture not found.' });
        return;
      }
      res.json({ detail: await getCodexDetail(capture), failure: detailFailureForItem(await readState(), capture), status: codexQueueStatus().details });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/captures/:id/detail-note', async (req, res, next) => {
    try {
      const capture = await findCapture(req.params.id);
      if (!capture) {
        res.status(404).json({ error: 'Capture not found.' });
        return;
      }
      const queued = await enqueueCodexDetail(capture, { force: Boolean(req.body?.force) });
      res.json({ queued, detail: await getCodexDetail(capture), failure: detailFailureForItem(await readState(), capture), status: codexQueueStatus().details });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rules/:id/analyze-note', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.rules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }
      const queued = await enqueueCodexNote(captureLikeForNoteQueue(rule), { force: true });
      res.json({ queued, status: codexQueueStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/rules/:id/detail-note', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.rules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }
      const capture = captureLikeForNoteQueue(rule);
      res.json({ detail: await getCodexDetail(capture), failure: detailFailureForItem(state, capture), status: codexQueueStatus().details });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rules/:id/detail-note', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.rules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }
      const capture = captureLikeForNoteQueue(rule);
      const queued = await enqueueCodexDetail(capture, { force: Boolean(req.body?.force) });
      res.json({ queued, detail: await getCodexDetail(capture), failure: detailFailureForItem(await readState(), capture), status: codexQueueStatus().details });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/remote-rules/:id/analyze-note', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.remoteRules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Remote rule not found.' });
        return;
      }
      const queued = await enqueueCodexNote(captureLikeForNoteQueue(rule), { force: true });
      res.json({ queued, status: codexQueueStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/remote-rules/:id/detail-note', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.remoteRules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Remote rule not found.' });
        return;
      }
      const capture = captureLikeForNoteQueue(rule);
      res.json({ detail: await getCodexDetail(capture), failure: detailFailureForItem(state, capture), status: codexQueueStatus().details });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/remote-rules/:id/detail-note', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.remoteRules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Remote rule not found.' });
        return;
      }
      const capture = captureLikeForNoteQueue(rule);
      const queued = await enqueueCodexDetail(capture, { force: Boolean(req.body?.force) });
      res.json({ queued, detail: await getCodexDetail(capture), failure: detailFailureForItem(await readState(), capture), status: codexQueueStatus().details });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/captures/:id', async (req, res, next) => {
    try {
      const [state, capture] = await Promise.all([
        readState(),
        findCapture(req.params.id)
      ]);
      if (!capture) {
        res.status(404).json({ error: 'Capture not found.' });
        return;
      }
      res.json({
        ...stripVolatileCapture(capture),
        mergeKey: captureTargetKey(capture),
        mergeOptions: captureMergeOptions(state, capture),
        note: noteForItem(state, capture),
        ...bodyForEditor(capture),
        requestBody: requestBodyForEditor(capture)
      });
    } catch (error) {
      next(error);
    }
  });

  const saveCaptureAsLocal = async (req, res, next) => {
    try {
      const capture = await findCapture(req.params.id);
      if (!capture) {
        res.status(404).json({ error: 'Capture not found.' });
        return;
      }
      if (capture.bodySkippedReason && !capture.bodyBase64) {
        res.status(422).json({ error: '当前响应体未保存，只能预览摘要，不能配置为本地映射。' });
        return;
      }

      const result = await updateState(async (state) => {
        const nextRule = createRuleFromCapture(capture, {
          queryMode: req.body?.queryMode === 'ignore' ? 'ignore' : 'exact'
        });
        const editorBody = bodyForEditor(capture);
        if (editorBody.editable) {
          await writeTextFile(nextRule.filePath, editorBody.body);
        } else {
          await writeBufferFile(nextRule.filePath, Buffer.from(capture.bodyBase64 || '', 'base64'));
        }

        const duplicateRule = findDuplicateRule(state, nextRule);
        if (duplicateRule) {
          nextRule.enabled = false;
        }
        state.rules = [nextRule, ...(state.rules || [])];

        return {
          rule: nextRule,
          warning: duplicateRule ? duplicateRuleCreateWarning : ''
        };
      });

      res.status(201).json(result);
      const currentState = await readState();
      emitRulesChanged({ kind: 'local', action: 'upsert', rule: withNoteForRule(result.rule, currentState) });
    } catch (error) {
      next(error);
    }
  };

  app.post('/api/captures/:id/local', saveCaptureAsLocal);

  app.post('/api/captures/:id/remote-rule', async (req, res, next) => {
    try {
      const capture = await findCapture(req.params.id);
      if (!capture) {
        res.status(404).json({ error: 'Capture not found.' });
        return;
      }

      const result = await updateState((state) => {
        let rule = createRemoteRuleFromCapture(capture);
        const existingRule = (state.remoteRules || []).find((item) => sameRemoteRuleSaveTarget(item, rule));
        if (existingRule) {
          updateRemoteRuleFromCapture(existingRule, capture);
          rule = existingRule;
          const duplicateRule = findDuplicateRule(state, rule, { excludeId: rule.id });
          if (duplicateRule) {
            rule.enabled = false;
          }
          state.remoteRules = [
            ...(state.remoteRules || []).filter((item) => item.scope === 'global'),
            rule,
            ...(state.remoteRules || []).filter((item) => item.scope !== 'global' && item.id !== rule.id)
          ];
          return {
            rule,
            warning: duplicateRule ? duplicateRuleEditWarning : ''
          };
        }

        const duplicateRule = findDuplicateRule(state, rule);
        if (duplicateRule) {
          rule.enabled = false;
        }

        state.remoteRules = [
          ...(state.remoteRules || []).filter((item) => item.scope === 'global'),
          rule,
          ...(state.remoteRules || []).filter((item) => item.scope !== 'global')
        ];
        return {
          rule,
          warning: duplicateRule ? duplicateRuleCreateWarning : ''
        };
      });

      res.status(201).json(result);
      const currentState = await readState();
      emitRulesChanged({ kind: 'remote', action: 'upsert', rule: withNoteForRule(result.rule, currentState) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/captures/history', async (_req, res, next) => {
    try {
      const settings = await readSettings();
      const result = await keepLatestCapturePerGroup((capture, keptCaptures = []) => {
        const existing = bestCaptureMergeCapture(keptCaptures, capture, settings);
        return existing ? existing.id : capture.id;
      });
      res.json({ ok: true, ...result });
      emitCapturesChanged({ mode: 'snapshot', reason: 'clearOlder' });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/captures/:id', async (req, res, next) => {
    try {
      const settings = await readSettings();
      const result = await deleteCaptureGroup((capture, target) => {
        if (!target) return capture.id === req.params.id;
        return sameCaptureMergeGroup(target, capture, settings);
      });
      res.status(result.removed ? 204 : 404).end();
      if (result.removed) {
        emitCapturesChanged({ mode: 'snapshot', reason: 'deleteGroup' });
      }
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/captures', async (_req, res, next) => {
    try {
      await clearCaptures();
      res.status(204).end();
      emitCapturesChanged({ mode: 'clear', reason: 'clearAll' });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/notes', async (_req, res, next) => {
    try {
      await updateState((state) => {
        state.settings = {
          ...state.settings,
          apiNotes: {},
          apiNoteFailures: {},
          apiDetails: {},
          apiDetailFailures: {}
        };
      });
      res.status(204).end();
      emitSettingsChanged({ reason: 'clearNotes' });
      emitCapturesChanged({ mode: 'snapshot', reason: 'clearNotes' });
      emitRulesChanged({ kind: 'all', action: 'snapshot', reason: 'clearNotes' });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/rules/all', async (_req, res, next) => {
    try {
      await updateState((state) => {
        state.rules = [];
        state.remoteRules = [];
      });
      await clearLocalFiles();
      res.status(204).end();
      emitRulesChanged({ kind: 'all', action: 'snapshot', reason: 'clearRules' });
      emitCapturesChanged({ mode: 'snapshot', reason: 'clearRules' });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/data', async (_req, res, next) => {
    try {
      await updateState((state) => {
        state.rules = [];
        state.remoteRules = [];
        state.settings = {
          ...state.settings,
          captureMergeRules: {},
          apiNotes: {},
          apiNoteFailures: {},
          apiDetails: {},
          apiDetailFailures: {}
        };
      });
      await clearCaptures();
      await clearLocalFiles();
      res.status(204).end();
      emitCapturesChanged({ mode: 'clear', reason: 'clearData' });
      emitRulesChanged({ kind: 'all', action: 'snapshot', reason: 'clearData' });
      emitSettingsChanged({ reason: 'clearData' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/repeat', async (req, res, next) => {
    try {
      const source = String(req.body?.source || '');
      const id = String(req.body?.id || '');
      const [state, captures] = await Promise.all([
        readState(),
        source === 'capture' ? readCaptures() : Promise.resolve([])
      ]);
      const target = repeatTargetFromState(state, source, id, captures);
      if (!target) {
        res.status(404).json({ error: 'Repeat target not found.' });
        return;
      }

      const repeated = await repeatRequest(target);

      res.json({
        ok: true,
        target: repeated
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/rules', async (_req, res, next) => {
    try {
      const state = await readState();
      enqueueMissingRuleNotes(state, state.rules || []);
      res.json({ rules: state.rules || [] });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/remote-rules', async (_req, res, next) => {
    try {
      const state = await readState();
      enqueueMissingRuleNotes(state, state.remoteRules || []);
      res.json({ rules: orderRemoteRules(state.remoteRules || []) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/remote-rules/global', async (req, res, next) => {
    try {
      const created = await updateState((state) => {
        const rule = createGlobalRemoteRule({ host: req.body?.host });
        state.remoteRules = [rule, ...(state.remoteRules || [])];
        return rule;
      });
      res.status(201).json({ rule: created });
      const currentState = await readState();
      emitRulesChanged({ kind: 'remote', action: 'upsert', rule: withNoteForRule(created, currentState) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/remote-rules/:id', async (req, res, next) => {
    try {
      const result = await updateState((state) => {
        const rule = (state.remoteRules || []).find((item) => item.id === req.params.id);
        if (!rule) return null;

        const duplicateRelevantKeys = new Set(['enabled', 'host', 'queryMode', 'query', 'requestBodyMode']);
        let shouldCheckDuplicate = false;
        const previousDuplicateSignature = duplicateMatchSignature(rule);
        const allowed = [
          'enabled',
          'host',
          'queryMode',
          'query',
          'requestBodyMode',
          'script',
          'scriptType',
          'pythonScript',
          'aiSummary',
          'note'
        ];
        for (const key of allowed) {
          if (Object.hasOwn(req.body || {}, key)) {
            if (duplicateRelevantKeys.has(key)) {
              shouldCheckDuplicate = true;
            }
            if (key === 'query') {
              rule[key] = String(req.body[key] || '').replace(/^\?/, '');
            } else if (key === 'host' && rule.scope !== 'global') {
              rule[key] = normalizeHostInput(req.body[key]);
            } else if (key === 'host') {
              continue;
            } else if (key === 'requestBodyMode') {
              rule[key] = req.body[key] === 'ignore' ? 'ignore' : 'exact';
            } else if (key === 'scriptType') {
              rule[key] = req.body[key] === 'python' ? 'python' : 'dsl';
            } else if (key === 'pythonScript' || key === 'aiSummary') {
              rule[key] = String(req.body[key] || '');
            } else if (key === 'note') {
              rule[key] = String(req.body[key] || '').trim().slice(0, 500);
            } else {
              rule[key] = req.body[key];
            }
          }
        }
        rule.updatedAt = new Date().toISOString();
        const warning = shouldCheckDuplicate && duplicateMatchSignature(rule) !== previousDuplicateSignature
          ? (assertNoDuplicateRule(state, rule), '')
          : '';
        return { rule, warning };
      });

      if (!result) {
        res.status(404).json({ error: 'Remote rule not found.' });
        return;
      }

      res.json(result);
      const currentState = await readState();
      emitRulesChanged({ kind: 'remote', action: 'upsert', rule: withNoteForRule(result.rule, currentState) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/remote-rules/:id/editor', async (req, res, next) => {
    try {
      const result = await updateState((state) => {
        const rule = (state.remoteRules || []).find((item) => item.id === req.params.id);
        if (!rule) return null;
        const previousDuplicateSignature = duplicateMatchSignature(rule);

        if (Object.hasOwn(req.body || {}, 'query')) {
          rule.query = String(req.body.query ?? '').replace(/^\?/, '');
        }
        if (Object.hasOwn(req.body || {}, 'host') && rule.scope !== 'global') {
          rule.host = normalizeHostInput(req.body.host);
        }
        if (Object.hasOwn(req.body || {}, 'enabled') && rule.scope === 'global') {
          rule.enabled = req.body.enabled !== false;
        }
        if (Object.hasOwn(req.body || {}, 'queryMode')) {
          rule.queryMode = req.body.queryMode === 'ignore' ? 'ignore' : 'exact';
        }
        if (Object.hasOwn(req.body || {}, 'script')) {
          rule.script = String(req.body.script ?? '');
        }
        if (Object.hasOwn(req.body || {}, 'scriptType')) {
          rule.scriptType = req.body.scriptType === 'python' ? 'python' : 'dsl';
        }
        if (Object.hasOwn(req.body || {}, 'pythonScript')) {
          rule.pythonScript = String(req.body.pythonScript ?? '');
          if (rule.pythonScript) {
            rule.scriptType = 'python';
          }
        }
        if (Object.hasOwn(req.body || {}, 'aiSummary')) {
          rule.aiSummary = String(req.body.aiSummary ?? '').trim();
        }
        if (Object.hasOwn(req.body || {}, 'note')) {
          rule.note = String(req.body.note ?? '').trim().slice(0, 500);
        }
        if (Object.hasOwn(req.body || {}, 'requestBody')) {
          const requestBody = String(req.body.requestBody ?? '');
          const contentType = requestContentTypeForRemoteBody(
            requestBody,
            req.body?.requestContentType,
            rule.requestContentType
          );
          Object.assign(rule, remoteRequestBodyFieldsFromText(requestBody, contentType));
        }
        if (Object.hasOwn(req.body || {}, 'requestBodyMode')) {
          rule.requestBodyMode = req.body.requestBodyMode === 'ignore' ? 'ignore' : 'exact';
        }
        if (Array.isArray(req.body?.steps)) {
          rule.steps = normalizeRemoteSteps({ steps: req.body.steps });
          rule.script = serializeDslSteps(rule.steps);
          syncRemoteStepsMetadata(rule);
        }

        rule.updatedAt = new Date().toISOString();
        if (duplicateMatchSignature(rule) !== previousDuplicateSignature) {
          assertNoDuplicateRule(state, rule);
        }
        state.remoteRules = rule.scope === 'global'
          ? [rule, ...(state.remoteRules || []).filter((item) => item.id !== rule.id)]
          : [
            ...(state.remoteRules || []).filter((item) => item.scope === 'global'),
            rule,
            ...(state.remoteRules || []).filter((item) => item.scope !== 'global' && item.id !== rule.id)
          ];
        return { rule, warning: '' };
      });

      if (!result) {
        res.status(404).json({ error: 'Remote rule not found.' });
        return;
      }

      res.json(result);
      const currentState = await readState();
      emitRulesChanged({ kind: 'remote', action: 'upsert', rule: withNoteForRule(result.rule, currentState) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/remote-rules/:id', async (req, res, next) => {
    try {
      const deleted = await updateState((state) => {
        const before = (state.remoteRules || []).length;
        state.remoteRules = (state.remoteRules || []).filter((item) => item.id !== req.params.id);
        return before !== state.remoteRules.length;
      });
      res.status(deleted ? 204 : 404).end();
      if (deleted) {
        emitRulesChanged({ kind: 'remote', action: 'delete', id: req.params.id });
      }
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/remote-rules/:id/body', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.remoteRules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Remote rule not found.' });
        return;
      }
      res.json({
        requestBody: requestBodyForEditor(rule)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/remote-rules/:id/preview', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.remoteRules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Remote rule not found.' });
        return;
      }

      const responseBaseCapture = remoteRuleExampleCapture(rule);
      const script = Object.hasOwn(req.body || {}, 'script')
        ? String(req.body.script ?? '')
        : String(rule.script || '');
      const query = Object.hasOwn(req.body || {}, 'query')
        ? String(req.body.query ?? '').replace(/^\?/, '')
        : String(rule.scope === 'global' ? responseBaseCapture?.query || '' : rule.query || '');
      const requestBody = Object.hasOwn(req.body || {}, 'requestBody')
        ? String(req.body.requestBody ?? '')
        : String(rule.scope === 'global'
          ? requestBodyForEditor(responseBaseCapture).body
          : requestBodyForEditor(rule).body);
      const requestContentType = requestContentTypeForRemoteBody(
        requestBody,
        req.body?.requestContentType,
        rule.scope === 'global' ? responseBaseCapture?.requestContentType : rule.requestContentType
      );
      const editorSteps = Array.isArray(req.body?.steps) ? req.body.steps : null;
      const globalPreviewRules = matchingGlobalRemoteRulesForPreview(state, rule);
      if (editorSteps || Array.isArray(rule.steps) || globalPreviewRules.length) {
        const result = await previewRemoteStepsRule({
          rule,
          steps: remotePreviewStepsForRule(rule, editorSteps, globalPreviewRules),
          query,
          requestBody,
          requestContentType,
          responseBaseCapture
        });
        res.json(result);
        return;
      }

      const scriptType = req.body?.scriptType === 'python' || rule.scriptType === 'python' || rule.pythonScript
        ? 'python'
        : 'dsl';
      const pythonScript = Object.hasOwn(req.body || {}, 'pythonScript')
        ? String(req.body.pythonScript ?? '')
        : String(rule.pythonScript || '');
      if (scriptType === 'python') {
        const result = await previewPythonRemoteRuleForJob({ rule, query, requestBody, requestContentType, responseBaseCapture, pythonScript });
        res.json(result);
        return;
      }
      const parsedScript = parseRemoteScript(script);
      const requestBodyResult = applyBodyChanges(
        Buffer.from(requestBody, 'utf8'),
        requestContentType,
        parsedScript.commands.filter((command) => command.action === 'change_req_body')
      );
      const effectiveUrl = applyQueryChanges(
        previewBaseUrl(rule, responseBaseCapture, query),
        parsedScript.commands.filter((command) => command.action === 'change_query')
      );
      const effectiveParsed = new URL(effectiveUrl);
      const requestHeadersResult = applyHeaderChanges(
        previewRequestHeaders(rule, requestContentType, requestBodyResult.buffer.length),
        parsedScript.commands.filter((command) => command.action === 'change_req_head')
      );
      if (requestBodyResult.changed) {
        syncPreviewBodyHeaders(requestHeadersResult.headers, requestBodyResult.buffer);
      }

      const responseHeadersResult = applyHeaderChanges(
        responseBaseCapture?.responseHeaders || {},
        parsedScript.commands.filter((command) => command.action === 'change_resp_head')
      );
      const responseBodySource = responseBaseCapture
        ? bodyForEditor(responseBaseCapture)
        : { editable: false, body: '', note: '没有保存拦截修改示例响应。' };
      const responseContentType = responseBaseCapture?.contentType || '';
      let responsePreview = responseBodySource.body || responseBodySource.note || '';
      let responseChanged = false;

      if (responseBodySource.editable) {
        const responseBodyResult = applyBodyChanges(
          Buffer.from(responsePreview, 'utf8'),
          responseContentType,
          parsedScript.commands.filter((command) => command.action === 'change_resp_body')
        );
        responsePreview = formatPreviewBody(responseBodyResult.buffer, responseContentType);
        responseChanged = responseBodyResult.changed;
        if (responseChanged) {
          syncPreviewBodyHeaders(responseHeadersResult.headers, responseBodyResult.buffer);
        }
      }

      res.json({
        errors: parsedScript.errors,
        effectiveUrl,
        request: {
          contentType: requestContentType,
          beforeHeaders: previewRequestHeaders(rule, requestContentType, Buffer.byteLength(String(requestBody ?? ''), 'utf8')),
          headers: requestHeadersResult.headers,
          beforeBody: formatPreviewBody(Buffer.from(String(requestBody ?? ''), 'utf8'), requestContentType),
          body: formatPreviewBody(requestBodyResult.buffer, requestContentType),
          changed: requestBodyResult.changed || requestHeadersResult.changed
        },
        response: {
          contentType: responseContentType,
          beforeHeaders: responseBaseCapture?.responseHeaders || {},
          headers: responseHeadersResult.headers,
          beforeBody: responseBodySource.body || responseBodySource.note || '',
          body: responsePreview,
          changed: responseChanged || responseHeadersResult.changed,
          sourceCaptureId: responseBaseCapture?.id || null
        },
        query: {
          beforeBody: query,
          body: effectiveParsed.search ? effectiveParsed.search.slice(1) : '',
          changed: effectiveUrl !== previewBaseUrl(rule, responseBaseCapture, query)
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/remote-rules/:id/ai-generate', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = (state.remoteRules || []).find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Remote rule not found.' });
        return;
      }

      const query = Object.hasOwn(req.body || {}, 'query')
        ? String(req.body.query ?? '').replace(/^\?/, '')
        : String(rule.query || '');
      const stepId = String(req.body?.stepId || '');
      const editorSteps = Array.isArray(req.body?.steps)
        ? normalizeRemoteSteps({ steps: req.body.steps })
        : null;
      const steps = editorSteps || normalizeRemoteSteps(rule);
      const targetStep = steps.find((step) => step.id === stepId && step.type === 'ai');
      if (!targetStep) {
        res.status(404).json({ error: 'AI rule step not found.' });
        return;
      }
      const capture = remoteRuleExampleCapture(rule);
      const requestBody = Object.hasOwn(req.body || {}, 'requestBody')
        ? String(req.body.requestBody ?? '')
        : requestBodyForEditor(rule).body;
      const requestContentType = requestContentTypeForRemoteBody(
        requestBody,
        req.body?.requestContentType,
        rule.requestContentType
      );
      if (editorSteps) {
        await updateState((store) => {
          const target = (store.remoteRules || []).find((item) => item.id === req.params.id);
          if (!target) return null;
          target.steps = editorSteps;
          target.script = serializeDslSteps(editorSteps);
          syncRemoteStepsMetadata(target);
          target.updatedAt = new Date().toISOString();
          return target;
        });
      }
      const queued = await enqueueAiRuleJob({
        ruleId: req.params.id,
        stepId,
        prompt: req.body?.prompt,
        pythonScript: req.body?.pythonScript,
        userSummary: req.body?.userSummary,
        query,
        requestBody,
        requestContentType
      });
      res.status(202).json(queued);
      emitRulesChanged({ kind: 'remote', action: 'snapshot', reason: 'aiQueued' });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/rules/:id', async (req, res, next) => {
    try {
      const result = await updateState((state) => {
        const rule = state.rules.find((item) => item.id === req.params.id);
        if (!rule) return null;

        const duplicateRelevantKeys = new Set(['enabled', 'queryMode', 'query', 'requestBodyMode']);
        let shouldCheckDuplicate = false;
        const previousDuplicateSignature = duplicateMatchSignature(rule);
        const allowed = ['enabled', 'statusCode', 'contentType', 'queryMode', 'query', 'requestBodyMode', 'note'];
        for (const key of allowed) {
          if (Object.hasOwn(req.body || {}, key)) {
            if (duplicateRelevantKeys.has(key)) {
              shouldCheckDuplicate = true;
            }
            if (key === 'requestBodyMode') {
              rule[key] = req.body[key] === 'ignore' ? 'ignore' : 'exact';
            } else if (key === 'note') {
              rule[key] = String(req.body[key] || '').trim().slice(0, 500);
            } else {
              rule[key] = req.body[key];
            }
          }
        }
        rule.updatedAt = new Date().toISOString();
        const warning = shouldCheckDuplicate && duplicateMatchSignature(rule) !== previousDuplicateSignature
          ? (assertNoDuplicateRule(state, rule), '')
          : '';
        return { rule, warning };
      });

      if (!result) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }

      res.json(result);
      const currentState = await readState();
      emitRulesChanged({ kind: 'local', action: 'upsert', rule: withNoteForRule(result.rule, currentState) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/rules/:id/editor', async (req, res, next) => {
    try {
      const result = await updateState(async (state) => {
        const rule = state.rules.find((item) => item.id === req.params.id);
        if (!rule) return null;

        const previousPath = rule.filePath;
        const previousDuplicateSignature = duplicateMatchSignature(rule);
        const responseBody = Object.hasOwn(req.body || {}, 'responseBody')
          ? String(req.body.responseBody ?? '')
          : await readTextFile(rule.filePath);

        if (Object.hasOwn(req.body || {}, 'query')) {
          rule.query = String(req.body.query ?? '').replace(/^\?/, '');
        }
        if (Object.hasOwn(req.body || {}, 'queryMode')) {
          rule.queryMode = req.body.queryMode === 'ignore' ? 'ignore' : 'exact';
        }
        if (Object.hasOwn(req.body || {}, 'requestBodyMode')) {
          rule.requestBodyMode = req.body.requestBodyMode === 'ignore' ? 'ignore' : 'exact';
        }

        if (Object.hasOwn(req.body || {}, 'requestBody')) {
          const requestBody = String(req.body.requestBody ?? '');
          const contentType = String(
            req.body?.requestContentType ||
            rule.requestContentType ||
            rule.requestHeaders?.['content-type'] ||
            (requestBody ? 'text/plain; charset=utf-8' : '')
          );
          Object.assign(rule, requestBodyFieldsFromText(requestBody, contentType));
          rule.requestHeaders = {
            ...(rule.requestHeaders || {})
          };
          if (contentType) {
            rule.requestHeaders['content-type'] = contentType;
          } else {
            delete rule.requestHeaders['content-type'];
          }
          delete rule.requestHeaders['content-length'];
          delete rule.requestHeaders['content-encoding'];
        }

        const nextFilePath = ruleLocalFilePath(rule);
        rule.updatedAt = new Date().toISOString();

        if (duplicateMatchSignature(rule) !== previousDuplicateSignature) {
          assertNoDuplicateRule(state, rule);
        }
        rule.filePath = nextFilePath;
        await writeTextFile(rule.filePath, responseBody);
        state.rules = [
          rule,
          ...state.rules.filter((item) => item.id !== rule.id)
        ];

        const pathsToMaybeDelete = [
          previousPath
        ].filter((filePath) => filePath && filePath !== rule.filePath);
        await Promise.all(unique(pathsToMaybeDelete)
          .filter((filePath) => !state.rules.some((item) => item.filePath === filePath))
          .map((filePath) => deleteLocalFile(filePath)));

        return { rule, warning: '' };
      });

      if (!result) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }

      res.json(result);
      const currentState = await readState();
      emitRulesChanged({ kind: 'local', action: 'upsert', rule: withNoteForRule(result.rule, currentState) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/rules/:id', async (req, res, next) => {
    try {
      const deleted = await updateState(async (state) => {
        const deletedRule = state.rules.find((item) => item.id === req.params.id);
        if (!deletedRule) return false;

        state.rules = state.rules.filter((item) => item.id !== req.params.id);
        if (deletedRule.filePath) {
          await deleteLocalFile(deletedRule.filePath);
        }
        return true;
      });
      res.status(deleted ? 204 : 404).end();
      if (deleted) {
        emitRulesChanged({ kind: 'local', action: 'delete', id: req.params.id });
      }
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/rules/:id/body', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = state.rules.find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }
      const body = await readTextFile(rule.filePath);
      res.json({
        body,
        filePath: rule.filePath,
        requestBody: requestBodyForEditor(rule)
      });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/rules/:id/body', async (req, res, next) => {
    try {
      const updated = await updateState(async (state) => {
        const rule = state.rules.find((item) => item.id === req.params.id);
        if (!rule) return null;

        await writeTextFile(rule.filePath, String(req.body?.body ?? ''));
        rule.updatedAt = new Date().toISOString();
        return rule;
      });

      if (!updated) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }

      res.json({ rule: updated });
      const currentState = await readState();
      emitRulesChanged({ kind: 'local', action: 'upsert', rule: withNoteForRule(updated, currentState) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/rules/:id/request-body', async (req, res, next) => {
    try {
      const result = await updateState((state) => {
        const rule = state.rules.find((item) => item.id === req.params.id);
        if (!rule) return null;

        const body = String(req.body?.body ?? '');
        const contentType = String(
          req.body?.contentType ||
          rule.requestContentType ||
          rule.requestHeaders?.['content-type'] ||
          (body ? 'text/plain; charset=utf-8' : '')
        );

        Object.assign(rule, requestBodyFieldsFromText(body, contentType));
        rule.requestHeaders = {
          ...(rule.requestHeaders || {})
        };
        if (contentType) {
          rule.requestHeaders['content-type'] = contentType;
        } else {
          delete rule.requestHeaders['content-type'];
        }
        delete rule.requestHeaders['content-length'];
        delete rule.requestHeaders['content-encoding'];
        rule.updatedAt = new Date().toISOString();
        assertNoDuplicateRule(state, rule);
        return { rule, warning: '' };
      });

      if (!result) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }

      res.json(result);
      const currentState = await readState();
      emitRulesChanged({ kind: 'local', action: 'upsert', rule: withNoteForRule(result.rule, currentState) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/rules/:id/download', async (req, res, next) => {
    try {
      const state = await readState();
      const rule = state.rules.find((item) => item.id === req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found.' });
        return;
      }

      const buffer = await readBufferFile(rule.filePath);
      res.type(rule.contentType || 'application/octet-stream').send(buffer);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.statusCode || 500).json({
      error: error.message || 'Internal server error.',
      ...(error.details && typeof error.details === 'object' ? error.details : {})
    });
  });

  return app;
}

function combinedCodexQueueStatus() {
  const notes = codexQueueStatus();
  const aiRules = aiRuleQueueStatus();
  const detailNotes = notes.details || {};
  const pending = Number(notes.pending || 0) + Number(detailNotes.pending || 0) + Number(aiRules.pending || 0);
  const running = (notes.running ? 1 : 0) + (detailNotes.running ? 1 : 0) + Number(aiRules.running || 0);
  const failed = Number(notes.failed || 0) + Number(detailNotes.failed || 0) + Number(aiRules.failed || 0);
  return {
    pending,
    running,
    completed: Number(notes.completed || 0) + Number(detailNotes.completed || 0) + Number(aiRules.completed || 0),
    failed,
    lastError: aiRules.lastError || detailNotes.lastError || notes.lastError || '',
    notes,
    aiRules
  };
}

function formatValidationErrors(errors = []) {
  return (errors || [])
    .map(sanitizeValidationError)
    .filter(Boolean)
    .slice(0, 4)
    .join('；') || '未知错误';
}

function sanitizeValidationError(value) {
  const text = String(value || '')
    .replace(/[A-Za-z0-9+/=]{180,}/g, '<base64 omitted>')
    .replace(/"bodyBase64"\s*:\s*"[^"]{80,}"/g, '"bodyBase64":"<base64 omitted>"')
    .replace(/"body"\s*:\s*"[^"]{500,}"/g, '"body":"<body omitted>"')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 420 ? `${text.slice(0, 420)}...` : text;
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

function sameRemoteRuleSaveTarget(existingRule, nextRule) {
  if (existingRule.scope === 'global' || nextRule.scope === 'global') {
    return existingRule.scope === 'global' &&
      nextRule.scope === 'global' &&
      existingRule.id !== nextRule.id;
  }
  return sameBaseRuleTarget(existingRule, nextRule) &&
    sameRuleMatchForSave(existingRule, nextRule, shouldMatchRemoteRuleRequestBodyForSave);
}

function findDuplicateRule(state, rule, options = {}) {
  if (!rule || rule.scope === 'global') return null;
  const excludeId = options.excludeId || rule.id;
  const rules = [
    ...(state.rules || []),
    ...(state.remoteRules || []).filter((item) => item.scope !== 'global')
  ];
  return rules.find((item) => {
    if (!item || item.id === excludeId) return false;
    if (item.enabled === false) return false;
    return sameUnifiedRuleSaveTarget(item, rule);
  }) || null;
}

function enforceDuplicateRuleState(state, rule, options = {}) {
  const duplicateRule = findDuplicateRule(state, rule, { excludeId: rule?.id });
  if (!duplicateRule) return '';
  if (rule.enabled === false) return '';
  rule.enabled = false;
  return options.edit ? duplicateRuleEditWarning : duplicateRuleCreateWarning;
}

function assertNoDuplicateRule(state, rule) {
  if (rule?.enabled === false) return;
  const duplicateRule = findDuplicateRule(state, rule, { excludeId: rule?.id });
  if (!duplicateRule) return;
  throw Object.assign(new Error(ruleConflictMessage(duplicateRule)), {
    statusCode: 409,
    details: {
      code: 'RULE_MATCH_CONFLICT',
      duplicateRule: ruleConflictSummary(duplicateRule),
      message: ruleConflictMessage(duplicateRule)
    }
  });
}

function assertNoCaptureMergeRuleConflict(captureMergeRules = {}, validation = {}) {
  const mergeKey = String(validation?.mergeKey || '');
  const variantKey = String(validation?.variantKey || '');
  if (!mergeKey || !variantKey) return;
  const rule = captureMergeRules[mergeKey] || {};
  const variants = isPlainObject(rule.variants) ? rule.variants : {};
  const current = variants[variantKey];
  if (!current) return;
  for (const [key, other] of Object.entries(variants)) {
    if (key === variantKey || !isPlainObject(other)) continue;
    if (captureMergeVariantContains(rule, other, current)) {
      throw Object.assign(new Error('当前匹配范围与同接口的其他聚合配置存在包含关系，无法保存。'), {
        statusCode: 409,
        details: {
          code: 'RULE_MATCH_CONFLICT',
          message: '当前匹配范围与同接口的其他聚合配置存在包含关系，无法保存。'
        }
      });
    }
  }
}

function captureMergeVariantContains(baseRule = {}, container = {}, contained = {}) {
  let checked = false;
  if (baseRule.query === true) {
    checked = true;
    const containerQuery = String(container.queryTemplate ?? '').replace(/^\?/, '');
    const containedQuery = String(contained.queryTemplate ?? '').replace(/^\?/, '');
    if (!queryIncludesRequired(containedQuery, containerQuery)) return false;
  }
  if (baseRule.body === true) {
    checked = true;
    const containerBody = String(container.bodyTemplate || '');
    const containedBody = String(contained.bodyTemplate || '');
    if (!containerBody) return true;
    if (!containedBody) return false;
    const contentType = String(container.requestContentType || contained.requestContentType || baseRule.requestContentType || '');
    const containerRule = captureRuleForMergeTemplate({ method: validationMethod(baseRule), requestContentType: contentType }, { requestContentType: contentType }, containerBody);
    const containedRule = captureRuleForMergeTemplate({ method: validationMethod(baseRule), requestContentType: contentType }, { requestContentType: contentType }, containedBody);
    return requestBodyIncludesRequired(containerRule, bodyRequestForSave(containedRule), containedRule.method);
  }
  return checked;
}

function validationMethod(baseRule = {}) {
  return baseRule.method || 'POST';
}

function ruleConflictMessage(rule) {
  const summary = ruleConflictSummary(rule);
  return `规则匹配范围与「${summary.method} ${summary.host}${summary.path}」完全相同，无法同时启用。`;
}

function ruleConflictSummary(rule = {}) {
  return {
    id: rule.id || '',
    type: isRemoteRuleForDuplicate(rule) ? 'remote' : 'local',
    method: rule.method || '',
    host: rule.host || '',
    path: rule.path || '',
    queryMode: rule.queryMode || 'exact',
    query: rule.query || '',
    requestBodyMode: rule.requestBodyMode || 'ignore'
  };
}

function duplicateMatchSignature(rule = {}) {
  if (!rule || rule.scope === 'global') {
    return JSON.stringify({
      scope: rule?.scope || '',
      enabled: rule?.enabled !== false,
      host: normalizeHostInput(rule?.host || '')
    });
  }
  const shouldMatchBody = shouldMatchUnifiedRuleRequestBodyForSave(rule);
  return JSON.stringify({
    enabled: rule.enabled !== false,
    method: rule.method || '',
    protocol: rule.protocol || '',
    host: rule.host || '',
    port: Number(rule.port || 0),
    path: rule.path || '',
    queryMode: rule.queryMode === 'ignore' ? 'ignore' : 'exact',
    query: rule.queryMode === 'ignore' ? '' : String(rule.query || ''),
    requestBodyMode: shouldMatchBody ? 'exact' : 'ignore',
    requestBodyHash: shouldMatchBody ? remoteOrLocalRuleBodyHashKeyForSave(rule) : ''
  });
}

function remoteOrLocalRuleBodyHashKeyForSave(rule = {}) {
  if (isRemoteRuleForDuplicate(rule)) {
    return remoteRuleBodyHashKeyForSave(rule);
  }
  return ruleBodyHashKeyForSave(rule);
}

function sameUnifiedRuleSaveTarget(existingRule, nextRule) {
  return sameBaseRuleTarget(existingRule, nextRule) &&
    sameRuleMatchForSave(existingRule, nextRule, shouldMatchUnifiedRuleRequestBodyForSave);
}

function syncRemoteStepsMetadata(rule) {
  const steps = normalizeRemoteSteps({ steps: rule.steps || [] });
  const hasAiStep = steps.some((step) => step.type === 'ai');
  rule.steps = steps;
  rule.script = serializeDslSteps(steps);
  rule.scriptType = hasAiStep ? 'mixed' : 'dsl';
  rule.pythonScript = '';
  rule.aiSummary = '';
  rule.aiOutputLines = [];
  rule.aiPromptHistory = [];
  rule.aiContext = null;
  rule.aiStepId = '';
}

function sameBaseRuleTarget(a, b) {
  return a.method === b.method &&
    a.protocol === b.protocol &&
    a.host === b.host &&
    Number(a.port) === Number(b.port) &&
    a.path === b.path;
}

function sameRuleQueryForSave(existingRule, nextRule) {
  if (existingRule.queryMode === 'ignore') return true;
  if (nextRule.queryMode === 'ignore') return true;
  return queryIncludesRequired(nextRule.query || '', existingRule.query || '') ||
    queryIncludesRequired(existingRule.query || '', nextRule.query || '');
}

function sameRuleCoverageForSave(existingRule, nextRule, shouldMatchBody) {
  return ruleCoversRuleForSave(existingRule, nextRule, shouldMatchBody) ||
    ruleCoversRuleForSave(nextRule, existingRule, shouldMatchBody);
}

function sameRuleMatchForSave(existingRule, nextRule, shouldMatchBody) {
  return ruleCoversRuleForSave(existingRule, nextRule, shouldMatchBody) &&
    ruleCoversRuleForSave(nextRule, existingRule, shouldMatchBody);
}

function ruleCoversRuleForSave(containerRule, containedRule, shouldMatchBody) {
  if (!ruleQueryCoversForSave(containerRule, containedRule)) return false;
  if (!ruleBodyCoversForSave(containerRule, containedRule, shouldMatchBody)) return false;
  return true;
}

function ruleQueryCoversForSave(containerRule, containedRule) {
  if (containerRule.queryMode === 'ignore') return true;
  if (containedRule.queryMode === 'ignore') return false;
  return queryIncludesRequired(containedRule.query || '', containerRule.query || '');
}

function ruleBodyCoversForSave(containerRule, containedRule, shouldMatchBody) {
  if (!shouldMatchBody(containerRule)) return true;
  if (!shouldMatchBody(containedRule)) return false;
  return requestBodyIncludesRequired(containerRule, bodyRequestForSave(containedRule), containedRule.method);
}

function shouldMatchRuleRequestBodyForSave(rule) {
  return methodHasRequestBody(rule.method) && rule.requestBodyMode !== 'ignore';
}

function shouldMatchRemoteRuleRequestBodyForSave(rule) {
  return methodHasRequestBody(rule.method) &&
    rule.requestBodyMode !== 'ignore' &&
    Boolean(remoteRuleBodyHashKeyForSave(rule));
}

function shouldMatchUnifiedRuleRequestBodyForSave(rule) {
  if (rule?.scope === 'global') return false;
  if (isRemoteRuleForDuplicate(rule)) {
    return shouldMatchRemoteRuleRequestBodyForSave(rule);
  }
  return shouldMatchRuleRequestBodyForSave(rule);
}

function isRemoteRuleForDuplicate(rule) {
  return rule?.scope === 'global' ||
    Object.hasOwn(rule || {}, 'script') ||
    Object.hasOwn(rule || {}, 'steps') ||
    Object.hasOwn(rule || {}, 'exampleCapture');
}

function ruleBodyHashKeyForSave(rule) {
  if (rule.requestBodyHash) return rule.requestBodyHash;
  if (!rule.requestBodyBase64 && !Number(rule.requestBodySize || 0)) return emptyBodyHash();
  return '';
}

function remoteRuleBodyHashKeyForSave(rule) {
  if (rule.requestBodyHash) return rule.requestBodyHash;
  return '';
}

function bodyRequestForSave(rule) {
  return {
    method: rule.method,
    headers: rule.requestContentType ? { 'content-type': rule.requestContentType } : {},
    requestContentType: rule.requestContentType || '',
    requestBodyHash: rule.requestBodyHash || '',
    bodyBuffer: rule.requestBodyBase64
      ? Buffer.from(rule.requestBodyBase64, 'base64')
      : Buffer.alloc(0)
  };
}

function emptyBodyHash() {
  return 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
}

function methodHasRequestBody(method) {
  return !['GET', 'HEAD'].includes(String(method || '').toUpperCase());
}

function startSharedAdbTracker() {
  if (adbTrackChild) return;
  adbTrackChild = spawn(adbExecutable(), ['track-devices', '-l']);
  adbTrackLastKey = '';
  adbTrackChild.stdout.setEncoding('utf8');
  adbTrackChild.stdout.on('data', () => {
    scheduleSharedAdbDeviceRefresh();
  });
  adbTrackChild.stderr.setEncoding('utf8');
  adbTrackChild.stderr.on('data', (chunk) => {
    const message = String(chunk || '').trim();
    if (message) {
      broadcastAdbTrackEvent('adb-error', { error: message });
    }
  });
  adbTrackChild.on('error', (error) => {
    broadcastAdbTrackEvent('adb-error', { error: error.message || 'adb track-devices failed.' });
  });
  adbTrackChild.on('close', (code) => {
    clearTimeout(adbTrackRefreshTimer);
    adbTrackRefreshTimer = null;
    adbTrackChild = null;
    broadcastAdbTrackEvent('close', { code });
    closeAdbTrackClients();
  });
}

function stopSharedAdbTracker() {
  clearTimeout(adbTrackRefreshTimer);
  adbTrackRefreshTimer = null;
  adbTrackLastKey = '';
  adbTrackRefreshInFlight = false;
  adbTrackRefreshPending = false;
  const child = adbTrackChild;
  adbTrackChild = null;
  child?.kill();
}

function scheduleSharedAdbDeviceRefresh(delay = 100) {
  clearTimeout(adbTrackRefreshTimer);
  adbTrackRefreshTimer = setTimeout(sendSharedAdbDevices, delay);
}

async function sendSharedAdbDevices() {
  if (!adbTrackClients.size) return;
  if (adbTrackRefreshInFlight) {
    adbTrackRefreshPending = true;
    return;
  }
  adbTrackRefreshInFlight = true;
  try {
    const devices = await listAdbDevices();
    const key = JSON.stringify(devices.map((device) => [
      device.id,
      device.state,
      device.label,
      device.displayName
    ]));
    if (key !== adbTrackLastKey) {
      adbTrackLastKey = key;
      broadcastAdbTrackEvent('devices', { devices });
    }
  } catch (error) {
    broadcastAdbTrackEvent('adb-error', { error: error.message || 'adb devices failed.' });
  } finally {
    adbTrackRefreshInFlight = false;
    if (adbTrackRefreshPending) {
      adbTrackRefreshPending = false;
      scheduleSharedAdbDeviceRefresh(50);
    }
  }
}

function broadcastAdbTrackEvent(event, data) {
  for (const client of [...adbTrackClients]) {
    if (client.closed) {
      adbTrackClients.delete(client);
      continue;
    }
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

function closeAdbTrackClients() {
  for (const client of [...adbTrackClients]) {
    client.closed = true;
    client.res.end();
  }
  adbTrackClients.clear();
}

function expectedAdbProxyValue() {
  const ip = getLanIps()[0];
  return ip ? `${ip}:${config.proxyPort}` : '';
}

function searchCaptures(captures = [], settings = {}, query = '', domainOverride) {
  const domain = currentSearchDomain(settings, domainOverride);
  const needle = String(query || '').trim();
  const normalizedNeedle = needle.toLowerCase();
  if (!normalizedNeedle) {
    return { query: '', domain, groups: [] };
  }
  const groups = new Map();
  for (const capture of captures) {
    if (domain && normalizeHostInput(capture.host) !== domain) continue;
    const matches = captureSearchMatches(capture, needle, normalizedNeedle);
    if (!matches.length) continue;
    const host = normalizeHostInput(capture.host) || String(capture.host || '');
    const pathName = String(capture.path || '/');
    const key = `${host}\u0000${pathName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        host,
        path: pathName,
        note: noteForItem({ settings }, capture),
        latestAt: capture.createdAt || '',
        items: []
      });
    }
    const group = groups.get(key);
    if (!group.note) group.note = noteForItem({ settings }, capture);
    if (String(capture.createdAt || '') > String(group.latestAt || '')) {
      group.latestAt = capture.createdAt || '';
    }
    group.items.push({
      id: capture.id,
      method: String(capture.method || '').toUpperCase(),
      statusCode: capture.statusCode || 0,
      createdAt: capture.createdAt || '',
      matches
    });
  }

  const sortedGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    }))
    .sort((a, b) => String(b.latestAt || '').localeCompare(String(a.latestAt || '')));

  return {
    query: needle,
    domain,
    groups: sortedGroups.slice(0, 200)
  };
}

function currentSearchDomain(settings = {}, domainOverride) {
  if (domainOverride !== undefined && domainOverride !== null) {
    return normalizeHostInput(domainOverride);
  }
  const tabs = Array.isArray(settings.captureTabs) ? settings.captureTabs : [];
  const activeTab = tabs.find((tab) => String(tab?.id || '') === String(settings.activeCaptureTabId || '')) || tabs[0] || null;
  return normalizeHostInput(activeTab?.filter || settings.captureFilter || '');
}

function captureSearchMatches(capture = {}, needle = '', normalizedNeedle = '') {
  const fields = [
    {
      type: 'query',
      label: '查询',
      text: String(capture.query || '')
    },
    {
      type: 'requestHead',
      label: '请求Head',
      text: formatHeadersForSearch(capture.requestHeaders)
    },
    {
      type: 'request',
      label: '请求体',
      text: decodeCaptureBodyForSearch(capture.requestBodyBase64)
    },
    {
      type: 'responseHead',
      label: '响应Head',
      text: formatHeadersForSearch(capture.responseHeaders)
    },
    {
      type: 'response',
      label: '响应体',
      text: decodeCaptureBodyForSearch(capture.bodyBase64)
    }
  ];
  return fields
    .map((field) => {
      const index = field.text.toLowerCase().indexOf(normalizedNeedle);
      if (index < 0) return null;
      return {
        type: field.type,
        label: field.label,
        snippet: searchSnippet(field.text, index, needle.length)
      };
    })
    .filter(Boolean);
}

function formatHeadersForSearch(headers = {}) {
  return Object.entries(headers || {})
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n');
}

function decodeCaptureBodyForSearch(bodyBase64 = '') {
  if (!bodyBase64) return '';
  try {
    const buffer = Buffer.from(String(bodyBase64 || ''), 'base64');
    if (!buffer.length || buffer.includes(0)) return '';
    return buffer.toString('utf8').slice(0, 2_000_000);
  } catch {
    return '';
  }
}

function searchSnippet(text = '', index = 0, length = 0) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const sourceIndex = Math.max(0, Math.min(index, source.length));
  const start = Math.max(0, sourceIndex - 54);
  const end = Math.min(source.length, sourceIndex + Math.max(length, 1) + 82);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < source.length ? '...' : '';
  return `${prefix}${source.slice(start, end)}${suffix}`;
}

function groupedCaptureSummaries(captures = [], settings = {}) {
  if (settings.captureMergeEnabled === false || settings.captureTreeViewEnabled === true) {
    return captures.map((capture) => ({
      ...captureListSummary(capture),
      mergeKey: captureTargetKey(capture),
      mergeGroupKey: captureMergeGroupKey({ settings }, capture),
      mergeOptions: captureMergeOptions({ settings }, capture),
      note: noteForItem({ settings }, capture),
      history: []
    }));
  }
  const groups = [];
  for (const capture of captures) {
    const group = bestCaptureMergeGroup(groups, capture, settings);
    if (group) {
      group.push(capture);
    } else {
      groups.push([capture]);
    }
  }

  return groups.map((group) => {
    const [latest, ...history] = group;
    const mergeOptions = captureMergeOptions({ settings }, latest);
    return {
      ...captureListSummary(latest),
      mergeKey: captureTargetKey(latest),
      mergeGroupKey: captureMergeGroupKey({ settings }, latest),
      mergeOptions,
      note: noteForItem({ settings }, latest),
      history: history.map((item) => captureListHistorySummary(item, settings))
    };
  });
}

function sameCaptureMergeGroup(base, capture, settings = {}) {
  return captureMergeGroupMatchScore(base, capture, settings) >= 0;
}

function captureMergeGroupMatchScore(base, capture, settings = {}) {
  if (!sameCaptureTarget(base, capture)) return -1;
  const baseKey = captureMergeGroupKey({ settings }, base);
  const captureKey = captureMergeGroupKey({ settings }, capture);
  if (
    baseKey !== captureTargetKey(base) ||
    captureKey !== captureTargetKey(capture)
  ) {
    return baseKey === captureKey ? captureMergeGroupSpecificity(base, settings) : -1;
  }
  const options = captureMergeOptions({ settings }, base);
  if (!captureQueryMatchesMergeTemplate(capture, base, options)) return -1;
  if (!captureBodyMatchesMergeTemplate(capture, base, options)) return -1;
  return captureMergeOptionsSpecificity(options);
}

function bestCaptureMergeGroup(groups = [], capture = {}, settings = {}) {
  let best = null;
  let bestScore = -1;
  for (const group of groups) {
    const score = captureMergeGroupMatchScore(group?.[0], capture, settings);
    if (score > bestScore) {
      best = group;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? best : null;
}

function bestCaptureMergeCapture(captures = [], capture = {}, settings = {}) {
  let best = null;
  let bestScore = -1;
  for (const candidate of captures) {
    const score = captureMergeGroupMatchScore(candidate, capture, settings);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? best : null;
}

function captureMergeGroupSpecificity(capture = {}, settings = {}) {
  return captureMergeOptionsSpecificity(captureMergeOptions({ settings }, capture));
}

function captureMergeOptionsSpecificity(options = {}) {
  let score = 0;
  if (options.query === true) {
    score += [...new URLSearchParams(String(options.queryTemplate || '').replace(/^\?/, '')).entries()].length * 100;
  }
  if (options.body === true) {
    score += captureMergeBodySpecificity(
      String(options.bodyTemplate || ''),
      String(options.requestContentType || '')
    );
  }
  return score;
}

function sameCaptureTarget(a = {}, b = {}) {
  return String(a.method || '').toUpperCase() === String(b.method || '').toUpperCase() &&
    a.protocol === b.protocol &&
    a.host === b.host &&
    Number(a.port) === Number(b.port) &&
    a.path === b.path;
}

function captureQueryMatchesMergeTemplate(capture, base, options = {}) {
  if (options.query !== true) {
    return true;
  }
  const template = String(options.queryTemplate || '').replace(/^\?/, '');
  if (!template) return true;
  const baseMatches = queryIncludesRequired(base.query || '', template);
  const captureMatches = queryIncludesRequired(capture.query || '', template);
  if (baseMatches || captureMatches) return baseMatches && captureMatches;
  return queryIncludesRequired(capture.query || '', base.query || '') &&
    queryIncludesRequired(base.query || '', capture.query || '');
}

function captureBodyMatchesMergeTemplate(capture, base, options = {}) {
  if (!methodHasRequestBody(capture.method)) return true;
  if (options.body !== true) {
    return true;
  }
  const template = String(options.bodyTemplate || '');
  if (!template) return true;
  const templateRule = captureRuleForMergeTemplate(base, options, template);
  const baseMatches = requestBodyIncludesRequired(templateRule, captureRequestForMerge(base), base.method);
  const captureMatches = requestBodyIncludesRequired(templateRule, captureRequestForMerge(capture), capture.method);
  if (baseMatches || captureMatches) return baseMatches && captureMatches;
  return sameCaptureBodyExact(base, capture);
}

function sameCaptureBodyExact(a = {}, b = {}) {
  const aHash = a.requestBodyHash || '';
  const bHash = b.requestBodyHash || '';
  if (aHash || bHash) return aHash === bHash;
  const aSize = Number(a.requestBodySize || 0);
  const bSize = Number(b.requestBodySize || 0);
  if (aSize !== bSize) return false;
  return String(a.requestBodyBase64 || '') === String(b.requestBodyBase64 || '');
}

function captureListSummary(capture = {}) {
  return {
    id: capture.id,
    createdAt: capture.createdAt,
    method: capture.method,
    url: capture.url,
    protocol: capture.protocol,
    host: capture.host,
    port: capture.port,
    path: capture.path,
    query: capture.query || '',
    statusCode: capture.statusCode,
    contentType: capture.contentType || '',
    bodySize: Number(capture.bodySize || 0),
    contentLength: Number(capture.contentLength || capture.bodySize || 0),
    requestBodySize: Number(capture.requestBodySize || 0),
    requestStartedAt: capture.requestStartedAt || '',
    requestEndedAt: capture.requestEndedAt || '',
    responseStartedAt: capture.responseStartedAt || '',
    responseEndedAt: capture.responseEndedAt || '',
    durationMs: capture.durationMs,
    requestMs: capture.requestMs,
    responseMs: capture.responseMs,
    latencyMs: capture.latencyMs,
    clientAddress: capture.clientAddress || '',
    remoteAddress: capture.remoteAddress || '',
    httpVersion: capture.httpVersion || '',
    keptAlive: capture.keptAlive,
    tlsProtocol: capture.tlsProtocol || '',
    tlsCipher: capture.tlsCipher || '',
    requestHeaderSize: capture.requestHeaderSize,
    requestQuerySize: capture.requestQuerySize,
    requestCookieSize: capture.requestCookieSize,
    responseHeaderSize: capture.responseHeaderSize,
    responseCookieSize: capture.responseCookieSize,
    requestBodyHash: capture.requestBodyHash || '',
    requestContentType: capture.requestContentType || '',
    requestBodyBase64: capture.requestBodyBase64 || '',
    summaryOnly: capture.summaryOnly === true,
    contentCaptured: capture.contentCaptured !== false,
    requestContentCaptured: capture.requestContentCaptured !== false,
    mapType: capture.mapType || '',
    mapRuleId: capture.mapRuleId || '',
    mapRuleIds: Array.isArray(capture.mapRuleIds) ? capture.mapRuleIds : []
  };
}

function captureListHistorySummary(capture = {}, settings = {}) {
  return {
    ...captureListSummary(capture),
    mergeKey: captureTargetKey(capture),
    mergeGroupKey: captureMergeGroupKey({ settings }, capture),
    mergeOptions: captureMergeOptions({ settings }, capture),
    note: noteForItem({ settings }, capture),
    history: []
  };
}

function captureListSummaryWithState(capture = {}, state = {}) {
  const settings = state.settings || state || {};
  return {
    ...captureListSummary(capture),
    mergeKey: captureTargetKey(capture),
    mergeGroupKey: captureMergeGroupKey({ settings }, capture),
    mergeOptions: captureMergeOptions({ settings }, capture),
    note: noteForItem({ settings }, capture),
    history: []
  };
}

function captureRequestForMerge(capture = {}) {
  return {
    method: capture.method,
    headers: capture.requestContentType ? { 'content-type': capture.requestContentType } : {},
    requestContentType: capture.requestContentType || '',
    requestBodyHash: capture.requestBodyHash || '',
    bodyBuffer: capture.requestBodyBase64
      ? Buffer.from(capture.requestBodyBase64, 'base64')
      : Buffer.alloc(0)
  };
}

function captureRuleForMergeTemplate(base = {}, options = {}, bodyTemplate = '') {
  const bodyBuffer = Buffer.from(String(bodyTemplate || ''), 'utf8');
  const contentType = options.requestContentType || base.requestContentType || '';
  return {
    method: base.method,
    requestBodyMode: 'exact',
    requestContentType: contentType,
    requestBodyBase64: bodyBuffer.toString('base64'),
    requestBodySize: bodyBuffer.length,
    requestBodyHash: hashRequestBody(bodyBuffer, contentType)
  };
}

function withNoteForRule(rule = {}, state = {}) {
  return rule;
}

function noteForItem(state = {}, item) {
  if (item?.scope === 'global') return '';
  return state.settings?.apiNotes?.[apiNoteKey(item)] || '';
}

function detailFailureForItem(state = {}, item) {
  if (item?.scope === 'global') return null;
  return state.settings?.apiDetailFailures?.[apiNoteKey(item)] || null;
}

function enqueueMissingRuleNotes(state = {}, items = []) {
  for (const item of items || []) {
    if (item?.scope === 'global') continue;
    if (noteForItem(state, item)) continue;
    if (state.settings?.apiNoteFailures?.[apiNoteKey(item)]) continue;
    enqueueCodexNote(captureLikeForNoteQueue(item)).catch((error) => {
      console.error('Failed to enqueue Codex rule note:', error.message);
    });
  }
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

function apiNoteKey(item) {
  return [
    String(item.method || '').toUpperCase(),
    item.protocol || 'https',
    item.host || '',
    Number(item.port || defaultPort(item.protocol || 'https')),
    item.path || '/'
  ].join('\u0000');
}

function captureMergeOptions(state = {}, capture) {
  const key = captureTargetKey(capture);
  const rule = state.settings?.captureMergeRules?.[key] || {};
  const variant = captureMergeVariantForCapture(rule, capture);
  const hasVariants = Boolean(rule.variants && Object.keys(rule.variants).length);
  const queryTemplate = variant.rule && Object.hasOwn(variant.rule, 'queryTemplate')
    ? String(variant.rule.queryTemplate ?? '').replace(/^\?/, '')
    : (!hasVariants && Object.hasOwn(rule, 'queryTemplate')
      ? String(rule.queryTemplate ?? '').replace(/^\?/, '')
      : (rule.query === true ? String(capture?.query || '').replace(/^\?/, '') : ''));
  const bodyTemplate = variant.rule && Object.hasOwn(variant.rule, 'bodyTemplate')
    ? String(variant.rule.bodyTemplate || '')
    : (!hasVariants && Object.hasOwn(rule, 'bodyTemplate')
      ? String(rule.bodyTemplate || '')
      : (rule.body === true ? captureRequestBodyText(capture) : ''));
  return {
    query: rule.query === true,
    body: rule.body === true,
    variantKey: variant.key,
    queryTemplate,
    bodyTemplate,
    requestContentType: String(variant.rule?.requestContentType || rule.requestContentType || capture?.requestContentType || '')
  };
}

function captureMergeGroupKey(state = {}, capture = {}) {
  const baseKey = captureTargetKey(capture);
  const rule = state.settings?.captureMergeRules?.[baseKey] || {};
  const variant = captureMergeVariantForCapture(rule, capture);
  return variant.key ? `${baseKey}\u0000${variant.key}` : baseKey;
}

function captureMergeVariantForCapture(rule = {}, capture = {}) {
  if (!rule || typeof rule !== 'object') return { key: '', rule: null };
  const variants = rule.variants && typeof rule.variants === 'object' && !Array.isArray(rule.variants)
    ? rule.variants
    : {};
  const directKey = captureMergeVariantKey(rule, capture);
  const matches = [];
  for (const [key, variantRule] of Object.entries(variants)) {
    if (!variantRule || typeof variantRule !== 'object') continue;
    if (captureMatchesMergeVariant(capture, rule, variantRule)) {
      matches.push({ key, rule: variantRule });
    }
  }
  if (matches.length) {
    matches.sort((a, b) => (
      captureMergeVariantSpecificity(rule, b.rule) - captureMergeVariantSpecificity(rule, a.rule) ||
      Number(b.key === directKey) - Number(a.key === directKey)
    ));
    return matches[0];
  }
  if (directKey && variants[directKey] && typeof variants[directKey] === 'object') {
    return { key: directKey, rule: variants[directKey] };
  }
  if (!Object.keys(variants).length && (rule.queryTemplate || rule.bodyTemplate)) {
    return { key: '', rule: null };
  }
  return { key: directKey, rule: null };
}

function captureMatchesMergeVariant(capture = {}, baseRule = {}, variantRule = {}) {
  if (baseRule.query === true) {
    const queryTemplate = String(variantRule.queryTemplate || '').replace(/^\?/, '');
    if (queryTemplate && !queryIncludesRequired(capture.query || '', queryTemplate)) return false;
  }
  if (baseRule.body === true && methodHasRequestBody(capture.method)) {
    const bodyTemplate = String(variantRule.bodyTemplate || '');
    if (bodyTemplate) {
      const templateRule = captureRuleForMergeTemplate(capture, {
        requestContentType: variantRule.requestContentType || baseRule.requestContentType || capture.requestContentType || ''
      }, bodyTemplate);
      if (!requestBodyIncludesRequired(templateRule, captureRequestForMerge(capture), capture.method)) return false;
    }
  }
  return true;
}

function captureMergeVariantKey(rule = {}, capture = {}) {
  const parts = [];
  if (rule.query === true) {
    parts.push(`q:${hashText(normalizeQueryText(capture.query || ''))}`);
  }
  if (rule.body === true && methodHasRequestBody(capture.method)) {
    parts.push(`b:${capture.requestBodyHash || hashText(capture.requestBodyBase64 || String(capture.requestBodySize || 0))}`);
  }
  return parts.join('|');
}

function captureMergeVariantSpecificity(rule = {}, variantRule = {}) {
  let score = 0;
  if (rule.query === true) {
    score += [...new URLSearchParams(String(variantRule.queryTemplate || '').replace(/^\?/, '')).entries()].length * 100;
  }
  if (rule.body === true) {
    score += captureMergeBodySpecificity(
      String(variantRule.bodyTemplate || ''),
      String(variantRule.requestContentType || rule.requestContentType || '')
    );
  }
  return score;
}

function captureMergeBodySpecificity(bodyTemplate = '', contentType = '') {
  const text = String(bodyTemplate || '').trim();
  if (!text) return 0;
  if (String(contentType || '').toLowerCase().includes('application/x-www-form-urlencoded')) {
    return [...new URLSearchParams(text).entries()].length * 100;
  }
  try {
    return countJsonSpecificity(JSON.parse(text)) * 100;
  } catch {
    return Math.max(1, text.length);
  }
}

function countJsonSpecificity(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countJsonSpecificity(item), value.length);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => sum + countJsonSpecificity(item), Object.keys(value).length);
  }
  return 1;
}

function normalizeQueryText(value) {
  return String(value || '').replace(/^\?/, '');
}

function captureRequestBodyText(capture = {}) {
  if (!capture?.requestBodyBase64) return '';
  try {
    return Buffer.from(capture.requestBodyBase64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function hashText(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function normalizeCaptureMergeRules(value) {
  const result = {};
  if (!isPlainObject(value)) return result;
  for (const [key, rule] of Object.entries(value)) {
    if (!key || !isPlainObject(rule)) continue;
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
  if (!isPlainObject(value)) return {};
  const result = {};
  for (const [key, rule] of Object.entries(value)) {
    if (!key || !isPlainObject(rule)) continue;
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
  if (isPlainObject(value)) {
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function remoteRuleExampleCapture(rule) {
  if (rule?.scope === 'global') return globalRemoteRuleExampleCapture(rule);
  if (!rule?.exampleCapture || typeof rule.exampleCapture !== 'object') return null;
  return rule.exampleCapture;
}

function matchingGlobalRemoteRulesForPreview(state, rule) {
  if (!rule || rule.scope === 'global') return [];
  const host = String(rule.host || '').trim();
  if (!host) return [];
  return orderRemoteRules(state.remoteRules || []).filter((candidate) =>
    candidate?.scope === 'global' &&
    candidate.enabled &&
    String(candidate.host || '').trim() === host &&
    candidate.id !== rule.id
  );
}

function remotePreviewStepsForRule(rule, editorSteps, globalRules = []) {
  const globalSteps = (globalRules || []).flatMap((item) => normalizeRemoteSteps(item));
  const currentSteps = Array.isArray(editorSteps)
    ? normalizeRemoteSteps({ steps: editorSteps })
    : normalizeRemoteSteps(rule);
  return [...globalSteps, ...currentSteps];
}

function previewBaseUrl(rule, capture, query) {
  if (rule?.scope === 'global' && capture) {
    return buildUrl({ ...capture, query }, { includeQuery: true });
  }
  return buildUrl({ ...rule, query }, { includeQuery: true });
}

function globalRemoteRuleExampleCapture(rule = {}) {
  const host = rule.host || 'example.com';
  const requestBody = JSON.stringify({
    sample: true,
    type: 'preview',
    data: {
      id: 1,
      name: 'HttpMocker'
    }
  });
  const responseBody = JSON.stringify({
    ok: true,
    message: 'global preview',
    data: {
      count: 1,
      list: [
        { id: 1, title: 'sample item' }
      ]
    }
  });
  return {
    id: 'global-preview',
    createdAt: '',
    method: 'POST',
    url: `https://${host}/__httpmocker_preview?sample=1`,
    protocol: 'https',
    host,
    port: 443,
    path: '/__httpmocker_preview',
    query: 'sample=1',
    statusCode: 200,
    statusMessage: 'OK',
    requestHeaders: {
      host,
      'content-type': 'application/json',
      'user-agent': 'HttpMocker Preview'
    },
    requestContentType: 'application/json',
    requestBodySize: Buffer.byteLength(requestBody),
    requestBodyBase64: Buffer.from(requestBody, 'utf8').toString('base64'),
    requestBodyEditable: true,
    requestBodyTruncated: false,
    responseHeaders: {
      'content-type': 'application/json',
      'x-httpmocker-preview': 'global'
    },
    contentType: 'application/json',
    bodySize: Buffer.byteLength(responseBody),
    contentLength: Buffer.byteLength(responseBody),
    bodyBase64: Buffer.from(responseBody, 'utf8').toString('base64'),
    editable: true
  };
}

export async function previewPythonRemoteRuleForJob({ rule, query, requestBody, requestContentType, responseBaseCapture, pythonScript }) {
  const requestBodyBuffer = Buffer.from(String(requestBody ?? ''), 'utf8');
  const initialUrl = previewBaseUrl(rule, responseBaseCapture, query);
  const initialRequest = {
    method: rule.method,
    url: initialUrl,
    headers: previewRequestHeaders(rule, requestContentType, requestBodyBuffer.length)
  };
  const initialResponseBody = responseBaseCapture
    ? bodyForEditor(responseBaseCapture)
    : { editable: false, body: '', note: '没有保存拦截修改示例响应。' };
  const responseBodyBuffer = Buffer.from(initialResponseBody.body || '', 'utf8');
  const responseContentType = responseBaseCapture?.contentType || '';
  const pythonRule = {
    ...rule,
    scriptType: 'python',
    pythonScript
  };
  const errors = [];

  let requestContext = {
    request: previewPythonRequestPayload(initialRequest, requestBodyBuffer)
  };
  const requestHead = await applyPythonRulesForStage([pythonRule], 'request_head', requestContext);
  errors.push(...requestHead.errors);
  requestContext = requestHead.context;
  normalizePreviewPythonRequest(requestContext.request, initialUrl);
  const requestBodyResult = await applyPythonRulesForStage([pythonRule], 'request_body', {
    ...requestContext,
    request: {
      ...(requestContext.request || {}),
      body: requestBodyBuffer.toString('utf8'),
      bodyBase64: requestBodyBuffer.toString('base64')
    }
  });
  errors.push(...requestBodyResult.errors);
  normalizePreviewPythonRequest(requestBodyResult.context?.request, requestContext.request?.url || initialUrl);

  let responseContext = {
    ...requestBodyResult.context,
    response: previewPythonResponsePayload({
      statusCode: responseBaseCapture?.statusCode || 0,
      statusMessage: responseBaseCapture?.statusMessage || '',
      headers: responseBaseCapture?.responseHeaders || {}
    }, responseBodyBuffer, responseContentType)
  };
  const responseHead = await applyPythonRulesForStage([pythonRule], 'response_head', responseContext);
  errors.push(...responseHead.errors);
  responseContext = responseHead.context;
  const responseBodyResult = await applyPythonRulesForStage([pythonRule], 'response_body', {
    ...responseContext,
    response: {
      ...(responseContext.response || {}),
      body: responseBodyBuffer.toString('utf8'),
      bodyBase64: responseBodyBuffer.toString('base64')
    }
  });
  errors.push(...responseBodyResult.errors);

  const requestPayload = requestBodyResult.context?.request || {};
  const responsePayload = responseBodyResult.context?.response || {};
  const effectiveUrl = requestPayload.url || initialUrl;
  const effectiveParsed = new URL(effectiveUrl);
  const effectiveRequestBody = bodyTextFromPythonPayload(requestPayload, requestBodyBuffer);
  const effectiveResponseBody = initialResponseBody.editable
    ? bodyTextFromPythonPayload(responsePayload, responseBodyBuffer)
    : (initialResponseBody.note || '');
  const effectiveRequestBodyBuffer = Buffer.from(effectiveRequestBody, 'utf8');
  const effectiveResponseBodyBuffer = Buffer.from(effectiveResponseBody, 'utf8');
  const requestHeaders = { ...(requestPayload.headers || initialRequest.headers || {}) };
  const responseHeaders = { ...(responsePayload.headers || responseBaseCapture?.responseHeaders || {}) };
  if (effectiveRequestBody !== requestBodyBuffer.toString('utf8')) {
    syncPreviewBodyHeaders(requestHeaders, effectiveRequestBodyBuffer);
  }
  if (initialResponseBody.editable && effectiveResponseBody !== responseBodyBuffer.toString('utf8')) {
    syncPreviewBodyHeaders(responseHeaders, effectiveResponseBodyBuffer);
  }

  return {
    errors,
    effectiveUrl,
    request: {
      contentType: requestPayload.contentType || requestContentType,
      beforeHeaders: initialRequest.headers || {},
      headers: requestHeaders,
      beforeBody: formatPreviewBody(requestBodyBuffer, requestContentType),
      body: formatPreviewBody(effectiveRequestBodyBuffer, requestPayload.contentType || requestContentType),
      changed: effectiveUrl !== initialUrl ||
        JSON.stringify(requestHeaders || {}) !== JSON.stringify(initialRequest.headers || {}) ||
        effectiveRequestBody !== requestBodyBuffer.toString('utf8')
    },
    response: {
      contentType: responsePayload.contentType || responseContentType,
      beforeHeaders: responseBaseCapture?.responseHeaders || {},
      headers: responseHeaders,
      beforeBody: initialResponseBody.body || initialResponseBody.note || '',
      body: initialResponseBody.editable
        ? formatPreviewBody(effectiveResponseBodyBuffer, responsePayload.contentType || responseContentType)
        : effectiveResponseBody,
      changed: JSON.stringify(responseHeaders || {}) !== JSON.stringify(responseBaseCapture?.responseHeaders || {}) ||
        effectiveResponseBody !== responseBodyBuffer.toString('utf8'),
      sourceCaptureId: responseBaseCapture?.id || null
    },
    query: {
      beforeBody: query,
      body: effectiveParsed.search ? effectiveParsed.search.slice(1) : '',
      changed: effectiveUrl !== initialUrl
    }
  };
}

async function previewRemoteStepsRule({ rule, steps, query, requestBody, requestContentType, responseBaseCapture }) {
  const normalizedSteps = normalizeRemoteSteps({ steps });
  const requestBodyBuffer = Buffer.from(String(requestBody ?? ''), 'utf8');
  const initialUrl = previewBaseUrl(rule, responseBaseCapture, query);
  const initialRequest = {
    method: rule.method,
    url: initialUrl,
    headers: previewRequestHeaders(rule, requestContentType, requestBodyBuffer.length)
  };
  const initialResponseBody = responseBaseCapture
    ? bodyForEditor(responseBaseCapture)
    : { editable: false, body: '', note: '没有保存拦截修改示例响应。' };
  const responseBodyBuffer = Buffer.from(initialResponseBody.body || '', 'utf8');
  const responseContentType = responseBaseCapture?.contentType || '';
  const response = {
    statusCode: responseBaseCapture?.statusCode || 0,
    statusMessage: responseBaseCapture?.statusMessage || '',
    headers: responseBaseCapture?.responseHeaders || {}
  };
  const errors = [];
  const request = {
    ...initialRequest,
    headers: { ...(initialRequest.headers || {}) }
  };
  let currentRequestBody = requestBodyBuffer;
  let currentResponseBody = responseBodyBuffer;

  for (const step of normalizedSteps) {
    if (step.enabled === false) continue;
    if (step.type === 'ai') {
      const pythonRule = { ...rule, scriptType: 'python', pythonScript: step.pythonScript || '' };
      if (!pythonRule.pythonScript.trim()) continue;
      const requestHead = await applyPythonRulesForStage([pythonRule], 'request_head', {
        request: previewPythonRequestPayload(request, currentRequestBody)
      });
      errors.push(...requestHead.errors);
      normalizePreviewPythonRequest(requestHead.context?.request, request.url);
      Object.assign(request, {
        url: requestHead.context?.request?.url || request.url,
        headers: requestHead.context?.request?.headers || request.headers
      });

      const requestBodyResult = await applyPythonRulesForStage([pythonRule], 'request_body', requestHead.context || {});
      errors.push(...requestBodyResult.errors);
      normalizePreviewPythonRequest(requestBodyResult.context?.request, request.url);
      Object.assign(request, {
        url: requestBodyResult.context?.request?.url || request.url,
        headers: requestBodyResult.context?.request?.headers || request.headers
      });
      const nextRequestBody = Buffer.from(bodyTextFromPythonPayload(requestBodyResult.context?.request, currentRequestBody), 'utf8');
      if (!nextRequestBody.equals(currentRequestBody)) {
        syncPreviewBodyHeaders(request.headers, nextRequestBody);
      }
      currentRequestBody = nextRequestBody;

      const responseHead = await applyPythonRulesForStage([pythonRule], 'response_head', {
        ...requestBodyResult.context,
        response: previewPythonResponsePayload(response, currentResponseBody, responseContentType)
      });
      errors.push(...responseHead.errors);
      Object.assign(response, responseHead.context?.response || {});

      const responseBodyResult = await applyPythonRulesForStage([pythonRule], 'response_body', responseHead.context || {});
      errors.push(...responseBodyResult.errors);
      Object.assign(response, responseBodyResult.context?.response || {});
      if (initialResponseBody.editable) {
        const nextResponseBody = Buffer.from(bodyTextFromPythonPayload(responseBodyResult.context?.response, currentResponseBody), 'utf8');
        if (!nextResponseBody.equals(currentResponseBody)) {
          syncPreviewBodyHeaders(response.headers, nextResponseBody);
        }
        currentResponseBody = nextResponseBody;
      }
      continue;
    }

    const command = remoteStepCommand(step);
    if (!command) {
      errors.push('invalid remote rule syntax.');
      continue;
    }
    if (command.action === 'change_query') {
      request.url = applyQueryChanges(request.url, [command]);
    } else if (command.action === 'change_req_head') {
      request.headers = applyHeaderChanges(request.headers, [command]).headers;
    } else if (command.action === 'change_req_body') {
      const result = applyBodyChanges(currentRequestBody, requestContentType, [command]);
      currentRequestBody = result.buffer;
      if (result.changed) syncPreviewBodyHeaders(request.headers, currentRequestBody);
    } else if (command.action === 'change_resp_head') {
      response.headers = applyHeaderChanges(response.headers, [command]).headers;
    } else if (command.action === 'change_resp_body' && initialResponseBody.editable) {
      const result = applyBodyChanges(currentResponseBody, responseContentType, [command]);
      currentResponseBody = result.buffer;
      if (result.changed) syncPreviewBodyHeaders(response.headers, currentResponseBody);
    }
  }

  const effectiveParsed = new URL(request.url);
  return {
    errors,
    effectiveUrl: request.url,
    request: {
      contentType: headerValue(request.headers || {}, 'content-type') || requestContentType,
      beforeHeaders: initialRequest.headers || {},
      headers: request.headers || initialRequest.headers,
      beforeBody: formatPreviewBody(requestBodyBuffer, requestContentType),
      body: formatPreviewBody(currentRequestBody, headerValue(request.headers || {}, 'content-type') || requestContentType),
      changed: request.url !== initialUrl ||
        JSON.stringify(request.headers || {}) !== JSON.stringify(initialRequest.headers || {}) ||
        !currentRequestBody.equals(requestBodyBuffer)
    },
    response: {
      contentType: headerValue(response.headers || {}, 'content-type') || responseContentType,
      beforeHeaders: responseBaseCapture?.responseHeaders || {},
      headers: response.headers || responseBaseCapture?.responseHeaders || {},
      beforeBody: initialResponseBody.body || initialResponseBody.note || '',
      body: initialResponseBody.editable
        ? formatPreviewBody(currentResponseBody, headerValue(response.headers || {}, 'content-type') || responseContentType)
        : (initialResponseBody.note || ''),
      changed: JSON.stringify(response.headers || {}) !== JSON.stringify(responseBaseCapture?.responseHeaders || {}) ||
        !currentResponseBody.equals(responseBodyBuffer),
      sourceCaptureId: responseBaseCapture?.id || null
    },
    query: {
      beforeBody: query,
      body: effectiveParsed.search ? effectiveParsed.search.slice(1) : '',
      changed: request.url !== initialUrl
    }
  };
}

function previewPythonRequestPayload(request, bodyBuffer) {
  const parsed = new URL(request.url);
  return {
    method: request.method || '',
    url: request.url || '',
    path: parsed.pathname || '/',
    query: parsed.search ? parsed.search.slice(1) : '',
    headers: request.headers || {},
    contentType: headerValue(request.headers || {}, 'content-type'),
    body: bodyBuffer.toString('utf8'),
    bodyBase64: bodyBuffer.toString('base64')
  };
}

function previewPythonResponsePayload(response, bodyBuffer, contentType) {
  return {
    statusCode: response.statusCode || 0,
    statusMessage: response.statusMessage || '',
    headers: response.headers || {},
    contentType,
    body: bodyBuffer.toString('utf8'),
    bodyBase64: bodyBuffer.toString('base64')
  };
}

function bodyTextFromPythonPayload(payload = {}, fallbackBuffer = Buffer.alloc(0)) {
  if (Object.hasOwn(payload, 'bodyBase64') && payload.bodyBase64 && String(payload.bodyBase64) !== fallbackBuffer.toString('base64')) {
    try {
      return Buffer.from(String(payload.bodyBase64), 'base64').toString('utf8');
    } catch {
      return fallbackBuffer.toString('utf8');
    }
  }
  if (Object.hasOwn(payload, 'body')) {
    return String(payload.body ?? '');
  }
  if (Object.hasOwn(payload, 'bodyBase64') && payload.bodyBase64) {
    try {
      return Buffer.from(String(payload.bodyBase64), 'base64').toString('utf8');
    } catch {
      return fallbackBuffer.toString('utf8');
    }
  }
  return fallbackBuffer.toString('utf8');
}

function normalizePreviewPythonRequest(request = {}, previousUrl = '') {
  if (!request || typeof request !== 'object') return;
  let url = String(request.url || '');
  if (!url) return;
  try {
    const parsed = new URL(url);
    const urlChanged = url !== String(previousUrl || '');
    if (!urlChanged && Object.hasOwn(request, 'path')) {
      parsed.pathname = String(request.path || '/');
    }
    if (!urlChanged && Object.hasOwn(request, 'query')) {
      parsed.search = String(request.query || '').replace(/^\?/, '');
    }
    request.url = parsed.toString();
    request.path = parsed.pathname;
    request.query = parsed.search ? parsed.search.slice(1) : '';
  } catch {
    // Leave malformed preview URLs untouched.
  }
}

function compactCaptureForAiRule(capture) {
  if (!capture) return null;
  const requestBody = requestBodyForEditor(capture);
  const responseBody = bodyForEditor(capture);
  return {
    statusCode: capture.statusCode,
    requestHeaders: capture.requestHeaders || {},
    responseHeaders: capture.responseHeaders || {},
    requestBody: requestBody.body || requestBody.note || '',
    responseBody: responseBody.body || responseBody.note || '',
    contentType: capture.contentType || ''
  };
}

function compactAiRuleContext(rule, capture, sample = {}) {
  const captureContext = compactCaptureForAiRule(capture);
  if (rule.scope === 'global') {
    return {
      rule: {
        scope: 'global',
        host: rule.host || '',
        match: '对该域名下所有请求生效；没有固定 method、path、query、请求体或响应体样本。',
        guidance: '脚本必须基于运行时 ctx 安全判断 method、path、query、headers、body 后再修改，不能假设字段一定存在。'
      },
      sample: null
    };
  }
  return {
    rule: {
      method: rule.method,
      protocol: rule.protocol,
      host: rule.host,
      port: rule.port,
      path: rule.path,
      query: String(sample.query ?? rule.query ?? ''),
      queryMode: rule.queryMode || 'exact',
      requestBodyMode: rule.requestBodyMode || 'exact',
      requestHeaders: rule.requestHeaders || {},
      requestContentType: sample.requestContentType || rule.requestContentType || ''
    },
    sample: {
      requestHeaders: captureContext?.requestHeaders || rule.requestHeaders || {},
      requestBody: truncateAiContextText(sample.requestBody ?? captureContext?.requestBody ?? ''),
      responseStatusCode: captureContext?.statusCode || 0,
      responseHeaders: captureContext?.responseHeaders || {},
      responseBody: truncateAiContextText(captureContext?.responseBody || ''),
      responseContentType: captureContext?.contentType || ''
    }
  };
}

function compactValidationInput({ rule, query, requestBody, requestContentType, capture }) {
  const captureContext = compactCaptureForAiRule(capture);
  return {
    method: rule.method,
    url: buildUrl({ ...rule, query }, { includeQuery: true }),
    requestContentType,
    requestBody: truncateAiContextText(requestBody),
    responseStatusCode: captureContext?.statusCode || 0,
    responseContentType: captureContext?.contentType || '',
    responseBody: truncateAiContextText(captureContext?.responseBody || '')
  };
}

function truncateAiContextText(value) {
  const text = String(value || '');
  return text.length > 8000 ? `${text.slice(0, 8000)}\n...<truncated>` : text;
}

function formatPreviewBody(buffer, contentType) {
  const text = buffer.toString('utf8');
  if ((contentType || '').includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(text || '{}'), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function repeatTargetFromState(state, source, id, captures = []) {
  if (source === 'capture') {
    const capture = captures.find((item) => item.id === id);
    if (!capture) return null;
    return {
      method: capture.method,
      url: capture.url,
      headers: capture.requestHeaders || {},
      requestBodyBase64: capture.requestBodyBase64 || '',
      requestBodyTruncated: Boolean(capture.requestBodyTruncated)
    };
  }

  if (source === 'rule') {
    const rule = state.rules.find((item) => item.id === id);
    if (!rule) return null;
    return {
      method: rule.method,
      url: buildUrl(rule, { includeQuery: true }),
      headers: rule.requestHeaders || {},
      requestBodyBase64: rule.requestBodyBase64 || '',
      requestBodyTruncated: Boolean(rule.requestBodyTruncated)
    };
  }

  if (source === 'remote') {
    const rule = (state.remoteRules || []).find((item) => item.id === id);
    if (!rule) return null;
    return {
      method: rule.method,
      url: buildUrl(rule, { includeQuery: true }),
      headers: rule.requestHeaders || {},
      requestBodyBase64: rule.requestBodyBase64 || '',
      requestBodyTruncated: Boolean(rule.requestBodyTruncated)
    };
  }

  return null;
}

async function repeatRequest(target) {
  if (target.requestBodyTruncated) {
    throw new Error('Request body was truncated and cannot be repeated safely.');
  }

  const parsed = new URL(target.url);
  if (parsed.protocol === 'https:') {
    return repeatHttpsRequestThroughProxy(target, parsed);
  }
  return repeatHttpRequestThroughProxy(target, parsed);
}

function repeatHttpRequestThroughProxy(target, parsed) {
  return new Promise((resolve, reject) => {
    const bodyBuffer = Buffer.from(target.requestBodyBase64 || '', 'base64');
    const headers = repeatRequestHeaders(target.headers, bodyBuffer);
    const repeatedAt = new Date().toISOString();
    const request = http.request({
      host: config.host,
      port: config.proxyPort,
      method: target.method,
      path: parsed.toString(),
      headers: {
        ...headers,
        host: parsed.host
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => {
        resolve({
          ...repeatTargetMetadata(target, parsed, headers, bodyBuffer),
          repeatedAt,
          statusCode: response.statusCode
        });
      });
    });

    request.on('error', reject);
    if (bodyBuffer.length) {
      request.write(bodyBuffer);
    }
    request.end();
  });
}

function repeatHttpsRequestThroughProxy(target, parsed) {
  return new Promise((resolve, reject) => {
    const bodyBuffer = Buffer.from(target.requestBodyBase64 || '', 'base64');
    const headers = repeatRequestHeaders(target.headers, bodyBuffer);
    const repeatedAt = new Date().toISOString();
    const proxySocket = net.connect(config.proxyPort, config.host);
    let connectBuffer = Buffer.alloc(0);
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      proxySocket.destroy();
      reject(error);
    };

    proxySocket.once('error', fail);
    proxySocket.once('connect', () => {
      proxySocket.write([
        `CONNECT ${parsed.host} HTTP/1.1`,
        `Host: ${parsed.host}`,
        'Proxy-Connection: keep-alive',
        '',
        ''
      ].join('\r\n'));
    });

    proxySocket.on('data', function onConnectData(chunk) {
      connectBuffer = Buffer.concat([connectBuffer, Buffer.from(chunk)]);
      const headerEnd = connectBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      proxySocket.off('data', onConnectData);
      const head = connectBuffer.slice(headerEnd + 4);
      const statusLine = connectBuffer.slice(0, headerEnd).toString('latin1').split('\r\n')[0] || '';
      if (!/^HTTP\/1\.[01] 200\b/.test(statusLine)) {
        fail(new Error(`Proxy CONNECT failed: ${statusLine}`));
        return;
      }

      const secureSocket = tls.connect({
        socket: proxySocket,
        servername: parsed.hostname,
        ca: getProxyCa()
      });
      secureSocket.once('error', fail);
      secureSocket.once('secureConnect', () => {
        if (head.length) secureSocket.unshift(head);
        writeRawHttpRequest(secureSocket, {
          method: target.method,
          path: `${parsed.pathname}${parsed.search}`,
          host: parsed.host,
          headers,
          bodyBuffer
        });
        readRawHttpResponse(secureSocket)
          .then((response) => {
            if (settled) return;
            settled = true;
            resolve({
              ...repeatTargetMetadata(target, parsed, headers, bodyBuffer),
              repeatedAt,
              statusCode: response.statusCode
            });
          })
          .catch(fail);
      });
    });
  });
}

function writeRawHttpRequest(socket, { method, path, host, headers, bodyBuffer }) {
  const lines = [
    `${String(method || 'GET').toUpperCase()} ${path || '/'} HTTP/1.1`,
    `Host: ${host}`,
    ...Object.entries(headers || {})
      .filter(([name]) => String(name).toLowerCase() !== 'host')
      .map(([name, value]) => `${name}: ${value}`),
    'Connection: close',
    '',
    ''
  ];
  socket.write(lines.join('\r\n'));
  if (bodyBuffer.length) {
    socket.write(bodyBuffer);
  }
}

function readRawHttpResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let resolved = false;

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1 || resolved) return;

      const headerText = buffer.slice(0, headerEnd).toString('latin1');
      const statusLine = headerText.split('\r\n')[0] || '';
      const match = statusLine.match(/^HTTP\/1\.[01]\s+(\d+)/);
      if (!match) {
        resolved = true;
        reject(new Error(`Invalid HTTP response: ${statusLine}`));
        return;
      }

      resolved = true;
      resolve({ statusCode: Number(match[1]) });
    });

    socket.on('end', () => {
      if (!resolved) {
        reject(new Error('HTTPS repeat ended before response headers.'));
      }
    });

    socket.on('error', reject);
  });
}

function repeatRequestHeaders(headers, bodyBuffer) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const name = key.toLowerCase();
    if ([
      'host',
      'content-length',
      'connection',
      'proxy-connection',
      'accept-encoding',
      'content-encoding',
      'transfer-encoding'
    ].includes(name)) {
      continue;
    }
    result[name] = value;
  }

  result['accept-encoding'] = 'identity';
  if (bodyBuffer.length) {
    result['content-length'] = String(bodyBuffer.length);
  }
  return result;
}

function repeatTargetMetadata(target, parsed, headers, bodyBuffer) {
  return {
    method: String(target.method || 'GET').toUpperCase(),
    url: parsed.toString(),
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : defaultPort(parsed.protocol),
    path: parsed.pathname,
    query: parsed.search ? parsed.search.slice(1) : '',
    requestBodyHash: hashRequestBody(bodyBuffer, headerValue(headers, 'content-type'))
  };
}

function headerValue(headers, name) {
  const wanted = String(name || '').toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === wanted);
  if (!entry) return '';
  return Array.isArray(entry[1]) ? entry[1].join(', ') : String(entry[1]);
}

function defaultPort(protocol) {
  return protocol === 'https:' || protocol === 'https' ? 443 : 80;
}

function getProxyCa() {
  if (cachedProxyCa !== undefined) {
    return cachedProxyCa;
  }

  try {
    cachedProxyCa = fs.readFileSync(path.join(config.certsDir, 'certs', 'ca.pem'));
  } catch {
    cachedProxyCa = undefined;
  }
  return cachedProxyCa;
}

function previewRequestHeaders(rule, contentType, bodyLength) {
  const headers = {
    ...(rule.requestHeaders || {})
  };
  if (contentType) {
    headers['content-type'] = contentType;
  }
  delete headers['content-encoding'];
  if (bodyLength) {
    headers['content-length'] = String(bodyLength);
  } else {
    delete headers['content-length'];
  }
  return headers;
}

function syncPreviewBodyHeaders(headers = {}, bodyBuffer = Buffer.alloc(0)) {
  headers['content-length'] = String(Buffer.byteLength(bodyBuffer || Buffer.alloc(0)));
  delete headers['content-encoding'];
  return headers;
}

function buildUrl(item, options = {}) {
  if (item.scope === 'global') {
    const host = item.host || 'global.invalid';
    const protocol = item.protocol || 'https';
    const path = item.path || '/';
    const query = options.includeQuery && item.query ? `?${item.query}` : '';
    return `${protocol}://${host}${path}${query}`;
  }
  const protocol = item.protocol || 'https';
  const port = portSegment(protocol, item.port);
  const path = item.path || '/';
  const query = options.includeQuery && item.query ? `?${item.query}` : '';
  return `${protocol}://${item.host}${port}${path}${query}`;
}

function portSegment(protocol, port) {
  const numericPort = Number(port);
  if (!Number.isFinite(numericPort)) return '';
  if (protocol === 'http' && numericPort === 80) return '';
  if (protocol === 'https' && numericPort === 443) return '';
  return `:${numericPort}`;
}

function whichCommand(command) {
  try {
    return execFileSync('which', [command], {
      encoding: 'utf8',
      timeout: 3000,
      env: aiCommandEnv(),
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

function normalizeProjectPath(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    return path.resolve(candidate);
  } catch {
    return '';
  }
}

async function writeAiTerminalPrompt(prompt) {
  const dir = path.join(config.dataDir, 'ai-terminal-prompts');
  await fs.promises.mkdir(dir, { recursive: true });
  const fileName = `ask-ai-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.md`;
  const filePath = path.join(dir, fileName);
  await fs.promises.writeFile(filePath, `${String(prompt || '').trim()}\n`, 'utf8');
  cleanupAiTerminalPrompts({ keepPath: filePath }).catch((error) => {
    console.warn('Failed to cleanup AI terminal prompts:', error.message);
  });
  return filePath;
}

function aiTerminalCommand(provider, projectPath, promptPath) {
  const promptArg = shellQuote(aiTerminalStartupPrompt(provider, promptPath));
  if (provider === 'cursor') {
    return `cursor-agent --workspace ${shellQuote(projectPath)} ${promptArg}`;
  }
  if (provider === 'claude') {
    return `cd ${shellQuote(projectPath)} && claude ${promptArg}`;
  }
  return `codex -c features.codex_hooks=false --cd ${shellQuote(projectPath)} ${promptArg}`;
}

function aiTerminalStartupPrompt(provider, promptPath) {
  const label = provider === 'cursor'
    ? 'Cursor'
    : provider === 'claude'
      ? 'Claude'
      : 'Codex';
  return [
    `请读取文件 ${promptPath} 中的 HttpMocker 请求上下文。`,
    '先结合当前工程代码分析这个接口的用途、调用位置、关键参数和响应字段含义。',
    '后续我会继续追问，请保持这个上下文。',
    `提示：你当前运行在 ${label} CLI 的交互会话里。`
  ].join(' ');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function aiCommandEnv() {
  const env = { ...process.env };
  const home = process.env.HOME || '';
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
  return env;
}

function normalizeAiProvider(value) {
  const provider = String(value || 'none');
  return aiProviders.some((item) => item.id === provider) || provider === 'none'
    ? provider
    : 'none';
}

function normalizeLanguage(value) {
  const language = String(value || 'zh-CN');
  return ['zh-CN', 'en', 'ja', 'ko', 'ru', 'hi', 'es', 'de', 'fr', 'ar'].includes(language) ? language : 'zh-CN';
}

function normalizeAppearance(value) {
  const appearance = String(value || 'system');
  return ['system', 'light', 'dark'].includes(appearance) ? appearance : 'system';
}

function requestContentTypeForRemoteBody(body, explicitContentType, fallbackContentType) {
  if (explicitContentType) return String(explicitContentType);

  const text = String(body ?? '');
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(text);
      return 'application/json';
    } catch {
      // Fall through to the saved content type or text default.
    }
  }

  const fallback = String(fallbackContentType || '');
  if (fallback && !fallback.toLowerCase().startsWith('text/plain')) {
    return fallback;
  }
  return text ? 'text/plain; charset=utf-8' : fallback;
}

function unique(values) {
  return [...new Set(values)];
}
