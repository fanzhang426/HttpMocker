import fs from 'node:fs/promises';
import path from 'node:path';
import {
  clearAdbCaptivePortalUrls,
  clearAdbHttpProxy,
  listAdbDevices,
  readAdbHttpProxy,
  setAdbCaptivePortalUrls,
  setAdbHttpProxy
} from './adb-utils.js';
import { config } from './config.js';
import { getLanIps } from './urls.js';

const sessionPath = path.join(config.dataDir, 'adb-proxy-session.json');

export async function rememberManagedAdbProxy(device, proxyValue, captivePortalUrl) {
  if (!device?.id || !proxyValue) return;
  const session = await readSavedAdbProxySession();
  const devices = Array.isArray(session?.devices) ? session.devices : [];
  const nextDevice = {
    id: device.id,
    displayName: device.displayName || device.model || device.id,
    proxy: proxyValue,
    captivePortalUrl
  };
  const nextDevices = [
    ...devices.filter((item) => item?.id !== device.id),
    nextDevice
  ];
  await writeSavedAdbProxySession({
    reason: session?.reason || 'active',
    savedAt: session?.savedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    devices: nextDevices
  });
}

export async function pauseManagedAdbProxies(reason = 'pause') {
  const expected = expectedAdbProxy();
  if (!expected.proxyValue) {
    await removeSavedAdbProxySession();
    return { total: 0, paused: 0, failed: 0 };
  }

  const session = await readSavedAdbProxySession();
  const remembered = Array.isArray(session?.devices) ? session.devices : [];
  const rememberedIds = new Set(remembered.map((device) => device?.id).filter(Boolean));
  const managed = [...remembered];

  const devices = await listAdbDevices().catch(() => []);
  const available = devices.filter((device) => device.available);
  for (const device of available) {
    if (rememberedIds.has(device.id)) continue;
    const proxy = await readAdbHttpProxy(device.id).catch(() => '');
    if (proxy !== expected.proxyValue) continue;
    managed.push({
      id: device.id,
      displayName: device.displayName || device.model || device.id,
      proxy,
      captivePortalUrl: expected.captivePortalUrl
    });
  }

  if (!managed.length) {
    await removeSavedAdbProxySession();
    return { total: 0, paused: 0, failed: 0 };
  }

  await writeSavedAdbProxySession({
    reason,
    savedAt: new Date().toISOString(),
    devices: managed
  });

  const availableIds = new Set(available.map((device) => device.id));
  const availableManaged = managed.filter((device) => availableIds.has(device.id));
  const results = await Promise.allSettled(availableManaged.map(async (device) => {
    await clearAdbHttpProxy(device.id);
    await clearAdbCaptivePortalUrls(device.id);
  }));

  return {
    total: managed.length,
    paused: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length + (managed.length - availableManaged.length)
  };
}

export async function restoreManagedAdbProxies() {
  const session = await readSavedAdbProxySession();
  const devicesToRestore = Array.isArray(session?.devices) ? session.devices : [];
  if (!devicesToRestore.length) return { total: 0, restored: 0, failed: 0 };

  const expected = expectedAdbProxy();
  if (!expected.proxyValue) return { total: devicesToRestore.length, restored: 0, failed: devicesToRestore.length };

  const connected = await listAdbDevices().catch(() => []);
  const availableIds = new Set(connected.filter((device) => device.available).map((device) => device.id));
  const availableSaved = devicesToRestore.filter((device) => availableIds.has(device.id));

  const results = await Promise.allSettled(availableSaved.map(async (device) => {
    await setAdbHttpProxy(device.id, expected.proxyValue);
    await setAdbCaptivePortalUrls(device.id, expected.captivePortalUrl);
  }));
  const failed = results.filter((result) => result.status === 'rejected').length;
  const restored = results.filter((result) => result.status === 'fulfilled').length;

  return {
    total: devicesToRestore.length,
    restored,
    failed: failed + (devicesToRestore.length - availableSaved.length)
  };
}

export async function removeSavedAdbProxySession() {
  await fs.unlink(sessionPath).catch(() => {});
}

function expectedAdbProxy() {
  const ip = getLanIps()[0] || '';
  return {
    ip,
    proxyValue: ip ? `${ip}:${config.proxyPort}` : '',
    captivePortalUrl: ip ? `http://${ip}:${config.uiPort}/generate_204` : ''
  };
}

async function readSavedAdbProxySession() {
  try {
    return JSON.parse(await fs.readFile(sessionPath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeSavedAdbProxySession(session) {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
}
