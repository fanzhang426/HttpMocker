import crypto from 'node:crypto';
import {
  bodyHash,
  normalizeHeaders,
  queryIncludesRequired,
  requestBodyIncludesRequired,
  requestBodyFieldsFromText
} from './match.js';

const commandPattern = /^(change_req_body|change_resp_body|change_query|change_req_head|change_resp_head)\s+([^\s]+)\s+to\s+"((?:\\.|[^"\\])*)"$/;

export function createRemoteRuleFromCapture(capture) {
  const hasRequestBody = Number(capture.requestBodySize || 0) > 0 || Boolean(capture.requestBodyBase64);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    enabled: true,
    method: capture.method,
    protocol: capture.protocol,
    host: capture.host,
    port: capture.port,
    path: capture.path,
    queryMode: 'exact',
    query: capture.query || '',
    requestBodyMode: methodHasRequestBody(capture.method) && hasRequestBody ? 'exact' : 'ignore',
    requestHeaders: normalizeHeaders(capture.requestHeaders || {}),
    requestContentType: capture.requestContentType || '',
    requestBodySize: Number(capture.requestBodySize || 0),
    requestBodyHash: hasRequestBody ? (capture.requestBodyHash || '') : '',
    requestBodyBase64: capture.requestBodyBase64 || '',
    requestBodyEditable: Boolean(capture.requestBodyEditable),
    requestBodyTruncated: Boolean(capture.requestBodyTruncated),
    exampleCapture: remoteExampleCaptureFromCapture(capture),
    scriptType: 'dsl',
    script: ''
  };
}

export function createGlobalRemoteRule(values = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    scope: 'global',
    enabled: values.enabled !== false,
    method: '*',
    protocol: '',
    host: normalizeHost(values.host || ''),
    port: 0,
    path: '',
    queryMode: 'ignore',
    query: '',
    requestBodyMode: 'ignore',
    requestHeaders: {},
    requestContentType: '',
    requestBodySize: 0,
    requestBodyHash: '',
    requestBodyBase64: '',
    requestBodyEditable: false,
    requestBodyTruncated: false,
    scriptType: 'dsl',
    script: '',
    steps: []
  };
}

export function updateRemoteRuleFromCapture(rule, capture) {
  rule.updatedAt = new Date().toISOString();
  rule.requestHeaders = normalizeHeaders(capture.requestHeaders || {});
  rule.requestContentType = capture.requestContentType || '';
  rule.requestBodySize = Number(capture.requestBodySize || 0);
  rule.requestBodyHash = capture.requestBodyHash || '';
  rule.requestBodyBase64 = capture.requestBodyBase64 || '';
  rule.requestBodyEditable = Boolean(capture.requestBodyEditable);
  rule.requestBodyTruncated = Boolean(capture.requestBodyTruncated);
  rule.exampleCapture = remoteExampleCaptureFromCapture(capture);
  delete rule.exampleCaptureId;
  return rule;
}

export function findRemoteRules(remoteRules, request, options = {}) {
  const parsed = new URL(request.url);
  const protocol = parsed.protocol.replace(':', '');
  const port = parsed.port ? Number(parsed.port) : defaultPort(parsed.protocol);
  const method = request.method.toUpperCase();
  const query = parsed.search ? parsed.search.slice(1) : '';

  return (remoteRules || []).filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.scope === 'global') {
      return Boolean(rule.host) && rule.host === parsed.hostname;
    }
    if (rule.method !== '*' && rule.method.toUpperCase() !== method) return false;
    if (rule.protocol && rule.protocol !== protocol) return false;
    if (rule.host !== parsed.hostname) return false;
    if (Number(rule.port || defaultPort(parsed.protocol)) !== port) return false;
    if (rule.path !== parsed.pathname) return false;
    if (rule.queryMode !== 'ignore' && !queryIncludesRequired(query, rule.query || '')) return false;
    if (!requestBodyIncludesRequired(rule, request, method)) return false;
    return true;
  });
}

