import { randomUUID } from 'node:crypto';
import { bodyForEditor, requestBodyForEditor } from './match.js';
import {
  applyPythonRulesForStage,
  generatePythonRuleWithAi,
  repairPythonRuleWithAi,
  reviewAiRulePromptWithAi
} from './python-rules.js';
import { normalizeRemoteSteps, serializeDslSteps } from './remote-rules.js';
import { readState, updateState } from './fs-store.js';
import { emitCodexQueueChanged, emitRulesChanged } from './events.js';

const maxConcurrentJobs = 3;
const maxOutputLines = 400;
const failureTtlMs = 60 * 1000;

const state = {
  pending: [],
  running: new Map(),
  completed: 0,
  failed: 0,
  lastError: '',
  lastErrorAt: 0
};

let processing = false;

export function aiRuleQueueStatus() {
  expireFailureState();
  return {
    pending: state.pending.length,
    running: state.running.size,
    maxConcurrent: maxConcurrentJobs,
    completed: state.completed,
    failed: state.failed,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
    current: [...state.running.values()].map((job) => ({
      id: job.id,
      ruleId: job.ruleId,
      stepId: job.stepId,
      path: job.rule?.path || '',
      host: job.rule?.host || ''
    }))
  };
}

export async function stopAiRuleJobs() {
  const queuedJobs = state.pending.splice(0);
  const runningJobs = [...state.running.values()];
  for (const job of [...queuedJobs, ...runningJobs]) {
    job.aborted = true;
    job.abortController?.abort();
    await stopJob(job);
  }
  notifyAiRuleQueueChanged();
  return aiRuleQueueStatus();
}

