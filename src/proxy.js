import { Proxy } from 'http-mitm-proxy';
import net from 'node:net';
import zlib from 'node:zlib';
import { config } from './config.js';
import {
  readBufferFile,
  readProxyConfig,
  readSettings
} from './fs-store.js';
import { addCapture } from './capture-store.js';
import { enqueueCodexNote } from './codex-notes.js';
import {
  bodyHash,
  buildCapture,
  compareRuleSpecificity,
  filterResponseHeaders,
  findRule,
  hashRequestBody
} from './match.js';
import {
  applyBodyChanges,
  applyHeaderChanges,
  applyQueryChanges,
  findRemoteRules,
  normalizeRemoteSteps,
  orderRemoteRules,
  parseRemoteScript,
  remoteStepCommand,
  splitRemoteCommands
} from './remote-rules.js';
import {
  applyPythonRulesForStage,
  hasPythonRemoteRules,
  isPythonRemoteRule
} from './python-rules.js';
import { getLanUrls } from './urls.js';
import { emitCapturesChanged } from './events.js';

const connectivityProbeHosts = [
  'connectivitycheck.gstatic.com',
  'connectivitycheck.android.com',
  'clients3.google.com',
  'clients4.google.com',
  'www.gstatic.com',
  'www.google.com',
  'www.google.cn',
  'www.google.com.hk',
  'connect.rom.miui.com',
  'connectivitycheck.platform.miui.com',
  'connectivitycheck.miui.com',
  'connectivitycheck.market.xiaomi.com',
  'connectivitycheck.platform.hicloud.com',
  'wifi.vivo.com.cn',
  'wifi.oppomobile.com',
  'conn1.oppomobile.com',
  'conn2.oppomobile.com',
  'www.msftconnecttest.com',
  'ipv6.msftconnecttest.com',
  'captive.apple.com'
];

const connectivityProbeHostSuffixes = [
  '.gstatic.com',
  '.google.com',
  '.google.cn'
];

const connectivityProbePathFragments = [
  'generate_204',
  'gen_204',
  'hotspot-detect',
  'connecttest.txt',
  'ncsi.txt'
];

