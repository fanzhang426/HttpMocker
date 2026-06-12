import fs from 'node:fs/promises';
import { captureCompactIntervalForLimit, config, normalizeMaxRecentRequests } from './config.js';

let captureUpdateQueue = Promise.resolve();
let appendSinceCompact = 0;
let activeMaxRecentRequests = config.maxRecentRequests;

export function setCaptureStoreMaxRecentRequests(value) {
  activeMaxRecentRequests = normalizeMaxRecentRequests(value);
}

export async function readCaptures() {
  await ensureCaptureStore();
  const raw = await readCaptureFile();
  return parseCaptureLines(raw);
}

export async function findCapture(id) {
  await ensureCaptureStore();
  const raw = await readCaptureFile();
  const lines = String(raw || '').split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const text = lines[index].trim();
    if (!text || !text.includes(id)) continue;
    try {
      const capture = JSON.parse(text);
      if (capture && typeof capture === 'object' && !Array.isArray(capture) && capture.id === id) {
        return capture;
      }
    } catch {
      // Keep scanning; a malformed history line should not block preview loading.
    }
  }
  return null;
}

export async function addCapture(capture) {
  return enqueueCaptureUpdate(async () => {
    await ensureCaptureStore();
    await fs.appendFile(config.capturesPath, `${JSON.stringify(capture)}\n`, 'utf8');
    appendSinceCompact += 1;
    if (appendSinceCompact >= captureCompactIntervalForLimit(activeMaxRecentRequests)) {
      return compactCaptures();
    }
    return {
      removed: 0,
      remaining: null,
      captures: null
    };
  });
}

export async function deleteCaptureGroup(predicate) {
  return updateCaptures((captures) => {
    const target = captures.find((capture) => predicate(capture, null));
    if (!target) return captures;
    return captures.filter((capture) => !predicate(capture, target));
  });
}

export async function keepLatestCapturePerGroup(groupKey) {
  return updateCaptures((captures) => {
    const keptKeys = new Set();
    const nextCaptures = [];
    for (const capture of captures) {
      const key = groupKey(capture, nextCaptures);
      if (keptKeys.has(key)) continue;
      keptKeys.add(key);
      nextCaptures.push(capture);
    }
    return nextCaptures;
  });
}

export async function clearCaptures() {
  return writeCaptures([]);
}

export async function writeCaptures(captures = []) {
  await ensureCaptureStore();
  const normalized = normalizeCaptureList(captures);
  const body = [...normalized].reverse().map((capture) => JSON.stringify(capture)).join('\n');
  const content = body ? `${body}\n` : '';
  const tmp = `${config.capturesPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, config.capturesPath);
  return normalized;
}

async function updateCaptures(mutator) {
  return enqueueCaptureUpdate(async () => {
    const captures = await readCaptures();
    const nextCaptures = normalizeCaptureList(await mutator(captures));
    await writeCaptures(nextCaptures);
    return {
      removed: Math.max(0, captures.length - nextCaptures.length),
      remaining: nextCaptures.length,
      captures: nextCaptures
    };
  });
}

function enqueueCaptureUpdate(run) {
  const next = captureUpdateQueue.then(run, run);
  captureUpdateQueue = next.catch(() => {});
  return next;
}

async function compactCaptures() {
  appendSinceCompact = 0;
  const captures = await readCaptures();
  await writeCaptures(captures);
  return {
    removed: 0,
    remaining: captures.length,
    captures
  };
}

async function ensureCaptureStore() {
  await fs.mkdir(config.dataDir, { recursive: true });
  try {
    await fs.access(config.capturesPath);
  } catch {
    await fs.writeFile(config.capturesPath, '', 'utf8');
  }
}

async function readCaptureFile() {
  try {
    return await fs.readFile(config.capturesPath, 'utf8');
  } catch {
    return '';
  }
}

function parseCaptureLines(raw) {
  const captures = [];
  for (const line of String(raw || '').split('\n')) {
    const text = line.trim();
    if (!text) continue;
    try {
      const capture = JSON.parse(text);
      if (capture && typeof capture === 'object' && !Array.isArray(capture) && capture.id) {
        captures.push(capture);
      }
    } catch {
      // Ignore a malformed history line instead of dropping the full history file.
    }
  }
  const seenIds = new Set();
  const fullCaptures = [];
  const summaryCaptures = [];
  for (let index = captures.length - 1; index >= 0; index -= 1) {
    const capture = captures[index];
    if (seenIds.has(capture.id)) continue;
    seenIds.add(capture.id);
    if (capture.summaryOnly === true) {
      summaryCaptures.push(capture);
    } else {
      fullCaptures.push(capture);
    }
  }
  return normalizeCaptureList([...fullCaptures, ...summaryCaptures]);
}

function normalizeCaptureList(captures = [], maxRecentRequests = activeMaxRecentRequests) {
  if (!Array.isArray(captures)) return [];
  const normalized = captures.filter((capture) => capture && typeof capture === 'object' && !Array.isArray(capture) && capture.id);
  const limit = normalizeMaxRecentRequests(maxRecentRequests);
  if (normalized.length <= limit) return normalized;
  const fullCaptures = normalized.filter((capture) => capture.summaryOnly !== true);
  const summaryCaptures = normalized.filter((capture) => capture.summaryOnly === true);
  return [...fullCaptures, ...summaryCaptures].slice(0, limit);
}