export function orderRemoteRules(remoteRules = []) {
  const globals = [];
  const regular = [];
  for (const rule of remoteRules || []) {
    if (rule?.scope === 'global') {
      globals.push(rule);
    } else {
      regular.push(rule);
    }
  }
  return [...globals, ...regular];
}

export function remoteRuleTargetKey(rule) {
  return [
    rule.method,
    rule.protocol,
    rule.host,
    Number(rule.port),
    rule.path,
    rule.queryMode === 'ignore' ? '<ignore-query>' : (rule.query || ''),
    shouldMatchRequestBody(rule, rule.method) ? remoteRuleBodyHashKey(rule) : '<ignore-body>'
  ].join('\u0000');
}

export function remoteRequestBodyFieldsFromText(body, contentType) {
  return requestBodyFieldsFromText(body, contentType);
}

export function parseRemoteScript(script) {
  const commands = [];
  const errors = [];

  String(script || '').split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const match = line.match(commandPattern);
    if (!match) {
      errors.push(`Line ${index + 1}: invalid remote rule syntax.`);
      return;
    }

    commands.push({
      action: match[1],
      path: match[2],
      value: decodeValue(match[3])
    });
  });

  return { commands, errors };
}

export function splitRemoteCommands(remoteRules) {
  const requestBody = [];
  const responseBody = [];
  const query = [];
  const requestHead = [];
  const responseHead = [];
  const errors = [];

  for (const rule of remoteRules || []) {
    const steps = normalizeRemoteSteps(rule);
    for (const step of steps) {
      if (step.type !== 'dsl' || step.enabled === false) continue;
      const command = remoteStepCommand(step);
      if (!command) {
        errors.push(`${rule.host}${rule.path}: invalid remote rule syntax.`);
        continue;
      }
      if (command.action === 'change_req_body') requestBody.push(command);
      if (command.action === 'change_resp_body') responseBody.push(command);
      if (command.action === 'change_query') query.push(command);
      if (command.action === 'change_req_head') requestHead.push(command);
      if (command.action === 'change_resp_head') responseHead.push(command);
    }
  }

  return { requestBody, responseBody, query, requestHead, responseHead, errors };
}

export function normalizeRemoteSteps(rule = {}) {
  if (Array.isArray(rule.steps)) {
    return rule.steps
      .map((step, index) => normalizeRemoteStep(step, index))
      .filter(Boolean);
  }

  const steps = scriptToRemoteSteps(rule.script);
  if (rule.pythonScript) {
    steps.push(normalizeRemoteStep({
      id: rule.aiStepId || 'legacy-ai',
      type: 'ai',
      enabled: true,
      summary: rule.aiSummary || 'AI 脚本规则',
      pythonScript: rule.pythonScript || '',
      aiOutputLines: rule.aiOutputLines || [],
      aiPromptHistory: rule.aiPromptHistory || [],
      aiContext: rule.aiContext || null
    }, steps.length));
  }
  return steps;
}

export function remoteStepCommand(step = {}) {
  const action = String(step.action || '');
  const path = String(step.path || '').trim();
  if (!commandActionSet.has(action) || !path) return null;
  return {
    action,
    path,
    value: String(step.value ?? '')
  };
}

export function serializeDslSteps(steps = {}) {
  return normalizeRemoteSteps({ steps })
    .filter((step) => step.type === 'dsl')
    .map((step) => {
      const line = serializeDslStep(step);
      return step.enabled === false ? `# disabled ${line}` : line;
    })
    .filter(Boolean)
    .join('\n');
}

export function applyQueryChanges(url, commands) {
  if (!commands.length) return url;
  const parsed = new URL(url);
  for (const command of commands) {
    if (isEmptyReplacement(command)) {
      parsed.searchParams.delete(command.path);
    } else {
      parsed.searchParams.set(command.path, command.value);
    }
  }
  return parsed.toString();
}

