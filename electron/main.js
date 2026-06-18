import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, Menu, nativeTheme, powerMonitor, shell } from 'electron';

app.commandLine.appendSwitch('use-mock-keychain');
app.disableHardwareAcceleration();

let startingUi = false;
let startingProxy = false;
let runtimeApi;
let runtimeLoadError;
let uiStartError;
let recordingEnabled = true;
let didOpenPanelOnColdStart = false;
let shouldOpenPanelAfterReady = false;
let isQuitting = false;
let destroyingPanelForQuit = false;
let stopRuntimePromise;
let splashWindow;
let panelWindow;
let splashShownAt = 0;
let splashReadyPromise;
let resolveSplashReady;
let splashAutoCloseTimer;
let splashAutoCloseToken = 0;
let settingsWindow;
const editMenuStateByWebContents = new Map();
const editMenuRefreshTimers = new Map();
const defaultEditMenuState = Object.freeze({
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: false,
  canSelectAll: false
});

const appName = 'HttpMocker';
const oldAppName = 'EasyHttpMock';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.setName(appName);

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.exit(0);
} else {
  app.on('second-instance', requestOpenPanelFromExternalLaunch);
  app.on('activate', requestOpenPanelFromExternalLaunch);
  app.whenReady().then(bootstrapApp);
}

async function bootstrapApp() {
  setupApplicationMenu();
  createSplashWindow();
  const dataDir = await ensureUserDataMigrated();
  process.env.LOCAL_DATA_DIR = dataDir;
  nativeTheme.on('updated', () => {
    refreshWindowBackgrounds();
  });

  try {
    runtimeApi = await import('../src/runtime.js');
    runtimeLoadError = null;
    await refreshSavedSettingsState();
    await startUiService();
    await startProxyService();
    setupPowerMonitorHandlers();
    await restorePausedDeviceProxies();
    const readyStatus = await waitForPanelReady();
    if (!readyStatus.panelReady) {
      throw new Error('UI 面板依赖接口尚未就绪，请稍后重新打开。');
    }
    await openPanelOnColdStart();
    await closeSplashWindow();
  } catch (error) {
    if (!runtimeApi) {
      runtimeLoadError = error;
    } else {
      uiStartError = error;
    }
    console.error(error);
  } finally {
    await closeSplashWindow();
    await openPanelIfRequested();
  }
}