export function startProxy() {
  const proxy = new Proxy();

  proxy.onError((ctx, error) => {
    if (ctx?.localProxy?.localHit && isExpectedLocalAbort(error)) {
      return;
    }
    const url = ctx?.clientToProxyRequest?.url || 'unknown URL';
    console.error(`Proxy error for ${url}:`, error.message);
    recordProxyErrorCapture(ctx, error).catch((recordError) => {
      console.error('Failed to record proxy error capture:', recordError.message);
    });
  });

  proxy.onConnect(async (req, socket, head, callback) => {
    try {
      if (isConnectivityProbeConnectTarget(req.url)) {
        tunnelConnect(req, socket, head);
        return;
      }
      const settings = await readSettings();
      if (settings.recordingEnabled === false) {
        tunnelConnect(req, socket, head);
        return;
      }
      const connectHost = hostFromConnectTarget(req.url);
      if (shouldCaptureHostContent(settings, connectHost)) {
        callback();
        return;
      }
      tunnelConnect(req, socket, head);
    } catch (error) {
      callback(error);
    }
  });

  proxy.onRequest(async (ctx, callback) => {
    try {
      const request = buildRequestSummary(ctx);
      request.requestStartedAt = new Date().toISOString();
      request.clientAddress = clientAddressForContext(ctx);
      request.requestHeaderSize = approximateHeaderBytes(ctx.clientToProxyRequest.method, ctx.clientToProxyRequest.url, ctx.clientToProxyRequest.httpVersion, ctx.clientToProxyRequest.headers);
      request.requestQuerySize = queryBytesForUrl(request.url);
      request.requestCookieSize = headerByteLength(ctx.clientToProxyRequest.headers?.cookie || '');
      if (isConnectivityProbeRequest(request)) {
        sendConnectivityProbeResponse(ctx, request);
        return;
      }
      if (isLongLivedRequest(request)) {
        ctx.localProxyPassthrough = true;
        callback();
        return;
      }
      const state = await readProxyConfig();
      if (state.settings.recordingEnabled === false) {
        ctx.localProxyPassthrough = true;
        callback();
        return;
      }
      if (!shouldCaptureRequestContent(state.settings, request)) {
        ctx.localProxyPassthrough = true;
        callback();
        return;
      }

      const shouldDelayUpstream = methodHasRequestBody(request.method);
      const remoteRules = shouldDelayUpstream
        ? []
        : findRemoteRules(orderRemoteRules(state.remoteRules || []), {
          ...request,
          requestBodyHash: bodyHash(Buffer.alloc(0))
        }, { requireBodyMatch: true });
      const remoteCommands = splitRemoteCommands(remoteRules);
      const effectiveRequest = {
        ...request,
        headers: { ...(request.headers || {}) }
      };
      const remoteRuleIds = remoteRules.map((rule) => rule.id).filter(Boolean);

      if (!shouldDelayUpstream) {
        const rule = findRule(state.rules, {
          ...request,
          requestBodyHash: bodyHash(Buffer.alloc(0))
        });

        if (rule && !remoteRulesOverrideLocalRule(rule, remoteRules)) {
          ctx.localProxy = {};
          await sendLocalResponse(ctx, rule, request);
          return;
        }
      }

      await applyRemoteRulesInOrder({
        rules: remoteRules,
        stage: 'request_head',
        request: effectiveRequest
      });
      ctx.proxyToServerRequestOptions.path = requestPath(effectiveRequest.url);
      syncProxyRequestOptionHeaders(ctx.proxyToServerRequestOptions.headers, effectiveRequest.headers);

      ctx.localProxy = {
        request: effectiveRequest,
        originalRequest: request,
        remoteRules,
        remoteCommands,
        remoteHit: remoteRules.length > 0,
        remoteRuleIds,
        originalRequestHeaders: { ...(request.headers || {}) },
        originalRequestUrl: request.url,
        requestStartedAt: request.requestStartedAt,
        requestChunks: [],
        delayUpstream: shouldDelayUpstream,
        chunks: []
      };
      ctx.use(Proxy.gunzip);
      callback();
    } catch (error) {
      callback(error);
    }
  });

  proxy.onRequestData((ctx, chunk, callback) => {
    if (ctx.localProxy?.requestChunks) {
      const total = ctx.localProxy.requestChunks.reduce((sum, item) => sum + item.length, 0) + chunk.length;
      if (total <= config.maxBodyBytes) {
        ctx.localProxy.requestChunks.push(Buffer.from(chunk));
        if (ctx.localProxy.delayUpstream) {
          callback(null, null);
          return;
        }
      } else {
        ctx.localProxy.requestTruncated = true;
        if (ctx.localProxy.delayUpstream) {
          flushBufferedRequestToUpstream(ctx, chunk);
          ctx.localProxy.delayUpstream = false;
          callback(null, null);
          return;
        }
      }
    }
    callback(null, chunk);
  });

  proxy.onRequestEnd(async (ctx, callback) => {
    try {
      if (!ctx.localProxy?.delayUpstream) {
        callback();
        return;
      }

      ignoreFinalEndChunk(ctx);
      const rawRequestBodyBuffer = Buffer.concat(ctx.localProxy.requestChunks || []);
      const requestBodyBuffer = decodeRequestBody(
        rawRequestBodyBuffer,
        ctx.localProxy.request.headers
      );
      ctx.localProxy.request.requestEndedAt = new Date().toISOString();
      const state = await readProxyConfig();
      const requestBodyHash = hashRequestBody(
        requestBodyBuffer,
        headerValue(ctx.localProxy.request.headers, 'content-type')
      );
      const rule = findRule(state.rules, {
        ...(ctx.localProxy.originalRequest || ctx.localProxy.request),
        requestBodyHash,
        bodyBuffer: requestBodyBuffer,
        requestContentType: headerValue(ctx.localProxy.request.headers, 'content-type')
      });

      if (rule) {
        const competingRemoteRules = findRemoteRules(orderRemoteRules(state.remoteRules || []), {
          ...(ctx.localProxy.originalRequest || ctx.localProxy.request),
          requestBodyHash,
          bodyBuffer: requestBodyBuffer,
          requestContentType: headerValue(ctx.localProxy.request.headers, 'content-type')
        }, { requireBodyMatch: true });
        if (remoteRulesOverrideLocalRule(rule, competingRemoteRules)) {
          ctx.localProxy.remoteRules = competingRemoteRules;
          ctx.localProxy.remoteCommands = splitRemoteCommands(competingRemoteRules);
          ctx.localProxy.remoteHit = competingRemoteRules.length > 0;
          ctx.localProxy.remoteRuleIds = competingRemoteRules.map((item) => item.id).filter(Boolean);
        } else {
          ctx.localProxy.localHit = true;
          const requestForCapture = {
            ...(ctx.localProxy.originalRequest || ctx.localProxy.request),
            bodyBuffer: requestBodyBuffer,
            bodyTruncated: Boolean(ctx.localProxy.requestTruncated)
          };
          await sendLocalResponse(ctx, rule, requestForCapture);
          ctx.proxyToServerRequest.removeAllListeners('error');
          ctx.proxyToServerRequest.on('error', () => {});
          ctx.proxyToServerRequest.end = () => {};
          ctx.proxyToServerRequest.destroy();
          callback();
          return;
        }
      }

      const remoteRules = ctx.localProxy.remoteRules || findRemoteRules(orderRemoteRules(state.remoteRules || []), {
        ...(ctx.localProxy.originalRequest || ctx.localProxy.request),
        requestBodyHash,
        bodyBuffer: requestBodyBuffer,
        requestContentType: headerValue(ctx.localProxy.request.headers, 'content-type')
      }, { requireBodyMatch: true });
      const remoteCommands = ctx.localProxy.remoteCommands || splitRemoteCommands(remoteRules);
      const originalRequestForDiff = {
        url: ctx.localProxy.request.url,
        headers: { ...(ctx.localProxy.request.headers || {}) },
        bodyBuffer: requestBodyBuffer
      };
      const originalRequestUrl = ctx.localProxy.request.url;
      const originalRequestHeaders = { ...(ctx.localProxy.request.headers || {}) };
      ctx.localProxy.remoteCommands = remoteCommands;
      ctx.localProxy.remoteRules = remoteRules;
      ctx.localProxy.remoteHit = remoteRules.length > 0;
      ctx.localProxy.remoteRuleIds = remoteRules.map((rule) => rule.id).filter(Boolean);
      ctx.localProxy.originalRequestUrl = originalRequestUrl;
      ctx.localProxy.originalRequestHeaders = originalRequestHeaders;
      ctx.localProxy.originalRequestBodyBuffer = requestBodyBuffer;

      let effectiveRequestBodyBuffer = requestBodyBuffer;
      const orderedRequestResult = await applyRemoteRulesInOrder({
        rules: remoteRules,
        stage: 'request_head',
        request: ctx.localProxy.request,
        requestBodyBuffer: effectiveRequestBodyBuffer
      });
      effectiveRequestBodyBuffer = orderedRequestResult.requestBodyBuffer;
      normalizeUnsafeBodyHeaders(ctx.localProxy.request.headers, effectiveRequestBodyBuffer, orderedRequestResult.bodyHeaderTouched);
      let requestBodyChanged = !buffersEqual(effectiveRequestBodyBuffer, requestBodyBuffer);
      ctx.proxyToServerRequestOptions.path = requestPath(ctx.localProxy.request.url);
      ctx.proxyToServerRequest.path = requestPath(ctx.localProxy.request.url);
      syncProxyRequestOptionHeaders(ctx.proxyToServerRequestOptions.headers, ctx.localProxy.request.headers);
      syncProxyRequestHeaders(ctx.proxyToServerRequest, ctx.localProxy.request.headers);

      if (!ctx.localProxy.requestTruncated) {
        const orderedBodyResult = await applyRemoteRulesInOrder({
          rules: remoteRules,
          stage: 'request_body',
          request: ctx.localProxy.request,
          requestBodyBuffer: effectiveRequestBodyBuffer
        });
        requestBodyChanged = requestBodyChanged || !buffersEqual(effectiveRequestBodyBuffer, orderedBodyResult.requestBodyBuffer);
        effectiveRequestBodyBuffer = orderedBodyResult.requestBodyBuffer;
        normalizeUnsafeBodyHeaders(ctx.localProxy.request.headers, effectiveRequestBodyBuffer, orderedBodyResult.bodyHeaderTouched);
        ctx.proxyToServerRequestOptions.path = requestPath(ctx.localProxy.request.url);
        ctx.proxyToServerRequest.path = requestPath(ctx.localProxy.request.url);
        syncProxyRequestOptionHeaders(ctx.proxyToServerRequestOptions.headers, ctx.localProxy.request.headers);
        syncProxyRequestHeaders(ctx.proxyToServerRequest, ctx.localProxy.request.headers);
      }

      if (requestBodyChanged) {
        ctx.localProxy.effectiveRequestBodyBuffer = effectiveRequestBodyBuffer;
        syncBodyHeaders(ctx.localProxy.request.headers, effectiveRequestBodyBuffer);
        syncProxyRequestOptionHeaders(ctx.proxyToServerRequestOptions.headers, ctx.localProxy.request.headers);
        syncProxyRequestHeaders(ctx.proxyToServerRequest, ctx.localProxy.request.headers);
        flushRequestBodyToUpstream(ctx, effectiveRequestBodyBuffer);
      } else {
        flushBufferedRequestToUpstream(ctx);
      }
      ctx.localProxy.originalRequestUrl = originalRequestForDiff.url;
      ctx.localProxy.originalRequestHeaders = originalRequestForDiff.headers;
      ctx.localProxy.originalRequestBodyBuffer = originalRequestForDiff.bodyBuffer;
      ctx.localProxy.delayUpstream = false;
      callback();
    } catch (error) {
      callback(error);
    }
  });

  proxy.onResponse(async (ctx, callback) => {
    try {
      if (ctx.localProxySummaryOnly) {
        callback();
        return;
      }
      if (ctx.localProxyPassthrough || !ctx.localProxy || ctx.localProxy.localHit) {
        callback();
        return;
      }

      ctx.localProxy.originalResponseHeaders = { ...(ctx.serverToProxyResponse.headers || {}) };
      ctx.localProxy.responseStartedAt = new Date().toISOString();
      const remoteRules = ctx.localProxy.remoteRules || [];
      const orderedResponseHeadResult = await applyRemoteRulesInOrder({
        rules: remoteRules,
        stage: 'response_head',
        request: ctx.localProxy.request,
        requestBodyBuffer: ctx.localProxy.effectiveRequestBodyBuffer || ctx.localProxy.originalRequestBodyBuffer,
        response: ctx.serverToProxyResponse
      });
      normalizeUnsafeBodyHeaders(ctx.serverToProxyResponse.headers, null, orderedResponseHeadResult.bodyHeaderTouched);
      ctx.localProxy.skipResponseBodyCapture = shouldSkipResponseBodyCapture(ctx.serverToProxyResponse.headers);
      ctx.localProxy.responseBodyBytesSeen = 0;
      if (shouldBufferRemoteResponse(remoteRules, ctx.localProxy.remoteCommands)) {
        clearBodyTransformHeaders(ctx.serverToProxyResponse.headers);
        syncProxyResponseHeaders(ctx.proxyToClientResponse, ctx.serverToProxyResponse.headers);
      }
      ctx.localProxy.effectiveResponseHeaders = ctx.serverToProxyResponse.headers;

      callback();
    } catch (error) {
      callback(error);
    }
  });

  proxy.onResponseData((ctx, chunk, callback) => {
    if (ctx.localProxy?.chunks) {
      const shouldModifyResponse = shouldBufferRemoteResponse(ctx.localProxy.remoteRules || [], ctx.localProxy.remoteCommands);
      ctx.localProxy.responseBodyBytesSeen = Number(ctx.localProxy.responseBodyBytesSeen || 0) + chunk.length;
      if (ctx.localProxy.skipResponseBodyCapture && !shouldModifyResponse) {
        callback(null, chunk);
        return;
      }
      const total = ctx.localProxy.chunks.reduce((sum, item) => sum + item.length, 0) + chunk.length;
      if (total <= config.maxBodyBytes) {
        ctx.localProxy.chunks.push(Buffer.from(chunk));
        if (shouldModifyResponse && !ctx.localProxy.remoteResponseTooLarge) {
          callback(null, null);
          return;
        }
      } else {
        ctx.localProxy.truncated = true;
        if (shouldModifyResponse && !ctx.localProxy.remoteResponseTooLarge) {
          for (const buffered of ctx.localProxy.chunks) {
            ctx.proxyToClientResponse.write(buffered);
          }
          ctx.localProxy.chunks = [];
          ctx.localProxy.remoteResponseTooLarge = true;
        }
      }
    }
    callback(null, chunk);
  });

  proxy.onResponseEnd(async (ctx, callback) => {
    try {
      if (ctx.localProxySummaryOnly) {
        await recordHttpSummary(ctx);
        ctx.localProxySummaryOnly = false;
        callback();
        return;
      }
      if (ctx.localProxyPassthrough || !ctx.localProxy || ctx.localProxy.localHit || ctx.localProxy.truncated) {
        callback();
        return;
      }

      const originalResponseBodyBuffer = ctx.localProxy.skipResponseBodyCapture
        ? Buffer.alloc(0)
        : Buffer.concat(ctx.localProxy.chunks || []);
      let bodyBuffer = originalResponseBodyBuffer;
      const remoteRules = ctx.localProxy.remoteRules || [];
      let responseBodyChanged = false;
      if (!ctx.localProxy.remoteResponseTooLarge) {
        const orderedResponseResult = await applyRemoteRulesInOrder({
          rules: remoteRules,
          stage: 'response_body',
          request: ctx.localProxy.request,
          requestBodyBuffer: ctx.localProxy.effectiveRequestBodyBuffer || ctx.localProxy.originalRequestBodyBuffer,
          response: ctx.serverToProxyResponse,
          responseBodyBuffer: bodyBuffer
        });
        responseBodyChanged = !buffersEqual(bodyBuffer, orderedResponseResult.responseBodyBuffer);
        bodyBuffer = orderedResponseResult.responseBodyBuffer;
        normalizeUnsafeBodyHeaders(ctx.serverToProxyResponse.headers, bodyBuffer, orderedResponseResult.bodyHeaderTouched);
      }

      if (!ctx.localProxy.remoteResponseTooLarge && shouldBufferRemoteResponse(remoteRules, ctx.localProxy.remoteCommands)) {
        if (responseBodyChanged) {
          syncBodyHeaders(ctx.serverToProxyResponse.headers, bodyBuffer);
          syncProxyResponseHeaders(ctx.proxyToClientResponse, ctx.serverToProxyResponse.headers);
          ctx.localProxy.effectiveResponseHeaders = ctx.serverToProxyResponse.headers;
        }
        ctx.proxyToClientResponse.write(bodyBuffer);
      }

      const requestBodyBuffer = ctx.localProxy.effectiveRequestBodyBuffer || decodeRequestBody(
        Buffer.concat(ctx.localProxy.requestChunks || []),
        ctx.localProxy.request.headers
      );
      ctx.localProxy.request.requestEndedAt = ctx.localProxy.request.requestEndedAt || new Date().toISOString();
      const capture = buildCapture({
        request: {
          ...ctx.localProxy.request,
          bodyBuffer: requestBodyBuffer,
          bodyTruncated: Boolean(ctx.localProxy.requestTruncated)
        },
        response: {
          statusCode: ctx.serverToProxyResponse.statusCode,
          statusMessage: ctx.serverToProxyResponse.statusMessage,
          headers: ctx.localProxy.effectiveResponseHeaders || ctx.serverToProxyResponse.headers,
          ...captureResponseMetadata(ctx),
          bodySize: ctx.localProxy.skipResponseBodyCapture
            ? Number(ctx.localProxy.responseBodyBytesSeen || 0)
            : undefined
        },
        bodyBuffer
      });
      if (ctx.localProxy.remoteHit) {
        capture.mapType = 'remote';
        capture.mapRuleId = preferredRemoteMapRuleId(ctx.localProxy.remoteRules, ctx.localProxy.remoteRuleIds);
        capture.mapRuleIds = ctx.localProxy.remoteRuleIds || [];
        capture.remoteDiff = buildRemoteDiff(ctx, {
          effectiveRequestBodyBuffer: requestBodyBuffer,
          originalResponseBodyBuffer,
          effectiveResponseBodyBuffer: bodyBuffer
        });
      }
      await recordCapture(capture);
      ctx.localProxy.captureRecorded = true;

      callback();
    } catch (error) {
      callback(error);
    }
  });

  return new Promise((resolve, reject) => {
    proxy.onceError = reject;
    proxy.listen({
      host: config.host,
      port: config.proxyPort,
      sslCaDir: config.certsDir
    }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      console.log(`Local proxy listening on http://127.0.0.1:${config.proxyPort}`);
      for (const url of getLanUrls(config.proxyPort)) {
        console.log(`Local proxy available on ${url}`);
      }
      console.log(`HTTPS CA files are stored under ${config.certsDir}`);
      resolve(proxy);
    });
  });
}

