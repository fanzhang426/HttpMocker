import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.LOCAL_DATA_DIR || path.join(rootDir, 'data'));
export const captureHistoryLimits = Object.freeze({
  min: 50,
  max: 5000,
  defaultValue: 500
});

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function normalizeMaxRecentRequests(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return captureHistoryLimits.defaultValue;
  return Math.min(captureHistoryLimits.max, Math.max(captureHistoryLimits.min, number));
}

export function captureCompactIntervalForLimit(maxRecentRequests) {
  return Math.max(10, Math.floor(normalizeMaxRecentRequests(maxRecentRequests) / 10));
}

export const config = {
  rootDir,
  dataDir,
  localsDir: path.join(dataDir, 'locals'),
  certsDir: path.join(dataDir, 'certs'),
  statePath: path.join(dataDir, 'state.json'),
  capturesPath: path.join(dataDir, 'captures.jsonl'),
  host: process.env.LOCAL_HOST || '0.0.0.0',
  proxyPort: Number(process.env.LOCAL_PROXY_PORT || 8899),
  uiPort: Number(process.env.LOCAL_UI_PORT || 8898),
  maxBodyBytes: positiveNumber(process.env.LOCAL_MAX_BODY_BYTES, 5 * 1024 * 1024),
  maxCaptureBodyBytes: positiveNumber(process.env.LOCAL_MAX_CAPTURE_BODY_BYTES, 512 * 1024),
  maxRecentRequests: normalizeMaxRecentRequests(process.env.LOCAL_MAX_RECENT_REQUESTS)
};
