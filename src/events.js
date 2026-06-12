const clients = new Set();
let nextEventId = 1;

export function addEventClient(res, initialPayload = {}) {
  clients.add(res);
  sendToClient(res, 'connected', {
    ok: true,
    ...initialPayload
  });
  return () => {
    clients.delete(res);
  };
}

export function emitEvent(type, payload = {}) {
  const message = {
    type,
    ...payload
  };
  for (const res of clients) {
    sendToClient(res, type, message);
  }
}

export function emitCapturesChanged(payload = {}) {
  emitEvent('capturesChanged', payload);
}

export function emitRulesChanged(payload = {}) {
  emitEvent('rulesChanged', payload);
}

export function emitSettingsChanged(payload = {}) {
  emitEvent('settingsChanged', payload);
}

export function emitCodexQueueChanged(payload = {}) {
  emitEvent('codexQueueChanged', payload);
}

function sendToClient(res, event, payload) {
  try {
    res.write(`id: ${nextEventId++}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    clients.delete(res);
  }
}
