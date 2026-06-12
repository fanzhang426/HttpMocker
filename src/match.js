import crypto from 'node:crypto';
import path from 'node:path';
import mime from 'mime-types';
import { config } from './config.js';

const editableTypes = [
  'application/json',
  'application/javascript',
  'application/xml',
  'application/xhtml+xml',
  'application/x-www-form-urlencoded',
  'text/'
];

export function buildCapture({ request, response, bodyBuffer, options = {} }) {
  const parsed = new URL(request.url);
  const contentType = headerValue(response.headers, 'content-type') || '';
  const contentLength = Number(headerValue(response.headers, 'content-length') || bodyBuffer.length || 0);
  const requestBodyBuffer = request.bodyBuffer || Buffer.alloc(0);
  const requestContentType = headerValue(request.headers, 'content-type') || '';
  const bodySize = Number(response.bodySize ?? bodyBuffer.length);
  const saveResponseBody = options.saveResponseBody !== false;
  const saveRequestBody = options.saveRequestBody !== false;
  const responseBodyPolicy = saveResponseBody
    ? captureBodyPolicy({
      contentType,
      contentLength,
      bodySize
    })
    : { saveBody: false, reason: options.responseBodySkippedReason || 'not-captured' };
  const requestBodyPolicy = saveRequestBody
    ? captureRequestBodyPolicy({
      contentType: requestContentType,
      bodySize: requestBodyBuffer.length
    })
    : { saveBody: false, reason: options.requestBodySkippedReason || 'not-captured' };

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    method: request.method,
    url: request.url,
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : defaultPort(parsed.protocol),
    path: parsed.pathname,
    query: parsed.search ? parsed.search.slice(1) : '',
    requestStartedAt: request.requestStartedAt || '',
    requestEndedAt: request.requestEndedAt || '',
    responseStartedAt: response.responseStartedAt || '',
    responseEndedAt: response.responseEndedAt || '',
    durationMs: numberOrNull(response.durationMs),
    requestMs: numberOrNull(response.requestMs),
    responseMs: numberOrNull(response.responseMs),
    latencyMs: numberOrNull(response.latencyMs),
    clientAddress: request.clientAddress || '',
    remoteAddress: response.remoteAddress || request.remoteAddress || '',
    httpVersion: response.httpVersion || '',
    keptAlive: typeof response.keptAlive === 'boolean' ? response.keptAlive : null,
    tlsProtocol: response.tlsProtocol || '',
    tlsCipher: response.tlsCipher || '',
    requestHeaderSize: numberOrNull(request.requestHeaderSize),
    requestQuerySize: numberOrNull(request.requestQuerySize),
    requestCookieSize: numberOrNull(request.requestCookieSize),
    responseHeaderSize: numberOrNull(response.responseHeaderSize),
    responseCookieSize: numberOrNull(response.responseCookieSize),
    statusCode: response.statusCode,
    statusMessage: response.statusMessage || '',
    requestHeaders: normalizeHeaders(request.headers || {}),
    requestContentType,
    requestBodySize: requestBodyBuffer.length,
    requestBodyHash: hashRequestBody(requestBodyBuffer, requestContentType),
    requestBodyBase64: requestBodyPolicy.saveBody ? requestBodyBuffer.toString('base64') : '',
    requestBodyEditable: requestBodyPolicy.saveBody && isEditable(requestContentType),
    requestBodyTruncated: Boolean(request.bodyTruncated) || !requestBodyPolicy.saveBody,
    requestBodySkippedReason: requestBodyPolicy.reason,
    responseHeaders: normalizeHeaders(response.headers || {}),
    contentType,
    bodySize,
    contentLength,
    bodyBase64: responseBodyPolicy.saveBody ? bodyBuffer.toString('base64') : '',
    editable: responseBodyPolicy.saveBody && isEditable(contentType),
    bodySkippedReason: responseBodyPolicy.reason,
    proxyError: response.proxyError || null,
    contentCaptured: saveResponseBody && responseBodyPolicy.saveBody,
    requestContentCaptured: saveRequestBody && requestBodyPolicy.saveBody,
    summaryOnly: options.summaryOnly === true
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createRuleFromCapture(capture, options = {}) {
  const extension = extensionForCapture(capture);
  const filePath = buildLocalFilePath(capture, extension);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
    method: capture.method,
    protocol: capture.protocol,
    host: capture.host,
    port: capture.port,
    path: capture.path,
    queryMode: options.queryMode || 'exact',
    query: capture.query || '',
    requestBodyMode: methodHasRequestBody(capture.method) ? 'exact' : 'ignore',
    requestHeaders: normalizeHeaders(capture.requestHeaders || {}),
    requestContentType: capture.requestContentType || '',
    requestBodySize: Number(capture.requestBodySize || 0),
    requestBodyHash: capture.requestBodyHash || '',
    requestBodyBase64: capture.requestBodyBase64 || '',
    requestBodyEditable: Boolean(capture.requestBodyEditable),
    requestBodyTruncated: Boolean(capture.requestBodyTruncated),
    statusCode: capture.statusCode || 200,
    statusMessage: capture.statusMessage || '',
    responseHeaders: filterResponseHeaders(capture.responseHeaders || {}),
    filePath,
    contentType: capture.contentType || mime.lookup(filePath) || 'application/octet-stream'
  };
}