async function sendLocalResponse(ctx, rule, request) {
  const body = await readBufferFile(rule.filePath);
  const headers = {
    ...filterResponseHeaders(rule.responseHeaders || {}),
    'content-type': rule.contentType || 'application/octet-stream',
    'content-length': String(body.length),
    'x-easy-http-local': 'hit'
  };

  ctx.proxyToClientResponse.writeHead(Number(rule.statusCode || 200), headers);
  ctx.proxyToClientResponse.end(body);

  if (request) {
    const now = new Date().toISOString();
    const capture = buildCapture({
      request: {
        ...request,
        requestStartedAt: request.requestStartedAt || now,
        requestEndedAt: request.requestEndedAt || now,
        clientAddress: request.clientAddress || clientAddressForContext(ctx),
        requestHeaderSize: request.requestHeaderSize ?? approximateRequestHeaderBytes(request),
        requestQuerySize: request.requestQuerySize ?? queryBytesForUrl(request.url),
        requestCookieSize: request.requestCookieSize ?? headerByteLength(request.headers?.cookie || '')
      },
      response: {
        statusCode: Number(rule.statusCode || 200),
        statusMessage: rule.statusMessage || '',
        headers,
        responseStartedAt: now,
        responseEndedAt: now,
        durationMs: 0,
        requestMs: 0,
        responseMs: 0,
        latencyMs: 0,
        httpVersion: 'HTTP/1.1',
        keptAlive: false,
        responseHeaderSize: approximateResponseHeaderBytes(Number(rule.statusCode || 200), rule.statusMessage || '', headers),
        responseCookieSize: headerByteLength(headers['set-cookie'] || '')
      },
      bodyBuffer: body
    });
    capture.mapType = 'local';
    capture.mapRuleId = rule.id || '';
    await recordCapture(capture);
    if (ctx.localProxy) {
      ctx.localProxy.captureRecorded = true;
    }
  }
}

