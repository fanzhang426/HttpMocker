import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const pythonTimeoutMs = 3000;
const maxScriptOutputChars = 12000;
const maxPythonProtocolChars = 20 * 1024 * 1024;
const maxPromptBodyChars = 8000;
const maxPythonErrorChars = 420;

const pythonRunner = String.raw`
import contextlib
import io
import json
import re
import sys
import urllib.parse

payload = json.loads(sys.stdin.read() or "{}")
ctx = payload.get("context") or {}
script = payload.get("script") or ""
logs = io.StringIO()
namespace = {
    "json": json,
    "re": re,
    "urllib_parse": urllib.parse,
}

try:
    with contextlib.redirect_stdout(logs):
        exec(script, namespace, namespace)
        stage = str(ctx.get("stage") or "")
        fn = namespace.get("handle")
        stage_fn = namespace.get("on_" + stage)
        if callable(stage_fn):
            result = stage_fn(ctx)
        elif callable(fn):
            result = fn(ctx)
        elif "result" in namespace:
            result = namespace.get("result")
        else:
            result = ctx
    if result is None:
        result = ctx
    print(json.dumps({
        "ok": True,
        "context": result,
        "logs": logs.getvalue()[-4000:],
    }, ensure_ascii=False))
except Exception as error:
    print(json.dumps({
        "ok": False,
        "error": str(error),
        "logs": logs.getvalue()[-4000:],
    }, ensure_ascii=False))
    sys.exit(1)
`;

export function isPythonRemoteRule(rule) {
  return rule?.scriptType === 'python' || Boolean(rule?.pythonScript);
}

export function hasPythonRemoteRules(rules = []) {
  return (rules || []).some(isPythonRemoteRule);
}

export async function applyPythonRulesForStage(rules, stage, context) {
  let current = cloneJson({
    ...(context || {}),
    stage
  });
  const errors = [];
  const logs = [];

  for (const rule of rules || []) {
    if (!isPythonRemoteRule(rule)) continue;
    const script = String(rule.pythonScript || '').trim();
    if (!script) continue;

    try {
      const result = await runPythonScript(script, {
        ...current,
        stage
      });
      current = cloneJson({
        ...current,
        ...(result.context || {}),
        stage
      });
      if (result.logs) logs.push(result.logs);
    } catch (error) {
      errors.push(formatPythonRuleError(rule, error));
    }
  }

  return { context: current, errors, logs };
}

export async function runPythonScript(script, context) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', pythonRunner], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('Python 脚本执行超时。'));
    }, pythonTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
      if (stdout.length > maxPythonProtocolChars) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error('Python 脚本输出过大。'));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > maxScriptOutputChars) stderr = stderr.slice(-maxScriptOutputChars);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = stdout.trim();
      let parsed;
      try {
        parsed = JSON.parse(output);
      } catch {
        reject(new Error(stderr.trim() || output || `Python exited with code ${code}.`));
        return;
      }
      if (code !== 0 || !parsed.ok) {
        reject(new Error(sanitizePythonError(parsed.error || stderr.trim() || `Python exited with code ${code}.`)));
        return;
      }
      resolve(parsed);
    });

    child.stdin.end(JSON.stringify({ script, context }));
  });
}