export async function enqueueAiRuleJob({ ruleId, stepId, prompt, pythonScript, userSummary, query, requestBody, requestContentType }) {
  const job = await updateState((store) => {
    const rule = (store.remoteRules || []).find((item) => item.id === ruleId);
    if (!rule) return null;
    const steps = normalizeRemoteSteps(rule);
    const step = steps.find((item) => item.id === stepId && item.type === 'ai');
    if (!step) return null;

    const normalizedPrompt = String(prompt || step.aiPromptDraft || '').trim();
    if (!normalizedPrompt) return { error: '请输入 AI 生成规则的提示词。' };

    const existingJobId = step.aiJobId && (state.running.has(step.aiJobId) || state.pending.some((item) => item.id === step.aiJobId))
      ? step.aiJobId
      : '';
    if (existingJobId) {
      return { existing: true, jobId: existingJobId, rule, step };
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const isFirstGeneration = !step.aiContext && !step.pythonScript && !(Array.isArray(step.aiPromptHistory) && step.aiPromptHistory.length);
    step.aiJobId = id;
    step.aiStatus = 'queued';
    step.aiError = '';
    step.aiPromptDraft = normalizedPrompt;
    step.aiUpdatedAt = now;
    step.aiOutputLines = [`已加入 AI 生成队列 ${now}`];
    const normalizedUserSummary = normalizedSummaryHint(userSummary);
    if (normalizedUserSummary) {
      step.summary = normalizedUserSummary;
    }
    if (Object.hasOwn({ pythonScript }, 'pythonScript')) {
      step.pythonScript = String(pythonScript || step.pythonScript || '');
    }
    syncLegacyAiFields(rule, steps);

    return {
      id,
      ruleId,
      stepId,
      prompt: normalizedPrompt,
      pythonScript: String(pythonScript || step.pythonScript || ''),
      userSummary: normalizedUserSummary,
      query: String(query ?? rule.query ?? '').replace(/^\?/, ''),
      requestBody: String(requestBody ?? ''),
      requestContentType: String(requestContentType || rule.requestContentType || ''),
      isFirstGeneration,
      rule: { ...rule, steps },
      step: { ...step }
    };
  });

  if (!job) throw Object.assign(new Error('AI rule step not found.'), { statusCode: 404 });
  if (job.error) throw Object.assign(new Error(job.error), { statusCode: 400 });
  if (job.existing) return { jobId: job.jobId, status: aiRuleQueueStatus(), existing: true };

  state.pending.push(job);
  notifyAiRuleQueueChanged();
  processAiRuleQueue().catch((error) => {
    state.lastError = error.message || 'AI rule queue failed.';
    state.lastErrorAt = Date.now();
    notifyAiRuleQueueChanged();
  });
  return { jobId: job.id, status: aiRuleQueueStatus(), existing: false };
}

function processAiRuleQueue() {
  if (processing) return Promise.resolve();
  processing = true;
  return Promise.resolve().then(async () => {
    try {
      while (state.pending.length && state.running.size < maxConcurrentJobs) {
        const job = state.pending.shift();
        state.running.set(job.id, job);
        notifyAiRuleQueueChanged();
        runJob(job).finally(() => {
          state.running.delete(job.id);
          notifyAiRuleQueueChanged();
          processing = false;
          processAiRuleQueue().catch((error) => {
            state.lastError = error.message || 'AI rule queue failed.';
            state.lastErrorAt = Date.now();
            notifyAiRuleQueueChanged();
          });
        });
      }
    } finally {
      processing = false;
    }
  });
}

async function runJob(job) {
  job.abortController = new AbortController();
  await markStep(job, {
    aiStatus: 'running',
    aiError: '',
    appendOutput: `开始生成 ${new Date().toISOString()}`
  });

  try {
    const store = await readState();
    const settings = store.settings || {};
    const provider = settings.aiProvider || 'codex';
    if (provider === 'none') {
      throw new Error('AI 已禁用。请在右上角开启 AI。');
    }

    const latestRule = (store.remoteRules || []).find((item) => item.id === job.ruleId) || job.rule;
    const steps = normalizeRemoteSteps(latestRule);
    const targetStep = steps.find((step) => step.id === job.stepId && step.type === 'ai') || job.step;
    const capture = remoteRuleExampleCapture(latestRule);
    const requestBody = job.requestBody || requestBodyForEditor(latestRule).body || '';
    const requestContentType = requestContentTypeForRemoteBody(requestBody, job.requestContentType, latestRule.requestContentType);
    const aiContext = job.isFirstGeneration
      ? compactAiRuleContext(latestRule, capture, { query: job.query, requestBody, requestContentType })
      : targetStep.aiContext || compactAiRuleContext(latestRule, capture, { query: job.query, requestBody, requestContentType });
    const currentScript = job.pythonScript || targetStep.pythonScript || '';
    const aiRuleData = {
      ...withoutLegacyAiFields(latestRule),
      steps,
      script: serializeDslSteps(steps),
      scriptType: steps.some((step) => step.type === 'ai') ? 'mixed' : 'dsl',
      pythonScript: targetStep.pythonScript || '',
      aiPromptHistory: job.isFirstGeneration ? [] : targetStep.aiPromptHistory || [],
      aiContext: job.isFirstGeneration ? null : targetStep.aiContext || null
    };
    const outputLines = [];
    const onOutput = (line) => {
      outputLines.push(line);
      markStep(job, { outputLines: [...outputLines] }).catch(() => {});
    };

    outputLines.push('正在校验需求可实现性...');
    await markStep(job, { outputLines: [...outputLines] });
    const review = await reviewAiRulePromptWithAi({
      rule: aiRuleData,
      prompt: job.prompt,
      aiContext,
      onOutput,
      signal: job.abortController.signal,
      provider
    });
    if (!review.ok) {
      const reason = review.reason || '这个脚本需求不符合代理执行时序，请调整后重试。';
      await failJob(job, `需求不合理：${reason}`, {
        outputLines: [...outputLines, `需求不合理：${reason}`]
      });
      return;
    }
    outputLines.push(review.reason ? `需求校验通过：${review.reason}` : '需求校验通过。');
    await markStep(job, { outputLines: [...outputLines] });

    let result = await generatePythonRuleWithAi({
      rule: aiRuleData,
      capture: compactCaptureForAiRule(capture),
      prompt: job.prompt,
      currentScript,
      aiContext,
      onOutput,
      signal: job.abortController.signal,
      provider
    });
    if (latestRule.scope === 'global') {
      await completeJob(job, result, [...outputLines, '全局规则没有固定示例，已跳过本地示例验证。'], aiContext);
      return;
    }
    let validation = await previewPythonRemoteRule({
      rule: latestRule,
      query: job.query,
      requestBody,
      requestContentType,
      responseBaseCapture: capture,
      pythonScript: result.script
    });

    if (validation.errors?.length) {
      outputLines.push('本地示例验证失败，正在让 AI 修复脚本...');
      await markStep(job, { outputLines: [...outputLines] });
      const repaired = await repairPythonRuleWithAi({
        rule: aiRuleData,
        prompt: job.prompt,
        currentScript: result.script,
        aiContext,
        validationErrors: validation.errors,
        validationInput: compactValidationInput({ rule: latestRule, query: job.query, requestBody, requestContentType, capture }),
        onOutput,
        signal: job.abortController.signal,
        provider
      });
      const repairedValidation = await previewPythonRemoteRule({
        rule: latestRule,
        query: job.query,
        requestBody,
        requestContentType,
        responseBaseCapture: capture,
        pythonScript: repaired.script
      });
      if (repairedValidation.errors?.length) {
        await failJob(job, `AI 生成的脚本验证失败：${formatValidationErrors(repairedValidation.errors)}`, {
          script: repaired.script,
          summary: repaired.summary || result.summary || 'AI 脚本规则',
          outputLines: [...outputLines, `本地示例验证失败：${formatValidationErrors(repairedValidation.errors)}`]
        });
        return;
      }
      result = repaired;
      validation = repairedValidation;
    }

    await completeJob(job, result, [...outputLines, '本地示例验证通过。'], aiContext);
    state.completed += 1;
  } catch (error) {
    if (job.aborted || job.abortController?.signal?.aborted) {
      await stopJob(job);
      return;
    }
    await failJob(job, error.message || 'AI 生成失败。');
  }
}

async function completeJob(job, result, outputLines, aiContext) {
  await updateState((store) => {
    const rule = (store.remoteRules || []).find((item) => item.id === job.ruleId);
    if (!rule) return;
    const steps = normalizeRemoteSteps(rule);
    const step = steps.find((item) => item.id === job.stepId && item.type === 'ai');
    if (!step) return;
    step.pythonScript = result.script;
    step.summary = normalizedSummaryHint(job.userSummary) || normalizedSummaryHint(step.summary) || normalizedSummaryHint(result.summary) || 'AI 脚本规则';
    step.aiOutputLines = trimOutput(outputLines);
    step.aiContext = result.aiContext || aiContext;
    step.aiPromptDraft = '';
    step.aiStatus = 'succeeded';
    step.aiJobId = '';
    step.aiError = '';
    step.aiUpdatedAt = new Date().toISOString();
    step.aiPromptHistory = [
      ...(Array.isArray(step.aiPromptHistory) ? step.aiPromptHistory : []),
      {
        prompt: result.prompt,
        createdAt: new Date().toISOString(),
        includedRequestContext: result.includeRequestContext
      }
    ];
    syncLegacyAiFields(rule, steps);
  });
  emitRulesChanged({ kind: 'remote', action: 'snapshot', reason: 'aiCompleted', ruleId: job.ruleId });
  notifyAiRuleQueueChanged();
}

async function failJob(job, message, patch = {}) {
  state.failed += 1;
  state.lastError = message;
  state.lastErrorAt = Date.now();
  await updateState((store) => {
    const rule = (store.remoteRules || []).find((item) => item.id === job.ruleId);
    if (!rule) return;
    const steps = normalizeRemoteSteps(rule);
    const step = steps.find((item) => item.id === job.stepId && item.type === 'ai');
    if (!step) return;
    if (patch.script) step.pythonScript = patch.script;
    step.summary = normalizedSummaryHint(job.userSummary) || normalizedSummaryHint(step.summary) || normalizedSummaryHint(patch.summary) || 'AI 脚本规则';
    step.aiOutputLines = trimOutput(patch.outputLines || [...(step.aiOutputLines || []), `生成失败：${message}`]);
    step.aiStatus = 'failed';
    step.aiJobId = '';
    step.aiError = message;
    step.aiUpdatedAt = new Date().toISOString();
    syncLegacyAiFields(rule, steps);
  });
  emitRulesChanged({ kind: 'remote', action: 'snapshot', reason: 'aiFailed', ruleId: job.ruleId });
  notifyAiRuleQueueChanged();
}

async function stopJob(job) {
  if (job.stopped) return;
  job.stopped = true;
  await updateState((store) => {
    const rule = (store.remoteRules || []).find((item) => item.id === job.ruleId);
    if (!rule) return;
    const steps = normalizeRemoteSteps(rule);
    const step = steps.find((item) => item.id === job.stepId && item.type === 'ai');
    if (!step) return;
    if (step.aiStatus === 'stopped' && !step.aiJobId) return;
    step.aiOutputLines = trimOutput([...(step.aiOutputLines || []), `已停止 ${new Date().toISOString()}`]);
    step.aiStatus = 'stopped';
    step.aiJobId = '';
    step.aiError = '';
    step.aiUpdatedAt = new Date().toISOString();
    syncLegacyAiFields(rule, steps);
  });
  emitRulesChanged({ kind: 'remote', action: 'snapshot', reason: 'aiStopped', ruleId: job.ruleId });
}

function expireFailureState() {
  if (!state.lastErrorAt || Date.now() - state.lastErrorAt < failureTtlMs) return;
  state.failed = 0;
  state.lastError = '';
  state.lastErrorAt = 0;
}

async function markStep(job, patch = {}) {
  await updateState((store) => {
    const rule = (store.remoteRules || []).find((item) => item.id === job.ruleId);
    if (!rule) return;
    const steps = normalizeRemoteSteps(rule);
    const step = steps.find((item) => item.id === job.stepId && item.type === 'ai');
    if (!step) return;
    if (patch.aiStatus) step.aiStatus = patch.aiStatus;
    if (Object.hasOwn(patch, 'aiError')) step.aiError = patch.aiError;
    if (patch.appendOutput) step.aiOutputLines = trimOutput([...(step.aiOutputLines || []), patch.appendOutput]);
    if (patch.outputLines) step.aiOutputLines = trimOutput(patch.outputLines);
    step.aiUpdatedAt = new Date().toISOString();
    syncLegacyAiFields(rule, steps);
  });
  emitRulesChanged({ kind: 'remote', action: 'snapshot', reason: 'aiProgress', ruleId: job.ruleId });
  notifyAiRuleQueueChanged();
}

function notifyAiRuleQueueChanged() {
  emitCodexQueueChanged({ source: 'aiRules' });
}

function syncLegacyAiFields(rule, steps) {
  rule.steps = normalizeRemoteSteps({ steps });
  const firstAi = rule.steps.find((item) => item.type === 'ai');
  rule.script = serializeDslSteps(rule.steps);
  rule.scriptType = firstAi ? 'mixed' : 'dsl';
  clearLegacyAiFields(rule);
  rule.updatedAt = new Date().toISOString();
}

function clearLegacyAiFields(rule) {
  rule.pythonScript = '';
  rule.aiSummary = '';
  rule.aiOutputLines = [];
  rule.aiPromptHistory = [];
  rule.aiContext = null;
  rule.aiStepId = '';
}

function withoutLegacyAiFields(rule = {}) {
  const {
    pythonScript: _pythonScript,
    aiSummary: _aiSummary,
    aiOutputLines: _aiOutputLines,
    aiPromptHistory: _aiPromptHistory,
    aiContext: _aiContext,
    aiStepId: _aiStepId,
    ...rest
  } = rule;
  return rest;
}

function normalizedSummaryHint(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text === 'AI 脚本规则') return '';
  return text;
}