export function findRule(rules, request) {
  const parsed = new URL(request.url);
  const protocol = parsed.protocol.replace(':', '');
  const port = parsed.port ? Number(parsed.port) : defaultPort(parsed.protocol);
  const method = request.method.toUpperCase();
  const query = parsed.search ? parsed.search.slice(1) : '';

  return rules.find((rule) => {
    if (!rule.enabled) return false;
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

export function bodyForEditor(capture) {
  if (capture.bodySkippedReason) {
    return {
      editable: false,
      body: '',
      note: skippedBodyNote(capture.bodySkippedReason)
    };
  }
  return bodyBufferForEditor({
    bodyBase64: capture.bodyBase64,
    contentType: capture.contentType,
    editable: capture.editable,
    binaryNote: 'Binary response saved, but inline editing is disabled.'
  });
}

export function requestBodyForEditor(item) {
  if (item.requestBodySkippedReason) {
    return {
      editable: false,
      body: '',
      note: skippedBodyNote(item.requestBodySkippedReason)
    };
  }
  if (item.requestBodyTruncated) {
    return {
      editable: false,
      body: '',
      note: 'Request body was too large and was not saved completely.'
    };
  }

  const hasSavedBody = Boolean(item.requestBodyBase64) || Number(item.requestBodySize || 0) > 0;
  const canEditEmptyBody = !hasSavedBody && String(item.method || '').toUpperCase() !== 'GET';

  return bodyBufferForEditor({
    bodyBase64: item.requestBodyBase64,
    contentType: item.requestContentType,
    editable: Boolean(item.requestBodyEditable) || canEditEmptyBody,
    emptyText: '',
    binaryNote: 'Binary request body saved, but inline preview is disabled.'
  });
}

export function requestBodyFieldsFromText(body, contentType) {
  const buffer = Buffer.from(String(body ?? ''), 'utf8');
  return {
    requestContentType: contentType || '',
    requestBodySize: buffer.length,
    requestBodyHash: hashRequestBody(buffer, contentType),
    requestBodyBase64: buffer.toString('base64'),
    requestBodyEditable: true,
    requestBodyTruncated: false
  };
}

export function bodyHash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

export function hashRequestBody(buffer, contentType = '') {
  if ((contentType || '').toLowerCase().includes('application/json')) {
    try {
      return bodyHash(Buffer.from(JSON.stringify(JSON.parse(buffer.toString('utf8'))), 'utf8'));
    } catch {
      return bodyHash(buffer);
    }
  }

  return bodyHash(buffer);
}

export function queryIncludesRequired(actualQuery = '', requiredQuery = '') {
  const required = paramsToEntries(requiredQuery);
  if (!required.length) return true;
  const actual = paramsToEntries(actualQuery);
  return entryMultisetIncludes(actual, required);
}

export function requestBodyIncludesRequired(rule, request, method = request?.method) {
  if (!shouldMatchRuleRequestBody(rule, method)) return true;

  if (!ruleHasStructuredRequestBody(rule)) {
    return ruleBodyHashKey(rule) === (request?.requestBodyHash || bodyHash(Buffer.alloc(0)));
  }

  const requiredBuffer = ruleRequestBodyBuffer(rule);
  const actualBuffer = requestRequestBodyBuffer(request);
  if (!actualBuffer) {
    return ruleBodyHashKey(rule) === (request?.requestBodyHash || bodyHash(Buffer.alloc(0)));
  }

  const contentType = request?.requestContentType ||
    headerValue(request?.headers || {}, 'content-type') ||
    rule?.requestContentType ||
    '';
  const requiredText = requiredBuffer.toString('utf8');
  const actualText = actualBuffer.toString('utf8');
  const normalizedContentType = String(contentType || '').toLowerCase();

  if (normalizedContentType.includes('application/x-www-form-urlencoded')) {
    return queryIncludesRequired(actualText, requiredText);
  }

  const requiredJson = parseJson(requiredText);
  const actualJson = parseJson(actualText);
  if (requiredJson.ok && actualJson.ok) {
    return jsonIncludesRequired(actualJson.value, requiredJson.value);
  }

  const actualHash = request?.requestBodyHash || hashRequestBody(actualBuffer, contentType);
  return ruleBodyHashKey(rule) === actualHash;
}

export function ruleTargetKey(rule) {
  return [
    rule.method,
    rule.protocol,
    rule.host,
    Number(rule.port),
    rule.path,
    rule.queryMode === 'ignore' ? '<ignore-query>' : (rule.query || ''),
    shouldMatchRuleRequestBody(rule, rule.method) ? ruleBodyHashKey(rule) : '<ignore-body>'
  ].join('\u0000');
}

export function ruleLocalFilePath(rule) {
  const extension = path.extname(rule.filePath || '') || extensionForCapture(rule);
  return buildLocalFilePath(rule, extension);
}

function bodyBufferForEditor({ bodyBase64, contentType, editable, emptyText = '(empty response body)', binaryNote }) {
  const buffer = Buffer.from(bodyBase64 || '', 'base64');
  if (!editable) {
    return {
      editable: false,
      body: '',
      note: buffer.length ? binaryNote : ''
    };
  }

  const text = buffer.toString('utf8');
  if ((contentType || '').includes('application/json')) {
    try {
      return { editable: true, body: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
      return { editable: true, body: text };
    }
  }

  return { editable: true, body: text || emptyText };
}

export function filterResponseHeaders(headers) {
  const blocked = new Set([
    'connection',
    'content-encoding',
    'content-length',
    'date',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
  ]);

  const result = {};
  for (const [key, value] of Object.entries(normalizeHeaders(headers))) {
    if (!blocked.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}

export function normalizeHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
}

export function stripVolatileCapture(capture) {
  const { bodyBase64, requestBodyBase64, history, ...summary } = capture;
  if (Array.isArray(history) && history.length) {
    summary.history = history.map(stripVolatileCapture);
  }
  return summary;
}

export function captureRequestKey(capture) {
  return captureRequestKeyWithOptions(capture);
}

export function captureTargetKey(capture) {
  return [
    capture.method,
    capture.protocol,
    capture.host,
    Number(capture.port),
    capture.path
  ].join('\u0000');
}

export function captureRequestKeyWithOptions(capture, options = {}) {
  const includeQuery = options.query !== false;
  const includeBody = options.body !== false;
  return [
    capture.method,
    capture.protocol,
    capture.host,
    Number(capture.port),
    capture.path,
    includeQuery ? (capture.query || '') : '<ignore-query>',
    includeBody ? requestBodyHashKey(capture) : '<ignore-body>'
  ].join('\u0000');
}

function requestBodyHashKey(capture) {
  if (capture.requestBodyHash) return capture.requestBodyHash;
  if (!capture.requestBodyBase64 && !Number(capture.requestBodySize || 0)) {
    return bodyHash(Buffer.alloc(0));
  }
  return '';
}

export function matchesCaptureKeyword(capture, keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    capture.method,
    capture.statusCode,
    capture.url,
    capture.host,
    capture.path,
    capture.query,
    capture.contentType
  ].join(' ').toLowerCase();

  return haystack.includes(query);
}

function buildLocalFilePath(capture, extension) {
  const slug = safeSegment(capture.path === '/' ? 'root' : capture.path);
  const queryHash = capture.query ? `-${crypto.createHash('sha1').update(capture.query).digest('hex').slice(0, 8)}` : '';
  const requestBodyHash = methodHasRequestBody(capture.method) && capture.requestBodyHash
    ? `-${capture.requestBodyHash.slice(0, 8)}`
    : '';
  return path.posix.join(
    capture.host,
    capture.method.toUpperCase(),
    `${slug}${queryHash}${requestBodyHash}${extension}`
  );
}

function extensionForCapture(capture) {
  const contentType = (capture.contentType || '').split(';')[0].trim();
  if (contentType === 'application/json') return '.json';
  if (contentType === 'text/html') return '.html';
  if (contentType === 'text/css') return '.css';
  if (contentType === 'application/javascript' || contentType === 'text/javascript') return '.js';
  if (contentType.startsWith('text/')) return '.txt';

  const extension = mime.extension(contentType);
  return extension ? `.${extension}` : '.bin';
}

function isEditable(contentType) {
  const normalized = (contentType || '').split(';')[0].trim().toLowerCase();
  return editableTypes.some((type) => normalized === type || normalized.startsWith(type));
}

function captureBodyPolicy({ contentType, contentLength, bodySize }) {
  const normalized = (contentType || '').split(';')[0].trim().toLowerCase();
  if (isStreamingContentType(normalized)) {
    return { saveBody: false, reason: 'streaming' };
  }
  if (isLargeBinaryContentType(normalized)) {
    return { saveBody: false, reason: 'binary-media' };
  }
  const size = Number(contentLength || bodySize || 0);
  if (size > config.maxCaptureBodyBytes) {
    return { saveBody: false, reason: 'large-body' };
  }
  return { saveBody: true, reason: '' };
}

function captureRequestBodyPolicy({ contentType, bodySize }) {
  const normalized = (contentType || '').split(';')[0].trim().toLowerCase();
  if (isLargeBinaryContentType(normalized)) {
    return { saveBody: false, reason: 'binary-media' };
  }
  if (Number(bodySize || 0) > config.maxCaptureBodyBytes) {
    return { saveBody: false, reason: 'large-body' };
  }
  return { saveBody: true, reason: '' };
}

function isLargeBinaryContentType(contentType) {
  return contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/') ||
    contentType === 'application/octet-stream' ||
    contentType === 'application/pdf' ||
    contentType === 'application/zip' ||
    contentType === 'application/x-zip-compressed';
}

function isStreamingContentType(contentType) {
  return contentType === 'text/event-stream' ||
    contentType === 'application/grpc' ||
    contentType === 'application/grpc-web' ||
    contentType === 'application/x-ndjson';
}

function skippedBodyNote(reason) {
  if (reason === 'not-captured') return '当前域名未打开为工程，已只保存请求摘要，不抓取正文。';
  if (reason === 'binary-media') return '响应体是图片、视频、音频或二进制资源，已只保存摘要，不保存正文。';
  if (reason === 'large-body') return '响应体较大，已只保存摘要，不保存正文。';
  if (reason === 'streaming') return '响应体是流式内容，已只保存摘要，不保存正文。';
  return '正文未保存。';
}

function safeSegment(value) {
  return value
    .replace(/^\/+/, '')
    .replace(/\/+$/g, '')
    .replace(/[^a-zA-Z0-9._/-]/g, '_')
    .replace(/\/+/g, '__')
    .slice(0, 180) || 'root';
}

function headerValue(headers, name) {
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === wanted);
  if (!entry) return undefined;
  return Array.isArray(entry[1]) ? entry[1].join(', ') : String(entry[1]);
}

function defaultPort(protocol) {
  return protocol === 'https:' || protocol === 'https' ? 443 : 80;
}

function methodHasRequestBody(method) {
  return !['GET', 'HEAD'].includes(String(method || '').toUpperCase());
}

function ruleBodyHashKey(rule) {
  if (rule.requestBodyHash) return rule.requestBodyHash;
  if (!rule.requestBodyBase64 && !Number(rule.requestBodySize || 0)) {
    return bodyHash(Buffer.alloc(0));
  }
  return '';
}

function shouldMatchRuleRequestBody(rule, method) {
  return methodHasRequestBody(method) && rule.requestBodyMode !== 'ignore';
}

function paramsToEntries(query) {
  const params = new URLSearchParams(String(query || '').replace(/^\?/, ''));
  return [...params.entries()];
}

function entryMultisetIncludes(actualEntries, requiredEntries) {
  const counts = new Map();
  for (const [key, value] of actualEntries) {
    const entryKey = `${key}\u0000${value}`;
    counts.set(entryKey, (counts.get(entryKey) || 0) + 1);
  }

  for (const [key, value] of requiredEntries) {
    const entryKey = `${key}\u0000${value}`;
    const count = counts.get(entryKey) || 0;
    if (count <= 0) return false;
    counts.set(entryKey, count - 1);
  }
  return true;
}

function requestRequestBodyBuffer(request) {
  if (!request) return null;
  if (Buffer.isBuffer(request.requestBodyBuffer)) return request.requestBodyBuffer;
  if (Buffer.isBuffer(request.bodyBuffer)) return request.bodyBuffer;
  return null;
}

function ruleRequestBodyBuffer(rule) {
  if (rule?.requestBodyBase64) return Buffer.from(rule.requestBodyBase64, 'base64');
  if (!Number(rule?.requestBodySize || 0)) return Buffer.alloc(0);
  return Buffer.alloc(0);
}

function ruleHasStructuredRequestBody(rule) {
  return Boolean(rule?.requestBodyBase64) || !Number(rule?.requestBodySize || 0);
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(String(text || '')) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function jsonIncludesRequired(actual, required) {
  if (Array.isArray(required)) {
    if (!Array.isArray(actual)) return false;
    const usedIndexes = new Set();
    return required.every((requiredItem) => {
      const actualIndex = actual.findIndex((actualItem, index) => (
        !usedIndexes.has(index) && jsonIncludesRequired(actualItem, requiredItem)
      ));
      if (actualIndex < 0) return false;
      usedIndexes.add(actualIndex);
      return true;
    });
  }

  if (required && typeof required === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(required).every(([key, value]) => (
      Object.prototype.hasOwnProperty.call(actual, key) &&
      jsonIncludesRequired(actual[key], value)
    ));
  }

  return Object.is(actual, required);
}