export async function generatePythonRuleWithAi({ rule, capture, prompt, currentScript, aiContext, onOutput, signal, provider = 'codex' }) {
  const userPrompt = String(prompt || '').trim();
  if (!userPrompt) {
    throw new Error('请输入 AI 生成规则的提示词。');
  }

  await ensureAiAvailable(provider);
  const history = Array.isArray(rule.aiPromptHistory) ? rule.aiPromptHistory : [];
  const savedContext = rule.aiContext || null;
  const context = normalizeAiRuleContext(aiContext || savedContext || compactRuleContext(rule, capture));
  const includeRequestContext = !savedContext;
  const fullPrompt = buildAiRulePrompt({
    rule,
    aiContext: context,
    userPrompt,
    currentScript,
    history,
    includeRequestContext
  });
  const result = await execAiForRule(provider, fullPrompt, { onOutput, signal });
  const parsed = parseAiRuleMessage(result.message);
  if (!parsed.script.trim()) {
    throw new Error(`${provider === 'cursor' ? 'Cursor' : 'Codex'} 没有生成可用的 Python 脚本。`);
  }
  parsed.script = ensurePythonScriptCommentHeader(parsed.script, parsed.summary);

  return {
    ...parsed,
    outputLines: result.outputLines,
    aiContext: context,
    includeRequestContext,
    prompt: userPrompt
  };
}

export async function reviewAiRulePromptWithAi({ rule, prompt, aiContext, provider = 'codex', onOutput, signal }) {
  const userPrompt = String(prompt || '').trim();
  if (!userPrompt) {
    return { ok: false, reason: '请输入 AI 生成规则的提示词。' };
  }

  await ensureAiAvailable(provider);
  const context = normalizeAiRuleContext(aiContext || rule.aiContext || compactRuleContext(rule, null));
  const result = await execAiForRule(provider, buildAiRuleReviewPrompt({ aiContext: context, userPrompt }), { onOutput, signal });
  return parseAiRuleReviewMessage(result.message);
}

export async function repairPythonRuleWithAi({ rule, prompt, currentScript, aiContext, validationErrors, validationInput, onOutput, signal, provider = 'codex' }) {
  const userPrompt = String(prompt || '').trim();
  await ensureAiAvailable(provider);
  const history = Array.isArray(rule.aiPromptHistory) ? rule.aiPromptHistory : [];
  const context = normalizeAiRuleContext(aiContext || rule.aiContext || compactRuleContext(rule, null));
  const fullPrompt = buildAiRulePrompt({
    rule,
    aiContext: context,
    userPrompt,
    currentScript,
    history,
    includeRequestContext: false,
    repair: {
      validationErrors,
      validationInput
    }
  });
  const result = await execAiForRule(provider, fullPrompt, { onOutput, signal });
  const parsed = parseAiRuleMessage(result.message);
  if (!parsed.script.trim()) {
    throw new Error(`${provider === 'cursor' ? 'Cursor' : 'Codex'} 没有生成可用的 Python 修复脚本。`);
  }
  parsed.script = ensurePythonScriptCommentHeader(parsed.script, parsed.summary);

  return {
    ...parsed,
    outputLines: result.outputLines,
    aiContext: context,
    includeRequestContext: false,
    prompt: userPrompt
  };
}