function setupApplicationMenu() {
  const editSubmenu = Menu.buildFromTemplate([
    {
      id: 'edit-undo',
      label: 'Undo',
      accelerator: 'CommandOrControl+Z',
      enabled: false,
      click: (_menuItem, browserWindow) => browserWindow?.webContents.undo()
    },
    {
      id: 'edit-redo',
      label: 'Redo',
      accelerator: 'Shift+CommandOrControl+Z',
      enabled: false,
      click: (_menuItem, browserWindow) => browserWindow?.webContents.redo()
    },
    { type: 'separator' },
    {
      id: 'edit-cut',
      label: 'Cut',
      accelerator: 'CommandOrControl+X',
      enabled: false,
      click: (_menuItem, browserWindow) => browserWindow?.webContents.cut()
    },
    {
      id: 'edit-copy',
      label: 'Copy',
      accelerator: 'CommandOrControl+C',
      enabled: false,
      click: (_menuItem, browserWindow) => browserWindow?.webContents.copy()
    },
    {
      id: 'edit-paste',
      label: 'Paste',
      accelerator: 'CommandOrControl+V',
      enabled: false,
      click: (_menuItem, browserWindow) => browserWindow?.webContents.paste()
    },
    {
      id: 'edit-select-all',
      label: 'Select All',
      accelerator: 'CommandOrControl+A',
      enabled: false,
      click: (_menuItem, browserWindow) => browserWindow?.webContents.selectAll()
    }
  ]);
  editSubmenu.on('menu-will-show', updateEditMenuItemsForFocusedWindow);

  const applicationMenu = Menu.buildFromTemplate([
    {
      label: appName,
      submenu: [
        {
          label: `关于${appName}`,
          click: () => {
            showSplashWindowForDuration(3000, { loading: false }).catch((error) => {
              console.error(error);
            });
          }
        },
        {
          label: '检查更新',
          click: () => {
            checkForUpdatesFromMenu().catch((error) => {
              console.error(error);
              showError(error);
            });
          }
        },
        {
          label: '设置',
          accelerator: 'Command+,',
          click: openSettingsPanel
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Command+Q',
          click: quitApp
        }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: '打开域名',
          accelerator: 'Command+N',
          click: openAddDomainPanel
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: editSubmenu
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]);
  Menu.setApplicationMenu(applicationMenu);
  updateEditMenuItems(defaultEditMenuState);
}

function normalizeEditMenuState(state = {}) {
  return {
    canUndo: Boolean(state?.canUndo),
    canRedo: Boolean(state?.canRedo),
    canCut: Boolean(state?.canCut),
    canCopy: Boolean(state?.canCopy),
    canPaste: Boolean(state?.canPaste),
    canSelectAll: Boolean(state?.canSelectAll)
  };
}

function updateEditMenuItemsForFocusedWindow() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const state = focusedWindow && !focusedWindow.webContents.isDestroyed()
    ? editMenuStateByWebContents.get(focusedWindow.webContents.id) || defaultEditMenuState
    : defaultEditMenuState;
  updateEditMenuItems(state);
  if (focusedWindow) scheduleEditMenuStateRefresh(focusedWindow);
}

function updateEditMenuItems(state = defaultEditMenuState) {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const normalized = normalizeEditMenuState(state);
  const entries = [
    ['edit-undo', normalized.canUndo],
    ['edit-redo', normalized.canRedo],
    ['edit-cut', normalized.canCut],
    ['edit-copy', normalized.canCopy],
    ['edit-paste', normalized.canPaste],
    ['edit-select-all', normalized.canSelectAll]
  ];
  for (const [id, enabled] of entries) {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = enabled;
  }
}

function attachEditMenuTracking(browserWindow) {
  const webContents = browserWindow.webContents;
  editMenuStateByWebContents.set(webContents.id, defaultEditMenuState);
  browserWindow.on('focus', updateEditMenuItemsForFocusedWindow);
  browserWindow.on('blur', updateEditMenuItemsForFocusedWindow);
  webContents.on('focus', updateEditMenuItemsForFocusedWindow);
  webContents.on('blur', updateEditMenuItemsForFocusedWindow);
  webContents.on('did-finish-load', () => scheduleEditMenuStateRefresh(browserWindow, 80));
  webContents.on('before-input-event', (event, input) => {
    handlePanelShortcutInput(event, browserWindow, input);
    scheduleEditMenuStateRefresh(browserWindow);
  });
  webContents.on('context-menu', (_event, params) => {
    const state = normalizeEditMenuState({
      canUndo: params.editFlags?.canUndo && params.isEditable,
      canRedo: params.editFlags?.canRedo && params.isEditable,
      canCut: params.editFlags?.canCut && params.isEditable,
      canCopy: params.editFlags?.canCopy,
      canPaste: params.editFlags?.canPaste && params.isEditable,
      canSelectAll: params.editFlags?.canSelectAll && (params.isEditable || hasSelectableText(params))
    });
    editMenuStateByWebContents.set(webContents.id, state);
    if (BrowserWindow.getFocusedWindow()?.webContents.id === webContents.id) {
      updateEditMenuItems(state);
    }
  });
  webContents.on('destroyed', () => {
    editMenuStateByWebContents.delete(webContents.id);
    clearTimeout(editMenuRefreshTimers.get(webContents.id));
    editMenuRefreshTimers.delete(webContents.id);
    updateEditMenuItemsForFocusedWindow();
  });
}

function handlePanelShortcutInput(event, browserWindow, input = {}) {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  if (browserWindow !== panelWindow) return;
  if (input.type !== 'keyDown' && input.type !== 'rawKeyDown') return;
  const key = String(input.key || '').toLowerCase();
  const code = String(input.code || '').toLowerCase();
  const normalizedKey = key.replace(/[^a-z]/g, '');
  const normalizedCode = code.replace(/[^a-z0-9]/g, '');
  if (['browserback', 'browserbackward', 'back', 'goback'].includes(normalizedKey) ||
      ['browserback', 'browserbackward', 'back', 'goback'].includes(normalizedCode)) {
    event.preventDefault();
    dispatchPanelEvent('http-mocker-preview-history-back').catch((error) => {
      console.error(error);
    });
    return;
  }
  if (['browserforward', 'forward', 'goforward'].includes(normalizedKey) ||
      ['browserforward', 'forward', 'goforward'].includes(normalizedCode)) {
    event.preventDefault();
    dispatchPanelEvent('http-mocker-preview-history-forward').catch((error) => {
      console.error(error);
    });
    return;
  }
  const isCommand = Boolean(input.meta || input.control);
  if (!isCommand || input.alt || input.shift) return;
  if (key === '[' || code === 'bracketleft') {
    event.preventDefault();
    dispatchPanelEvent('http-mocker-preview-history-back').catch((error) => {
      console.error(error);
    });
    return;
  }
  if (key === ']' || code === 'bracketright') {
    event.preventDefault();
    dispatchPanelEvent('http-mocker-preview-history-forward').catch((error) => {
      console.error(error);
    });
    return;
  }
  if (key === 'w' || code === 'keyw') {
    event.preventDefault();
    dispatchPanelEvent('http-mocker-close-active-tab').catch((error) => {
      console.error(error);
    });
  }
}

function scheduleEditMenuStateRefresh(browserWindow, delayMs = 20) {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  const webContents = browserWindow.webContents;
  if (!webContents || webContents.isDestroyed()) return;
  clearTimeout(editMenuRefreshTimers.get(webContents.id));
  const timer = setTimeout(() => {
    editMenuRefreshTimers.delete(webContents.id);
    refreshEditMenuState(browserWindow);
  }, delayMs);
  editMenuRefreshTimers.set(webContents.id, timer);
}

function refreshEditMenuState(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  const webContents = browserWindow.webContents;
  if (!webContents || webContents.isDestroyed() || webContents.isLoadingMainFrame()) return;
  webContents.executeJavaScript(pageEditMenuStateScript(), false)
    .then((state) => {
      const normalized = normalizeEditMenuState(state);
      editMenuStateByWebContents.set(webContents.id, normalized);
      if (BrowserWindow.getFocusedWindow()?.webContents.id === webContents.id) {
        updateEditMenuItems(normalized);
      }
    })
    .catch(() => {
      editMenuStateByWebContents.set(webContents.id, defaultEditMenuState);
      if (BrowserWindow.getFocusedWindow()?.webContents.id === webContents.id) {
        updateEditMenuItems(defaultEditMenuState);
      }
    });
}

function hasSelectableText(params = {}) {
  return Boolean(String(params.selectionText || '').trim() || String(params.linkText || '').trim());
}

function pageEditMenuStateScript() {
  return `
    (() => {
      const active = document.activeElement;
      const isTextEntry = (element) => {
        if (!element || element === document.body) return false;
        const tag = element.tagName && element.tagName.toLowerCase();
        return tag === 'textarea' || tag === 'input' || element.isContentEditable;
      };
      const isEditable = (element) => {
        if (!isTextEntry(element)) return false;
        if (element.disabled || element.readOnly) return false;
        if (element.isContentEditable) return true;
        const tag = element.tagName && element.tagName.toLowerCase();
        if (tag === 'textarea') return true;
        if (tag !== 'input') return false;
        const type = String(element.type || 'text').toLowerCase();
        return ![
          'button',
          'checkbox',
          'color',
          'file',
          'hidden',
          'image',
          'radio',
          'range',
          'reset',
          'submit'
        ].includes(type);
      };
      const selectedText = (element) => {
        if (
          isTextEntry(element) &&
          typeof element.selectionStart === 'number' &&
          typeof element.selectionEnd === 'number' &&
          element.selectionEnd > element.selectionStart
        ) {
          return String(element.value || '').slice(element.selectionStart, element.selectionEnd);
        }
        return String(window.getSelection && window.getSelection().toString() || '');
      };
      const textValue = (element) => {
        if (!element) return '';
        if (typeof element.value === 'string') return element.value;
        return String(element.textContent || '');
      };
      const editable = isEditable(active);
      const selection = selectedText(active);
      const hasSelection = selection.length > 0;
      const hasValue = editable && textValue(active).length > 0;
      return {
        canUndo: editable,
        canRedo: editable,
        canCut: editable && hasSelection,
        canCopy: hasSelection,
        canPaste: editable,
        canSelectAll: editable ? hasValue : hasSelection
      };
    })()
  `;
}

app.on('window-all-closed', () => {
  if (!didOpenPanelOnColdStart || isQuitting) return;
  quitApp();
});

app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  quitApp();
});