export function applyHeaderChanges(headers, commands) {
  const result = { ...(headers || {}) };
  let changed = false;
  for (const command of commands || []) {
    const name = String(command.path || '').trim().toLowerCase();
    if (!name) continue;
    const value = String(command.value ?? '');
    if (value === '') {
      if (Object.prototype.hasOwnProperty.call(result, name)) {
        delete result[name];
        changed = true;
      }
      continue;
    }
    if (result[name] !== value) {
      result[name] = value;
      changed = true;
    }
  }
  return { headers: result, changed };
}

export function applyBodyChanges(buffer, contentType, commands) {
  if (!commands.length) return { buffer, changed: false };
  const type = (contentType || '').toLowerCase();
  const text = buffer.toString('utf8');

  if (type.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text);
    for (const command of commands) {
      if (isEmptyReplacement(command)) {
        params.delete(command.path);
      } else {
        params.set(command.path, command.value);
      }
    }
    return { buffer: Buffer.from(params.toString(), 'utf8'), changed: true };
  }

  try {
    const parsed = JSON.parse(text || '{}');
    if (!parsed || typeof parsed !== 'object') {
      return { buffer, changed: false };
    }

    const json = parsed;
    let changed = false;
    for (const command of commands) {
      if (isEmptyReplacement(command)) {
        changed = deletePathValue(json, command.path) || changed;
        continue;
      }
      const parsedValue = parseJsonLiteral(command.value);
      if (!parsedValue.ok) continue;
      changed = setPathValue(json, command.path, parsedValue.value) || changed;
    }
    return { buffer: Buffer.from(JSON.stringify(json), 'utf8'), changed };
  } catch {
    return { buffer, changed: false };
  }
}

function decodeValue(value) {
  const unescaped = String(value)
    .replaceAll('\\"', '"')
    .replaceAll('\\\\', '\\');
  try {
    return decodeURIComponent(unescaped);
  } catch {
    return unescaped;
  }
}

function normalizeHost(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text.includes('://') ? text : `https://${text}`).hostname;
  } catch {
    return text.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].trim();
  }
}

function normalizeRemoteStep(step = {}, index = 0) {
  const type = step.type === 'ai' ? 'ai' : 'dsl';
  const base = {
    id: String(step.id || `${type}-${Date.now()}-${index}`),
    type,
    enabled: step.enabled !== false
  };
  if (type === 'ai') {
    return {
      ...base,
      summary: normalizeSummary(step.summary || step.aiSummary || 'AI 脚本规则'),
      pythonScript: String(step.pythonScript || ''),
      aiOutputLines: Array.isArray(step.aiOutputLines) ? step.aiOutputLines.map(String) : [],
      aiPromptHistory: Array.isArray(step.aiPromptHistory) ? step.aiPromptHistory : [],
      aiContext: step.aiContext && typeof step.aiContext === 'object' ? step.aiContext : null,
      aiPromptDraft: String(step.aiPromptDraft || ''),
      aiStatus: normalizeAiStatus(step.aiStatus),
      aiJobId: String(step.aiJobId || ''),
      aiError: String(step.aiError || ''),
      aiUpdatedAt: String(step.aiUpdatedAt || '')
    };
  }
  return {
    ...base,
    action: String(step.action || ''),
    path: String(step.path || ''),
    value: String(step.value ?? ''),
    note: String(step.note || '')
  };
}

function scriptToRemoteSteps(script = '') {
  const steps = [];
  String(script || '').split(/\r?\n/).forEach((rawLine, index) => {
    const rawTrimmed = rawLine.trim();
    if (!rawTrimmed) return;
    const enabled = !rawTrimmed.startsWith('# disabled ');
    const line = enabled ? rawTrimmed : rawTrimmed.slice('# disabled '.length).trim();
    if (!line || line.startsWith('#')) return;
    const match = line.match(commandPattern);
    if (!match) return;
    steps.push(normalizeRemoteStep({
      id: `legacy-dsl-${index}`,
      type: 'dsl',
      enabled,
      action: match[1],
      path: match[2],
      value: decodeValue(match[3])
    }, index));
  });
  return steps;
}