function trimOutput(lines = []) {
  return lines.map(String).filter(Boolean).slice(-maxOutputLines);
}

function remoteRuleExampleCapture(rule) {
  if (!rule?.exampleCapture || typeof rule.exampleCapture !== 'object') return null;
  return rule.exampleCapture;
}

function requestContentTypeForRemoteBody(body, requestedContentType, fallbackContentType) {
  if (requestedContentType) return String(requestedContentType);
  const text = String(body || '').trim();
  if (!text) return fallbackContentType || '';
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    return 'application/json';
  }
  if (text.includes('=') && !text.includes('\n')) return 'application/x-www-form-urlencoded';
  return fallbackContentType || '';
}

function compactAiRuleContext(rule, capture, extra = {}) {
  if (rule.scope === 'global') {
    return {
      rule: {
        scope: 'global',
        host: rule.host || '',
        match: '对该域名下所有请求生效；没有固定 method、path、query、请求体或响应体样本。',
        guidance: '脚本必须基于运行时 ctx 安全判断 method、path、query、headers、body 后再修改，不能假设字段一定存在。'
      },
      latestCapture: null
    };
  }
  return {
    rule: {
      method: rule.method,
      protocol: rule.protocol,
      host: rule.host,
      port: rule.port,
      path: rule.path,
      queryMode: rule.queryMode || 'exact',
      query: extra.query ?? rule.query ?? '',
      requestBodyMode: rule.requestBodyMode || 'ignore',
      requestContentType: extra.requestContentType || rule.requestContentType || '',
      requestBody: truncate(extra.requestBody || '')
    },
    latestCapture: capture ? compactCaptureForAiRule(capture) : null
  };
}