async function startUiService() {
  if (!runtimeApi) {
    await showError(runtimeLoadError || new Error('服务仍在初始化，请稍后再试。'));
    return;
  }
  if (startingUi || getRuntimeStatus().uiRunning) return;
  startingUi = true;
  try {
    await runtimeApi.startRuntime({
      proxy: false,
      selectProjectDirectory,
      applyNativeAppearance
    });
    uiStartError = null;
  } catch (error) {
    uiStartError = error;
    console.error(error);
    await showError(error);
  } finally {
    startingUi = false;
  }
}

async function startProxyService() {
  if (!runtimeApi) {
    await showError(runtimeLoadError || new Error('服务仍在初始化，请稍后再试。'));
    return;
  }
  if (startingProxy || getRuntimeStatus().proxyRunning) return;
  startingProxy = true;
  try {
    await runtimeApi.startProxyRuntime();
  } catch (error) {
    console.error(error);
    await showError(error);
  } finally {
    startingProxy = false;
  }
}

async function stopProxyService() {
  await runtimeApi?.stopProxyRuntime?.();
}

async function startRecording() {
  if (!getRuntimeStatus().proxyRunning) {
    await startProxyService();
  }
  await setRecordingEnabled(true);
}

async function stopRecording() {
  await setRecordingEnabled(false);
}