async function recordProxyErrorCapture(ctx, error) {
  if (ctx?.localProxyPassthrough || !ctx?.localProxy || ctx.localProxy.captureRecorded) return;

  const request = ctx.localProxy.request || ctx.localProxy.originalRequest || safeBuildRequestSummary(ctx);
  if (!request?.url || !request?.method) return;

  const requestBodyBuffer = ctx.localProxy.effectiveRequestBodyBuffer || decodeRequestBody(
    Buffer.concat(ctx.localProxy.requestChunks || []),
    request.headers
  );
      const message = `Proxy request failed: ${error?.message || 'unknown error'}`;
  const bodyBuffer = Buffer.from(message, 'utf8');
  const capture = buildCapture({
    request: {
      ...request,
      requestStartedAt: request.requestStartedAt || ctx.localProxy.requestStartedAt || new Date().toISOString(),
      requestEndedAt: request.requestEndedAt || new Date().toISOString(),
      clientAddress: request.clientAddress || clientAddressForContext(ctx),
      requestHeaderSize: request.requestHeaderSize ?? approximateRequestHeaderBytes(request),
      requestQuerySize: request.requestQuerySize ?? queryBytesForUrl(request.url),
      requestCookieSize: request.requestCookieSize ?? headerByteLength(request.headers?.cookie || ''),
      bodyBuffer: requestBodyBuffer,
      bodyTruncated: Boolean(ctx.localProxy.requestTruncated)
    },
    response: {
      statusCode: 504,
      statusMessage: 'Gateway Timeout',
      proxyError: classifyProxyError(error),
      responseStartedAt: new Date().toISOString(),
      responseEndedAt: new Date().toISOString(),
      durationMs: Date.now() - Date.parse(ctx.localProxy.requestStartedAt || new Date().toISOString()),
      httpVersion: 'HTTP/1.1',
      keptAlive: false,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': String(bodyBuffer.length),
        'x-easy-http-proxy-error': '1'
      }
    },
    bodyBuffer
  });

  if (ctx.localProxy.remoteHit) {
    capture.mapType = 'remote';
    capture.mapRuleId = preferredRemoteMapRuleId(ctx.localProxy.remoteRules, ctx.localProxy.remoteRuleIds);
    capture.mapRuleIds = ctx.localProxy.remoteRuleIds || [];
  }

  await recordCapture(capture);
  ctx.localProxy.captureRecorded = true;
}

async function recordConnectSummary(connectTarget) {
  const host = hostFromConnectTarget(connectTarget);
  if (!host) return;
  const port = portFromConnectTarget(connectTarget);
  const capture = buildCapture({
    request: {
      method: 'CONNECT',
      url: `https://${host}:${port || 443}/`,
      headers: {}
    },
    response: {
      statusCode: 200,
      statusMessage: 'Tunnel',
      headers: {
        'x-http-mocker-summary-only': '1'
      },
      bodySize: 0
    },
    bodyBuffer: Buffer.alloc(0),
    options: {
      summaryOnly: true,
      saveRequestBody: false,
      saveResponseBody: false
    }
  });
  await recordCapture(capture, { bypassCaptureFilter: true, enqueueNote: false });
}

async function recordHttpSummary(ctx) {
  const request = safeBuildRequestSummary(ctx);
  if (!request?.url || !request?.method) return;
  const now = new Date().toISOString();
  const capture = buildCapture({
    request: {
      ...request,
      requestStartedAt: request.requestStartedAt || now,
      requestEndedAt: request.requestEndedAt || now,
      clientAddress: request.clientAddress || clientAddressForContext(ctx),
      requestHeaderSize: request.requestHeaderSize ?? approximateRequestHeaderBytes(request),
      requestQuerySize: request.requestQuerySize ?? queryBytesForUrl(request.url),
      requestCookieSize: request.requestCookieSize ?? headerByteLength(request.headers?.cookie || ''),
      bodyBuffer: Buffer.alloc(0)
    },
    response: {
      statusCode: ctx.serverToProxyResponse?.statusCode || 0,
      statusMessage: ctx.serverToProxyResponse?.statusMessage || '',
      ...captureResponseMetadata({
        ...ctx,
        localProxy: {
          request,
          requestStartedAt: request.requestStartedAt || now,
          responseStartedAt: now
        }
      }),
      headers: {
        ...(ctx.serverToProxyResponse?.headers || {}),
        'x-http-mocker-summary-only': '1'
      },
      bodySize: Number(headerValue(ctx.serverToProxyResponse?.headers || {}, 'content-length') || 0)
    },
    bodyBuffer: Buffer.alloc(0),
    options: {
      summaryOnly: true,
      saveRequestBody: false,
      saveResponseBody: false
    }
  });
  await recordCapture(capture, { bypassCaptureFilter: true, enqueueNote: false });
}

function buildRemoteDiff(ctx, buffers) {
  const originalUrl = ctx.localProxy.originalRequestUrl || ctx.localProxy.originalRequest?.url || ctx.localProxy.request.url;
  const effectiveUrl = ctx.localProxy.request.url;
  const originalRequestHeaders = ctx.localProxy.originalRequestHeaders || ctx.localProxy.originalRequest?.headers || {};
  const effectiveRequestHeaders = ctx.localProxy.request.headers || {};
  const originalResponseHeaders = ctx.localProxy.originalResponseHeaders || ctx.serverToProxyResponse.headers || {};
  const effectiveResponseHeaders = ctx.localProxy.effectiveResponseHeaders || ctx.serverToProxyResponse.headers || {};
  const requestContentType = headerValue(effectiveRequestHeaders, 'content-type');
  const responseContentType = headerValue(effectiveResponseHeaders, 'content-type');

  return {
    query: {
      before: queryFromUrl(originalUrl),
      after: queryFromUrl(effectiveUrl)
    },
    requestHead: {
      before: formatHeaders(originalRequestHeaders),
      after: formatHeaders(effectiveRequestHeaders)
    },
    responseHead: {
      before: formatHeaders(originalResponseHeaders),
      after: formatHeaders(effectiveResponseHeaders)
    },
    request: {
      before: formatBodySnapshot(ctx.localProxy.originalRequestBodyBuffer || Buffer.alloc(0), requestContentType),
      after: formatBodySnapshot(buffers.effectiveRequestBodyBuffer || Buffer.alloc(0), requestContentType)
    },
    response: {
      before: formatBodySnapshot(buffers.originalResponseBodyBuffer || Buffer.alloc(0), responseContentType),
      after: formatBodySnapshot(buffers.effectiveResponseBodyBuffer || Buffer.alloc(0), responseContentType)
    }
  };
}

function queryFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.search ? parsed.search.slice(1) : '';
  } catch {
    return '';
  }
}

function formatHeadSnapshot(requestHeaders = {}, responseHeaders = {}) {
  return [
    Object.keys(requestHeaders || {}).length ? `Request Head\n${formatHeaders(requestHeaders)}` : '',
    Object.keys(responseHeaders || {}).length ? `Response Head\n${formatHeaders(responseHeaders)}` : ''
  ].filter(Boolean).join('\n\n');
}

function formatHeaders(headers = {}) {
  return Object.entries(headers || {})
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n');
}

