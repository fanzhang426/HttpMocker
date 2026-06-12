import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let cachedAdbExecutable;

export async function listAdbDevices() {
  const { stdout } = await execAdb(['devices', '-l']);
  const devices = stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseAdbDeviceLine)
    .filter(Boolean);
  return Promise.all(devices.map(enrichAdbDeviceName));
}

export function selectAdbDevice(devices, requestedId) {
  const available = devices.filter((device) => device.available);
  if (requestedId) {
    return {
      device: available.find((device) => device.id === requestedId) || null,
      needsSelection: false
    };
  }
  if (available.length === 1) {
    return { device: available[0], needsSelection: false };
  }
  return { device: null, needsSelection: available.length > 1 };
}

export async function readAdbHttpProxy(deviceId) {
  const { stdout } = await adbShell(deviceId, ['settings', 'get', 'global', 'http_proxy']);
  const value = stdout.trim();
  return value === 'null' ? '' : value;
}

export async function setAdbHttpProxy(deviceId, proxyValue) {
  await adbShell(deviceId, ['settings', 'put', 'global', 'http_proxy', proxyValue]);
}

export async function setAdbCaptivePortalUrls(deviceId, url) {
  const keys = captivePortalSettingKeys();
  await Promise.all(keys.map((key) => (
    adbShell(deviceId, ['settings', 'put', 'global', key, url])
  )));
}

export async function clearAdbCaptivePortalUrls(deviceId) {
  const keys = captivePortalSettingKeys();
  await Promise.all(keys.map((key) => (
    adbShell(deviceId, ['settings', 'delete', 'global', key]).catch(() => {})
  )));
}

export async function clearAdbHttpProxy(deviceId) {
  await adbShell(deviceId, ['settings', 'put', 'global', 'http_proxy', ':0']);
  await adbShell(deviceId, ['settings', 'delete', 'global', 'global_http_proxy_host'])
    .catch(() => {});
  await adbShell(deviceId, ['settings', 'delete', 'global', 'global_http_proxy_port'])
    .catch(() => {});
}

export async function clearAllAdbHttpProxies() {
  const devices = await listAdbDevices().catch(() => []);
  const available = devices.filter((device) => device.available);
  const results = await Promise.allSettled(available.map((device) => clearAdbHttpProxy(device.id)));
  return {
    total: available.length,
    cleared: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length
  };
}

function captivePortalSettingKeys() {
  return [
    'captive_portal_http_url',
    'captive_portal_https_url',
    'captive_portal_fallback_url',
    'captive_portal_other_fallback_urls'
  ];
}

export function adbShell(deviceId, shellArgs) {
  return execAdb(['-s', deviceId, 'shell', ...shellArgs]);
}

export function execAdb(args) {
  return new Promise((resolve, reject) => {
    execFile(adbExecutable(), args, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr || error.message || 'adb command failed.';
        reject(new Error(message.trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function adbExecutable() {
  if (cachedAdbExecutable) return cachedAdbExecutable;

  const candidates = unique([
    process.env.ADB_PATH,
    process.env.ADB,
    process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb') : '',
    process.env.ANDROID_SDK_ROOT ? path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb') : '',
    process.env.HOME ? path.join(process.env.HOME, 'Library', 'Android', 'sdk', 'platform-tools', 'adb') : '',
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
    ...String(process.env.PATH || '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((entry) => path.join(entry, 'adb'))
  ]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedAdbExecutable = candidate;
      return cachedAdbExecutable;
    } catch {
      // Try the next known adb location.
    }
  }

  cachedAdbExecutable = 'adb';
  return cachedAdbExecutable;
}

function parseAdbDeviceLine(line) {
  if (line.startsWith('List of devices attached')) return null;
  const [id, state, ...detailParts] = line.split(/\s+/);
  if (!id || !state) return null;
  const details = parseAdbDeviceDetails(detailParts);
  const model = humanizeAdbValue(details.model);
  const product = humanizeAdbValue(details.product);
  const deviceName = humanizeAdbValue(details.device);
  const displayName = buildAdbDisplayName({ model, product, deviceName });
  return {
    id,
    state,
    available: state === 'device',
    label: detailParts.join(' ') || id,
    model,
    product,
    deviceName,
    displayName
  };
}

async function enrichAdbDeviceName(device) {
  if (!device.available) return device;
  try {
    const identity = await readAdbDeviceIdentity(device.id);
    const manufacturer = humanizeAdbValue(identity.manufacturer);
    const brand = humanizeAdbValue(identity.brand);
    const model = humanizeAdbValue(identity.model) || device.model;
    const displayName = buildAdbDisplayName({
      manufacturer,
      brand,
      model,
      product: device.product,
      deviceName: device.deviceName,
      fallback: device.id
    });
    return {
      ...device,
      manufacturer,
      brand,
      model,
      displayName
    };
  } catch {
    return device;
  }
}

async function readAdbDeviceIdentity(deviceId) {
  const [manufacturer, brand, model] = await Promise.all([
    readAdbProp(deviceId, 'ro.product.manufacturer'),
    readAdbProp(deviceId, 'ro.product.brand'),
    readAdbProp(deviceId, 'ro.product.model')
  ]);
  return { manufacturer, brand, model };
}

async function readAdbProp(deviceId, name) {
  const { stdout } = await adbShell(deviceId, ['getprop', name]);
  return stdout.trim();
}

function buildAdbDisplayName({ manufacturer, brand, model, product, deviceName, fallback }) {
  const primary = model || product || deviceName || fallback || '';
  const maker = manufacturer || brand || '';
  if (!maker || !primary) return primary || maker;
  if (primary.toLowerCase().startsWith(`${maker.toLowerCase()} `)) return primary;
  if (primary.toLowerCase() === maker.toLowerCase()) return primary;
  return `${maker} ${primary}`;
}

function parseAdbDeviceDetails(detailParts) {
  const details = {};
  for (const part of detailParts) {
    const index = part.indexOf(':');
    if (index <= 0) continue;
    details[part.slice(0, index)] = part.slice(index + 1);
  }
  return details;
}

function humanizeAdbValue(value) {
  return value ? String(value).replaceAll('_', ' ') : '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