async function setRecordingEnabled(enabled) {
  try {
    const { updateState } = await import('../src/fs-store.js');
    await updateState((state) => {
      state.settings = {
        ...state.settings,
        recordingEnabled: Boolean(enabled)
      };
    });
    recordingEnabled = Boolean(enabled);
  } catch (error) {
    console.error(error);
    await showError(error);
  }
}

async function openPanel() {
  if (!getRuntimeStatus().uiRunning) {
    await startUiService();
  }
  const status = await waitForPanelReady();
  if (status?.panelReady) {
    showPanelWindow(panelOpenUrl(status.uiUrl));
    return;
  }
  await showError(uiStartError || new Error('UI 服务尚未就绪，请稍后再试。'));
}

async function openSettingsPanel() {
  if (!getRuntimeStatus().uiRunning) {
    await startUiService();
  }
  const status = await waitForPanelReady();
  if (!status?.panelReady) {
    await showError(uiStartError || new Error('UI 服务尚未就绪，请稍后再试。'));
    return;
  }
  showSettingsWindow(settingsOpenUrl(status.uiUrl));
}

async function openAddDomainPanel() {
  await openPanel();
  await dispatchPanelEvent('http-mocker-add-domain');
}

async function checkForUpdatesFromMenu() {
  await openPanel();
  await dispatchPanelEvent('http-mocker-check-update');
}

async function dispatchPanelEvent(eventName) {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const webContents = panelWindow.webContents;
  if (webContents.isLoadingMainFrame()) {
    await new Promise((resolve) => {
      webContents.once('did-finish-load', resolve);
    });
  }
  if (!panelWindow || panelWindow.isDestroyed()) return;
  webContents.executeJavaScript(`window.dispatchEvent(new Event(${JSON.stringify(eventName)}))`).catch((error) => {
    console.error(error);
  });
}

function panelOpenUrl(uiUrl) {
  const url = new URL(uiUrl || getRuntimeStatus().uiUrl);
  url.searchParams.set('open', String(Date.now()));
  return url.toString();
}

function settingsOpenUrl(uiUrl) {
  const url = new URL(uiUrl || getRuntimeStatus().uiUrl);
  url.searchParams.set('settings', '1');
  url.searchParams.set('open', String(Date.now()));
  return url.toString();
}