function formatBodySnapshot(buffer, contentType = '') {
  const text = Buffer.from(buffer || '').toString('utf8');
  if ((contentType || '').toLowerCase().includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(text || '{}'), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function preferredRemoteMapRuleId(remoteRules = [], remoteRuleIds = []) {
  const regularRule = (remoteRules || []).find((rule) => rule?.scope !== 'global' && rule?.id);
  return regularRule?.id || remoteRuleIds?.[0] || '';
}

function remoteRulesOverrideLocalRule(localRule, remoteRules = []) {
  return (remoteRules || []).some((rule) => (
    rule?.scope !== 'global' &&
    compareRuleSpecificity(rule, localRule) < 0
  ));
}

async function applyRemoteRulesInOrder({
  rules,
  stage,
  request,
  requestBodyBuffer,
  response,
  responseBodyBuffer
}) {
  let currentRequestBody = Buffer.isBuffer(requestBodyBuffer) ? requestBodyBuffer : Buffer.alloc(0);
  let currentResponseBody = Buffer.isBuffer(responseBodyBuffer) ? responseBodyBuffer : Buffer.alloc(0);
  let bodyHeaderTouched = false;

  for (const rule of rules || []) {
    for (const step of normalizeRemoteSteps(rule)) {
      if (step.enabled === false) continue;
      if (step.type === 'ai') {
        const pythonRule = {
          ...rule,
          scriptType: 'python',
          pythonScript: step.pythonScript || ''
        };
        if (!pythonRule.pythonScript) continue;
      const beforeRequestUrl = request?.url || '';
      const beforeRequestHeaders = { ...(request?.headers || {}) };
      const beforeResponseHeaders = { ...(response?.headers || {}) };
        const pythonResult = await applyPythonRulesForStage([pythonRule], stage, buildPythonContext({
        request,
        requestBodyBuffer: currentRequestBody,
        response,
        responseBodyBuffer: currentResponseBody
      }));
      logPythonErrors(pythonResult.errors);
      bodyHeaderTouched = bodyHeaderTouched || bodyHeadersChanged(beforeRequestHeaders, pythonResult.context?.request?.headers);
      bodyHeaderTouched = bodyHeaderTouched || bodyHeadersChanged(beforeResponseHeaders, pythonResult.context?.response?.headers);
      applyPythonContextToRequest(request, pythonResult.context?.request, beforeRequestUrl);
      if (response) {
        applyPythonContextToResponse(response, pythonResult.context?.response);
      }
      if (stage === 'request_body') {
        currentRequestBody = bodyBufferFromPythonPayload(pythonResult.context?.request, currentRequestBody);
      }
      if (stage === 'response_body') {
        currentResponseBody = bodyBufferFromPythonPayload(pythonResult.context?.response, currentResponseBody);
      }
      continue;
    }

      if (step.type !== 'dsl') continue;
      const command = remoteStepCommand(step);
      if (!command) {
        logRemoteRuleErrors(rule, ['invalid remote rule syntax.']);
        continue;
      }
    if (stage === 'request_head') {
        if (command.action === 'change_query') {
          request.url = applyQueryChanges(request.url, [command]);
      }
        if (command.action === 'change_req_head') {
          request.headers = applyHeaderChanges(request.headers, [command]).headers;
          bodyHeaderTouched = bodyHeaderTouched || isBodyHeaderName(command.path || command.key);
      }
    } else if (stage === 'request_body') {
        if (command.action === 'change_req_body') {
        currentRequestBody = applyBodyChanges(
          currentRequestBody,
          headerValue(request.headers, 'content-type'),
            [command]
        ).buffer;
      }
    } else if (stage === 'response_head' && response) {
        if (command.action === 'change_resp_head') {
          response.headers = applyHeaderChanges(response.headers, [command]).headers;
          bodyHeaderTouched = bodyHeaderTouched || isBodyHeaderName(command.path || command.key);
      }
    } else if (stage === 'response_body' && response) {
        if (command.action === 'change_resp_body') {
        currentResponseBody = applyBodyChanges(
          currentResponseBody,
          headerValue(response.headers, 'content-type'),
            [command]
        ).buffer;
      }
    }
  }
  }

  return {
    requestBodyBuffer: currentRequestBody,
    responseBodyBuffer: currentResponseBody,
    bodyHeaderTouched
  };
}

function shouldBufferRemoteResponse(remoteRules = [], remoteCommands = {}) {
  return Boolean(remoteCommands?.responseBody?.length) ||
    hasPythonRemoteRules(remoteRules) ||
    remoteRules.some(hasEnabledAiStep);
}

function hasEnabledAiStep(rule) {
  return normalizeRemoteSteps(rule).some((step) => {
    return step.enabled !== false && step.type === 'ai' && String(step.pythonScript || '').trim();
  });
}

function logRemoteRuleErrors(rule, errors = []) {
  for (const error of errors || []) {
    console.error(`Remote rule ignored: ${rule.host || ''}${rule.path || ''}: ${error}`);
  }
}

function buildPythonContext({ request, requestBodyBuffer, response, responseBodyBuffer }) {
  return {
    request: pythonRequestPayload(request, requestBodyBuffer),
    response: response ? pythonResponsePayload(response, responseBodyBuffer) : null
  };
}

function pythonRequestPayload(request = {}, bodyBuffer) {
  const parsed = safeUrl(request.url);
  const body = Buffer.isBuffer(bodyBuffer) ? bodyBuffer : null;
  return {
    method: request.method || '',
    url: request.url || '',
    path: parsed?.pathname || '',
    query: parsed?.search ? parsed.search.slice(1) : '',
    headers: { ...(request.headers || {}) },
    contentType: headerValue(request.headers || {}, 'content-type'),
    body: body ? body.toString('utf8') : '',
    bodyBase64: body ? body.toString('base64') : ''
  };
}

function pythonResponsePayload(response = {}, bodyBuffer) {
  const body = Buffer.isBuffer(bodyBuffer) ? bodyBuffer : null;
  return {
    statusCode: response.statusCode || 0,
    statusMessage: response.statusMessage || '',
    headers: { ...(response.headers || {}) },
    contentType: headerValue(response.headers || {}, 'content-type'),
    body: body ? body.toString('utf8') : '',
    bodyBase64: body ? body.toString('base64') : ''
  };
}

function applyPythonContextToRequest(request, payload = {}, previousUrl = '') {
  if (!request || !payload || typeof payload !== 'object') return;
  const urlChanged = payload.url && String(payload.url) !== String(previousUrl || request.url || '');
  if (payload.url) {
    request.url = String(payload.url);
  }
  if (!urlChanged && Object.hasOwn(payload, 'path')) {
    request.url = replaceUrlPath(request.url, String(payload.path || '/'));
  }
  if (!urlChanged && Object.hasOwn(payload, 'query')) {
    request.url = replaceUrlQuery(request.url, String(payload.query || ''));
  }
  if (payload.headers && typeof payload.headers === 'object') {
    request.headers = normalizeProxyHeaders(payload.headers);
  }
}

function applyPythonContextToResponse(response, payload = {}) {
  if (!response || !payload || typeof payload !== 'object') return;
  if (Number.isFinite(Number(payload.statusCode)) && Number(payload.statusCode) > 0) {
    response.statusCode = Number(payload.statusCode);
  }
  if (Object.hasOwn(payload, 'statusMessage')) {
    response.statusMessage = String(payload.statusMessage || '');
  }
  if (payload.headers && typeof payload.headers === 'object') {
    response.headers = normalizeProxyHeaders(payload.headers);
  }
}

function bodyBufferFromPythonPayload(payload = {}, fallback = Buffer.alloc(0)) {
  if (!payload || typeof payload !== 'object') return fallback;
  if (Object.hasOwn(payload, 'bodyBase64') && payload.bodyBase64 && String(payload.bodyBase64) !== fallback.toString('base64')) {
    try {
      return Buffer.from(String(payload.bodyBase64), 'base64');
    } catch {
      return fallback;
    }
  }
  if (Object.hasOwn(payload, 'body')) {
    return Buffer.from(String(payload.body ?? ''), 'utf8');
  }
  if (Object.hasOwn(payload, 'bodyBase64') && payload.bodyBase64) {
    try {
      return Buffer.from(String(payload.bodyBase64), 'base64');
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeProxyHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!key) continue;
    result[String(key).toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
}

function replaceUrlQuery(url, query) {
  try {
    const parsed = new URL(url);
    parsed.search = String(query || '').replace(/^\?/, '');
    return parsed.toString();
  } catch {
    return url;
  }
}

function replaceUrlPath(url, path) {
  try {
    const parsed = new URL(url);
    parsed.pathname = String(path || '/');
    return parsed.toString();
  } catch {
    return url;
  }
}

function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function buffersEqual(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && left.equals(right);
}

function logPythonErrors(errors = []) {
  for (const error of errors || []) {
    console.error(`Python remote rule ignored: ${error}`);
  }
}

async function recordCapture(capture, options = {}) {
  const settings = await readSettings();
  await addCapture(capture);
  emitCapturesChanged({
    mode: 'append',
    capture: captureListSummaryForEvent(capture, settings)
  });
  if (options.enqueueNote === false || capture.summaryOnly) {
    return;
  }
  enqueueCodexNote(capture).catch((error) => {
    console.error('Failed to enqueue Codex note:', error.message);
  });
}

function captureListSummaryForEvent(capture = {}, settings = {}) {
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
    mapRuleIds: Array.isArray(capture.mapRuleIds) ? capture.mapRuleIds : [],
    mergeKey: [
      capture.method,
      capture.protocol,
      capture.host,
      Number(capture.port),
      capture.path
    ].join('\u0000'),
    mergeGroupKey: captureMergeGroupKeyForEvent(capture, settings),
    mergeOptions: captureMergeOptionsForEvent(capture, settings),
    history: []
  };
}

function captureMergeOptionsForEvent(capture = {}, settings = {}) {
  const key = [
    capture.method,
    capture.protocol,
    capture.host,
    Number(capture.port),
    capture.path
  ].join('\u0000');
  const rule = settings.captureMergeRules?.[key] || {};
  const variant = captureMergeVariantForEvent(rule, capture);
  const hasVariants = Boolean(rule.variants && Object.keys(rule.variants).length);
  const queryTemplate = variant.rule && Object.hasOwn(variant.rule, 'queryTemplate')
    ? String(variant.rule.queryTemplate ?? '').replace(/^\?/, '')
    : (!hasVariants && Object.hasOwn(rule, 'queryTemplate')
      ? String(rule.queryTemplate ?? '').replace(/^\?/, '')
      : (rule.query === true ? String(capture.query || '').replace(/^\?/, '') : ''));
  const bodyTemplate = variant.rule && Object.hasOwn(variant.rule, 'bodyTemplate')
    ? String(variant.rule.bodyTemplate || '')
    : (!hasVariants && Object.hasOwn(rule, 'bodyTemplate')
      ? String(rule.bodyTemplate || '')
      : (rule.body === true ? captureRequestBodyTextForEvent(capture) : ''));
  return {
    query: rule.query === true,
    body: rule.body === true,
    variantKey: variant.key,
    queryTemplate,
    bodyTemplate,
    requestContentType: String(variant.rule?.requestContentType || rule.requestContentType || capture?.requestContentType || '')
  };
}

function captureMergeGroupKeyForEvent(capture = {}, settings = {}) {
  const baseKey = [
    capture.method,
    capture.protocol,
    capture.host,
    Number(capture.port),
    capture.path
  ].join('\u0000');
  const rule = settings.captureMergeRules?.[baseKey] || {};
  const variant = captureMergeVariantForEvent(rule, capture);
  return variant.key ? `${baseKey}\u0000${variant.key}` : baseKey;
}

function captureMergeVariantForEvent(rule = {}, capture = {}) {
  if (!rule || typeof rule !== 'object') return { key: '', rule: null };
  const variants = rule.variants && typeof rule.variants === 'object' && !Array.isArray(rule.variants)
    ? rule.variants
    : {};
  const directKey = captureMergeVariantKeyForEvent(rule, capture);
  const matches = [];
  for (const [key, variantRule] of Object.entries(variants)) {
    if (!variantRule || typeof variantRule !== 'object') continue;
    if (captureMatchesMergeVariantForEvent(capture, rule, variantRule)) matches.push({ key, rule: variantRule });
  }
  if (matches.length) {
    matches.sort((a, b) => (
      captureMergeVariantSpecificityForEvent(rule, b.rule) - captureMergeVariantSpecificityForEvent(rule, a.rule) ||
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

function captureMatchesMergeVariantForEvent(capture = {}, baseRule = {}, variantRule = {}) {
  if (baseRule.query === true) {
    const queryTemplate = String(variantRule.queryTemplate || '').replace(/^\?/, '');
    if (queryTemplate && !queryIncludesRequiredForEvent(capture.query || '', queryTemplate)) return false;
  }
  if (baseRule.body === true && !['GET', 'HEAD'].includes(String(capture.method || '').toUpperCase())) {
    const bodyTemplate = String(variantRule.bodyTemplate || '');
    if (bodyTemplate) {
      const contentType = String(variantRule.requestContentType || baseRule.requestContentType || capture.requestContentType || '').toLowerCase();
      const actual = Buffer.from(capture.requestBodyBase64 || '', 'base64').toString('utf8');
      if (contentType.includes('application/x-www-form-urlencoded')) {
        if (!queryIncludesRequiredForEvent(actual, bodyTemplate)) return false;
      } else {
        const requiredJson = parseJsonForEvent(bodyTemplate);
        const actualJson = parseJsonForEvent(actual);
        if (requiredJson.ok && actualJson.ok) {
          if (!jsonIncludesRequiredForEvent(actualJson.value, requiredJson.value)) return false;
        } else if (capture.requestBodyHash !== hashRequestBody(Buffer.from(bodyTemplate, 'utf8'), contentType)) {
          return false;
        }
      }
    }
  }
  return true;
}

function captureMergeVariantKeyForEvent(rule = {}, capture = {}) {
  const parts = [];
  if (rule.query === true) parts.push(`q:${bodyHash(Buffer.from(String(capture.query || '').replace(/^\?/, ''), 'utf8')).slice(0, 12)}`);
  if (rule.body === true && !['GET', 'HEAD'].includes(String(capture.method || '').toUpperCase())) {
    parts.push(`b:${capture.requestBodyHash || bodyHash(Buffer.from(capture.requestBodyBase64 || String(capture.requestBodySize || 0), 'utf8')).slice(0, 12)}`);
  }
  return parts.join('|');
}

function captureMergeVariantSpecificityForEvent(rule = {}, variantRule = {}) {
  let score = 0;
  if (rule.query === true) {
    score += [...new URLSearchParams(String(variantRule.queryTemplate || '').replace(/^\?/, '')).entries()].length * 100;
  }
  if (rule.body === true) {
    score += captureMergeBodySpecificityForEvent(
      String(variantRule.bodyTemplate || ''),
      String(variantRule.requestContentType || rule.requestContentType || '')
    );
  }
  return score;
}

function captureMergeBodySpecificityForEvent(bodyTemplate = '', contentType = '') {
  const text = String(bodyTemplate || '').trim();
  if (!text) return 0;
  if (String(contentType || '').toLowerCase().includes('application/x-www-form-urlencoded')) {
    return [...new URLSearchParams(text).entries()].length * 100;
  }
  const parsed = parseJsonForEvent(text);
  return parsed.ok ? countJsonSpecificityForEvent(parsed.value) * 100 : Math.max(1, text.length);
}

function countJsonSpecificityForEvent(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countJsonSpecificityForEvent(item), value.length);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => sum + countJsonSpecificityForEvent(item), Object.keys(value).length);
  }
  return 1;
}

function captureRequestBodyTextForEvent(capture = {}) {
  if (!capture.requestBodyBase64) return '';
  try {
    return Buffer.from(capture.requestBodyBase64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function queryIncludesRequiredForEvent(actualQuery = '', requiredQuery = '') {
  const required = [...new URLSearchParams(String(requiredQuery || '').replace(/^\?/, '')).entries()];
  if (!required.length) return true;
  const counts = new Map();
  for (const [key, value] of new URLSearchParams(String(actualQuery || '').replace(/^\?/, '')).entries()) {
    const entryKey = `${key}\u0000${value}`;
    counts.set(entryKey, (counts.get(entryKey) || 0) + 1);
  }
  for (const [key, value] of required) {
    const entryKey = `${key}\u0000${value}`;
    const count = counts.get(entryKey) || 0;
    if (count <= 0) return false;
    counts.set(entryKey, count - 1);
  }
  return true;
}

function parseJsonForEvent(text) {
  try {
    return { ok: true, value: JSON.parse(String(text || '')) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function jsonIncludesRequiredForEvent(actual, required) {
  if (Array.isArray(required)) {
    if (!Array.isArray(actual)) return false;
    const usedIndexes = new Set();
    return required.every((requiredItem) => {
      const actualIndex = actual.findIndex((actualItem, index) => (
        !usedIndexes.has(index) && jsonIncludesRequiredForEvent(actualItem, requiredItem)
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
      jsonIncludesRequiredForEvent(actual[key], value)
    ));
  }
  return Object.is(actual, required);
}

function syncProxyRequestOptionHeaders(targetHeaders = {}, nextHeaders = {}) {
  for (const name of Object.keys(targetHeaders)) {
    if (!Object.prototype.hasOwnProperty.call(nextHeaders, name)) {
      delete targetHeaders[name];
    }
  }
  for (const [name, value] of Object.entries(nextHeaders)) {
    targetHeaders[name] = value;
  }
}

function syncProxyRequestHeaders(request, nextHeaders = {}) {
  if (!request) return;
  for (const name of request.getHeaderNames()) {
    if (!Object.prototype.hasOwnProperty.call(nextHeaders, name)) {
      request.removeHeader(name);
    }
  }
  for (const [name, value] of Object.entries(nextHeaders)) {
    request.setHeader(name, value);
  }
}

function syncProxyResponseHeaders(response, nextHeaders = {}) {
  if (!response || response.headersSent) return;
  for (const name of response.getHeaderNames()) {
    if (!Object.prototype.hasOwnProperty.call(nextHeaders, name)) {
      response.removeHeader(name);
    }
  }
  for (const [name, value] of Object.entries(nextHeaders || {})) {
    response.setHeader(name, value);
  }
}

function syncBodyHeaders(headers = {}, bodyBuffer = Buffer.alloc(0)) {
  headers['content-length'] = String(Buffer.byteLength(bodyBuffer || Buffer.alloc(0)));
  delete headers['content-encoding'];
  return headers;
}

function normalizeUnsafeBodyHeaders(headers = {}, bodyBuffer, touched) {
  if (!touched) return headers;
  if (Buffer.isBuffer(bodyBuffer)) {
    return syncBodyHeaders(headers, bodyBuffer);
  }
  clearBodyTransformHeaders(headers);
  return headers;
}

function bodyHeadersChanged(before = {}, after = {}) {
  if (!after || typeof after !== 'object') return false;
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {})
  ].filter(isBodyHeaderName));
  for (const key of keys) {
    if (String(headerValue(before, key) || '') !== String(headerValue(after, key) || '')) {
      return true;
    }
  }
  return false;
}

function isBodyHeaderName(name = '') {
  const normalized = String(name || '').toLowerCase();
  return normalized === 'content-length' ||
    normalized === 'content-encoding' ||
    normalized === 'transfer-encoding';
}

function clearBodyTransformHeaders(headers = {}) {
  delete headers['content-length'];
  delete headers['content-encoding'];
  return headers;
}

function shouldSkipResponseBodyCapture(headers = {}) {
  const contentType = String(headerValue(headers, 'content-type') || '').split(';')[0].trim().toLowerCase();
  const contentLength = Number(headerValue(headers, 'content-length') || 0);
  if (contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/') ||
    contentType === 'application/octet-stream' ||
    contentType === 'application/pdf' ||
    contentType === 'application/zip' ||
    contentType === 'application/x-zip-compressed' ||
    contentType === 'text/event-stream' ||
    contentType === 'application/grpc' ||
    contentType === 'application/grpc-web' ||
    contentType === 'application/x-ndjson') {
    return true;
  }
  return contentLength > config.maxCaptureBodyBytes;
}

function flushBufferedRequestToUpstream(ctx, extraChunk) {
  for (const chunk of ctx.localProxy?.requestChunks || []) {
    ctx.proxyToServerRequest.write(chunk);
  }
  if (extraChunk) {
    ctx.proxyToServerRequest.write(extraChunk);
  }
}

function flushRequestBodyToUpstream(ctx, buffer) {
  if (buffer.length) {
    ctx.proxyToServerRequest.write(buffer);
  }
}

function ignoreFinalEndChunk(ctx) {
  if (!ctx.proxyToServerRequest || ctx.localProxy?.ignoreFinalEndChunk) return;
  const originalEnd = ctx.proxyToServerRequest.end.bind(ctx.proxyToServerRequest);
  ctx.proxyToServerRequest.end = (_chunk, ...args) => originalEnd(undefined, ...args);
  ctx.localProxy.ignoreFinalEndChunk = true;
}

function decodeRequestBody(buffer, headers = {}) {
  if (!buffer.length) return buffer;
  const encodings = headerValue(headers, 'content-encoding')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!encodings.length) return buffer;

  try {
    return encodings.reverse().reduce((current, encoding) => {
      if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.gunzipSync(current);
      if (encoding === 'deflate') return zlib.inflateSync(current);
      if (encoding === 'br') return zlib.brotliDecompressSync(current);
      if (encoding === 'identity') return current;
      return current;
    }, buffer);
  } catch {
    return buffer;
  }
}

function buildRequestSummary(ctx) {
  const protocol = ctx.isSSL ? 'https' : 'http';
  const hostHeader = ctx.clientToProxyRequest.headers.host || '';
  const fullUrl = ctx.clientToProxyRequest.url.startsWith('http')
    ? ctx.clientToProxyRequest.url
    : `${protocol}://${hostHeader}${ctx.clientToProxyRequest.url}`;

  return {
    method: ctx.clientToProxyRequest.method.toUpperCase(),
    url: fullUrl,
    headers: ctx.clientToProxyRequest.headers
  };
}

function captureResponseMetadata(ctx) {
  const now = new Date().toISOString();
  const requestStartedAt = ctx.localProxy?.requestStartedAt || ctx.localProxy?.request?.requestStartedAt || now;
  const requestEndedAt = ctx.localProxy?.request?.requestEndedAt || requestStartedAt;
  const responseStartedAt = ctx.localProxy?.responseStartedAt || now;
  const responseEndedAt = now;
  const durationMs = Math.max(0, Date.parse(responseEndedAt) - Date.parse(requestStartedAt));
  const requestMs = Math.max(0, Date.parse(requestEndedAt) - Date.parse(requestStartedAt));
  const responseMs = Math.max(0, Date.parse(responseEndedAt) - Date.parse(responseStartedAt));
  const latencyMs = Math.max(0, Date.parse(responseStartedAt) - Date.parse(requestEndedAt));
  const headers = ctx.localProxy?.effectiveResponseHeaders || ctx.serverToProxyResponse?.headers || {};
  const socket = ctx.serverToProxyResponse?.socket || ctx.proxyToServerRequest?.socket;
  return {
    responseStartedAt,
    responseEndedAt,
    durationMs,
    requestMs,
    responseMs,
    latencyMs,
    remoteAddress: remoteAddressForSocket(socket, ctx.localProxy?.request),
    httpVersion: httpVersionText(ctx.serverToProxyResponse?.httpVersion),
    keptAlive: connectionKeptAlive(headers),
    tlsProtocol: socket?.getProtocol?.() || '',
    tlsCipher: tlsCipherName(socket),
    responseHeaderSize: approximateResponseHeaderBytes(ctx.serverToProxyResponse?.statusCode, ctx.serverToProxyResponse?.statusMessage, headers),
    responseCookieSize: headerByteLength(headers['set-cookie'] || '')
  };
}

function clientAddressForContext(ctx) {
  const socket = ctx.clientToProxyRequest?.socket || ctx.proxyToClientResponse?.socket;
  if (!socket?.remoteAddress) return '';
  return `${socket.remoteAddress}:${socket.remotePort || ''}`.replace(/:$/, '');
}

function remoteAddressForSocket(socket, request = {}) {
  if (socket?.remoteAddress) {
    return `${request.host || hostFromUrl(request.url) || socket.remoteAddress}/${socket.remoteAddress}:${socket.remotePort || request.port || ''}`.replace(/:$/, '');
  }
  const host = request.host || hostFromUrl(request.url);
  const port = request.port || portFromUrl(request.url);
  return host ? `${host}${port ? `:${port}` : ''}` : '';
}

function httpVersionText(version) {
  return version ? `HTTP/${version}` : '';
}

function connectionKeptAlive(headers = {}) {
  const connection = headerValue(headers, 'connection').toLowerCase();
  if (connection.includes('close')) return false;
  if (connection.includes('keep-alive')) return true;
  return null;
}

function tlsCipherName(socket) {
  const cipher = socket?.getCipher?.();
  return cipher?.standardName || cipher?.name || '';
}

function approximateRequestHeaderBytes(request = {}) {
  return approximateHeaderBytes(request.method || 'GET', requestPath(request.url || '/'), '1.1', request.headers || {});
}

function approximateHeaderBytes(method, path, httpVersion, headers = {}) {
  const startLine = `${method || 'GET'} ${path || '/'} HTTP/${httpVersion || '1.1'}\r\n`;
  return Buffer.byteLength(startLine + formatRawHeaders(headers) + '\r\n', 'utf8');
}

function approximateResponseHeaderBytes(statusCode, statusMessage, headers = {}) {
  const startLine = `HTTP/1.1 ${statusCode || 0}${statusMessage ? ` ${statusMessage}` : ''}\r\n`;
  return Buffer.byteLength(startLine + formatRawHeaders(headers) + '\r\n', 'utf8');
}

function formatRawHeaders(headers = {}) {
  return Object.entries(headers || {})
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join('\r\n');
}

function queryBytesForUrl(url) {
  try {
    return Buffer.byteLength(new URL(url).search.replace(/^\?/, ''), 'utf8');
  } catch {
    return 0;
  }
}

function headerByteLength(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + Buffer.byteLength(String(item), 'utf8'), 0);
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function portFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.port ? Number(parsed.port) : (parsed.protocol === 'http:' ? 80 : 443);
  } catch {
    return 0;
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function safeBuildRequestSummary(ctx) {
  try {
    return buildRequestSummary(ctx);
  } catch {
    return null;
  }
}

function matchesRequestKeyword(request, keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return true;

  let parsed;
  try {
    parsed = new URL(request.url);
  } catch {
    parsed = null;
  }

  const haystack = [
    request.method,
    request.url,
    parsed?.hostname,
    parsed?.pathname,
    parsed?.search ? parsed.search.slice(1) : ''
  ].filter(Boolean).join(' ').toLowerCase();

  return haystack.includes(query);
}

function isLongLivedRequest(request = {}) {
  const upgrade = headerValue(request.headers || {}, 'upgrade') || '';
  const accept = headerValue(request.headers || {}, 'accept') || '';
  const contentType = headerValue(request.headers || {}, 'content-type') || '';
  return upgrade.toLowerCase() === 'websocket' ||
    accept.toLowerCase().includes('text/event-stream') ||
    contentType.toLowerCase().includes('application/grpc');
}

function isConnectivityProbeRequest(request = {}) {
  let parsed;
  try {
    parsed = new URL(request.url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (isConnectivityProbeHost(host)) return true;
  if (isConnectivityProbePath(path)) return true;
  return false;
}

function isConnectivityProbeConnectTarget(target = '') {
  const host = String(target || '').split(':')[0].toLowerCase();
  return isConnectivityProbeHost(host);
}

function isConnectivityProbeHost(host = '') {
  const normalizedHost = String(host || '').toLowerCase();
  return connectivityProbeHosts.includes(normalizedHost) ||
    connectivityProbeHostSuffixes.some((suffix) => normalizedHost.endsWith(suffix));
}

function isConnectivityProbePath(path = '') {
  const normalizedPath = String(path || '').toLowerCase();
  return connectivityProbePathFragments.some((fragment) => normalizedPath.includes(fragment));
}

function sendConnectivityProbeResponse(ctx, request = {}) {
  const parsed = safeUrl(request.url);
  const path = parsed?.pathname?.toLowerCase() || '';
  const host = parsed?.hostname?.toLowerCase() || '';
  const wants204 = path.includes('generate_204') ||
    path.includes('gen_204') ||
    host.includes('miui.com') ||
    host.includes('xiaomi.com');

  if (wants204) {
    ctx.proxyToClientResponse.writeHead(204, {
      'content-length': '0',
      'cache-control': 'no-store'
    });
    ctx.proxyToClientResponse.end();
    return;
  }

  const body = connectivityProbeBody(host, path);
  ctx.proxyToClientResponse.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store'
  });
  ctx.proxyToClientResponse.end(body);
}

function connectivityProbeBody(host = '', path = '') {
  if (host.includes('msftconnecttest.com') || path.includes('connecttest.txt')) {
    return 'Microsoft Connect Test';
  }
  if (path.includes('ncsi.txt')) {
    return 'Microsoft NCSI';
  }
  return 'Success';
}

function classifyProxyError(error = {}) {
  const code = String(error.code || '').toUpperCase();
  const message = String(error.message || '');
  const lower = message.toLowerCase();
  if (code.includes('CERT') || lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
    return {
      type: 'tls',
      title: '疑似证书或证书固定失败',
      message
    };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      type: 'dns',
      title: 'DNS 解析失败',
      message
    };
  }
  if (code === 'ETIMEDOUT' || lower.includes('timeout')) {
    return {
      type: 'timeout',
      title: '上游请求超时',
      message
    };
  }
  if (code === 'ECONNREFUSED') {
    return {
      type: 'refused',
      title: '上游拒绝连接',
      message
    };
  }
  if (code === 'ECONNRESET' || lower.includes('socket hang up')) {
    return {
      type: 'reset',
      title: '连接被对端重置',
      message
    };
  }
  return {
    type: 'proxy',
    title: '代理请求失败',
    message
  };
}

function tunnelConnect(req, socket, head) {
  const [host, portText] = String(req.url || '').split(':');
  const port = Number(portText || 443);
  if (!host || !Number.isFinite(port)) {
    socket.destroy();
    return;
  }

  const conn = net.connect({ host, port, allowHalfOpen: true }, () => {
    socket.write('HTTP/1.1 200 OK\r\n\r\n', 'utf8', () => {
      if (head?.length) conn.write(head);
      conn.pipe(socket);
      socket.pipe(conn);
    });
  });

  conn.on('finish', () => {
    socket.destroy();
  });
  socket.on('close', () => {
    conn.end();
  });
  conn.on('error', (error) => {
    if (!isExpectedLocalAbort(error)) {
      console.error(`Tunnel error for ${req.url}:`, error.message);
    }
    socket.destroy();
  });
  socket.on('error', (error) => {
    if (!isExpectedLocalAbort(error)) {
      console.error(`Client tunnel error for ${req.url}:`, error.message);
    }
    conn.destroy();
  });
}

function shouldCaptureRequestContent(settings = {}, request = {}) {
  const host = hostFromRequest(request);
  return shouldCaptureHostContent(settings, host);
}

function shouldCaptureHostContent(settings = {}, host = '') {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  const activeHost = activeProjectHost(settings);
  if (activeHost) {
    return activeHost === normalizedHost;
  }
  return hasUnspecifiedProject(settings);
}

function activeProjectHost(settings = {}) {
  const tabs = Array.isArray(settings.captureTabs) ? settings.captureTabs : [];
  const activeTab = tabs.find((tab) => String(tab?.id || '') === String(settings.activeCaptureTabId || '')) || tabs[0] || null;
  return normalizeHost(activeTab?.filter || settings.captureFilter || '');
}

function hasUnspecifiedProject(settings = {}) {
  const tabs = Array.isArray(settings.captureTabs) ? settings.captureTabs : [];
  if (!tabs.length && !normalizeHost(settings.captureFilter || '')) return true;
  const activeTab = tabs.find((tab) => String(tab?.id || '') === String(settings.activeCaptureTabId || '')) || tabs[0] || null;
  return Boolean(activeTab && !normalizeHost(activeTab.filter || ''));
}

function hostFromRequest(request = {}) {
  try {
    return new URL(request.url).hostname;
  } catch {
    return normalizeHost(request.headers?.host || '');
  }
}

function hostFromConnectTarget(connectTarget) {
  const [host] = String(connectTarget || '').split(':');
  return normalizeHost(host);
}

function portFromConnectTarget(connectTarget) {
  const [, portText] = String(connectTarget || '').split(':');
  const port = Number(portText || 443);
  return Number.isFinite(port) ? port : 443;
}

function normalizeHost(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  try {
    return new URL(text.includes('://') ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return text.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].trim().toLowerCase();
  }
}

function requestPath(url) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function methodHasRequestBody(method) {
  return !['GET', 'HEAD'].includes(String(method || '').toUpperCase());
}

function isExpectedLocalAbort(error) {
  return error?.code === 'ECONNRESET' || error?.message === 'socket hang up';
}

function headerValue(headers, name) {
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === wanted);
  if (!entry) return '';
  return Array.isArray(entry[1]) ? entry[1].join(', ') : String(entry[1]);
}