function serializeDslStep(step = {}) {
  const command = remoteStepCommand(step);
  if (!command) return '';
  return `${command.action} ${command.path} to "${encodeURIComponent(command.value).replaceAll('"', '\\"')}"`;
}

function normalizeSummary(value) {
  const text = String(value || 'AI 脚本规则').trim() || 'AI 脚本规则';
  return text.replace(/\s+/g, ' ');
}

function normalizeAiStatus(value) {
  return ['queued', 'running', 'succeeded', 'failed'].includes(value) ? value : '';
}

const commandActionSet = new Set([
  'change_req_body',
  'change_resp_body',
  'change_query',
  'change_req_head',
  'change_resp_head'
]);

function remoteExampleCaptureFromCapture(capture = {}) {
  return {
    id: capture.id || '',
    createdAt: capture.createdAt || '',
    method: capture.method || '',
    url: capture.url || '',
    protocol: capture.protocol || '',
    host: capture.host || '',
    port: Number(capture.port || 0),
    path: capture.path || '',
    query: capture.query || '',
    statusCode: Number(capture.statusCode || 0),
    statusMessage: capture.statusMessage || '',
    requestHeaders: normalizeHeaders(capture.requestHeaders || {}),
    requestContentType: capture.requestContentType || '',
    requestBodySize: Number(capture.requestBodySize || 0),
    requestBodyHash: capture.requestBodyHash || '',
    requestBodyBase64: capture.requestBodyBase64 || '',
    requestBodyEditable: Boolean(capture.requestBodyEditable),
    requestBodyTruncated: Boolean(capture.requestBodyTruncated),
    responseHeaders: normalizeHeaders(capture.responseHeaders || {}),
    contentType: capture.contentType || '',
    bodySize: Number(capture.bodySize || 0),
    contentLength: Number(capture.contentLength || capture.bodySize || 0),
    bodyBase64: capture.bodyBase64 || '',
    editable: Boolean(capture.editable)
  };
}

function parseJsonLiteral(value) {
  try {
    return { ok: true, value: JSON.parse(String(value)) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function isEmptyReplacement(command) {
  return String(command?.value ?? '') === '';
}

function setPathValue(target, path, value) {
  const tokens = parsePath(path);
  if (!tokens?.length) return false;

  let current = target;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const isLast = index === tokens.length - 1;
    if (isLast) {
      return assignTokenValue(current, token, value);
    }

    current = ensureTokenContainer(current, token, tokens[index + 1]);
    if (!current) return false;
  }

  return false;
}

function deletePathValue(target, path) {
  const tokens = parsePath(path);
  if (!tokens?.length) return false;

  let current = target;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const isLast = index === tokens.length - 1;
    if (isLast) {
      return deleteTokenValue(current, token);
    }

    const next = tokenValue(current, token);
    if (!next.ok) return false;
    current = next.value;
  }

  return false;
}

function parsePath(path) {
  const tokens = [];
  const segments = String(path || '').split('.').filter(Boolean);
  if (!segments.length) return null;

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    if (segment === 'add') {
      if (!tokens.length || segmentIndex !== segments.length - 1) return null;
      tokens.push({ type: 'arrayAdd' });
      continue;
    }

    let rest = segment;
    const keyMatch = rest.match(/^([^\[\]]+)/);
    if (!keyMatch) return null;

    tokens.push({ type: 'property', key: keyMatch[1] });
    rest = rest.slice(keyMatch[1].length);

    while (rest) {
      const addMatch = rest.match(/^\[\]\{add\}/);
      if (addMatch) {
        tokens.push({ type: 'arrayAdd' });
        rest = rest.slice(addMatch[0].length);
        continue;
      }

      const setMatch = rest.match(/^\[\]\{set(\d+)\}/);
      if (setMatch) {
        tokens.push({ type: 'arrayIndex', index: Number(setMatch[1]) });
        rest = rest.slice(setMatch[0].length);
        continue;
      }

      const indexMatch = rest.match(/^\[(\d+)\]/);
      if (indexMatch) {
        tokens.push({ type: 'arrayIndex', index: Number(indexMatch[1]) });
        rest = rest.slice(indexMatch[0].length);
        continue;
      }

      return null;
    }
  }

  return tokens;
}

