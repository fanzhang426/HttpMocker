import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const defaultRepo = 'fanzhang426/HttpMocker';
const updateRepo = String(process.env.LOCAL_UPDATE_REPO || defaultRepo).trim();
const updateCheckTimeoutMs = positiveNumber(process.env.LOCAL_UPDATE_CHECK_TIMEOUT_MS, 5000);

let currentVersionCache = '';
let updateCache = {
  checkedAt: 0,
  available: false,
  currentVersion: '',
  latestVersion: '',
  releaseUrl: '',
  assetUrl: '',
  releaseName: '',
  publishedAt: '',
  error: ''
};
let updateCheckPromise;

export async function getUpdateInfo(options = {}) {
  const force = options.force === true;
  if (!force && updateCache.checkedAt) {
    return { ...updateCache };
  }
  if (!updateCheckPromise) {
    updateCheckPromise = checkLatestRelease()
      .finally(() => {
        updateCheckPromise = null;
      });
  }
  return updateCheckPromise;
}

async function checkLatestRelease() {
  const currentVersion = await currentAppVersion();
  const base = {
    checkedAt: Date.now(),
    available: false,
    currentVersion,
    latestVersion: '',
    releaseUrl: '',
    assetUrl: '',
    releaseName: '',
    publishedAt: '',
    error: ''
  };

  if (!updateRepo || !/^[\w.-]+\/[\w.-]+$/.test(updateRepo)) {
    updateCache = { ...base, error: 'Invalid update repository.' };
    return { ...updateCache };
  }

  try {
    const release = await fetchLatestRelease(updateRepo);
    const latestVersion = normalizeVersion(release.tag_name || release.name || '');
    const releaseUrl = String(release.html_url || '');
    const assetUrl = preferredAssetUrl(release.assets || []);
    updateCache = {
      ...base,
      available: compareVersions(latestVersion, currentVersion) > 0,
      latestVersion,
      releaseUrl,
      assetUrl,
      releaseName: String(release.name || release.tag_name || latestVersion),
      publishedAt: String(release.published_at || '')
    };
  } catch (error) {
    updateCache = { ...base, error: error.message || String(error) };
  }
  return { ...updateCache };
}

async function fetchLatestRelease(repo) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), updateCheckTimeoutMs);
  try {
    const headers = {
      accept: 'application/vnd.github+json',
      'user-agent': `HttpMocker/${await currentAppVersion()}`
    };
    const token = githubToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: controller.signal
    });
    if (response.status === 404) {
      return fetchLatestReleaseFromRedirect(repo);
    }
    if (response.status === 403 || response.status === 429) {
      return fetchLatestReleaseFromRedirect(repo);
    }
    if (!response.ok) {
      throw new Error(`GitHub update check failed: HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLatestReleaseFromRedirect(repo) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), updateCheckTimeoutMs);
  try {
    const response = await fetch(`https://github.com/${repo}/releases/latest`, {
      headers: {
        'user-agent': `HttpMocker/${await currentAppVersion()}`
      },
      signal: controller.signal
    });
    const finalUrl = response.url || '';
    const match = finalUrl.match(/\/releases\/tag\/([^/?#]+)/);
    if (!match || !response.ok) {
      throw new Error('No GitHub release found.');
    }
    const tagName = decodeURIComponent(match[1]);
    return {
      tag_name: tagName,
      name: tagName,
      html_url: finalUrl,
      assets: [],
      published_at: ''
    };
  } finally {
    clearTimeout(timer);
  }
}

function githubToken() {
  return String(process.env.LOCAL_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '').trim();
}

async function currentAppVersion() {
  if (currentVersionCache) return currentVersionCache;
  try {
    const raw = await fs.readFile(path.join(config.rootDir, 'package.json'), 'utf8');
    currentVersionCache = normalizeVersion(JSON.parse(raw).version || '');
  } catch {
    currentVersionCache = '0.0.0';
  }
  return currentVersionCache;
}

function preferredAssetUrl(assets = []) {
  const normalized = Array.isArray(assets) ? assets : [];
  const preferred = normalized.find((asset) => /\.dmg$/i.test(asset?.name || '')) ||
    normalized.find((asset) => /\.zip$/i.test(asset?.name || '')) ||
    normalized[0];
  return String(preferred?.browser_download_url || '');
}

function normalizeVersion(value) {
  const text = String(value || '').trim().replace(/^v/i, '');
  const match = text.match(/\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?/);
  return match ? match[0] : '0.0.0';
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function versionParts(value) {
  return normalizeVersion(value).split(/[.-]/).slice(0, 3).map((part) => {
    const number = Number(part);
    return Number.isFinite(number) ? number : 0;
  });
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
