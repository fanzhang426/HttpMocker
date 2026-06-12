import os from 'node:os';

export function getLanIps() {
  const ips = [];
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        ips.push(address.address);
      }
    }
  }

  return ips;
}

export function getLanUrls(port) {
  return getLanIps().map((ip) => `http://${ip}:${port}`);
}
