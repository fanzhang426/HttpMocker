import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const dayMs = 24 * 60 * 60 * 1000;
const aiTerminalPromptDir = path.join(config.dataDir, 'ai-terminal-prompts');
const aiTerminalPromptMaxAgeMs = positiveNumber(process.env.LOCAL_AI_TERMINAL_PROMPT_MAX_AGE_DAYS, 7) * dayMs;
const aiTerminalPromptMaxFiles = clampInteger(process.env.LOCAL_AI_TERMINAL_PROMPT_MAX_FILES, 50, 10, 500);
const staleTempMaxAgeMs = positiveNumber(process.env.LOCAL_STALE_TEMP_MAX_AGE_HOURS, 24) * 60 * 60 * 1000;

export async function cleanupRuntimeCaches() {
  const results = await Promise.allSettled([
    cleanupAiTerminalPrompts(),
    cleanupStaleAtomicTempFiles()
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('HttpMocker cache cleanup failed:', result.reason?.message || result.reason);
    }
  }
}

export async function cleanupAiTerminalPrompts(options = {}) {
  const keepPath = options.keepPath ? path.resolve(options.keepPath) : '';
  const entries = await readDirectory(aiTerminalPromptDir);
  if (!entries.length) return { deleted: 0 };

  const now = Date.now();
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^ask-ai-\d+-[a-f0-9]+\.md$/i.test(entry.name)) continue;
    const filePath = path.join(aiTerminalPromptDir, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) continue;
    files.push({ path: filePath, mtimeMs: stat.mtimeMs });
  }

  const toDelete = new Set();
  for (const file of files) {
    if (path.resolve(file.path) !== keepPath && now - file.mtimeMs > aiTerminalPromptMaxAgeMs) {
      toDelete.add(file.path);
    }
  }

  const newestFirst = [...files].sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const file of newestFirst.slice(aiTerminalPromptMaxFiles)) {
    if (path.resolve(file.path) !== keepPath) toDelete.add(file.path);
  }

  return deleteFiles([...toDelete]);
}

async function cleanupStaleAtomicTempFiles() {
  const entries = await readDirectory(config.dataDir);
  if (!entries.length) return { deleted: 0 };

  const now = Date.now();
  const stale = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.\d+\.\d+\.[a-f0-9]+\.tmp$/i.test(entry.name)) continue;
    const filePath = path.join(config.dataDir, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && now - stat.mtimeMs > staleTempMaxAgeMs) stale.push(filePath);
  }
  return deleteFiles(stale);
}

async function readDirectory(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function deleteFiles(files) {
  let deleted = 0;
  await Promise.all(files.map(async (filePath) => {
    await fs.rm(filePath, { force: true });
    deleted += 1;
  }));
  return { deleted };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clampInteger(value, fallback, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