function ensureTokenContainer(current, token, nextToken) {
  if (token.type === 'property') {
    if (!isContainer(current)) return null;
    const key = propertyKey(token.key, current);
    if (!matchesNextContainer(current[key], nextToken)) {
      current[key] = containerForNext(nextToken);
    }
    return current[key];
  }

  if (!Array.isArray(current)) return null;

  if (token.type === 'arrayAdd') {
    const next = containerForNext(nextToken);
    current.push(next);
    return next;
  }

  if (token.type === 'arrayIndex') {
    if (!matchesNextContainer(current[token.index], nextToken)) {
      current[token.index] = containerForNext(nextToken);
    }
    return current[token.index];
  }

  return null;
}

function assignTokenValue(current, token, value) {
  if (token.type === 'property') {
    if (!isContainer(current)) return false;
    current[propertyKey(token.key, current)] = value;
    return true;
  }

  if (!Array.isArray(current)) return false;

  if (token.type === 'arrayAdd') {
    current.push(value);
    return true;
  }

  if (token.type === 'arrayIndex') {
    current[token.index] = value;
    return true;
  }

  return false;
}

function deleteTokenValue(current, token) {
  if (token.type === 'property') {
    if (!isContainer(current)) return false;
    const key = propertyKey(token.key, current);
    if (!Object.prototype.hasOwnProperty.call(current, key)) return false;
    delete current[key];
    return true;
  }

  if (!Array.isArray(current)) return false;

  if (token.type === 'arrayIndex') {
    if (token.index < 0 || token.index >= current.length) return false;
    current.splice(token.index, 1);
    return true;
  }

  return false;
}

function tokenValue(current, token) {
  if (token.type === 'property') {
    if (!isContainer(current)) return { ok: false, value: undefined };
    const key = propertyKey(token.key, current);
    if (!Object.prototype.hasOwnProperty.call(current, key)) return { ok: false, value: undefined };
    return { ok: true, value: current[key] };
  }

  if (!Array.isArray(current)) return { ok: false, value: undefined };

  if (token.type === 'arrayIndex') {
    if (token.index < 0 || token.index >= current.length) return { ok: false, value: undefined };
    return { ok: true, value: current[token.index] };
  }

  return { ok: false, value: undefined };
}

function matchesNextContainer(value, nextToken) {
  if (isArrayToken(nextToken)) return Array.isArray(value);
  return isContainer(value);
}

function containerForNext(nextToken) {
  return isArrayToken(nextToken) ? [] : {};
}

function isArrayToken(token) {
  return ['arrayAdd', 'arrayIndex'].includes(token?.type);
}

function isContainer(value) {
  return Boolean(value) && typeof value === 'object';
}

function propertyKey(key, container) {
  return Array.isArray(container) && /^\d+$/.test(key) ? Number(key) : key;
}

function defaultPort(protocol) {
  return protocol === 'https:' || protocol === 'https' ? 443 : 80;
}

function methodHasRequestBody(method) {
  return !['GET', 'HEAD'].includes(String(method || '').toUpperCase());
}

function remoteRuleBodyHashKey(rule) {
  if (rule.requestBodyHash) return rule.requestBodyHash;
  return '';
}

function shouldMatchRequestBody(rule, method) {
  return methodHasRequestBody(method) &&
    rule.requestBodyMode !== 'ignore' &&
    Boolean(remoteRuleBodyHashKey(rule));
}