function buildAiRuleReviewPrompt({ aiContext, userPrompt }) {
  return [
    '你正在为 HttpMocker 校验用户想生成的 HTTP 拦截修改脚本需求是否合理。',
    'HttpMocker 的代理阶段顺序是：request_head -> request_body -> 发送上游请求 -> response_head -> response_body。',
    aiContext?.rule?.scope === 'global'
      ? '这是全局域名规则，没有固定请求或响应样本。只要需求能通过运行时 ctx 判断 method、path、query、headers、body 后安全执行，就视为可行；不要因为上下文缺少具体字段而直接判失败。'
      : '这是接口级规则，可以参考当前规则上下文里的请求和响应样本。',
    '可行逻辑：可以用请求侧信息作为条件去修改后续请求或响应，例如“当请求体 type=welcome 时修改响应体 reward_list”。',
    '明显不合理逻辑：不能用响应侧信息作为条件去修改已经发送出去的请求侧内容，例如“当响应体 xxx 时修改请求体/请求 Head/查询”。',
    '如果需求只是表达不清但仍可能实现，请 ok=true，并在 reason 中简短提醒可实现假设。',
    '如果需求违反阶段时序、目标字段不存在、目标描述自相矛盾或需要重新发送已发出的请求，请 ok=false，并用中文给出 1-2 句可操作原因。',
    '只输出 JSON，不要 Markdown，不要代码围栏。格式：{"ok":true,"reason":""} 或 {"ok":false,"reason":"原因"}。',
    '',
    '当前规则上下文：',
    JSON.stringify(aiContext, null, 2),
    '',
    '用户需求：',
    userPrompt
  ].join('\n');
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

function execAiForRule(provider, prompt, options = {}) {
  if (provider === 'cursor') {
    return execCursorForRule(prompt, options);
  }
  if (provider === 'claude') {
    return execClaudeForRule(prompt, options);
  }
  return execCodexForRule(prompt, options);
}

function providerCommand(provider) {
  if (provider === 'cursor') return 'cursor-agent';
  if (provider === 'claude') return 'claude';
  return 'codex';
}

function execCursorForRule(prompt, options = {}) {
  return execGenericAiForRule('cursor-agent', prompt, options);
}

function execClaudeForRule(prompt, options = {}) {
  return execGenericAiForRule('claude', prompt, options);
}

function execCodexForRule(prompt, options = {}) {
  return execGenericAiForRule('codex', prompt, options);
}

function execGenericAiForRule(cmd, prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd();
    const outputPath = path.join(os.tmpdir(), `http-mocker-ai-rule-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
    const outputLines = [];
    const rememberOutput = (chunk) => {
      for (const line of String(chunk || '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        outputLines.push(trimmed);
        options.onOutput?.(trimmed);
      }
    };

    const useCursorCli = cmd === 'cursor-agent';
    const useClaudeCli = cmd === 'claude';
    const args = useCursorCli
      ? [
        'exec',
        '-p',
        '--trust',
        '--sandbox',
        'enabled',
        '--workspace',
        cwd,
        prompt
      ]
      : useClaudeCli
        ? [
          '-p',
          '--permission-mode',
          'dontAsk',
          prompt
        ]
      : [
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
      ];

    const child = spawn(cmd, args, {
      cwd,
      env: getAiEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let settled = false;
    const cleanupAbortListener = () => {
      options.signal?.removeEventListener?.('abort', handleAbort);
    };
    const handleAbort = () => {
      if (settled) return;
      child.kill('SIGTERM');
    };
    if (options.signal?.aborted) {
      child.kill('SIGTERM');
    } else {
      options.signal?.addEventListener?.('abort', handleAbort, { once: true });
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      rememberOutput(chunk);
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      rememberOutput(chunk);
      stderr += String(chunk || '');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanupAbortListener();
      if (!useCursorCli && !useClaudeCli) fs.rmSync(outputPath, { force: true });
      reject(new Error(error.code === 'ENOENT'
        ? `${cmd} 命令未找到。请确认对应 CLI 已安装并位于 /opt/homebrew/bin、/usr/local/bin 或 ~/.local/bin。`
        : error.message));
    });
    child.on('close', (code) => {
      try {
        if (settled) return;
        settled = true;
        cleanupAbortListener();
        if (options.signal?.aborted) {
          reject(new Error('AI 生成已停止。'));
          return;
        }
        if (code !== 0) {
          reject(new Error(stderr.trim() || `${cmd} CLI exited with code ${code}.`));
          return;
        }
        const message = useCursorCli || useClaudeCli ? stdout : fs.readFileSync(outputPath, 'utf8');
        resolve({ message, outputLines });
      } catch (error) {
        reject(error);
      } finally {
        if (!useCursorCli && !useClaudeCli) fs.rmSync(outputPath, { force: true });
      }
    });
  });
}

function buildAiRulePrompt({ rule, aiContext, userPrompt, currentScript, history, includeRequestContext, repair }) {
  const lines = [
    rule?.scope === 'global'
      ? `你正在为 HttpMocker 生成全局拦截修改规则。该规则只按域名 ${rule.host || '[未填写域名]'} 生效，对该域名下所有请求都可能执行。规则必须是 Python 脚本。`
      : '你正在为 HttpMocker 生成拦截修改规则。规则必须是 Python 脚本。',
    rule?.scope === 'global'
      ? '当前规则没有固定请求样本或响应样本，不能假设某个 path、query、请求体或响应体一定存在；必须在脚本里根据运行时 ctx 安全判断 method、path、query、headers、body 后再修改。'
      : '当前规则通常带有一次请求样本，脚本可以参考样本字段，但仍需在运行时安全判断字段存在。',
    '脚本会在代理请求过程中被调用，输入是 ctx 字典。你可以定义 handle(ctx)，也可以定义 on_request_head(ctx)、on_request_body(ctx)、on_response_head(ctx)、on_response_body(ctx)。',
    'ctx["stage"] 的值只会是 request_head、request_body、response_head、response_body 之一。',
    'ctx["request"] 包含 method、url、headers、query、path、body、bodyBase64、contentType。',
    'ctx["response"] 包含 statusCode、statusMessage、headers、body、bodyBase64、contentType。',
    '脚本可以基于同一次请求和响应的完整上下文做跨部分判断，例如：当请求体 type=welcome、查询 tab=home 或请求 Head 命中某值时，再修改响应体、响应 Head 或请求体。',
    '用户需求可能描述“当请求体 xxx 时，响应体 xxx”“当查询参数 xxx 时，响应 Head xxx”这类跨 stage 逻辑，请在对应阶段读取 ctx["request"] 条件并修改 ctx["response"] 或其他目标字段。',
    '请直接修改 ctx 并返回 ctx；不需要修改的阶段直接返回 ctx。',
    '如果要修改 JSON 或 URL encoded 文本，请优先解析并修改 ctx["request"]["body"] 或 ctx["response"]["body"]。bodyBase64 只用于二进制内容，除非必须处理二进制，否则不要读取、解析或重写 bodyBase64。',
    '如果修改了 body 字符串，请删除对应对象里的 bodyBase64 字段，避免旧的 base64 覆盖你的 body 修改。',
    '不要把完整请求体、响应体、base64 或 ctx 内容放进异常、assert、print、summary 或返回错误里。',
    '只能使用 Python 标准库。不要访问网络，不要读写本地文件，不要打印解释文本。',
    '脚本顶部必须从第一行开始写详细 Python 注释，说明这个脚本的用途、会在哪些 stage 生效、匹配或修改哪些字段、未命中时是否直接透传。注释只能概括逻辑，不要包含完整请求体、响应体、base64 或敏感数据。',
    '响应必须是 JSON 对象，格式为 {"summary":"一句中文摘要","script":"完整 Python 脚本"}。summary 优先写成“修改xxx字段”，推荐 40 字以内，尽量直接说明被修改的字段。不要 Markdown，不要代码围栏。',
    ''
  ];

  lines.push(includeRequestContext
    ? '这是第一次生成，下面是将保存到该规则里的 AI 上下文。'
    : '这是同一条 AI 规则的后续生成。请继续使用下面这份已保存的 AI 上下文，不要假设有新的请求或响应样本。');
  lines.push(JSON.stringify(aiContext, null, 2));

  if (history.length) {
    lines.push('');
    lines.push('历史需求：');
    for (const item of history.slice(-8)) {
      lines.push(`- ${item.prompt || ''}`);
    }
  }

  if (String(currentScript || '').trim()) {
    lines.push('');
    lines.push(repair ? '刚刚验证失败的脚本：' : '当前脚本：');
    lines.push(String(currentScript || ''));
  }

  if (repair) {
    lines.push('');
    lines.push('本地示例验证失败，请修复脚本并保持用户目标不变。验证错误：');
    for (const error of repair.validationErrors || []) {
      lines.push(`- ${error}`);
    }
  }

  lines.push('');
  lines.push(repair ? '原始用户需求：' : '用户新需求：');
  lines.push(userPrompt);
  return lines.join('\n');
}

function compactRuleContext(rule, capture) {
  return {
    rule: {
      method: rule.method,
      protocol: rule.protocol,
      host: rule.host,
      port: rule.port,
      path: rule.path,
      query: rule.query || '',
      requestHeaders: rule.requestHeaders || {},
      requestContentType: rule.requestContentType || ''
    },
    latestCapture: capture ? {
      statusCode: capture.statusCode,
      requestHeaders: capture.requestHeaders || {},
      responseHeaders: capture.responseHeaders || {},
      requestBody: truncate(capture.requestBody || ''),
      responseBody: truncate(capture.responseBody || ''),
      contentType: capture.contentType || ''
    } : null
  };
}

function normalizeAiRuleContext(context) {
  return isPlainObject(context) ? context : compactRuleContext({}, null);
}

function normalizedSummaryHint(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text === 'AI 脚本规则') return '';
  return text;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseAiRuleMessage(message) {
  const text = String(message || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const jsonText = extractJsonObject(text);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      return {
        summary: String(parsed.summary || 'AI 脚本规则').replace(/\s+/g, ' ').trim() || 'AI 脚本规则',
        script: String(parsed.script || '').trim()
      };
    } catch {
      // Fall through to fenced Python extraction.
    }
  }

  const fenced = text.match(/```python\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  return {
    summary: 'AI 脚本规则',
    script: String(fenced ? fenced[1] : text).trim()
  };
}

function parseAiRuleReviewMessage(message) {
  const text = String(message || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return {
      ok: false,
      reason: 'AI 需求校验没有返回可解析结果，请调整提示词后重试。'
    };
  }

  try {
    const parsed = JSON.parse(jsonText);
    const ok = Boolean(parsed.ok);
    const reason = String(parsed.reason || '').replace(/\s+/g, ' ').trim();
    return {
      ok,
      reason: ok ? reason : reason || '这个脚本需求不符合代理执行时序，请调整后重试。'
    };
  } catch {
    return {
      ok: false,
      reason: 'AI 需求校验没有返回可解析结果，请调整提示词后重试。'
    };
  }
}

function ensurePythonScriptCommentHeader(script, summary) {
  const text = String(script || '').trim();
  if (!text || text.startsWith('#')) return text;
  const summaryLine = String(summary || 'AI 拦截修改脚本')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'AI 拦截修改脚本';
  return [
    `# 功能：${summaryLine}`,
    '# 说明：该脚本由 HttpMocker AI 规则调用，根据 ctx["stage"] 在请求或响应阶段执行。',
    '# 行为：命中用户需求时直接修改 ctx 中的请求/响应字段；未命中时原样返回 ctx 透传。',
    '# 注意：注释不包含完整请求体、响应体、base64 或敏感数据。',
    '',
    text
  ].join('\n');
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';
  return text.slice(start, end + 1);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function formatPythonRuleError(rule, error) {
  const target = `${rule.host || ''}${rule.path || ''}` || 'Python rule';
  return `${target}: ${sanitizePythonError(error?.message || 'Python rule failed.')}`;
}

function sanitizePythonError(value) {
  let text = String(value || '').trim();
  if (!text) return 'Python rule failed.';
  text = text
    .replace(/[A-Za-z0-9+/=]{180,}/g, '<base64 omitted>')
    .replace(/"bodyBase64"\s*:\s*"[^"]{80,}"/g, '"bodyBase64":"<base64 omitted>"')
    .replace(/"body"\s*:\s*"[^"]{500,}"/g, '"body":"<body omitted>"')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxPythonErrorChars
    ? `${text.slice(0, maxPythonErrorChars)}...`
    : text;
}

function truncate(value) {
  const text = String(value || '');
  return text.length > maxPromptBodyChars
    ? `${text.slice(0, maxPromptBodyChars)}\n...<truncated>`
    : text;
}