function showSettingsWindow(url = settingsOpenUrl()) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 620,
    height: 420,
    minWidth: 620,
    minHeight: 420,
    maxWidth: 620,
    maxHeight: 420,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '设置',
    backgroundColor: panelBackgroundColor(),
    parent: panelWindow && !panelWindow.isDestroyed() ? panelWindow : undefined,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  attachEditMenuTracking(settingsWindow);
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    openExternalUrl(targetUrl);
    return { action: 'deny' };
  });
  settingsWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const target = new URL(targetUrl);
    const panel = new URL(getRuntimeStatus().uiUrl || url);
    if (target.origin === panel.origin && target.pathname === '/_electron/quit') {
      event.preventDefault();
      settingsWindow?.close();
      return;
    }
    if (target.origin !== panel.origin) {
      event.preventDefault();
      shell.openExternal(target.toString()).catch((error) => {
        console.error(error);
      });
    }
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  settingsWindow.loadURL(url).catch((error) => {
    console.error(error);
    showError(error);
  });
  return settingsWindow;
}

function showPanelWindow(url = panelOpenUrl()) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    if (panelWindow.isMinimized()) {
      panelWindow.restore();
    }
    panelWindow.show();
    panelWindow.focus();
    return panelWindow;
  }

  panelWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: panelBackgroundColor(),
    title: appName,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  attachEditMenuTracking(panelWindow);
  panelWindow.setMenuBarVisibility(false);
  panelWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    openExternalUrl(targetUrl);
    return { action: 'deny' };
  });
  panelWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const target = new URL(targetUrl);
    const panel = new URL(getRuntimeStatus().uiUrl || url);
    if (target.origin === panel.origin && target.pathname === '/_electron/show-splash') {
      event.preventDefault();
      showSplashWindowForDuration(3000).catch((error) => {
        console.error(error);
      });
      return;
    }
    if (target.origin === panel.origin && target.pathname === '/_electron/quit') {
      event.preventDefault();
      quitApp();
      return;
    }
    if (target.origin === panel.origin && target.pathname === '/ca.pem') {
      event.preventDefault();
      panelWindow?.webContents.downloadURL(target.toString());
      return;
    }
    if (target.origin !== panel.origin) {
      event.preventDefault();
      openExternalUrl(target.toString());
    }
  });
  panelWindow.on('app-command', (event, command) => {
    const normalizedCommand = String(command || '').toLowerCase().replace(/[^a-z]/g, '');
    const isBack = normalizedCommand === 'browserbackward' || normalizedCommand === 'browserback' || normalizedCommand === 'back';
    const isForward = normalizedCommand === 'browserforward' || normalizedCommand === 'forward';
    if (!isBack && !isForward) return;
    event.preventDefault();
    dispatchPanelEvent(isBack
      ? 'http-mocker-preview-history-back'
      : 'http-mocker-preview-history-forward').catch((error) => {
      console.error(error);
    });
  });
  panelWindow.on('swipe', (event, direction) => {
    if (direction !== 'left' && direction !== 'right') return;
    event.preventDefault();
    dispatchPanelEvent(direction === 'left'
      ? 'http-mocker-preview-history-back'
      : 'http-mocker-preview-history-forward').catch((error) => {
      console.error(error);
    });
  });
  panelWindow.once('ready-to-show', () => {
    if (!panelWindow || panelWindow.isDestroyed()) return;
    panelWindow.show();
    panelWindow.focus();
  });
  panelWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    quitApp();
  });
  panelWindow.on('closed', () => {
    panelWindow = null;
    if (!isQuitting && !destroyingPanelForQuit) {
      quitApp();
    }
  });
  panelWindow.loadURL(url).catch((error) => {
    console.error(error);
    showError(error);
  });
  return panelWindow;
}

function openExternalUrl(targetUrl) {
  try {
    const target = new URL(targetUrl);
    const panel = new URL(getRuntimeStatus().uiUrl || 'http://127.0.0.1');
    if (target.origin === panel.origin) return;
    shell.openExternal(target.toString()).catch((error) => {
      console.error(error);
    });
  } catch (error) {
    console.error(error);
  }
}

async function openPanelOnColdStart() {
  if (didOpenPanelOnColdStart) return;
  didOpenPanelOnColdStart = true;
  try {
    await openPanel();
  } catch (error) {
    console.error(error);
  }
}

function requestOpenPanelFromExternalLaunch() {
  shouldOpenPanelAfterReady = true;
  openPanelIfRequested().catch((error) => {
    console.error(error);
  });
}