function compactCaptureForAiRule(capture) {
  if (!capture) return null;
  return {
    method: capture.method,
    url: capture.url,
    host: capture.host,
    path: capture.path,
    query: capture.query || '',
    statusCode: capture.statusCode,
    requestHeaders: capture.requestHeaders || {},
    responseHeaders: capture.responseHeaders || {},
    requestBody: truncate(safeRequestBody(capture)),
    responseBody: truncate(safeResponseBody(capture)),
    requestContentType: capture.requestContentType || '',
    responseContentType: capture.contentType || ''
  };
}

function compactValidationInput({ rule, query, requestBody, requestContentType, capture }) {
  return {
    rule: {
      method: rule.method,
      host: rule.host,
      path: rule.path,
      query
    },
    requestBody: truncate(requestBody),
    requestContentType,
    responseBody: truncate(safeResponseBody(capture))
  };
}

function safeRequestBody(capture) {
  try {
    const body = requestBodyForEditor(capture);
    return body.body || body.note || '';
  } catch {
    return '';
  }
}

function safeResponseBody(capture) {
  try {
    const body = bodyForEditor(capture);
    return body.body || body.note || '';
  } catch {
    return '';
  }
}

function safeBodyForEditor(capture) {
  try {
    return bodyForEditor(capture);
  } catch {
    return { editable: false, body: '', note: '' };
  }
}

function truncate(value) {
  const text = String(value || '');
  return text.length > 8000 ? `${text.slice(0, 8000)}\n...<truncated>` : text;
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

async function previewPythonRemoteRule({ rule, query, requestBody, requestContentType, responseBaseCapture, pythonScript }) {
  const requestBodyBuffer = Buffer.from(String(requestBody ?? ''), 'utf8');
  const initialUrl = buildUrl({ ...rule, query }, { includeQuery: true });
  const initialRequest = {
    method: rule.method,
    url: initialUrl,
    headers: previewRequestHeaders(rule, requestContentType, requestBodyBuffer.length)
  };
  const initialResponseBody = responseBaseCapture
    ? safeBodyForEditor(responseBaseCapture)
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

  return { errors };
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

function normalizePreviewPythonRequest(request = {}, previousUrl = '') {
  if (!request || typeof request !== 'object') return;
  const url = String(request.url || '');
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

function headerValue(headers, name) {
  const wanted = String(name || '').toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === wanted);
  if (!entry) return '';
  return Array.isArray(entry[1]) ? entry[1].join(', ') : String(entry[1]);
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