async function openPanelIfRequested() {
  if (!shouldOpenPanelAfterReady || isQuitting) return;
  if (!runtimeApi || startingUi) return;
  shouldOpenPanelAfterReady = false;
  await openPanel();
}

async function quitApp() {
  if (isQuitting) return;
  isQuitting = true;
  try {
    await pauseConnectedDeviceProxies('quit');
    if (panelWindow && !panelWindow.isDestroyed()) {
      destroyingPanelForQuit = true;
      panelWindow.destroy();
      panelWindow = null;
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.destroy();
      settingsWindow = null;
    }
    await stopRuntimeSafe();
  } catch (error) {
    console.error(error);
  } finally {
    app.exit(0);
  }
}

let powerMonitorHandlersInstalled = false;

function setupPowerMonitorHandlers() {
  if (powerMonitorHandlersInstalled) return;
  powerMonitorHandlersInstalled = true;
  powerMonitor.on('suspend', () => {
    pauseConnectedDeviceProxies('suspend').catch((error) => {
      console.error('Failed to pause adb proxies before suspend:', error.message || error);
    });
  });
  powerMonitor.on('resume', () => {
    restorePausedDeviceProxies().catch((error) => {
      console.error('Failed to restore adb proxies after resume:', error.message || error);
    });
  });
}

async function pauseConnectedDeviceProxies(reason) {
  try {
    const { pauseManagedAdbProxies } = await import('../src/adb-proxy-session.js');
    const result = await pauseManagedAdbProxies(reason);
    if (result.total) {
      console.log(`Paused adb proxy on ${result.paused}/${result.total} managed device(s).`);
    }
    if (result.failed) {
      console.warn(`Failed to pause adb proxy on ${result.failed} managed device(s).`);
    }
  } catch (error) {
    console.error('Failed to pause adb proxies:', error.message || error);
  }
}

async function restorePausedDeviceProxies() {
  try {
    const { restoreManagedAdbProxies } = await import('../src/adb-proxy-session.js');
    const result = await restoreManagedAdbProxies();
    if (result.total) {
      console.log(`Restored adb proxy on ${result.restored}/${result.total} managed device(s).`);
    }
    if (result.failed) {
      console.warn(`Failed to restore adb proxy on ${result.failed} managed device(s).`);
    }
  } catch (error) {
    console.error('Failed to restore adb proxies:', error.message || error);
  }
}

async function refreshSavedSettingsState() {
  if (!runtimeApi) return;
  try {
    const { readSettings } = await import('../src/fs-store.js');
    const settings = await readSettings();
    recordingEnabled = settings.recordingEnabled !== false;
    applyNativeAppearance(settings.appearance);
  } catch (error) {
    console.error(error);
  }
}

function getRuntimeStatus() {
  return runtimeApi?.runtimeStatus?.() || { running: false };
}

async function waitForUiReady(timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = getRuntimeStatus();
    if (status.uiRunning) {
      return status;
    }
    await delay(150);
  }
  return getRuntimeStatus();
}

async function waitForPanelReady(timeoutMs = 12000) {
  const startedAt = Date.now();
  let status = getRuntimeStatus();
  while (Date.now() - startedAt < timeoutMs) {
    status = getRuntimeStatus();
    if (status.uiRunning && await panelApisReady(status.uiUrl)) {
      return { ...status, panelReady: true };
    }
    await delay(150);
  }
  return { ...status, panelReady: false };
}

async function panelApisReady(uiUrl) {
  const baseUrl = uiUrl || getRuntimeStatus().uiUrl;
  if (!baseUrl) return false;
  const urls = [
    '/api/health',
    '/api/settings',
    '/api/ai/providers',
    '/api/captures',
    '/api/rules',
    '/api/remote-rules'
  ].map((endpoint) => new URL(endpoint, baseUrl).toString());
  try {
    const results = await Promise.all(urls.map((url) => fetchPanelJson(url)));
    const health = results[0];
    return Boolean(health?.ok && health.uiRunning);
  } catch {
    return false;
  }
}

async function fetchPanelJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Panel readiness failed: ${response.status} ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSplashWindow(options = {}) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    loadSplashWindow(options);
    return;
  }
  splashShownAt = 0;
  splashReadyPromise = new Promise((resolve) => {
    resolveSplashReady = resolve;
  });
  splashWindow = new BrowserWindow({
    width: 640,
    height: 400,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: splashBackgroundColor(),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  attachEditMenuTracking(splashWindow);
  splashWindow.setMenuBarVisibility(false);
  const markSplashShown = () => {
    if (!splashWindow || splashShownAt) return;
    splashWindow?.showInactive();
    splashShownAt = Date.now();
    resolveSplashReady?.();
    resolveSplashReady = null;
  };
  markSplashShown();
  splashWindow.once('ready-to-show', markSplashShown);
  splashWindow.webContents.once('did-finish-load', markSplashShown);
  splashWindow.on('closed', () => {
    splashWindow = null;
    clearTimeout(splashAutoCloseTimer);
    splashAutoCloseTimer = null;
    resolveSplashReady?.();
    resolveSplashReady = null;
    splashReadyPromise = null;
  });
  loadSplashWindow(options);
}

function loadSplashWindow(options = {}) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.loadFile(path.join(__dirname, 'splash.html'), {
    query: {
      version: app.getVersion(),
      loading: options.loading === false ? '0' : '1'
    }
  }).catch((error) => {
    console.error(error);
  });
}

async function showSplashWindowForDuration(durationMs = 3000, options = {}) {
  const token = splashAutoCloseToken + 1;
  splashAutoCloseToken = token;
  clearTimeout(splashAutoCloseTimer);
  createSplashWindow(options);
  if (!splashWindow) return;
  if (splashReadyPromise) {
    await splashReadyPromise;
  }
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.show();
  splashWindow.focus();
  splashAutoCloseTimer = setTimeout(() => {
    if (token !== splashAutoCloseToken) return;
    if (!splashWindow || splashWindow.isDestroyed()) return;
    splashWindow.close();
    splashWindow = null;
  }, durationMs);
}

function splashBackgroundColor() {
  return nativeTheme.shouldUseDarkColors ? '#171717' : '#f8fafd';
}

function panelBackgroundColor() {
  return nativeTheme.shouldUseDarkColors ? '#000000' : '#f8fafd';
}

function normalizeNativeAppearance(value) {
  const appearance = String(value || 'system');
  return ['system', 'light', 'dark'].includes(appearance) ? appearance : 'system';
}

function applyNativeAppearance(appearance = 'system') {
  nativeTheme.themeSource = normalizeNativeAppearance(appearance);
  refreshWindowBackgrounds();
}

function refreshWindowBackgrounds() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.setBackgroundColor(splashBackgroundColor());
  }
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.setBackgroundColor(panelBackgroundColor());
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setBackgroundColor(panelBackgroundColor());
  }
}

async function closeSplashWindow() {
  if (!splashWindow) return;
  clearTimeout(splashAutoCloseTimer);
  splashAutoCloseTimer = null;
  const minVisibleMs = 2000;
  if (!splashShownAt && splashReadyPromise) {
    await splashReadyPromise;
  }
  if (!splashWindow) return;
  const elapsed = Date.now() - splashShownAt;
  if (elapsed < minVisibleMs) {
    await delay(minVisibleMs - elapsed);
  }
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.close();
  splashWindow = null;
}

async function stopRuntimeSafe() {
  if (!runtimeApi?.stopRuntime) return;
  if (!stopRuntimePromise) {
    stopRuntimePromise = withTimeout(runtimeApi.stopRuntime(), 2500, '停止服务超时。');
  }
  await stopRuntimePromise;
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

async function ensureUserDataMigrated() {
  const newDataDir = path.join(app.getPath('userData'), 'data');
  const oldDataDir = path.join(app.getPath('appData'), oldAppName, 'data');

  const hasNewState = await pathExists(path.join(newDataDir, 'state.json'));
  if (!hasNewState && await pathExists(oldDataDir)) {
    await fs.mkdir(path.dirname(newDataDir), { recursive: true });
    await fs.cp(oldDataDir, newDataDir, { recursive: true, force: false, errorOnExist: false });
  }

  return newDataDir;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function showError(error) {
  dialog.showErrorBox(`${appName} 启动失败`, error?.message || '未知错误');
}

async function selectProjectDirectory() {
  const result = await dialog.showOpenDialog({
    title: '选择本地项目',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths?.length) return '';
  return result.filePaths[0];
}
