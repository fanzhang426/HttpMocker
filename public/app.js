import { diffChars, diffJson, diffLines } from '/vendor/diff/index.mjs';

const state = {
  pageInstanceId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  captures: [],
  rules: [],
  remoteRules: [],
  proxyRunning: false,
  recordingEnabled: true,
  selectedRuleId: null,
  selectedRemoteRuleId: null,
  selectedCaptureId: null,
  captureFilter: '',
  displayFilter: '',
  captureTabs: [],
  activeCaptureTabId: '',
  transientCaptureTabId: '',
  domainHistory: [],
  domainProjectPaths: {},
  domainProjectsInitialized: false,
  requireDomainHistorySelection: false,
  domainDialogMode: '',
  domainDialogResolve: null,
  codexQueue: null,
  captureMergeRules: {},
  captureMergeEnabled: true,
  captureTreeViewEnabled: false,
  captureTreeCollapsedKeys: new Set(),
  captureTreeFocusedKey: '',
  captureOverviewCollapsed: new Set(),
  apiNotes: {},
  apiDetails: {},
  apiDetailFailures: {},
  showListNotes: true,
  noteTarget: null,
  activeDetailNoteKey: '',
  activeDetailNoteText: '',
  detailNotePollUrl: '',
  detailNotePollKey: '',
  detailNotePollToken: 0,
  activeTab: 'captures',
  previewMode: 'empty',
  previewBodyTab: 'response',
  previewOverview: null,
  previewRequestHead: null,
  previewResponseHead: null,
  previewResponse: null,
  previewRequest: null,
  previewShowsBodyTabs: false,
  previewFindOpen: false,
  previewFindQuery: '',
  previewFindMatches: [],
  previewFindIndex: -1,
  previewOpenTabs: [],
  activePreviewTabId: '',
  previewTabHistory: [],
  previewTabHistoryIndex: -1,
  suppressPreviewTabVisit: false,
  suppressBrowserPreviewHistory: false,
  browserPreviewHistoryReady: false,
  browserPreviewHistorySeq: 0,
  lastWorkspaceFocus: 'preview',
  selectedCaptureDetail: null,
  remoteExampleTab: 'query',
  remoteExample: null,
  remoteExampleScroll: {},
  remoteExampleSplitRatio: 0.46,
  restoringRemoteExampleScroll: false,
  remotePreviewRefreshing: false,
  remoteSteps: [],
  remoteStepSummaryFocus: null,
  selectedDslStepId: '',
  selectedAiStepId: '',
  remoteAiDrafts: {},
  remoteAiPromptHistoryIndex: null,
  remoteAiPromptHistoryDraft: '',
  savedEditorState: null,
  autoSaveTimer: null,
  autoSaveInFlight: false,
  autoSavePromise: null,
  autoSaveQueued: false,
  autoSaveCounter: 0,
  manualRuleSaveRequired: false,
  manualRuleSaveMessage: '',
  manualRuleSaveScope: '',
  lastAiStepStatuses: {},
  remotePreviewTimer: null,
  remotePreviewRequestId: 0,
  adbDevices: [],
  adbStatusRefreshing: false,
  adbStatusTimer: null,
  adbTrackSource: null,
  adbTrackReconnectTimer: null,
  adbDeviceMenuOpen: false,
  adbGuidePromptDeviceId: '',
  adbGuideKnownDeviceIds: new Set(),
  globalSearchQuery: '',
  globalSearchLoading: false,
  globalSearchError: '',
  globalSearchResults: [],
  globalSearchExpandedKeys: new Set(),
  // Stores history groups manually expanded by the user; groups default to collapsed.
  collapsedHistoryGroups: new Set(),
  expandedRuleHitCaptures: new Set(),
  codexFailureSeenAt: 0,
  codexFailureSignature: '',
  aiNotesEnabled: false,
  aiProvider: 'none',
  availableAiProviders: [],
  updateInfo: null,
  projectPathPromptedTabs: new Set(),
  projectPathGuideTabId: '',
  refreshTimer: null,
  eventSource: null,
  eventReconnectTimer: null,
  capturesReloadTimer: null,
  rulesReloadTimer: null,
  settingsReloadTimer: null,
  healthReloadTimer: null,
  captureRenderSignature: '',
  captureSelectRequestId: 0,
  language: 'zh-CN',
  appearance: 'system',
  maxRecentRequests: 500
};

let settingsSaveTimer;
let terminalResizeTimer;
let terminalModulesPromise;
let renderingRemoteDslRows = false;
const terminalInstances = new Map();
let activeTerminalInstance;
let terminalRenamingTabId = '';
let lastPreviewWorkspaceMouseHistory = { at: 0, delta: 0 };
let previewWorkspaceRevealFrame = 0;
let terminalTabRevealFrame = 0;
let draggedPreviewWorkspaceTabId = '';
let draggedTerminalTabId = '';
let suppressPreviewWorkspaceTabClick = false;
let suppressTerminalTabClick = false;
let previewTextSelectionDrag = null;
const previewPaneCache = new Map();
let activePreviewPaneCacheKey = '';
const shownRuleWarnings = new Map();
const pageMode = new URLSearchParams(window.location.search).get('settings') === '1' ? 'settings' : 'main';
const autoSaveDelayMs = 500;
const workspaceSplitStorageKey = 'httpMockerWorkspaceSplitWidth';
const terminalHeightStorageKey = 'httpMockerTerminalHeight';
const adbProxyGuideDismissedStorageKey = 'httpMockerAdbProxyGuideDismissedDevices';
const workspaceSplitMinSide = 340;
const workspaceSplitMinPreview = 420;
const previewWorkspaceTabLimit = 10;
const terminalHeightDefault = 92;
const terminalHeightMin = 72;
const terminalHeightMaxRatio = 0.45;
const remoteExampleSplitStorageKey = 'httpMockerRemoteExampleSplitRatio';
const remoteExampleSplitMinEditor = 140;
const remoteExampleSplitMinExample = 130;
const collapsibleJsonPreviewMaxChars = 80 * 1024;
const maxRecentRequestsMin = 50;
const maxRecentRequestsMax = 5000;
const maxRecentRequestsDefault = 500;
const supportedLanguages = new Set(['zh-CN', 'en', 'ja', 'ko', 'ru', 'hi', 'es', 'de', 'fr', 'ar']);
const rtlLanguages = new Set(['ar']);
const supportedAppearances = new Set(['system', 'light', 'dark']);
const previewPaneSelectors = {
  editorTitle: '#editor-title',
  editorPath: '#editor-path',
  editorNote: '#editor-note',
  analyzeNoteBtn: '#analyze-note-btn',
  askAiBtn: '#ask-ai-btn',
  captureQueryEditor: '#capture-query-editor',
  captureQueryInput: '#capture-query-input',
  captureQueryPreview: '#capture-query-preview',
  captureQueryOriginal: '#capture-query-original',
  captureMergeQueryRow: '#capture-query-merge-row',
  captureMergeQuery: '#capture-merge-query',
  captureBodyMergeEditor: '#capture-body-merge-editor',
  captureMergeBodyRow: '#capture-merge-body-row',
  captureMergeBody: '#capture-merge-body',
  ruleOptionEditor: '#rule-option-editor',
  ruleOptionQuery: '#rule-option-query',
  ruleOptionBodyRow: '#rule-option-body-row',
  ruleOptionBody: '#rule-option-body',
  ruleOptionEnabled: '#rule-option-enabled',
  ruleBodyMatchEditor: '#rule-body-match-editor',
  responseBodyToolbar: '#response-body-toolbar',
  previewTabs: '#preview-tabs',
  captureTimeDisplay: '#capture-time-display',
  overviewTab: '#overview-tab',
  requestHeadTab: '#request-head-tab',
  responseHeadTab: '#response-head-tab',
  queryTab: '#query-tab',
  responseBodyTab: '#response-body-tab',
  requestBodyTab: '#request-body-tab',
  formatBodyBtn: '#format-body-btn',
  manualRuleSaveBtn: '#manual-rule-save-btn',
  ruleQueryEditor: '#rule-query-editor',
  ruleQueryInput: '#rule-query-input',
  remoteRuleEditor: '#remote-rule-editor',
  globalRemoteRuleEditor: '#global-remote-head-editor',
  globalRemoteHostInput: '#global-remote-host-input',
  globalRemoteEnabled: '#global-remote-enabled',
  remoteDslEditor: '#remote-dsl-editor',
  remoteDslStepEditor: '#remote-dsl-step-editor',
  remoteDslBackBtn: '#remote-dsl-back-btn',
  remoteDslSummary: '#remote-dsl-summary',
  remoteDslEnabled: '#remote-dsl-enabled',
  remoteDslAction: '#remote-dsl-action',
  remoteDslPath: '#remote-dsl-path',
  remoteDslValue: '#remote-dsl-value',
  remoteAiEditor: '#remote-ai-editor',
  remoteAiBackBtn: '#remote-ai-back-btn',
  remoteAiSummary: '#remote-ai-summary',
  remoteAiEnabled: '#remote-ai-enabled',
  remoteAiPrompt: '#remote-ai-prompt',
  remoteAiGenerateBtn: '#remote-ai-generate-btn',
  remoteAiStatus: '#remote-ai-status',
  remoteAiOutput: '#remote-ai-output',
  remoteAiScriptHighlight: '#remote-ai-script-highlight',
  remoteAiScript: '#remote-ai-script',
  remoteRuleToolbar: '#remote-rule-toolbar',
  remoteDslList: '#remote-dsl-list',
  remoteExampleDivider: '.remote-example-divider',
  remoteExampleDividerLabel: '.remote-example-divider span',
  remoteRuleLower: '.remote-rule-lower',
  remoteExampleRequestTab: '#remote-example-request-tab',
  remoteExampleResponseTab: '#remote-example-response-tab',
  remoteExampleRequestHeadTab: '#remote-example-request-head-tab',
  remoteExampleResponseHeadTab: '#remote-example-response-head-tab',
  remoteExampleQueryTab: '#remote-example-query-tab',
  remoteExamplePreview: '#remote-example-preview',
  remoteExampleDiff: '#remote-example-diff',
  remoteRuleHelpBtn: '#remote-rule-help-btn',
  addRemoteRuleBtn: '#add-remote-rule-btn',
  remoteAddMenu: '#remote-add-menu',
  addRemoteDslBtn: '#add-remote-dsl-btn',
  remoteAiRuleBtn: '#remote-ai-rule-btn',
  bodyEditorStack: '#body-editor-stack',
  captureBodyOriginal: '#capture-body-original',
  captureBodyDivider: '#capture-body-divider',
  editor: '#body-editor',
  bodyHighlight: '#body-highlight',
  captureOverview: '#capture-overview',
  captureDiffView: '#capture-diff-view',
  previewFindBar: '#preview-find-bar',
  previewFindInput: '#preview-find-input',
  previewFindCount: '#preview-find-count',
  previewFindPrev: '#preview-find-prev',
  previewFindNext: '#preview-find-next'
};
const translations = {
  'zh-CN': {
    'startup.title': 'HttpMocker 正在准备面板',
    'startup.subtitle': '正在加载请求、规则和配置...',
    'startup.errorTitle': '面板初始化失败',
    'startup.errorMessage': '初始化失败，请刷新页面重试。',
    'project.guide': '点击选择工程目录',
    'project.noDomain': '不指定域名',
    'project.selectDirectory': '选择项目目录',
    'project.clearDirectory': '清空项目关联',
    'project.linkedDirectory': '已关联本地工程：{path}\n点击清空项目关联。',
    'project.needDirectory': 'AI 需要知道这个域名对应的本地工程。点击这里选择工程目录。',
    'project.pickDirectoryTip': '选择这个请求分组对应的本地工程。',
    'project.selectPathFailed': '选择项目路径失败。',
    'project.domainTabs': 'Project 域名',
    'project.dialog.openTitle': '打开域名',
    'project.dialog.historyTitle': '历史域名',
    'project.dialog.selectTitle': '选择域名',
    'project.dialog.addTitle': '添加域名',
    'project.dialog.initialHistory': '请选择一个历史域名打开工程。',
    'project.dialog.initial': '首次打开需要选择一个 project 域名，也可以不指定域名查看全部请求和规则。',
    'project.dialog.history': '选择一个历史域名作为当前 project。',
    'project.dialog.add': '输入要打开的域名，或从历史域名中选择。',
    'project.dialog.noHistoryInitial': '暂无历史域名。请从菜单 File 添加域名后重新打开。',
    'project.dialog.noHistory': '暂无历史域名。',
    'nav.captures': '最近请求',
    'nav.local': '本地映射',
    'nav.remote': '拦截修改',
    'nav.mainTools': '主导航和工具',
    'nav.requestsAndRules': '请求和规则',
    'layout.resizer': '调整列表和预览宽度',
    'globalSearch.title': '全局搜索',
    'globalSearch.tip': '全局搜索当前项目的查询、请求头、请求体和响应体。快捷键：Cmd+Shift+F',
    'globalSearch.placeholder': '搜索当前项目的查询、请求头、请求体、响应体',
    'globalSearch.currentProject': '当前项目：{domain}',
    'globalSearch.allDomains': '当前项目：全部域名',
    'globalSearch.loading': '正在搜索...',
    'globalSearch.start': '输入关键字后开始搜索。',
    'globalSearch.noResults': '没有匹配结果。',
    'globalSearch.failed': '搜索失败。',
    'globalSearch.unknownHost': '未知域名',
    'update.available': '发现新版本 {version}',
    'update.openRelease': '获取更新',
    'update.availableTitle': '发现新版本',
    'update.dialogAvailable': '版本 {version} 已可下载。',
    'update.noUpdateTitle': '已是最新版本',
    'update.noUpdate': '当前已经是最新版本。',
    'update.checkFailedTitle': '检查更新失败',
    'update.checkFailed': '检查更新失败，请稍后重试。',
    'clear.history': '清空历史',
    'clear.menuTip': '选择要清空的最近请求历史。',
    'clear.older': '清空更早之前',
    'clear.allHistory': '清空所有历史',
    'clear.notes': '清空备注',
    'clear.rules': '清空规则',
    'clear.confirmAllCaptures': '确定要清空所有最近请求历史吗？\n\n这会删除当前记录的请求列表和更早之前记录，但不会删除备注和规则。',
    'clear.confirmOlderCaptures': '确定要清空“更早之前”的历史记录吗？\n\n这会删除每个请求展开后看到的旧时间记录，只按当前合并规则为每组请求保留最新一次。最近请求、备注和规则不会被删除。',
    'clear.confirmNotes': '确定要清空所有备注和详细说明吗？\n\n这会删除接口备注、AI 自动生成的备注和详细说明，不会删除请求历史或规则。',
    'clear.confirmRules': '确定要清空所有规则吗？\n\n这会删除全部本地映射和拦截修改规则，也会删除对应规则缓存。请求历史和备注不会被清空。',
    'capture.viewToggle': '切换最近请求视图',
    'capture.viewTreeTip': '当前为树状视图，点击切换为列表视图。',
    'capture.viewListTip': '当前为列表视图，点击切换为树状视图。',
    'capture.filterPlaceholder': '过滤接口路径或备注内容',
    'capture.listAria': '最近请求列表',
    'capture.mergeByQuery': '根据不同查询合并',
    'capture.mergeByBody': '根据不同请求体合并',
    'capture.originalBody': '原请求体',
    'capture.empty': '暂无请求。把浏览器或 App 代理设置为本机端口后刷新目标页面。',
    'capture.noMatch': '没有匹配的请求。',
    'capture.historyAria': '历史请求时间',
    'capture.olderToggle': '更早之前 · 点击{action}',
    'capture.expand': '展开',
    'capture.collapse': '收起',
    'capture.unknownHost': '未知域名',
    'local.listAria': '本地映射列表',
    'local.actionTip': '保存当前响应为本地映射；后续匹配请求会直接返回这份本地内容。',
    'local.empty': '还没有本地映射。先在最近请求里配置一条本地映射。',
    'rule.hitCaptures': '命中的请求',
    'remote.listAria': '拦截修改列表',
    'remote.actionTip': '创建拦截修改配置，可在代理转发时修改查询、Head、请求体或响应体。',
    'remote.globalEnabled': '启用全局规则',
    'remote.globalRules': '全局规则',
    'remote.addGlobalRule': '增加全局规则',
    'remote.addRule': '添加修改规则',
    'remote.addRuleTip': '添加一条拦截修改规则。',
    'remote.aiRule': 'AI 生成脚本',
    'remote.manualRule': '手动规则',
    'remote.back': '返回修改规则列表',
    'remote.backTip': '返回修改规则列表。',
    'remote.summaryPlaceholder': '一句话描述这条规则',
    'remote.aiSummaryPlaceholder': '一句话描述这条 AI 规则，仅用于展示，不参与 AI 生成',
    'remote.aiSummaryTip': '仅用于规则列表和详情展示，不作为 AI 生成依据；AI 自动生成时建议 40 字以内。',
    'remote.chooseAction': '选择操作',
    'remote.help': '查看修改规则',
    'remote.helpTip': '查看拦截修改规则的写法示例。',
    'remote.path': '路径',
    'remote.helpActions': '修改查询、修改请求Head、修改请求体、修改响应Head、修改响应体。',
    'remote.valuePlaceholder': '留空删除 / 123 / true / "string"',
    'remote.emptyDeletes': '留空则删除对应节点',
    'remote.aiPromptPlaceholder': '描述跨请求/响应的判断和修改，例如：当请求体 type=welcome 时，把响应体 reward_list 只保留第一条，并把 coins 改成 100',
    'remote.aiGenerate': 'AI生成',
    'remote.copyPrompt': '复制提示词',
    'remote.copyPromptTip': '复制左侧提示词，发给外部 AI 生成脚本。',
    'remote.aiScriptPlaceholder': 'AI 生成的 Python 脚本，也可以手动修改。',
    'remote.example': '示例',
    'remote.exampleTabsAria': '拦截修改示例',
    'remote.compatExample': '示例（兼容）',
    'remote.afterQuery': '影响后的查询',
    'remote.afterRequestHead': '影响后的请求Head',
    'remote.afterResponseHead': '影响后的响应Head',
    'remote.afterRequestBody': '影响后的请求体',
    'remote.afterResponseBody': '影响后的响应体',
    'remote.action.query': '修改查询',
    'remote.action.requestHead': '修改请求Head',
    'remote.action.requestBody': '修改请求体',
    'remote.action.responseHead': '修改响应Head',
    'remote.action.responseBody': '修改响应体',
    'remote.action.placeholder': '选择操作',
    'remote.emptySteps': '暂无修改规则',
    'remote.dragSort': '拖动排序',
    'remote.editAiRule': '编辑这条 AI 规则。',
    'remote.editManualRule': '编辑这条手动规则。',
    'remote.deleteAiRule': '删除这条 AI 规则。',
    'remote.deleteManualRule': '删除这条拦截修改规则。',
    'remote.aiDefaultSummary': 'AI 脚本规则',
    'remote.manualDefaultSummary': '手动规则',
    'remote.previewError': '规则错误',
    'remote.diffBefore': '原始',
    'remote.diffAfter': '影响后',
    'preview.title': '内容预览',
    'preview.emptyTitle': '选择一条历史或本地映射预览',
    'preview.searchPlaceholder': '搜索当前预览',
    'preview.tabsAria': '请求和响应 Body',
    'query.params': '查询参数',
    'tabs.overview': '概览',
    'overview.request': '请求',
    'overview.response': '响应',
    'overview.connection': '连接',
    'overview.timing': '耗时',
    'overview.size': '大小',
    'overview.url': 'URL',
    'overview.method': '方法',
    'overview.protocol': '协议',
    'overview.path': '路径',
    'overview.query': '查询',
    'overview.contentType': 'Content-Type',
    'overview.bodySize': 'Body 大小',
    'overview.status': '状态',
    'overview.loading': '加载中',
    'overview.failed': '失败',
    'overview.complete': '完成',
    'overview.error': '错误',
    'overview.responseCode': '响应码',
    'overview.responseMessage': '响应消息',
    'overview.mapping': '映射',
    'overview.clientAddress': '客户端地址',
    'overview.remoteAddress': '远端地址',
    'overview.keptAlive': '保持连接',
    'overview.ssl': 'SSL',
    'overview.yes': '是',
    'overview.no': '否',
    'overview.advanced': '高级',
    'overview.clientConnection': '客户端连接',
    'overview.serverConnection': '服务端连接',
    'overview.streamId': 'Stream ID',
    'overview.clientSettings': '客户端设置',
    'overview.serverSettings': '服务端设置',
    'overview.requestStartTime': '请求开始时间',
    'overview.requestEndTime': '请求结束时间',
    'overview.responseStartTime': '响应开始时间',
    'overview.responseEndTime': '响应结束时间',
    'overview.duration': '总耗时',
    'overview.dns': 'DNS',
    'overview.connect': '连接',
    'overview.tlsHandshake': 'TLS 握手',
    'overview.latency': '延迟',
    'overview.speed': '速度',
    'overview.requestSpeed': '请求速度',
    'overview.responseSpeed': '响应速度',
    'overview.header': 'Header',
    'overview.queryString': '查询字符串',
    'overview.cookies': 'Cookies',
    'overview.body': 'Body',
    'overview.uncompressedBody': '未压缩 Body',
    'overview.compression': '压缩',
    'overview.total': '总计',
    'tabs.matchQuery': '匹配查询',
    'tabs.requestHead': '请求Head',
    'tabs.requestBody': '请求体',
    'tabs.matchBody': '匹配请求体',
    'tabs.responseHead': '响应Head',
    'tabs.responseBody': '响应体',
    'actions.copyCurl': '复制curl',
    'actions.copyCurlTip': '复制当前预览请求的完整 curl，包含 URL、请求头和请求体。',
    'actions.repeat': 'Repeat',
    'actions.repeatTip': '通过代理重新发送当前请求，返回结果会进入最近请求。',
    'actions.delete': '删除',
    'actions.deleteRuleTip': '删除当前选中的本地映射或拦截修改配置。',
    'actions.format': '格式化',
    'actions.formatTip': '格式化当前 JSON 内容。',
    'actions.manualSaveTip': '当前匹配范围与其他规则存在包含关系，需要手动确认保存。',
    'actions.prev': '上一个',
    'actions.next': '下一个',
    'actions.close': '关闭',
    'actions.cancel': '取消',
    'actions.failed': '操作失败。',
    'actions.open': '打开',
    'actions.add': '添加',
    'actions.search': '搜索',
    'actions.clear': '清空',
    'actions.save': '保存',
    'actions.saveFailed': '保存失败。',
    'actions.stop': '停止',
    'actions.start': '开始',
    'actions.stopping': '停止中',
    'actions.starting': '开始中',
    'common.domain': '域名',
    'common.enabled': '启用',
    'common.action': '选择',
    'common.value': '值',
    'common.idle': '空闲',
    'common.running': '运行中',
    'common.queued': '排队中',
    'terminal.rename': '重命名',
    'status.localIp': '本机 IP',
    'status.proxyPort': '代理端口',
    'status.proxyStopped': '代理未启动',
    'status.recording': '正在记录',
    'status.passThrough': '仅透传',
    'status.stopRecording': '停止记录',
    'status.startRecording': '开始记录',
    'status.stopRecordingTip': '保持代理可用，但所有请求只透传，不记录、不命中规则。',
    'status.startRecordingTip': '开始记录并处理经过代理的请求。',
    'status.toggleFailed': '记录状态切换失败。',
    'adb.refreshDevices': '刷新 Android 设备列表。',
    'adb.chooseDevice': '选择 Android 设备',
    'adb.chooseProxy': '选择 Android 设备设置或取消代理。',
    'adb.setProxy': '设置手机代理',
    'adb.clearProxy': '取消手机代理',
    'adb.setProxyFor': '设置手机代理：{device}',
    'adb.clearProxyFor': '取消手机代理：{device}',
    'adb.clearProxyTip': '清除手机的代理设置。',
    'adb.setProxyTip': '把手机的代理设置为本机。',
    'adb.currentProxy': '当前代理：{proxy}',
    'adb.noProxy': '当前未设置代理',
    'adb.guide': '点击设置手机代理',
    'adb.failed': 'adb 操作失败。',
    'adb.pathHint': '请确认 adb 已安装并在 PATH 中。',
    'ai.none': '不使用 AI',
    'ai.switchTip': '切换 AI 服务商。当前：{provider}',
    'ai.disabledRuleTip': '当前选择了不使用 AI，无法新增 AI 规则。',
    'ai.addRuleTip': '新增一条 AI Python 脚本规则。',
    'ai.ask': '问AI',
    'ai.askTip': '在新终端里把当前请求、工程目录和上下文交给当前 AI 服务商继续追问。',
    'ai.askNoProject': '请先关联本地工程目录。',
    'ai.askFailed': '打开 AI 终端失败。',
    'ai.statusTitle': 'AI 工作状态',
    'ai.scriptGeneration': 'AI 脚本生成',
    'ai.noteAnalysis': '备注分析',
    'ai.detailAnalysis': '详细说明',
    'ai.provider': '服务商',
    'ai.autoNotes': '备注自动分析',
    'ai.totalQueue': '总队列',
    'ai.running': '运行',
    'ai.pending': '排队',
    'ai.failed': '失败',
    'ai.completed': '已完成',
    'ai.current': '当前',
    'ai.lastFailure': '最近失败',
    'ai.runPending': '运行 / 排队',
    'ai.completedFailed': '已完成 / 失败',
    'ai.runningState': '运行中',
    'ai.stoppedState': '已停止',
    'ai.failedShort': 'Codex 失败 {count}',
    'ai.generationQueue': 'AI生成 {running}/{total}{pendingText}',
    'ai.pendingSuffix': ' · 排队 {pending}',
    'ai.noteQueue': '备注分析 {state} {running}/{total}',
    'ai.detailQueue': '详细说明 {state} {running}/{total}',
    'ai.disabledWorkTip': '当前选择了不使用 AI，无法开始。',
    'ai.stopWorkTip': '停止 AI 工作，清空排队任务并中断正在执行的 AI 规则生成。',
    'ai.startWorkTip': '开始备注自动分析，并补扫未生成备注的接口。',
    'ai.toggleFailed': 'AI 工作状态切换失败。',
    'note.short': '备注',
    'note.actionTip': '手动添加或编辑这个接口的备注。',
    'note.title': '接口备注',
    'note.placeholder': '这个接口是做什么的',
    'note.detail': '详细说明',
    'note.detailTitle': '接口详细说明',
    'note.detailTip': '生成或查看这个接口的参数、字段和代码依据说明。',
    'note.detailGenerating': '详细说明生成中。',
    'note.detailFailed': '详细说明生成失败。',
    'note.detailFailedTitle': '详细说明生成失败',
    'note.detailFailedReason': '原因：{message}',
    'note.detailFailedAt': '失败时间：{time}',
    'note.detailStillGenerating': '详细说明仍在生成，请稍后再打开。',
    'note.detailQueue': '详细说明生成中，队列 {running}/{total}。',
    'note.emptyDetail': '暂无详细说明。',
    'note.generateDetail': '生成详细说明',
    'note.detailFailureButton': '详细说明生成失败',
    'note.generating': '生成中',
    'note.viewDetailTip': '查看这个接口已生成的参数、字段和代码依据说明。',
    'note.viewFailureTip': '查看详细说明生成失败的原因。',
    'note.generatingTip': '详细说明正在生成，点击查看 AI 工作状态。',
    'note.generateTip': '生成这个接口的参数、字段和代码依据说明。',
    'note.regenerate': '重新生成',
    'note.generate': '生成',
    'settings.title': '设置',
    'settings.language': '语言',
    'settings.appearance': '外观',
    'appearance.system': '跟随系统',
    'appearance.light': '亮色',
    'appearance.dark': '暗色',
    'settings.treeView': '树状视图',
    'settings.mergeRequests': '合并请求',
    'settings.showListNotes': '列表展示备注',
    'settings.aiAutoNotes': 'AI 自动生成备注',
    'settings.maxHistory': '最大历史数',
    'cert.download': '下载证书',
    'tree.expand': "展开",
    'tree.collapse': "折叠",
    'tree.actions': "树状视图操作",
    'tree.expandAll': "全部展开",
    'tree.collapseAll': "全部收起",
    'context.updateLocal': "更新本地映射",
    'context.createLocal': "设置为本地映射",
    'context.updateRemote': "更新拦截修改",
    'context.createRemote': "配置为拦截修改",
    'context.addAsDomain': "添加为域名工程",
    'context.openDomain': "打开域名",
    'merge.querySourceError': "匹配查询只能基于当前请求删除参数。新增参数、改参数名或改参数值需要手动保存。",
    'merge.bodySourceError': "匹配请求体只能基于当前请求删除字段。新增字段、改字段名、改字段值或改结构需要手动保存。",
    'merge.sourceError': "匹配模板只能基于当前请求减少字段。其他改动需要手动保存。",
    'merge.conflictAutoSave': "当前匹配范围与同接口的其他聚合配置存在包含关系，无法自动保存。请调整匹配查询或匹配请求体，或点击保存再次校验。",
    'merge.manualSaveDefault': "当前匹配范围与其他规则存在包含关系，需要手动保存并再次校验。",
    'merge.conflictSave': "规则匹配范围与其他规则存在包含关系，无法保存。",
    'merge.conflictWithRule': "当前匹配范围与「{target}」存在包含关系，无法自动保存。请调整匹配查询或匹配请求体，或点击保存再次校验。",
    'merge.duplicateWithRule': "当前匹配范围与「{target}」完全相同，无法同时启用。",
    'merge.otherRule': "其他规则",
    'query.ignoreTip': "留空表示忽略查询；填写 a=1&b=2 表示必须包含这些字段",
    'query.templateTip': "取消勾选后按这里的必须字段匹配；留空表示忽略查询，实际请求可以多字段，顺序可以不同。",
    'query.mergeTip': "勾选“根据不同查询合并”时，查询不同也会合并。取消勾选后可编辑必须字段模板。",
    'query.matchingTitle': "参与匹配的查询",
    'query.ignoredTitle': "不参与匹配的查询",
    'query.deleteAria': "从匹配查询中删除",
    'body.deleteAria': "从匹配请求体中删除",
    'remote.ruleEnabledAria': "启用规则",
    'actions.edit': "编辑",
    'remote.summaryAria': "一句话描述",
    'remote.defaultDslMissing': "未填写",
    'remote.defaultDslEmpty': "空",
    'actions.invalidJson': "无效JSON",
    'actions.formatted': "已格式化",
    'ai.statusQueued': "排队中",
    'ai.statusGenerating': "生成中",
    'ai.statusGenerated': "已生成",
    'ai.statusStopped': "已停止",
    'ai.statusFailed': "生成失败",
    'ai.copied': "已复制",
    'ai.copyFailed': "复制失败",
    'ai.promptRequired': "请输入 AI 生成规则的提示词。",
    'ai.queuedDots': "排队中...",
    'ai.submitJob': "提交 AI 生成任务...",
    'ai.generatingDots': "生成中...",
    'ai.queued': "已排队",
    'ai.failedSentence': "生成失败。",
    'ai.existingJob': "已有 AI 生成任务正在执行。",
    'ai.enqueuedJob': "已加入 AI 生成队列。",
    'remote.previewFailed': "预览失败。",
    'remote.incomplete': "修改规则未填完整。",
    'remote.pathNoSpace': "关键字不能包含空格。",
    'remote.valueEncodeError': "参数值包含无法编码的字符。",
    'actions.repeatFailed': "Repeat 失败。",
    'actions.done': "已完成",
    'capture.loadingDetail': "正在加载请求详情...",
    'capture.retryLater': "请稍后重新点击。",
    'capture.detailLoadFailed': "请求详情加载失败。",
    'capture.hitLocal': "已命中本地映射",
    'capture.hitRemote': "已命中拦截修改",
    'capture.proxyFailed': "代理请求失败",
    'capture.reason': "原因：{message}",
    'capture.type': "类型：{type}",
    'capture.requestTime': "请求时间 {time}",
    'capture.detailTimeout': "请求详情加载超时，请稍后重试。",
    'preview.request': "请求预览",
    'preview.localEdit': "本地映射编辑",
    'preview.remoteEdit': "拦截修改编辑",
    'preview.globalRemote': "全局拦截修改",
    'tabs.query': "查询",
    'tabs.modifyRules': "修改规则",
    'local.updateTip': "用当前请求和响应刷新已有本地映射配置。",
    'remote.updateTip': "用当前请求信息刷新已有拦截修改配置，不覆盖已编辑的修改规则。",
    'note.ruleTip': "手动添加或编辑这条规则的单行备注；没有备注时列表不会展示。",
    'note.apiTip': "手动添加或编辑这个接口的备注；没有备注时列表不会展示。",
    'diff.before': "映射前",
    'diff.after': "映射后",
    'diff.prev': "上一个差异",
    'diff.next': "下一个差异",
    'diff.current': "定位到当前差异",
    'diff.copyAll': "点击复制所有{title}文案",
    'diff.copyFailed': "复制失败",
    'diff.omittedLines': "... 已省略 {count} 行未变化内容 ...",
    'diff.truncated': "... 内容过长，已截断 {count} 个字符 ...",
    'diff.viewFull': "查看这一侧完整内容",
    'diff.back': "← 返回对比",
    'diff.fullTitle': "{title} · 完整预览",
    'rule.global': "全局规则",
    'rule.matchSummary': "匹配：{text}",
    'query.none': "无查询参数",
    'capture.requestDetail': "请求详情",
    'aiGuide.myRequest': '我的需求：',
    'aiGuide.outputOnly': '请只输出完整 Python 脚本，不要 Markdown，不要代码围栏，不要解释过程。',
    'aiGuide.commentSafe': '注释只能概括逻辑，不要包含完整请求体、响应体、base64 或敏感数据。',
    'aiGuide.comment': '脚本顶部必须从第一行开始写详细 Python 注释，说明这个脚本的用途、会在哪些 stage 生效、匹配或修改哪些字段、未命中时是否直接透传。',
    'aiGuide.stdlib': '只能使用 Python 标准库。不要访问网络，不要读写本地文件，不要打印解释文本。',
    'aiGuide.noSensitive': '不要把完整请求体、响应体、base64 或 ctx 内容放进异常、assert、print、summary 或返回错误里。',
    'aiGuide.dropBase64': '如果修改了 body 字符串，请删除对应对象里的 bodyBase64 字段，避免旧的 base64 覆盖你的 body 修改。',
    'aiGuide.base64': 'bodyBase64 只用于二进制内容，除非必须处理二进制，否则不要读取、解析或重写 bodyBase64。',
    'aiGuide.parseBody': '如果要修改 JSON 或 URL encoded 文本，请优先解析并修改 ctx["request"]["body"] 或 ctx["response"]["body"]。',
    'aiGuide.returnCtx': '请直接修改 ctx 并返回 ctx；不需要修改的阶段直接返回 ctx。',
    'aiGuide.crossIntent': '用户需求可能描述“当请求体 xxx 时，响应体 xxx”“当查询参数 xxx 时，响应 Head xxx”这类跨 stage 逻辑，请在对应阶段读取 ctx["request"] 条件并修改 ctx["response"] 或其他目标字段。',
    'aiGuide.crossContext': '脚本可以基于同一次请求和响应的完整上下文做跨部分判断，例如：当请求体 type=welcome、查询 tab=home 或请求 Head 命中某值时，再修改响应体、响应 Head 或请求体。',
    'aiGuide.response': 'ctx["response"] 包含 statusCode、statusMessage、headers、body、bodyBase64、contentType。',
    'aiGuide.request': 'ctx["request"] 包含 method、url、headers、query、path、body、bodyBase64、contentType。',
    'aiGuide.stage': 'ctx["stage"] 的值只会是 request_head、request_body、response_head、response_body 之一。',
    'aiGuide.ctxCall': '脚本会在代理请求过程中被调用，输入是 ctx 字典。你可以定义 handle(ctx)，也可以定义 on_request_head(ctx)、on_request_body(ctx)、on_response_head(ctx)、on_response_body(ctx)。',
    'aiGuide.ruleSample': '当前规则通常带有一次请求样本，脚本可以参考样本字段，但仍需在运行时安全判断字段存在。',
    'aiGuide.globalSample': '当前没有固定请求样本或响应样本，不能假设某个 path、query、请求体或响应体一定存在；必须在脚本里根据运行时 ctx 安全判断 method、path、query、headers、body 后再修改。',
    'aiGuide.ruleIntro': '你正在为 HttpMocker 生成拦截修改规则。规则必须是 Python 脚本。',
    'aiGuide.globalIntro': '你正在为 HttpMocker 生成全局拦截修改规则。该规则只按域名 {host} 生效，对该域名下所有请求都可能执行。规则必须是 Python 脚本。',
    'aiGuide.title': '复制给外部 AI 的提示词',
    'aiGuide.missingHost': '[请先填写域名]',
    'aiGuide.empty': '[空]',
  },
  en: {
    'startup.title': 'HttpMocker is preparing the panel',
    'startup.subtitle': 'Loading requests, rules, and settings...',
    'startup.errorTitle': 'Panel failed to initialize',
    'startup.errorMessage': 'Initialization failed. Refresh the page and try again.',
    'project.guide': 'Choose a project folder',
    'project.noDomain': 'All domains',
    'project.selectDirectory': 'Choose project folder',
    'project.clearDirectory': 'Clear project link',
    'project.linkedDirectory': 'Linked project: {path}\nClick to clear the project link.',
    'project.needDirectory': 'AI needs the local project for this domain. Click to choose the project folder.',
    'project.pickDirectoryTip': 'Choose the local project for this request group.',
    'project.selectPathFailed': 'Failed to choose project path.',
    'project.domainTabs': 'Project domains',
    'project.dialog.openTitle': 'Open Domain',
    'project.dialog.historyTitle': 'Domain History',
    'project.dialog.selectTitle': 'Choose Domain',
    'project.dialog.addTitle': 'Add Domain',
    'project.dialog.initialHistory': 'Choose a domain from history to open the project.',
    'project.dialog.initial': 'Choose a project domain first, or use all domains to view every request and rule.',
    'project.dialog.history': 'Choose a domain from history as the current project.',
    'project.dialog.add': 'Enter a domain to open, or choose one from history.',
    'project.dialog.noHistoryInitial': 'No domain history. Add a domain from the File menu, then reopen.',
    'project.dialog.noHistory': 'No domain history.',
    'nav.captures': 'Recent Requests',
    'nav.local': 'Local Mock',
    'nav.remote': 'Rewrite Rules',
    'nav.mainTools': 'Main navigation and tools',
    'nav.requestsAndRules': 'Requests and rules',
    'layout.resizer': 'Resize list and preview panes',
    'globalSearch.title': 'Global Search',
    'globalSearch.tip': 'Search query, request headers, request body, and response body in the current project. Shortcut: Cmd+Shift+F',
    'globalSearch.placeholder': 'Search query, headers, request body, response body',
    'globalSearch.currentProject': 'Current project: {domain}',
    'globalSearch.allDomains': 'Current project: all domains',
    'globalSearch.loading': 'Searching...',
    'globalSearch.start': 'Enter a keyword to search.',
    'globalSearch.noResults': 'No matches.',
    'globalSearch.failed': 'Search failed.',
    'globalSearch.unknownHost': 'Unknown host',
    'update.available': 'New version {version} available',
    'update.openRelease': 'Get update',
    'update.availableTitle': 'Update Available',
    'update.dialogAvailable': 'Version {version} is ready to download.',
    'update.noUpdateTitle': 'Already Up To Date',
    'update.noUpdate': 'You are already on the latest version.',
    'update.checkFailedTitle': 'Update Check Failed',
    'update.checkFailed': 'Update check failed. Try again later.',
    'clear.history': 'Clear History',
    'clear.menuTip': 'Choose which recent request history to clear.',
    'clear.older': 'Clear Older Entries',
    'clear.allHistory': 'Clear All History',
    'clear.notes': 'Clear Notes',
    'clear.rules': 'Clear Rules',
    'clear.confirmAllCaptures': 'Clear all recent request history?\n\nThis removes the current request list and older entries, but keeps notes and rules.',
    'clear.confirmOlderCaptures': 'Clear older entries?\n\nThis removes old timestamps shown after expanding each request and keeps only the latest request per group under the current merge settings. Recent requests, notes, and rules are kept.',
    'clear.confirmNotes': 'Clear all notes and detailed explanations?\n\nThis removes manual notes, AI-generated notes, and detailed explanations. Request history and rules are kept.',
    'clear.confirmRules': 'Clear all rules?\n\nThis removes all local mocks and rewrite rules, including their cached data. Request history and notes are kept.',
    'capture.viewToggle': 'Toggle recent request view',
    'capture.viewTreeTip': 'Tree view is active. Click to switch to list view.',
    'capture.viewListTip': 'List view is active. Click to switch to tree view.',
    'capture.filterPlaceholder': 'Filter by API path or note',
    'capture.listAria': 'Recent request list',
    'capture.mergeByQuery': 'Group separately by query',
    'capture.mergeByBody': 'Group separately by request body',
    'capture.originalBody': 'Original request body',
    'capture.empty': 'No requests yet. Set your browser or app proxy to this machine and reload the target page.',
    'capture.noMatch': 'No matching requests.',
    'capture.historyAria': 'Request history timestamps',
    'capture.olderToggle': 'Older entries · click to {action}',
    'capture.expand': 'expand',
    'capture.collapse': 'collapse',
    'capture.unknownHost': 'Unknown host',
    'local.listAria': 'Local mock list',
    'local.actionTip': 'Save the current response as a local mock. Matching requests will return this local content directly.',
    'local.empty': 'No local mocks yet. Create one from Recent Requests.',
    'rule.hitCaptures': 'Matched requests',
    'remote.listAria': 'Rewrite rule list',
    'remote.actionTip': 'Create rewrite rules that can modify query, headers, request body, or response body while proxying.',
    'remote.globalEnabled': 'Enable global rule',
    'remote.globalRules': 'Global Rules',
    'remote.addGlobalRule': 'Add Global Rule',
    'remote.addRule': 'Add rewrite rule',
    'remote.addRuleTip': 'Add a rewrite rule.',
    'remote.aiRule': 'AI Script Rule',
    'remote.manualRule': 'Manual Rule',
    'remote.back': 'Back to rule list',
    'remote.backTip': 'Back to rule list.',
    'remote.summaryPlaceholder': 'One-line rule summary',
    'remote.aiSummaryPlaceholder': 'One-line AI rule summary, display only',
    'remote.aiSummaryTip': 'Used only in the rule list and detail view. It is not used as AI generation context.',
    'remote.chooseAction': 'Choose action',
    'remote.help': 'View rule syntax',
    'remote.helpTip': 'View examples for rewrite rule syntax.',
    'remote.path': 'Path',
    'remote.helpActions': 'Change query, request headers, request body, response headers, or response body.',
    'remote.valuePlaceholder': 'Empty deletes / 123 / true / "string"',
    'remote.emptyDeletes': 'Leave empty to delete the target node',
    'remote.aiPromptPlaceholder': 'Describe cross-request/response conditions and changes. Example: when request body type=welcome, keep only the first reward_list item and set coins to 100.',
    'remote.aiGenerate': 'Generate',
    'remote.copyPrompt': 'Copy Prompt',
    'remote.copyPromptTip': 'Copy the prompt on the left and send it to an external AI to generate the script.',
    'remote.aiScriptPlaceholder': 'AI-generated Python script. You can edit it manually.',
    'remote.example': 'Example',
    'remote.exampleTabsAria': 'Rewrite rule example',
    'remote.compatExample': 'Example (compat)',
    'remote.afterQuery': 'Rewritten Query',
    'remote.afterRequestHead': 'Rewritten Request Headers',
    'remote.afterResponseHead': 'Rewritten Response Headers',
    'remote.afterRequestBody': 'Rewritten Request Body',
    'remote.afterResponseBody': 'Rewritten Response Body',
    'remote.action.query': 'Change Query',
    'remote.action.requestHead': 'Change Request Headers',
    'remote.action.requestBody': 'Change Request Body',
    'remote.action.responseHead': 'Change Response Headers',
    'remote.action.responseBody': 'Change Response Body',
    'remote.action.placeholder': 'Choose action',
    'remote.emptySteps': 'No rewrite rules',
    'remote.dragSort': 'Drag to reorder',
    'remote.editAiRule': 'Edit this AI rule.',
    'remote.editManualRule': 'Edit this manual rule.',
    'remote.deleteAiRule': 'Delete this AI rule.',
    'remote.deleteManualRule': 'Delete this rewrite rule.',
    'remote.aiDefaultSummary': 'AI script rule',
    'remote.manualDefaultSummary': 'Manual rule',
    'remote.previewError': 'Rule errors',
    'remote.diffBefore': 'Original',
    'remote.diffAfter': 'After',
    'preview.title': 'Preview',
    'preview.emptyTitle': 'Select a request or local mock to preview',
    'preview.searchPlaceholder': 'Search current preview',
    'preview.tabsAria': 'Request and response bodies',
    'query.params': 'Query parameters',
    'tabs.overview': 'Overview',
    'overview.request': 'Request',
    'overview.response': 'Response',
    'overview.connection': 'Connection',
    'overview.timing': 'Timing',
    'overview.size': 'Size',
    'overview.url': 'URL',
    'overview.method': 'Method',
    'overview.protocol': 'Protocol',
    'overview.path': 'Path',
    'overview.query': 'Query',
    'overview.contentType': 'Content-Type',
    'overview.bodySize': 'Body Size',
    'overview.status': 'Status',
    'overview.loading': 'Loading',
    'overview.failed': 'Failed',
    'overview.complete': 'Complete',
    'overview.error': 'Error',
    'overview.responseCode': 'Response Code',
    'overview.responseMessage': 'Response Message',
    'overview.mapping': 'Mapping',
    'overview.clientAddress': 'Client Address',
    'overview.remoteAddress': 'Remote Address',
    'overview.keptAlive': 'Kept Alive',
    'overview.ssl': 'SSL',
    'overview.yes': 'Yes',
    'overview.no': 'No',
    'overview.advanced': 'Advanced',
    'overview.clientConnection': 'Client Connection',
    'overview.serverConnection': 'Server Connection',
    'overview.streamId': 'Stream Id',
    'overview.clientSettings': 'Client Settings',
    'overview.serverSettings': 'Server Settings',
    'overview.requestStartTime': 'Request Start Time',
    'overview.requestEndTime': 'Request End Time',
    'overview.responseStartTime': 'Response Start Time',
    'overview.responseEndTime': 'Response End Time',
    'overview.duration': 'Duration',
    'overview.dns': 'DNS',
    'overview.connect': 'Connect',
    'overview.tlsHandshake': 'TLS Handshake',
    'overview.latency': 'Latency',
    'overview.speed': 'Speed',
    'overview.requestSpeed': 'Request Speed',
    'overview.responseSpeed': 'Response Speed',
    'overview.header': 'Header',
    'overview.queryString': 'Query String',
    'overview.cookies': 'Cookies',
    'overview.body': 'Body',
    'overview.uncompressedBody': 'Uncompressed Body',
    'overview.compression': 'Compression',
    'overview.total': 'Total',
    'tabs.matchQuery': 'Match Query',
    'tabs.requestHead': 'Request Headers',
    'tabs.requestBody': 'Request Body',
    'tabs.matchBody': 'Match Request Body',
    'tabs.responseHead': 'Response Headers',
    'tabs.responseBody': 'Response Body',
    'actions.copyCurl': 'Copy curl',
    'actions.copyCurlTip': 'Copy the full curl for the current request, including URL, headers, and body.',
    'actions.repeat': 'Repeat',
    'actions.repeatTip': 'Resend the current request through the proxy. The result will appear in Recent Requests.',
    'actions.delete': 'Delete',
    'actions.deleteRuleTip': 'Delete the selected local mock or rewrite rule.',
    'actions.format': 'Format',
    'actions.formatTip': 'Format the current JSON content.',
    'actions.manualSaveTip': 'This match scope overlaps another rule and needs manual confirmation.',
    'actions.prev': 'Previous',
    'actions.next': 'Next',
    'actions.close': 'Close',
    'actions.cancel': 'Cancel',
    'actions.failed': 'Operation failed.',
    'actions.open': 'Open',
    'actions.add': 'Add',
    'actions.search': 'Search',
    'actions.clear': 'Clear',
    'actions.save': 'Save',
    'actions.saveFailed': 'Save failed.',
    'actions.stop': 'Stop',
    'actions.start': 'Start',
    'actions.stopping': 'Stopping',
    'actions.starting': 'Starting',
    'common.domain': 'Domain',
    'common.enabled': 'Enabled',
    'common.action': 'Action',
    'common.value': 'Value',
    'common.idle': 'Idle',
    'common.running': 'Running',
    'common.queued': 'Queued',
    'terminal.rename': 'Rename',
    'status.localIp': 'Local IP',
    'status.proxyPort': 'Proxy Port',
    'status.proxyStopped': 'Proxy stopped',
    'status.recording': 'Recording',
    'status.passThrough': 'Pass-through only',
    'status.stopRecording': 'Stop recording',
    'status.startRecording': 'Start recording',
    'status.stopRecordingTip': 'Keep the proxy available, but pass all requests through without recording or applying rules.',
    'status.startRecordingTip': 'Start recording and processing requests through the proxy.',
    'status.toggleFailed': 'Failed to change recording state.',
    'adb.refreshDevices': 'Refresh Android devices.',
    'adb.chooseDevice': 'Choose Android device',
    'adb.chooseProxy': 'Choose an Android device to set or clear the proxy.',
    'adb.setProxy': 'Set Phone Proxy',
    'adb.clearProxy': 'Clear Phone Proxy',
    'adb.setProxyFor': 'Set phone proxy: {device}',
    'adb.clearProxyFor': 'Clear phone proxy: {device}',
    'adb.clearProxyTip': 'Clear the proxy setting on the phone.',
    'adb.setProxyTip': 'Set the phone proxy to this machine.',
    'adb.currentProxy': 'Current proxy: {proxy}',
    'adb.noProxy': 'No proxy configured',
    'adb.guide': 'Click to set phone proxy',
    'adb.failed': 'adb operation failed.',
    'adb.pathHint': 'Make sure adb is installed and available in PATH.',
    'ai.none': 'No AI',
    'ai.switchTip': 'Switch AI provider. Current: {provider}',
    'ai.disabledRuleTip': 'AI is disabled, so AI rules cannot be created.',
    'ai.addRuleTip': 'Add an AI Python script rule.',
    'ai.ask': 'Ask AI',
    'ai.askTip': 'Open a new terminal and send this request, project directory, and context to the selected AI provider.',
    'ai.askNoProject': 'Link a local project directory first.',
    'ai.askFailed': 'Failed to open the AI terminal.',
    'ai.statusTitle': 'AI Work Status',
    'ai.scriptGeneration': 'AI Script Generation',
    'ai.noteAnalysis': 'Note Analysis',
    'ai.detailAnalysis': 'Detailed Explanation',
    'ai.provider': 'Provider',
    'ai.autoNotes': 'Auto notes',
    'ai.totalQueue': 'Total queue',
    'ai.running': 'running',
    'ai.pending': 'queued',
    'ai.failed': 'failed',
    'ai.completed': 'completed',
    'ai.current': 'Current',
    'ai.lastFailure': 'Last failure',
    'ai.runPending': 'Running / Queued',
    'ai.completedFailed': 'Completed / Failed',
    'ai.runningState': 'Running',
    'ai.stoppedState': 'Stopped',
    'ai.failedShort': 'Codex failed {count}',
    'ai.generationQueue': 'AI generation {running}/{total}{pendingText}',
    'ai.pendingSuffix': ' · queued {pending}',
    'ai.noteQueue': 'Notes {state} {running}/{total}',
    'ai.detailQueue': 'Details {state} {running}/{total}',
    'ai.disabledWorkTip': 'AI is disabled, so work cannot start.',
    'ai.stopWorkTip': 'Stop AI work, clear queued jobs, and interrupt running AI rule generation.',
    'ai.startWorkTip': 'Start automatic note analysis and scan APIs without notes.',
    'ai.toggleFailed': 'Failed to change AI work state.',
    'note.short': 'Note',
    'note.actionTip': 'Add or edit a manual note for this API.',
    'note.title': 'API Note',
    'note.placeholder': 'What does this API do?',
    'note.detail': 'Details',
    'note.detailTitle': 'API Detailed Explanation',
    'note.detailTip': 'Generate or view parameter, field, and code-reference details for this API.',
    'note.detailGenerating': 'Generating detailed explanation.',
    'note.detailFailed': 'Detailed explanation failed.',
    'note.detailFailedTitle': 'Detailed explanation failed',
    'note.detailFailedReason': 'Reason: {message}',
    'note.detailFailedAt': 'Failed at: {time}',
    'note.detailStillGenerating': 'Detailed explanation is still generating. Try again later.',
    'note.detailQueue': 'Generating detailed explanation, queue {running}/{total}.',
    'note.emptyDetail': 'No detailed explanation yet.',
    'note.generateDetail': 'Generate Details',
    'note.detailFailureButton': 'Details Failed',
    'note.generating': 'Generating',
    'note.viewDetailTip': 'View generated parameter, field, and code-reference details for this API.',
    'note.viewFailureTip': 'View why the detailed explanation failed.',
    'note.generatingTip': 'Detailed explanation is generating. Click to view AI work status.',
    'note.generateTip': 'Generate parameter, field, and code-reference details for this API.',
    'note.regenerate': 'Regenerate',
    'note.generate': 'Generate',
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.appearance': 'Appearance',
    'appearance.system': 'Follow System',
    'appearance.light': 'Light',
    'appearance.dark': 'Dark',
    'settings.treeView': 'Tree View',
    'settings.mergeRequests': 'Merge Requests',
    'settings.showListNotes': 'Show Notes in List',
    'settings.aiAutoNotes': 'Auto-generate Notes with AI',
    'settings.maxHistory': 'History Limit',
    'cert.download': 'Download certificate',
    'tree.expand': "Expand",
    'tree.collapse': "Collapse",
    'tree.actions': "Tree view actions",
    'tree.expandAll': "Expand all",
    'tree.collapseAll': "Collapse all",
    'context.updateLocal': "Update Local Mock",
    'context.createLocal': "Set as Local Mock",
    'context.updateRemote': "Update Rewrite Rule",
    'context.createRemote': "Configure as Rewrite Rule",
    'context.addAsDomain': "Add as Project Domain",
    'context.openDomain': "Open Domain",
    'merge.querySourceError': "Match query can only remove parameters from the current request. Adding parameters, renaming keys, or changing values requires manual save.",
    'merge.bodySourceError': "Match request body can only remove fields from the current request. Adding fields, renaming fields, changing values, or changing structure requires manual save.",
    'merge.sourceError': "Match templates can only narrow the current request. Other changes require manual save.",
    'merge.conflictAutoSave': "This match scope contains another aggregate config for the same API, so it cannot auto-save. Adjust match query/request body, or click Save to validate again.",
    'merge.manualSaveDefault': "This match scope overlaps another rule. Save manually and validate again.",
    'merge.conflictSave': "Rule match scope overlaps another rule and cannot be saved.",
    'merge.conflictWithRule': "This match scope overlaps \"{target}\" and cannot auto-save. Adjust match query/request body, or click Save to validate again.",
    'merge.duplicateWithRule': "This match scope is identical to \"{target}\" and cannot be enabled at the same time.",
    'merge.otherRule': "another rule",
    'query.ignoreTip': "Leave empty to ignore query. Enter a=1&b=2 to require those fields.",
    'query.templateTip': "When unchecked, requests must include these fields. Leave empty to ignore query. Extra fields and any order are allowed.",
    'query.mergeTip': "When enabled, different query values are grouped together. Disable it to edit required-field matching.",
    'query.matchingTitle': "Query used for matching",
    'query.ignoredTitle': "Query ignored for matching",
    'query.deleteAria': "Remove from match query",
    'body.deleteAria': "Remove from match request body",
    'remote.ruleEnabledAria': "Enable rule",
    'actions.edit': "Edit",
    'remote.summaryAria': "One-line summary",
    'remote.defaultDslMissing': "missing",
    'remote.defaultDslEmpty': "empty",
    'actions.invalidJson': "Invalid JSON",
    'actions.formatted': "Formatted",
    'ai.statusQueued': "Queued",
    'ai.statusGenerating': "Generating",
    'ai.statusGenerated': "Generated",
    'ai.statusStopped': "Stopped",
    'ai.statusFailed': "Generation failed",
    'ai.copied': "Copied",
    'ai.copyFailed': "Copy failed",
    'ai.promptRequired': "Enter a prompt for AI rule generation.",
    'ai.queuedDots': "Queued...",
    'ai.submitJob': "Submitting AI generation job...",
    'ai.generatingDots': "Generating...",
    'ai.queued': "Queued",
    'ai.failedSentence': "Generation failed.",
    'ai.existingJob': "An AI generation job is already running.",
    'ai.enqueuedJob': "Added to the AI generation queue.",
    'remote.previewFailed': "Preview failed.",
    'remote.incomplete': "Rewrite rule is incomplete.",
    'remote.pathNoSpace': "The key path cannot contain spaces.",
    'remote.valueEncodeError': "Value contains characters that cannot be encoded.",
    'actions.repeatFailed': "Repeat failed.",
    'actions.done': "Done",
    'capture.loadingDetail': "Loading request details...",
    'capture.retryLater': "Click again later.",
    'capture.detailLoadFailed': "Failed to load request details.",
    'capture.hitLocal': "Matched local mock",
    'capture.hitRemote': "Matched rewrite rule",
    'capture.proxyFailed': "Proxy request failed",
    'capture.reason': "Reason: {message}",
    'capture.type': "Type: {type}",
    'capture.requestTime': "Request time {time}",
    'capture.detailTimeout': "Request details timed out. Try again later.",
    'preview.request': "Request Preview",
    'preview.localEdit': "Local Mock Editor",
    'preview.remoteEdit': "Rewrite Rule Editor",
    'preview.globalRemote': "Global Rewrite Rule",
    'tabs.query': "Query",
    'tabs.modifyRules': "Rules",
    'local.updateTip': "Refresh the existing local mock with the current request and response.",
    'remote.updateTip': "Refresh request data for the existing rewrite rule without overwriting edited rules.",
    'note.ruleTip': "Add or edit a one-line note for this rule. Empty notes are hidden in the list.",
    'note.apiTip': "Add or edit a note for this API. Empty notes are hidden in the list.",
    'diff.before': "Before",
    'diff.after': "After",
    'diff.prev': "Previous diff",
    'diff.next': "Next diff",
    'diff.current': "Jump to current diff",
    'diff.copyAll': "Copy all {title} text",
    'diff.copyFailed': "Copy failed",
    'diff.omittedLines': "... omitted {count} unchanged lines ...",
    'diff.truncated': "... content too long, truncated {count} characters ...",
    'diff.viewFull': "View full content for this side",
    'diff.back': "← Back to diff",
    'diff.fullTitle': "{title} · Full Preview",
    'rule.global': "Global Rule",
    'rule.matchSummary': "Match: {text}",
    'query.none': "No query parameters",
    'capture.requestDetail': "Request Details",
    'aiGuide.myRequest': 'My request:',
    'aiGuide.outputOnly': 'Output only the complete Python script. Do not use Markdown, code fences, or explanatory text.',
    'aiGuide.commentSafe': 'Comments must summarize logic only. Do not include complete request bodies, response bodies, base64, or sensitive data.',
    'aiGuide.comment': 'At the top of the script, starting from the first line, write detailed Python comments describing what the script does, which stages it affects, what fields it matches or changes, and whether unmatched requests pass through.',
    'aiGuide.stdlib': 'Use only the Python standard library. Do not access the network, read/write local files, or print explanatory text.',
    'aiGuide.noSensitive': 'Do not put full request bodies, response bodies, base64, or ctx content into exceptions, asserts, print output, summary, or returned errors.',
    'aiGuide.dropBase64': 'If you change a body string, delete bodyBase64 from the corresponding object so the old base64 value cannot override your body change.',
    'aiGuide.base64': 'bodyBase64 is only for binary content. Unless binary handling is required, do not read, parse, or rewrite bodyBase64.',
    'aiGuide.parseBody': 'When changing JSON or URL-encoded text, prefer parsing and editing ctx["request"]["body"] or ctx["response"]["body"].',
    'aiGuide.returnCtx': 'Modify ctx directly and return ctx. If a stage does not need changes, return ctx unchanged.',
    'aiGuide.crossIntent': 'User intent may describe cross-stage logic such as \'when request body xxx, change response body xxx\' or \'when query parameter xxx, change response header xxx\'. Read ctx["request"] conditions in the relevant stage and modify ctx["response"] or the requested target fields.',
    'aiGuide.crossContext': 'The script may use the full request and response context from the same transaction. For example, when request body type=welcome, query tab=home, or a request header matches a value, then modify the response body, response headers, or request body.',
    'aiGuide.response': 'ctx["response"] contains statusCode, statusMessage, headers, body, bodyBase64, and contentType.',
    'aiGuide.request': 'ctx["request"] contains method, url, headers, query, path, body, bodyBase64, and contentType.',
    'aiGuide.stage': 'ctx["stage"] is one of request_head, request_body, response_head, or response_body.',
    'aiGuide.ctxCall': 'The script runs during proxying and receives a ctx dictionary. You can define handle(ctx), or define on_request_head(ctx), on_request_body(ctx), on_response_head(ctx), and on_response_body(ctx).',
    'aiGuide.ruleSample': 'This rule usually includes one request sample. You may use sample fields as reference, but still check that fields exist at runtime.',
    'aiGuide.globalSample': 'There is no fixed request or response sample. Do not assume any path, query, request body, or response body exists. In the script, safely check runtime ctx fields such as method, path, query, headers, and body before changing anything.',
    'aiGuide.ruleIntro': 'You are generating a rewrite rule for HttpMocker. The rule must be a Python script.',
    'aiGuide.globalIntro': 'You are generating a global rewrite rule for HttpMocker. It only applies to host {host}, and may run for every request on that host. The rule must be a Python script.',
    'aiGuide.title': 'Prompt to copy to an external AI',
    'aiGuide.missingHost': '[enter a host first]',
    'aiGuide.empty': '[empty]',
  },
  ru: {
    'startup.title': 'HttpMocker готовит панель',
    'startup.subtitle': 'Загрузка запросов, правил и настроек...',
    'startup.errorTitle': 'Не удалось инициализировать панель',
    'startup.errorMessage': 'Инициализация не удалась. Обновите страницу и попробуйте снова.',
    'project.guide': 'Нажмите, чтобы выбрать папку проекта',
    'project.noDomain': 'Без домена',
    'project.selectDirectory': 'Выбрать папку проекта',
    'project.clearDirectory': 'Очистить привязку проекта',
    'project.linkedDirectory': 'Связанный проект: {path}\nНажмите, чтобы очистить ссылку на проект.',
    'project.needDirectory': 'ИИ нужен локальный проект для этого домена. Нажмите, чтобы выбрать папку проекта.',
    'project.pickDirectoryTip': 'Выберите локальный проект для этой группы запросов.',
    'project.selectPathFailed': 'Не удалось выбрать путь к проекту.',
    'project.domainTabs': 'Домены проекта',
    'project.dialog.historyTitle': 'История домена',
    'project.dialog.selectTitle': 'Выберите домен',
    'project.dialog.addTitle': 'Добавить домен',
    'project.dialog.initialHistory': 'Выберите домен из истории, чтобы открыть проект.',
    'project.dialog.initial': 'Сначала выберите домен проекта или используйте все домены для просмотра каждого запроса и правила.',
    'project.dialog.history': 'Выберите домен из истории в качестве текущего проекта.',
    'project.dialog.add': 'Добавьте домен проекта.',
    'project.dialog.noHistoryInitial': 'Нет истории домена. Добавьте домен из меню «Файл», затем снова откройте.',
    'project.dialog.noHistory': 'Нет истории домена.',
    'nav.captures': 'Последние запросы',
    'nav.local': 'Локальные моки',
    'nav.remote': 'Перехват',
    'nav.mainTools': 'Основная навигация и инструменты',
    'nav.requestsAndRules': 'Запросы и правила',
    'layout.resizer': 'Изменение размера списка и панелей предварительного просмотра',
    'globalSearch.title': 'Глобальный поиск',
    'globalSearch.tip': 'Поисковый запрос, заголовки запросов, тело запроса и тело ответа в текущем проекте. Ярлык: Cmd+Shift+F',
    'globalSearch.placeholder': 'Поисковый запрос, заголовки, тело запроса, тело ответа',
    'globalSearch.currentProject': 'Текущий проект: {domain}',
    'globalSearch.allDomains': 'Текущий проект: все домены',
    'globalSearch.loading': 'Идет поиск...',
    'globalSearch.start': 'Введите ключевое слово для поиска.',
    'globalSearch.noResults': 'Никаких совпадений.',
    'globalSearch.failed': 'Поиск не удался.',
    'globalSearch.unknownHost': 'Неизвестный хост',
    'update.available': 'Доступна новая версия {version}',
    'update.openRelease': 'Получить обновление',
    'update.availableTitle': 'Доступно обновление',
    'update.dialogAvailable': 'Версия {version} готова к загрузке.',
    'update.noUpdateTitle': 'Уже последняя версия',
    'update.noUpdate': 'Установлена последняя версия.',
    'update.checkFailedTitle': 'Не удалось проверить обновления',
    'update.checkFailed': 'Не удалось проверить обновления. Повторите попытку позже.',
    'clear.history': 'Очистить историю',
    'clear.menuTip': 'Выберите, какую историю недавних запросов следует очистить.',
    'clear.older': 'Очистить старые записи',
    'clear.allHistory': 'Очистить всю историю',
    'clear.notes': 'Очистить заметки',
    'clear.rules': 'Четкие правила',
    'clear.confirmAllCaptures': 'Очистить всю историю недавних запросов?\n\nПри этом текущий список запросов и старые записи удаляются, но примечания и правила сохраняются.',
    'clear.confirmOlderCaptures': 'Удалить старые записи?\n\nПри этом удаляются старые временные метки, отображаемые после раскрытия каждого запроса, и сохраняется только последний запрос для каждой группы с текущими настройками слияния. Недавние запросы, примечания и правила сохраняются.',
    'clear.confirmNotes': 'Удалить все примечания и подробные пояснения?\n\nПри этом удаляются примечания, созданные вручную, примечания, созданные искусственным интеллектом, и подробные объяснения. История запросов и правила сохраняются.',
    'clear.confirmRules': 'Удалить все правила?\n\nПри этом будут удалены все локальные макеты и правила перезаписи, включая их кэшированные данные. История запросов и примечания сохраняются.',
    'capture.viewToggle': 'Переключить просмотр последних запросов',
    'capture.viewTreeTip': 'Древовидное представление активно. Нажмите, чтобы переключиться на просмотр списка.',
    'capture.viewListTip': 'Просмотр списка активен. Нажмите, чтобы переключиться на древовидное представление.',
    'capture.filterPlaceholder': 'Фильтровать по пути API или примечанию',
    'capture.listAria': 'Список последних запросов',
    'capture.mergeByQuery': 'Группировать отдельно по запросу',
    'capture.mergeByBody': 'Группировать отдельно по телу запроса',
    'capture.originalBody': 'Исходное тело запроса',
    'capture.empty': 'Пока нет запросов. Настройте прокси браузера или приложения на этот компьютер и обновите страницу.',
    'capture.noMatch': 'Нет соответствующих запросов.',
    'capture.historyAria': 'Запросить временные метки истории',
    'capture.olderToggle': 'Старые записи · нажмите, чтобы увидеть {action}',
    'capture.expand': 'расширять',
    'capture.collapse': 'крах',
    'capture.unknownHost': 'Неизвестный хост',
    'local.listAria': 'Локальный список макетов',
    'local.actionTip': 'Сохраните текущий ответ как локальный макет. Соответствующие запросы будут возвращать этот локальный контент напрямую.',
    'local.empty': 'Местных издевательств пока нет. Создайте его из последних запросов.',
    'rule.hitCaptures': 'Matched requests',
    'remote.listAria': 'Переписать список правил',
    'remote.actionTip': 'Создайте правила перезаписи, которые могут изменять запрос, заголовки, текст запроса или текст ответа во время проксирования.',
    'remote.globalEnabled': 'Включить глобальное правило',
    'remote.globalRules': 'Глобальные правила',
    'remote.addGlobalRule': 'Добавить глобальное правило',
    'remote.addRule': 'Добавить правило перезаписи',
    'remote.addRuleTip': 'Добавьте правило перезаписи.',
    'remote.aiRule': 'Правило сценария AI',
    'remote.manualRule': 'Ручное правило',
    'remote.back': 'Вернуться к списку правил',
    'remote.backTip': 'Вернуться к списку правил.',
    'remote.summaryPlaceholder': 'Краткое описание правил в одну строку',
    'remote.aiSummaryPlaceholder': 'Сводка правил ИИ в одну строку, только отображение',
    'remote.aiSummaryTip': 'Используется только в списке правил и подробном просмотре. Он не используется в качестве контекста генерации ИИ.',
    'remote.chooseAction': 'Выберите действие',
    'remote.help': 'Посмотреть синтаксис правила',
    'remote.helpTip': 'Просмотрите примеры синтаксиса правил перезаписи.',
    'remote.path': 'Путь',
    'remote.helpActions': 'Измените запрос, заголовки запроса, тело запроса, заголовки ответа или тело ответа.',
    'remote.valuePlaceholder': 'Пустые удаления / 123 / true / «строка»',
    'remote.emptyDeletes': 'Оставьте пустым, чтобы удалить целевой узел.',
    'remote.aiPromptPlaceholder': 'Опишите условия и изменения перекрестного запроса/ответа. Пример: когда тип тела запроса = добро пожаловать, сохраните только первый элемент списка наград и установите монеты на 100.',
    'remote.aiGenerate': 'Генерировать',
    'remote.copyPrompt': 'Копировать подсказку',
    'remote.copyPromptTip': 'Скопируйте приглашение слева и отправьте его внешнему ИИ для создания сценария.',
    'remote.aiScriptPlaceholder': 'Скрипт Python, созданный искусственным интеллектом. Вы можете редактировать его вручную.',
    'remote.example': 'Пример',
    'remote.exampleTabsAria': 'Пример правила перезаписи',
    'remote.compatExample': 'Пример (совместимый)',
    'remote.afterQuery': 'Переписанный запрос',
    'remote.afterRequestHead': 'Переписаны заголовки запросов',
    'remote.afterResponseHead': 'Переписаны заголовки ответов',
    'remote.afterRequestBody': 'Переписано тело запроса',
    'remote.afterResponseBody': 'Переписано тело ответа',
    'remote.action.query': 'Изменить запрос',
    'remote.action.requestHead': 'Заголовки запросов на изменение',
    'remote.action.requestBody': 'Текст запроса на изменение',
    'remote.action.responseHead': 'Изменить заголовки ответов',
    'remote.action.responseBody': 'Изменить тело ответа',
    'remote.action.placeholder': 'Выберите действие',
    'remote.emptySteps': 'Нет правил перезаписи',
    'remote.dragSort': 'Перетащите, чтобы изменить порядок',
    'remote.editAiRule': 'Отредактируйте это правило AI.',
    'remote.editManualRule': 'Измените это правило вручную.',
    'remote.deleteAiRule': 'Удалите это правило AI.',
    'remote.deleteManualRule': 'Удалите это правило перезаписи.',
    'remote.aiDefaultSummary': 'Правило сценария ИИ',
    'remote.manualDefaultSummary': 'Ручное правило',
    'remote.previewError': 'Ошибки в правилах',
    'remote.diffBefore': 'Оригинал',
    'remote.diffAfter': 'После',
    'preview.title': 'Предпросмотр',
    'preview.emptyTitle': 'Выберите запрос или локальный макет для предварительного просмотра.',
    'preview.searchPlaceholder': 'Поиск текущего предварительного просмотра',
    'preview.tabsAria': 'Органы запросов и ответов',
    'query.params': 'Параметры запроса',
    'tabs.overview': 'Обзор',
    'overview.request': 'Запрос',
    'overview.response': 'Ответ',
    'overview.connection': 'Соединение',
    'overview.timing': 'Время',
    'overview.size': 'Размер',
    'overview.url': 'URL-адрес',
    'overview.method': 'Метод',
    'overview.protocol': 'Протокол',
    'overview.path': 'Путь',
    'overview.query': 'Запрос',
    'overview.contentType': 'Тип контента',
    'overview.bodySize': 'Размер тела',
    'overview.status': 'Статус',
    'overview.loading': 'Загрузка',
    'overview.failed': 'Ошибка',
    'overview.complete': 'Готово',
    'overview.error': 'Ошибка',
    'overview.responseCode': 'Код ответа',
    'overview.responseMessage': 'Ответное сообщение',
    'overview.mapping': 'Картирование',
    'overview.clientAddress': 'Адрес клиента',
    'overview.remoteAddress': 'Удаленный адрес',
    'overview.keptAlive': 'Остался в живых',
    'overview.ssl': 'SSL',
    'overview.yes': 'Да',
    'overview.no': 'Нет',
    'overview.advanced': 'Передовой',
    'overview.clientConnection': 'Подключение клиента',
    'overview.serverConnection': 'Подключение к серверу',
    'overview.streamId': 'Идентификатор потока',
    'overview.clientSettings': 'Настройки клиента',
    'overview.serverSettings': 'Настройки сервера',
    'overview.requestStartTime': 'Запросить время начала',
    'overview.requestEndTime': 'Запросить время окончания',
    'overview.responseStartTime': 'Время начала ответа',
    'overview.responseEndTime': 'Время окончания ответа',
    'overview.duration': 'Продолжительность',
    'overview.dns': 'DNS',
    'overview.connect': 'Соединять',
    'overview.tlsHandshake': 'TLS-рукопожатие',
    'overview.latency': 'Задержка',
    'overview.speed': 'Скорость',
    'overview.requestSpeed': 'Запросить скорость',
    'overview.responseSpeed': 'Скорость отклика',
    'overview.header': 'Заголовок',
    'overview.queryString': 'Строка запроса',
    'overview.cookies': 'Файлы cookie',
    'overview.body': 'Тело',
    'overview.uncompressedBody': 'Несжатое тело',
    'overview.compression': 'Сжатие',
    'overview.total': 'Итого',
    'tabs.matchQuery': 'Match Query',
    'tabs.requestHead': 'Request Headers',
    'tabs.requestBody': 'Request Body',
    'tabs.matchBody': 'Тело запроса на совпадение',
    'tabs.responseHead': 'Response Headers',
    'tabs.responseBody': 'Response Body',
    'actions.copyCurl': 'Копировать curl',
    'actions.copyCurlTip': 'Скопируйте полный URL-адрес текущего запроса, включая URL-адрес, заголовки и тело.',
    'actions.repeat': 'Повторить',
    'actions.repeatTip': 'Повторно отправьте текущий запрос через прокси. Результат появится в разделе «Последние запросы».',
    'actions.delete': 'Удалить',
    'actions.deleteRuleTip': 'Удалите выбранное локальное правило макета или перезаписи.',
    'actions.format': 'Форматировать',
    'actions.formatTip': 'Отформатируйте текущий контент JSON.',
    'actions.manualSaveTip': 'Эта область соответствия перекрывает другое правило и требует подтверждения вручную.',
    'actions.prev': 'Предыдущий',
    'actions.next': 'Следующий',
    'actions.close': 'Закрыть',
    'actions.cancel': 'Отмена',
    'actions.failed': 'Операция не удалась.',
    'actions.open': 'Открыть',
    'actions.add': 'Добавить',
    'actions.search': 'Поиск',
    'actions.clear': 'Очистить',
    'actions.save': 'Сохранить',
    'actions.saveFailed': 'Сохранить не удалось.',
    'actions.stop': 'Остановить',
    'actions.start': 'Запустить',
    'actions.stopping': 'Остановка',
    'actions.starting': 'Начало',
    'common.domain': 'Домен',
    'common.enabled': 'Включено',
    'common.action': 'Действие',
    'common.value': 'Значение',
    'common.idle': 'Праздный',
    'common.running': 'Бег',
    'common.queued': 'В очереди',
    'status.localIp': 'Локальный IP',
    'status.proxyPort': 'Порт прокси',
    'status.proxyStopped': 'Прокси остановлен',
    'status.recording': 'Запись',
    'status.passThrough': 'Только пропуск',
    'status.stopRecording': 'Остановить запись',
    'status.startRecording': 'Начать запись',
    'status.stopRecordingTip': 'Держите прокси доступным, но пропускайте все запросы без записи или применения правил.',
    'status.startRecordingTip': 'Начать запись и обработку запросов через прокси.',
    'status.toggleFailed': 'Не удалось изменить состояние записи.',
    'adb.refreshDevices': 'Обновить Android-устройства.',
    'adb.chooseDevice': 'Выбрать Android-устройство',
    'adb.chooseProxy': 'Выберите Android-устройство для установки или очистки прокси.',
    'adb.setProxy': 'Установить прокси телефона',
    'adb.clearProxy': 'Очистить прокси телефона',
    'adb.setProxyFor': 'Установить прокси телефона: {device}',
    'adb.clearProxyFor': 'Очистить прокси телефона: {device}',
    'adb.clearProxyTip': 'Очистите настройки прокси-сервера на телефоне.',
    'adb.setProxyTip': 'Установите прокси-сервер телефона на этот компьютер.',
    'adb.currentProxy': 'Текущий прокси: {proxy}',
    'adb.noProxy': 'Прокси не настроен',
    'adb.guide': 'Нажмите, чтобы настроить прокси телефона',
    'adb.failed': 'Операция adb не удалась.',
    'adb.pathHint': 'Убедитесь, что adb установлен и доступен в PATH.',
    'ai.none': 'Не использовать AI',
    'ai.switchTip': 'Смените поставщика ИИ. Текущий: {provider}',
    'ai.disabledRuleTip': 'ИИ отключен, поэтому создавать правила ИИ невозможно.',
    'ai.addRuleTip': 'Добавьте правило сценария AI Python.',
    'ai.ask': 'Спросить ИИ',
    'ai.askTip': 'Открыть новый терминал и отправить этот запрос, каталог проекта и контекст выбранному ИИ.',
    'ai.askNoProject': 'Сначала привяжите локальный каталог проекта.',
    'ai.askFailed': 'Не удалось открыть терминал ИИ.',
    'ai.statusTitle': 'Статус работы ИИ',
    'ai.scriptGeneration': 'Генерация сценариев ИИ',
    'ai.noteAnalysis': 'Анализ заметок',
    'ai.detailAnalysis': 'Подробное объяснение',
    'ai.provider': 'AI-провайдер',
    'ai.autoNotes': 'Авто заметки',
    'ai.totalQueue': 'Общая очередь',
    'ai.running': 'бег',
    'ai.pending': 'в очереди',
    'ai.failed': 'неуспешный',
    'ai.completed': 'завершенный',
    'ai.current': 'Текущий',
    'ai.lastFailure': 'Последняя неудача',
    'ai.runPending': 'Выполняется/в очереди',
    'ai.completedFailed': 'Завершено / Не удалось',
    'ai.runningState': 'Бег',
    'ai.stoppedState': 'Остановлено',
    'ai.failedShort': 'Ошибка Кодекса {count}',
    'ai.generationQueue': 'Поколение ИИ {running}/{total}{pendingText}',
    'ai.pendingSuffix': '· поставлен в очередь {pending}',
    'ai.noteQueue': 'Примечания {state} {running}/{total}',
    'ai.detailQueue': 'Подробности {state} {running}/{total}',
    'ai.disabledWorkTip': 'ИИ отключен, поэтому работа не может начаться.',
    'ai.stopWorkTip': 'Остановите работу ИИ, очистите задания в очереди и прервите генерацию правил ИИ.',
    'ai.startWorkTip': 'Запускайте автоматический анализ заметок и сканируйте API без заметок.',
    'ai.toggleFailed': 'Не удалось изменить состояние работы ИИ.',
    'note.short': 'Примечание',
    'note.actionTip': 'Добавьте или отредактируйте примечание вручную для этого API.',
    'note.title': 'Примечание API',
    'note.placeholder': 'Что делает этот API?',
    'note.detail': 'Подробности',
    'note.detailTitle': 'Подробное объяснение API',
    'note.detailTip': 'Создайте или просмотрите сведения о параметрах, полях и ссылках на код для этого API.',
    'note.detailGenerating': 'Создание подробного объяснения.',
    'note.detailFailed': 'Подробное объяснение не удалось.',
    'note.detailFailedTitle': 'Подробное объяснение не удалось',
    'note.detailFailedReason': 'Причина: {message}',
    'note.detailFailedAt': 'Ошибка: {time}',
    'note.detailStillGenerating': 'Подробное объяснение все еще генерируется. Повторите попытку позже.',
    'note.detailQueue': 'Генерация подробного объяснения, очередь {running}/{total}.',
    'note.emptyDetail': 'Подробных объяснений пока нет.',
    'note.generateDetail': 'Создать детали',
    'note.detailFailureButton': 'Подробности не удалось',
    'note.generating': 'Создание',
    'note.viewDetailTip': 'Просмотрите сведения о сгенерированных параметрах, полях и ссылках на код для этого API.',
    'note.viewFailureTip': 'Узнайте, почему подробное объяснение не удалось.',
    'note.generatingTip': 'Подробное объяснение генерируется. Нажмите, чтобы просмотреть статус работы ИИ.',
    'note.generateTip': 'Создайте параметры, поля и сведения о коде для этого API.',
    'note.regenerate': 'Регенерировать',
    'note.generate': 'Генерировать',
    'settings.title': 'Настройки',
    'settings.language': 'Язык',
    'settings.appearance': 'Внешний вид',
    'appearance.system': 'Как в системе',
    'appearance.light': 'Светлая',
    'appearance.dark': 'Темная',
    'settings.treeView': 'Дерево',
    'settings.mergeRequests': 'Объединять запросы',
    'settings.showListNotes': 'Показывать заметки в списке',
    'settings.aiAutoNotes': 'Автозаметки ИИ',
    'settings.maxHistory': 'Максимум истории',
    'cert.download': 'Скачать сертификат',
    'tree.expand': 'Расширять',
    'tree.collapse': 'Крах',
    'tree.actions': 'Действия в виде дерева',
    'tree.expandAll': 'Развернуть все',
    'tree.collapseAll': 'Свернуть все',
    'context.updateLocal': 'Обновить локальный макет',
    'context.createLocal': 'Задать как локальный макет',
    'context.updateRemote': 'Обновить правило перезаписи',
    'context.createRemote': 'Настроить как правило перезаписи',
    'context.addAsDomain': 'Добавить как домен проекта',
    'context.openDomain': 'Открытый домен',
    'merge.querySourceError': 'Запрос на совпадение может удалять параметры только из текущего запроса. Добавление параметров, переименование ключей или изменение значений требует сохранения вручную.',
    'merge.bodySourceError': 'Тело запроса на совпадение может удалять поля только из текущего запроса. Для добавления полей, переименования полей, изменения значений или изменения структуры требуется сохранение вручную.',
    'merge.sourceError': 'Шаблоны совпадений могут только сузить текущий запрос. Другие изменения требуют сохранения вручную.',
    'merge.conflictAutoSave': 'Эта область соответствия содержит другую совокупную конфигурацию для того же API, поэтому ее нельзя сохранить автоматически. Измените текст запроса/запроса на совпадение или нажмите «Сохранить», чтобы подтвердить еще раз.',
    'merge.manualSaveDefault': 'Эта область соответствия перекрывает другое правило. Сохраните вручную и подтвердите еще раз.',
    'merge.conflictSave': 'Область соответствия правил перекрывает другое правило и не может быть сохранена.',
    'merge.conflictWithRule': 'Эта область соответствия перекрывает «{target}» и не может автоматически сохраняться. Измените текст запроса/запроса на совпадение или нажмите «Сохранить», чтобы подтвердить еще раз.',
    'merge.otherRule': 'еще одно правило',
    'query.ignoreTip': 'Оставьте пустым, чтобы игнорировать запрос. Введите a=1&b=2, чтобы эти поля были обязательными.',
    'query.templateTip': 'Если флажок снят, запросы должны включать эти поля. Оставьте пустым, чтобы игнорировать запрос. Допускаются дополнительные поля и любой порядок.',
    'query.mergeTip': 'Если этот параметр включен, разные значения запроса группируются вместе. Отключите его, чтобы редактировать соответствие обязательных полей.',
    'query.matchingTitle': 'Запрос, используемый для сопоставления',
    'query.ignoredTitle': 'Запрос игнорируется для соответствия',
    'query.deleteAria': 'Удалить из запроса соответствия',
    'body.deleteAria': 'Удалить из тела запроса на совпадение',
    'remote.ruleEnabledAria': 'Включить правило',
    'actions.edit': 'Редактировать',
    'remote.summaryAria': 'Однострочное резюме',
    'remote.defaultDslMissing': 'отсутствующий',
    'remote.defaultDslEmpty': 'пустой',
    'actions.invalidJson': 'Неверный JSON',
    'actions.formatted': 'Отформатированный',
    'ai.statusQueued': 'В очереди',
    'ai.statusGenerating': 'Создание',
    'ai.statusGenerated': 'Сгенерировано',
    'ai.statusStopped': 'Остановлено',
    'ai.statusFailed': 'Генерация не удалась',
    'ai.copied': 'Скопировано',
    'ai.copyFailed': 'Не удалось скопировать',
    'ai.promptRequired': 'Введите запрос на создание правил AI.',
    'ai.queuedDots': 'В очереди...',
    'ai.submitJob': 'Отправка задания на создание ИИ...',
    'ai.generatingDots': 'Создание...',
    'ai.queued': 'В очереди',
    'ai.failedSentence': 'Генерация не удалась.',
    'ai.existingJob': 'Работа по созданию ИИ уже запущена.',
    'ai.enqueuedJob': 'Добавлен в очередь генерации ИИ.',
    'remote.previewFailed': 'Предварительный просмотр не удался.',
    'remote.incomplete': 'Правило перезаписи является неполным.',
    'remote.pathNoSpace': 'Ключевой путь не может содержать пробелов.',
    'remote.valueEncodeError': 'Значение содержит символы, которые невозможно закодировать.',
    'actions.repeatFailed': 'Повторить не удалось.',
    'actions.done': 'Сделанный',
    'capture.loadingDetail': 'Загрузка деталей запроса...',
    'capture.retryLater': 'Нажмите еще раз позже.',
    'capture.detailLoadFailed': 'Не удалось загрузить сведения о запросе.',
    'capture.hitLocal': 'Соответствующий местный макет',
    'capture.hitRemote': 'Соответствующее правило перезаписи',
    'capture.proxyFailed': 'Запрос прокси не удался',
    'capture.reason': 'Причина: {message}',
    'capture.type': 'Тип: {type}',
    'capture.requestTime': 'Время запроса {time}',
    'capture.detailTimeout': 'Время запроса сведений истекло. Повторите попытку позже.',
    'preview.request': 'Запросить предварительный просмотр',
    'preview.localEdit': 'Локальный редактор макетов',
    'preview.remoteEdit': 'Переписать редактор правил',
    'preview.globalRemote': 'Глобальное правило перезаписи',
    'tabs.query': 'Запрос',
    'tabs.modifyRules': 'Правила',
    'local.updateTip': 'Обновите существующий локальный макет с текущим запросом и ответом.',
    'remote.updateTip': 'Обновите данные запроса для существующего правила перезаписи, не перезаписывая отредактированные правила.',
    'note.ruleTip': 'Добавьте или отредактируйте однострочное примечание для этого правила. Пустые заметки скрываются в списке.',
    'note.apiTip': 'Добавьте или отредактируйте примечание для этого API. Пустые заметки скрываются в списке.',
    'diff.before': 'До',
    'diff.after': 'После',
    'diff.prev': 'Предыдущий дифференциал',
    'diff.next': 'Следующий дифференциал',
    'diff.current': 'Перейти к текущему дифференциалу',
    'diff.copyAll': 'Скопируйте весь текст {title}',
    'diff.copyFailed': 'Не удалось скопировать',
    'diff.omittedLines': '... опущены неизмененные строки {count}...',
    'diff.truncated': '... слишком длинный контент, усеченные символы {count}...',
    'diff.viewFull': 'Посмотреть полный контент для этой стороны',
    'diff.back': '← Вернуться к различиям',
    'diff.fullTitle': '{title} · Полный предварительный просмотр',
    'rule.global': 'Глобальное правило',
    'rule.matchSummary': 'Матч: {text}',
    'query.none': 'Нет параметров запроса',
    'capture.requestDetail': 'Запросить детали',
    'aiGuide.myRequest': 'Мой запрос:',
    'aiGuide.outputOnly': 'Выведите только полный скрипт Python. Не используйте Markdown, ограничения кода или пояснительный текст.',
    'aiGuide.commentSafe': 'Комментарии должны резюмировать только логику. Не включайте полные тела запроса, тела ответа, base64 или конфиденциальные данные.',
    'aiGuide.comment': 'В верхней части скрипта, начиная с первой строки, напишите подробные комментарии Python, описывающие, что делает скрипт, на какие этапы он влияет, какие поля сопоставляет или изменяет, а также проходят ли несовпадающие запросы.',
    'aiGuide.stdlib': 'Используйте только стандартную библиотеку Python. Не осуществляйте доступ к сети, не читайте и не записывайте локальные файлы и не печатайте пояснительный текст.',
    'aiGuide.noSensitive': 'Не помещайте полные тела запросов, тела ответов, содержимое base64 или ctx в исключения, утверждения, вывод на печать, сводку или возвращаемые ошибки.',
    'aiGuide.dropBase64': 'Если вы меняете строку тела, удалите bodyBase64 из соответствующего объекта, чтобы старое значение base64 не могло переопределить изменение тела.',
    'aiGuide.base64': 'bodyBase64 предназначен только для двоичного содержимого. Если не требуется обработка двоичных файлов, не читайте, не анализируйте и не переписывайте bodyBase64.',
    'aiGuide.parseBody': 'При изменении текста в формате JSON или URL-адреса отдавайте предпочтение синтаксическому анализу и редактированию ctx[\"request\"][\"body\"] или ctx[\"response\"][\"body\"].',
    'aiGuide.returnCtx': 'Измените ctx напрямую и верните ctx. Если этап не требует изменений, верните ctx без изменений.',
    'aiGuide.crossIntent': 'Намерение пользователя может описывать межэтапную логику, например: «когда тело запроса xxx, изменить тело ответа xxx» или «когда параметр запроса xxx, изменить заголовок ответа xxx». Прочитайте условия ctx[\"request\"] на соответствующем этапе и измените ctx[\"response\"] или запрошенные целевые поля.',
    'aiGuide.crossContext': 'Сценарий может использовать полный контекст запроса и ответа из одной транзакции. Например, если тип тела запроса = добро пожаловать, вкладка запроса = главная или заголовок запроса соответствует значению, измените тело ответа, заголовки ответа или тело запроса.',
    'aiGuide.response': 'ctx[\"response\"] содержит statusCode, statusMessage, заголовки, тело, bodyBase64 и contentType.',
    'aiGuide.request': 'ctx[\"request\"] содержит метод, URL-адрес, заголовки, запрос, путь, тело, bodyBase64 и contentType.',
    'aiGuide.stage': 'ctx[\"этап\"] — это один из следующих значений: request_head, request_body, response_head или response_body.',
    'aiGuide.ctxCall': 'Скрипт запускается во время проксирования и получает словарь ctx. Вы можете определить handle(ctx) или определить on_request_head(ctx), on_request_body(ctx), on_response_head(ctx) и on_response_body(ctx).',
    'aiGuide.ruleSample': 'Это правило обычно включает в себя один образец запроса. Вы можете использовать образцы полей в качестве образца, но при этом проверять наличие полей во время выполнения.',
    'aiGuide.globalSample': 'Не существует фиксированного образца запроса или ответа. Не предполагайте, что существует какой-либо путь, запрос, тело запроса или тело ответа. В сценарии безопасно проверяйте поля ctx времени выполнения, такие как метод, путь, запрос, заголовки и тело, прежде чем что-либо менять.',
    'aiGuide.ruleIntro': 'Вы создаете правило перезаписи для HttpMocker. Правило должно быть сценарием Python.',
    'aiGuide.globalIntro': 'Вы создаете глобальное правило перезаписи для HttpMocker. Он применяется только к хосту {host} и может выполняться для каждого запроса на этом хосте. Правило должно быть сценарием Python.',
    'aiGuide.title': 'Запрос на копирование на внешний AI',
    'aiGuide.missingHost': '[сначала введите хост]',
    'aiGuide.empty': '[пустой]',
    'capture.loading': 'Загрузка...',
    'local.action': 'Сохранить локально',
    'remote.action': 'Перехват',
  },
  hi: {
    'startup.title': 'HttpMocker पैनल तैयार कर रहा है',
    'startup.subtitle': 'अनुरोध, नियम और सेटिंग लोड हो रही हैं...',
    'startup.errorTitle': 'पैनल शुरू नहीं हो सका',
    'startup.errorMessage': 'शुरुआत विफल रही। पेज रीफ्रेश करके फिर प्रयास करें।',
    'project.guide': 'प्रोजेक्ट फ़ोल्डर चुनने के लिए क्लिक करें',
    'project.noDomain': 'कोई डोमेन नहीं',
    'project.selectDirectory': 'प्रोजेक्ट फ़ोल्डर चुनें',
    'project.clearDirectory': 'प्रोजेक्ट लिंक हटाएं',
    'project.linkedDirectory': 'लिंक्ड प्रोजेक्ट: {path}\nप्रोजेक्ट लिंक साफ़ करने के लिए क्लिक करें।',
    'project.needDirectory': 'इस डोमेन के लिए AI को स्थानीय प्रोजेक्ट की आवश्यकता है। प्रोजेक्ट फ़ोल्डर चुनने के लिए क्लिक करें.',
    'project.pickDirectoryTip': 'इस अनुरोध समूह के लिए स्थानीय प्रोजेक्ट चुनें.',
    'project.selectPathFailed': 'प्रोजेक्ट पथ चुनने में विफल.',
    'project.domainTabs': 'प्रोजेक्ट डोमेन',
    'project.dialog.historyTitle': 'डोमेन इतिहास',
    'project.dialog.selectTitle': 'डोमेन चुनें',
    'project.dialog.addTitle': 'डोमेन जोड़ें',
    'project.dialog.initialHistory': 'प्रोजेक्ट खोलने के लिए इतिहास से एक डोमेन चुनें।',
    'project.dialog.initial': 'पहले एक प्रोजेक्ट डोमेन चुनें, या प्रत्येक अनुरोध और नियम को देखने के लिए सभी डोमेन का उपयोग करें।',
    'project.dialog.history': 'वर्तमान प्रोजेक्ट के रूप में इतिहास से एक डोमेन चुनें।',
    'project.dialog.add': 'एक प्रोजेक्ट डोमेन जोड़ें.',
    'project.dialog.noHistoryInitial': 'कोई डोमेन इतिहास नहीं. फ़ाइल मेनू से एक डोमेन जोड़ें, फिर दोबारा खोलें।',
    'project.dialog.noHistory': 'कोई डोमेन इतिहास नहीं.',
    'nav.captures': 'हाल के अनुरोध',
    'nav.local': 'लोकल मॉक',
    'nav.remote': 'रीराइट',
    'nav.mainTools': 'मुख्य नेविगेशन और उपकरण',
    'nav.requestsAndRules': 'अनुरोध और नियम',
    'layout.resizer': 'सूची और पूर्वावलोकन फलक का आकार बदलें',
    'globalSearch.title': 'वैश्विक खोज',
    'globalSearch.tip': 'वर्तमान प्रोजेक्ट में खोज क्वेरी, अनुरोध शीर्षलेख, अनुरोध निकाय और प्रतिक्रिया निकाय। शॉर्टकट: Cmd+Shift+F',
    'globalSearch.placeholder': 'खोज क्वेरी, हेडर, अनुरोध निकाय, प्रतिक्रिया निकाय',
    'globalSearch.currentProject': 'वर्तमान परियोजना: {domain}',
    'globalSearch.allDomains': 'वर्तमान परियोजना: सभी डोमेन',
    'globalSearch.loading': 'खोज रहे हैं...',
    'globalSearch.start': 'खोजने के लिए एक कीवर्ड दर्ज करें.',
    'globalSearch.noResults': 'कोई मेल नहीं।',
    'globalSearch.failed': 'खोज विफल रही.',
    'globalSearch.unknownHost': 'अज्ञात मेज़बान',
    'update.available': 'नया संस्करण {version} उपलब्ध है',
    'update.openRelease': 'अपडेट पाएं',
    'update.availableTitle': 'अपडेट उपलब्ध है',
    'update.dialogAvailable': 'संस्करण {version} डाउनलोड के लिए तैयार है.',
    'update.noUpdateTitle': 'पहले से नवीनतम',
    'update.noUpdate': 'आप पहले से नवीनतम संस्करण पर हैं.',
    'update.checkFailedTitle': 'अपडेट जांच विफल',
    'update.checkFailed': 'अपडेट जांच विफल रही. बाद में फिर कोशिश करें.',
    'clear.history': 'इतिहास साफ़ करें',
    'clear.menuTip': 'चुनें कि कौन सा हालिया अनुरोध इतिहास साफ़ करना है।',
    'clear.older': 'पुरानी प्रविष्टियाँ साफ़ करें',
    'clear.allHistory': 'सारा इतिहास साफ़ करें',
    'clear.notes': 'स्पष्ट नोट्स',
    'clear.rules': 'स्पष्ट नियम',
    'clear.confirmAllCaptures': 'सभी हालिया अनुरोध इतिहास साफ़ करें?\n\nयह वर्तमान अनुरोध सूची और पुरानी प्रविष्टियों को हटा देता है, लेकिन नोट्स और नियम रखता है।',
    'clear.confirmOlderCaptures': 'पुरानी प्रविष्टियाँ साफ़ करें?\n\nयह प्रत्येक अनुरोध के विस्तार के बाद दिखाए गए पुराने टाइमस्टैम्प को हटा देता है और वर्तमान मर्ज सेटिंग्स के तहत प्रति समूह केवल नवीनतम अनुरोध रखता है। हाल के अनुरोध, नोट्स और नियम रखे गए हैं।',
    'clear.confirmNotes': 'सभी नोट्स और विस्तृत स्पष्टीकरण साफ़ करें?\n\nयह मैन्युअल नोट्स, AI-जनरेटेड नोट्स और विस्तृत स्पष्टीकरण हटा देता है। अनुरोध इतिहास और नियम रखे गए हैं।',
    'clear.confirmRules': 'सभी नियम साफ़ करें?\n\nयह सभी स्थानीय नकली हटा देता है और उनके कैश्ड डेटा सहित नियमों को फिर से लिखता है। अनुरोध इतिहास और नोट्स रखे गए हैं।',
    'capture.viewToggle': 'हालिया अनुरोध दृश्य टॉगल करें',
    'capture.viewTreeTip': 'वृक्ष दृश्य सक्रिय है. सूची दृश्य पर स्विच करने के लिए क्लिक करें.',
    'capture.viewListTip': 'सूची दृश्य सक्रिय है. वृक्ष दृश्य पर स्विच करने के लिए क्लिक करें.',
    'capture.filterPlaceholder': 'एपीआई पथ या नोट द्वारा फ़िल्टर करें',
    'capture.listAria': 'हालिया अनुरोध सूची',
    'capture.mergeByQuery': 'क्वेरी के आधार पर अलग-अलग समूह बनाएं',
    'capture.mergeByBody': 'अनुरोध निकाय द्वारा अलग से समूह बनाएं',
    'capture.originalBody': 'मूल अनुरोध निकाय',
    'capture.empty': 'अभी कोई अनुरोध नहीं। ब्राउज़र या ऐप प्रॉक्सी को इस मशीन पर सेट करें और पेज रीफ्रेश करें।',
    'capture.noMatch': 'कोई मेल खाता अनुरोध नहीं.',
    'capture.historyAria': 'इतिहास टाइमस्टैम्प का अनुरोध करें',
    'capture.olderToggle': 'पुरानी प्रविष्टियाँ · {action} पर क्लिक करें',
    'capture.expand': 'बढ़ाना',
    'capture.collapse': 'गिर जाना',
    'capture.unknownHost': 'अज्ञात मेज़बान',
    'local.listAria': 'स्थानीय मॉक सूची',
    'local.actionTip': 'वर्तमान प्रतिक्रिया को स्थानीय मॉक के रूप में सहेजें। मिलान अनुरोध इस स्थानीय सामग्री को सीधे वापस कर देंगे।',
    'local.empty': 'अभी तक कोई स्थानीय मॉक नहीं. हाल के अनुरोधों में से एक बनाएं.',
    'rule.hitCaptures': 'Matched requests',
    'remote.listAria': 'नियम सूची पुनः लिखें',
    'remote.actionTip': 'पुनर्लेखन नियम बनाएं जो प्रॉक्सी करते समय क्वेरी, हेडर, अनुरोध बॉडी या प्रतिक्रिया बॉडी को संशोधित कर सकते हैं।',
    'remote.globalEnabled': 'वैश्विक नियम सक्षम करें',
    'remote.globalRules': 'वैश्विक नियम',
    'remote.addGlobalRule': 'वैश्विक नियम जोड़ें',
    'remote.addRule': 'पुनर्लेखन नियम जोड़ें',
    'remote.addRuleTip': 'पुनर्लेखन नियम जोड़ें.',
    'remote.aiRule': 'एआई स्क्रिप्ट नियम',
    'remote.manualRule': 'मैनुअल नियम',
    'remote.back': 'नियम सूची पर वापस जाएँ',
    'remote.backTip': 'नियम सूची पर वापस जाएँ।',
    'remote.summaryPlaceholder': 'एक-पंक्ति नियम सारांश',
    'remote.aiSummaryPlaceholder': 'एक-पंक्ति एआई नियम सारांश, केवल प्रदर्शित करें',
    'remote.aiSummaryTip': 'केवल नियम सूची और विवरण दृश्य में उपयोग किया जाता है। इसका उपयोग AI पीढ़ी के संदर्भ के रूप में नहीं किया जाता है।',
    'remote.chooseAction': 'कार्रवाई का चयन',
    'remote.help': 'नियम सिंटैक्स देखें',
    'remote.helpTip': 'नियम सिंटैक्स को फिर से लिखने के लिए उदाहरण देखें।',
    'remote.path': 'पथ',
    'remote.helpActions': 'क्वेरी, अनुरोध शीर्षलेख, अनुरोध निकाय, प्रतिक्रिया शीर्षलेख या प्रतिक्रिया निकाय बदलें।',
    'remote.valuePlaceholder': 'खाली हटाएँ / 123 / सत्य / \"स्ट्रिंग\"',
    'remote.emptyDeletes': 'लक्ष्य नोड को हटाने के लिए खाली छोड़ दें',
    'remote.aiPromptPlaceholder': 'क्रॉस-अनुरोध/प्रतिक्रिया स्थितियों और परिवर्तनों का वर्णन करें। उदाहरण: जब बॉडी टाइप=स्वागत का अनुरोध करें, तो केवल पहला इनाम_सूची आइटम रखें और सिक्कों को 100 पर सेट करें।',
    'remote.aiGenerate': 'उत्पन्न',
    'remote.copyPrompt': 'प्रॉम्प्ट कॉपी करें',
    'remote.copyPromptTip': 'बाईं ओर दिए गए प्रॉम्प्ट को कॉपी करें और स्क्रिप्ट तैयार करने के लिए इसे बाहरी AI को भेजें।',
    'remote.aiScriptPlaceholder': 'एआई-जनरेटेड पायथन स्क्रिप्ट। आप इसे मैन्युअल रूप से संपादित कर सकते हैं.',
    'remote.example': 'उदाहरण',
    'remote.exampleTabsAria': 'नियम उदाहरण पुनः लिखें',
    'remote.compatExample': 'उदाहरण (compat)',
    'remote.afterQuery': 'पुनः लिखित क्वेरी',
    'remote.afterRequestHead': 'पुनः लिखित अनुरोध शीर्षलेख',
    'remote.afterResponseHead': 'पुनर्लिखित प्रतिक्रिया शीर्षलेख',
    'remote.afterRequestBody': 'पुनः लिखित अनुरोध निकाय',
    'remote.afterResponseBody': 'पुनः लिखित प्रतिक्रिया निकाय',
    'remote.action.query': 'क्वेरी बदलें',
    'remote.action.requestHead': 'अनुरोध शीर्षलेख बदलें',
    'remote.action.requestBody': 'अनुरोध निकाय बदलें',
    'remote.action.responseHead': 'प्रतिक्रिया शीर्षलेख बदलें',
    'remote.action.responseBody': 'प्रतिक्रिया निकाय बदलें',
    'remote.action.placeholder': 'कार्रवाई का चयन',
    'remote.emptySteps': 'कोई पुनर्लेखन नियम नहीं',
    'remote.dragSort': 'पुन: व्यवस्थित करने के लिए खींचें',
    'remote.editAiRule': 'इस AI नियम को संपादित करें.',
    'remote.editManualRule': 'इस मैन्युअल नियम को संपादित करें.',
    'remote.deleteAiRule': 'इस AI नियम को हटाएँ.',
    'remote.deleteManualRule': 'इस पुनर्लेखन नियम को हटा दें.',
    'remote.aiDefaultSummary': 'एआई स्क्रिप्ट नियम',
    'remote.manualDefaultSummary': 'मैनुअल नियम',
    'remote.previewError': 'नियम त्रुटियाँ',
    'remote.diffBefore': 'मूल',
    'remote.diffAfter': 'बाद',
    'preview.title': 'पूर्वावलोकन',
    'preview.emptyTitle': 'पूर्वावलोकन करने के लिए अनुरोध या स्थानीय मॉक चुनें',
    'preview.searchPlaceholder': 'वर्तमान पूर्वावलोकन खोजें',
    'preview.tabsAria': 'अनुरोध और प्रतिक्रिया निकाय',
    'query.params': 'क्वेरी पैरामीटर',
    'tabs.overview': 'सारांश',
    'overview.request': 'अनुरोध',
    'overview.response': 'उत्तर',
    'overview.connection': 'कनेक्शन',
    'overview.timing': 'समय',
    'overview.size': 'आकार',
    'overview.url': 'यूआरएल',
    'overview.method': 'विधि',
    'overview.protocol': 'शिष्टाचार',
    'overview.path': 'पथ',
    'overview.query': 'सवाल',
    'overview.contentType': 'सामग्री-प्रकार',
    'overview.bodySize': 'शरीर का नाप',
    'overview.status': 'स्थिति',
    'overview.loading': 'लोड हो रहा है',
    'overview.failed': 'विफल',
    'overview.complete': 'पूर्ण',
    'overview.error': 'गलती',
    'overview.responseCode': 'प्रतिसाद कोड',
    'overview.responseMessage': 'प्रतिक्रिया संदेश',
    'overview.mapping': 'मानचित्रण',
    'overview.clientAddress': 'ग्राहक का पता',
    'overview.remoteAddress': 'दूरस्थ पता',
    'overview.keptAlive': 'जिंदा रखा',
    'overview.ssl': 'एसएसएल',
    'overview.yes': 'हाँ',
    'overview.no': 'नहीं',
    'overview.advanced': 'विकसित',
    'overview.clientConnection': 'ग्राहक कनेक्शन',
    'overview.serverConnection': 'सर्वर कनेक्शन',
    'overview.streamId': 'स्ट्रीम आईडी',
    'overview.clientSettings': 'ग्राहक सेटिंग्स',
    'overview.serverSettings': 'सर्वर सेटिंग्स',
    'overview.requestStartTime': 'प्रारंभ समय का अनुरोध करें',
    'overview.requestEndTime': 'समाप्ति समय का अनुरोध करें',
    'overview.responseStartTime': 'प्रतिक्रिया प्रारंभ समय',
    'overview.responseEndTime': 'प्रतिक्रिया समाप्ति समय',
    'overview.duration': 'अवधि',
    'overview.dns': 'डीएनएस',
    'overview.connect': 'जोड़ना',
    'overview.tlsHandshake': 'टीएलएस हैंडशेक',
    'overview.latency': 'विलंब',
    'overview.speed': 'रफ़्तार',
    'overview.requestSpeed': 'गति का अनुरोध करें',
    'overview.responseSpeed': 'प्रतिक्रिया की गति',
    'overview.header': 'हैडर',
    'overview.queryString': 'क्वेरी स्ट्रिंग',
    'overview.cookies': 'कुकीज़',
    'overview.body': 'शरीर',
    'overview.uncompressedBody': 'असम्पीडित शरीर',
    'overview.compression': 'दबाव',
    'overview.total': 'कुल',
    'tabs.matchQuery': 'मिलान क्वेरी',
    'tabs.requestHead': 'शीर्षलेखों का अनुरोध करें',
    'tabs.requestBody': 'अनुरोध निकाय',
    'tabs.matchBody': 'मिलान अनुरोध निकाय',
    'tabs.responseHead': 'प्रतिक्रिया शीर्षलेख',
    'tabs.responseBody': 'प्रतिक्रिया निकाय',
    'actions.copyCurl': 'कर्ल कॉपी करें',
    'actions.copyCurlTip': 'वर्तमान अनुरोध के लिए URL, हेडर और बॉडी सहित पूर्ण कर्ल की प्रतिलिपि बनाएँ।',
    'actions.repeat': 'दोहराएँ',
    'actions.repeatTip': 'प्रॉक्सी के माध्यम से वर्तमान अनुरोध पुनः भेजें। परिणाम हालिया अनुरोधों में दिखाई देगा.',
    'actions.delete': 'हटाएं',
    'actions.deleteRuleTip': 'चयनित स्थानीय मॉक या पुनर्लेखन नियम हटाएँ।',
    'actions.format': 'प्रारूप',
    'actions.formatTip': 'वर्तमान JSON सामग्री को प्रारूपित करें.',
    'actions.manualSaveTip': 'यह मिलान दायरा किसी अन्य नियम को ओवरलैप करता है और इसके लिए मैन्युअल पुष्टि की आवश्यकता होती है।',
    'actions.prev': 'पहले का',
    'actions.next': 'अगला',
    'actions.close': 'बंद करें',
    'actions.cancel': 'रद्द करें',
    'actions.failed': 'प्रचालन विफल रहा।',
    'actions.open': 'खुला',
    'actions.add': 'जोड़ना',
    'actions.search': 'खोजें',
    'actions.clear': 'स्पष्ट',
    'actions.save': 'सेव करें',
    'actions.saveFailed': 'सहेजना विफल.',
    'actions.stop': 'रुकना',
    'actions.start': 'शुरू',
    'actions.stopping': 'रोक',
    'actions.starting': 'प्रारंभ',
    'common.domain': 'डोमेन',
    'common.enabled': 'सक्षम',
    'common.action': 'क्रिया',
    'common.value': 'मान',
    'common.idle': 'निठल्ला',
    'common.running': 'दौड़ना',
    'common.queued': 'कतारबद्ध',
    'status.localIp': 'लोकल IP',
    'status.proxyPort': 'प्रॉक्सी पोर्ट',
    'status.proxyStopped': 'प्रॉक्सी बंद है',
    'status.recording': 'रिकॉर्ड हो रहा है',
    'status.passThrough': 'केवल पास-थ्रू',
    'status.stopRecording': 'रिकॉर्डिंग बंद करें',
    'status.startRecording': 'रिकॉर्डिंग प्रारंभ करें',
    'status.stopRecordingTip': 'प्रॉक्सी को उपलब्ध रखें, लेकिन सभी अनुरोधों को बिना रिकॉर्ड किए या नियम लागू किए पास करें।',
    'status.startRecordingTip': 'प्रॉक्सी के माध्यम से अनुरोधों को रिकॉर्ड करना और संसाधित करना प्रारंभ करें।',
    'status.toggleFailed': 'रिकॉर्डिंग स्थिति बदलने में विफल.',
    'adb.refreshDevices': 'Android डिवाइस रीफ़्रेश करें.',
    'adb.chooseDevice': 'Android डिवाइस चुनें',
    'adb.chooseProxy': 'प्रॉक्सी को सेट या साफ़ करने के लिए एक Android डिवाइस चुनें।',
    'adb.setProxy': 'फ़ोन प्रॉक्सी सेट करें',
    'adb.clearProxy': 'फ़ोन प्रॉक्सी साफ़ करें',
    'adb.setProxyFor': 'फ़ोन प्रॉक्सी सेट करें: {device}',
    'adb.clearProxyFor': 'फ़ोन प्रॉक्सी साफ़ करें: {device}',
    'adb.clearProxyTip': 'फ़ोन पर प्रॉक्सी सेटिंग साफ़ करें.',
    'adb.setProxyTip': 'फ़ोन प्रॉक्सी को इस मशीन पर सेट करें।',
    'adb.currentProxy': 'वर्तमान प्रॉक्सी: {proxy}',
    'adb.noProxy': 'कोई प्रॉक्सी कॉन्फ़िगर नहीं की गई',
    'adb.guide': 'फ़ोन प्रॉक्सी सेट करने के लिए क्लिक करें',
    'adb.failed': 'एडीबी कार्रवाई विफल रही.',
    'adb.pathHint': 'सुनिश्चित करें कि adb स्थापित है और PATH में उपलब्ध है।',
    'ai.none': 'AI का उपयोग न करें',
    'ai.switchTip': 'AI प्रदाता स्विच करें. वर्तमान: {provider}',
    'ai.disabledRuleTip': 'AI अक्षम है, इसलिए AI नियम नहीं बनाए जा सकते।',
    'ai.addRuleTip': 'एआई पायथन स्क्रिप्ट नियम जोड़ें।',
    'ai.ask': 'AI से पूछें',
    'ai.askTip': 'नया टर्मिनल खोलकर यह अनुरोध, प्रोजेक्ट निर्देशिका और संदर्भ चुने हुए AI प्रदाता को भेजें।',
    'ai.askNoProject': 'पहले स्थानीय प्रोजेक्ट निर्देशिका जोड़ें।',
    'ai.askFailed': 'AI टर्मिनल खोलने में विफल।',
    'ai.statusTitle': 'एआई कार्य स्थिति',
    'ai.scriptGeneration': 'एआई स्क्रिप्ट जनरेशन',
    'ai.noteAnalysis': 'नोट विश्लेषण',
    'ai.detailAnalysis': 'विस्तृत विवरण',
    'ai.provider': 'प्रदाता',
    'ai.autoNotes': 'ऑटो नोट्स',
    'ai.totalQueue': 'कुल कतार',
    'ai.running': 'दौड़ना',
    'ai.pending': 'कतारबद्ध',
    'ai.failed': 'असफल',
    'ai.completed': 'पुरा होना',
    'ai.current': 'मौजूदा',
    'ai.lastFailure': 'आखिरी असफलता',
    'ai.runPending': 'दौड़ना/पंक्तिबद्ध होना',
    'ai.completedFailed': 'पूर्ण/विफल',
    'ai.runningState': 'दौड़ना',
    'ai.stoppedState': 'रुक गया',
    'ai.failedShort': 'कोडेक्स विफल {count}',
    'ai.generationQueue': 'एआई पीढ़ी {running}/{total}{pendingText}',
    'ai.pendingSuffix': '· पंक्तिबद्ध {pending}',
    'ai.noteQueue': 'नोट्स {state} {running}/{total}',
    'ai.detailQueue': 'विवरण {state} {running}/{total}',
    'ai.disabledWorkTip': 'AI अक्षम है, इसलिए कार्य प्रारंभ नहीं हो सकता.',
    'ai.stopWorkTip': 'एआई कार्य बंद करें, कतारबद्ध नौकरियों को साफ़ करें, और एआई नियम निर्माण को बाधित करें।',
    'ai.startWorkTip': 'स्वचालित नोट विश्लेषण प्रारंभ करें और नोट्स के बिना एपीआई स्कैन करें।',
    'ai.toggleFailed': 'AI कार्य स्थिति बदलने में विफल.',
    'note.short': 'टिप्पणी',
    'note.actionTip': 'इस एपीआई के लिए मैन्युअल नोट जोड़ें या संपादित करें।',
    'note.title': 'एपीआई नोट',
    'note.placeholder': 'यह एपीआई क्या करती है?',
    'note.detail': 'विवरण',
    'note.detailTitle': 'एपीआई विस्तृत स्पष्टीकरण',
    'note.detailTip': 'इस एपीआई के लिए पैरामीटर, फ़ील्ड और कोड-संदर्भ विवरण बनाएं या देखें।',
    'note.detailGenerating': 'विस्तृत विवरण तैयार करना.',
    'note.detailFailed': 'विस्तृत विवरण विफल रहा.',
    'note.detailFailedTitle': 'विस्तृत विवरण विफल रहा',
    'note.detailFailedReason': 'कारण: {message}',
    'note.detailFailedAt': 'यहां विफल: {time}',
    'note.detailStillGenerating': 'विस्तृत विवरण अभी भी उत्पन्न हो रहा है। बाद में पुन: प्रयास।',
    'note.detailQueue': 'विस्तृत विवरण तैयार करते हुए, कतार {running}/{total}।',
    'note.emptyDetail': 'अभी तक कोई विस्तृत विवरण नहीं है.',
    'note.generateDetail': 'विवरण उत्पन्न करें',
    'note.detailFailureButton': 'विवरण विफल',
    'note.generating': 'उत्पादक',
    'note.viewDetailTip': 'इस एपीआई के लिए जेनरेट किए गए पैरामीटर, फ़ील्ड और कोड-संदर्भ विवरण देखें।',
    'note.viewFailureTip': 'देखें कि विस्तृत स्पष्टीकरण विफल क्यों हुआ।',
    'note.generatingTip': 'विस्तृत विवरण उत्पन्न हो रहा है। एआई कार्य स्थिति देखने के लिए क्लिक करें।',
    'note.generateTip': 'इस एपीआई के लिए पैरामीटर, फ़ील्ड और कोड-संदर्भ विवरण तैयार करें।',
    'note.regenerate': 'पुनः जेनरेट',
    'note.generate': 'उत्पन्न',
    'settings.title': 'सेटिंग',
    'settings.language': 'भाषा',
    'settings.appearance': 'दिखावट',
    'appearance.system': 'सिस्टम के अनुसार',
    'appearance.light': 'लाइट',
    'appearance.dark': 'डार्क',
    'settings.treeView': 'ट्री व्यू',
    'settings.mergeRequests': 'अनुरोध मर्ज करें',
    'settings.showListNotes': 'सूची में नोट दिखाएं',
    'settings.aiAutoNotes': 'AI से नोट अपने-आप बनाएं',
    'settings.maxHistory': 'अधिकतम इतिहास',
    'cert.download': 'प्रमाणपत्र डाउनलोड करें',
    'tree.expand': 'बढ़ाना',
    'tree.collapse': 'गिर जाना',
    'tree.actions': 'वृक्ष दृश्य क्रियाएँ',
    'tree.expandAll': 'सभी का विस्तार',
    'tree.collapseAll': 'सभी को संकुचित करें',
    'context.updateLocal': 'स्थानीय मॉक अपडेट करें',
    'context.createLocal': 'स्थानीय मॉक के रूप में सेट करें',
    'context.updateRemote': 'पुनर्लेखन नियम अद्यतन करें',
    'context.createRemote': 'पुनर्लेखन नियम के रूप में कॉन्फ़िगर करें',
    'context.addAsDomain': 'प्रोजेक्ट डोमेन के रूप में जोड़ें',
    'context.openDomain': 'डोमेन खोलें',
    'merge.querySourceError': 'मिलान क्वेरी केवल वर्तमान अनुरोध से पैरामीटर हटा सकती है। पैरामीटर जोड़ने, कुंजियों का नाम बदलने या मान बदलने के लिए मैन्युअल सेव की आवश्यकता होती है।',
    'merge.bodySourceError': 'मिलान अनुरोध निकाय केवल वर्तमान अनुरोध से फ़ील्ड हटा सकता है। फ़ील्ड जोड़ने, फ़ील्ड का नाम बदलने, मान बदलने या संरचना बदलने के लिए मैन्युअल सेव की आवश्यकता होती है।',
    'merge.sourceError': 'मिलान टेम्प्लेट केवल वर्तमान अनुरोध को सीमित कर सकते हैं। अन्य परिवर्तनों के लिए मैन्युअल सेव की आवश्यकता होती है।',
    'merge.conflictAutoSave': 'इस मिलान दायरे में समान एपीआई के लिए एक और समग्र कॉन्फ़िगरेशन शामिल है, इसलिए यह स्वचालित रूप से सहेजा नहीं जा सकता है। मिलान क्वेरी/अनुरोध का मुख्य भाग समायोजित करें, या फिर से सत्यापित करने के लिए सहेजें पर क्लिक करें।',
    'merge.manualSaveDefault': 'यह मिलान दायरा किसी अन्य नियम को ओवरलैप करता है। मैन्युअल रूप से सहेजें और दोबारा सत्यापित करें.',
    'merge.conflictSave': 'नियम मिलान का दायरा किसी अन्य नियम को ओवरलैप करता है और सहेजा नहीं जा सकता।',
    'merge.conflictWithRule': 'यह मिलान दायरा \"{target}\" को ओवरलैप करता है और ऑटो-सेव नहीं कर सकता। मिलान क्वेरी/अनुरोध का मुख्य भाग समायोजित करें, या फिर से सत्यापित करने के लिए सहेजें पर क्लिक करें।',
    'merge.otherRule': 'एक और नियम',
    'query.ignoreTip': 'क्वेरी को अनदेखा करने के लिए खाली छोड़ें. उन फ़ील्ड की आवश्यकता के लिए a=1&b=2 दर्ज करें।',
    'query.templateTip': 'अनियंत्रित होने पर, अनुरोधों में ये फ़ील्ड शामिल होने चाहिए। क्वेरी को अनदेखा करने के लिए खाली छोड़ें. अतिरिक्त फ़ील्ड और किसी भी ऑर्डर की अनुमति है।',
    'query.mergeTip': 'सक्षम होने पर, विभिन्न क्वेरी मानों को एक साथ समूहीकृत किया जाता है। आवश्यक-फ़ील्ड मिलान को संपादित करने के लिए इसे अक्षम करें।',
    'query.matchingTitle': 'मिलान के लिए क्वेरी का उपयोग किया जाता है',
    'query.ignoredTitle': 'मिलान के लिए क्वेरी पर ध्यान नहीं दिया गया',
    'query.deleteAria': 'मिलान क्वेरी से हटाएँ',
    'body.deleteAria': 'मिलान अनुरोध निकाय से हटाएँ',
    'remote.ruleEnabledAria': 'नियम सक्षम करें',
    'actions.edit': 'संपादन करना',
    'remote.summaryAria': 'एक पंक्ति का सारांश',
    'remote.defaultDslMissing': 'गुम',
    'remote.defaultDslEmpty': 'खाली',
    'actions.invalidJson': 'अमान्य JSON',
    'actions.formatted': 'प्रारूपित',
    'ai.statusQueued': 'कतारबद्ध',
    'ai.statusGenerating': 'उत्पादक',
    'ai.statusGenerated': 'जनरेट किया गया',
    'ai.statusStopped': 'रुक गया',
    'ai.statusFailed': 'पीढ़ी विफल रही',
    'ai.copied': 'कॉपी किया गया',
    'ai.copyFailed': 'प्रतिलिपि विफल',
    'ai.promptRequired': 'एआई नियम निर्माण के लिए एक संकेत दर्ज करें।',
    'ai.queuedDots': 'पंक्तिबद्ध...',
    'ai.submitJob': 'एआई जनरेशन जॉब सबमिट किया जा रहा है...',
    'ai.generatingDots': 'उत्पन्न हो रहा है...',
    'ai.queued': 'कतारबद्ध',
    'ai.failedSentence': 'पीढ़ी विफल रही.',
    'ai.existingJob': 'एआई पीढ़ी का कार्य पहले से ही चल रहा है।',
    'ai.enqueuedJob': 'एआई पीढ़ी कतार में जोड़ा गया।',
    'remote.previewFailed': 'पूर्वावलोकन विफल रहा.',
    'remote.incomplete': 'पुनर्लेखन नियम अधूरा है.',
    'remote.pathNoSpace': 'मुख्य पथ में रिक्त स्थान नहीं हो सकते.',
    'remote.valueEncodeError': 'मान में ऐसे वर्ण होते हैं जिन्हें एन्कोड नहीं किया जा सकता.',
    'actions.repeatFailed': 'दोहराना विफल रहा.',
    'actions.done': 'हो गया',
    'capture.loadingDetail': 'अनुरोध विवरण लोड हो रहा है...',
    'capture.retryLater': 'बाद में पुनः क्लिक करें.',
    'capture.detailLoadFailed': 'अनुरोध विवरण लोड करने में विफल.',
    'capture.hitLocal': 'स्थानीय मॉक से मिलान किया गया',
    'capture.hitRemote': 'सुमेलित पुनर्लेखन नियम',
    'capture.proxyFailed': 'प्रॉक्सी अनुरोध विफल रहा',
    'capture.reason': 'कारण: {message}',
    'capture.type': 'प्रकार: {type}',
    'capture.requestTime': 'अनुरोध समय {time}',
    'capture.detailTimeout': 'अनुरोध विवरण का समय समाप्त हो गया. बाद में पुन: प्रयास।',
    'preview.request': 'पूर्वावलोकन का अनुरोध करें',
    'preview.localEdit': 'स्थानीय नकली संपादक',
    'preview.remoteEdit': 'नियम संपादक को फिर से लिखें',
    'preview.globalRemote': 'वैश्विक पुनर्लेखन नियम',
    'tabs.query': 'सवाल',
    'tabs.modifyRules': 'नियम',
    'local.updateTip': 'वर्तमान अनुरोध और प्रतिक्रिया के साथ मौजूदा स्थानीय मॉक को ताज़ा करें।',
    'remote.updateTip': 'संपादित नियमों को अधिलेखित किए बिना मौजूदा पुनर्लेखन नियम के लिए अनुरोध डेटा ताज़ा करें।',
    'note.ruleTip': 'इस नियम के लिए एक पंक्ति का नोट जोड़ें या संपादित करें। सूची में खाली नोट छिपे हुए हैं.',
    'note.apiTip': 'इस एपीआई के लिए एक नोट जोड़ें या संपादित करें। सूची में खाली नोट छिपे हुए हैं.',
    'diff.before': 'पहले',
    'diff.after': 'बाद',
    'diff.prev': 'पिछला अंतर',
    'diff.next': 'अगला अंतर',
    'diff.current': 'वर्तमान अंतर पर जाएं',
    'diff.copyAll': 'सभी {title} पाठ की प्रतिलिपि बनाएँ',
    'diff.copyFailed': 'प्रतिलिपि विफल',
    'diff.omittedLines': '... छोड़ी गई {count} अपरिवर्तित पंक्तियाँ ...',
    'diff.truncated': '...सामग्री बहुत लंबी है, {count} अक्षर काट दिए गए हैं...',
    'diff.viewFull': 'इस पक्ष के लिए पूरी सामग्री देखें',
    'diff.back': '← अंतर पर वापस जाएँ',
    'diff.fullTitle': '{title} · पूर्ण पूर्वावलोकन',
    'rule.global': 'वैश्विक नियम',
    'rule.matchSummary': 'मिलान: {text}',
    'query.none': 'कोई क्वेरी पैरामीटर नहीं',
    'capture.requestDetail': 'विवरण का अनुरोध करें',
    'aiGuide.myRequest': 'मेरा अनुरोध:',
    'aiGuide.outputOnly': 'केवल संपूर्ण पायथन स्क्रिप्ट आउटपुट करें। मार्कडाउन, कोड बाड़, या व्याख्यात्मक पाठ का उपयोग न करें।',
    'aiGuide.commentSafe': 'टिप्पणियों में केवल तर्क का सारांश होना चाहिए। संपूर्ण अनुरोध निकाय, प्रतिक्रिया निकाय, बेस64, या संवेदनशील डेटा शामिल न करें।',
    'aiGuide.comment': 'स्क्रिप्ट के शीर्ष पर, पहली पंक्ति से शुरू करते हुए, विस्तृत पायथन टिप्पणियाँ लिखें जो बताती हैं कि स्क्रिप्ट क्या करती है, यह किन चरणों को प्रभावित करती है, यह किन क्षेत्रों से मेल खाती है या बदलती है, और क्या बेजोड़ अनुरोध गुजरते हैं।',
    'aiGuide.stdlib': 'केवल पायथन मानक लाइब्रेरी का उपयोग करें। नेटवर्क तक न पहुंचें, स्थानीय फ़ाइलें न पढ़ें/लिखें, न ही व्याख्यात्मक पाठ प्रिंट करें।',
    'aiGuide.noSensitive': 'पूर्ण अनुरोध निकाय, प्रतिक्रिया निकाय, बेस64, या सीटीएक्स सामग्री को अपवादों, अभिकथनों, प्रिंट आउटपुट, सारांश, या लौटाई गई त्रुटियों में न डालें।',
    'aiGuide.dropBase64': 'यदि आप बॉडी स्ट्रिंग बदलते हैं, तो संबंधित ऑब्जेक्ट से बॉडीबेस64 को हटा दें ताकि पुराना बेस64 मान आपके बॉडी परिवर्तन को ओवरराइड न कर सके।',
    'aiGuide.base64': 'bodyBase64 केवल बाइनरी सामग्री के लिए है। जब तक बाइनरी हैंडलिंग की आवश्यकता न हो, bodyBase64 को न पढ़ें, पार्स न करें या दोबारा न लिखें।',
    'aiGuide.parseBody': 'JSON या URL-एन्कोडेड टेक्स्ट बदलते समय, ctx[\"अनुरोध\"][\"body\"] या ctx[\"प्रतिक्रिया\"][\"body\"] को पार्स करने और संपादित करने को प्राथमिकता दें।',
    'aiGuide.returnCtx': 'ctx को सीधे संशोधित करें और ctx वापस करें। यदि किसी चरण में परिवर्तन की आवश्यकता नहीं है, तो ctx को अपरिवर्तित लौटाएँ।',
    'aiGuide.crossIntent': 'उपयोगकर्ता का इरादा क्रॉस-स्टेज तर्क का वर्णन कर सकता है जैसे \'जब अनुरोध बॉडी xxx, प्रतिक्रिया बॉडी xxx बदलें\' या \'जब क्वेरी पैरामीटर xxx, प्रतिक्रिया हेडर xxx बदलें\'। प्रासंगिक चरण में ctx[\"अनुरोध\"] शर्तों को पढ़ें और ctx[\"प्रतिक्रिया\"] या अनुरोधित लक्ष्य फ़ील्ड को संशोधित करें।',
    'aiGuide.crossContext': 'स्क्रिप्ट एक ही लेनदेन से पूर्ण अनुरोध और प्रतिक्रिया संदर्भ का उपयोग कर सकती है। उदाहरण के लिए, जब अनुरोध बॉडी प्रकार = स्वागत, क्वेरी टैब = होम, या अनुरोध हेडर एक मान से मेल खाता है, तो प्रतिक्रिया बॉडी, प्रतिक्रिया हेडर या अनुरोध बॉडी को संशोधित करें।',
    'aiGuide.response': 'ctx[\"प्रतिक्रिया\"] में स्टेटसकोड, स्टेटसमैसेज, हेडर, बॉडी, बॉडीबेस64 और कंटेंटटाइप शामिल हैं।',
    'aiGuide.request': 'ctx[\"अनुरोध\"] में विधि, यूआरएल, हेडर, क्वेरी, पथ, बॉडी, बॉडीबेस64 और कंटेंटटाइप शामिल हैं।',
    'aiGuide.stage': 'ctx[\"स्टेज\"] request_head, request_body, प्रतिक्रिया_head, या प्रतिक्रिया_बॉडी में से एक है।',
    'aiGuide.ctxCall': 'स्क्रिप्ट प्रॉक्सी के दौरान चलती है और एक ctx शब्दकोश प्राप्त करती है। आप हैंडल (ctx) को परिभाषित कर सकते हैं, या on_request_head (ctx), on_request_body (ctx), on_response_head (ctx), और on_response_body (ctx) को परिभाषित कर सकते हैं।',
    'aiGuide.ruleSample': 'इस नियम में आमतौर पर एक अनुरोध नमूना शामिल होता है। आप संदर्भ के रूप में नमूना फ़ील्ड का उपयोग कर सकते हैं, लेकिन फिर भी जाँच लें कि फ़ील्ड रनटाइम पर मौजूद हैं या नहीं।',
    'aiGuide.globalSample': 'कोई निश्चित अनुरोध या प्रतिक्रिया नमूना नहीं है। यह न मानें कि कोई पथ, क्वेरी, अनुरोध निकाय, या प्रतिक्रिया निकाय मौजूद है। स्क्रिप्ट में, कुछ भी बदलने से पहले रनटाइम सीटीएक्स फ़ील्ड जैसे विधि, पथ, क्वेरी, हेडर और बॉडी को सुरक्षित रूप से जांचें।',
    'aiGuide.ruleIntro': 'आप HttpMocker के लिए एक पुनःलेखन नियम तैयार कर रहे हैं। नियम एक पायथन लिपि होना चाहिए।',
    'aiGuide.globalIntro': 'आप HttpMocker के लिए एक वैश्विक पुनर्लेखन नियम तैयार कर रहे हैं। यह केवल होस्ट {host} पर लागू होता है, और उस होस्ट पर प्रत्येक अनुरोध के लिए चल सकता है। नियम एक पायथन लिपि होना चाहिए।',
    'aiGuide.title': 'बाहरी AI पर कॉपी करने का संकेत दें',
    'aiGuide.missingHost': '[पहले एक होस्ट दर्ज करें]',
    'aiGuide.empty': '[खाली]',
    'capture.loading': 'लोड हो रहा है...',
    'local.action': 'लोकल में सेव करें',
    'remote.action': 'रीराइट',
  },
  es: {
    'startup.title': 'HttpMocker está preparando el panel',
    'startup.subtitle': 'Cargando solicitudes, reglas y ajustes...',
    'startup.errorTitle': 'No se pudo iniciar el panel',
    'startup.errorMessage': 'Error de inicialización. Actualiza la página e inténtalo de nuevo.',
    'project.guide': 'Haz clic para elegir la carpeta del proyecto',
    'project.noDomain': 'Sin dominio',
    'project.selectDirectory': 'Elegir carpeta del proyecto',
    'project.clearDirectory': 'Quitar vínculo del proyecto',
    'project.linkedDirectory': 'Proyecto vinculado: {path}\nHaga clic para borrar el enlace del proyecto.',
    'project.needDirectory': 'La IA necesita el proyecto local para este dominio. Haga clic para elegir la carpeta del proyecto.',
    'project.pickDirectoryTip': 'Elija el proyecto local para este grupo de solicitudes.',
    'project.selectPathFailed': 'No se pudo elegir la ruta del proyecto.',
    'project.domainTabs': 'Dominios del proyecto',
    'project.dialog.historyTitle': 'Historial de dominio',
    'project.dialog.selectTitle': 'Elija dominio',
    'project.dialog.addTitle': 'Agregar dominio',
    'project.dialog.initialHistory': 'Elija un dominio del historial para abrir el proyecto.',
    'project.dialog.initial': 'Elija primero un dominio de proyecto o utilice todos los dominios para ver cada solicitud y regla.',
    'project.dialog.history': 'Elija un dominio del historial como proyecto actual.',
    'project.dialog.add': 'Agregue un dominio de proyecto.',
    'project.dialog.noHistoryInitial': 'Sin historial de dominio. Agregue un dominio desde el menú Archivo y luego vuelva a abrir.',
    'project.dialog.noHistory': 'Sin historial de dominio.',
    'nav.captures': 'Solicitudes recientes',
    'nav.local': 'Mocks locales',
    'nav.remote': 'Reescritura',
    'nav.mainTools': 'Navegación principal y herramientas.',
    'nav.requestsAndRules': 'Solicitudes y reglas',
    'layout.resizer': 'Cambiar el tamaño de la lista y los paneles de vista previa',
    'globalSearch.title': 'Búsqueda global',
    'globalSearch.tip': 'Consulta de búsqueda, encabezados de solicitud, cuerpo de solicitud y cuerpo de respuesta en el proyecto actual. Atajo: Cmd+Mayús+F',
    'globalSearch.placeholder': 'Consulta de búsqueda, encabezados, cuerpo de solicitud, cuerpo de respuesta',
    'globalSearch.currentProject': 'Proyecto actual: {domain}',
    'globalSearch.allDomains': 'Proyecto actual: todos los dominios',
    'globalSearch.loading': 'Búsqueda...',
    'globalSearch.start': 'Ingrese una palabra clave para buscar.',
    'globalSearch.noResults': 'No hay coincidencias.',
    'globalSearch.failed': 'La búsqueda falló.',
    'globalSearch.unknownHost': 'Anfitrión desconocido',
    'update.available': 'Nueva versión {version} disponible',
    'update.openRelease': 'Obtener actualización',
    'update.availableTitle': 'Actualización Disponible',
    'update.dialogAvailable': 'La versión {version} está lista para descargar.',
    'update.noUpdateTitle': 'Ya está actualizado',
    'update.noUpdate': 'Ya tienes la versión más reciente.',
    'update.checkFailedTitle': 'Falló la búsqueda de actualización',
    'update.checkFailed': 'No se pudo buscar actualizaciones. Inténtalo más tarde.',
    'clear.history': 'Borrar historial',
    'clear.menuTip': 'Elija qué historial de solicitudes recientes desea borrar.',
    'clear.older': 'Borrar entradas más antiguas',
    'clear.allHistory': 'Borrar todo el historial',
    'clear.notes': 'Borrar notas',
    'clear.rules': 'Reglas claras',
    'clear.confirmAllCaptures': '¿Borrar todo el historial de solicitudes recientes?\n\nEsto elimina la lista de solicitudes actual y las entradas más antiguas, pero mantiene notas y reglas.',
    'clear.confirmOlderCaptures': '¿Borrar entradas más antiguas?\n\nEsto elimina las marcas de tiempo antiguas que se muestran después de expandir cada solicitud y mantiene solo la última solicitud por grupo en la configuración de combinación actual. Se conservan las solicitudes, notas y reglas recientes.',
    'clear.confirmNotes': '¿Borrar todas las notas y explicaciones detalladas?\n\nEsto elimina notas manuales, notas generadas por IA y explicaciones detalladas. Se mantienen el historial de solicitudes y las reglas.',
    'clear.confirmRules': '¿Borrar todas las reglas?\n\nEsto elimina todas las simulaciones locales y las reglas de reescritura, incluidos sus datos almacenados en caché. Se conservan el historial de solicitudes y las notas.',
    'capture.viewToggle': 'Alternar vista de solicitud reciente',
    'capture.viewTreeTip': 'La vista de árbol está activa. Haga clic para cambiar a la vista de lista.',
    'capture.viewListTip': 'La vista de lista está activa. Haga clic para cambiar a la vista de árbol.',
    'capture.filterPlaceholder': 'Filtrar por ruta API o nota',
    'capture.listAria': 'Lista de solicitudes recientes',
    'capture.mergeByQuery': 'Agrupar por separado por consulta',
    'capture.mergeByBody': 'Agrupar por separado por cuerpo de solicitud',
    'capture.originalBody': 'Cuerpo de la solicitud original',
    'capture.empty': 'Aún no hay solicitudes. Configura el proxy del navegador o la app a esta máquina y recarga.',
    'capture.noMatch': 'No hay solicitudes coincidentes.',
    'capture.historyAria': 'Solicitar marcas de tiempo del historial',
    'capture.olderToggle': 'Entradas más antiguas · haga clic para {action}',
    'capture.expand': 'expandir',
    'capture.collapse': 'colapsar',
    'capture.unknownHost': 'Anfitrión desconocido',
    'local.listAria': 'Lista simulada local',
    'local.actionTip': 'Guarde la respuesta actual como una simulación local. Las solicitudes coincidentes devolverán este contenido local directamente.',
    'local.empty': 'Aún no hay burlas locales. Cree uno a partir de Solicitudes recientes.',
    'rule.hitCaptures': 'Solicitudes coincidentes',
    'remote.listAria': 'Reescribir la lista de reglas',
    'remote.actionTip': 'Cree reglas de reescritura que puedan modificar la consulta, los encabezados, el cuerpo de la solicitud o el cuerpo de la respuesta durante el proxy.',
    'remote.globalEnabled': 'Habilitar regla global',
    'remote.globalRules': 'Reglas globales',
    'remote.addGlobalRule': 'Agregar regla global',
    'remote.addRule': 'Agregar regla de reescritura',
    'remote.addRuleTip': 'Agregue una regla de reescritura.',
    'remote.aiRule': 'Regla de secuencia de comandos de IA',
    'remote.manualRule': 'Regla Manual',
    'remote.back': 'Volver a la lista de reglas',
    'remote.backTip': 'Volver a la lista de reglas.',
    'remote.summaryPlaceholder': 'Resumen de reglas de una línea',
    'remote.aiSummaryPlaceholder': 'Resumen de reglas de IA de una línea, solo visualización',
    'remote.aiSummaryTip': 'Se utiliza únicamente en la lista de reglas y la vista de detalles. No se utiliza como contexto de generación de IA.',
    'remote.chooseAction': 'Elige acción',
    'remote.help': 'Ver sintaxis de reglas',
    'remote.helpTip': 'Vea ejemplos de sintaxis de reglas de reescritura.',
    'remote.path': 'Camino',
    'remote.helpActions': 'Cambie la consulta, los encabezados de la solicitud, el cuerpo de la solicitud, los encabezados de la respuesta o el cuerpo de la respuesta.',
    'remote.valuePlaceholder': 'Eliminaciones vacías / 123 / verdadero / \"cadena\"',
    'remote.emptyDeletes': 'Déjelo vacío para eliminar el nodo de destino.',
    'remote.aiPromptPlaceholder': 'Describa las condiciones y cambios de solicitudes/respuestas cruzadas. Ejemplo: cuando el tipo de cuerpo de la solicitud = bienvenido, conserve solo el primer elemento de la lista de recompensas y establezca las monedas en 100.',
    'remote.aiGenerate': 'Generar',
    'remote.copyPrompt': 'Copiar mensaje',
    'remote.copyPromptTip': 'Copie el mensaje de la izquierda y envíelo a una IA externa para generar el script.',
    'remote.aiScriptPlaceholder': 'Script Python generado por IA. Puedes editarlo manualmente.',
    'remote.example': 'Ejemplo',
    'remote.exampleTabsAria': 'Ejemplo de regla de reescritura',
    'remote.compatExample': 'Ejemplo (compatibilidad)',
    'remote.afterQuery': 'Consulta reescrita',
    'remote.afterRequestHead': 'Encabezados de solicitud reescritos',
    'remote.afterResponseHead': 'Encabezados de respuesta reescritos',
    'remote.afterRequestBody': 'Cuerpo de solicitud reescrito',
    'remote.afterResponseBody': 'Cuerpo de respuesta reescrito',
    'remote.action.query': 'Cambiar consulta',
    'remote.action.requestHead': 'Encabezados de solicitud de cambio',
    'remote.action.requestBody': 'Cuerpo de solicitud de cambio',
    'remote.action.responseHead': 'Cambiar encabezados de respuesta',
    'remote.action.responseBody': 'Cambiar cuerpo de respuesta',
    'remote.action.placeholder': 'Elige acción',
    'remote.emptySteps': 'Sin reglas de reescritura',
    'remote.dragSort': 'Arrastra para reordenar',
    'remote.editAiRule': 'Edite esta regla de IA.',
    'remote.editManualRule': 'Edite esta regla manual.',
    'remote.deleteAiRule': 'Elimina esta regla de IA.',
    'remote.deleteManualRule': 'Elimine esta regla de reescritura.',
    'remote.aiDefaultSummary': 'Regla de secuencia de comandos de IA',
    'remote.manualDefaultSummary': 'regla manual',
    'remote.previewError': 'Errores de reglas',
    'remote.diffBefore': 'Original',
    'remote.diffAfter': 'Después',
    'preview.title': 'Vista previa',
    'preview.emptyTitle': 'Seleccione una solicitud o un simulacro local para obtener una vista previa',
    'preview.searchPlaceholder': 'Buscar vista previa actual',
    'preview.tabsAria': 'Órganos de solicitud y respuesta',
    'query.params': 'Parámetros de consulta',
    'tabs.overview': 'Resumen',
    'overview.request': 'Solicitud',
    'overview.response': 'Respuesta',
    'overview.connection': 'Conexión',
    'overview.timing': 'Tiempos',
    'overview.size': 'Tamaño',
    'overview.url': 'URL',
    'overview.method': 'Método',
    'overview.protocol': 'Protocolo',
    'overview.path': 'Ruta',
    'overview.query': 'Consulta',
    'overview.contentType': 'Tipo de contenido',
    'overview.bodySize': 'Tamaño del cuerpo',
    'overview.status': 'Estado',
    'overview.loading': 'Cargando',
    'overview.failed': 'Fallido',
    'overview.complete': 'Completo',
    'overview.error': 'Error',
    'overview.responseCode': 'Código de respuesta',
    'overview.responseMessage': 'Mensaje de respuesta',
    'overview.mapping': 'Cartografía',
    'overview.clientAddress': 'Dirección del cliente',
    'overview.remoteAddress': 'Dirección remota',
    'overview.keptAlive': 'Mantenido vivo',
    'overview.ssl': 'SSL',
    'overview.yes': 'Sí',
    'overview.no': 'No',
    'overview.advanced': 'Avanzado',
    'overview.clientConnection': 'Conexión de cliente',
    'overview.serverConnection': 'Conexión del servidor',
    'overview.streamId': 'ID de transmisión',
    'overview.clientSettings': 'Configuración del cliente',
    'overview.serverSettings': 'Configuración del servidor',
    'overview.requestStartTime': 'Solicitar hora de inicio',
    'overview.requestEndTime': 'Hora de finalización de la solicitud',
    'overview.responseStartTime': 'Hora de inicio de la respuesta',
    'overview.responseEndTime': 'Hora de finalización de la respuesta',
    'overview.duration': 'Duración',
    'overview.dns': 'DNS',
    'overview.connect': 'Conectar',
    'overview.tlsHandshake': 'Apretón de manos TLS',
    'overview.latency': 'Estado latente',
    'overview.speed': 'Velocidad',
    'overview.requestSpeed': 'Solicitar velocidad',
    'overview.responseSpeed': 'Velocidad de respuesta',
    'overview.header': 'Encabezamiento',
    'overview.queryString': 'Cadena de consulta',
    'overview.cookies': 'Galletas',
    'overview.body': 'Cuerpo',
    'overview.uncompressedBody': 'Cuerpo sin comprimir',
    'overview.compression': 'Compresión',
    'overview.total': 'Total',
    'tabs.matchQuery': 'Consulta de coincidencia',
    'tabs.requestHead': 'Encabezados de solicitud',
    'tabs.requestBody': 'Cuerpo de solicitud',
    'tabs.matchBody': 'Cuerpo de solicitud de coincidencia',
    'tabs.responseHead': 'Encabezados de respuesta',
    'tabs.responseBody': 'Cuerpo de respuesta',
    'actions.copyCurl': 'Copiar curl',
    'actions.copyCurlTip': 'Copie el curl completo de la solicitud actual, incluida la URL, los encabezados y el cuerpo.',
    'actions.repeat': 'Repetir',
    'actions.repeatTip': 'Vuelva a enviar la solicitud actual a través del proxy. El resultado aparecerá en Solicitudes recientes.',
    'actions.delete': 'Eliminar',
    'actions.deleteRuleTip': 'Elimine la regla de reescritura o simulación local seleccionada.',
    'actions.format': 'Formatear',
    'actions.formatTip': 'Formatee el contenido JSON actual.',
    'actions.manualSaveTip': 'Este alcance de coincidencia se superpone con otra regla y necesita confirmación manual.',
    'actions.prev': 'Anterior',
    'actions.next': 'Próximo',
    'actions.close': 'Cerrar',
    'actions.cancel': 'Cancelar',
    'actions.failed': 'La operación falló.',
    'actions.open': 'Abierto',
    'actions.add': 'Agregar',
    'actions.search': 'Buscar',
    'actions.clear': 'Claro',
    'actions.save': 'Guardar',
    'actions.saveFailed': 'Error al guardar.',
    'actions.stop': 'Detener',
    'actions.start': 'Comenzar',
    'actions.stopping': 'Parada',
    'actions.starting': 'A partir de',
    'common.domain': 'Dominio',
    'common.enabled': 'Activado',
    'common.action': 'Acción',
    'common.value': 'Valor',
    'common.idle': 'Inactivo',
    'common.running': 'Correr',
    'common.queued': 'En cola',
    'status.localIp': 'IP local',
    'status.proxyPort': 'Puerto proxy',
    'status.proxyStopped': 'Proxy detenido',
    'status.recording': 'Grabando',
    'status.passThrough': 'Sólo paso a través',
    'status.stopRecording': 'dejar de grabar',
    'status.startRecording': 'Empezar a grabar',
    'status.stopRecordingTip': 'Mantenga el proxy disponible, pero pase todas las solicitudes sin registrar ni aplicar reglas.',
    'status.startRecordingTip': 'Comience a grabar y procesar solicitudes a través del proxy.',
    'status.toggleFailed': 'No se pudo cambiar el estado de grabación.',
    'adb.refreshDevices': 'Actualizar dispositivos Android.',
    'adb.chooseDevice': 'Elegir dispositivo Android',
    'adb.chooseProxy': 'Elija un dispositivo Android para configurar o borrar el proxy.',
    'adb.setProxy': 'Configurar proxy del teléfono',
    'adb.clearProxy': 'Limpiar proxy del teléfono',
    'adb.setProxyFor': 'Establecer proxy del teléfono: {device}',
    'adb.clearProxyFor': 'Borrar proxy telefónico: {device}',
    'adb.clearProxyTip': 'Borre la configuración de proxy en el teléfono.',
    'adb.setProxyTip': 'Configure el proxy del teléfono en esta máquina.',
    'adb.currentProxy': 'Proxy actual: {proxy}',
    'adb.noProxy': 'No hay proxy configurado',
    'adb.guide': 'Haz clic para configurar el proxy del teléfono',
    'adb.failed': 'La operación adb falló.',
    'adb.pathHint': 'Asegúrese de que adb esté instalado y disponible en PATH.',
    'ai.none': 'No usar AI',
    'ai.switchTip': 'Cambie de proveedor de IA. Actual: {provider}',
    'ai.disabledRuleTip': 'La IA está deshabilitada, por lo que no se pueden crear reglas de IA.',
    'ai.addRuleTip': 'Agregue una regla de secuencia de comandos AI Python.',
    'ai.ask': 'Preguntar a IA',
    'ai.askTip': 'Abra un terminal nuevo y envíe esta solicitud, el directorio del proyecto y el contexto al proveedor de IA seleccionado.',
    'ai.askNoProject': 'Vincule primero un directorio de proyecto local.',
    'ai.askFailed': 'No se pudo abrir el terminal de IA.',
    'ai.statusTitle': 'Estado de trabajo de la IA',
    'ai.scriptGeneration': 'Generación de guiones de IA',
    'ai.noteAnalysis': 'Análisis de notas',
    'ai.detailAnalysis': 'Explicación detallada',
    'ai.provider': 'Proveedor',
    'ai.autoNotes': 'notas automáticas',
    'ai.totalQueue': 'cola total',
    'ai.running': 'correr',
    'ai.pending': 'en cola',
    'ai.failed': 'fallido',
    'ai.completed': 'terminado',
    'ai.current': 'Actual',
    'ai.lastFailure': 'último fracaso',
    'ai.runPending': 'En ejecución/en cola',
    'ai.completedFailed': 'Completado / Fallido',
    'ai.runningState': 'Correr',
    'ai.stoppedState': 'Interrumpido',
    'ai.failedShort': 'El códice falló {count}',
    'ai.generationQueue': 'Generación de IA {running}/{total}{pendingText}',
    'ai.pendingSuffix': '· {pending} en cola',
    'ai.noteQueue': 'Notas {state} {running}/{total}',
    'ai.detailQueue': 'Detalles {state} {running}/{total}',
    'ai.disabledWorkTip': 'La IA está desactivada, por lo que el trabajo no puede comenzar.',
    'ai.stopWorkTip': 'Detenga el trabajo de IA, borre los trabajos en cola e interrumpa la generación de reglas de IA.',
    'ai.startWorkTip': 'Inicie el análisis automático de notas y escanee API sin notas.',
    'ai.toggleFailed': 'No se pudo cambiar el estado de trabajo de la IA.',
    'note.short': 'Nota',
    'note.actionTip': 'Agregue o edite una nota manual para esta API.',
    'note.title': 'Nota API',
    'note.placeholder': '¿Qué hace esta API?',
    'note.detail': 'Detalles',
    'note.detailTitle': 'Explicación detallada de la API',
    'note.detailTip': 'Genere o vea detalles de parámetros, campos y referencias de código para esta API.',
    'note.detailGenerating': 'Generando explicación detallada.',
    'note.detailFailed': 'La explicación detallada falló.',
    'note.detailFailedTitle': 'La explicación detallada falló',
    'note.detailFailedReason': 'Razón: {message}',
    'note.detailFailedAt': 'Error en: {time}',
    'note.detailStillGenerating': 'Aún se están generando explicaciones detalladas. Vuelve a intentarlo más tarde.',
    'note.detailQueue': 'Generando explicación detallada, cola {running}/{total}.',
    'note.emptyDetail': 'Aún no hay una explicación detallada.',
    'note.generateDetail': 'Generar detalles',
    'note.detailFailureButton': 'Detalles fallidos',
    'note.generating': 'generando',
    'note.viewDetailTip': 'Vea los parámetros generados, los campos y los detalles de referencia de código para esta API.',
    'note.viewFailureTip': 'Vea por qué falló la explicación detallada.',
    'note.generatingTip': 'Se está generando una explicación detallada. Haga clic para ver el estado del trabajo de AI.',
    'note.generateTip': 'Genere detalles de parámetros, campos y referencias de código para esta API.',
    'note.regenerate': 'Regenerado',
    'note.generate': 'Generar',
    'settings.title': 'Ajustes',
    'settings.language': 'Idioma',
    'settings.appearance': 'Apariencia',
    'appearance.system': 'Sistema',
    'appearance.light': 'Claro',
    'appearance.dark': 'Oscuro',
    'settings.treeView': 'Vista de árbol',
    'settings.mergeRequests': 'Combinar solicitudes',
    'settings.showListNotes': 'Mostrar notas en la lista',
    'settings.aiAutoNotes': 'Notas automáticas con IA',
    'settings.maxHistory': 'Historial máximo',
    'cert.download': 'Descargar certificado',
    'tree.expand': 'Expandir',
    'tree.collapse': 'Colapsar',
    'tree.actions': 'Acciones de vista de árbol',
    'tree.expandAll': 'Expandir todo',
    'tree.collapseAll': 'Contraer todo',
    'context.updateLocal': 'Actualizar simulacro local',
    'context.createLocal': 'Usar como simulacro local',
    'context.updateRemote': 'Actualizar regla de reescritura',
    'context.createRemote': 'Configurar como regla de reescritura',
    'context.addAsDomain': 'Agregar como dominio del proyecto',
    'context.openDomain': 'Dominio abierto',
    'merge.querySourceError': 'La consulta de coincidencia solo puede eliminar parámetros de la solicitud actual. Agregar parámetros, cambiar el nombre de las claves o cambiar los valores requiere guardar manualmente.',
    'merge.bodySourceError': 'El cuerpo de la solicitud de coincidencia solo puede eliminar campos de la solicitud actual. Agregar campos, cambiar el nombre de los campos, cambiar valores o cambiar la estructura requiere guardar manualmente.',
    'merge.sourceError': 'Las plantillas de coincidencia solo pueden limitar la solicitud actual. Otros cambios requieren guardarse manualmente.',
    'merge.conflictAutoSave': 'Este alcance de coincidencia contiene otra configuración agregada para la misma API, por lo que no se puede guardar automáticamente. Ajuste el cuerpo de la consulta/solicitud de coincidencia o haga clic en Guardar para validar nuevamente.',
    'merge.manualSaveDefault': 'Este alcance de coincidencia se superpone a otra regla. Guardar manualmente y validar nuevamente.',
    'merge.conflictSave': 'El alcance de la coincidencia de reglas se superpone a otra regla y no se puede guardar.',
    'merge.conflictWithRule': 'Este alcance de coincidencia se superpone a \"{target}\" y no se puede guardar automáticamente. Ajuste el cuerpo de la consulta/solicitud de coincidencia o haga clic en Guardar para validar nuevamente.',
    'merge.otherRule': 'otra regla',
    'query.ignoreTip': 'Déjelo vacío para ignorar la consulta. Ingrese a=1&b=2 para solicitar esos campos.',
    'query.templateTip': 'Cuando no está marcada, las solicitudes deben incluir estos campos. Déjelo vacío para ignorar la consulta. Se permiten campos adicionales y cualquier orden.',
    'query.mergeTip': 'Cuando está habilitado, se agrupan diferentes valores de consulta. Deshabilítelo para editar la coincidencia de campos obligatorios.',
    'query.matchingTitle': 'Consulta utilizada para hacer coincidir',
    'query.ignoredTitle': 'Consulta ignorada por coincidencia',
    'query.deleteAria': 'Eliminar de la consulta de coincidencia',
    'body.deleteAria': 'Eliminar del cuerpo de la solicitud de coincidencia',
    'remote.ruleEnabledAria': 'Habilitar regla',
    'actions.edit': 'Editar',
    'remote.summaryAria': 'Resumen de una línea',
    'remote.defaultDslMissing': 'desaparecido',
    'remote.defaultDslEmpty': 'vacío',
    'actions.invalidJson': 'JSON no válido',
    'actions.formatted': 'formateado',
    'ai.statusQueued': 'En cola',
    'ai.statusGenerating': 'generando',
    'ai.statusGenerated': 'Generado',
    'ai.statusStopped': 'Interrumpido',
    'ai.statusFailed': 'Generación fallida',
    'ai.copied': 'copiado',
    'ai.copyFailed': 'Copia fallida',
    'ai.promptRequired': 'Ingrese un mensaje para la generación de reglas de IA.',
    'ai.queuedDots': 'En cola...',
    'ai.submitJob': 'Enviando trabajo de generación de IA...',
    'ai.generatingDots': 'Generando...',
    'ai.queued': 'En cola',
    'ai.failedSentence': 'La generación fracasó.',
    'ai.existingJob': 'Ya se está ejecutando un trabajo de generación de IA.',
    'ai.enqueuedJob': 'Agregado a la cola de generación de IA.',
    'remote.previewFailed': 'La vista previa falló.',
    'remote.incomplete': 'La regla de reescritura está incompleta.',
    'remote.pathNoSpace': 'La ruta clave no puede contener espacios.',
    'remote.valueEncodeError': 'El valor contiene caracteres que no se pueden codificar.',
    'actions.repeatFailed': 'La repetición falló.',
    'actions.done': 'Hecho',
    'capture.loadingDetail': 'Cargando detalles de la solicitud...',
    'capture.retryLater': 'Haga clic nuevamente más tarde.',
    'capture.detailLoadFailed': 'No se pudieron cargar los detalles de la solicitud.',
    'capture.hitLocal': 'Simulacro local coincidente',
    'capture.hitRemote': 'Regla de reescritura coincidente',
    'capture.proxyFailed': 'La solicitud de proxy falló',
    'capture.reason': 'Razón: {message}',
    'capture.type': 'Tipo: {type}',
    'capture.requestTime': 'Hora de solicitud {time}',
    'capture.detailTimeout': 'Se agotó el tiempo de espera para solicitar detalles. Vuelve a intentarlo más tarde.',
    'preview.request': 'Solicitar vista previa',
    'preview.localEdit': 'Editor simulado local',
    'preview.remoteEdit': 'Editor de reglas de reescritura',
    'preview.globalRemote': 'Regla de reescritura global',
    'tabs.query': 'Consulta',
    'tabs.modifyRules': 'Normas',
    'local.updateTip': 'Actualice el simulacro local existente con la solicitud y respuesta actuales.',
    'remote.updateTip': 'Actualice los datos de la solicitud para la regla de reescritura existente sin sobrescribir las reglas editadas.',
    'note.ruleTip': 'Agregue o edite una nota de una línea para esta regla. Las notas vacías están ocultas en la lista.',
    'note.apiTip': 'Agregue o edite una nota para esta API. Las notas vacías están ocultas en la lista.',
    'diff.before': 'Antes',
    'diff.after': 'Después',
    'diff.prev': 'Diferencia anterior',
    'diff.next': 'siguiente diferencia',
    'diff.current': 'Saltar a la diferencia actual',
    'diff.copyAll': 'Copia todo el texto {title}',
    'diff.copyFailed': 'Copia fallida',
    'diff.omittedLines': '... se omitieron las líneas {count} sin cambios ...',
    'diff.truncated': '... contenido demasiado largo, caracteres {count} truncados ...',
    'diff.viewFull': 'Ver contenido completo de este lado',
    'diff.back': '← Volver a diferencias',
    'diff.fullTitle': '{title} · Vista previa completa',
    'rule.global': 'Regla global',
    'rule.matchSummary': 'Coincidencia: {text}',
    'query.none': 'Sin parámetros de consulta',
    'capture.requestDetail': 'Detalles de la solicitud',
    'aiGuide.myRequest': 'Mi petición:',
    'aiGuide.outputOnly': 'Genere solo el script Python completo. No utilice Markdown, barreras de código ni texto explicativo.',
    'aiGuide.commentSafe': 'Los comentarios deben resumir únicamente la lógica. No incluya cuerpos de solicitud completos, cuerpos de respuesta, base64 ni datos confidenciales.',
    'aiGuide.comment': 'En la parte superior del script, comenzando desde la primera línea, escriba comentarios detallados de Python que describan qué hace el script, a qué etapas afecta, qué campos coincide o cambia y si pasan solicitudes no coincidentes.',
    'aiGuide.stdlib': 'Utilice únicamente la biblioteca estándar de Python. No acceda a la red, no lea/escriba archivos locales ni imprima texto explicativo.',
    'aiGuide.noSensitive': 'No incluya cuerpos de solicitud completos, cuerpos de respuesta, contenido base64 o ctx en excepciones, afirmaciones, resultados impresos, resúmenes o errores devueltos.',
    'aiGuide.dropBase64': 'Si cambia una cadena de cuerpo, elimine bodyBase64 del objeto correspondiente para que el antiguo valor de base64 no pueda anular su cambio de cuerpo.',
    'aiGuide.base64': 'bodyBase64 es sólo para contenido binario. A menos que se requiera manejo binario, no lea, analice ni reescriba bodyBase64.',
    'aiGuide.parseBody': 'Al cambiar texto codificado en JSON o URL, prefiera analizar y editar ctx[\"solicitud\"][\"cuerpo\"] o ctx[\"respuesta\"][\"cuerpo\"].',
    'aiGuide.returnCtx': 'Modifique ctx directamente y devuelva ctx. Si una etapa no necesita cambios, devuelva ctx sin cambios.',
    'aiGuide.crossIntent': 'La intención del usuario puede describir una lógica entre etapas, como \"cuando el cuerpo de la solicitud xxx, cambie el cuerpo de la respuesta xxx\" o \"cuando el parámetro de consulta xxx, cambie el encabezado de la respuesta xxx\". Lea las condiciones de ctx[\"request\"] en la etapa correspondiente y modifique ctx[\"response\"] o los campos de destino solicitados.',
    'aiGuide.crossContext': 'El script puede utilizar el contexto completo de solicitud y respuesta de la misma transacción. Por ejemplo, cuando el tipo de cuerpo de la solicitud = bienvenido, la pestaña de consulta = inicio o un encabezado de solicitud coincide con un valor, modifique el cuerpo de la respuesta, los encabezados de respuesta o el cuerpo de la solicitud.',
    'aiGuide.response': 'ctx[\"respuesta\"] contiene código de estado, mensaje de estado, encabezados, cuerpo, base64 y tipo de contenido.',
    'aiGuide.request': 'ctx[\"solicitud\"] contiene método, URL, encabezados, consulta, ruta, cuerpo, bodyBase64 y contentType.',
    'aiGuide.stage': 'ctx[\"stage\"] es uno de request_head, request_body, Response_head o Response_body.',
    'aiGuide.ctxCall': 'El script se ejecuta durante el proxy y recibe un diccionario ctx. Puede definir handle(ctx) o definir on_request_head(ctx), on_request_body(ctx), on_response_head(ctx) y on_response_body(ctx).',
    'aiGuide.ruleSample': 'Esta regla suele incluir una muestra de solicitud. Puede utilizar campos de muestra como referencia, pero aún así verificar que los campos existan en tiempo de ejecución.',
    'aiGuide.globalSample': 'No existe una muestra fija de solicitud o respuesta. No asuma que existe ninguna ruta, consulta, cuerpo de solicitud o cuerpo de respuesta. En el script, verifique de forma segura los campos ctx en tiempo de ejecución, como método, ruta, consulta, encabezados y cuerpo, antes de cambiar algo.',
    'aiGuide.ruleIntro': 'Estás generando una regla de reescritura para HttpMocker. La regla debe ser un script de Python.',
    'aiGuide.globalIntro': 'Estás generando una regla de reescritura global para HttpMocker. Solo se aplica al host {host} y puede ejecutarse para cada solicitud en ese host. La regla debe ser un script de Python.',
    'aiGuide.title': 'Solicitud de copia a una IA externa',
    'aiGuide.missingHost': '[ingrese un anfitrión primero]',
    'aiGuide.empty': '[vacío]',
    'capture.loading': 'Cargando...',
    'local.action': 'Guardar localmente',
    'remote.action': 'Reescritura',
  },
  de: {
    'startup.title': 'HttpMocker bereitet das Panel vor',
    'startup.subtitle': 'Anfragen, Regeln und Einstellungen werden geladen...',
    'startup.errorTitle': 'Panel konnte nicht initialisiert werden',
    'startup.errorMessage': 'Initialisierung fehlgeschlagen. Bitte Seite neu laden.',
    'project.guide': 'Klicken, um Projektordner zu wählen',
    'project.noDomain': 'Keine Domain',
    'project.selectDirectory': 'Projektordner wählen',
    'project.clearDirectory': 'Projektverknüpfung entfernen',
    'project.linkedDirectory': 'Verlinktes Projekt: {path}\nKlicken Sie, um den Projektlink zu löschen.',
    'project.needDirectory': 'AI benötigt das lokale Projekt für diese Domäne. Klicken Sie, um den Projektordner auszuwählen.',
    'project.pickDirectoryTip': 'Wählen Sie das lokale Projekt für diese Anforderungsgruppe.',
    'project.selectPathFailed': 'Projektpfad konnte nicht ausgewählt werden.',
    'project.domainTabs': 'Projektdomänen',
    'project.dialog.historyTitle': 'Domänenverlauf',
    'project.dialog.selectTitle': 'Wählen Sie Domäne',
    'project.dialog.addTitle': 'Domäne hinzufügen',
    'project.dialog.initialHistory': 'Wählen Sie eine Domäne aus dem Verlauf aus, um das Projekt zu öffnen.',
    'project.dialog.initial': 'Wählen Sie zuerst eine Projektdomäne aus oder verwenden Sie alle Domänen, um alle Anforderungen und Regeln anzuzeigen.',
    'project.dialog.history': 'Wählen Sie eine Domäne aus dem Verlauf als aktuelles Projekt.',
    'project.dialog.add': 'Fügen Sie eine Projektdomäne hinzu.',
    'project.dialog.noHistoryInitial': 'Kein Domainverlauf. Fügen Sie über das Menü „Datei“ eine Domäne hinzu und öffnen Sie sie erneut.',
    'project.dialog.noHistory': 'Kein Domainverlauf.',
    'nav.captures': 'Letzte Anfragen',
    'nav.local': 'Lokale Mocks',
    'nav.remote': 'Rewrite',
    'nav.mainTools': 'Hauptnavigation und Tools',
    'nav.requestsAndRules': 'Anfragen und Regeln',
    'layout.resizer': 'Ändern Sie die Größe von Listen- und Vorschaufenstern',
    'globalSearch.title': 'Globale Suche',
    'globalSearch.tip': 'Suchabfrage, Anforderungsheader, Anforderungstext und Antworttext im aktuellen Projekt. Tastenkombination: Befehl+Umschalt+F',
    'globalSearch.placeholder': 'Suchanfrage, Header, Anfragetext, Antworttext',
    'globalSearch.currentProject': 'Aktuelles Projekt: {domain}',
    'globalSearch.allDomains': 'Aktuelles Projekt: alle Domänen',
    'globalSearch.loading': 'Suche...',
    'globalSearch.start': 'Geben Sie ein Schlüsselwort für die Suche ein.',
    'globalSearch.noResults': 'Keine Übereinstimmungen.',
    'globalSearch.failed': 'Die Suche ist fehlgeschlagen.',
    'globalSearch.unknownHost': 'Unbekannter Host',
    'update.available': 'Neue Version {version} verfügbar',
    'update.openRelease': 'Update abrufen',
    'update.availableTitle': 'Update verfügbar',
    'update.dialogAvailable': 'Version {version} steht zum Download bereit.',
    'update.noUpdateTitle': 'Bereits aktuell',
    'update.noUpdate': 'Du verwendest bereits die neueste Version.',
    'update.checkFailedTitle': 'Updateprüfung fehlgeschlagen',
    'update.checkFailed': 'Updateprüfung fehlgeschlagen. Versuche es später erneut.',
    'clear.history': 'Verlauf löschen',
    'clear.menuTip': 'Wählen Sie aus, welcher aktuelle Anfrageverlauf gelöscht werden soll.',
    'clear.older': 'Ältere Einträge löschen',
    'clear.allHistory': 'Gesamten Verlauf löschen',
    'clear.notes': 'Klare Notizen',
    'clear.rules': 'Klare Regeln',
    'clear.confirmAllCaptures': 'Gesamten aktuellen Anfrageverlauf löschen?\n\nDadurch werden die aktuelle Anforderungsliste und ältere Einträge entfernt, Notizen und Regeln bleiben jedoch erhalten.',
    'clear.confirmOlderCaptures': 'Ältere Einträge löschen?\n\nDadurch werden alte Zeitstempel entfernt, die nach dem Erweitern jeder Anfrage angezeigt werden, und nur die neueste Anfrage pro Gruppe wird unter den aktuellen Zusammenführungseinstellungen beibehalten. Aktuelle Anfragen, Notizen und Regeln werden gespeichert.',
    'clear.confirmNotes': 'Alle Notizen und ausführlichen Erklärungen löschen?\n\nDadurch entfallen manuelle Notizen, KI-generierte Notizen und detaillierte Erklärungen. Der Anforderungsverlauf und die Regeln bleiben erhalten.',
    'clear.confirmRules': 'Alle Regeln löschen?\n\nDadurch werden alle lokalen Mocks und Rewrite-Regeln entfernt, einschließlich ihrer zwischengespeicherten Daten. Der Anfrageverlauf und die Notizen werden gespeichert.',
    'capture.viewToggle': 'Schalten Sie die Ansicht der letzten Anfragen um',
    'capture.viewTreeTip': 'Baumansicht ist aktiv. Klicken Sie, um zur Listenansicht zu wechseln.',
    'capture.viewListTip': 'Die Listenansicht ist aktiv. Klicken Sie, um zur Baumansicht zu wechseln.',
    'capture.filterPlaceholder': 'Filtern Sie nach API-Pfad oder Hinweis',
    'capture.listAria': 'Aktuelle Anfrageliste',
    'capture.mergeByQuery': 'Separat nach Abfrage gruppieren',
    'capture.mergeByBody': 'Separat nach Anforderungstext gruppieren',
    'capture.originalBody': 'Ursprünglicher Anfragetext',
    'capture.empty': 'Noch keine Anfragen. Browser- oder App-Proxy auf diesen Rechner setzen und neu laden.',
    'capture.noMatch': 'Keine passenden Anfragen.',
    'capture.historyAria': 'Zeitstempel des Anforderungsverlaufs',
    'capture.olderToggle': 'Ältere Einträge · Klicken Sie auf {action}',
    'capture.expand': 'expandieren',
    'capture.collapse': 'Zusammenbruch',
    'capture.unknownHost': 'Unbekannter Host',
    'local.listAria': 'Lokale Mock-Liste',
    'local.actionTip': 'Speichern Sie die aktuelle Antwort als lokalen Mock. Bei Matching-Anfragen wird dieser lokale Inhalt direkt zurückgegeben.',
    'local.empty': 'Noch keine lokalen Mocks. Erstellen Sie eine aus den letzten Anfragen.',
    'rule.hitCaptures': 'Treffende Anfragen',
    'remote.listAria': 'Regelliste neu schreiben',
    'remote.actionTip': 'Erstellen Sie Rewrite-Regeln, die beim Proxying Abfragen, Header, Anforderungstext oder Antworttext ändern können.',
    'remote.globalEnabled': 'Globale Regel aktivieren',
    'remote.globalRules': 'Globale Regeln',
    'remote.addGlobalRule': 'Globale Regel hinzufügen',
    'remote.addRule': 'Rewrite-Regel hinzufügen',
    'remote.addRuleTip': 'Fügen Sie eine Umschreiberegel hinzu.',
    'remote.aiRule': 'KI-Skriptregel',
    'remote.manualRule': 'Manuelle Regel',
    'remote.back': 'Zurück zur Regelliste',
    'remote.backTip': 'Zurück zur Regelliste.',
    'remote.summaryPlaceholder': 'Zusammenfassung der einzeiligen Regeln',
    'remote.aiSummaryPlaceholder': 'Einzeilige Zusammenfassung der KI-Regeln, nur Anzeige',
    'remote.aiSummaryTip': 'Wird nur in der Regelliste und Detailansicht verwendet. Es wird nicht als Kontext zur KI-Generierung verwendet.',
    'remote.chooseAction': 'Aktion auswählen',
    'remote.help': 'Regelsyntax anzeigen',
    'remote.helpTip': 'Sehen Sie sich Beispiele für die Syntax von Rewrite-Regeln an.',
    'remote.path': 'Weg',
    'remote.helpActions': 'Ändern Sie Abfrage, Anforderungsheader, Anforderungstext, Antwortheader oder Antworttext.',
    'remote.valuePlaceholder': 'Leer löscht / 123 / true / „string“',
    'remote.emptyDeletes': 'Lassen Sie das Feld leer, um den Zielknoten zu löschen',
    'remote.aiPromptPlaceholder': 'Beschreiben Sie anfrage-/antwortübergreifende Bedingungen und Änderungen. Beispiel: Wenn der Anforderungstexttyp „Willkommen“ ist, behalten Sie nur das erste Belohnungslistenelement und setzen Sie die Münzen auf 100.',
    'remote.aiGenerate': 'Erzeugen',
    'remote.copyPrompt': 'Eingabeaufforderung kopieren',
    'remote.copyPromptTip': 'Kopieren Sie die Eingabeaufforderung auf der linken Seite und senden Sie sie an eine externe KI, um das Skript zu generieren.',
    'remote.aiScriptPlaceholder': 'KI-generiertes Python-Skript. Sie können es manuell bearbeiten.',
    'remote.example': 'Beispiel',
    'remote.exampleTabsAria': 'Beispiel für eine Rewrite-Regel',
    'remote.compatExample': 'Beispiel (kompatibel)',
    'remote.afterQuery': 'Umgeschriebene Abfrage',
    'remote.afterRequestHead': 'Neu geschriebene Anforderungsheader',
    'remote.afterResponseHead': 'Umgeschriebene Antwortheader',
    'remote.afterRequestBody': 'Neu geschriebener Anforderungstext',
    'remote.afterResponseBody': 'Umgeschriebener Antworttext',
    'remote.action.query': 'Abfrage ändern',
    'remote.action.requestHead': 'Änderungsanforderungsheader',
    'remote.action.requestBody': 'Hauptteil der Änderungsanforderung',
    'remote.action.responseHead': 'Antwortheader ändern',
    'remote.action.responseBody': 'Antworttext ändern',
    'remote.action.placeholder': 'Aktion auswählen',
    'remote.emptySteps': 'Keine Umschreiberegeln',
    'remote.dragSort': 'Zum Neuanordnen ziehen',
    'remote.editAiRule': 'Bearbeiten Sie diese KI-Regel.',
    'remote.editManualRule': 'Bearbeiten Sie diese manuelle Regel.',
    'remote.deleteAiRule': 'Löschen Sie diese KI-Regel.',
    'remote.deleteManualRule': 'Löschen Sie diese Umschreiberegel.',
    'remote.aiDefaultSummary': 'KI-Skriptregel',
    'remote.manualDefaultSummary': 'Manuelle Regel',
    'remote.previewError': 'Regelfehler',
    'remote.diffBefore': 'Original',
    'remote.diffAfter': 'Nach',
    'preview.title': 'Vorschau',
    'preview.emptyTitle': 'Wählen Sie eine Anfrage oder einen lokalen Mock zur Vorschau aus',
    'preview.searchPlaceholder': 'Aktuelle Vorschau durchsuchen',
    'preview.tabsAria': 'Anfrage- und Antwortstellen',
    'query.params': 'Abfrageparameter',
    'tabs.overview': 'Übersicht',
    'overview.request': 'Anfrage',
    'overview.response': 'Antwort',
    'overview.connection': 'Verbindung',
    'overview.timing': 'Timing',
    'overview.size': 'Größe',
    'overview.url': 'URL',
    'overview.method': 'Methode',
    'overview.protocol': 'Protokoll',
    'overview.path': 'Pfad',
    'overview.query': 'Abfrage',
    'overview.contentType': 'Inhaltstyp',
    'overview.bodySize': 'Körpergröße',
    'overview.status': 'Status',
    'overview.loading': 'Lädt',
    'overview.failed': 'Fehlgeschlagen',
    'overview.complete': 'Abgeschlossen',
    'overview.error': 'Fehler',
    'overview.responseCode': 'Antwortcode',
    'overview.responseMessage': 'Antwortnachricht',
    'overview.mapping': 'Abbildung',
    'overview.clientAddress': 'Kundenadresse',
    'overview.remoteAddress': 'Remote-Adresse',
    'overview.keptAlive': 'Am Leben gehalten',
    'overview.ssl': 'SSL',
    'overview.yes': 'Ja',
    'overview.no': 'Nein',
    'overview.advanced': 'Fortschrittlich',
    'overview.clientConnection': 'Client-Verbindung',
    'overview.serverConnection': 'Serververbindung',
    'overview.streamId': 'Stream-ID',
    'overview.clientSettings': 'Client-Einstellungen',
    'overview.serverSettings': 'Servereinstellungen',
    'overview.requestStartTime': 'Startzeit anfordern',
    'overview.requestEndTime': 'Endzeit anfordern',
    'overview.responseStartTime': 'Antwortstartzeit',
    'overview.responseEndTime': 'Endzeit der Antwort',
    'overview.duration': 'Dauer',
    'overview.dns': 'DNS',
    'overview.connect': 'Verbinden',
    'overview.tlsHandshake': 'TLS-Handshake',
    'overview.latency': 'Latenz',
    'overview.speed': 'Geschwindigkeit',
    'overview.requestSpeed': 'Geschwindigkeit anfordern',
    'overview.responseSpeed': 'Reaktionsgeschwindigkeit',
    'overview.header': 'Kopfzeile',
    'overview.queryString': 'Abfragezeichenfolge',
    'overview.cookies': 'Kekse',
    'overview.body': 'Körper',
    'overview.uncompressedBody': 'Unkomprimierter Körper',
    'overview.compression': 'Kompression',
    'overview.total': 'Gesamt',
    'tabs.matchQuery': 'Übereinstimmungsabfrage',
    'tabs.requestHead': 'Anforderungsheader',
    'tabs.requestBody': 'Anforderungstext',
    'tabs.matchBody': 'Match-Anfragetext',
    'tabs.responseHead': 'Antwortheader',
    'tabs.responseBody': 'Antwortgremium',
    'actions.copyCurl': 'curl kopieren',
    'actions.copyCurlTip': 'Kopieren Sie den vollständigen Curl für die aktuelle Anfrage, einschließlich URL, Header und Text.',
    'actions.repeat': 'Wiederholen',
    'actions.repeatTip': 'Senden Sie die aktuelle Anfrage erneut über den Proxy. Das Ergebnis wird unter „Letzte Anfragen“ angezeigt.',
    'actions.delete': 'Löschen',
    'actions.deleteRuleTip': 'Löschen Sie die ausgewählte lokale Mock- oder Rewrite-Regel.',
    'actions.format': 'Formatieren',
    'actions.formatTip': 'Formatieren Sie den aktuellen JSON-Inhalt.',
    'actions.manualSaveTip': 'Dieser Übereinstimmungsbereich überschneidet sich mit einer anderen Regel und erfordert eine manuelle Bestätigung.',
    'actions.prev': 'Vorherige',
    'actions.next': 'Nächste',
    'actions.close': 'Schließen',
    'actions.cancel': 'Abbrechen',
    'actions.failed': 'Der Vorgang ist fehlgeschlagen.',
    'actions.open': 'Offen',
    'actions.add': 'Hinzufügen',
    'actions.search': 'Suchen',
    'actions.clear': 'Klar',
    'actions.save': 'Speichern',
    'actions.saveFailed': 'Speichern fehlgeschlagen.',
    'actions.stop': 'Stoppen',
    'actions.start': 'Start',
    'actions.stopping': 'Anhalten',
    'actions.starting': 'Beginnt',
    'common.domain': 'Domain',
    'common.enabled': 'Aktiviert',
    'common.action': 'Aktion',
    'common.value': 'Wert',
    'common.idle': 'Leerlauf',
    'common.running': 'Läuft',
    'common.queued': 'In der Warteschlange',
    'status.localIp': 'Lokale IP',
    'status.proxyPort': 'Proxy-Port',
    'status.proxyStopped': 'Proxy gestoppt',
    'status.recording': 'Aufzeichnung',
    'status.passThrough': 'Nur Durchgang',
    'status.stopRecording': 'Stoppen Sie die Aufnahme',
    'status.startRecording': 'Starten Sie die Aufnahme',
    'status.stopRecordingTip': 'Halten Sie den Proxy verfügbar, aber leiten Sie alle Anfragen weiter, ohne Regeln aufzuzeichnen oder anzuwenden.',
    'status.startRecordingTip': 'Beginnen Sie mit der Aufzeichnung und Verarbeitung von Anfragen über den Proxy.',
    'status.toggleFailed': 'Der Aufnahmestatus konnte nicht geändert werden.',
    'adb.refreshDevices': 'Aktualisieren Sie Android-Geräte.',
    'adb.chooseDevice': 'Android-Gerät wählen',
    'adb.chooseProxy': 'Wählen Sie ein Android-Gerät aus, um den Proxy festzulegen oder zu löschen.',
    'adb.setProxy': 'Telefon-Proxy setzen',
    'adb.clearProxy': 'Telefon-Proxy löschen',
    'adb.setProxyFor': 'Telefon-Proxy festlegen: {device}',
    'adb.clearProxyFor': 'Telefon-Proxy löschen: {device}',
    'adb.clearProxyTip': 'Löschen Sie die Proxy-Einstellung auf dem Telefon.',
    'adb.setProxyTip': 'Legen Sie den Telefon-Proxy für dieses Gerät fest.',
    'adb.currentProxy': 'Aktueller Proxy: {proxy}',
    'adb.noProxy': 'Kein Proxy konfiguriert',
    'adb.guide': 'Klicken, um Telefon-Proxy zu setzen',
    'adb.failed': 'ADB-Vorgang ist fehlgeschlagen.',
    'adb.pathHint': 'Stellen Sie sicher, dass adb installiert und in PATH verfügbar ist.',
    'ai.none': 'Keine AI verwenden',
    'ai.switchTip': 'KI-Anbieter wechseln. Aktuell: {provider}',
    'ai.disabledRuleTip': 'KI ist deaktiviert, daher können keine KI-Regeln erstellt werden.',
    'ai.addRuleTip': 'Fügen Sie eine AI-Python-Skriptregel hinzu.',
    'ai.ask': 'KI fragen',
    'ai.askTip': 'Öffnet ein neues Terminal und sendet diese Anfrage, das Projektverzeichnis und den Kontext an den gewählten KI-Anbieter.',
    'ai.askNoProject': 'Verknüpfen Sie zuerst ein lokales Projektverzeichnis.',
    'ai.askFailed': 'KI-Terminal konnte nicht geöffnet werden.',
    'ai.statusTitle': 'KI-Arbeitsstatus',
    'ai.scriptGeneration': 'KI-Skriptgenerierung',
    'ai.noteAnalysis': 'Notizenanalyse',
    'ai.detailAnalysis': 'Ausführliche Erklärung',
    'ai.provider': 'Anbieter',
    'ai.autoNotes': 'Automatische Notizen',
    'ai.totalQueue': 'Gesamtwarteschlange',
    'ai.running': 'läuft',
    'ai.pending': 'in der Warteschlange',
    'ai.failed': 'fehlgeschlagen',
    'ai.completed': 'vollendet',
    'ai.current': 'Aktuell',
    'ai.lastFailure': 'Letzter Misserfolg',
    'ai.runPending': 'Läuft / In der Warteschlange',
    'ai.completedFailed': 'Abgeschlossen/fehlgeschlagen',
    'ai.runningState': 'Läuft',
    'ai.stoppedState': 'Angehalten',
    'ai.failedShort': 'Codex ist {count} fehlgeschlagen',
    'ai.generationQueue': 'KI-Generation {running}/{total}{pendingText}',
    'ai.pendingSuffix': '· {pending} in die Warteschlange gestellt',
    'ai.noteQueue': 'Hinweise {state} {running}/{total}',
    'ai.detailQueue': 'Details {state} {running}/{total}',
    'ai.disabledWorkTip': 'Die KI ist deaktiviert, sodass mit der Arbeit nicht begonnen werden kann.',
    'ai.stopWorkTip': 'Stoppen Sie die KI-Arbeit, löschen Sie Aufträge in der Warteschlange und unterbrechen Sie die laufende Generierung von KI-Regeln.',
    'ai.startWorkTip': 'Starten Sie die automatische Notizenanalyse und scannen Sie APIs ohne Notizen.',
    'ai.toggleFailed': 'Der AI-Arbeitsstatus konnte nicht geändert werden.',
    'note.short': 'Notiz',
    'note.actionTip': 'Fügen Sie eine manuelle Notiz für diese API hinzu oder bearbeiten Sie sie.',
    'note.title': 'API-Hinweis',
    'note.placeholder': 'Was macht diese API?',
    'note.detail': 'Einzelheiten',
    'note.detailTitle': 'Detaillierte API-Erklärung',
    'note.detailTip': 'Parameter-, Feld- und Codereferenzdetails für diese API generieren oder anzeigen.',
    'note.detailGenerating': 'Ausführliche Erklärung generieren.',
    'note.detailFailed': 'Ausführliche Erklärung fehlgeschlagen.',
    'note.detailFailedTitle': 'Ausführliche Erklärung fehlgeschlagen',
    'note.detailFailedReason': 'Grund: {message}',
    'note.detailFailedAt': 'Fehler bei: {time}',
    'note.detailStillGenerating': 'Eine ausführliche Erklärung wird noch erstellt. Versuchen Sie es später noch einmal.',
    'note.detailQueue': 'Detaillierte Erklärung wird generiert, Warteschlange {running}/{total}.',
    'note.emptyDetail': 'Noch keine detaillierte Erklärung.',
    'note.generateDetail': 'Details generieren',
    'note.detailFailureButton': 'Details fehlgeschlagen',
    'note.generating': 'Generieren',
    'note.viewDetailTip': 'Zeigen Sie generierte Parameter-, Feld- und Codereferenzdetails für diese API an.',
    'note.viewFailureTip': 'Sehen Sie sich an, warum die ausführliche Erklärung fehlgeschlagen ist.',
    'note.generatingTip': 'Eine ausführliche Erklärung wird generiert. Klicken Sie hier, um den KI-Arbeitsstatus anzuzeigen.',
    'note.generateTip': 'Generieren Sie Parameter-, Feld- und Codereferenzdetails für diese API.',
    'note.regenerate': 'Regenerieren',
    'note.generate': 'Erzeugen',
    'settings.title': 'Einstellungen',
    'settings.language': 'Sprache',
    'settings.appearance': 'Darstellung',
    'appearance.system': 'System',
    'appearance.light': 'Hell',
    'appearance.dark': 'Dunkel',
    'settings.treeView': 'Baumansicht',
    'settings.mergeRequests': 'Anfragen zusammenführen',
    'settings.showListNotes': 'Notizen in Liste anzeigen',
    'settings.aiAutoNotes': 'KI-Notizen automatisch erstellen',
    'settings.maxHistory': 'Maximaler Verlauf',
    'cert.download': 'Zertifikat herunterladen',
    'tree.expand': 'Expandieren',
    'tree.collapse': 'Zusammenbruch',
    'tree.actions': 'Aktionen in der Baumansicht',
    'tree.expandAll': 'Alles erweitern',
    'tree.collapseAll': 'Alles einklappen',
    'context.updateLocal': 'Lokales Mock aktualisieren',
    'context.createLocal': 'Als lokales Mock festlegen',
    'context.updateRemote': 'Rewrite-Regel aktualisieren',
    'context.createRemote': 'Als Rewrite-Regel konfigurieren',
    'context.addAsDomain': 'Als Projektdomäne hinzufügen',
    'context.openDomain': 'Domäne öffnen',
    'merge.querySourceError': 'Die Match-Abfrage kann nur Parameter aus der aktuellen Anfrage entfernen. Das Hinzufügen von Parametern, das Umbenennen von Schlüsseln oder das Ändern von Werten erfordert eine manuelle Speicherung.',
    'merge.bodySourceError': 'Der Match-Anfragetext kann nur Felder aus der aktuellen Anfrage entfernen. Das Hinzufügen von Feldern, das Umbenennen von Feldern, das Ändern von Werten oder das Ändern der Struktur erfordert ein manuelles Speichern.',
    'merge.sourceError': 'Match-Vorlagen können die aktuelle Anfrage nur eingrenzen. Andere Änderungen erfordern eine manuelle Speicherung.',
    'merge.conflictAutoSave': 'Dieser Übereinstimmungsbereich enthält eine andere aggregierte Konfiguration für dieselbe API und kann daher nicht automatisch gespeichert werden. Passen Sie die Übereinstimmungsabfrage/den Anforderungstext an oder klicken Sie auf „Speichern“, um die Übereinstimmung erneut zu bestätigen.',
    'merge.manualSaveDefault': 'Dieser Übereinstimmungsbereich überschneidet sich mit einer anderen Regel. Manuell speichern und erneut validieren.',
    'merge.conflictSave': 'Der Regelübereinstimmungsbereich überschneidet sich mit einer anderen Regel und kann nicht gespeichert werden.',
    'merge.conflictWithRule': 'Dieser Übereinstimmungsbereich überschneidet sich mit „{target}“ und kann nicht automatisch gespeichert werden. Passen Sie die Übereinstimmungsabfrage/den Anforderungstext an oder klicken Sie auf „Speichern“, um die Übereinstimmung erneut zu bestätigen.',
    'merge.otherRule': 'eine andere Regel',
    'query.ignoreTip': 'Leer lassen, um die Abfrage zu ignorieren. Geben Sie a=1&b=2 ein, um diese Felder erforderlich zu machen.',
    'query.templateTip': 'Wenn diese Option deaktiviert ist, müssen Anfragen diese Felder enthalten. Leer lassen, um die Abfrage zu ignorieren. Zusätzliche Felder und eine beliebige Reihenfolge sind zulässig.',
    'query.mergeTip': 'Wenn diese Option aktiviert ist, werden verschiedene Abfragewerte gruppiert. Deaktivieren Sie es, um die Zuordnung erforderlicher Felder zu bearbeiten.',
    'query.matchingTitle': 'Für den Abgleich verwendete Abfrage',
    'query.ignoredTitle': 'Abfrage wurde für den Abgleich ignoriert',
    'query.deleteAria': 'Aus Übereinstimmungsabfrage entfernen',
    'body.deleteAria': 'Aus Match-Anfragetext entfernen',
    'remote.ruleEnabledAria': 'Regel aktivieren',
    'actions.edit': 'Bearbeiten',
    'remote.summaryAria': 'Einzeilige Zusammenfassung',
    'remote.defaultDslMissing': 'fehlen',
    'remote.defaultDslEmpty': 'leer',
    'actions.invalidJson': 'Ungültiger JSON',
    'actions.formatted': 'Formatiert',
    'ai.statusQueued': 'In der Warteschlange',
    'ai.statusGenerating': 'Generieren',
    'ai.statusGenerated': 'Generiert',
    'ai.statusStopped': 'Angehalten',
    'ai.statusFailed': 'Die Generierung ist fehlgeschlagen',
    'ai.copied': 'Kopiert',
    'ai.copyFailed': 'Der Kopiervorgang ist fehlgeschlagen',
    'ai.promptRequired': 'Geben Sie eine Eingabeaufforderung für die Generierung von KI-Regeln ein.',
    'ai.queuedDots': 'In der Warteschlange...',
    'ai.submitJob': 'Job zur KI-Generierung wird eingereicht...',
    'ai.generatingDots': 'Generieren...',
    'ai.queued': 'In der Warteschlange',
    'ai.failedSentence': 'Die Generierung ist fehlgeschlagen.',
    'ai.existingJob': 'Ein KI-Generierungsjob läuft bereits.',
    'ai.enqueuedJob': 'Zur KI-Generierungswarteschlange hinzugefügt.',
    'remote.previewFailed': 'Vorschau fehlgeschlagen.',
    'remote.incomplete': 'Die Umschreiberegel ist unvollständig.',
    'remote.pathNoSpace': 'Der Schlüsselpfad darf keine Leerzeichen enthalten.',
    'remote.valueEncodeError': 'Der Wert enthält Zeichen, die nicht codiert werden können.',
    'actions.repeatFailed': 'Wiederholung fehlgeschlagen.',
    'actions.done': 'Erledigt',
    'capture.loadingDetail': 'Anfragedetails werden geladen...',
    'capture.retryLater': 'Klicken Sie später erneut.',
    'capture.detailLoadFailed': 'Anfragedetails konnten nicht geladen werden.',
    'capture.hitLocal': 'Passende lokale Attrappe',
    'capture.hitRemote': 'Übereinstimmende Umschreibungsregel',
    'capture.proxyFailed': 'Die Proxy-Anfrage ist fehlgeschlagen',
    'capture.reason': 'Grund: {message}',
    'capture.type': 'Typ: {type}',
    'capture.requestTime': 'Anfragezeit {time}',
    'capture.detailTimeout': 'Zeitüberschreitung bei den Anforderungsdetails. Versuchen Sie es später noch einmal.',
    'preview.request': 'Vorschau anfordern',
    'preview.localEdit': 'Lokaler Mock-Editor',
    'preview.remoteEdit': 'Regeleditor neu schreiben',
    'preview.globalRemote': 'Globale Rewrite-Regel',
    'tabs.query': 'Abfrage',
    'tabs.modifyRules': 'Regeln',
    'local.updateTip': 'Aktualisieren Sie den vorhandenen lokalen Mock mit der aktuellen Anfrage und Antwort.',
    'remote.updateTip': 'Aktualisieren Sie die Anforderungsdaten für die vorhandene Rewrite-Regel, ohne bearbeitete Regeln zu überschreiben.',
    'note.ruleTip': 'Fügen Sie eine einzeilige Notiz für diese Regel hinzu oder bearbeiten Sie sie. Leere Notizen werden in der Liste ausgeblendet.',
    'note.apiTip': 'Fügen Sie eine Notiz für diese API hinzu oder bearbeiten Sie sie. Leere Notizen werden in der Liste ausgeblendet.',
    'diff.before': 'Vor',
    'diff.after': 'Nach',
    'diff.prev': 'Vorheriger Unterschied',
    'diff.next': 'Nächster Unterschied',
    'diff.current': 'Zum aktuellen Diff springen',
    'diff.copyAll': 'Kopieren Sie den gesamten {title}-Text',
    'diff.copyFailed': 'Der Kopiervorgang ist fehlgeschlagen',
    'diff.omittedLines': '... {count} unveränderte Zeilen weggelassen ...',
    'diff.truncated': '... Inhalt zu lang, {count}-Zeichen abgeschnitten ...',
    'diff.viewFull': 'Vollständigen Inhalt für diese Seite anzeigen',
    'diff.back': '← Zurück zu Diff',
    'diff.fullTitle': '{title} · Vollständige Vorschau',
    'rule.global': 'Globale Regel',
    'rule.matchSummary': 'Übereinstimmung: {text}',
    'query.none': 'Keine Abfrageparameter',
    'capture.requestDetail': 'Details anfordern',
    'aiGuide.myRequest': 'Meine Bitte:',
    'aiGuide.outputOnly': 'Geben Sie nur das vollständige Python-Skript aus. Verwenden Sie kein Markdown, keine Code-Zäune oder erklärenden Text.',
    'aiGuide.commentSafe': 'Kommentare dürfen nur die Logik zusammenfassen. Schließen Sie keine vollständigen Anfragetexte, Antworttexte, Base64 oder vertrauliche Daten ein.',
    'aiGuide.comment': 'Schreiben Sie oben im Skript, beginnend mit der ersten Zeile, detaillierte Python-Kommentare, die beschreiben, was das Skript tut, welche Phasen es beeinflusst, welche Felder es abgleicht oder ändert und ob nicht übereinstimmende Anforderungen weitergeleitet werden.',
    'aiGuide.stdlib': 'Verwenden Sie nur die Python-Standardbibliothek. Greifen Sie nicht auf das Netzwerk zu, lesen/schreiben Sie keine lokalen Dateien und drucken Sie keinen erklärenden Text aus.',
    'aiGuide.noSensitive': 'Fügen Sie keine vollständigen Anforderungstexte, Antworttexte, Base64- oder CTX-Inhalte in Ausnahmen, Zusicherungen, Druckausgaben, Zusammenfassungen oder zurückgegebene Fehler ein.',
    'aiGuide.dropBase64': 'Wenn Sie eine Textzeichenfolge ändern, löschen Sie bodyBase64 aus dem entsprechenden Objekt, damit der alte Base64-Wert Ihre Textänderung nicht überschreiben kann.',
    'aiGuide.base64': 'bodyBase64 ist nur für binäre Inhalte. Sofern keine Binärverarbeitung erforderlich ist, darf bodyBase64 nicht gelesen, analysiert oder umgeschrieben werden.',
    'aiGuide.parseBody': 'Wenn Sie JSON- oder URL-codierten Text ändern, sollten Sie lieber ctx[\"request\"][\"body\"] oder ctx[\"response\"][\"body\"] analysieren und bearbeiten.',
    'aiGuide.returnCtx': 'Ändern Sie ctx direkt und geben Sie ctx zurück. Wenn eine Stufe keine Änderungen benötigt, geben Sie ctx unverändert zurück.',
    'aiGuide.crossIntent': 'Die Benutzerabsicht kann eine stufenübergreifende Logik beschreiben, z. B. „Bei Anforderungstext xxx Antworttext xxx ändern“ oder „Bei Abfrageparameter xxx Antwortheader xxx ändern“. Lesen Sie die ctx[\"request\"]-Bedingungen in der entsprechenden Phase und ändern Sie ctx[\"response\"] oder die angeforderten Zielfelder.',
    'aiGuide.crossContext': 'Das Skript kann den vollständigen Anforderungs- und Antwortkontext derselben Transaktion verwenden. Wenn beispielsweise der Anforderungstexttyp „Welcome“, die Abfrage „Tab = Home“ oder ein Anforderungsheader mit einem Wert übereinstimmt, ändern Sie den Antworttext, die Antwortheader oder den Anforderungstext.',
    'aiGuide.response': 'ctx[\"response\"] enthält statusCode, statusMessage, Header, Body, bodyBase64 und contentType.',
    'aiGuide.request': 'ctx[\"request\"] enthält Methode, URL, Header, Abfrage, Pfad, Text, bodyBase64 und contentType.',
    'aiGuide.stage': 'ctx[\"stage\"] ist einer von request_head, request_body, Response_head oder Response_body.',
    'aiGuide.ctxCall': 'Das Skript wird während des Proxyings ausgeführt und empfängt ein ctx-Wörterbuch. Sie können handle(ctx) oder on_request_head(ctx), on_request_body(ctx), on_response_head(ctx) und on_response_body(ctx) definieren.',
    'aiGuide.ruleSample': 'Diese Regel umfasst normalerweise ein Anforderungsmuster. Sie können Beispielfelder als Referenz verwenden, aber dennoch prüfen, ob die Felder zur Laufzeit vorhanden sind.',
    'aiGuide.globalSample': 'Es gibt kein festes Anfrage- oder Antwortmuster. Gehen Sie nicht davon aus, dass ein Pfad, eine Abfrage, ein Anforderungstext oder ein Antworttext vorhanden ist. Überprüfen Sie im Skript sicher Laufzeit-CTX-Felder wie Methode, Pfad, Abfrage, Header und Text, bevor Sie etwas ändern.',
    'aiGuide.ruleIntro': 'Sie generieren eine Rewrite-Regel für HttpMocker. Die Regel muss ein Python-Skript sein.',
    'aiGuide.globalIntro': 'Sie generieren eine globale Rewrite-Regel für HttpMocker. Es gilt nur für Host {host} und kann für jede Anfrage auf diesem Host ausgeführt werden. Die Regel muss ein Python-Skript sein.',
    'aiGuide.title': 'Aufforderung zum Kopieren auf eine externe KI',
    'aiGuide.missingHost': '[Geben Sie zuerst einen Host ein]',
    'aiGuide.empty': '[leer]',
    'capture.loading': 'Wird geladen...',
    'local.action': 'Lokal speichern',
    'remote.action': 'Rewrite',
  },
  fr: {
    'startup.title': 'HttpMocker prépare le panneau',
    'startup.subtitle': 'Chargement des requêtes, règles et paramètres...',
    'startup.errorTitle': 'Échec de l’initialisation du panneau',
    'startup.errorMessage': 'L’initialisation a échoué. Actualisez la page et réessayez.',
    'project.guide': 'Cliquez pour choisir le dossier du projet',
    'project.noDomain': 'Aucun domaine',
    'project.selectDirectory': 'Choisir le dossier du projet',
    'project.clearDirectory': 'Supprimer le lien du projet',
    'project.linkedDirectory': 'Projet lié : {path}\nCliquez pour effacer le lien du projet.',
    'project.needDirectory': 'L\'IA a besoin du projet local pour ce domaine. Cliquez pour choisir le dossier du projet.',
    'project.pickDirectoryTip': 'Choisissez le projet local pour ce groupe de demandes.',
    'project.selectPathFailed': 'Échec du choix du chemin du projet.',
    'project.domainTabs': 'Domaines du projet',
    'project.dialog.historyTitle': 'Historique du domaine',
    'project.dialog.selectTitle': 'Choisir un domaine',
    'project.dialog.addTitle': 'Ajouter un domaine',
    'project.dialog.initialHistory': 'Choisissez un domaine dans l\'historique pour ouvrir le projet.',
    'project.dialog.initial': 'Choisissez d\'abord un domaine de projet ou utilisez tous les domaines pour afficher chaque demande et règle.',
    'project.dialog.history': 'Choisissez un domaine dans l\'historique comme projet actuel.',
    'project.dialog.add': 'Ajoutez un domaine de projet.',
    'project.dialog.noHistoryInitial': 'Aucun historique de domaine. Ajoutez un domaine depuis le menu Fichier, puis rouvrez.',
    'project.dialog.noHistory': 'Aucun historique de domaine.',
    'nav.captures': 'Requêtes récentes',
    'nav.local': 'Mocks locaux',
    'nav.remote': 'Réécriture',
    'nav.mainTools': 'Navigation principale et outils',
    'nav.requestsAndRules': 'Demandes et règles',
    'layout.resizer': 'Redimensionner les volets de liste et d\'aperçu',
    'globalSearch.title': 'Recherche globale',
    'globalSearch.tip': 'Requête de recherche, en-têtes de requête, corps de requête et corps de réponse dans le projet en cours. Raccourci : Cmd+Maj+F',
    'globalSearch.placeholder': 'Requête de recherche, en-têtes, corps de la requête, corps de la réponse',
    'globalSearch.currentProject': 'Projet actuel : {domain}',
    'globalSearch.allDomains': 'Projet en cours : tous les domaines',
    'globalSearch.loading': 'Recherche...',
    'globalSearch.start': 'Entrez un mot-clé pour rechercher.',
    'globalSearch.noResults': 'Aucun match.',
    'globalSearch.failed': 'La recherche a échoué.',
    'globalSearch.unknownHost': 'Hôte inconnu',
    'update.available': 'Nouvelle version {version} disponible',
    'update.openRelease': 'Obtenir la mise à jour',
    'update.availableTitle': 'Mise à jour disponible',
    'update.dialogAvailable': 'La version {version} est prête à télécharger.',
    'update.noUpdateTitle': 'Déjà à jour',
    'update.noUpdate': 'Vous utilisez déjà la dernière version.',
    'update.checkFailedTitle': 'Recherche de mise à jour échouée',
    'update.checkFailed': 'La recherche de mise à jour a échoué. Réessayez plus tard.',
    'clear.history': 'Effacer l’historique',
    'clear.menuTip': 'Choisissez l’historique des demandes récentes à effacer.',
    'clear.older': 'Effacer les anciennes entrées',
    'clear.allHistory': 'Effacer tout l\'historique',
    'clear.notes': 'Effacer les notes',
    'clear.rules': 'Des règles claires',
    'clear.confirmAllCaptures': 'Effacer tout l\'historique des demandes récentes ?\n\nCela supprime la liste de demandes actuelle et les entrées plus anciennes, mais conserve les notes et les règles.',
    'clear.confirmOlderCaptures': 'Effacer les anciennes entrées ?\n\nCela supprime les anciens horodatages affichés après le développement de chaque demande et conserve uniquement la dernière demande par groupe selon les paramètres de fusion actuels. Les demandes, notes et règles récentes sont conservées.',
    'clear.confirmNotes': 'Effacer toutes les notes et explications détaillées ?\n\nCela supprime les notes manuelles, les notes générées par l’IA et les explications détaillées. L’historique des demandes et les règles sont conservés.',
    'clear.confirmRules': 'Effacer toutes les règles ?\n\nCela supprime toutes les simulations locales et les règles de réécriture, y compris leurs données mises en cache. L’historique des demandes et les notes sont conservés.',
    'capture.viewToggle': 'Basculer l\'affichage des demandes récentes',
    'capture.viewTreeTip': 'L’arborescence est active. Cliquez pour passer à la vue liste.',
    'capture.viewListTip': 'La vue Liste est active. Cliquez pour passer à l\'arborescence.',
    'capture.filterPlaceholder': 'Filtrer par chemin d\'API ou note',
    'capture.listAria': 'Liste des demandes récentes',
    'capture.mergeByQuery': 'Regrouper séparément par requête',
    'capture.mergeByBody': 'Regrouper séparément par corps de demande',
    'capture.originalBody': 'Corps de la demande d\'origine',
    'capture.empty': 'Aucune requête pour le moment. Configurez le proxy du navigateur ou de l’app vers cette machine puis rechargez.',
    'capture.noMatch': 'Aucune demande correspondante.',
    'capture.historyAria': 'Demander des horodatages d’historique',
    'capture.olderToggle': 'Entrées plus anciennes · cliquez sur {action}',
    'capture.expand': 'développer',
    'capture.collapse': 'effondrement',
    'capture.unknownHost': 'Hôte inconnu',
    'local.listAria': 'Liste fictive locale',
    'local.actionTip': 'Enregistrez la réponse actuelle en tant que simulation locale. Les demandes correspondantes renverront directement ce contenu local.',
    'local.empty': 'Pas encore de moqueries locales. Créez-en une à partir des demandes récentes.',
    'rule.hitCaptures': 'Requêtes correspondantes',
    'remote.listAria': 'Réécrire la liste des règles',
    'remote.actionTip': 'Créez des règles de réécriture qui peuvent modifier la requête, les en-têtes, le corps de la demande ou le corps de la réponse lors du proxy.',
    'remote.globalEnabled': 'Activer la règle globale',
    'remote.globalRules': 'Règles mondiales',
    'remote.addGlobalRule': 'Ajouter une règle globale',
    'remote.addRule': 'Ajouter une règle de réécriture',
    'remote.addRuleTip': 'Ajoutez une règle de réécriture.',
    'remote.aiRule': 'Règle de script IA',
    'remote.manualRule': 'Règle manuelle',
    'remote.back': 'Retour à la liste des règles',
    'remote.backTip': 'Retour à la liste des règles.',
    'remote.summaryPlaceholder': 'Résumé des règles sur une ligne',
    'remote.aiSummaryPlaceholder': 'Résumé des règles d\'IA sur une ligne, affichage uniquement',
    'remote.aiSummaryTip': 'Utilisé uniquement dans la liste des règles et la vue détaillée. Il n\'est pas utilisé comme contexte de génération d\'IA.',
    'remote.chooseAction': 'Choisir une action',
    'remote.help': 'Afficher la syntaxe des règles',
    'remote.helpTip': 'Consultez des exemples de syntaxe de règle de réécriture.',
    'remote.path': 'Chemin',
    'remote.helpActions': 'Modifiez la requête, les en-têtes de demande, le corps de la demande, les en-têtes de réponse ou le corps de la réponse.',
    'remote.valuePlaceholder': 'Suppressions vides / 123 / true / \"string\"',
    'remote.emptyDeletes': 'Laisser vide pour supprimer le nœud cible',
    'remote.aiPromptPlaceholder': 'Décrire les conditions et les modifications des demandes croisées/réponses. Exemple : lorsque le type de corps de la demande = bienvenue, conservez uniquement le premier élément de la liste de récompenses et définissez les pièces sur 100.',
    'remote.aiGenerate': 'Générer',
    'remote.copyPrompt': 'Copier l\'invite',
    'remote.copyPromptTip': 'Copiez l\'invite à gauche et envoyez-la à une IA externe pour générer le script.',
    'remote.aiScriptPlaceholder': 'Script Python généré par l\'IA. Vous pouvez le modifier manuellement.',
    'remote.example': 'Exemple',
    'remote.exampleTabsAria': 'Exemple de règle de réécriture',
    'remote.compatExample': 'Exemple (compatible)',
    'remote.afterQuery': 'Requête réécrite',
    'remote.afterRequestHead': 'En-têtes de requête réécrits',
    'remote.afterResponseHead': 'En-têtes de réponse réécrits',
    'remote.afterRequestBody': 'Corps de la demande réécrit',
    'remote.afterResponseBody': 'Corps de réponse réécrit',
    'remote.action.query': 'Modifier la requête',
    'remote.action.requestHead': 'En-têtes de demande de modification',
    'remote.action.requestBody': 'Corps de la demande de modification',
    'remote.action.responseHead': 'Modifier les en-têtes de réponse',
    'remote.action.responseBody': 'Modifier le corps de la réponse',
    'remote.action.placeholder': 'Choisir une action',
    'remote.emptySteps': 'Aucune règle de réécriture',
    'remote.dragSort': 'Faites glisser pour réorganiser',
    'remote.editAiRule': 'Modifiez cette règle IA.',
    'remote.editManualRule': 'Modifiez cette règle manuelle.',
    'remote.deleteAiRule': 'Supprimez cette règle IA.',
    'remote.deleteManualRule': 'Supprimez cette règle de réécriture.',
    'remote.aiDefaultSummary': 'Règle de script IA',
    'remote.manualDefaultSummary': 'Règle manuelle',
    'remote.previewError': 'Erreurs de règle',
    'remote.diffBefore': 'Original',
    'remote.diffAfter': 'Après',
    'preview.title': 'Aperçu',
    'preview.emptyTitle': 'Sélectionnez une demande ou une simulation locale pour prévisualiser',
    'preview.searchPlaceholder': 'Rechercher l\'aperçu actuel',
    'preview.tabsAria': 'Corps de requête et de réponse',
    'query.params': 'Paramètres de requête',
    'tabs.overview': 'Vue d’ensemble',
    'overview.request': 'Requête',
    'overview.response': 'Réponse',
    'overview.connection': 'Connexion',
    'overview.timing': 'Temps',
    'overview.size': 'Taille',
    'overview.url': 'URL',
    'overview.method': 'Méthode',
    'overview.protocol': 'Protocole',
    'overview.path': 'Chemin',
    'overview.query': 'Requête',
    'overview.contentType': 'Type de contenu',
    'overview.bodySize': 'Taille du corps',
    'overview.status': 'Statut',
    'overview.loading': 'Chargement',
    'overview.failed': 'Échec',
    'overview.complete': 'Terminé',
    'overview.error': 'Erreur',
    'overview.responseCode': 'Code de réponse',
    'overview.responseMessage': 'Message de réponse',
    'overview.mapping': 'Cartographie',
    'overview.clientAddress': 'Adresse du client',
    'overview.remoteAddress': 'Adresse distante',
    'overview.keptAlive': 'Gardé en vie',
    'overview.ssl': 'SSL',
    'overview.yes': 'Oui',
    'overview.no': 'Non',
    'overview.advanced': 'Avancé',
    'overview.clientConnection': 'Connexion client',
    'overview.serverConnection': 'Connexion au serveur',
    'overview.streamId': 'Identifiant du flux',
    'overview.clientSettings': 'Paramètres clients',
    'overview.serverSettings': 'Paramètres du serveur',
    'overview.requestStartTime': 'Heure de début de la demande',
    'overview.requestEndTime': 'Heure de fin de la demande',
    'overview.responseStartTime': 'Heure de début de réponse',
    'overview.responseEndTime': 'Heure de fin de réponse',
    'overview.duration': 'Durée',
    'overview.dns': 'DNS',
    'overview.connect': 'Connecter',
    'overview.tlsHandshake': 'Poignée de main TLS',
    'overview.latency': 'Latence',
    'overview.speed': 'Vitesse',
    'overview.requestSpeed': 'Vitesse de demande',
    'overview.responseSpeed': 'Vitesse de réponse',
    'overview.header': 'En-tête',
    'overview.queryString': 'Chaîne de requête',
    'overview.cookies': 'Cookies',
    'overview.body': 'Corps',
    'overview.uncompressedBody': 'Corps non compressé',
    'overview.compression': 'Compression',
    'overview.total': 'Total',
    'tabs.matchQuery': 'Requête de correspondance',
    'tabs.requestHead': 'En-têtes de demande',
    'tabs.requestBody': 'Corps de la demande',
    'tabs.matchBody': 'Corps de la demande de correspondance',
    'tabs.responseHead': 'En-têtes de réponse',
    'tabs.responseBody': 'Corps de réponse',
    'actions.copyCurl': 'Copier curl',
    'actions.copyCurlTip': 'Copiez le curl complet de la requête actuelle, y compris l\'URL, les en-têtes et le corps.',
    'actions.repeat': 'Répéter',
    'actions.repeatTip': 'Renvoyez la demande en cours via le proxy. Le résultat apparaîtra dans les demandes récentes.',
    'actions.delete': 'Supprimer',
    'actions.deleteRuleTip': 'Supprimez la règle locale fictive ou de réécriture sélectionnée.',
    'actions.format': 'Formater',
    'actions.formatTip': 'Formatez le contenu JSON actuel.',
    'actions.manualSaveTip': 'Cette portée de correspondance chevauche une autre règle et nécessite une confirmation manuelle.',
    'actions.prev': 'Précédent',
    'actions.next': 'Suivant',
    'actions.close': 'Fermer',
    'actions.cancel': 'Annuler',
    'actions.failed': 'L\'opération a échoué.',
    'actions.open': 'Ouvrir',
    'actions.add': 'Ajouter',
    'actions.search': 'Rechercher',
    'actions.clear': 'Clair',
    'actions.save': 'Enregistrer',
    'actions.saveFailed': 'L\'enregistrement a échoué.',
    'actions.stop': 'Arrêt',
    'actions.start': 'Commencer',
    'actions.stopping': 'Arrêt',
    'actions.starting': 'Départ',
    'common.domain': 'Domaine',
    'common.enabled': 'Activé',
    'common.action': 'Action',
    'common.value': 'Valeur',
    'common.idle': 'Inactif',
    'common.running': 'En cours d\'exécution',
    'common.queued': 'En file d\'attente',
    'status.localIp': 'IP locale',
    'status.proxyPort': 'Port proxy',
    'status.proxyStopped': 'Proxy arrêté',
    'status.recording': 'Enregistrement',
    'status.passThrough': 'Passage uniquement',
    'status.stopRecording': 'Arrêter l\'enregistrement',
    'status.startRecording': 'Commencer l\'enregistrement',
    'status.stopRecordingTip': 'Gardez le proxy disponible, mais transmettez toutes les demandes sans enregistrer ni appliquer de règles.',
    'status.startRecordingTip': 'Commencez à enregistrer et à traiter les demandes via le proxy.',
    'status.toggleFailed': 'Échec de la modification de l\'état d\'enregistrement.',
    'adb.refreshDevices': 'Actualisez les appareils Android.',
    'adb.chooseDevice': 'Choisir un appareil Android',
    'adb.chooseProxy': 'Choisissez un appareil Android pour définir ou effacer le proxy.',
    'adb.setProxy': 'Définir le proxy du téléphone',
    'adb.clearProxy': 'Effacer le proxy du téléphone',
    'adb.setProxyFor': 'Définir le proxy téléphonique : {device}',
    'adb.clearProxyFor': 'Proxy téléphonique clair : {device}',
    'adb.clearProxyTip': 'Effacez le paramètre proxy sur le téléphone.',
    'adb.setProxyTip': 'Définissez le proxy téléphonique sur cette machine.',
    'adb.currentProxy': 'Mandataire actuel : {proxy}',
    'adb.noProxy': 'Aucun proxy configuré',
    'adb.guide': 'Cliquez pour définir le proxy du téléphone',
    'adb.failed': 'L\'opération adb a échoué.',
    'adb.pathHint': 'Assurez-vous qu\'adb est installé et disponible dans PATH.',
    'ai.none': 'Ne pas utiliser AI',
    'ai.switchTip': 'Changer de fournisseur d’IA. Actuel : {provider}',
    'ai.disabledRuleTip': 'L\'IA est désactivée, les règles d\'IA ne peuvent donc pas être créées.',
    'ai.addRuleTip': 'Ajoutez une règle de script AI Python.',
    'ai.ask': 'Demander à l’IA',
    'ai.askTip': 'Ouvre un nouveau terminal et envoie cette requête, le dossier projet et le contexte au fournisseur IA choisi.',
    'ai.askNoProject': 'Associez d’abord un dossier projet local.',
    'ai.askFailed': 'Impossible d’ouvrir le terminal IA.',
    'ai.statusTitle': 'Statut de travail de l\'IA',
    'ai.scriptGeneration': 'Génération de scripts IA',
    'ai.noteAnalysis': 'Analyse des notes',
    'ai.detailAnalysis': 'Explication détaillée',
    'ai.provider': 'Fournisseur',
    'ai.autoNotes': 'Notes automatiques',
    'ai.totalQueue': 'File d\'attente totale',
    'ai.running': 'en cours d\'exécution',
    'ai.pending': 'en file d\'attente',
    'ai.failed': 'échoué',
    'ai.completed': 'complété',
    'ai.current': 'Actuel',
    'ai.lastFailure': 'Dernier échec',
    'ai.runPending': 'En cours d\'exécution/en file d\'attente',
    'ai.completedFailed': 'Terminé / Échec',
    'ai.runningState': 'En cours d\'exécution',
    'ai.stoppedState': 'Arrêté',
    'ai.failedShort': 'Le codex a échoué {count}',
    'ai.generationQueue': 'Génération IA {running}/{total}{pendingText}',
    'ai.pendingSuffix': '· {pending} en file d\'attente',
    'ai.noteQueue': 'Remarques {state} {running}/{total}',
    'ai.detailQueue': 'Détails {state} {running}/{total}',
    'ai.disabledWorkTip': 'L\'IA est désactivée, le travail ne peut donc pas démarrer.',
    'ai.stopWorkTip': 'Arrêtez le travail de l\'IA, effacez les tâches en file d\'attente et interrompez la génération de règles d\'IA en cours d\'exécution.',
    'ai.startWorkTip': 'Démarrez l\'analyse automatique des notes et analysez les API sans notes.',
    'ai.toggleFailed': 'Échec de la modification de l\'état de travail de l\'IA.',
    'note.short': 'Note',
    'note.actionTip': 'Ajoutez ou modifiez une note manuelle pour cette API.',
    'note.title': 'Remarque sur l\'API',
    'note.placeholder': 'A quoi sert cette API ?',
    'note.detail': 'Détails',
    'note.detailTitle': 'Explication détaillée de l\'API',
    'note.detailTip': 'Générez ou affichez les détails des paramètres, des champs et des références de code pour cette API.',
    'note.detailGenerating': 'Générer une explication détaillée.',
    'note.detailFailed': 'L\'explication détaillée a échoué.',
    'note.detailFailedTitle': 'L\'explication détaillée a échoué',
    'note.detailFailedReason': 'Raison : {message}',
    'note.detailFailedAt': 'Échec à : {time}',
    'note.detailStillGenerating': 'Une explication détaillée est toujours en cours de génération. Réessayez plus tard.',
    'note.detailQueue': 'Génération d\'une explication détaillée, file d\'attente {running}/{total}.',
    'note.emptyDetail': 'Aucune explication détaillée pour l\'instant.',
    'note.generateDetail': 'Générer des détails',
    'note.detailFailureButton': 'Échec des détails',
    'note.generating': 'Générateur',
    'note.viewDetailTip': 'Affichez les détails des paramètres, des champs et des références de code générés pour cette API.',
    'note.viewFailureTip': 'Découvrez pourquoi l’explication détaillée a échoué.',
    'note.generatingTip': 'Une explication détaillée est en train de générer. Cliquez pour afficher l\'état de travail de l\'IA.',
    'note.generateTip': 'Générez des détails sur les paramètres, les champs et les références de code pour cette API.',
    'note.regenerate': 'Régénérer',
    'note.generate': 'Générer',
    'settings.title': 'Paramètres',
    'settings.language': 'Langue',
    'settings.appearance': 'Apparence',
    'appearance.system': 'Système',
    'appearance.light': 'Clair',
    'appearance.dark': 'Sombre',
    'settings.treeView': 'Vue arborescente',
    'settings.mergeRequests': 'Fusionner les requêtes',
    'settings.showListNotes': 'Afficher les notes dans la liste',
    'settings.aiAutoNotes': 'Notes IA automatiques',
    'settings.maxHistory': 'Historique maximal',
    'cert.download': 'Télécharger le certificat',
    'tree.expand': 'Développer',
    'tree.collapse': 'Effondrement',
    'tree.actions': 'Actions de l\'arborescence',
    'tree.expandAll': 'Tout développer',
    'tree.collapseAll': 'Tout réduire',
    'context.updateLocal': 'Mettre à jour la simulation locale',
    'context.createLocal': 'Définir comme simulation locale',
    'context.updateRemote': 'Mettre à jour la règle de réécriture',
    'context.createRemote': 'Configurer comme règle de réécriture',
    'context.addAsDomain': 'Ajouter comme domaine de projet',
    'context.openDomain': 'Domaine ouvert',
    'merge.querySourceError': 'La requête de correspondance peut uniquement supprimer des paramètres de la requête en cours. L\'ajout de paramètres, le renommage de clés ou la modification de valeurs nécessitent une sauvegarde manuelle.',
    'merge.bodySourceError': 'Le corps de la demande de correspondance peut uniquement supprimer des champs de la demande en cours. L\'ajout de champs, le renommage des champs, la modification des valeurs ou la modification de la structure nécessitent une sauvegarde manuelle.',
    'merge.sourceError': 'Les modèles de correspondance ne peuvent que restreindre la demande actuelle. D\'autres modifications nécessitent une sauvegarde manuelle.',
    'merge.conflictAutoSave': 'Cette étendue de correspondance contient une autre configuration globale pour la même API, elle ne peut donc pas être enregistrée automatiquement. Ajustez le corps de la requête/de la demande de correspondance ou cliquez sur Enregistrer pour valider à nouveau.',
    'merge.manualSaveDefault': 'Cette portée de correspondance chevauche une autre règle. Enregistrez manuellement et validez à nouveau.',
    'merge.conflictSave': 'La portée de la correspondance de règle chevauche une autre règle et ne peut pas être enregistrée.',
    'merge.conflictWithRule': 'Cette étendue de correspondance chevauche « {target} » et ne peut pas être enregistrée automatiquement. Ajustez le corps de la requête/de la demande de correspondance ou cliquez sur Enregistrer pour valider à nouveau.',
    'merge.otherRule': 'une autre règle',
    'query.ignoreTip': 'Laissez vide pour ignorer la requête. Entrez a=1&b=2 pour exiger ces champs.',
    'query.templateTip': 'Lorsque cette case n\'est pas cochée, les demandes doivent inclure ces champs. Laissez vide pour ignorer la requête. Les champs supplémentaires et toute commande sont autorisés.',
    'query.mergeTip': 'Lorsqu\'elle est activée, différentes valeurs de requête sont regroupées. Désactivez-le pour modifier la correspondance des champs obligatoires.',
    'query.matchingTitle': 'Requête utilisée pour la correspondance',
    'query.ignoredTitle': 'Requête ignorée pour la correspondance',
    'query.deleteAria': 'Supprimer de la requête de correspondance',
    'body.deleteAria': 'Supprimer du corps de la demande de correspondance',
    'remote.ruleEnabledAria': 'Activer la règle',
    'actions.edit': 'Modifier',
    'remote.summaryAria': 'Résumé en une ligne',
    'remote.defaultDslMissing': 'manquant',
    'remote.defaultDslEmpty': 'vide',
    'actions.invalidJson': 'JSON invalide',
    'actions.formatted': 'Formaté',
    'ai.statusQueued': 'En file d\'attente',
    'ai.statusGenerating': 'Générateur',
    'ai.statusGenerated': 'Généré',
    'ai.statusStopped': 'Arrêté',
    'ai.statusFailed': 'La génération a échoué',
    'ai.copied': 'Copié',
    'ai.copyFailed': 'Échec de la copie',
    'ai.promptRequired': 'Saisissez une invite pour la génération de règles IA.',
    'ai.queuedDots': 'En file d\'attente...',
    'ai.submitJob': 'Soumission du travail de génération d\'IA...',
    'ai.generatingDots': 'Générateur...',
    'ai.queued': 'En file d\'attente',
    'ai.failedSentence': 'La génération a échoué.',
    'ai.existingJob': 'Une tâche de génération d\'IA est déjà en cours d\'exécution.',
    'ai.enqueuedJob': 'Ajouté à la file d\'attente de génération d\'IA.',
    'remote.previewFailed': 'L\'aperçu a échoué.',
    'remote.incomplete': 'La règle de réécriture est incomplète.',
    'remote.pathNoSpace': 'Le chemin de clé ne peut pas contenir d\'espaces.',
    'remote.valueEncodeError': 'La valeur contient des caractères qui ne peuvent pas être codés.',
    'actions.repeatFailed': 'La répétition a échoué.',
    'actions.done': 'Fait',
    'capture.loadingDetail': 'Chargement des détails de la demande...',
    'capture.retryLater': 'Cliquez à nouveau plus tard.',
    'capture.detailLoadFailed': 'Échec du chargement des détails de la demande.',
    'capture.hitLocal': 'Simulation locale correspondante',
    'capture.hitRemote': 'Règle de réécriture correspondante',
    'capture.proxyFailed': 'La demande de proxy a échoué',
    'capture.reason': 'Raison : {message}',
    'capture.type': 'Type : {type}',
    'capture.requestTime': 'Heure de la demande {time}',
    'capture.detailTimeout': 'Les détails de la demande ont expiré. Réessayez plus tard.',
    'preview.request': 'Demander un aperçu',
    'preview.localEdit': 'Éditeur de simulation local',
    'preview.remoteEdit': 'Éditeur de règles de réécriture',
    'preview.globalRemote': 'Règle de réécriture globale',
    'tabs.query': 'Requête',
    'tabs.modifyRules': 'Règles',
    'local.updateTip': 'Actualisez la maquette locale existante avec la demande et la réponse actuelles.',
    'remote.updateTip': 'Actualisez les données de demande pour la règle de réécriture existante sans écraser les règles modifiées.',
    'note.ruleTip': 'Ajoutez ou modifiez une note d\'une ligne pour cette règle. Les notes vides sont masquées dans la liste.',
    'note.apiTip': 'Ajoutez ou modifiez une note pour cette API. Les notes vides sont masquées dans la liste.',
    'diff.before': 'Avant',
    'diff.after': 'Après',
    'diff.prev': 'Différence précédente',
    'diff.next': 'Différence suivante',
    'diff.current': 'Aller au différentiel actuel',
    'diff.copyAll': 'Copiez tout le texte {title}',
    'diff.copyFailed': 'Échec de la copie',
    'diff.omittedLines': '... omis les lignes {count} inchangées ...',
    'diff.truncated': '...contenu trop long, caractères {count} tronqués...',
    'diff.viewFull': 'Afficher le contenu complet de ce côté',
    'diff.back': '← Retour aux différences',
    'diff.fullTitle': '{title} · Aperçu complet',
    'rule.global': 'Règle globale',
    'rule.matchSummary': 'Correspondance : {text}',
    'query.none': 'Aucun paramètre de requête',
    'capture.requestDetail': 'Détails de la demande',
    'aiGuide.myRequest': 'Ma demande :',
    'aiGuide.outputOnly': 'Affichez uniquement le script Python complet. N\'utilisez pas de Markdown, de barrières de code ou de texte explicatif.',
    'aiGuide.commentSafe': 'Les commentaires doivent résumer uniquement la logique. N\'incluez pas les corps de requête complets, les corps de réponse, la base64 ou les données sensibles.',
    'aiGuide.comment': 'En haut du script, à partir de la première ligne, écrivez des commentaires Python détaillés décrivant ce que fait le script, les étapes qu\'il affecte, les champs auxquels il correspond ou modifie et si les requêtes sans correspondance transitent.',
    'aiGuide.stdlib': 'Utilisez uniquement la bibliothèque standard Python. N\'accédez pas au réseau, ne lisez/écrivez pas de fichiers locaux et n\'imprimez pas de texte explicatif.',
    'aiGuide.noSensitive': 'Ne placez pas les corps de requête complets, les corps de réponse, le contenu base64 ou ctx dans des exceptions, des assertions, des sorties d\'impression, des résumés ou des erreurs renvoyées.',
    'aiGuide.dropBase64': 'Si vous modifiez une chaîne de corps, supprimez bodyBase64 de l\'objet correspondant afin que l\'ancienne valeur base64 ne puisse pas remplacer votre modification de corps.',
    'aiGuide.base64': 'bodyBase64 est uniquement destiné au contenu binaire. Sauf si une gestion binaire est requise, ne lisez pas, n’analysez pas et ne réécrivez pas bodyBase64.',
    'aiGuide.parseBody': 'Lorsque vous modifiez du texte codé en JSON ou en URL, préférez analyser et éditer ctx[\"request\"][\"body\"] ou ctx[\"response\"][\"body\"].',
    'aiGuide.returnCtx': 'Modifiez directement ctx et renvoyez ctx. Si une étape ne nécessite aucune modification, renvoyez ctx inchangé.',
    'aiGuide.crossIntent': 'L\'intention de l\'utilisateur peut décrire une logique à plusieurs étapes telle que « lorsque le corps de la demande xxx, modifiez le corps de la réponse xxx » ou « lorsque le paramètre de requête xxx, modifiez l\'en-tête de la réponse xxx ». Lisez les conditions ctx[\"request\"] à l\'étape concernée et modifiez ctx[\"response\"] ou les champs cibles demandés.',
    'aiGuide.crossContext': 'Le script peut utiliser le contexte complet de demande et de réponse de la même transaction. Par exemple, lorsque le type de corps de la demande = bienvenue, l\'onglet de requête = home ou qu\'un en-tête de demande correspond à une valeur, modifiez le corps de la réponse, les en-têtes de réponse ou le corps de la demande.',
    'aiGuide.response': 'ctx[\"response\"] contient statusCode, statusMessage, les en-têtes, le corps, bodyBase64 et contentType.',
    'aiGuide.request': 'ctx[\"request\"] contient la méthode, l\'URL, les en-têtes, la requête, le chemin, le corps, le bodyBase64 et le contentType.',
    'aiGuide.stage': 'ctx[\"stage\"] est l\'un des éléments suivants : request_head, request_body, Response_head ou Response_body.',
    'aiGuide.ctxCall': 'Le script s\'exécute pendant le proxy et reçoit un dictionnaire ctx. Vous pouvez définir handle(ctx) ou définir on_request_head(ctx), on_request_body(ctx), on_response_head(ctx) et on_response_body(ctx).',
    'aiGuide.ruleSample': 'Cette règle inclut généralement un échantillon de requête. Vous pouvez utiliser des exemples de champs comme référence, mais vérifiez toujours que les champs existent au moment de l\'exécution.',
    'aiGuide.globalSample': 'Il n’y a pas d’échantillon de demande ou de réponse fixe. Ne présumez pas qu’il existe un chemin, une requête, un corps de requête ou un corps de réponse. Dans le script, vérifiez en toute sécurité les champs ctx d\'exécution tels que la méthode, le chemin, la requête, les en-têtes et le corps avant de modifier quoi que ce soit.',
    'aiGuide.ruleIntro': 'Vous générez une règle de réécriture pour HttpMocker. La règle doit être un script Python.',
    'aiGuide.globalIntro': 'Vous générez une règle de réécriture globale pour HttpMocker. Il s\'applique uniquement à l\'hôte {host} et peut s\'exécuter pour chaque requête sur cet hôte. La règle doit être un script Python.',
    'aiGuide.title': 'Invite à copier vers une IA externe',
    'aiGuide.missingHost': '[entrez d\'abord un hôte]',
    'aiGuide.empty': '[vide]',
    'capture.loading': 'Chargement...',
    'local.action': 'Enregistrer localement',
    'remote.action': 'Réécriture',
  },
  ar: {
    'startup.title': 'يقوم HttpMocker بتجهيز اللوحة',
    'startup.subtitle': 'جارٍ تحميل الطلبات والقواعد والإعدادات...',
    'startup.errorTitle': 'فشل تهيئة اللوحة',
    'startup.errorMessage': 'فشلت التهيئة. حدّث الصفحة وحاول مرة أخرى.',
    'project.guide': 'انقر لاختيار مجلد المشروع',
    'project.noDomain': 'بدون نطاق',
    'project.selectDirectory': 'اختر مجلد المشروع',
    'project.clearDirectory': 'إزالة ارتباط المشروع',
    'project.linkedDirectory': 'المشروع المرتبط: {path}\nانقر لمسح رابط المشروع.',
    'project.needDirectory': 'يحتاج الذكاء الاصطناعي إلى المشروع المحلي لهذا المجال. انقر لاختيار مجلد المشروع.',
    'project.pickDirectoryTip': 'اختر المشروع المحلي لمجموعة الطلبات هذه.',
    'project.selectPathFailed': 'فشل في اختيار مسار المشروع.',
    'project.domainTabs': 'مجالات المشروع',
    'project.dialog.historyTitle': 'تاريخ المجال',
    'project.dialog.selectTitle': 'اختر المجال',
    'project.dialog.addTitle': 'أضف المجال',
    'project.dialog.initialHistory': 'اختر مجالًا من السجل لفتح المشروع.',
    'project.dialog.initial': 'اختر مجال المشروع أولاً، أو استخدم جميع المجالات لعرض كل طلب وقاعدة.',
    'project.dialog.history': 'اختر مجالًا من السجل كالمشروع الحالي.',
    'project.dialog.add': 'إضافة مجال المشروع.',
    'project.dialog.noHistoryInitial': 'لا يوجد سجل المجال. أضف مجالًا من القائمة \"ملف\"، ثم أعد فتحه.',
    'project.dialog.noHistory': 'لا يوجد سجل المجال.',
    'nav.captures': 'الطلبات الأخيرة',
    'nav.local': 'محاكاة محلية',
    'nav.remote': 'إعادة كتابة',
    'nav.mainTools': 'التنقل والأدوات الرئيسية',
    'nav.requestsAndRules': 'الطلبات والقواعد',
    'layout.resizer': 'تغيير حجم القائمة وأجزاء المعاينة',
    'globalSearch.title': 'بحث عام',
    'globalSearch.tip': 'استعلام البحث ورؤوس الطلب ونص الطلب ونص الاستجابة في المشروع الحالي. الاختصار: كمد + شيفت + F',
    'globalSearch.placeholder': 'استعلام البحث، الرؤوس، نص الطلب، نص الاستجابة',
    'globalSearch.currentProject': 'المشروع الحالي: {domain}',
    'globalSearch.allDomains': 'المشروع الحالي: جميع المجالات',
    'globalSearch.loading': 'جارٍ البحث...',
    'globalSearch.start': 'أدخل كلمة رئيسية للبحث.',
    'globalSearch.noResults': 'لا توجد مباريات.',
    'globalSearch.failed': 'فشل البحث.',
    'globalSearch.unknownHost': 'مضيف غير معروف',
    'update.available': 'يتوفر إصدار جديد {version}',
    'update.openRelease': 'الحصول على التحديث',
    'update.availableTitle': 'يتوفر تحديث',
    'update.dialogAvailable': 'الإصدار {version} جاهز للتنزيل.',
    'update.noUpdateTitle': 'أحدث إصدار مثبت',
    'update.noUpdate': 'أنت تستخدم أحدث إصدار بالفعل.',
    'update.checkFailedTitle': 'فشل التحقق من التحديث',
    'update.checkFailed': 'فشل التحقق من التحديث. حاول مرة أخرى لاحقًا.',
    'clear.history': 'مسح السجل',
    'clear.menuTip': 'اختر سجل الطلبات الأخير المراد مسحه.',
    'clear.older': 'مسح الإدخالات الأقدم',
    'clear.allHistory': 'مسح كل التاريخ',
    'clear.notes': 'مسح الملاحظات',
    'clear.rules': 'قواعد واضحة',
    'clear.confirmAllCaptures': 'هل تريد محو سجل الطلبات الحديثة بالكامل؟\n\nيؤدي هذا إلى إزالة قائمة الطلبات الحالية والإدخالات القديمة، لكنه يحتفظ بالملاحظات والقواعد.',
    'clear.confirmOlderCaptures': 'هل تريد مسح الإدخالات القديمة؟\n\nيؤدي هذا إلى إزالة الطوابع الزمنية القديمة التي تظهر بعد توسيع كل طلب والاحتفاظ فقط بالطلب الأخير لكل مجموعة ضمن إعدادات الدمج الحالية. يتم الاحتفاظ بالطلبات والملاحظات والقواعد الأخيرة.',
    'clear.confirmNotes': 'مسح جميع الملاحظات والشروحات التفصيلية؟\n\nيؤدي هذا إلى إزالة الملاحظات اليدوية والملاحظات التي تم إنشاؤها بواسطة الذكاء الاصطناعي والتفسيرات التفصيلية. يتم الاحتفاظ بسجل الطلب والقواعد.',
    'clear.confirmRules': 'مسح كافة القواعد؟\n\nيؤدي هذا إلى إزالة جميع النماذج المحلية وإعادة كتابة القواعد، بما في ذلك البيانات المخزنة مؤقتًا. يتم الاحتفاظ بسجل الطلب والملاحظات.',
    'capture.viewToggle': 'تبديل عرض الطلب الأخير',
    'capture.viewTreeTip': 'عرض الشجرة نشط. انقر للتبديل إلى عرض القائمة.',
    'capture.viewListTip': 'عرض القائمة نشط. انقر للتبديل إلى عرض الشجرة.',
    'capture.filterPlaceholder': 'التصفية حسب مسار واجهة برمجة التطبيقات أو الملاحظة',
    'capture.listAria': 'قائمة الطلبات الأخيرة',
    'capture.mergeByQuery': 'تجميع بشكل منفصل حسب الاستعلام',
    'capture.mergeByBody': 'تجميع بشكل منفصل حسب نص الطلب',
    'capture.originalBody': 'نص الطلب الأصلي',
    'capture.empty': 'لا توجد طلبات بعد. اضبط وكيل المتصفح أو التطبيق على هذا الجهاز ثم أعد التحميل.',
    'capture.noMatch': 'لا توجد طلبات مطابقة.',
    'capture.historyAria': 'طلب الطوابع الزمنية للتاريخ',
    'capture.olderToggle': 'الإدخالات الأقدم · انقر على {action}',
    'capture.expand': 'يوسع',
    'capture.collapse': 'ينهار',
    'capture.unknownHost': 'مضيف غير معروف',
    'local.listAria': 'قائمة وهمية محلية',
    'local.actionTip': 'احفظ الاستجابة الحالية كنموذج محلي. ستعيد الطلبات المطابقة هذا المحتوى المحلي مباشرةً.',
    'local.empty': 'لا يوجد سخرية محلية حتى الآن. قم بإنشاء واحد من الطلبات الأخيرة.',
    'rule.hitCaptures': 'الطلبات المطابقة',
    'remote.listAria': 'إعادة كتابة قائمة القواعد',
    'remote.actionTip': 'قم بإنشاء قواعد إعادة الكتابة التي يمكنها تعديل الاستعلام أو الرؤوس أو نص الطلب أو نص الاستجابة أثناء إنشاء الوكيل.',
    'remote.globalEnabled': 'تمكين القاعدة العالمية',
    'remote.globalRules': 'القواعد العالمية',
    'remote.addGlobalRule': 'إضافة القاعدة العالمية',
    'remote.addRule': 'إضافة قاعدة إعادة الكتابة',
    'remote.addRuleTip': 'أضف قاعدة إعادة الكتابة.',
    'remote.aiRule': 'قاعدة البرنامج النصي لمنظمة العفو الدولية',
    'remote.manualRule': 'القاعدة اليدوية',
    'remote.back': 'العودة إلى قائمة القواعد',
    'remote.backTip': 'العودة إلى قائمة القواعد.',
    'remote.summaryPlaceholder': 'ملخص قاعدة السطر الواحد',
    'remote.aiSummaryPlaceholder': 'ملخص قاعدة الذكاء الاصطناعي من سطر واحد، للعرض فقط',
    'remote.aiSummaryTip': 'يستخدم فقط في قائمة القواعد وعرض التفاصيل. ولا يتم استخدامه كسياق لتوليد الذكاء الاصطناعي.',
    'remote.chooseAction': 'اختر الإجراء',
    'remote.help': 'عرض بناء جملة القاعدة',
    'remote.helpTip': 'عرض أمثلة لإعادة كتابة بناء جملة القاعدة.',
    'remote.path': 'طريق',
    'remote.helpActions': 'قم بتغيير الاستعلام أو رؤوس الطلب أو نص الطلب أو رؤوس الاستجابة أو نص الاستجابة.',
    'remote.valuePlaceholder': 'عمليات الحذف الفارغة / 123 / صحيح / \"سلسلة\"',
    'remote.emptyDeletes': 'اتركه فارغًا لحذف العقدة المستهدفة',
    'remote.aiPromptPlaceholder': 'وصف شروط وتغييرات الطلب/الاستجابة. مثال: عندما يكون نوع نص الطلب = مرحبًا، احتفظ فقط بعنصر قائمة المكافآت الأول وقم بتعيين العملات المعدنية على 100.',
    'remote.aiGenerate': 'يولد',
    'remote.copyPrompt': 'نسخة موجه',
    'remote.copyPromptTip': 'انسخ المطالبة الموجودة على اليسار وأرسلها إلى الذكاء الاصطناعي الخارجي لإنشاء البرنامج النصي.',
    'remote.aiScriptPlaceholder': 'برنامج Python النصي الذي تم إنشاؤه بواسطة الذكاء الاصطناعي. ويمكنك تحريره يدويًا.',
    'remote.example': 'مثال',
    'remote.exampleTabsAria': 'إعادة كتابة مثال القاعدة',
    'remote.compatExample': 'مثال (متوافق)',
    'remote.afterQuery': 'إعادة كتابة الاستعلام',
    'remote.afterRequestHead': 'إعادة كتابة رؤوس الطلبات',
    'remote.afterResponseHead': 'إعادة كتابة رؤوس الاستجابة',
    'remote.afterRequestBody': 'إعادة كتابة نص الطلب',
    'remote.afterResponseBody': 'إعادة كتابة نص الاستجابة',
    'remote.action.query': 'تغيير الاستعلام',
    'remote.action.requestHead': 'تغيير رؤوس الطلبات',
    'remote.action.requestBody': 'تغيير نص الطلب',
    'remote.action.responseHead': 'تغيير رؤوس الاستجابة',
    'remote.action.responseBody': 'تغيير نص الاستجابة',
    'remote.action.placeholder': 'اختر الإجراء',
    'remote.emptySteps': 'لا توجد قواعد إعادة كتابة',
    'remote.dragSort': 'اسحب لإعادة الترتيب',
    'remote.editAiRule': 'قم بتحرير قاعدة الذكاء الاصطناعي هذه.',
    'remote.editManualRule': 'قم بتحرير هذه القاعدة اليدوية.',
    'remote.deleteAiRule': 'احذف قاعدة الذكاء الاصطناعي هذه.',
    'remote.deleteManualRule': 'احذف قاعدة إعادة الكتابة هذه.',
    'remote.aiDefaultSummary': 'قاعدة البرنامج النصي لمنظمة العفو الدولية',
    'remote.manualDefaultSummary': 'القاعدة اليدوية',
    'remote.previewError': 'أخطاء القواعد',
    'remote.diffBefore': 'إبداعي',
    'remote.diffAfter': 'بعد',
    'preview.title': 'معاينة',
    'preview.emptyTitle': 'حدد طلبًا أو نموذجًا محليًا لمعاينته',
    'preview.searchPlaceholder': 'البحث في المعاينة الحالية',
    'preview.tabsAria': 'هيئات الطلب والاستجابة',
    'query.params': 'معلمات الاستعلام',
    'tabs.overview': 'نظرة عامة',
    'overview.request': 'الطلب',
    'overview.response': 'الاستجابة',
    'overview.connection': 'الاتصال',
    'overview.timing': 'التوقيت',
    'overview.size': 'الحجم',
    'overview.url': 'عنوان URL',
    'overview.method': 'الطريقة',
    'overview.protocol': 'بروتوكول',
    'overview.path': 'المسار',
    'overview.query': 'استفسار',
    'overview.contentType': 'نوع المحتوى',
    'overview.bodySize': 'حجم الجسم',
    'overview.status': 'الحالة',
    'overview.loading': 'جارٍ التحميل',
    'overview.failed': 'فشل',
    'overview.complete': 'مكتمل',
    'overview.error': 'خطأ',
    'overview.responseCode': 'رمز الاستجابة',
    'overview.responseMessage': 'رسالة الرد',
    'overview.mapping': 'رسم الخرائط',
    'overview.clientAddress': 'عنوان العميل',
    'overview.remoteAddress': 'العنوان البعيد',
    'overview.keptAlive': 'أبقى على قيد الحياة',
    'overview.ssl': 'طبقة المقابس الآمنة',
    'overview.yes': 'نعم',
    'overview.no': 'لا',
    'overview.advanced': 'متقدم',
    'overview.clientConnection': 'اتصال العميل',
    'overview.serverConnection': 'اتصال الخادم',
    'overview.streamId': 'معرف الدفق',
    'overview.clientSettings': 'إعدادات العميل',
    'overview.serverSettings': 'إعدادات الخادم',
    'overview.requestStartTime': 'طلب وقت البدء',
    'overview.requestEndTime': 'طلب وقت الانتهاء',
    'overview.responseStartTime': 'وقت بدء الاستجابة',
    'overview.responseEndTime': 'وقت انتهاء الاستجابة',
    'overview.duration': 'مدة',
    'overview.dns': 'DNS',
    'overview.connect': 'يتصل',
    'overview.tlsHandshake': 'مصافحة TLS',
    'overview.latency': 'كمون',
    'overview.speed': 'سرعة',
    'overview.requestSpeed': 'سرعة الطلب',
    'overview.responseSpeed': 'سرعة الاستجابة',
    'overview.header': 'رأس',
    'overview.queryString': 'سلسلة الاستعلام',
    'overview.cookies': 'ملفات تعريف الارتباط',
    'overview.body': 'جسم',
    'overview.uncompressedBody': 'جسم غير مضغوط',
    'overview.compression': 'ضغط',
    'overview.total': 'الإجمالي',
    'tabs.matchQuery': 'استعلام المطابقة',
    'tabs.requestHead': 'طلب الرؤوس',
    'tabs.requestBody': 'هيئة الطلب',
    'tabs.matchBody': 'مطابقة نص الطلب',
    'tabs.responseHead': 'رؤوس الاستجابة',
    'tabs.responseBody': 'هيئة الاستجابة',
    'actions.copyCurl': 'نسخ curl',
    'actions.copyCurlTip': 'انسخ الضفيرة الكاملة للطلب الحالي، بما في ذلك عنوان URL والرؤوس والنص الأساسي.',
    'actions.repeat': 'تكرار',
    'actions.repeatTip': 'إعادة إرسال الطلب الحالي من خلال الوكيل. ستظهر النتيجة في الطلبات الأخيرة.',
    'actions.delete': 'حذف',
    'actions.deleteRuleTip': 'احذف القاعدة المحلية المحددة أو أعد كتابة القاعدة.',
    'actions.format': 'تنسيق',
    'actions.formatTip': 'قم بتنسيق محتوى JSON الحالي.',
    'actions.manualSaveTip': 'يتداخل نطاق المطابقة هذا مع قاعدة أخرى ويحتاج إلى تأكيد يدوي.',
    'actions.prev': 'سابق',
    'actions.next': 'التالي',
    'actions.close': 'إغلاق',
    'actions.cancel': 'إلغاء',
    'actions.failed': 'فشلت العملية.',
    'actions.open': 'يفتح',
    'actions.add': 'يضيف',
    'actions.search': 'بحث',
    'actions.clear': 'واضح',
    'actions.save': 'حفظ',
    'actions.saveFailed': 'فشل الحفظ.',
    'actions.stop': 'قف',
    'actions.start': 'يبدأ',
    'actions.stopping': 'وقف',
    'actions.starting': 'البدء',
    'common.domain': 'النطاق',
    'common.enabled': 'مفعّل',
    'common.action': 'الإجراء',
    'common.value': 'القيمة',
    'common.idle': 'عاطل',
    'common.running': 'جري',
    'common.queued': 'في قائمة الانتظار',
    'status.localIp': 'IP المحلي',
    'status.proxyPort': 'منفذ الوكيل',
    'status.proxyStopped': 'الوكيل متوقف',
    'status.recording': 'جارٍ التسجيل',
    'status.passThrough': 'العبور فقط',
    'status.stopRecording': 'توقف عن التسجيل',
    'status.startRecording': 'ابدأ التسجيل',
    'status.stopRecordingTip': 'احتفظ بالوكيل متاحًا، ولكن قم بتمرير جميع الطلبات دون تسجيل القواعد أو تطبيقها.',
    'status.startRecordingTip': 'ابدأ بتسجيل ومعالجة الطلبات من خلال الوكيل.',
    'status.toggleFailed': 'فشل في تغيير حالة التسجيل.',
    'adb.refreshDevices': 'تحديث أجهزة أندرويد.',
    'adb.chooseDevice': 'اختر جهاز Android',
    'adb.chooseProxy': 'اختر جهاز Android لتعيين الوكيل أو مسحه.',
    'adb.setProxy': 'تعيين وكيل الهاتف',
    'adb.clearProxy': 'مسح وكيل الهاتف',
    'adb.setProxyFor': 'تعيين وكيل الهاتف: {device}',
    'adb.clearProxyFor': 'مسح وكيل الهاتف: {device}',
    'adb.clearProxyTip': 'امسح إعداد الوكيل على الهاتف.',
    'adb.setProxyTip': 'قم بتعيين وكيل الهاتف على هذا الجهاز.',
    'adb.currentProxy': 'الوكيل الحالي: {proxy}',
    'adb.noProxy': 'لم يتم تكوين الوكيل',
    'adb.guide': 'انقر لتعيين وكيل الهاتف',
    'adb.failed': 'فشلت عملية بنك التنمية الآسيوي.',
    'adb.pathHint': 'تأكد من تثبيت adb وتوافره في PATH.',
    'ai.none': 'عدم استخدام AI',
    'ai.switchTip': 'تبديل مزود الذكاء الاصطناعي. الحالي: {provider}',
    'ai.disabledRuleTip': 'تم تعطيل الذكاء الاصطناعي، لذلك لا يمكن إنشاء قواعد الذكاء الاصطناعي.',
    'ai.addRuleTip': 'أضف قاعدة البرنامج النصي AI Python.',
    'ai.ask': 'اسأل AI',
    'ai.askTip': 'افتح طرفية جديدة وأرسل هذا الطلب ومجلد المشروع والسياق إلى مزود AI المحدد.',
    'ai.askNoProject': 'اربط مجلد مشروع محلي أولاً.',
    'ai.askFailed': 'تعذر فتح طرفية AI.',
    'ai.statusTitle': 'حالة عمل الذكاء الاصطناعي',
    'ai.scriptGeneration': 'إنشاء نصوص الذكاء الاصطناعي',
    'ai.noteAnalysis': 'تحليل الملاحظة',
    'ai.detailAnalysis': 'شرح مفصل',
    'ai.provider': 'مزود',
    'ai.autoNotes': 'الملاحظات التلقائية',
    'ai.totalQueue': 'قائمة الانتظار الإجمالية',
    'ai.running': 'جري',
    'ai.pending': 'في قائمة الانتظار',
    'ai.failed': 'فشل',
    'ai.completed': 'مكتمل',
    'ai.current': 'حاضِر',
    'ai.lastFailure': 'الفشل الأخير',
    'ai.runPending': 'قيد التشغيل / في قائمة الانتظار',
    'ai.completedFailed': 'اكتمل / فشل',
    'ai.runningState': 'جري',
    'ai.stoppedState': 'توقف',
    'ai.failedShort': 'فشل المخطوطة {count}',
    'ai.generationQueue': 'جيل الذكاء الاصطناعي {running}/{total}{pendingText}',
    'ai.pendingSuffix': '· في قائمة الانتظار {pending}',
    'ai.noteQueue': 'ملاحظات {state} {running}/{total}',
    'ai.detailQueue': 'التفاصيل {state} {running}/{total}',
    'ai.disabledWorkTip': 'تم تعطيل الذكاء الاصطناعي، لذا لا يمكن بدء العمل.',
    'ai.stopWorkTip': 'إيقاف عمل الذكاء الاصطناعي، ومسح المهام الموجودة في قائمة الانتظار، ومقاطعة تشغيل إنشاء قواعد الذكاء الاصطناعي.',
    'ai.startWorkTip': 'ابدأ التحليل التلقائي للملاحظات وافحص واجهات برمجة التطبيقات بدون ملاحظات.',
    'ai.toggleFailed': 'فشل في تغيير حالة عمل الذكاء الاصطناعي.',
    'note.short': 'ملحوظة',
    'note.actionTip': 'أضف أو قم بتحرير ملاحظة يدوية لواجهة برمجة التطبيقات هذه.',
    'note.title': 'ملاحظة واجهة برمجة التطبيقات',
    'note.placeholder': 'ماذا تفعل واجهة برمجة التطبيقات هذه؟',
    'note.detail': 'تفاصيل',
    'note.detailTitle': 'شرح تفصيلي لواجهة برمجة التطبيقات (API).',
    'note.detailTip': 'قم بإنشاء أو عرض تفاصيل المعلمة والحقل ومرجع التعليمات البرمجية لواجهة برمجة التطبيقات هذه.',
    'note.detailGenerating': 'توليد شرح مفصل.',
    'note.detailFailed': 'فشل الشرح التفصيلي.',
    'note.detailFailedTitle': 'فشل الشرح التفصيلي',
    'note.detailFailedReason': 'السبب: {message}',
    'note.detailFailedAt': 'فشل في: {time}',
    'note.detailStillGenerating': 'لا يزال الشرح التفصيلي قيد الإنشاء. حاول مرة أخرى لاحقًا.',
    'note.detailQueue': 'إنشاء شرح مفصل، قائمة الانتظار {running}/{total}.',
    'note.emptyDetail': 'لا يوجد شرح مفصل حتى الآن.',
    'note.generateDetail': 'توليد التفاصيل',
    'note.detailFailureButton': 'تفاصيل فاشلة',
    'note.generating': 'توليد',
    'note.viewDetailTip': 'عرض تفاصيل المعلمة والحقل ومرجع التعليمات البرمجية التي تم إنشاؤها لواجهة برمجة التطبيقات هذه.',
    'note.viewFailureTip': 'شاهد سبب فشل الشرح التفصيلي.',
    'note.generatingTip': 'يتم إنشاء شرح مفصل. انقر لعرض حالة عمل الذكاء الاصطناعي.',
    'note.generateTip': 'قم بإنشاء تفاصيل المعلمة والحقل ومرجع التعليمات البرمجية لواجهة برمجة التطبيقات (API) هذه.',
    'note.regenerate': 'تجديد',
    'note.generate': 'يولد',
    'settings.title': 'الإعدادات',
    'settings.language': 'اللغة',
    'settings.appearance': 'المظهر',
    'appearance.system': 'النظام',
    'appearance.light': 'فاتح',
    'appearance.dark': 'داكن',
    'settings.treeView': 'عرض شجري',
    'settings.mergeRequests': 'دمج الطلبات',
    'settings.showListNotes': 'عرض الملاحظات في القائمة',
    'settings.aiAutoNotes': 'إنشاء ملاحظات AI تلقائيًا',
    'settings.maxHistory': 'الحد الأقصى للسجل',
    'cert.download': 'تحميل الشهادة',
    'tree.expand': 'يوسع',
    'tree.collapse': 'ينهار',
    'tree.actions': 'إجراءات عرض الشجرة',
    'tree.expandAll': 'قم بتوسيع الكل',
    'tree.collapseAll': 'طي الكل',
    'context.updateLocal': 'تحديث وهمية المحلية',
    'context.createLocal': 'تعيين كنموذج محلي',
    'context.updateRemote': 'تحديث قاعدة إعادة الكتابة',
    'context.createRemote': 'تكوين كقاعدة إعادة كتابة',
    'context.addAsDomain': 'إضافة كمجال المشروع',
    'context.openDomain': 'المجال مفتوح',
    'merge.querySourceError': 'يمكن لاستعلام المطابقة إزالة المعلمات من الطلب الحالي فقط. تتطلب إضافة المعلمات أو إعادة تسمية المفاتيح أو تغيير القيم حفظًا يدويًا.',
    'merge.bodySourceError': 'يمكن لنص طلب المطابقة إزالة الحقول من الطلب الحالي فقط. تتطلب إضافة الحقول أو إعادة تسمية الحقول أو تغيير القيم أو تغيير البنية حفظًا يدويًا.',
    'merge.sourceError': 'يمكن لقوالب المطابقة فقط تضييق نطاق الطلب الحالي. تتطلب التغييرات الأخرى حفظًا يدويًا.',
    'merge.conflictAutoSave': 'يحتوي نطاق المطابقة هذا على تكوين مجمع آخر لنفس واجهة برمجة التطبيقات، لذلك لا يمكن حفظه تلقائيًا. اضبط نص الاستعلام/الطلب المطابق، أو انقر فوق \"حفظ\" للتحقق من الصحة مرة أخرى.',
    'merge.manualSaveDefault': 'يتداخل نطاق المطابقة هذا مع قاعدة أخرى. احفظ يدويًا ثم تحقق مرة أخرى.',
    'merge.conflictSave': 'يتداخل نطاق مطابقة القاعدة مع قاعدة أخرى ولا يمكن حفظه.',
    'merge.conflictWithRule': 'يتداخل نطاق المطابقة هذا مع \"{target}\" ولا يمكن حفظه تلقائيًا. اضبط نص الاستعلام/الطلب المطابق، أو انقر فوق \"حفظ\" للتحقق من الصحة مرة أخرى.',
    'merge.otherRule': 'قاعدة أخرى',
    'query.ignoreTip': 'اتركه فارغا لتجاهل الاستعلام. أدخل a=1&b=2 للمطالبة بهذه الحقول.',
    'query.templateTip': 'عند إلغاء التحديد، يجب أن تتضمن الطلبات هذه الحقول. اتركه فارغا لتجاهل الاستعلام. يُسمح بالحقول الإضافية وأي طلب.',
    'query.mergeTip': 'عند التمكين، يتم تجميع قيم الاستعلام المختلفة معًا. قم بتعطيله لتحرير مطابقة الحقول المطلوبة.',
    'query.matchingTitle': 'الاستعلام المستخدم للمطابقة',
    'query.ignoredTitle': 'تم تجاهل الاستعلام للمطابقة',
    'query.deleteAria': 'إزالة من استعلام المطابقة',
    'body.deleteAria': 'إزالة من نص طلب المطابقة',
    'remote.ruleEnabledAria': 'تمكين القاعدة',
    'actions.edit': 'يحرر',
    'remote.summaryAria': 'ملخص من سطر واحد',
    'remote.defaultDslMissing': 'مفتقد',
    'remote.defaultDslEmpty': 'فارغ',
    'actions.invalidJson': 'تنسيق JSON غير صالح',
    'actions.formatted': 'منسق',
    'ai.statusQueued': 'في قائمة الانتظار',
    'ai.statusGenerating': 'توليد',
    'ai.statusGenerated': 'تم إنشاؤها',
    'ai.statusStopped': 'توقف',
    'ai.statusFailed': 'فشل الجيل',
    'ai.copied': 'منقول',
    'ai.copyFailed': 'فشل النسخ',
    'ai.promptRequired': 'أدخل مطالبة لإنشاء قاعدة الذكاء الاصطناعي.',
    'ai.queuedDots': 'في قائمة الانتظار...',
    'ai.submitJob': 'إرسال وظيفة إنشاء الذكاء الاصطناعي...',
    'ai.generatingDots': 'جارٍ الإنشاء...',
    'ai.queued': 'في قائمة الانتظار',
    'ai.failedSentence': 'فشل الجيل.',
    'ai.existingJob': 'مهمة إنشاء الذكاء الاصطناعي قيد التشغيل بالفعل.',
    'ai.enqueuedJob': 'تمت إضافته إلى قائمة انتظار إنشاء الذكاء الاصطناعي.',
    'remote.previewFailed': 'فشلت المعاينة.',
    'remote.incomplete': 'إعادة كتابة القاعدة غير مكتملة.',
    'remote.pathNoSpace': 'لا يمكن أن يحتوي مسار المفتاح على مسافات.',
    'remote.valueEncodeError': 'تحتوي القيمة على أحرف لا يمكن ترميزها.',
    'actions.repeatFailed': 'فشل التكرار.',
    'actions.done': 'منتهي',
    'capture.loadingDetail': 'جارٍ تحميل تفاصيل الطلب...',
    'capture.retryLater': 'انقر مرة أخرى في وقت لاحق.',
    'capture.detailLoadFailed': 'فشل تحميل تفاصيل الطلب.',
    'capture.hitLocal': 'مطابقة وهمية المحلية',
    'capture.hitRemote': 'قاعدة إعادة الكتابة المتطابقة',
    'capture.proxyFailed': 'فشل طلب الوكيل',
    'capture.reason': 'السبب: {message}',
    'capture.type': 'النوع: {type}',
    'capture.requestTime': 'طلب الوقت {time}',
    'capture.detailTimeout': 'تفاصيل الطلب انتهت مهلة. حاول مرة أخرى لاحقًا.',
    'preview.request': 'طلب معاينة',
    'preview.localEdit': 'محرر وهمية المحلية',
    'preview.remoteEdit': 'إعادة كتابة محرر القواعد',
    'preview.globalRemote': 'قاعدة إعادة الكتابة العالمية',
    'tabs.query': 'استفسار',
    'tabs.modifyRules': 'قواعد',
    'local.updateTip': 'قم بتحديث النموذج المحلي الحالي بالطلب والاستجابة الحاليين.',
    'remote.updateTip': 'قم بتحديث بيانات الطلب لقاعدة إعادة الكتابة الحالية دون استبدال القواعد التي تم تحريرها.',
    'note.ruleTip': 'قم بإضافة أو تحرير ملاحظة من سطر واحد لهذه القاعدة. الملاحظات الفارغة مخفية في القائمة.',
    'note.apiTip': 'أضف أو قم بتحرير ملاحظة لواجهة برمجة التطبيقات هذه. الملاحظات الفارغة مخفية في القائمة.',
    'diff.before': 'قبل',
    'diff.after': 'بعد',
    'diff.prev': 'الفرق السابقة',
    'diff.next': 'الفرق التالي',
    'diff.current': 'انتقل إلى الفرق الحالي',
    'diff.copyAll': 'انسخ كل نص {title}',
    'diff.copyFailed': 'فشل النسخ',
    'diff.omittedLines': '... تم حذف خطوط {count} التي لم تتغير ...',
    'diff.truncated': '... المحتوى طويل جدًا، وأحرف {count} مبتورة ...',
    'diff.viewFull': 'عرض المحتوى الكامل لهذا الجانب',
    'diff.back': '← العودة إلى الفرق',
    'diff.fullTitle': '{title} · معاينة كاملة',
    'rule.global': 'القاعدة العالمية',
    'rule.matchSummary': 'المباراة: {text}',
    'query.none': 'لا توجد معلمات الاستعلام',
    'capture.requestDetail': 'تفاصيل الطلب',
    'aiGuide.myRequest': 'طلبي:',
    'aiGuide.outputOnly': 'قم بإخراج نص Python الكامل فقط. لا تستخدم Markdown أو أسوار التعليمات البرمجية أو النص التوضيحي.',
    'aiGuide.commentSafe': 'يجب أن تلخص التعليقات المنطق فقط. لا تقم بتضمين أجسام الطلب الكاملة، أو أجسام الاستجابة، أو base64، أو البيانات الحساسة.',
    'aiGuide.comment': 'في الجزء العلوي من البرنامج النصي، بدءًا من السطر الأول، اكتب تعليقات بايثون مفصلة تصف ما يفعله البرنامج النصي، والمراحل التي يؤثر فيها، وما هي الحقول التي يطابقها أو يغيرها، وما إذا كانت الطلبات غير المتطابقة تمر عبرها.',
    'aiGuide.stdlib': 'استخدم فقط مكتبة بايثون القياسية. لا تقم بالوصول إلى الشبكة أو قراءة/كتابة الملفات المحلية أو طباعة نص توضيحي.',
    'aiGuide.noSensitive': 'لا تضع نصوص الطلب الكاملة أو نصوص الاستجابة أو محتوى base64 أو ctx في الاستثناءات أو التأكيدات أو إخراج الطباعة أو الملخص أو الأخطاء التي تم إرجاعها.',
    'aiGuide.dropBase64': 'إذا قمت بتغيير سلسلة نصية، فاحذف bodyBase64 من الكائن المقابل حتى لا تتمكن قيمة base64 القديمة من تجاوز تغيير النص الخاص بك.',
    'aiGuide.base64': 'bodyBase64 مخصص للمحتوى الثنائي فقط. ما لم تكن المعالجة الثنائية مطلوبة، فلا تقرأ أو تحلل أو تعيد كتابة bodyBase64.',
    'aiGuide.parseBody': 'عند تغيير نص JSON أو نص مشفر بعنوان URL، يفضل التحليل والتحرير ctx[\"request\"][\"body\"] أو ctx[\"response\"][\"body\"].',
    'aiGuide.returnCtx': 'قم بتعديل ctx مباشرة وإرجاع ctx. إذا كانت المرحلة لا تحتاج إلى تغييرات، قم بإرجاع ctx دون تغيير.',
    'aiGuide.crossIntent': 'قد تصف نية المستخدم المنطق عبر المراحل مثل \"عند نص الطلب xxx، أو تغيير نص الاستجابة xxx\" أو \"عند معلمة الاستعلام xxx، أو تغيير رأس الاستجابة xxx\". اقرأ شروط ctx[\"request\"] في المرحلة ذات الصلة وقم بتعديل ctx[\"response\"] أو الحقول المستهدفة المطلوبة.',
    'aiGuide.crossContext': 'قد يستخدم البرنامج النصي سياق الطلب والاستجابة الكامل من نفس المعاملة. على سبيل المثال، عندما يطابق نوع نص الطلب = ترحيب، أو علامة تبويب الاستعلام = الصفحة الرئيسية، أو يتطابق رأس الطلب مع قيمة، قم بتعديل نص الاستجابة أو رؤوس الاستجابة أو نص الطلب.',
    'aiGuide.response': 'يحتوي ctx[\"response\"] على رمز الحالة ورسالة الحالة والرؤوس والنص وbodyBase64 ونوع المحتوى.',
    'aiGuide.request': 'يحتوي ctx[\"request\"] على الطريقة وعنوان url والرؤوس والاستعلام والمسار والنص وbodyBase64 وcontentType.',
    'aiGuide.stage': 'ctx[\"stage\"] هو أحد request_head أو request_body أو Response_head أو Response_body.',
    'aiGuide.ctxCall': 'يتم تشغيل البرنامج النصي أثناء إنشاء الوكيل ويتلقى قاموس ctx. يمكنك تحديد المقبض (ctx)، أو تحديد on_request_head(ctx)، وon_request_body(ctx)، وon_response_head(ctx)، وon_response_body(ctx).',
    'aiGuide.ruleSample': 'تتضمن هذه القاعدة عادةً نموذج طلب واحد. يمكنك استخدام الحقول النموذجية كمرجع، ولكن لا يزال عليك التحقق من وجود الحقول في وقت التشغيل.',
    'aiGuide.globalSample': 'لا يوجد نموذج طلب أو استجابة ثابت. لا تفترض وجود أي مسار أو استعلام أو نص طلب أو نص استجابة. في البرنامج النصي، تحقق بأمان من حقول ctx في وقت التشغيل مثل الطريقة والمسار والاستعلام والرؤوس والنص قبل تغيير أي شيء.',
    'aiGuide.ruleIntro': 'أنت تقوم بإنشاء قاعدة إعادة كتابة لـ HttpMocker. يجب أن تكون القاعدة عبارة عن برنامج نصي بلغة Python.',
    'aiGuide.globalIntro': 'أنت تقوم بإنشاء قاعدة إعادة كتابة عامة لـ HttpMocker. ينطبق هذا فقط على المضيف {host}، ويمكن تشغيله لكل طلب على هذا المضيف. يجب أن تكون القاعدة عبارة عن برنامج نصي بلغة Python.',
    'aiGuide.title': 'المطالبة بالنسخ إلى AI خارجي',
    'aiGuide.missingHost': '[أدخل المضيف أولاً]',
    'aiGuide.empty': '[فارغ]',
    'capture.loading': 'جارٍ التحميل...',
    'local.action': 'حفظ محليًا',
    'remote.action': 'إعادة كتابة',
  },
  ja: {
    'startup.title': 'HttpMocker パネルを準備中',
    'startup.subtitle': 'リクエスト、ルール、設定を読み込み中...',
    'startup.errorTitle': 'パネルの初期化に失敗しました',
    'startup.errorMessage': '初期化に失敗しました。ページを再読み込みしてください。',
    'project.guide': 'プロジェクトフォルダを選択',
    'project.noDomain': 'すべてのドメイン',
    'project.selectDirectory': 'プロジェクトフォルダを選択',
    'project.clearDirectory': 'プロジェクト連携を解除',
    'project.linkedDirectory': '連携済みプロジェクト：{path}\nクリックして連携を解除します。',
    'project.needDirectory': 'AI がこのドメインのローカルプロジェクトを参照します。クリックしてフォルダを選択してください。',
    'project.pickDirectoryTip': 'このリクエストグループに対応するローカルプロジェクトを選択します。',
    'project.selectPathFailed': 'プロジェクトパスの選択に失敗しました。',
    'project.domainTabs': 'Project ドメイン',
    'project.dialog.historyTitle': 'ドメイン履歴',
    'project.dialog.selectTitle': 'ドメインを選択',
    'project.dialog.addTitle': 'ドメインを追加',
    'project.dialog.initialHistory': '履歴から開くドメインを選択してください。',
    'project.dialog.initial': '最初に project ドメインを選択してください。指定しない場合は全リクエストとルールを表示します。',
    'project.dialog.history': '現在の project として履歴ドメインを選択します。',
    'project.dialog.add': 'project ドメインを追加します。',
    'project.dialog.noHistoryInitial': 'ドメイン履歴がありません。File メニューから追加してから開き直してください。',
    'project.dialog.noHistory': 'ドメイン履歴はありません。',
    'nav.captures': '最近のリクエスト',
    'nav.local': 'ローカルモック',
    'nav.remote': 'リライトルール',
    'nav.mainTools': 'メインナビゲーションとツール',
    'nav.requestsAndRules': 'リクエストとルール',
    'layout.resizer': 'リストとプレビューの幅を調整',
    'globalSearch.title': 'グローバル検索',
    'globalSearch.tip': '現在のプロジェクト内のクエリ、リクエストヘッダー、リクエスト本文、レスポンス本文を検索します。ショートカット：Cmd+Shift+F',
    'globalSearch.placeholder': 'クエリ、ヘッダー、リクエスト本文、レスポンス本文を検索',
    'globalSearch.currentProject': '現在のプロジェクト：{domain}',
    'globalSearch.allDomains': '現在のプロジェクト：すべてのドメイン',
    'globalSearch.loading': '検索中...',
    'globalSearch.start': 'キーワードを入力して検索します。',
    'globalSearch.noResults': '一致する結果はありません。',
    'globalSearch.failed': '検索に失敗しました。',
    'globalSearch.unknownHost': '不明なホスト',
    'update.available': '新しいバージョン {version} があります',
    'update.openRelease': '更新を入手',
    'update.availableTitle': '更新があります',
    'update.dialogAvailable': 'バージョン {version} をダウンロードできます。',
    'update.noUpdateTitle': '最新バージョンです',
    'update.noUpdate': 'すでに最新バージョンです。',
    'update.checkFailedTitle': '更新確認に失敗しました',
    'update.checkFailed': '更新を確認できませんでした。後でもう一度お試しください。',
    'clear.history': '履歴をクリア',
    'clear.menuTip': 'クリアする最近のリクエスト履歴を選択します。',
    'clear.older': '古い履歴をクリア',
    'clear.allHistory': 'すべての履歴をクリア',
    'clear.notes': 'メモをクリア',
    'clear.rules': 'ルールをクリア',
    'clear.confirmAllCaptures': '最近のリクエスト履歴をすべてクリアしますか？\n\n現在のリクエスト一覧と古い履歴は削除されますが、メモとルールは残ります。',
    'clear.confirmOlderCaptures': '古い履歴をクリアしますか？\n\n各リクエストを展開したときに表示される古い時刻を削除し、現在のマージ設定で各グループの最新リクエストだけを残します。最近のリクエスト、メモ、ルールは残ります。',
    'clear.confirmNotes': 'すべてのメモと詳細説明をクリアしますか？\n\n手動メモ、AI 生成メモ、詳細説明を削除します。リクエスト履歴とルールは残ります。',
    'clear.confirmRules': 'すべてのルールをクリアしますか？\n\nローカルモックとリライトルール、および対応するキャッシュを削除します。リクエスト履歴とメモは残ります。',
    'capture.viewToggle': '最近のリクエスト表示を切り替え',
    'capture.viewTreeTip': 'ツリー表示です。クリックするとリスト表示に切り替わります。',
    'capture.viewListTip': 'リスト表示です。クリックするとツリー表示に切り替わります。',
    'capture.filterPlaceholder': 'API パスまたはメモで絞り込み',
    'capture.listAria': '最近のリクエスト一覧',
    'capture.mergeByQuery': 'クエリ別にグループ化',
    'capture.mergeByBody': 'リクエスト本文別にグループ化',
    'capture.originalBody': '元のリクエスト本文',
    'capture.empty': 'まだリクエストがありません。ブラウザまたはアプリのプロキシをこのマシンに設定し、対象ページを再読み込みしてください。',
    'capture.noMatch': '一致するリクエストはありません。',
    'capture.historyAria': 'リクエスト履歴の時刻',
    'capture.olderToggle': '以前の履歴 · クリックして{action}',
    'capture.expand': '展開',
    'capture.collapse': '折りたたみ',
    'capture.unknownHost': '不明なホスト',
    'local.listAria': 'ローカルモック一覧',
    'local.actionTip': '現在のレスポンスをローカルモックとして保存します。一致したリクエストにはこのローカル内容を直接返します。',
    'local.empty': 'ローカルモックはまだありません。最近のリクエストから作成してください。',
    'rule.hitCaptures': '命中したリクエスト',
    'remote.listAria': 'リライトルール一覧',
    'remote.actionTip': 'プロキシ転送中にクエリ、ヘッダー、リクエスト本文、レスポンス本文を変更するルールを作成します。',
    'remote.globalEnabled': 'グローバルルールを有効化',
    'remote.globalRules': 'グローバルルール',
    'remote.addGlobalRule': 'グローバルルールを追加',
    'remote.addRule': 'リライトルールを追加',
    'remote.addRuleTip': 'リライトルールを 1 件追加します。',
    'remote.aiRule': 'AI スクリプトルール',
    'remote.manualRule': '手動ルール',
    'remote.back': 'ルール一覧に戻る',
    'remote.backTip': 'ルール一覧に戻ります。',
    'remote.summaryPlaceholder': 'ルールの一行説明',
    'remote.aiSummaryPlaceholder': 'AI ルールの一行説明（表示用）',
    'remote.aiSummaryTip': 'ルール一覧と詳細表示だけに使われ、AI 生成の根拠には使われません。',
    'remote.chooseAction': '操作を選択',
    'remote.help': 'ルール記法を見る',
    'remote.helpTip': 'リライトルール記法の例を表示します。',
    'remote.path': 'パス',
    'remote.helpActions': 'クエリ、リクエストヘッダー、リクエスト本文、レスポンスヘッダー、レスポンス本文を変更できます。',
    'remote.valuePlaceholder': '空なら削除 / 123 / true / "string"',
    'remote.emptyDeletes': '空のまま保存すると対象ノードを削除します',
    'remote.aiPromptPlaceholder': 'リクエスト/レスポンスをまたぐ条件と変更内容を記述します。例：リクエスト本文 type=welcome のとき、レスポンス本文 reward_list を先頭 1 件だけ残し、coins を 100 にする。',
    'remote.aiGenerate': '生成',
    'remote.copyPrompt': 'プロンプトをコピー',
    'remote.copyPromptTip': '左側のプロンプトをコピーし、外部 AI に渡してスクリプトを生成します。',
    'remote.aiScriptPlaceholder': 'AI が生成した Python スクリプト。手動編集もできます。',
    'remote.example': '例',
    'remote.exampleTabsAria': 'リライトルール例',
    'remote.compatExample': '例（互換）',
    'remote.afterQuery': '変更後のクエリ',
    'remote.afterRequestHead': '変更後のリクエストヘッダー',
    'remote.afterResponseHead': '変更後のレスポンスヘッダー',
    'remote.afterRequestBody': '変更後のリクエスト本文',
    'remote.afterResponseBody': '変更後のレスポンス本文',
    'remote.action.query': 'クエリを変更',
    'remote.action.requestHead': 'リクエストヘッダーを変更',
    'remote.action.requestBody': 'リクエスト本文を変更',
    'remote.action.responseHead': 'レスポンスヘッダーを変更',
    'remote.action.responseBody': 'レスポンス本文を変更',
    'remote.action.placeholder': '操作を選択',
    'remote.emptySteps': 'リライトルールはありません',
    'remote.dragSort': 'ドラッグして並べ替え',
    'remote.editAiRule': 'この AI ルールを編集します。',
    'remote.editManualRule': 'この手動ルールを編集します。',
    'remote.deleteAiRule': 'この AI ルールを削除します。',
    'remote.deleteManualRule': 'このリライトルールを削除します。',
    'remote.aiDefaultSummary': 'AI スクリプトルール',
    'remote.manualDefaultSummary': '手動ルール',
    'remote.previewError': 'ルールエラー',
    'remote.diffBefore': '元',
    'remote.diffAfter': '変更後',
    'preview.title': 'プレビュー',
    'preview.emptyTitle': 'リクエストまたはローカルモックを選択してプレビュー',
    'preview.searchPlaceholder': '現在のプレビューを検索',
    'preview.tabsAria': 'リクエスト本文とレスポンス本文',
    'query.params': 'クエリパラメータ',
    'tabs.overview': '概要',
    'overview.request': 'リクエスト',
    'overview.response': 'レスポンス',
    'overview.connection': '接続',
    'overview.timing': 'タイミング',
    'overview.size': 'サイズ',
    'overview.url': 'URL',
    'overview.method': 'メソッド',
    'overview.protocol': 'プロトコル',
    'overview.path': 'パス',
    'overview.query': 'クエリ',
    'overview.contentType': 'Content-Type',
    'overview.bodySize': '本文サイズ',
    'overview.status': 'ステータス',
    'overview.loading': '読み込み中',
    'overview.failed': '失敗',
    'overview.complete': '完了',
    'overview.error': 'エラー',
    'overview.responseCode': 'レスポンスコード',
    'overview.responseMessage': 'レスポンスメッセージ',
    'overview.mapping': 'マッピング',
    'overview.clientAddress': 'クライアントアドレス',
    'overview.remoteAddress': 'リモートアドレス',
    'overview.keptAlive': 'Keep Alive',
    'overview.ssl': 'SSL',
    'overview.yes': 'はい',
    'overview.no': 'いいえ',
    'overview.advanced': '詳細',
    'overview.clientConnection': 'クライアント接続',
    'overview.serverConnection': 'サーバー接続',
    'overview.streamId': 'Stream ID',
    'overview.clientSettings': 'クライアント設定',
    'overview.serverSettings': 'サーバー設定',
    'overview.requestStartTime': 'リクエスト開始時刻',
    'overview.requestEndTime': 'リクエスト終了時刻',
    'overview.responseStartTime': 'レスポンス開始時刻',
    'overview.responseEndTime': 'レスポンス終了時刻',
    'overview.duration': '所要時間',
    'overview.dns': 'DNS',
    'overview.connect': '接続',
    'overview.tlsHandshake': 'TLS ハンドシェイク',
    'overview.latency': 'レイテンシ',
    'overview.speed': '速度',
    'overview.requestSpeed': 'リクエスト速度',
    'overview.responseSpeed': 'レスポンス速度',
    'overview.header': 'ヘッダー',
    'overview.queryString': 'クエリ文字列',
    'overview.cookies': 'Cookie',
    'overview.body': '本文',
    'overview.uncompressedBody': '未圧縮本文',
    'overview.compression': '圧縮',
    'overview.total': '合計',
    'tabs.matchQuery': 'マッチ用クエリ',
    'tabs.requestHead': 'リクエストヘッダー',
    'tabs.requestBody': 'リクエスト本文',
    'tabs.matchBody': 'マッチ用リクエスト本文',
    'tabs.responseHead': 'レスポンスヘッダー',
    'tabs.responseBody': 'レスポンス本文',
    'actions.copyCurl': 'curl をコピー',
    'actions.copyCurlTip': '現在のリクエストの完全な curl をコピーします。URL、ヘッダー、本文を含みます。',
    'actions.repeat': 'Repeat',
    'actions.repeatTip': '現在のリクエストをプロキシ経由で再送します。結果は最近のリクエストに追加されます。',
    'actions.delete': '削除',
    'actions.deleteRuleTip': '選択中のローカルモックまたはリライトルールを削除します。',
    'actions.format': '整形',
    'actions.formatTip': '現在の JSON 内容を整形します。',
    'actions.manualSaveTip': 'このマッチ範囲は他のルールと重なるため、手動確認が必要です。',
    'actions.prev': '前へ',
    'actions.next': '次へ',
    'actions.close': '閉じる',
    'actions.cancel': 'キャンセル',
    'actions.failed': '操作に失敗しました。',
    'actions.open': '開く',
    'actions.add': '追加',
    'actions.search': '検索',
    'actions.clear': 'クリア',
    'actions.save': '保存',
    'actions.saveFailed': '保存に失敗しました。',
    'actions.stop': '停止',
    'actions.start': '開始',
    'actions.stopping': '停止中',
    'actions.starting': '開始中',
    'common.domain': 'ドメイン',
    'common.enabled': '有効',
    'common.action': '操作',
    'common.value': '値',
    'common.idle': '待機中',
    'common.running': '実行中',
    'common.queued': 'キュー中',
    'status.localIp': 'ローカル IP',
    'status.proxyPort': 'プロキシポート',
    'status.proxyStopped': 'プロキシ停止中',
    'status.recording': '記録中',
    'status.passThrough': 'パススルーのみ',
    'status.stopRecording': '記録を停止',
    'status.startRecording': '記録を開始',
    'status.stopRecordingTip': 'プロキシは維持し、すべてのリクエストを記録せずルールも適用せずに通します。',
    'status.startRecordingTip': 'プロキシ経由のリクエストを記録し、処理を開始します。',
    'status.toggleFailed': '記録状態の切り替えに失敗しました。',
    'adb.refreshDevices': 'Android デバイス一覧を更新します。',
    'adb.chooseDevice': 'Android デバイスを選択',
    'adb.chooseProxy': 'Android デバイスを選択してプロキシを設定または解除します。',
    'adb.setProxy': '端末プロキシを設定',
    'adb.clearProxy': '端末プロキシを解除',
    'adb.setProxyFor': '端末プロキシを設定：{device}',
    'adb.clearProxyFor': '端末プロキシを解除：{device}',
    'adb.clearProxyTip': '端末のプロキシ設定を解除します。',
    'adb.setProxyTip': '端末のプロキシをこのマシンに設定します。',
    'adb.currentProxy': '現在のプロキシ：{proxy}',
    'adb.noProxy': 'プロキシ未設定',
    'adb.guide': 'クリックして端末プロキシを設定',
    'adb.failed': 'adb 操作に失敗しました。',
    'adb.pathHint': 'adb がインストールされ、PATH から利用できることを確認してください。',
    'ai.none': 'AI を使わない',
    'ai.switchTip': 'AI プロバイダーを切り替えます。現在：{provider}',
    'ai.disabledRuleTip': 'AI が無効なため、AI ルールを追加できません。',
    'ai.addRuleTip': 'AI Python スクリプトルールを追加します。',
    'ai.ask': 'AI に質問',
    'ai.askTip': '新しいターミナルを開き、このリクエスト、プロジェクトディレクトリ、コンテキストを選択中の AI に渡します。',
    'ai.askNoProject': '先にローカルプロジェクトディレクトリを関連付けてください。',
    'ai.askFailed': 'AI ターミナルを開けませんでした。',
    'ai.statusTitle': 'AI 作業状態',
    'ai.scriptGeneration': 'AI スクリプト生成',
    'ai.noteAnalysis': 'メモ分析',
    'ai.detailAnalysis': '詳細説明',
    'ai.provider': 'プロバイダー',
    'ai.autoNotes': 'メモ自動分析',
    'ai.totalQueue': '全体キュー',
    'ai.running': '実行',
    'ai.pending': '待機',
    'ai.failed': '失敗',
    'ai.completed': '完了',
    'ai.current': '現在',
    'ai.lastFailure': '直近の失敗',
    'ai.runPending': '実行 / 待機',
    'ai.completedFailed': '完了 / 失敗',
    'ai.runningState': '実行中',
    'ai.stoppedState': '停止中',
    'ai.failedShort': 'Codex 失敗 {count}',
    'ai.generationQueue': 'AI生成 {running}/{total}{pendingText}',
    'ai.pendingSuffix': ' · 待機 {pending}',
    'ai.noteQueue': 'メモ分析 {state} {running}/{total}',
    'ai.detailQueue': '詳細説明 {state} {running}/{total}',
    'ai.disabledWorkTip': 'AI が無効なため開始できません。',
    'ai.stopWorkTip': 'AI 作業を停止し、待機中のジョブをクリアして実行中の AI ルール生成を中断します。',
    'ai.startWorkTip': 'メモ自動分析を開始し、未生成の API を再スキャンします。',
    'ai.toggleFailed': 'AI 作業状態の切り替えに失敗しました。',
    'note.short': 'メモ',
    'note.actionTip': 'この API の手動メモを追加または編集します。',
    'note.title': 'API メモ',
    'note.placeholder': 'この API は何をするものですか？',
    'note.detail': '詳細説明',
    'note.detailTitle': 'API 詳細説明',
    'note.detailTip': 'この API のパラメータ、フィールド、コード根拠の説明を生成または表示します。',
    'note.detailGenerating': '詳細説明を生成中です。',
    'note.detailFailed': '詳細説明の生成に失敗しました。',
    'note.detailFailedTitle': '詳細説明の生成に失敗しました',
    'note.detailFailedReason': '理由：{message}',
    'note.detailFailedAt': '失敗時刻：{time}',
    'note.detailStillGenerating': '詳細説明はまだ生成中です。しばらくしてから開いてください。',
    'note.detailQueue': '詳細説明を生成中、キュー {running}/{total}。',
    'note.emptyDetail': '詳細説明はまだありません。',
    'note.generateDetail': '詳細説明を生成',
    'note.detailFailureButton': '詳細説明失敗',
    'note.generating': '生成中',
    'note.viewDetailTip': '生成済みのパラメータ、フィールド、コード根拠の説明を表示します。',
    'note.viewFailureTip': '詳細説明が失敗した理由を表示します。',
    'note.generatingTip': '詳細説明を生成中です。クリックして AI 作業状態を表示します。',
    'note.generateTip': 'この API のパラメータ、フィールド、コード根拠の説明を生成します。',
    'note.regenerate': '再生成',
    'note.generate': '生成',
    'settings.title': '設定',
    'settings.language': '言語',
    'settings.appearance': '外観',
    'appearance.system': 'システムに合わせる',
    'appearance.light': 'ライト',
    'appearance.dark': 'ダーク',
    'settings.treeView': 'ツリー表示',
    'settings.mergeRequests': 'リクエストをマージ',
    'settings.showListNotes': '一覧にメモを表示',
    'settings.aiAutoNotes': 'AIでメモを自動生成',
    'settings.maxHistory': '履歴の最大件数',
    'cert.download': '証明書をダウンロード',
    'tree.expand': "展開",
    'tree.collapse': "折りたたみ",
    'tree.actions': "ツリー表示操作",
    'tree.expandAll': "すべて展開",
    'tree.collapseAll': "すべて折りたたみ",
    'context.updateLocal': "ローカルモックを更新",
    'context.createLocal': "ローカルモックとして設定",
    'context.updateRemote': "リライトルールを更新",
    'context.createRemote': "リライトルールに設定",
    'context.addAsDomain': "project ドメインに追加",
    'context.openDomain': "ドメインを開く",
    'merge.querySourceError': "マッチ用クエリでは現在のリクエストからパラメータを削除する操作だけ自動保存できます。追加、キー名変更、値変更は手動保存が必要です。",
    'merge.bodySourceError': "マッチ用リクエスト本文では現在のリクエストからフィールドを削除する操作だけ自動保存できます。追加、名前変更、値変更、構造変更は手動保存が必要です。",
    'merge.sourceError': "マッチテンプレートは現在のリクエストを狭める変更だけ自動保存できます。その他の変更は手動保存が必要です。",
    'merge.conflictAutoSave': "このマッチ範囲は同じ API の別の集約設定を含むため自動保存できません。マッチ用クエリまたはリクエスト本文を調整するか、保存を押して再検証してください。",
    'merge.manualSaveDefault': "このマッチ範囲は他のルールと重なっています。手動保存して再検証してください。",
    'merge.conflictSave': "ルールのマッチ範囲が他のルールと重なるため保存できません。",
    'merge.conflictWithRule': "このマッチ範囲は「{target}」と重なるため自動保存できません。マッチ用クエリまたはリクエスト本文を調整するか、保存を押して再検証してください。",
    'merge.otherRule': "他のルール",
    'query.ignoreTip': "空ならクエリを無視します。a=1&b=2 と入力すると、それらのフィールドが必須になります。",
    'query.templateTip': "オフにすると、ここにある必須フィールドで照合します。空ならクエリを無視します。実際のリクエストに追加フィールドがあっても、順序が違っても一致します。",
    'query.mergeTip': "オンにすると、クエリが違っても同じグループにまとめます。オフにすると必須フィールドテンプレートを編集できます。",
    'query.matchingTitle': "マッチに使うクエリ",
    'query.ignoredTitle': "マッチに使わないクエリ",
    'query.deleteAria': "マッチ用クエリから削除",
    'body.deleteAria': "マッチ用リクエスト本文から削除",
    'remote.ruleEnabledAria': "ルールを有効化",
    'actions.edit': "編集",
    'remote.summaryAria': "一行説明",
    'remote.defaultDslMissing': "未入力",
    'remote.defaultDslEmpty': "空",
    'actions.invalidJson': "不正な JSON",
    'actions.formatted': "整形済み",
    'ai.statusQueued': "キュー中",
    'ai.statusGenerating': "生成中",
    'ai.statusGenerated': "生成済み",
    'ai.statusStopped': "停止済み",
    'ai.statusFailed': "生成失敗",
    'ai.copied': "コピー済み",
    'ai.copyFailed': "コピー失敗",
    'ai.promptRequired': "AI ルール生成用のプロンプトを入力してください。",
    'ai.queuedDots': "キュー中...",
    'ai.submitJob': "AI 生成ジョブを送信中...",
    'ai.generatingDots': "生成中...",
    'ai.queued': "キュー済み",
    'ai.failedSentence': "生成に失敗しました。",
    'ai.existingJob': "AI 生成ジョブがすでに実行中です。",
    'ai.enqueuedJob': "AI 生成キューに追加しました。",
    'remote.previewFailed': "プレビューに失敗しました。",
    'remote.incomplete': "リライトルールが未完成です。",
    'remote.pathNoSpace': "キーパスに空白は使えません。",
    'remote.valueEncodeError': "値にエンコードできない文字が含まれています。",
    'actions.repeatFailed': "Repeat に失敗しました。",
    'actions.done': "完了",
    'capture.loadingDetail': "リクエスト詳細を読み込み中...",
    'capture.retryLater': "しばらくしてからもう一度クリックしてください。",
    'capture.detailLoadFailed': "リクエスト詳細の読み込みに失敗しました。",
    'capture.hitLocal': "ローカルモックに一致",
    'capture.hitRemote': "リライトルールに一致",
    'capture.proxyFailed': "プロキシリクエスト失敗",
    'capture.reason': "理由：{message}",
    'capture.type': "種類：{type}",
    'capture.requestTime': "リクエスト時刻 {time}",
    'capture.detailTimeout': "リクエスト詳細の読み込みがタイムアウトしました。後で再試行してください。",
    'preview.request': "リクエストプレビュー",
    'preview.localEdit': "ローカルモック編集",
    'preview.remoteEdit': "リライトルール編集",
    'preview.globalRemote': "グローバルリライトルール",
    'tabs.query': "クエリ",
    'tabs.modifyRules': "ルール",
    'local.updateTip': "現在のリクエストとレスポンスで既存のローカルモックを更新します。",
    'remote.updateTip': "編集済みルールを上書きせず、既存リライトルールのリクエスト情報を更新します。",
    'note.ruleTip': "このルールの一行メモを追加または編集します。空のメモは一覧に表示されません。",
    'note.apiTip': "この API のメモを追加または編集します。空のメモは一覧に表示されません。",
    'diff.before': "変更前",
    'diff.after': "変更後",
    'diff.prev': "前の差分",
    'diff.next': "次の差分",
    'diff.current': "現在の差分へ移動",
    'diff.copyAll': "{title} の全文をコピー",
    'diff.copyFailed': "コピー失敗",
    'diff.omittedLines': "... 未変更の {count} 行を省略 ...",
    'diff.truncated': "... 内容が長すぎるため {count} 文字を切り詰めました ...",
    'diff.viewFull': "この側の全文を表示",
    'diff.back': "← 差分に戻る",
    'diff.fullTitle': "{title} · 全文プレビュー",
    'rule.global': "グローバルルール",
    'rule.matchSummary': "マッチ：{text}",
    'query.none': "クエリパラメータなし",
    'capture.requestDetail': "リクエスト詳細",
    'aiGuide.myRequest': '私の要求：',
    'aiGuide.outputOnly': '完全な Python スクリプトのみ出力してください。Markdown、コードフェンス、説明文は不要です。',
    'aiGuide.commentSafe': 'コメントはロジックの要約に限定し、完全なリクエストボディ、レスポンスボディ、base64、機密データを含めないでください。',
    'aiGuide.comment': 'スクリプト先頭の 1 行目から詳細な Python コメントを書き、このスクリプトの目的、対象 stage、マッチまたは変更するフィールド、未マッチ時に透過するかを説明してください。',
    'aiGuide.stdlib': 'Python 標準ライブラリのみ使用してください。ネットワークアクセス、ローカルファイルの読み書き、説明文の print は禁止です。',
    'aiGuide.noSensitive': '完全なリクエストボディ、レスポンスボディ、base64、ctx 内容を例外、assert、print、summary、戻りエラーに含めないでください。',
    'aiGuide.dropBase64': 'body 文字列を変更した場合は、古い base64 が変更を上書きしないよう、対応するオブジェクトから bodyBase64 を削除してください。',
    'aiGuide.base64': 'bodyBase64 はバイナリ内容専用です。バイナリ処理が必要でない限り、bodyBase64 を読んだり解析したり書き換えたりしないでください。',
    'aiGuide.parseBody': 'JSON または URL encoded テキストを変更する場合は、ctx["request"]["body"] または ctx["response"]["body"] を優先的に解析して編集してください。',
    'aiGuide.returnCtx': 'ctx を直接変更して ctx を返してください。変更不要な stage ではそのまま ctx を返してください。',
    'aiGuide.crossIntent': 'ユーザー要求は「リクエストボディ xxx のときレスポンスボディ xxx」「query パラメータ xxx のときレスポンスヘッダー xxx」のような stage をまたぐ条件になる場合があります。該当 stage で ctx["request"] の条件を読み、ctx["response"] または対象フィールドを変更してください。',
    'aiGuide.crossContext': 'スクリプトは同一トランザクション内のリクエストとレスポンス全体を使って判断できます。例えば、リクエストボディ type=welcome、query tab=home、またはリクエストヘッダーが特定値に一致したときに、レスポンスボディ、レスポンスヘッダー、リクエストボディを変更できます。',
    'aiGuide.response': 'ctx["response"] には statusCode、statusMessage、headers、body、bodyBase64、contentType が含まれます。',
    'aiGuide.request': 'ctx["request"] には method、url、headers、query、path、body、bodyBase64、contentType が含まれます。',
    'aiGuide.stage': 'ctx["stage"] は request_head、request_body、response_head、response_body のいずれかです。',
    'aiGuide.ctxCall': 'スクリプトはプロキシ処理中に呼ばれ、入力は ctx 辞書です。handle(ctx) を定義しても、on_request_head(ctx)、on_request_body(ctx)、on_response_head(ctx)、on_response_body(ctx) を定義してもかまいません。',
    'aiGuide.ruleSample': 'このルールには通常 1 回分のリクエストサンプルがあります。サンプルのフィールドは参考にできますが、実行時には必ずフィールドの存在を確認してください。',
    'aiGuide.globalSample': '固定のリクエストサンプルやレスポンスサンプルはありません。path、query、リクエストボディ、レスポンスボディが必ず存在すると仮定しないでください。スクリプト内では runtime の ctx から method、path、query、headers、body を安全に確認してから変更してください。',
    'aiGuide.ruleIntro': 'HttpMocker のリライトルールを生成します。ルールは Python スクリプトである必要があります。',
    'aiGuide.globalIntro': 'HttpMocker のグローバルリライトルールを生成します。このルールはホスト {host} にのみ適用され、そのホスト配下のすべてのリクエストで実行される可能性があります。ルールは Python スクリプトである必要があります。',
    'aiGuide.title': '外部 AI にコピーするプロンプト',
    'aiGuide.missingHost': '[先にホストを入力]',
    'aiGuide.empty': '[空]',
  },
  ko: {
    'startup.title': 'HttpMocker 패널을 준비 중',
    'startup.subtitle': '요청, 규칙, 설정을 불러오는 중...',
    'startup.errorTitle': '패널 초기화 실패',
    'startup.errorMessage': '초기화에 실패했습니다. 페이지를 새로고침해 주세요.',
    'project.guide': '프로젝트 폴더 선택',
    'project.noDomain': '전체 도메인',
    'project.selectDirectory': '프로젝트 폴더 선택',
    'project.clearDirectory': '프로젝트 연결 해제',
    'project.linkedDirectory': '연결된 프로젝트: {path}\n클릭하면 프로젝트 연결을 해제합니다.',
    'project.needDirectory': 'AI가 이 도메인의 로컬 프로젝트를 알아야 합니다. 클릭해서 프로젝트 폴더를 선택하세요.',
    'project.pickDirectoryTip': '이 요청 그룹에 대응하는 로컬 프로젝트를 선택합니다.',
    'project.selectPathFailed': '프로젝트 경로 선택 실패.',
    'project.domainTabs': 'Project 도메인',
    'project.dialog.historyTitle': '도메인 기록',
    'project.dialog.selectTitle': '도메인 선택',
    'project.dialog.addTitle': '도메인 추가',
    'project.dialog.initialHistory': '기록에서 열 도메인을 선택하세요.',
    'project.dialog.initial': '먼저 project 도메인을 선택하세요. 지정하지 않으면 모든 요청과 규칙을 볼 수 있습니다.',
    'project.dialog.history': '기록 도메인을 현재 project 로 선택합니다.',
    'project.dialog.add': 'project 도메인을 추가합니다.',
    'project.dialog.noHistoryInitial': '도메인 기록이 없습니다. File 메뉴에서 도메인을 추가한 뒤 다시 열어 주세요.',
    'project.dialog.noHistory': '도메인 기록이 없습니다.',
    'nav.captures': '최근 요청',
    'nav.local': '로컬 목',
    'nav.remote': '리라이트 규칙',
    'nav.mainTools': '주요 내비게이션과 도구',
    'nav.requestsAndRules': '요청과 규칙',
    'layout.resizer': '목록과 미리보기 너비 조정',
    'globalSearch.title': '전체 검색',
    'globalSearch.tip': '현재 프로젝트의 쿼리, 요청 헤더, 요청 본문, 응답 본문을 검색합니다. 단축키: Cmd+Shift+F',
    'globalSearch.placeholder': '쿼리, 헤더, 요청 본문, 응답 본문 검색',
    'globalSearch.currentProject': '현재 프로젝트: {domain}',
    'globalSearch.allDomains': '현재 프로젝트: 전체 도메인',
    'globalSearch.loading': '검색 중...',
    'globalSearch.start': '키워드를 입력한 뒤 검색하세요.',
    'globalSearch.noResults': '일치하는 결과가 없습니다.',
    'globalSearch.failed': '검색 실패.',
    'globalSearch.unknownHost': '알 수 없는 호스트',
    'update.available': '새 버전 {version} 사용 가능',
    'update.openRelease': '업데이트 받기',
    'update.availableTitle': '업데이트 있음',
    'update.dialogAvailable': '버전 {version}을 다운로드할 수 있습니다.',
    'update.noUpdateTitle': '최신 버전입니다',
    'update.noUpdate': '이미 최신 버전입니다.',
    'update.checkFailedTitle': '업데이트 확인 실패',
    'update.checkFailed': '업데이트 확인에 실패했습니다. 나중에 다시 시도하세요.',
    'clear.history': '기록 지우기',
    'clear.menuTip': '지울 최근 요청 기록을 선택합니다.',
    'clear.older': '이전 기록 지우기',
    'clear.allHistory': '전체 기록 지우기',
    'clear.notes': '메모 지우기',
    'clear.rules': '규칙 지우기',
    'clear.confirmAllCaptures': '최근 요청 기록을 모두 지울까요?\n\n현재 요청 목록과 이전 기록은 삭제되지만 메모와 규칙은 유지됩니다.',
    'clear.confirmOlderCaptures': '이전 기록을 지울까요?\n\n각 요청을 펼쳤을 때 보이는 이전 시간 기록을 삭제하고, 현재 병합 설정 기준으로 그룹마다 최신 요청만 남깁니다. 최근 요청, 메모, 규칙은 유지됩니다.',
    'clear.confirmNotes': '모든 메모와 상세 설명을 지울까요?\n\n수동 메모, AI 자동 메모, 상세 설명을 삭제합니다. 요청 기록과 규칙은 유지됩니다.',
    'clear.confirmRules': '모든 규칙을 지울까요?\n\n전체 로컬 목과 리라이트 규칙, 관련 캐시를 삭제합니다. 요청 기록과 메모는 유지됩니다.',
    'capture.viewToggle': '최근 요청 보기 전환',
    'capture.viewTreeTip': '현재 트리 보기입니다. 클릭하면 목록 보기로 전환합니다.',
    'capture.viewListTip': '현재 목록 보기입니다. 클릭하면 트리 보기로 전환합니다.',
    'capture.filterPlaceholder': 'API 경로 또는 메모로 필터링',
    'capture.listAria': '최근 요청 목록',
    'capture.mergeByQuery': '쿼리별로 그룹화',
    'capture.mergeByBody': '요청 본문별로 그룹화',
    'capture.originalBody': '원본 요청 본문',
    'capture.empty': '아직 요청이 없습니다. 브라우저나 앱 프록시를 이 컴퓨터로 설정한 뒤 대상 페이지를 새로고침하세요.',
    'capture.noMatch': '일치하는 요청이 없습니다.',
    'capture.historyAria': '요청 기록 시간',
    'capture.olderToggle': '이전 기록 · 클릭하여 {action}',
    'capture.expand': '펼치기',
    'capture.collapse': '접기',
    'capture.unknownHost': '알 수 없는 호스트',
    'local.listAria': '로컬 목 목록',
    'local.actionTip': '현재 응답을 로컬 목으로 저장합니다. 일치하는 요청은 이 로컬 내용을 바로 반환합니다.',
    'local.empty': '아직 로컬 목이 없습니다. 최근 요청에서 하나를 만드세요.',
    'rule.hitCaptures': '매칭된 요청',
    'remote.listAria': '리라이트 규칙 목록',
    'remote.actionTip': '프록시 전달 중 쿼리, 헤더, 요청 본문, 응답 본문을 수정하는 규칙을 만듭니다.',
    'remote.globalEnabled': '전역 규칙 활성화',
    'remote.globalRules': '전역 규칙',
    'remote.addGlobalRule': '전역 규칙 추가',
    'remote.addRule': '리라이트 규칙 추가',
    'remote.addRuleTip': '리라이트 규칙을 하나 추가합니다.',
    'remote.aiRule': 'AI 스크립트 규칙',
    'remote.manualRule': '수동 규칙',
    'remote.back': '규칙 목록으로 돌아가기',
    'remote.backTip': '규칙 목록으로 돌아갑니다.',
    'remote.summaryPlaceholder': '규칙 한 줄 설명',
    'remote.aiSummaryPlaceholder': 'AI 규칙 한 줄 설명, 표시용',
    'remote.aiSummaryTip': '규칙 목록과 상세 표시용이며 AI 생성 근거로 사용되지 않습니다.',
    'remote.chooseAction': '작업 선택',
    'remote.help': '규칙 문법 보기',
    'remote.helpTip': '리라이트 규칙 문법 예시를 봅니다.',
    'remote.path': '경로',
    'remote.helpActions': '쿼리, 요청 헤더, 요청 본문, 응답 헤더, 응답 본문을 수정할 수 있습니다.',
    'remote.valuePlaceholder': '비우면 삭제 / 123 / true / "string"',
    'remote.emptyDeletes': '비워 두면 대상 노드를 삭제합니다',
    'remote.aiPromptPlaceholder': '요청/응답을 아우르는 조건과 수정 내용을 설명하세요. 예: 요청 본문 type=welcome 일 때 응답 본문 reward_list 첫 항목만 남기고 coins 를 100 으로 변경',
    'remote.aiGenerate': '생성',
    'remote.copyPrompt': '프롬프트 복사',
    'remote.copyPromptTip': '왼쪽 프롬프트를 복사해 외부 AI에 전달하여 스크립트를 생성합니다.',
    'remote.aiScriptPlaceholder': 'AI가 생성한 Python 스크립트입니다. 직접 수정할 수도 있습니다.',
    'remote.example': '예시',
    'remote.exampleTabsAria': '리라이트 규칙 예시',
    'remote.compatExample': '예시(호환)',
    'remote.afterQuery': '변경 후 쿼리',
    'remote.afterRequestHead': '변경 후 요청 헤더',
    'remote.afterResponseHead': '변경 후 응답 헤더',
    'remote.afterRequestBody': '변경 후 요청 본문',
    'remote.afterResponseBody': '변경 후 응답 본문',
    'remote.action.query': '쿼리 수정',
    'remote.action.requestHead': '요청 헤더 수정',
    'remote.action.requestBody': '요청 본문 수정',
    'remote.action.responseHead': '응답 헤더 수정',
    'remote.action.responseBody': '응답 본문 수정',
    'remote.action.placeholder': '작업 선택',
    'remote.emptySteps': '리라이트 규칙 없음',
    'remote.dragSort': '드래그하여 정렬',
    'remote.editAiRule': '이 AI 규칙을 편집합니다.',
    'remote.editManualRule': '이 수동 규칙을 편집합니다.',
    'remote.deleteAiRule': '이 AI 규칙을 삭제합니다.',
    'remote.deleteManualRule': '이 리라이트 규칙을 삭제합니다.',
    'remote.aiDefaultSummary': 'AI 스크립트 규칙',
    'remote.manualDefaultSummary': '수동 규칙',
    'remote.previewError': '규칙 오류',
    'remote.diffBefore': '원본',
    'remote.diffAfter': '변경 후',
    'preview.title': '미리보기',
    'preview.emptyTitle': '요청 또는 로컬 목을 선택해 미리보기',
    'preview.searchPlaceholder': '현재 미리보기 검색',
    'preview.tabsAria': '요청 및 응답 본문',
    'query.params': '쿼리 파라미터',
    'tabs.overview': '개요',
    'overview.request': '요청',
    'overview.response': '응답',
    'overview.connection': '연결',
    'overview.timing': '타이밍',
    'overview.size': '크기',
    'overview.url': 'URL',
    'overview.method': '메서드',
    'overview.protocol': '프로토콜',
    'overview.path': '경로',
    'overview.query': '쿼리',
    'overview.contentType': 'Content-Type',
    'overview.bodySize': '본문 크기',
    'overview.status': '상태',
    'overview.loading': '불러오는 중',
    'overview.failed': '실패',
    'overview.complete': '완료',
    'overview.error': '오류',
    'overview.responseCode': '응답 코드',
    'overview.responseMessage': '응답 메시지',
    'overview.mapping': '매핑',
    'overview.clientAddress': '클라이언트 주소',
    'overview.remoteAddress': '원격 주소',
    'overview.keptAlive': '연결 유지',
    'overview.ssl': 'SSL',
    'overview.yes': '예',
    'overview.no': '아니요',
    'overview.advanced': '고급',
    'overview.clientConnection': '클라이언트 연결',
    'overview.serverConnection': '서버 연결',
    'overview.streamId': 'Stream ID',
    'overview.clientSettings': '클라이언트 설정',
    'overview.serverSettings': '서버 설정',
    'overview.requestStartTime': '요청 시작 시간',
    'overview.requestEndTime': '요청 종료 시간',
    'overview.responseStartTime': '응답 시작 시간',
    'overview.responseEndTime': '응답 종료 시간',
    'overview.duration': '소요 시간',
    'overview.dns': 'DNS',
    'overview.connect': '연결',
    'overview.tlsHandshake': 'TLS 핸드셰이크',
    'overview.latency': '지연 시간',
    'overview.speed': '속도',
    'overview.requestSpeed': '요청 속도',
    'overview.responseSpeed': '응답 속도',
    'overview.header': '헤더',
    'overview.queryString': '쿼리 문자열',
    'overview.cookies': '쿠키',
    'overview.body': '본문',
    'overview.uncompressedBody': '압축 해제 본문',
    'overview.compression': '압축',
    'overview.total': '합계',
    'tabs.matchQuery': '매칭 쿼리',
    'tabs.requestHead': '요청 헤더',
    'tabs.requestBody': '요청 본문',
    'tabs.matchBody': '매칭 요청 본문',
    'tabs.responseHead': '응답 헤더',
    'tabs.responseBody': '응답 본문',
    'actions.copyCurl': 'curl 복사',
    'actions.copyCurlTip': '현재 요청의 전체 curl 을 복사합니다. URL, 헤더, 본문이 포함됩니다.',
    'actions.repeat': 'Repeat',
    'actions.repeatTip': '현재 요청을 프록시를 통해 다시 보냅니다. 결과는 최근 요청에 기록됩니다.',
    'actions.delete': '삭제',
    'actions.deleteRuleTip': '선택한 로컬 목 또는 리라이트 규칙을 삭제합니다.',
    'actions.format': '정리',
    'actions.formatTip': '현재 JSON 내용을 정리합니다.',
    'actions.manualSaveTip': '이 매칭 범위는 다른 규칙과 겹치므로 수동 확인 저장이 필요합니다.',
    'actions.prev': '이전',
    'actions.next': '다음',
    'actions.close': '닫기',
    'actions.cancel': '취소',
    'actions.failed': '작업 실패.',
    'actions.open': '열기',
    'actions.add': '추가',
    'actions.search': '검색',
    'actions.clear': '지우기',
    'actions.save': '저장',
    'actions.saveFailed': '저장 실패.',
    'actions.stop': '중지',
    'actions.start': '시작',
    'actions.stopping': '중지 중',
    'actions.starting': '시작 중',
    'common.domain': '도메인',
    'common.enabled': '활성화',
    'common.action': '작업',
    'common.value': '값',
    'common.idle': '대기',
    'common.running': '실행 중',
    'common.queued': '대기 중',
    'status.localIp': '로컬 IP',
    'status.proxyPort': '프록시 포트',
    'status.proxyStopped': '프록시 중지됨',
    'status.recording': '기록 중',
    'status.passThrough': '패스스루만',
    'status.stopRecording': '기록 중지',
    'status.startRecording': '기록 시작',
    'status.stopRecordingTip': '프록시는 유지하되 모든 요청을 기록하지 않고 규칙도 적용하지 않은 채 통과시킵니다.',
    'status.startRecordingTip': '프록시를 통과하는 요청 기록과 처리를 시작합니다.',
    'status.toggleFailed': '기록 상태 변경 실패.',
    'adb.refreshDevices': 'Android 기기 목록을 새로고침합니다.',
    'adb.chooseDevice': 'Android 기기 선택',
    'adb.chooseProxy': 'Android 기기를 선택해 프록시를 설정하거나 해제합니다.',
    'adb.setProxy': '휴대폰 프록시 설정',
    'adb.clearProxy': '휴대폰 프록시 해제',
    'adb.setProxyFor': '휴대폰 프록시 설정: {device}',
    'adb.clearProxyFor': '휴대폰 프록시 해제: {device}',
    'adb.clearProxyTip': '휴대폰의 프록시 설정을 해제합니다.',
    'adb.setProxyTip': '휴대폰 프록시를 이 컴퓨터로 설정합니다.',
    'adb.currentProxy': '현재 프록시: {proxy}',
    'adb.noProxy': '프록시 설정 없음',
    'adb.guide': '클릭하여 휴대폰 프록시 설정',
    'adb.failed': 'adb 작업 실패.',
    'adb.pathHint': 'adb 가 설치되어 있고 PATH 에서 실행 가능한지 확인하세요.',
    'ai.none': 'AI 사용 안 함',
    'ai.switchTip': 'AI 제공자를 전환합니다. 현재: {provider}',
    'ai.disabledRuleTip': 'AI를 사용하지 않아 AI 규칙을 추가할 수 없습니다.',
    'ai.addRuleTip': 'AI Python 스크립트 규칙을 추가합니다.',
    'ai.ask': 'AI에 질문',
    'ai.askTip': '새 터미널을 열고 현재 요청, 프로젝트 디렉터리, 컨텍스트를 선택한 AI 제공자에게 보냅니다.',
    'ai.askNoProject': '먼저 로컬 프로젝트 디렉터리를 연결하세요.',
    'ai.askFailed': 'AI 터미널을 열지 못했습니다.',
    'ai.statusTitle': 'AI 작업 상태',
    'ai.scriptGeneration': 'AI 스크립트 생성',
    'ai.noteAnalysis': '메모 분석',
    'ai.detailAnalysis': '상세 설명',
    'ai.provider': '제공자',
    'ai.autoNotes': '메모 자동 분석',
    'ai.totalQueue': '전체 대기열',
    'ai.running': '실행',
    'ai.pending': '대기',
    'ai.failed': '실패',
    'ai.completed': '완료',
    'ai.current': '현재',
    'ai.lastFailure': '최근 실패',
    'ai.runPending': '실행 / 대기',
    'ai.completedFailed': '완료 / 실패',
    'ai.runningState': '실행 중',
    'ai.stoppedState': '중지됨',
    'ai.failedShort': 'Codex 실패 {count}',
    'ai.generationQueue': 'AI생성 {running}/{total}{pendingText}',
    'ai.pendingSuffix': ' · 대기 {pending}',
    'ai.noteQueue': '메모 분석 {state} {running}/{total}',
    'ai.detailQueue': '상세 설명 {state} {running}/{total}',
    'ai.disabledWorkTip': 'AI를 사용하지 않아 시작할 수 없습니다.',
    'ai.stopWorkTip': 'AI 작업을 중지하고 대기 작업을 비우며 실행 중인 AI 규칙 생성을 중단합니다.',
    'ai.startWorkTip': '메모 자동 분석을 시작하고 메모가 없는 API를 다시 스캔합니다.',
    'ai.toggleFailed': 'AI 작업 상태 변경 실패.',
    'note.short': '메모',
    'note.actionTip': '이 API의 수동 메모를 추가하거나 편집합니다.',
    'note.title': 'API 메모',
    'note.placeholder': '이 API는 무엇을 하나요?',
    'note.detail': '상세 설명',
    'note.detailTitle': 'API 상세 설명',
    'note.detailTip': '이 API의 파라미터, 필드, 코드 근거 설명을 생성하거나 봅니다.',
    'note.detailGenerating': '상세 설명 생성 중.',
    'note.detailFailed': '상세 설명 생성 실패.',
    'note.detailFailedTitle': '상세 설명 생성 실패',
    'note.detailFailedReason': '원인: {message}',
    'note.detailFailedAt': '실패 시간: {time}',
    'note.detailStillGenerating': '상세 설명이 아직 생성 중입니다. 잠시 후 다시 열어 주세요.',
    'note.detailQueue': '상세 설명 생성 중, 대기열 {running}/{total}.',
    'note.emptyDetail': '상세 설명이 없습니다.',
    'note.generateDetail': '상세 설명 생성',
    'note.detailFailureButton': '상세 설명 실패',
    'note.generating': '생성 중',
    'note.viewDetailTip': '생성된 파라미터, 필드, 코드 근거 설명을 봅니다.',
    'note.viewFailureTip': '상세 설명 생성 실패 원인을 봅니다.',
    'note.generatingTip': '상세 설명 생성 중입니다. 클릭하면 AI 작업 상태를 볼 수 있습니다.',
    'note.generateTip': '이 API의 파라미터, 필드, 코드 근거 설명을 생성합니다.',
    'note.regenerate': '다시 생성',
    'note.generate': '생성',
    'settings.title': '설정',
    'settings.language': '언어',
    'settings.appearance': '외관',
    'appearance.system': '시스템 설정 따르기',
    'appearance.light': '라이트',
    'appearance.dark': '다크',
    'settings.treeView': '트리 보기',
    'settings.mergeRequests': '요청 병합',
    'settings.showListNotes': '목록에 메모 표시',
    'settings.aiAutoNotes': 'AI 메모 자동 생성',
    'settings.maxHistory': '최대 기록 수',
    'cert.download': '인증서 다운로드',
    'tree.expand': "펼치기",
    'tree.collapse': "접기",
    'tree.actions': "트리 보기 작업",
    'tree.expandAll': "전체 펼치기",
    'tree.collapseAll': "전체 접기",
    'context.updateLocal': "로컬 목 업데이트",
    'context.createLocal': "로컬 목으로 지정",
    'context.updateRemote': "리라이트 규칙 업데이트",
    'context.createRemote': "리라이트 규칙으로 설정",
    'context.addAsDomain': "프로젝트 도메인으로 추가",
    'context.openDomain': "도메인 열기",
    'merge.querySourceError': "매칭 쿼리는 현재 요청에서 파라미터를 삭제하는 변경만 자동 저장할 수 있습니다. 파라미터 추가, 이름 변경, 값 변경은 수동 저장이 필요합니다.",
    'merge.bodySourceError': "매칭 요청 본문은 현재 요청에서 필드를 삭제하는 변경만 자동 저장할 수 있습니다. 필드 추가, 이름 변경, 값 변경, 구조 변경은 수동 저장이 필요합니다.",
    'merge.sourceError': "매칭 템플릿은 현재 요청을 좁히는 변경만 자동 저장할 수 있습니다. 그 외 변경은 수동 저장이 필요합니다.",
    'merge.conflictAutoSave': "이 매칭 범위가 같은 API의 다른 집계 설정을 포함하므로 자동 저장할 수 없습니다. 매칭 쿼리/요청 본문을 조정하거나 저장을 눌러 다시 검증하세요.",
    'merge.manualSaveDefault': "이 매칭 범위가 다른 규칙과 겹칩니다. 수동 저장 후 다시 검증하세요.",
    'merge.conflictSave': "규칙 매칭 범위가 다른 규칙과 겹쳐 저장할 수 없습니다.",
    'merge.conflictWithRule': "이 매칭 범위가 「{target}」와 겹쳐 자동 저장할 수 없습니다. 매칭 쿼리/요청 본문을 조정하거나 저장을 눌러 다시 검증하세요.",
    'merge.otherRule': "다른 규칙",
    'query.ignoreTip': "비워 두면 쿼리를 무시합니다. a=1&b=2 를 입력하면 해당 필드가 필수입니다.",
    'query.templateTip': "체크를 해제하면 여기에 있는 필수 필드로 매칭합니다. 비워 두면 쿼리를 무시합니다. 실제 요청에 추가 필드가 있거나 순서가 달라도 됩니다.",
    'query.mergeTip': "켜면 쿼리가 달라도 같은 그룹으로 합칩니다. 끄면 필수 필드 템플릿을 편집할 수 있습니다.",
    'query.matchingTitle': "매칭에 사용하는 쿼리",
    'query.ignoredTitle': "매칭에 사용하지 않는 쿼리",
    'query.deleteAria': "매칭 쿼리에서 삭제",
    'body.deleteAria': "매칭 요청 본문에서 삭제",
    'remote.ruleEnabledAria': "규칙 활성화",
    'actions.edit': "편집",
    'remote.summaryAria': "한 줄 설명",
    'remote.defaultDslMissing': "미입력",
    'remote.defaultDslEmpty': "비어 있음",
    'actions.invalidJson': "잘못된 JSON",
    'actions.formatted': "정리됨",
    'ai.statusQueued': "대기 중",
    'ai.statusGenerating': "생성 중",
    'ai.statusGenerated': "생성됨",
    'ai.statusStopped': "중지됨",
    'ai.statusFailed': "생성 실패",
    'ai.copied': "복사됨",
    'ai.copyFailed': "복사 실패",
    'ai.promptRequired': "AI 규칙 생성 프롬프트를 입력하세요.",
    'ai.queuedDots': "대기 중...",
    'ai.submitJob': "AI 생성 작업 제출 중...",
    'ai.generatingDots': "생성 중...",
    'ai.queued': "대기됨",
    'ai.failedSentence': "생성 실패.",
    'ai.existingJob': "이미 실행 중인 AI 생성 작업이 있습니다.",
    'ai.enqueuedJob': "AI 생성 대기열에 추가되었습니다.",
    'remote.previewFailed': "미리보기 실패.",
    'remote.incomplete': "리라이트 규칙이 완성되지 않았습니다.",
    'remote.pathNoSpace': "키 경로에는 공백을 포함할 수 없습니다.",
    'remote.valueEncodeError': "값에 인코딩할 수 없는 문자가 포함되어 있습니다.",
    'actions.repeatFailed': "Repeat 실패.",
    'actions.done': "완료",
    'capture.loadingDetail': "요청 상세 불러오는 중...",
    'capture.retryLater': "잠시 후 다시 클릭하세요.",
    'capture.detailLoadFailed': "요청 상세 불러오기 실패.",
    'capture.hitLocal': "로컬 목 매칭됨",
    'capture.hitRemote': "리라이트 규칙 매칭됨",
    'capture.proxyFailed': "프록시 요청 실패",
    'capture.reason': "원인: {message}",
    'capture.type': "유형: {type}",
    'capture.requestTime': "요청 시간 {time}",
    'capture.detailTimeout': "요청 상세 불러오기가 시간 초과되었습니다. 잠시 후 다시 시도하세요.",
    'preview.request': "요청 미리보기",
    'preview.localEdit': "로컬 목 편집",
    'preview.remoteEdit': "리라이트 규칙 편집",
    'preview.globalRemote': "전역 리라이트 규칙",
    'tabs.query': "쿼리",
    'tabs.modifyRules': "규칙",
    'local.updateTip': "현재 요청과 응답으로 기존 로컬 목 설정을 갱신합니다.",
    'remote.updateTip': "편집한 규칙은 덮어쓰지 않고 기존 리라이트 규칙의 요청 정보를 갱신합니다.",
    'note.ruleTip': "이 규칙의 한 줄 메모를 추가하거나 편집합니다. 빈 메모는 목록에 표시되지 않습니다.",
    'note.apiTip': "이 API의 메모를 추가하거나 편집합니다. 빈 메모는 목록에 표시되지 않습니다.",
    'diff.before': "매핑 전",
    'diff.after': "매핑 후",
    'diff.prev': "이전 차이",
    'diff.next': "다음 차이",
    'diff.current': "현재 차이로 이동",
    'diff.copyAll': "{title} 전체 텍스트 복사",
    'diff.copyFailed': "복사 실패",
    'diff.omittedLines': "... 변경 없는 {count}줄 생략 ...",
    'diff.truncated': "... 내용이 너무 길어 {count}자를 잘랐습니다 ...",
    'diff.viewFull': "이쪽 전체 내용 보기",
    'diff.back': "← 비교로 돌아가기",
    'diff.fullTitle': "{title} · 전체 미리보기",
    'rule.global': "전역 규칙",
    'rule.matchSummary': "매칭: {text}",
    'query.none': "쿼리 파라미터 없음",
    'capture.requestDetail': "요청 상세",
    'aiGuide.myRequest': '내 요청:',
    'aiGuide.outputOnly': '완전한 Python 스크립트만 출력하세요. Markdown, 코드 펜스, 설명 과정은 출력하지 마세요.',
    'aiGuide.commentSafe': '주석은 로직 요약만 포함해야 하며 전체 요청 본문, 응답 본문, base64, 민감 데이터를 포함하면 안 됩니다.',
    'aiGuide.comment': '스크립트 맨 위 첫 줄부터 자세한 Python 주석을 작성해 스크립트 목적, 적용 stage, 매칭/수정 필드, 미매칭 시 통과 여부를 설명하세요.',
    'aiGuide.stdlib': 'Python 표준 라이브러리만 사용하세요. 네트워크 접근, 로컬 파일 읽기/쓰기, 설명 텍스트 출력은 금지입니다.',
    'aiGuide.noSensitive': '전체 요청 본문, 응답 본문, base64, ctx 내용을 예외, assert, print, summary, 반환 오류에 넣지 마세요.',
    'aiGuide.dropBase64': 'body 문자열을 수정했다면 이전 base64가 변경 내용을 덮어쓰지 않도록 해당 객체에서 bodyBase64를 삭제하세요.',
    'aiGuide.base64': 'bodyBase64는 바이너리 내용 전용입니다. 바이너리 처리가 꼭 필요하지 않다면 bodyBase64를 읽거나 파싱하거나 다시 쓰지 마세요.',
    'aiGuide.parseBody': 'JSON 또는 URL encoded 텍스트를 수정할 때는 ctx["request"]["body"] 또는 ctx["response"]["body"]를 우선 파싱해 수정하세요.',
    'aiGuide.returnCtx': 'ctx를 직접 수정하고 ctx를 반환하세요. 변경이 필요 없는 stage는 그대로 ctx를 반환하세요.',
    'aiGuide.crossIntent': '사용자 요구는 \'요청 본문 xxx일 때 응답 본문 xxx 변경\' 또는 \'query 파라미터 xxx일 때 응답 헤더 xxx 변경\'처럼 stage를 넘나드는 로직일 수 있습니다. 해당 stage에서 ctx["request"] 조건을 읽고 ctx["response"] 또는 대상 필드를 수정하세요.',
    'aiGuide.crossContext': '스크립트는 같은 트랜잭션의 전체 요청/응답 컨텍스트를 기반으로 판단할 수 있습니다. 예를 들어 요청 본문 type=welcome, query tab=home, 또는 요청 헤더가 특정 값과 일치할 때 응답 본문, 응답 헤더, 요청 본문을 수정할 수 있습니다.',
    'aiGuide.response': 'ctx["response"]에는 statusCode, statusMessage, headers, body, bodyBase64, contentType이 포함됩니다.',
    'aiGuide.request': 'ctx["request"]에는 method, url, headers, query, path, body, bodyBase64, contentType이 포함됩니다.',
    'aiGuide.stage': 'ctx["stage"] 값은 request_head, request_body, response_head, response_body 중 하나입니다.',
    'aiGuide.ctxCall': '스크립트는 프록시 처리 중 호출되며 입력은 ctx 딕셔너리입니다. handle(ctx)를 정의하거나 on_request_head(ctx), on_request_body(ctx), on_response_head(ctx), on_response_body(ctx)를 정의할 수 있습니다.',
    'aiGuide.ruleSample': '이 규칙에는 보통 한 번의 요청 샘플이 있습니다. 샘플 필드는 참고할 수 있지만, 실행 시에는 필드 존재 여부를 반드시 확인하세요.',
    'aiGuide.globalSample': '고정된 요청 또는 응답 샘플이 없습니다. path, query, 요청 본문, 응답 본문이 항상 있다고 가정하지 마세요. 스크립트에서는 runtime ctx에서 method, path, query, headers, body를 안전하게 확인한 뒤 수정해야 합니다.',
    'aiGuide.ruleIntro': 'HttpMocker 리라이트 규칙을 생성합니다. 규칙은 Python 스크립트여야 합니다.',
    'aiGuide.globalIntro': 'HttpMocker 전역 리라이트 규칙을 생성합니다. 이 규칙은 {host} 호스트에만 적용되며, 해당 호스트의 모든 요청에서 실행될 수 있습니다. 규칙은 Python 스크립트여야 합니다.',
    'aiGuide.title': '외부 AI에 복사할 프롬프트',
    'aiGuide.missingHost': '[호스트를 먼저 입력]',
    'aiGuide.empty': '[비어 있음]',
  }
};
const remoteActions = [
  ['change_query', 'remote.action.query'],
  ['change_req_head', 'remote.action.requestHead'],
  ['change_req_body', 'remote.action.requestBody'],
  ['change_resp_head', 'remote.action.responseHead'],
  ['change_resp_body', 'remote.action.responseBody']
];

const remoteCommandPattern = /^(change_req_body|change_resp_body|change_query|change_req_head|change_resp_head)\s+([^\s]+)\s+to\s+"((?:\\.|[^"\\])*)"$/;
const maxDetailedDiffChars = 300000;
const maxDetailedDiffLines = 4000;
const maxInlineDiffChars = 8000;
const maxCoarseDiffContextLines = 120;
const maxCoarseDiffChangedLines = 500;
function aiScriptGuideText(userPrompt = '') {
  const demand = String(userPrompt || '').trim() || t('aiGuide.empty');
  const rule = selectedRemoteRule();
  const isGlobal = isGlobalRemoteRule(rule);
  return [
  t('aiGuide.title'),
  '',
  isGlobal
    ? t('aiGuide.globalIntro', { host: rule?.host || t('aiGuide.missingHost') })
    : t('aiGuide.ruleIntro'),
  isGlobal
    ? t('aiGuide.globalSample')
    : t('aiGuide.ruleSample'),
  t('aiGuide.ctxCall'),
  t('aiGuide.stage'),
  t('aiGuide.request'),
  t('aiGuide.response'),
  t('aiGuide.crossContext'),
  t('aiGuide.crossIntent'),
  '',
  t('aiGuide.returnCtx'),
  t('aiGuide.parseBody'),
  t('aiGuide.base64'),
  t('aiGuide.dropBase64'),
  t('aiGuide.noSensitive'),
  t('aiGuide.stdlib'),
  t('aiGuide.comment'),
  t('aiGuide.commentSafe'),
  '',
  t('aiGuide.outputOnly'),
  '',
  t('aiGuide.myRequest'),
  demand
  ].join('\n');
}
const disabledRemoteDslPrefix = '# disabled ';

const els = {
  startupBlocker: document.querySelector('#startup-blocker'),
  projectPathGuide: document.querySelector('#project-path-guide'),
  projectPathGuideSpot: document.querySelector('.project-path-guide-spot'),
  projectPathGuideCard: document.querySelector('.project-path-guide-card'),
  adbProxyGuide: document.querySelector('#adb-proxy-guide'),
  adbProxyGuideSpot: document.querySelector('.adb-proxy-guide-spot'),
  adbProxyGuideCard: document.querySelector('.adb-proxy-guide-card'),
  adbProxyGuideHand: document.querySelector('.adb-proxy-guide-hand'),
  adbProxyGuideBody: document.querySelector('#adb-proxy-guide-body'),
  instantTooltip: document.querySelector('#instant-tooltip'),
  itemContextMenu: document.querySelector('#item-context-menu'),
  proxyPort: document.querySelector('#proxy-port'),
  proxyStatus: document.querySelector('#proxy-status'),
  proxyToggleBtn: document.querySelector('#proxy-toggle-btn'),
  adbProxyActions: document.querySelector('#adb-proxy-actions'),
  localIp: document.querySelector('#local-ip'),
  captures: document.querySelector('#captures'),
  capturesTab: document.querySelector('#captures-tab'),
  captureWorkspaceTabs: document.querySelector('#project-domain-tabs'),
  capturesView: document.querySelector('#captures-view'),
  updateBanner: document.querySelector('#update-banner'),
  displayFilter: document.querySelector('#display-filter'),
  projectPathInput: document.querySelector('#project-path-input'),
  captureViewModeBtn: document.querySelector('#capture-view-mode-btn'),
  selectProjectPathBtn: document.querySelector('#select-project-path-btn'),
  clearCapturesBtn: document.querySelector('#clear-captures-btn'),
  clearCapturesMenu: document.querySelector('#clear-captures-menu'),
  clearOlderCapturesBtn: document.querySelector('#clear-older-captures-btn'),
  clearAllCapturesBtn: document.querySelector('#clear-all-captures-btn'),
  clearNotesBtn: document.querySelector('#clear-notes-btn'),
  clearRulesBtn: document.querySelector('#clear-rules-btn'),
  rules: document.querySelector('#rules'),
  rulesTab: document.querySelector('#rules-tab'),
  rulesView: document.querySelector('#rules-view'),
  remoteRules: document.querySelector('#remote-rules'),
  remoteRulesTab: document.querySelector('#remote-rules-tab'),
  remoteRulesView: document.querySelector('#remote-rules-view'),
  captureCount: document.querySelector('#capture-count'),
  ruleCount: document.querySelector('#rule-count'),
  remoteRuleCount: document.querySelector('#remote-rule-count'),
  workspace: document.querySelector('.workspace'),
  workspaceResizer: document.querySelector('#workspace-resizer'),
  caCertLink: document.querySelector('#ca-cert-link'),
  globalSearchBtn: document.querySelector('#global-search-btn'),
  terminalToggleBtn: document.querySelector('#terminal-toggle-btn'),
  terminalPanel: document.querySelector('#terminal-panel'),
  terminalResizer: document.querySelector('#terminal-resizer'),
  terminalTabs: document.querySelector('#terminal-tabs'),
  terminalAddBtn: document.querySelector('#terminal-add-btn'),
  terminalXterm: document.querySelector('#terminal-xterm'),
  previewPanel: document.querySelector('.preview-panel'),
  globalSearchDialog: document.querySelector('#global-search-dialog'),
  globalSearchInput: document.querySelector('#global-search-input'),
  runGlobalSearchBtn: document.querySelector('#run-global-search-btn'),
  closeGlobalSearchBtn: document.querySelector('#close-global-search-btn'),
  globalSearchScope: document.querySelector('#global-search-scope'),
  globalSearchResults: document.querySelector('#global-search-results'),
  updateDialog: document.querySelector('#update-dialog'),
  updateDialogTitle: document.querySelector('#update-dialog-title'),
  updateDialogMessage: document.querySelector('#update-dialog-message'),
  updateDialogCancelBtn: document.querySelector('#update-dialog-cancel-btn'),
  updateDialogActionBtn: document.querySelector('#update-dialog-action-btn'),
  previewFindBar: document.querySelector('#preview-find-bar'),
  previewFindInput: document.querySelector('#preview-find-input'),
  previewFindCount: document.querySelector('#preview-find-count'),
  previewFindPrev: document.querySelector('#preview-find-prev'),
  previewFindNext: document.querySelector('#preview-find-next'),
  previewWorkspaceTabs: document.querySelector('#preview-workspace-tabs'),
  previewTitle: document.querySelector('#preview-title'),
  editorTitle: document.querySelector('#editor-title'),
  editorPath: document.querySelector('#editor-path'),
  editorNote: document.querySelector('#editor-note'),
  analyzeNoteBtn: document.querySelector('#analyze-note-btn'),
  askAiBtn: document.querySelector('#ask-ai-btn'),
  captureQueryEditor: document.querySelector('#capture-query-editor'),
  captureQueryInput: document.querySelector('#capture-query-input'),
  captureQueryPreview: document.querySelector('#capture-query-preview'),
  captureQueryOriginal: document.querySelector('#capture-query-original'),
  captureMergeQueryRow: document.querySelector('#capture-query-merge-row'),
  captureMergeQuery: document.querySelector('#capture-merge-query'),
  captureBodyMergeEditor: document.querySelector('#capture-body-merge-editor'),
  captureMergeBodyRow: document.querySelector('#capture-merge-body-row'),
  captureMergeBody: document.querySelector('#capture-merge-body'),
  ruleOptionEditor: document.querySelector('#rule-option-editor'),
  ruleOptionQuery: document.querySelector('#rule-option-query'),
  ruleOptionBodyRow: document.querySelector('#rule-option-body-row'),
  ruleOptionBody: document.querySelector('#rule-option-body'),
  ruleOptionEnabled: document.querySelector('#rule-option-enabled'),
  ruleBodyMatchEditor: document.querySelector('#rule-body-match-editor'),
  responseBodyToolbar: document.querySelector('#response-body-toolbar'),
  previewTabs: document.querySelector('#preview-tabs'),
  captureTimeDisplay: document.querySelector('#capture-time-display'),
  overviewTab: document.querySelector('#overview-tab'),
  requestHeadTab: document.querySelector('#request-head-tab'),
  responseHeadTab: document.querySelector('#response-head-tab'),
  queryTab: document.querySelector('#query-tab'),
  responseBodyTab: document.querySelector('#response-body-tab'),
  requestBodyTab: document.querySelector('#request-body-tab'),
  formatBodyBtn: document.querySelector('#format-body-btn'),
  manualRuleSaveBtn: document.querySelector('#manual-rule-save-btn'),
  ruleQueryEditor: document.querySelector('#rule-query-editor'),
  ruleQueryInput: document.querySelector('#rule-query-input'),
  remoteRuleEditor: document.querySelector('#remote-rule-editor'),
  globalRemoteRuleEditor: document.querySelector('#global-remote-head-editor'),
  globalRemoteHostInput: document.querySelector('#global-remote-host-input'),
  globalRemoteEnabled: document.querySelector('#global-remote-enabled'),
  remoteDslEditor: document.querySelector('#remote-dsl-editor'),
  remoteDslStepEditor: document.querySelector('#remote-dsl-step-editor'),
  remoteDslBackBtn: document.querySelector('#remote-dsl-back-btn'),
  remoteDslSummary: document.querySelector('#remote-dsl-summary'),
  remoteDslEnabled: document.querySelector('#remote-dsl-enabled'),
  remoteDslAction: document.querySelector('#remote-dsl-action'),
  remoteDslPath: document.querySelector('#remote-dsl-path'),
  remoteDslValue: document.querySelector('#remote-dsl-value'),
  remoteAiEditor: document.querySelector('#remote-ai-editor'),
  remoteAiBackBtn: document.querySelector('#remote-ai-back-btn'),
  remoteAiSummary: document.querySelector('#remote-ai-summary'),
  remoteAiEnabled: document.querySelector('#remote-ai-enabled'),
  remoteAiPrompt: document.querySelector('#remote-ai-prompt'),
  remoteAiGenerateBtn: document.querySelector('#remote-ai-generate-btn'),
  remoteAiStatus: document.querySelector('#remote-ai-status'),
  remoteAiOutput: document.querySelector('#remote-ai-output'),
  remoteAiScriptHighlight: document.querySelector('#remote-ai-script-highlight'),
  remoteAiScript: document.querySelector('#remote-ai-script'),
  remoteRuleToolbar: document.querySelector('#remote-rule-toolbar'),
  remoteDslList: document.querySelector('#remote-dsl-list'),
  remoteExampleDivider: document.querySelector('.remote-example-divider'),
  remoteExampleDividerLabel: document.querySelector('.remote-example-divider span'),
  remoteRuleLower: document.querySelector('.remote-rule-lower'),
  remoteExampleRequestTab: document.querySelector('#remote-example-request-tab'),
  remoteExampleResponseTab: document.querySelector('#remote-example-response-tab'),
  remoteExampleRequestHeadTab: document.querySelector('#remote-example-request-head-tab'),
  remoteExampleResponseHeadTab: document.querySelector('#remote-example-response-head-tab'),
  remoteExampleQueryTab: document.querySelector('#remote-example-query-tab'),
  remoteExamplePreview: document.querySelector('#remote-example-preview'),
  remoteExampleDiff: document.querySelector('#remote-example-diff'),
  remoteRuleHelpBtn: document.querySelector('#remote-rule-help-btn'),
  remoteRuleHelpDialog: document.querySelector('#remote-rule-help-dialog'),
  closeRemoteRuleHelpBtn: document.querySelector('#close-remote-rule-help-btn'),
  addRemoteRuleBtn: document.querySelector('#add-remote-rule-btn'),
  remoteAddMenu: document.querySelector('#remote-add-menu'),
  addRemoteDslBtn: document.querySelector('#add-remote-dsl-btn'),
  remoteAiRuleBtn: document.querySelector('#remote-ai-rule-btn'),
  bodyEditorStack: document.querySelector('#body-editor-stack'),
  captureBodyOriginal: document.querySelector('#capture-body-original'),
  captureBodyDivider: document.querySelector('#capture-body-divider'),
  editor: document.querySelector('#body-editor'),
  bodyHighlight: document.querySelector('#body-highlight'),
  captureOverview: document.querySelector('#capture-overview'),
  captureDiffView: document.querySelector('#capture-diff-view'),
  localBtn: document.querySelector('#local-btn'),
  remoteBtn: document.querySelector('#remote-btn'),
  copyCurlBtn: document.querySelector('#copy-curl-btn'),
  repeatBtn: document.querySelector('#repeat-btn'),
  noteBtn: document.querySelector('#note-btn'),
  deleteRuleBtn: document.querySelector('#delete-rule-btn'),
  aiSelectorBtn: document.querySelector('#ai-selector-btn'),
  aiSelectorMenu: document.querySelector('#ai-selector-menu'),
  currentAiLabel: document.querySelector('#current-ai-label'),
  noteDialog: document.querySelector('#note-dialog'),
  noteInput: document.querySelector('#note-input'),
  domainProjectDialog: document.querySelector('#domain-project-dialog'),
  domainProjectDialogTitle: document.querySelector('#domain-project-dialog-title'),
  domainProjectDialogText: document.querySelector('#domain-project-dialog-text'),
  domainProjectInput: document.querySelector('#domain-project-input'),
  domainHistoryTitle: document.querySelector('#domain-history-title'),
  domainHistoryList: document.querySelector('#domain-history-list'),
  domainProjectNoneBtn: document.querySelector('#domain-project-none-btn'),
  domainProjectCancelBtn: document.querySelector('#domain-project-cancel-btn'),
  domainProjectSaveBtn: document.querySelector('#domain-project-save-btn'),
  settingsDialog: document.querySelector('#settings-dialog'),
  languageSelect: document.querySelector('#language-select'),
  appearanceSelect: document.querySelector('#appearance-select'),
  captureTreeViewEnabled: document.querySelector('#capture-tree-view-enabled'),
  captureMergeEnabled: document.querySelector('#capture-merge-enabled'),
  showListNotes: document.querySelector('#show-list-notes'),
  aiNotesEnabled: document.querySelector('#ai-notes-enabled'),
  maxRecentRequests: document.querySelector('#max-recent-requests'),
  closeSettingsBtn: document.querySelector('#close-settings-btn'),
  aiStatusDialog: document.querySelector('#ai-status-dialog'),
  aiStatusDialogBody: document.querySelector('#ai-status-dialog-body'),
  aiWorkToggleBtn: document.querySelector('#ai-work-toggle-btn'),
  closeAiStatusBtn: document.querySelector('#close-ai-status-btn'),
  detailNoteDialog: document.querySelector('#detail-note-dialog'),
  detailNoteContent: document.querySelector('#detail-note-content'),
  closeDetailNoteBtn: document.querySelector('#close-detail-note-btn'),
  regenerateDetailNoteBtn: document.querySelector('#regenerate-detail-note-btn'),
  closeNoteBtn: document.querySelector('#close-note-btn'),
  clearNoteBtn: document.querySelector('#clear-note-btn'),
  saveNoteBtn: document.querySelector('#save-note-btn')
};
const previewPaneTemplate = livePreviewPane()?.cloneNode(true) || null;
let previewPaneParkingLot = null;

els.proxyToggleBtn.addEventListener('click', toggleProxyService);
els.proxyStatus.addEventListener('click', (event) => {
  event.stopPropagation();
  openAiStatusDialog();
});
els.aiWorkToggleBtn?.addEventListener('click', toggleAiWork);
els.closeAiStatusBtn?.addEventListener('click', closeAiStatusDialog);
els.workspaceResizer?.addEventListener('pointerdown', startWorkspaceResize);
els.workspaceResizer?.addEventListener('keydown', handleWorkspaceResizeKeydown);
document.addEventListener('mouseover', handleInstantTooltipOver);
document.addEventListener('mousemove', handleInstantTooltipMove);
document.addEventListener('mouseout', handleInstantTooltipOut);
document.addEventListener('pointerdown', handlePreviewFindOutsidePointerDown, true);
document.addEventListener('pointerdown', dismissProjectPathGuide, true);
document.addEventListener('pointerdown', handleAdbProxyGuideOutsidePointerDown, true);
document.addEventListener('pointerdown', handleFloatingMenuOutsidePointerDown, true);
document.addEventListener('pointerdown', handleWorkspacePointerDown, true);
document.addEventListener('pointerdown', handlePreviewTextSelectionPointerDown, true);
document.addEventListener('pointermove', handlePreviewTextSelectionPointerMove, true);
document.addEventListener('pointerup', stopPreviewTextSelectionDrag, true);
document.addEventListener('pointercancel', stopPreviewTextSelectionDrag, true);
window.addEventListener('resize', () => {
  renderProjectPathGuide();
  maybeShowAdbProxyGuide();
});
document.addEventListener('focusin', (event) => {
  convertTitleToInstantTooltip(event.target);
});
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('http-mocker-open-settings', openSettingsDialog);
window.addEventListener('http-mocker-add-domain', () => openDomainProjectDialog('add'));
window.addEventListener('http-mocker-show-domain-history', () => openDomainProjectDialog('add'));
window.addEventListener('http-mocker-check-update', () => {
  checkForUpdates({ force: true, notify: true });
});
window.addEventListener('http-mocker-preview-history-back', () => {
  switchPreviewWorkspaceTabHistory(-1);
});
window.addEventListener('http-mocker-preview-history-forward', () => {
  switchPreviewWorkspaceTabHistory(1);
});
window.addEventListener('http-mocker-close-active-tab', () => {
  closeActiveWorkspaceTabForShortcut(document.activeElement, { force: true, preferPreview: true });
});
window.addEventListener('popstate', handlePreviewWorkspaceBrowserHistory);
window.addEventListener('pagehide', closeBackgroundConnections);
window.addEventListener('beforeunload', closeBackgroundConnections);
document.addEventListener('freeze', closeBackgroundConnections);
window.addEventListener('storage', handleCrossTabMessage);
els.capturesTab.addEventListener('click', () => setActiveTab('captures', { autoSelect: false, focusList: true }));
els.captures.addEventListener('keydown', (event) => handleListKeyboardNavigation(event, 'captures'));
els.captureViewModeBtn.addEventListener('click', toggleCaptureViewMode);
els.selectProjectPathBtn.addEventListener('click', toggleProjectPath);
els.clearCapturesBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleClearCapturesMenu();
});
els.clearCapturesMenu.addEventListener('click', (event) => {
  event.stopPropagation();
});
els.clearOlderCapturesBtn.addEventListener('click', clearOlderCaptures);
els.clearAllCapturesBtn.addEventListener('click', clearAllCaptures);
els.clearNotesBtn.addEventListener('click', clearNotes);
els.clearRulesBtn.addEventListener('click', clearRules);
els.rulesTab.addEventListener('click', () => setActiveTab('rules', { autoSelect: false, focusList: true }));
els.remoteRulesTab.addEventListener('click', () => setActiveTab('remote', { autoSelect: false, focusList: true }));
els.rules.addEventListener('keydown', (event) => handleListKeyboardNavigation(event, 'rules'));
els.remoteRules.addEventListener('keydown', (event) => handleListKeyboardNavigation(event, 'remote'));
els.globalSearchBtn?.addEventListener('click', openGlobalSearchDialog);
els.terminalToggleBtn?.addEventListener('click', toggleTerminalPanel);
els.terminalAddBtn?.addEventListener('click', () => addTerminalTab());
els.terminalPanel?.addEventListener('pointerdown', focusTerminalFromPanel);
els.terminalPanel?.addEventListener('keydown', handleTerminalKeydown);
els.terminalResizer?.addEventListener('pointerdown', startTerminalResize);
els.terminalResizer?.addEventListener('keydown', handleTerminalResizeKeydown);
els.closeGlobalSearchBtn?.addEventListener('click', closeGlobalSearchDialog);
els.runGlobalSearchBtn?.addEventListener('click', runGlobalSearch);
els.globalSearchInput?.addEventListener('input', () => {
  state.globalSearchQuery = els.globalSearchInput.value;
});
els.globalSearchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runGlobalSearch();
  }
});
els.globalSearchDialog?.addEventListener('click', (event) => {
  if (event.target === els.globalSearchDialog) {
    closeGlobalSearchDialog();
  }
});
els.globalSearchDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeGlobalSearchDialog();
});
bindPreviewPaneEvents(livePreviewPane());
els.localBtn.addEventListener('click', () => saveSelectedCapture('exact'));
els.remoteBtn.addEventListener('click', saveSelectedRemoteRule);
els.copyCurlBtn.addEventListener('click', copySelectedCurl);
els.repeatBtn.addEventListener('click', repeatSelectedRequest);
els.noteBtn.addEventListener('click', openNoteDialog);
els.deleteRuleBtn.addEventListener('click', deleteSelectedRule);
els.aiSelectorBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleAiSelectorMenu();
});
els.aiSelectorMenu.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    const ai = btn.dataset.ai;
    setAiProvider(ai).catch((error) => {
      console.error(error);
      window.alert(error.message || t('ai.toggleFailed'));
    });
    closeAiSelectorMenu();
  });
});
window.addEventListener('click', (event) => {
  const target = event.target;
  closeItemContextMenu();
  closeAiSelectorMenu();
  closeClearCapturesMenu();
  closeRemoteAddMenu();
  if (!target?.closest?.('.adb-proxy-menu-wrap')) closeAdbDeviceMenu();
});
window.addEventListener('contextmenu', (event) => {
  if (!event.target.closest?.('.capture,.rule')) {
    closeItemContextMenu();
  }
});
window.addEventListener('resize', closeItemContextMenu);
window.addEventListener('resize', clampWorkspaceSplit);
window.addEventListener('scroll', closeItemContextMenu, true);

function toggleAiSelectorMenu() {
  els.aiSelectorMenu.hidden = !els.aiSelectorMenu.hidden;
}

function closeAiSelectorMenu() {
  els.aiSelectorMenu.hidden = true;
}

function toggleClearCapturesMenu() {
  els.clearCapturesMenu.hidden = !els.clearCapturesMenu.hidden;
}

function closeClearCapturesMenu() {
  els.clearCapturesMenu.hidden = true;
}

function toggleRemoteAddMenu() {
  els.remoteAddMenu.hidden = !els.remoteAddMenu.hidden;
}

function closeRemoteAddMenu() {
  els.remoteAddMenu.hidden = true;
}

function closeItemContextMenu() {
  if (!els.itemContextMenu) return;
  els.itemContextMenu.hidden = true;
  els.itemContextMenu.innerHTML = '';
}

function handleFloatingMenuOutsidePointerDown(event) {
  const target = event.target;
  if (!target?.closest?.('.ai-selector')) closeAiSelectorMenu();
  if (!target?.closest?.('.clear-captures-menu-wrap')) closeClearCapturesMenu();
  if (!target?.closest?.('.remote-add-menu-wrap')) closeRemoteAddMenu();
}

function showItemContextMenu(event, actions) {
  if (!els.itemContextMenu || !actions.length) return;
  event.preventDefault();
  event.stopPropagation();
  closeAiSelectorMenu();
  closeClearCapturesMenu();
  closeRemoteAddMenu();
  closeAdbDeviceMenu();

  els.itemContextMenu.innerHTML = '';
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.disabled = Boolean(action.disabled);
    if (action.danger) button.classList.add('danger-menu-item');
    button.addEventListener('click', async (clickEvent) => {
      clickEvent.stopPropagation();
      closeItemContextMenu();
      try {
        await action.run();
      } catch (error) {
        console.error(error);
        window.alert(error.message || t('actions.failed'));
      }
    });
    els.itemContextMenu.append(button);
  }

  els.itemContextMenu.hidden = false;
  positionItemContextMenu(event);
}

function positionItemContextMenu(event) {
  if (!els.itemContextMenu) return;
  const margin = 8;
  const rect = els.itemContextMenu.getBoundingClientRect();
  let left = event.clientX;
  let top = event.clientY;
  if (left + rect.width + margin > window.innerWidth) {
    left = Math.max(margin, window.innerWidth - rect.width - margin);
  }
  if (top + rect.height + margin > window.innerHeight) {
    top = Math.max(margin, window.innerHeight - rect.height - margin);
  }
  els.itemContextMenu.style.left = `${left}px`;
  els.itemContextMenu.style.top = `${top}px`;
}

function tooltipTextForElement(element) {
  convertTitleToInstantTooltip(element);
  const target = element?.closest?.('[data-tooltip]');
  if (target?.dataset?.tooltip) return target.dataset.tooltip;
  return '';
}

function handleInstantTooltipOver(event) {
  const text = tooltipTextForElement(event.target);
  if (!text) return;
  showInstantTooltip(text, event);
}

function handleInstantTooltipMove(event) {
  if (!els.instantTooltip || els.instantTooltip.hidden) return;
  positionInstantTooltip(event);
}

function handleInstantTooltipOut(event) {
  if (!tooltipTextForElement(event.target)) return;
  hideInstantTooltip();
}

function showInstantTooltip(text, event) {
  if (!els.instantTooltip) return;
  els.instantTooltip.textContent = text;
  els.instantTooltip.hidden = false;
  positionInstantTooltip(event);
  els.instantTooltip.classList.add('visible');
}

function positionInstantTooltip(event) {
  if (!els.instantTooltip) return;
  const margin = 10;
  els.instantTooltip.style.left = '0px';
  els.instantTooltip.style.top = '0px';
  const rect = els.instantTooltip.getBoundingClientRect();
  let left = event.clientX + 12;
  let top = event.clientY + 12;
  if (left + rect.width + margin > window.innerWidth) {
    left = Math.max(margin, event.clientX - rect.width - 12);
  }
  if (top + rect.height + margin > window.innerHeight) {
    top = Math.max(margin, event.clientY - rect.height - 12);
  }
  els.instantTooltip.style.left = `${left}px`;
  els.instantTooltip.style.top = `${top}px`;
}

function hideInstantTooltip() {
  if (!els.instantTooltip) return;
  els.instantTooltip.classList.remove('visible');
  els.instantTooltip.hidden = true;
}

function setInstantTooltip(element, text) {
  if (!element) return;
  if (text) {
    element.dataset.tooltip = text;
    element.removeAttribute('title');
  } else {
    delete element.dataset.tooltip;
    element.removeAttribute('title');
  }
}

function convertTitleToInstantTooltip(target) {
  if (!target?.nodeType) return;
  const elements = [];
  if (target.nodeType === Node.ELEMENT_NODE) {
    if (target.hasAttribute?.('title')) {
      elements.push(target);
    }
    target.querySelectorAll?.('[title]').forEach((element) => {
      elements.push(element);
    });
  }
  for (const element of elements) {
    const text = element.getAttribute('title') || '';
    setInstantTooltip(element, text);
  }
}

async function setAiProvider(ai) {
  const previous = state.aiProvider;
  state.aiProvider = ai;
  state.aiNotesEnabled = ai !== 'none';
  renderAiSelector();
  renderRemoteRuleEditorMode();
  await patchJson('/api/settings', {
    aiProvider: state.aiProvider,
    aiNotesEnabled: state.aiNotesEnabled
  });
  if (ai === 'none') {
    const result = await postJson('/api/ai/stop', {}).catch((error) => {
      console.error(error);
      return null;
    });
    if (result?.status) state.codexQueue = result.status;
    if (result?.settings) state.aiNotesEnabled = result.settings.aiNotesEnabled !== false;
    await reloadHealth();
    renderAiSelector();
    renderAiStatusDialog();
    return;
  }
  if (previous === 'none' && ai !== 'none') {
    const result = await postJson('/api/ai/start', {}).catch((error) => {
      console.error(error);
      return null;
    });
    if (result?.status) state.codexQueue = result.status;
    if (result?.settings) state.aiNotesEnabled = result.settings.aiNotesEnabled !== false;
    await reloadHealth();
    renderAiSelector();
    renderAiStatusDialog();
    promptProjectPathForActiveDomain();
    return;
  }
  scheduleSettingsSave();
  renderAiStatusDialog();
}

function renderAiSelector() {
  const labels = {
    none: t('ai.none'),
    codex: 'Codex',
    cursor: 'Cursor',
    claude: 'Claude'
  };
  const availableIds = new Set(state.availableAiProviders.map((provider) => provider.id));
  els.currentAiLabel.textContent = labels[state.aiProvider] || 'Codex';
  const aiTitle = t('ai.switchTip', { provider: els.currentAiLabel.textContent });
  setInstantTooltip(els.aiSelectorBtn, aiTitle);
  els.aiSelectorBtn.setAttribute('aria-label', aiTitle);
  els.aiSelectorBtn.classList.toggle('has-ai-provider', state.aiProvider !== 'none');
  els.aiSelectorMenu.querySelectorAll('button').forEach((btn) => {
    const ai = btn.dataset.ai;
    const isAvailable = ai === 'none' || availableIds.has(ai);
    btn.hidden = !isAvailable;
    btn.classList.toggle('active', ai === state.aiProvider);
    btn.classList.toggle('active-ai-provider', ai === state.aiProvider && ai !== 'none');
  });
  const disabled = aiProviderDisabled();
  renderProjectPath();
  els.remoteAiRuleBtn.disabled = disabled;
  setInstantTooltip(els.remoteAiRuleBtn, disabled
    ? t('ai.disabledRuleTip')
    : t('ai.addRuleTip'));
  els.remoteAiGenerateBtn.textContent = disabled ? t('remote.copyPrompt') : t('remote.aiGenerate');
  els.remoteAiGenerateBtn.disabled = !disabled && isAiStepGenerating(selectedAiStep());
  setInstantTooltip(els.remoteAiGenerateBtn, disabled
    ? t('remote.copyPromptTip')
    : '');
  renderAskAiButton();
}

function aiProviderDisabled() {
  return state.aiProvider === 'none';
}

function shouldShowAskAiButton() {
  return state.previewMode === 'capture' &&
    Boolean(state.selectedCaptureId) &&
    !aiProviderDisabled();
}

function renderAskAiButton() {
  if (!els.askAiBtn) return;
  const visible = shouldShowAskAiButton();
  els.askAiBtn.hidden = !visible;
  if (!visible) {
    els.askAiBtn.disabled = true;
    refreshEditorTitle();
    return;
  }
  const projectPath = currentProjectPath();
  els.askAiBtn.disabled = !projectPath;
  setInstantTooltip(els.askAiBtn, projectPath ? t('ai.askTip') : t('ai.askNoProject'));
  refreshEditorTitle();
}
function handleCaptureMergeQueryChange() {
  if (!shouldMergeCaptureList()) return;
  const capture = selectedCaptureSummary();
  if (!capture) return;
  const useQueryTemplate = !els.captureMergeQuery.checked;
  const existingOptions = captureMergeOptionsForCapture(capture);
  const variantKey = mergeVariantKeyForDraft(capture, {
    query: useQueryTemplate,
    body: !els.captureMergeBody.checked
  });
  const options = {
    query: useQueryTemplate,
    body: !els.captureMergeBody.checked,
    variantKey,
    queryTemplate: useQueryTemplate
      ? String(existingOptions.queryTemplate || capture.query || '')
      : ''
  };
  if (!useQueryTemplate) options.recycleDimension = 'query';
  if (!useQueryTemplate) options.skipConflictValidation = true;
  applyCaptureMergeRuleDraft(capture, options, { render: false });
  if (options.query === true) {
    els.captureQueryInput.focus();
    els.captureQueryInput.select();
  }
  scheduleCaptureMergeRuleSave(capture, options);
}

function handleCaptureMergeBodyChange() {
  if (!shouldMergeCaptureList()) return;
  const capture = selectedCaptureSummary();
  if (!capture) return;
  const useBodyTemplate = !els.captureMergeBody.checked;
  const variantKey = mergeVariantKeyForDraft(capture, {
    query: !els.captureMergeQuery.checked,
    body: useBodyTemplate
  });
  const options = {
    query: !els.captureMergeQuery.checked,
    body: useBodyTemplate,
    variantKey,
    bodyTemplate: useBodyTemplate
      ? (state.previewBodyTab === 'request' ? els.editor.value : requestBodyText(capture.requestBody))
      : undefined,
    requestContentType: capture.requestContentType || ''
  };
  if (!useBodyTemplate) options.recycleDimension = 'body';
  if (!useBodyTemplate) options.skipConflictValidation = true;
  applyCaptureMergeRuleDraft(capture, options, { render: false });
  refreshCaptureRequestEditor();
  updateFormatBodyButton();
  scheduleCaptureMergeRuleSave(capture, options);
}

function handleCaptureQueryInput() {
  const capture = selectedCaptureSummary();
  if (!capture || !shouldMergeCaptureList() || els.captureMergeQuery.checked) return;
  const options = {
    query: true,
    body: !els.captureMergeBody.checked,
    variantKey: mergeVariantKeyForDraft(capture, {
      query: true,
      body: !els.captureMergeBody.checked
    }),
    queryTemplate: els.captureQueryInput.value
  };
  if (!applyCaptureMergeRuleDraftForAutoSave(capture, options, { render: false })) return;
  scheduleCaptureMergeRuleSave(capture, options);
}

function commitCaptureQueryInput() {
  const capture = selectedCaptureSummary();
  if (!capture || !shouldMergeCaptureList() || els.captureMergeQuery.checked) return;
  const options = {
    query: true,
    body: !els.captureMergeBody.checked,
    variantKey: mergeVariantKeyForDraft(capture, {
      query: true,
      body: !els.captureMergeBody.checked
    }),
    queryTemplate: els.captureQueryInput.value
  };
  if (!applyCaptureMergeRuleDraftForAutoSave(capture, options, { render: false })) return;
  updateCaptureMergeRule(capture, options).catch((error) => {
    console.error(error);
  });
}
els.closeRemoteRuleHelpBtn.addEventListener('click', closeRemoteRuleHelp);
els.closeNoteBtn.addEventListener('click', closeNoteDialog);
els.clearNoteBtn.addEventListener('click', clearCurrentNote);
els.saveNoteBtn.addEventListener('click', saveCurrentNote);
els.closeSettingsBtn?.addEventListener('click', closeSettingsDialog);
els.languageSelect?.addEventListener('change', saveLanguageSetting);
els.appearanceSelect?.addEventListener('change', saveAppearanceSetting);
els.captureTreeViewEnabled.addEventListener('change', saveSettingsDialog);
els.captureMergeEnabled.addEventListener('change', saveSettingsDialog);
els.showListNotes.addEventListener('change', saveSettingsDialog);
els.aiNotesEnabled?.addEventListener('change', saveSettingsDialog);
els.maxRecentRequests?.addEventListener('change', saveSettingsDialog);
els.maxRecentRequests?.addEventListener('blur', saveSettingsDialog);
els.maxRecentRequests?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  saveSettingsDialog();
  els.maxRecentRequests.blur();
});
els.closeDetailNoteBtn.addEventListener('click', closeDetailNoteDialog);
els.regenerateDetailNoteBtn.addEventListener('click', () => generateCurrentDetailNote({ force: true }));
els.updateDialogCancelBtn?.addEventListener('click', closeUpdateDialog);
els.updateDialogActionBtn?.addEventListener('click', () => {
  const url = els.updateDialogActionBtn?.dataset.url || '';
  closeUpdateDialog();
  if (url) window.open(url, '_blank', 'noreferrer');
});
els.updateDialog?.addEventListener('click', (event) => {
  if (event.target === els.updateDialog) closeUpdateDialog();
});
els.updateDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeUpdateDialog();
});
els.remoteRuleHelpDialog.addEventListener('click', (event) => {
  if (event.target === els.remoteRuleHelpDialog) {
    closeRemoteRuleHelp();
  }
});
els.noteDialog.addEventListener('click', (event) => {
  if (event.target === els.noteDialog) {
    closeNoteDialog();
  }
});
els.domainProjectDialog?.addEventListener('cancel', (event) => {
  if (!state.domainProjectsInitialized) {
    event.preventDefault();
    return;
  }
  closeDomainProjectDialog();
});
els.domainProjectDialog?.addEventListener('click', (event) => {
  if (event.target === els.domainProjectDialog && state.domainProjectsInitialized) {
    closeDomainProjectDialog();
  }
});
els.domainProjectInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveDomainProjectFromDialog();
  }
});
els.domainProjectSaveBtn?.addEventListener('click', saveDomainProjectFromDialog);
els.domainProjectNoneBtn?.addEventListener('click', () => saveDomainProjectFromDialog({ unspecified: true }));
els.domainProjectCancelBtn?.addEventListener('click', closeDomainProjectDialog);
els.settingsDialog?.addEventListener('click', (event) => {
  if (event.target === els.settingsDialog) {
    closeSettingsDialog();
  }
});
els.settingsDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSettingsDialog();
});
els.detailNoteDialog.addEventListener('click', (event) => {
  if (event.target === els.detailNoteDialog) {
    closeDetailNoteDialog();
  }
});
document.addEventListener('keydown', (event) => {
  if (isSpaceKey(event) && shouldPreventSpacePageScroll(event.target)) {
    event.preventDefault();
    return;
  }
}, true);
document.addEventListener('mousedown', (event) => {
  handlePreviewWorkspaceHistoryMouseEvent(event);
}, true);
document.addEventListener('mouseup', (event) => {
  handlePreviewWorkspaceHistoryMouseEvent(event);
}, true);
document.addEventListener('auxclick', (event) => {
  handlePreviewWorkspaceHistoryMouseEvent(event);
}, true);
document.addEventListener('contextmenu', (event) => {
  handlePreviewWorkspaceHistoryMouseEvent(event);
}, true);
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'w') {
    const handled = closeActiveWorkspaceTabForShortcut(event.target, { preferPreview: !event.target?.closest?.('.terminal-xterm') });
    if (handled) {
      event.preventDefault();
      return;
    }
  }
  const historyDelta = browserHistoryDeltaFromKeyEvent(event);
  if (historyDelta && shouldHandlePreviewWorkspaceHistoryShortcut(event.target, { global: true })) {
    const handled = switchPreviewWorkspaceTabHistory(historyDelta);
    if (handled) {
      event.preventDefault();
      return;
    }
  }
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key === '[' || event.key === ']' || event.code === 'BracketLeft' || event.code === 'BracketRight')) {
    if (shouldHandlePreviewWorkspaceHistoryShortcut(event.target)) {
      const handled = switchPreviewWorkspaceTabHistory(event.key === '[' || event.code === 'BracketLeft' ? -1 : 1);
      if (handled) {
        event.preventDefault();
        return;
      }
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    openGlobalSearchDialog();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'f') {
    if (canSearchCurrentPreview() && shouldHandlePreviewFindShortcut(event.target)) {
      event.preventDefault();
      openPreviewFindBar();
      return;
    }
  }
  if (event.key === 'Escape' && state.previewFindOpen) {
    event.preventDefault();
    closePreviewFindBar();
    return;
  }
  if (event.key === 'Escape' && els.settingsDialog?.open) {
    event.preventDefault();
    closeSettingsDialog();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
    const target = readonlyPreviewSelectTarget(event.target);
    if (target) {
      event.preventDefault();
      selectElementText(target);
      return;
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    if (state.selectedRuleId || state.selectedRemoteRuleId) {
      event.preventDefault();
      saveCurrentRule({ immediate: true }).catch((error) => {
        console.error(error);
      });
    }
  }
});
els.displayFilter.addEventListener('input', () => {
  state.displayFilter = els.displayFilter.value;
  updateActiveCaptureTab({ displayFilter: state.displayFilter });
  renderCaptures();
  scheduleSettingsSave();
});
function commitCaptureBodyEditorOnBlur() {
  if (state.previewMode !== 'capture' || state.previewBodyTab !== 'request') return;
  const capture = selectedCaptureSummary();
  if (!capture || !shouldMergeCaptureList() || els.captureMergeBody.checked) return;
  const options = {
    query: !els.captureMergeQuery.checked,
    body: true,
    variantKey: mergeVariantKeyForDraft(capture, {
      query: !els.captureMergeQuery.checked,
      body: true
    }),
    bodyTemplate: els.editor.value
  };
  if (!applyCaptureMergeRuleDraftForAutoSave(capture, options)) return;
  updateCaptureMergeRule(capture, options).catch((error) => {
    console.error(error);
  });
}

function handleBodyEditorInput() {
  updateEditableCodeHighlight();
  if (state.previewMode === 'capture' && state.previewBodyTab === 'request') {
    state.previewRequest = {
      ...(state.previewRequest || {}),
      body: els.editor.value
    };
    const capture = selectedCaptureSummary();
    if (capture && shouldMergeCaptureList() && !els.captureMergeBody.checked) {
      const options = {
        query: !els.captureMergeQuery.checked,
        body: true,
        variantKey: mergeVariantKeyForDraft(capture, {
          query: !els.captureMergeQuery.checked,
          body: true
        }),
        bodyTemplate: els.editor.value
      };
      if (!applyCaptureMergeRuleDraftForAutoSave(capture, options, { render: false })) return;
      scheduleCaptureMergeRuleSave(capture, {
        ...options
      });
    }
    return;
  }
  if (state.previewMode === 'rule') {
    updateActivePreviewBodyFromEditor();
  }
  if (state.previewMode === 'remote' && state.previewBodyTab === 'request') {
    state.previewRequest = {
      ...(state.previewRequest || {}),
      body: els.editor.value
    };
    scheduleRemotePreview();
  }
  scheduleRuleAutoSave();
}

try {
  setupInstantTooltips();
  applyLanguage({ staticOnly: true });
  if (pageMode === 'settings') {
    await initSettingsWindow();
  } else {
    restoreWorkspaceSplit();
    restoreRemoteExampleSplit();
    announceActivePage();
    setPreviewMode('empty');
    setActiveTab(state.activeTab, { autoSelect: false });
    await loadSettings();
    if (!state.domainProjectsInitialized) {
      hideStartupBlocker();
      await ensureDomainProjectInitialized();
    }
    await refresh();
    hideStartupBlocker();
    await refreshAdbProxyStatus();
    connectAppEvents();
    connectAdbDeviceTracker();
    checkForUpdates();
    scheduleAdbStatusPolling();
    scheduleRefresh();
  }
} catch (error) {
  console.error(error);
  showStartupError(error);
}

async function initSettingsWindow() {
  document.body.classList.add('settings-window-mode');
  els.settingsDialog?.setAttribute('open', '');
  const result = await getJson('/api/settings');
  state.captureMergeEnabled = result.settings?.captureMergeEnabled !== false;
  state.captureTreeViewEnabled = result.settings?.captureTreeViewEnabled === true;
  state.aiNotesEnabled = result.settings?.aiNotesEnabled !== false;
  state.showListNotes = result.settings?.showListNotes !== false;
  state.maxRecentRequests = normalizeMaxRecentRequests(result.settings?.maxRecentRequests);
  state.language = normalizeLanguage(result.settings?.language);
  state.appearance = normalizeAppearance(result.settings?.appearance);
  applyAppearance();
  applyLanguage({ staticOnly: true });
  syncSettingsDialogControls();
  els.showListNotes.checked = state.showListNotes;
  if (els.aiNotesEnabled) els.aiNotesEnabled.checked = state.aiNotesEnabled !== false;
  hideStartupBlocker();
}

function setupInstantTooltips() {
  convertTitleToInstantTooltip(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        convertTitleToInstantTooltip(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        convertTitleToInstantTooltip(node);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title']
  });
}

function normalizeLanguage(value) {
  const language = String(value || 'zh-CN');
  return supportedLanguages.has(language) ? language : 'zh-CN';
}

function normalizeAppearance(value) {
  const appearance = String(value || 'system');
  return supportedAppearances.has(appearance) ? appearance : 'system';
}

function normalizeMaxRecentRequests(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return maxRecentRequestsDefault;
  return Math.min(maxRecentRequestsMax, Math.max(maxRecentRequestsMin, number));
}

function t(key, vars = {}) {
  const language = normalizeLanguage(state.language);
  const template = translations[language]?.[key] ?? translations.en?.[key] ?? translations['zh-CN']?.[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => {
    return Object.hasOwn(vars, name) ? String(vars[name]) : match;
  });
}

function applyLanguage(options = {}) {
  state.language = normalizeLanguage(state.language);
  document.documentElement.lang = state.language;
  document.documentElement.dir = rtlLanguages.has(state.language) ? 'rtl' : 'ltr';
  applyStaticTranslations(document);
  if (els.languageSelect && els.languageSelect.value !== state.language) {
    els.languageSelect.value = state.language;
  }
  if (options.staticOnly) {
    refreshEditorTitle();
    return;
  }
  renderAiSelector();
  renderProxyStatus();
  updateCaCertTooltip();
  renderCaptureViewModeButton();
  renderAdbProxyActions();
  maybeShowAdbProxyGuide();
  renderProjectPath();
  if (state.domainDialogMode) {
    renderDomainProjectDialog(state.domainDialogMode);
  }
  renderGlobalSearchScope();
  renderGlobalSearchResults();
  renderDetailNoteButton();
  renderSelectedRemoteRuleEditor();
  renderCurrentCaptureOverview();
  state.captureRenderSignature = '';
  renderCaptures();
  renderRules();
  renderRemoteRules();
  refreshEditorTitle();
}

function renderCurrentCaptureOverview() {
  if (!state.previewOverview) return;
  renderCaptureOverview(state.previewOverview);
}

function applyAppearance() {
  state.appearance = normalizeAppearance(state.appearance);
  if (state.appearance === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = state.appearance;
  }
  if (els.appearanceSelect && els.appearanceSelect.value !== state.appearance) {
    els.appearanceSelect.value = state.appearance;
  }
  applyTerminalTheme();
}

function applyStaticTranslations(root = document) {
  root.querySelectorAll?.('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll?.('[data-i18n-attrs]').forEach((element) => {
    for (const pair of String(element.dataset.i18nAttrs || '').split(';')) {
      const [rawAttr, rawKey] = pair.split(':');
      const attr = String(rawAttr || '').trim();
      const key = String(rawKey || '').trim();
      if (!attr || !key) continue;
      const value = t(key);
      if (attr === 'title') {
        setInstantTooltip(element, value);
      } else {
        element.setAttribute(attr, value);
      }
    }
  });
}

async function toggleTerminalPanel() {
  const terminalState = ensureActiveTerminalState();
  if (terminalState.open) {
    closeTerminalPanel();
    return;
  }
  await openTerminalPanel();
}

async function openTerminalPanel() {
  rememberWorkspaceFocus('terminal');
  const terminalState = ensureActiveTerminalState();
  terminalState.open = true;
  ensureTerminalTabsForState(terminalState);
  applyTerminalPanelState();
  renderTerminalTabs();
  scheduleSettingsSave();
  const instance = await ensureTerminalForActiveProject();
  fitTerminal(instance);
  activeTerminalInstance?.xterm?.focus();
}

function closeTerminalPanel() {
  const terminalState = ensureActiveTerminalState();
  terminalState.open = false;
  applyTerminalPanelState();
  renderTerminalTabs();
  scheduleSettingsSave();
}

function applyTerminalPanelState() {
  const terminalState = ensureActiveTerminalState();
  const open = Boolean(terminalState.open);
  document.querySelector('.app-body')?.classList.toggle('terminal-open', open);
  if (els.terminalResizer) els.terminalResizer.hidden = !open;
  if (els.terminalPanel) els.terminalPanel.hidden = !open;
  els.terminalToggleBtn?.classList.toggle('active', open);
  els.terminalToggleBtn?.setAttribute('aria-label', open ? '关闭内嵌终端' : '打开内嵌终端');
  els.terminalToggleBtn?.setAttribute('title', open ? '关闭内嵌终端' : '打开内嵌终端');
  if (open) {
    restoreTerminalHeight();
    renderTerminalTabs();
  } else {
    activeTerminalInstance = null;
    hideAllTerminalInstances();
  }
}

function rememberWorkspaceFocus(kind) {
  if (kind !== 'terminal' && kind !== 'preview') return;
  state.lastWorkspaceFocus = kind;
}

function focusTerminalTabs() {
  if (els.terminalTabs && !els.terminalTabs.hidden && els.terminalTabs.offsetParent !== null) {
    revealActiveTerminalTab();
    els.terminalTabs.focus({ preventScroll: true });
  }
}

function restoreTerminalTabFocus() {
  rememberWorkspaceFocus('terminal');
  window.requestAnimationFrame(() => {
    focusTerminalTabs();
  });
}

function ensureActiveTerminalState() {
  const tab = activeCaptureTab();
  if (!tab) {
    return { open: false, activeId: '', tabs: [] };
  }
  tab.terminal = normalizeTerminalState(tab.terminal);
  return tab.terminal;
}

function normalizeTerminalState(value = {}) {
  const rawTabs = Array.isArray(value?.tabs) ? value.tabs : [];
  let tabs = rawTabs.map((item, index) => ({
    id: String(item?.id || '').trim(),
    name: String(item?.name || '').trim() || defaultTerminalName(index)
  })).filter((item) => item.id);
  const activeId = String(value?.activeId || '').trim();
  if (!tabs.length && (value?.open === true || activeId)) {
    tabs = [createTerminalTabDescriptor(0)];
  }
  const nextActiveId = tabs.some((item) => item.id === activeId) ? activeId : tabs[0]?.id || '';
  return {
    open: value?.open === true,
    activeId: nextActiveId,
    tabs
  };
}

function ensureTerminalTabsForState(terminalState = ensureActiveTerminalState()) {
  if (!terminalState.tabs.length) {
    const tab = createTerminalTabDescriptor(0);
    terminalState.tabs = [tab];
    terminalState.activeId = tab.id;
  }
  terminalState.tabs = terminalState.tabs.slice(0, 12);
  if (!terminalState.tabs.some((item) => item.id === terminalState.activeId)) {
    terminalState.activeId = terminalState.tabs[0]?.id || '';
  }
  return terminalState.tabs;
}

function createTerminalTabDescriptor(index = 0) {
  return {
    id: createId('terminal-tab'),
    name: defaultTerminalName(index)
  };
}

function defaultTerminalName(index = 0) {
  return index > 0 ? `本地 (${index + 1})` : '本地';
}

function moveItemBeforeId(items, sourceId, targetId) {
  if (!Array.isArray(items) || !sourceId || !targetId || sourceId === targetId) return false;
  const sourceIndex = items.findIndex((item) => item?.id === sourceId);
  const targetIndex = items.findIndex((item) => item?.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return false;
  const [item] = items.splice(sourceIndex, 1);
  const nextTargetIndex = items.findIndex((candidate) => candidate?.id === targetId);
  items.splice(nextTargetIndex < 0 ? items.length : nextTargetIndex, 0, item);
  return true;
}

function clearTabDropTargets(container, selector) {
  container?.querySelectorAll?.(`${selector}.is-drop-target`).forEach((item) => {
    item.classList.remove('is-drop-target');
  });
}

function revealTabInScrollContainer(container, tabElement, padding = 8) {
  if (!container || !tabElement || container.hidden || container.offsetParent === null) return false;
  const tabRect = tabElement.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (tabRect.left < containerRect.left + padding) {
    container.scrollLeft = Math.max(0, container.scrollLeft - (containerRect.left + padding - tabRect.left));
    return true;
  }
  if (tabRect.right > containerRect.right - padding) {
    container.scrollLeft = Math.max(0, container.scrollLeft + (tabRect.right - (containerRect.right - padding)));
    return true;
  }
  return false;
}

function renderTerminalTabs() {
  if (!els.terminalTabs) return;
  const terminalState = ensureActiveTerminalState();
  ensureTerminalTabsForState(terminalState);
  els.terminalTabs.innerHTML = '';
  for (const terminalTab of terminalState.tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `terminal-tab${terminalTab.id === terminalState.activeId ? ' active' : ''}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', terminalTab.id === terminalState.activeId ? 'true' : 'false');
    button.draggable = true;
    button.dataset.terminalTabId = terminalTab.id;
    if (terminalRenamingTabId === terminalTab.id) {
      button.innerHTML = `
        <input class="terminal-tab-rename" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(terminalTab.name)}" aria-label="重命名终端">
        <span class="terminal-tab-close" role="button" tabindex="-1" aria-label="关闭终端">×</span>
      `;
      const input = button.querySelector('.terminal-tab-rename');
      input?.addEventListener('click', (event) => event.stopPropagation());
      input?.addEventListener('dblclick', (event) => event.stopPropagation());
      input?.addEventListener('pointerdown', (event) => event.stopPropagation());
      input?.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commitTerminalTabRename(terminalTab.id, input.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelTerminalTabRename();
        }
      });
      input?.addEventListener('blur', () => commitTerminalTabRename(terminalTab.id, input.value));
      window.requestAnimationFrame(() => {
        if (terminalRenamingTabId !== terminalTab.id) return;
        input?.focus();
        input?.select();
      });
    } else {
      button.innerHTML = `
        <span class="terminal-tab-name">${escapeHtml(terminalTab.name)}</span>
        <span class="terminal-tab-close" role="button" tabindex="-1" aria-label="关闭终端">×</span>
      `;
    }
    button.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.terminal-tab-close, .terminal-tab-rename')) return;
      if (event.button === 2) closeItemContextMenu();
    });
    button.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.terminal-tab-close, .terminal-tab-rename')) return;
      showItemContextMenu(event, [{
        label: t('terminal.rename'),
        run: () => renameTerminalTab(terminalTab.id)
      }]);
    });
    button.addEventListener('click', (event) => {
      if (suppressTerminalTabClick) {
        event.preventDefault();
        suppressTerminalTabClick = false;
        return;
      }
      if (event.target.closest('.terminal-tab-rename')) return;
      if (event.target.closest('.terminal-tab-close')) {
        closeTerminalTab(terminalTab.id);
        return;
      }
      selectTerminalTab(terminalTab.id);
    });
    button.addEventListener('dragstart', (event) => {
      if (event.target.closest('.terminal-tab-close, .terminal-tab-rename')) {
        event.preventDefault();
        return;
      }
      draggedTerminalTabId = terminalTab.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', terminalTab.id);
      button.classList.add('is-dragging');
    });
    button.addEventListener('dragover', (event) => {
      if (!draggedTerminalTabId || draggedTerminalTabId === terminalTab.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearTabDropTargets(els.terminalTabs, '.terminal-tab');
      button.classList.add('is-drop-target');
    });
    button.addEventListener('dragleave', () => {
      button.classList.remove('is-drop-target');
    });
    button.addEventListener('drop', (event) => {
      if (!draggedTerminalTabId || draggedTerminalTabId === terminalTab.id) return;
      event.preventDefault();
      const moved = reorderTerminalTab(draggedTerminalTabId, terminalTab.id);
      suppressTerminalTabClick = moved;
      draggedTerminalTabId = '';
      clearTabDropTargets(els.terminalTabs, '.terminal-tab');
      window.setTimeout(() => {
        suppressTerminalTabClick = false;
      }, 0);
    });
    button.addEventListener('dragend', () => {
      draggedTerminalTabId = '';
      button.classList.remove('is-dragging');
      clearTabDropTargets(els.terminalTabs, '.terminal-tab');
      window.setTimeout(() => {
        suppressTerminalTabClick = false;
      }, 0);
    });
    els.terminalTabs.append(button);
  }
  scheduleRevealActiveTerminalTab();
}

function scheduleRevealActiveTerminalTab() {
  window.cancelAnimationFrame(terminalTabRevealFrame);
  terminalTabRevealFrame = window.requestAnimationFrame(() => {
    revealActiveTerminalTab();
    terminalTabRevealFrame = window.requestAnimationFrame(() => {
      terminalTabRevealFrame = 0;
      revealActiveTerminalTab();
    });
  });
}

function revealActiveTerminalTab() {
  const terminalState = ensureActiveTerminalState();
  const activeTab = terminalState.activeId
    ? els.terminalTabs?.querySelector?.(`.terminal-tab[data-terminal-tab-id="${cssEscape(terminalState.activeId)}"]`)
    : els.terminalTabs?.querySelector?.('.terminal-tab.active');
  return revealTabInScrollContainer(els.terminalTabs, activeTab, 8);
}

function reorderTerminalTab(sourceId, targetId) {
  const terminalState = ensureActiveTerminalState();
  const moved = moveItemBeforeId(terminalState.tabs, sourceId, targetId);
  if (!moved) return false;
  renderTerminalTabs();
  scheduleSettingsSave();
  restoreTerminalTabFocus();
  return true;
}

async function addTerminalTab(options = {}) {
  rememberWorkspaceFocus('terminal');
  const terminalState = ensureActiveTerminalState();
  if (terminalState.tabs.length >= 12) return;
  const tab = createTerminalTabDescriptor(terminalState.tabs.length);
  if (options.name) {
    tab.name = String(options.name || '').trim().slice(0, 40) || tab.name;
  }
  terminalState.tabs.push(tab);
  terminalState.activeId = tab.id;
  terminalState.open = true;
  applyTerminalPanelState();
  renderTerminalTabs();
  scheduleSettingsSave();
  const instance = await ensureTerminalForActiveProject({
    reset: Boolean(options.reset),
    initialInput: options.initialInput
  });
  if (options.initialInput) {
    writeTerminalInputWhenReady(instance, options.initialInput);
  }
  activeTerminalInstance?.xterm?.focus();
  return tab;
}

async function askAiAboutCurrentCapture() {
  if (!shouldShowAskAiButton()) return;
  const projectPath = currentProjectPath();
  if (!projectPath) {
    window.alert(t('ai.askNoProject'));
    return;
  }
  const previousText = els.askAiBtn.textContent;
  els.askAiBtn.disabled = true;
  els.askAiBtn.textContent = t('common.running');
  try {
    const capture = await ensureSelectedCaptureDetailForAi();
    if (!capture) return;
    const result = await postJson('/api/ai/terminal-session', {
      provider: state.aiProvider,
      projectPath,
      prompt: buildAskAiPrompt(capture, projectPath)
    });
    await addTerminalTab({
      name: t('ai.ask'),
      initialInput: `${result.command}\r`,
      reset: true
    });
  } catch (error) {
    console.error(error);
    window.alert(error.message || t('ai.askFailed'));
  } finally {
    els.askAiBtn.textContent = previousText || t('ai.ask');
    renderAskAiButton();
  }
}

async function ensureSelectedCaptureDetailForAi() {
  const captureId = state.selectedCaptureId;
  if (!captureId) return null;
  if (state.selectedCaptureDetail?.id === captureId) return state.selectedCaptureDetail;
  const detail = await getCaptureDetail(captureId);
  if (state.selectedCaptureId === captureId) {
    state.selectedCaptureDetail = detail;
  }
  return detail;
}

function buildAskAiPrompt(capture, projectPath) {
  const requestBody = requestBodyText(capture.requestBody);
  const responseBody = capture.proxyError
    ? proxyErrorPreviewText(capture)
    : capture.editable
      ? String(capture.body || '')
      : String(capture.note || '');
  const payload = {
    projectPath,
    request: {
      id: capture.id,
      method: capture.method,
      url: capture.url || buildUrl(capture, { includeQuery: true }),
      protocol: capture.protocol,
      host: capture.host,
      port: capture.port,
      path: capture.path,
      query: capture.query || '',
      headers: capture.requestHeaders || {},
      body: requestBody,
      bodySize: Number(capture.requestBodySize || requestBody.length || 0)
    },
    response: {
      statusCode: capture.statusCode,
      statusMessage: capture.statusMessage || '',
      headers: capture.responseHeaders || {},
      contentType: capture.contentType || '',
      body: responseBody,
      bodySize: Number(capture.bodySize || responseBody.length || 0),
      proxyError: capture.proxyError || ''
    },
    note: apiNoteText(capture),
    detailNote: detailNoteTextForKey(apiNoteKey(capture)),
    curl: buildCurl({
      method: capture.method,
      url: capture.url || buildUrl(capture, { includeQuery: true }),
      headers: capture.requestHeaders,
      body: requestBody
    })
  };
  return [
    '你正在 HttpMocker 中协助分析一个接口请求。',
    '请先结合当前本地工程目录阅读代码，判断这个接口的用途、调用位置、关键参数含义，以及响应字段可能对应的业务含义。',
    '回答时优先给出可验证的代码依据；如果无法从代码确认，请明确说明是基于 URL、参数或响应内容的推断。',
    '之后用户会继续在这个终端里追问，请保持上下文。',
    '',
    '接口与工程信息如下：',
    JSON.stringify(payload, null, 2)
  ].join('\n');
}

async function selectTerminalTab(tabId) {
  rememberWorkspaceFocus('terminal');
  const terminalState = ensureActiveTerminalState();
  if (!terminalState.tabs.some((item) => item.id === tabId)) return;
  terminalState.activeId = tabId;
  terminalState.open = true;
  applyTerminalPanelState();
  renderTerminalTabs();
  scheduleSettingsSave();
  await ensureTerminalForActiveProject();
  activeTerminalInstance?.xterm?.focus();
}

function renameTerminalTab(tabId) {
  const terminalState = ensureActiveTerminalState();
  const terminalTab = terminalState.tabs.find((item) => item.id === tabId);
  if (!terminalTab) return;
  terminalRenamingTabId = tabId;
  renderTerminalTabs();
}

function commitTerminalTabRename(tabId, value) {
  if (terminalRenamingTabId !== tabId) return;
  const terminalState = ensureActiveTerminalState();
  const terminalTab = terminalState.tabs.find((item) => item.id === tabId);
  if (!terminalTab) {
    cancelTerminalTabRename();
    return;
  }
  const normalized = String(value || '').trim();
  terminalRenamingTabId = '';
  if (!normalized) {
    renderTerminalTabs();
    return;
  }
  terminalTab.name = normalized.slice(0, 40);
  renderTerminalTabs();
  scheduleSettingsSave();
}

function cancelTerminalTabRename() {
  if (!terminalRenamingTabId) return;
  terminalRenamingTabId = '';
  renderTerminalTabs();
}

async function closeTerminalTab(tabId) {
  rememberWorkspaceFocus('terminal');
  const terminalState = ensureActiveTerminalState();
  const index = terminalState.tabs.findIndex((item) => item.id === tabId);
  if (index < 0) return;
  if (terminalRenamingTabId === tabId) terminalRenamingTabId = '';
  disposeTerminalInstance(terminalInstanceKey(tabId));
  terminalState.tabs.splice(index, 1);
  if (!terminalState.tabs.length) {
    terminalState.open = false;
    terminalState.activeId = '';
    applyTerminalPanelState();
    renderTerminalTabs();
    scheduleSettingsSave();
    window.requestAnimationFrame(() => {
      els.terminalToggleBtn?.focus({ preventScroll: true });
    });
    return;
  }
  if (terminalState.activeId === tabId) {
    terminalState.activeId = terminalState.tabs[Math.min(index, terminalState.tabs.length - 1)]?.id || '';
  }
  applyTerminalPanelState();
  renderTerminalTabs();
  scheduleSettingsSave();
  if (terminalState.open) {
    await ensureTerminalForActiveProject();
    restoreTerminalTabFocus();
  }
}

function hideAllTerminalInstances() {
  for (const item of terminalInstances.values()) {
    item.container.hidden = true;
  }
}

function activeTerminalTabId() {
  const terminalState = ensureActiveTerminalState();
  ensureTerminalTabsForState(terminalState);
  return terminalState.activeId;
}

function terminalInstanceKey(terminalTabId = activeTerminalTabId()) {
  return `${activeTerminalProjectKey()}-terminal-${stableTerminalHash(terminalTabId || 'default')}`;
}

function activeTerminalProjectKey() {
  const tab = activeCaptureTab();
  const tabIdentity = stableTerminalHash(terminalProjectIdentity(tab));
  const projectPath = String(tab?.projectPath || '').trim();
  const cwdIdentity = projectPath ? stableTerminalHash(projectPath) : 'no-cwd';
  return `project-${tabIdentity}-${cwdIdentity}`;
}

function disposeTerminalInstancesForProject(projectKey) {
  for (const key of [...terminalInstances.keys()]) {
    if (key.startsWith(`${projectKey}-terminal-`)) {
      disposeTerminalInstance(key);
    }
  }
}

function disposeTerminalInstancesForCaptureTab(tab) {
  const projectPath = String(tab?.projectPath || '').trim();
  const tabIdentity = stableTerminalHash(terminalProjectIdentity(tab));
  const cwdIdentity = projectPath ? stableTerminalHash(projectPath) : 'no-cwd';
  disposeTerminalInstancesForProject(`project-${tabIdentity}-${cwdIdentity}`);
}

function updateTerminalAfterProjectSwitch(options = {}) {
  applyTerminalPanelState();
  const terminalState = ensureActiveTerminalState();
  if (!terminalState.open) return;
  ensureTerminalForActiveProject().then((instance) => {
    fitTerminal(instance);
    if (options.focus === true && !isTextEntryElement(document.activeElement)) {
      instance?.xterm?.focus();
    }
  }).catch((error) => {
    console.error(error);
  });
}

function updateTerminalAfterProjectPathChange(previousProjectKey) {
  disposeTerminalInstancesForProject(previousProjectKey);
  updateTerminalAfterProjectSwitch();
}

async function ensureTerminalForActiveProject(options = {}) {
  const terminalState = ensureActiveTerminalState();
  if (!terminalState.open && !options.force) return null;
  ensureTerminalTabsForState(terminalState);
  const key = activeTerminalKey();
  if (!els.terminalXterm) return null;
  if (options.reset) {
    disposeTerminalInstance(key);
  }
  let instance = terminalInstances.get(key);
  if (!instance) {
    instance = await createTerminalInstance(key);
    terminalInstances.set(key, instance);
  }
  activateTerminalInstance(instance);
  connectTerminalSocket(instance, options);
  renderTerminalTabs();
  return instance;
}

/*
 * Legacy callers use this name, but the key now identifies the active
 * terminal tab inside the active project.
 */
function activeTerminalKey() {
  return terminalInstanceKey();
}

async function terminalModules() {
  terminalModulesPromise ||= Promise.all([
    import('/vendor/xterm/lib/xterm.mjs'),
    import('/vendor/xterm-addon-fit/lib/addon-fit.mjs')
  ]);
  const [{ Terminal }, { FitAddon }] = await terminalModulesPromise;
  return { Terminal, FitAddon };
}

async function createTerminalInstance(key) {
  const { Terminal, FitAddon } = await terminalModules();
  const container = document.createElement('div');
  container.className = 'terminal-xterm-instance';
  container.hidden = true;
  els.terminalXterm.appendChild(container);

  const xterm = new Terminal({
    allowProposedApi: false,
    cursorBlink: true,
    convertEol: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.35,
    fastScrollSensitivity: 2,
    scrollSensitivity: 0.9,
    scrollback: 5000,
    smoothScrollDuration: 160,
    theme: terminalTheme()
  });
  const fitAddon = new FitAddon();
  const instance = {
    key,
    cwd: activeTerminalCwd(),
    container,
    xterm,
    fitAddon,
    socket: null,
    ready: false,
    pendingInput: ''
  };
  xterm.loadAddon(fitAddon);
  xterm.open(container);
  installTerminalOverscan(instance);
  installTerminalSmoothWheel(instance);
  installTerminalScrollOffset(instance);
  xterm.onData((data) => {
    if (instance.socket?.readyState === WebSocket.OPEN) {
      instance.socket.send(JSON.stringify({ type: 'input', data }));
    }
  });
  return instance;
}

function installTerminalOverscan(instance) {
  const screen = instance?.container?.querySelector?.('.xterm-screen');
  if (!screen) return;
  const top = document.createElement('div');
  const bottom = document.createElement('div');
  top.className = 'xterm-rows terminal-overscan-line terminal-overscan-top';
  bottom.className = 'xterm-rows terminal-overscan-line terminal-overscan-bottom';
  top.setAttribute('aria-hidden', 'true');
  bottom.setAttribute('aria-hidden', 'true');
  screen.append(top, bottom);
  instance.terminalOverscanTop = top;
  instance.terminalOverscanBottom = bottom;
  instance.terminalRenderedViewportY = terminalCurrentViewportY(instance);
  instance.terminalOverscanDisposables = [
    instance.xterm?.onRender?.(() => handleTerminalRowsRendered(instance)),
    instance.xterm?.onResize?.(() => handleTerminalRowsRendered(instance))
  ].filter(Boolean);
  updateTerminalOverscan(instance, instance.terminalRenderedViewportY);
}

function handleTerminalRowsRendered(instance) {
  instance.terminalRenderedViewportY = terminalCurrentViewportY(instance);
  const overscan = updateTerminalOverscan(instance, instance.terminalRenderedViewportY);
  if (instance.terminalLastScrollEvent?.inSmoothScrolling) {
    syncTerminalScrollOffset(instance, instance.terminalLastScrollEvent, { overscan });
  }
}

function updateTerminalOverscan(instance, renderedViewportY = null) {
  const xterm = instance?.xterm;
  const activeBuffer = xterm?.buffer?.active;
  const internalBuffer = xterm?._core?._bufferService?.buffer;
  const renderer = terminalDomRenderer(xterm);
  const top = instance?.terminalOverscanTop;
  const bottom = instance?.terminalOverscanBottom;
  const screen = instance?.container?.querySelector?.('.xterm-screen');
  const cellHeight = xterm?._core?._renderService?.dimensions?.css?.cell?.height || 0;
  if (!xterm || !activeBuffer || !top || !bottom || !screen) {
    return { hasTop: false, hasBottom: false };
  }

  if (cellHeight) {
    screen.style.setProperty('--terminal-cell-height', `${cellHeight}px`);
  }
  const rowContainer = instance?.container?.querySelector?.('.xterm-rows:not(.terminal-overscan-line)');
  const rowLetterSpacing = renderer ? (rowContainer?.style?.letterSpacing || '') : '0px';
  top.style.letterSpacing = rowLetterSpacing;
  bottom.style.letterSpacing = rowLetterSpacing;

  const viewportY = Math.max(0, Number(renderedViewportY ?? internalBuffer?.ydisp ?? activeBuffer.viewportY ?? 0));
  const rows = Math.max(0, Number(xterm.rows || 0));
  const length = Math.max(0, Number(internalBuffer?.lines?.length ?? activeBuffer.length ?? 0));
  const bottomIndex = viewportY + rows;
  const hasTop = viewportY > 0;
  const hasBottom = bottomIndex < length;
  const useNativeRowRenderer = Boolean(renderer?._rowFactory?.createRow && renderer?._widthCache);
  const topLine = hasTop
    ? (useNativeRowRenderer ? internalBuffer?.lines?.get?.(viewportY - 1) : activeBuffer.getLine(viewportY - 1))
    : null;
  const bottomLine = hasBottom
    ? (useNativeRowRenderer ? internalBuffer?.lines?.get?.(bottomIndex) : activeBuffer.getLine(bottomIndex))
    : null;

  renderTerminalOverscanLine(top, topLine, xterm, viewportY - 1);
  renderTerminalOverscanLine(bottom, bottomLine, xterm, bottomIndex);
  top.hidden = !hasTop;
  bottom.hidden = !hasBottom;
  return { hasTop, hasBottom };
}

function terminalDomRenderer(xterm) {
  return xterm?._core?._renderService?._renderer?.value || null;
}

function terminalCurrentViewportY(instance) {
  const xterm = instance?.xterm;
  const viewportY = xterm?._core?._bufferService?.buffer?.ydisp ?? xterm?.buffer?.active?.viewportY ?? 0;
  return Math.max(0, Number(viewportY || 0));
}

function renderTerminalOverscanLine(target, line, xterm, rowIndex) {
  if (!target) return;
  target.replaceChildren();
  if (!line || !xterm) return;
  if (renderTerminalOverscanLineWithXterm(target, line, xterm, rowIndex)) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const cols = Math.min(Number(xterm.cols || 0), Number(line.length || 0));
  const cellWidth = xterm?._core?._renderService?.dimensions?.css?.cell?.width || 0;

  for (let index = 0; index < cols; index += 1) {
    const cell = line.getCell(index);
    const width = Number(cell?.getWidth?.() || 0);
    if (!cell || width === 0) continue;
    const style = terminalOverscanCellStyle(cell, xterm);
    const chars = terminalOverscanCellText(cell);
    if (!chars) continue;
    const span = document.createElement('span');
    span.className = style.className;
    const widthStyle = cellWidth ? `width:${cellWidth * width}px` : '';
    const styleText = [style.styleText, widthStyle].filter(Boolean).join(';');
    if (styleText) {
      span.setAttribute('style', styleText);
    }
    span.textContent = chars;
    fragment.appendChild(span);
  }

  target.appendChild(fragment);
}

function renderTerminalOverscanLineWithXterm(target, line, xterm, rowIndex) {
  const renderer = terminalDomRenderer(xterm);
  const rowFactory = renderer?._rowFactory;
  const widthCache = renderer?._widthCache;
  const cellWidth = renderer?.dimensions?.css?.cell?.width || 0;
  if (!rowFactory?.createRow || !widthCache || !cellWidth || typeof line?.getNoBgTrimmedLength !== 'function') {
    return false;
  }
  const cursorBlink = xterm?._core?.coreService?.decPrivateModes?.cursorBlink ?? xterm?.options?.cursorBlink;
  const cursorStyle = xterm?._core?.coreService?.decPrivateModes?.cursorStyle ?? xterm?.options?.cursorStyle;
  const cursorInactiveStyle = xterm?.options?.cursorInactiveStyle;
  const cursorX = Math.min(Number(xterm?._core?._bufferService?.buffer?.x ?? 0), Math.max(0, Number(xterm.cols || 1) - 1));
  target.replaceChildren(
    ...rowFactory.createRow(
      line,
      rowIndex,
      false,
      cursorStyle,
      cursorInactiveStyle,
      cursorX,
      cursorBlink,
      cellWidth,
      widthCache,
      -1,
      -1
    )
  );
  return true;
}

function terminalOverscanCellText(cell) {
  if (cell?.isInvisible?.()) return ' ';
  const chars = cell?.getChars?.() || ' ';
  if (chars === ' ' && (cell?.isUnderline?.() || cell?.isOverline?.())) {
    return '\xa0';
  }
  return chars;
}

function terminalOverscanCellStyle(cell, xterm) {
  const classes = [];
  const styles = [];
  if (cell?.isBold?.()) classes.push('xterm-bold');
  if (cell?.isItalic?.()) classes.push('xterm-italic');
  if (cell?.isDim?.()) classes.push('xterm-dim');
  if (cell?.isUnderline?.()) classes.push('xterm-underline-1');
  if (cell?.isOverline?.()) classes.push('xterm-overline');
  if (cell?.isStrikethrough?.()) classes.push('xterm-strikethrough');

  let fg = cell?.getFgColor?.() ?? -1;
  let bg = cell?.getBgColor?.() ?? -1;
  let fgMode = cell?.getFgColorMode?.() ?? 0;
  let bgMode = cell?.getBgColorMode?.() ?? 0;
  if (cell?.isInverse?.()) {
    const nextFg = bg;
    const nextFgMode = bgMode;
    bg = fg;
    bgMode = fgMode;
    fg = nextFg;
    fgMode = nextFgMode;
  }

  const drawBoldTextInBrightColors = xterm?.options?.drawBoldTextInBrightColors !== false;
  if (drawBoldTextInBrightColors && cell?.isBold?.() && (fgMode === 0x1000000 || fgMode === 0x2000000) && fg >= 0 && fg < 8) {
    fg += 8;
  }
  applyTerminalOverscanColor(classes, styles, 'fg', fg, fgMode, Boolean(cell?.isInverse?.()));
  applyTerminalOverscanColor(classes, styles, 'bg', bg, bgMode, Boolean(cell?.isInverse?.()));
  const className = classes.join(' ');
  const styleText = styles.join(';');
  return {
    className,
    styleText,
    key: `${className}|${styleText}`
  };
}

function applyTerminalOverscanColor(classes, styles, type, color, mode, inverse) {
  const isForeground = type === 'fg';
  if (mode === 0x1000000 || mode === 0x2000000) {
    if (Number.isFinite(color) && color >= 0) {
      classes.push(`xterm-${type}-${color}`);
    }
    return;
  }
  if (mode === 0x3000000) {
    const cssColor = terminalOverscanRgb(color);
    if (cssColor) {
      styles.push(`${isForeground ? 'color' : 'background-color'}:${cssColor}`);
    }
    return;
  }
  if (inverse) {
    classes.push(`xterm-${type}-257`);
  }
}

function terminalOverscanRgb(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return '';
  return `#${(normalized >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
}

function installTerminalSmoothWheel(instance) {
  const xterm = instance?.xterm;
  const container = instance?.container;
  if (!xterm || !container) return;
  const onWheel = (event) => {
    const viewport = xterm?._core?._viewport;
    const scrollableElement = viewport?._scrollableElement;
    const scrollable = scrollableElement?._scrollable;
    const renderService = xterm?._core?._renderService;
    const cellHeight = renderService?.dimensions?.css?.cell?.height || 0;
    const dimensions = scrollableElement?.getScrollDimensions?.();
    const futurePosition = scrollable?.getFutureScrollPosition?.() || scrollableElement?.getScrollPosition?.();
    if (!scrollableElement?.setScrollPosition || !dimensions || !futurePosition || !cellHeight) {
      return true;
    }

    const maxScrollTop = Math.max(0, (dimensions.scrollHeight || 0) - (dimensions.height || 0));
    if (maxScrollTop <= 0) return true;
    const delta = normalizedTerminalWheelDelta(event, cellHeight, dimensions.height || cellHeight * xterm.rows);
    if (!delta) return false;

    const fastMultiplier = event.altKey ? Number(xterm.options?.fastScrollSensitivity || 2) : 1;
    const nextScrollTop = Math.min(
      Math.max(futurePosition.scrollTop + delta * fastMultiplier * Number(xterm.options?.scrollSensitivity || 1), 0),
      maxScrollTop
    );
    if (nextScrollTop === futurePosition.scrollTop) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    scrollableElement.setScrollPosition({
      reuseAnimation: true,
      scrollTop: nextScrollTop
    });
    event.preventDefault();
    event.stopPropagation();
  };
  container.addEventListener('wheel', onWheel, { capture: true, passive: false });
  instance.terminalWheelDisposable = {
    dispose() {
      container.removeEventListener('wheel', onWheel, { capture: true });
    }
  };
}

function normalizedTerminalWheelDelta(event, lineHeight, pageHeight) {
  const deltaY = Number(event?.deltaY || 0);
  if (!deltaY) return 0;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return deltaY * lineHeight;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return deltaY * pageHeight;
  }
  return deltaY;
}

function installTerminalScrollOffset(instance) {
  const xterm = instance?.xterm;
  const viewport = xterm?._core?._viewport;
  const scrollableElement = viewport?._scrollableElement;
  if (!scrollableElement?.onScroll && !scrollableElement?.onWillScroll) return;
  instance.terminalWillScrollDisposable = scrollableElement.onWillScroll?.((event) => {
    syncTerminalScrollOffset(instance, event);
  });
  instance.terminalScrollDisposable = scrollableElement.onScroll?.((event) => {
    syncTerminalScrollOffset(instance, event);
  });
}

function syncTerminalScrollOffset(instance, event = null, options = {}) {
  const screen = instance?.container?.querySelector?.('.xterm-screen');
  const cellHeight = instance?.xterm?._core?._renderService?.dimensions?.css?.cell?.height || 0;
  const scrollTop = Number(event?.scrollTop || 0);
  if (event) {
    instance.terminalLastScrollEvent = {
      height: Number(event.height || 0),
      inSmoothScrolling: Boolean(event.inSmoothScrolling),
      scrollHeight: Number(event.scrollHeight || 0),
      scrollTop
    };
  }
  const renderedViewportY = Number.isFinite(instance?.terminalRenderedViewportY)
    ? Number(instance.terminalRenderedViewportY)
    : terminalCurrentViewportY(instance);
  const overscan = options.overscan || updateTerminalOverscan(instance, renderedViewportY);
  if (!screen || !cellHeight || !event?.inSmoothScrolling) {
    screen?.style?.setProperty?.('--terminal-scroll-offset-y', '0px');
    return;
  }
  const maxScrollTop = Math.max(0, Number(event.scrollHeight || 0) - Number(event.height || 0));
  if (scrollTop <= 0 || scrollTop >= maxScrollTop) {
    screen.style.setProperty('--terminal-scroll-offset-y', '0px');
    return;
  }
  const targetViewportY = Math.round(scrollTop / cellHeight);
  const viewportY = Math.abs(renderedViewportY - targetViewportY) <= 1 ? renderedViewportY : targetViewportY;
  let offset = Math.max(-cellHeight, Math.min(cellHeight, viewportY * cellHeight - scrollTop));
  if ((offset > 0 && !overscan.hasTop) || (offset < 0 && !overscan.hasBottom)) {
    offset = 0;
  }
  screen.style.setProperty('--terminal-scroll-offset-y', `${offset.toFixed(2)}px`);
}

function activateTerminalInstance(instance) {
  for (const item of terminalInstances.values()) {
    item.container.hidden = item !== instance;
  }
  activeTerminalInstance = instance;
  fitTerminal(instance);
}

function disposeTerminalInstance(key) {
  const instance = terminalInstances.get(key);
  if (!instance) return;
  instance.terminalWheelDisposable?.dispose?.();
  instance.terminalWheelDisposable = null;
  instance.terminalWillScrollDisposable?.dispose?.();
  instance.terminalWillScrollDisposable = null;
  instance.terminalScrollDisposable?.dispose?.();
  instance.terminalScrollDisposable = null;
  instance.terminalOverscanDisposables?.forEach((item) => item?.dispose?.());
  instance.terminalOverscanDisposables = null;
  instance.terminalOverscanTop = null;
  instance.terminalOverscanBottom = null;
  instance.socket?.close();
  instance.socket = null;
  instance.xterm?.dispose?.();
  instance.container?.remove?.();
  terminalInstances.delete(key);
  if (activeTerminalInstance === instance) activeTerminalInstance = null;
}

function connectTerminalSocket(instance, options = {}) {
  if (!options.reset && instance.socket && instance.socket.readyState <= WebSocket.OPEN) return;
  instance.socket?.close();
  instance.socket = null;
  instance.ready = false;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({
    id: instance.key
  });
  const cwd = instance.cwd || activeTerminalCwd();
  if (cwd) params.set('cwd', cwd);
  if (options.reset) params.set('reset', '1');
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/terminal/socket?${params}`);
  instance.socket = socket;
  socket.addEventListener('open', () => {
    instance.ready = true;
    if (activeTerminalInstance === instance) fitTerminal(instance);
    flushTerminalPendingInput(instance);
  });
  socket.addEventListener('message', (event) => {
    const message = parseTerminalMessage(event.data);
    if (!message) return;
    if (message.type === 'data') {
      instance.xterm?.write(String(message.data || ''));
    } else if (message.type === 'exit') {
      instance.ready = false;
    }
  });
  socket.addEventListener('close', () => {
    instance.ready = false;
    if (instance.socket === socket) instance.socket = null;
  });
}

function writeTerminalInputWhenReady(instance, input) {
  if (!instance || !input) return;
  instance.pendingInput = `${instance.pendingInput || ''}${input}`;
  flushTerminalPendingInput(instance);
}

function flushTerminalPendingInput(instance) {
  const input = instance?.pendingInput || '';
  if (!input || instance.socket?.readyState !== WebSocket.OPEN) return;
  instance.pendingInput = '';
  instance.socket.send(JSON.stringify({ type: 'input', data: input }));
}

function parseTerminalMessage(data) {
  try {
    return JSON.parse(String(data || ''));
  } catch {
    return null;
  }
}

function activeTerminalCwd() {
  return String(activeCaptureTab()?.projectPath || '').trim();
}

function terminalProjectIdentity(tab) {
  if (!tab) return 'default';
  const id = String(tab.id || '').trim();
  if (id) return `tab:${id}`;
  const domain = normalizeHostInput(tab.filter || '');
  if (domain) return `domain:${domain}`;
  return 'default';
}

function stableTerminalHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function syncTerminalForActiveProject(options = {}) {
  const terminalState = ensureActiveTerminalState();
  if (!terminalState.open && !options.force) {
    applyTerminalPanelState();
    return;
  }
  ensureTerminalForActiveProject(options).then((instance) => {
    fitTerminal(instance);
    instance?.xterm?.focus();
  }).catch((error) => {
    console.error(error);
  });
}

function terminalTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue('--code-bg').trim() || '#0d1117',
    foreground: style.getPropertyValue('--code-text').trim() || '#abb2bf',
    cursor: style.getPropertyValue('--code-text').trim() || '#abb2bf',
    selectionBackground: style.getPropertyValue('--surface-highlight').trim() || '#263b5f',
    scrollbarSliderBackground: 'rgba(154, 160, 166, 0)',
    scrollbarSliderHoverBackground: 'rgba(154, 160, 166, 0.42)',
    scrollbarSliderActiveBackground: 'rgba(154, 160, 166, 0.58)',
    black: '#000000',
    red: '#f7768e',
    green: '#73d36b',
    yellow: '#ffc66d',
    blue: '#6fa8ff',
    magenta: '#f7768e',
    cyan: '#45d6c9',
    white: '#d6dde7',
    brightBlack: '#5c6470',
    brightRed: '#ff7f95',
    brightGreen: '#80df75',
    brightYellow: '#ffd98a',
    brightBlue: '#7fb4ff',
    brightMagenta: '#ff8ba0',
    brightCyan: '#56e2d7',
    brightWhite: '#ffffff'
  };
}

function applyTerminalTheme() {
  if (!terminalInstances?.size) return;
  const theme = terminalTheme();
  for (const instance of terminalInstances.values()) {
    if (!instance?.xterm) continue;
    instance.xterm.options.theme = theme;
    updateTerminalOverscan(instance, terminalCurrentViewportY(instance));
  }
}

function fitTerminal(instance = activeTerminalInstance) {
  if (!ensureActiveTerminalState().open || !instance?.fitAddon || !instance?.xterm) return;
  window.clearTimeout(terminalResizeTimer);
  terminalResizeTimer = window.setTimeout(() => {
    instance.fitAddon.fit();
    if (instance.socket?.readyState === WebSocket.OPEN) {
      instance.socket.send(JSON.stringify({ type: 'resize', cols: instance.xterm.cols, rows: instance.xterm.rows }));
    }
  }, 0);
}

function blurActiveTerminal() {
  const xterm = activeTerminalInstance?.xterm;
  if (!xterm) return;
  if (typeof xterm.blur === 'function') {
    xterm.blur();
    return;
  }
  activeTerminalInstance?.container?.querySelector?.('textarea')?.blur?.();
}

function focusTerminalFromPanel(event) {
  if (event.target?.closest?.('#terminal-resizer')) return;
  rememberWorkspaceFocus('terminal');
  if (event.target?.closest?.('.terminal-tab-bar')) return;
  activeTerminalInstance?.xterm?.focus();
}

function handleWorkspacePointerDown(event) {
  const inTerminalTabBar = Boolean(event.target?.closest?.('.terminal-tab-bar'));
  const inTerminalBody = Boolean(event.target?.closest?.('.terminal-xterm'));
  if (!inTerminalTabBar && !inTerminalBody) {
    blurActiveTerminal();
  }
  if (inTerminalTabBar) {
    return;
  }
  if (event.target?.closest?.('#terminal-panel')) {
    rememberWorkspaceFocus('terminal');
    return;
  }
  if (event.target?.closest?.('.preview-panel')) {
    rememberWorkspaceFocus('preview');
    if (!isTextEntryElement(event.target) && !isSelectablePreviewTarget(event.target)) {
      window.requestAnimationFrame(() => {
        focusPreviewWorkspaceTabs();
      });
    }
  }
}

function isSelectablePreviewTarget(target) {
  return Boolean(target?.closest?.([
    '.code-preview',
    '.capture-overview',
    '.capture-query-preview',
    '.capture-diff-view',
    '.remote-example-diff',
    '#remote-example-preview',
    '.diff-body',
    '.diff-cell',
    '.diff-full-code'
  ].join(', ')));
}

function previewSelectableTextRoot(target) {
  if (!target || isTextEntryElement(target)) return null;
  if (target.closest?.('button, input, textarea, select, a, [role="button"], .json-fold-toggle, .capture-overview-caret')) return null;
  const root = target.closest?.([
    '.code-preview',
    '.capture-overview',
    '.capture-query-preview',
    '.capture-diff-view',
    '.remote-example-diff',
    '#remote-example-preview',
    '.diff-body',
    '.diff-cell',
    '.diff-full-code',
    '.remote-ai-output'
  ].join(', '));
  if (!root || root.hidden || root.offsetParent === null) return null;
  return root;
}

function handlePreviewTextSelectionPointerDown(event) {
  if (event.button !== 0 || event.detail > 1) return;
  const root = previewSelectableTextRoot(event.target);
  if (!root) return;
  const startRange = caretRangeFromViewportPoint(event.clientX, event.clientY, root);
  if (!startRange) return;
  previewTextSelectionDrag = {
    root,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startRange,
    selecting: false
  };
}

function handlePreviewTextSelectionPointerMove(event) {
  const drag = previewTextSelectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const distance = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
  if (!drag.selecting && distance < 4) return;
  const endRange = caretRangeFromViewportPoint(event.clientX, event.clientY, drag.root);
  if (!endRange) return;
  drag.selecting = true;
  selectBetweenCaretRanges(drag.startRange, endRange);
}

function stopPreviewTextSelectionDrag(event) {
  if (!previewTextSelectionDrag) return;
  if (event?.pointerId != null && previewTextSelectionDrag.pointerId !== event.pointerId) return;
  previewTextSelectionDrag = null;
}

function caretRangeFromViewportPoint(x, y, root) {
  let range = null;
  if (typeof document.caretRangeFromPoint === 'function') {
    range = document.caretRangeFromPoint(x, y);
  } else if (typeof document.caretPositionFromPoint === 'function') {
    const position = document.caretPositionFromPoint(x, y);
    if (position?.offsetNode) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }
  if (!range || !root.contains(range.startContainer)) return null;
  return range;
}

function selectBetweenCaretRanges(startRange, endRange) {
  if (!startRange || !endRange) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const comparison = startRange.compareBoundaryPoints(Range.START_TO_START, endRange);
  if (comparison <= 0) {
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.startContainer, endRange.startOffset);
  } else {
    range.setStart(endRange.startContainer, endRange.startOffset);
    range.setEnd(startRange.startContainer, startRange.startOffset);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function previewWorkspaceHistoryDeltaFromMouseEvent(event) {
  if (!event) return 0;
  const button = Number(event.button);
  const buttons = Number(event.buttons);
  if (button === 3 || (buttons & 8)) return -1;
  if (button === 4 || (buttons & 16)) return 1;
  return 0;
}

function browserHistoryDeltaFromKeyEvent(event) {
  const key = String(event.key || '').toLowerCase().replace(/[^a-z]/g, '');
  const code = String(event.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['browserback', 'browserbackward', 'back', 'goback'].includes(key) ||
      ['browserback', 'browserbackward', 'back', 'goback'].includes(code)) return -1;
  if (['browserforward', 'forward', 'goforward'].includes(key) ||
      ['browserforward', 'forward', 'goforward'].includes(code)) return 1;
  const isArrowLeft = event.key === 'ArrowLeft' || event.code === 'ArrowLeft';
  const isArrowRight = event.key === 'ArrowRight' || event.code === 'ArrowRight';
  if ((event.metaKey || event.altKey || event.ctrlKey) && !event.shiftKey && isArrowLeft) return -1;
  if ((event.metaKey || event.altKey || event.ctrlKey) && !event.shiftKey && isArrowRight) return 1;
  return 0;
}

function handlePreviewWorkspaceHistoryMouseEvent(event) {
  const delta = previewWorkspaceHistoryDeltaFromMouseEvent(event);
  if (!delta) return false;
  event.preventDefault();
  event.stopPropagation();
  const now = performance.now();
  if (lastPreviewWorkspaceMouseHistory.delta === delta && now - lastPreviewWorkspaceMouseHistory.at < 350) {
    return true;
  }
  lastPreviewWorkspaceMouseHistory = { at: now, delta };
  if (!shouldHandlePreviewWorkspaceHistoryShortcut(event.target, { global: true })) return true;
  switchPreviewWorkspaceTabHistory(delta);
  return true;
}

function handleTerminalKeydown(event) {
  const xterm = activeTerminalInstance?.xterm;
  if (!xterm || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
  const key = String(event.key || '').toLowerCase();
  if (key === 'a') {
    event.preventDefault();
    xterm.selectAll();
    return;
  }
  if (key === 'c' && xterm.hasSelection?.()) {
    event.preventDefault();
    writeClipboard(xterm.getSelection()).catch((error) => {
      console.error(error);
    });
  }
}

function restoreTerminalHeight() {
  const saved = Number(localStorage.getItem(terminalHeightStorageKey));
  setTerminalHeight(Number.isFinite(saved) && saved > 0 ? saved : terminalHeightDefault, { persist: false });
}

function terminalHeightBounds() {
  const bodyRect = document.querySelector('.app-body')?.getBoundingClientRect();
  const max = Math.max(terminalHeightMin, Math.floor((bodyRect?.height || window.innerHeight) * terminalHeightMaxRatio));
  return {
    min: terminalHeightMin,
    max
  };
}

function clampTerminalHeight(height) {
  const bounds = terminalHeightBounds();
  return Math.min(Math.max(Math.round(Number(height) || terminalHeightDefault), bounds.min), bounds.max);
}

function currentTerminalHeight() {
  const height = els.terminalPanel?.getBoundingClientRect().height;
  return Number.isFinite(height) && height > 0 ? height : terminalHeightDefault;
}

function setTerminalHeight(height, options = {}) {
  if (!els.terminalPanel) return;
  const nextHeight = clampTerminalHeight(height);
  els.terminalPanel.style.setProperty('--terminal-height', `${nextHeight}px`);
  els.terminalResizer?.setAttribute('aria-valuenow', String(nextHeight));
  if (options.persist !== false) {
    try {
      localStorage.setItem(terminalHeightStorageKey, String(nextHeight));
    } catch {
      // Layout still updates for the current session.
    }
  }
  fitTerminal(activeTerminalInstance);
}

function startTerminalResize(event) {
  if (!els.terminalPanel || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const startY = event.clientY;
  const startHeight = currentTerminalHeight();
  document.body.classList.add('resizing-terminal');
  els.terminalResizer?.setPointerCapture?.(event.pointerId);

  const onPointerMove = (moveEvent) => {
    setTerminalHeight(startHeight + startY - moveEvent.clientY);
  };
  const stopResize = () => {
    document.body.classList.remove('resizing-terminal');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
}

function handleTerminalResizeKeydown(event) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const delta = event.key === 'ArrowUp' ? 16 : -16;
  setTerminalHeight(currentTerminalHeight() + delta);
}

function restoreWorkspaceSplit() {
  const saved = Number(localStorage.getItem(workspaceSplitStorageKey));
  if (Number.isFinite(saved) && saved > 0) {
    setWorkspaceSplitWidth(saved, { persist: false });
  }
  window.requestAnimationFrame(clampWorkspaceSplit);
}

function workspaceSplitBounds() {
  const rect = els.workspace?.getBoundingClientRect();
  const resizerWidth = els.workspaceResizer?.getBoundingClientRect().width || 8;
  const total = rect?.width || 0;
  const max = Math.max(workspaceSplitMinSide, total - resizerWidth - workspaceSplitMinPreview);
  return {
    min: workspaceSplitMinSide,
    max,
    total,
    resizerWidth
  };
}

function clampWorkspaceSplitWidth(width) {
  const bounds = workspaceSplitBounds();
  if (!bounds.total || bounds.max <= bounds.min) return bounds.min;
  return Math.min(Math.max(width, bounds.min), bounds.max);
}

function setWorkspaceSplitWidth(width, options = {}) {
  if (!els.workspace) return;
  const bounds = workspaceSplitBounds();
  if (bounds.total && bounds.max <= bounds.min) {
    els.workspace.style.removeProperty('--side-panel-width');
    return;
  }
  const nextWidth = Math.round(clampWorkspaceSplitWidth(Number(width)));
  els.workspace.style.setProperty('--side-panel-width', `${nextWidth}px`);
  els.workspaceResizer?.setAttribute('aria-valuenow', String(nextWidth));
  if (options.persist !== false) {
    try {
      localStorage.setItem(workspaceSplitStorageKey, String(nextWidth));
    } catch {
      // Ignore localStorage failures; layout still updates for the current session.
    }
  }
}

function currentWorkspaceSplitWidth() {
  if (!els.workspace) return workspaceSplitMinSide;
  const styleValue = getComputedStyle(els.workspace).getPropertyValue('--side-panel-width');
  const parsedStyle = Number.parseFloat(styleValue);
  if (Number.isFinite(parsedStyle)) return parsedStyle;
  return els.workspace?.querySelector('.side-panel')?.getBoundingClientRect().width || workspaceSplitMinSide;
}

function clampWorkspaceSplit() {
  if (!els.workspace) return;
  setWorkspaceSplitWidth(currentWorkspaceSplitWidth(), { persist: false });
}

function startWorkspaceResize(event) {
  if (!els.workspace || event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = currentWorkspaceSplitWidth();
  document.body.classList.add('resizing-workspace');
  els.workspaceResizer?.setPointerCapture?.(event.pointerId);

  const onPointerMove = (moveEvent) => {
    setWorkspaceSplitWidth(startWidth + moveEvent.clientX - startX);
  };
  const stopResize = () => {
    document.body.classList.remove('resizing-workspace');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
}

function handleWorkspaceResizeKeydown(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const delta = event.key === 'ArrowRight' ? 24 : -24;
  setWorkspaceSplitWidth(currentWorkspaceSplitWidth() + delta);
}

function restoreRemoteExampleSplit() {
  const saved = Number(localStorage.getItem(remoteExampleSplitStorageKey));
  if (Number.isFinite(saved) && saved > 0) {
    setRemoteExampleSplitRatio(saved, { persist: false });
  } else {
    setRemoteExampleSplitRatio(state.remoteExampleSplitRatio, { persist: false });
  }
}

function setRemoteExampleSplitRatio(ratio, options = {}) {
  const nextRatio = Math.min(0.78, Math.max(0.22, Number(ratio) || state.remoteExampleSplitRatio));
  state.remoteExampleSplitRatio = nextRatio;
  const rounded = Math.round(nextRatio * 1000) / 1000;
  els.remoteRuleEditor?.style.setProperty('--remote-example-flex', String(rounded));
  els.remoteRuleEditor?.style.setProperty('--remote-editor-flex', String(Math.round((1 - nextRatio) * 1000) / 1000));
  if (options.persist !== false) {
    try {
      localStorage.setItem(remoteExampleSplitStorageKey, String(nextRatio));
    } catch {
      // Keep the current session layout even when localStorage is unavailable.
    }
  }
}

function remoteExampleSplitRatioForExampleHeight(exampleHeight) {
  const editorRect = currentRemoteUpperEditor()?.getBoundingClientRect();
  const lowerRect = els.remoteRuleLower?.getBoundingClientRect();
  const dividerRect = els.remoteExampleDivider?.getBoundingClientRect();
  const total = (editorRect?.height || 0) + (lowerRect?.height || 0) + (dividerRect?.height || 0);
  if (!total) return state.remoteExampleSplitRatio;
  const dividerHeight = dividerRect?.height || 0;
  const maxExampleHeight = Math.max(remoteExampleSplitMinExample, total - dividerHeight - remoteExampleSplitMinEditor);
  const nextExampleHeight = Math.min(Math.max(exampleHeight, remoteExampleSplitMinExample), maxExampleHeight);
  return nextExampleHeight / total;
}

function currentRemoteUpperEditor() {
  return [els.remoteDslEditor, els.remoteDslStepEditor, els.remoteAiEditor]
    .find((element) => element && !element.hidden) || null;
}

function startRemoteExampleResize(event) {
  if (!els.remoteRuleEditor || event.button !== 0) return;
  event.preventDefault();
  const lowerRect = els.remoteRuleLower?.getBoundingClientRect();
  const startY = event.clientY;
  const startExampleHeight = lowerRect?.height || 0;
  document.body.classList.add('resizing-remote-example');
  els.remoteExampleDivider?.setPointerCapture?.(event.pointerId);

  const onPointerMove = (moveEvent) => {
    setRemoteExampleSplitRatio(remoteExampleSplitRatioForExampleHeight(startExampleHeight + startY - moveEvent.clientY));
  };
  const stopResize = () => {
    document.body.classList.remove('resizing-remote-example');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
}

function updateCaCertTooltip(health = {}) {
  const port = health.uiPort || window.location.port || '';
  const host = Array.isArray(health.lanIps) && health.lanIps.length
    ? health.lanIps[0]
    : window.location.hostname;
  const address = port ? `http://${host}:${port}/ca.pem` : `${window.location.origin}/ca.pem`;
  setInstantTooltip(els.caCertLink, `${t('cert.download')}\n${address}`);
  els.caCertLink?.setAttribute('aria-label', `${t('cert.download')} ${address}`);
}

async function checkForUpdates(options = {}) {
  try {
    const query = options.force ? '?force=1' : '';
    state.updateInfo = await getJson(`/api/update${query}`);
    renderUpdateBanner();
    if (options.notify) {
      showUpdateCheckResult(state.updateInfo);
    }
  } catch (error) {
    console.debug('Update check failed:', error.message || error);
    state.updateInfo = null;
    renderUpdateBanner();
    if (options.notify) {
      showUpdateDialog({
        title: t('update.checkFailedTitle'),
        message: t('update.checkFailed'),
        actionLabel: t('actions.close')
      });
    }
  }
}

function showUpdateCheckResult(update = {}) {
  const url = update.releaseUrl || update.assetUrl || '';
  if (update.available === true && url) {
    const version = update.latestVersion || update.releaseName || '';
    showUpdateDialog({
      title: t('update.availableTitle'),
      message: t('update.dialogAvailable', { version }),
      actionLabel: t('update.openRelease'),
      cancelLabel: t('actions.cancel'),
      url
    });
    return;
  }
  if (update.error) {
    showUpdateDialog({
      title: t('update.checkFailedTitle'),
      message: t('update.checkFailed'),
      actionLabel: t('actions.close')
    });
    return;
  }
  showUpdateDialog({
    title: t('update.noUpdateTitle'),
    message: t('update.noUpdate'),
    actionLabel: t('actions.close')
  });
}

function showUpdateDialog(options = {}) {
  if (!els.updateDialog || !els.updateDialogTitle || !els.updateDialogMessage || !els.updateDialogActionBtn) {
    if (options.url) window.open(options.url, '_blank', 'noreferrer');
    return;
  }
  const hasUrl = Boolean(options.url);
  els.updateDialogTitle.textContent = options.title || '';
  els.updateDialogMessage.textContent = options.message || '';
  els.updateDialogActionBtn.textContent = options.actionLabel || t('actions.close');
  els.updateDialogActionBtn.dataset.url = hasUrl ? options.url : '';
  if (els.updateDialogCancelBtn) {
    els.updateDialogCancelBtn.textContent = options.cancelLabel || t('actions.cancel');
    els.updateDialogCancelBtn.hidden = !hasUrl;
  }
  if (typeof els.updateDialog.showModal === 'function') {
    if (!els.updateDialog.open) els.updateDialog.showModal();
  } else {
    els.updateDialog.setAttribute('open', '');
  }
}

function closeUpdateDialog() {
  if (typeof els.updateDialog?.close === 'function') {
    els.updateDialog.close();
  } else {
    els.updateDialog?.removeAttribute('open');
  }
}

function renderUpdateBanner() {
  if (!els.updateBanner) return;
  const update = state.updateInfo || {};
  const url = update.releaseUrl || update.assetUrl || '';
  if (update.available !== true || !url) {
    els.updateBanner.hidden = true;
    els.updateBanner.innerHTML = '';
    return;
  }
  const version = update.latestVersion || update.releaseName || '';
  els.updateBanner.innerHTML = `
    <span>${escapeHtml(t('update.available', { version }))}</span>
    <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(t('update.openRelease'))}</a>
  `;
  els.updateBanner.hidden = false;
}

function announceActivePage() {
  try {
    localStorage.setItem('httpMockerActivePage', JSON.stringify({
      id: state.pageInstanceId,
      at: Date.now()
    }));
  } catch {
    // Ignore storage failures; background pages still close connections on visibility changes.
  }
}

function handleCrossTabMessage(event) {
  if (event.key !== 'httpMockerActivePage' || !event.newValue) return;
  try {
    const message = JSON.parse(event.newValue);
    if (message?.id && message.id !== state.pageInstanceId) {
      closeBackgroundConnections();
    }
  } catch {
    // Ignore malformed cross-tab messages.
  }
}

function hideStartupBlocker() {
  if (els.startupBlocker) {
    els.startupBlocker.hidden = true;
  }
}

function showStartupError(error) {
  if (!els.startupBlocker) return;
  const message = error?.message || t('startup.errorMessage');
  els.startupBlocker.hidden = false;
  els.startupBlocker.innerHTML = `
    <div class="startup-card">
      <strong>${escapeHtml(t('startup.errorTitle'))}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function showNativeSplash() {
  window.location.assign('/_electron/show-splash');
}

function setActiveTab(tab, options = {}) {
  saveRemoteAiDraft();
  state.activeTab = tab;
  const isCaptures = tab === 'captures';
  const isRules = tab === 'rules';
  const isRemote = tab === 'remote';

  els.capturesTab.classList.toggle('active', isCaptures);
  els.rulesTab.classList.toggle('active', isRules);
  els.remoteRulesTab.classList.toggle('active', isRemote);
  els.capturesTab.setAttribute('aria-selected', String(isCaptures));
  els.rulesTab.setAttribute('aria-selected', String(isRules));
  els.remoteRulesTab.setAttribute('aria-selected', String(isRemote));
  els.capturesView.hidden = !isCaptures;
  els.rulesView.hidden = !isRules;
  els.remoteRulesView.hidden = !isRemote;
  if (options.focusList === true) {
    focusActiveSideList();
  }
  if (options.autoSelect !== false) {
    queueActiveTabSelectionFallback();
  }
}

function queueActiveTabSelectionFallback() {
  window.setTimeout(() => {
    selectFirstVisibleItemForActiveTab().catch((error) => {
      console.error(error);
    });
  }, 0);
}

function focusActiveSideList() {
  window.requestAnimationFrame(() => {
    const list = listElementForType(state.activeTab);
    if (!list || list.hidden || list.offsetParent === null) return;
    list.focus({ preventScroll: true });
    activeSideListItemForFocus(list)?.scrollIntoView({ block: 'nearest' });
  });
}

function activeSideListItemForFocus(list) {
  if (state.activeTab === 'captures' && state.captureTreeViewEnabled === true) {
    const focusedKey = captureTreeFocusedKey();
    if (focusedKey) {
      const focusedNode = list.querySelector(`.capture-tree-node[data-tree-key="${cssEscape(focusedKey)}"]`);
      if (focusedNode) return focusedNode;
    }
  }
  return list.querySelector('.tree-focused') ||
    list.querySelector('.active') ||
    list.querySelector('.capture[data-capture-id], .rule[data-rule-id]');
}

function livePreviewPane() {
  return els.previewPanel?.querySelector?.(':scope > .editor') || null;
}

function ensurePreviewPaneParkingLot() {
  if (previewPaneParkingLot?.isConnected) return previewPaneParkingLot;
  previewPaneParkingLot = document.querySelector('#preview-pane-parking-lot');
  if (!previewPaneParkingLot) {
    previewPaneParkingLot = document.createElement('div');
    previewPaneParkingLot.id = 'preview-pane-parking-lot';
    previewPaneParkingLot.hidden = true;
    previewPaneParkingLot.setAttribute('aria-hidden', 'true');
    previewPaneParkingLot.style.display = 'none';
    document.body.append(previewPaneParkingLot);
  }
  return previewPaneParkingLot;
}

function insertPreviewPaneIntoPanel(pane) {
  const panel = els.previewPanel;
  if (!pane || !panel) return false;
  pane.hidden = false;
  pane.removeAttribute('aria-hidden');
  const tabs = els.previewWorkspaceTabs;
  if (tabs?.parentElement === panel) {
    tabs.insertAdjacentElement('afterend', pane);
  } else {
    panel.append(pane);
  }
  return true;
}

function parkPreviewPaneNode(pane) {
  if (!pane) return;
  pane.hidden = true;
  pane.setAttribute('aria-hidden', 'true');
  ensurePreviewPaneParkingLot().append(pane);
}

function previewPaneCacheKey(tabId = state.activePreviewTabId) {
  const projectId = activeCaptureTab()?.id || 'default';
  return tabId ? `${projectId}::${tabId}` : '';
}

function snapshotPreviewPaneState() {
  return {
    previewMode: state.previewMode,
    previewBodyTab: state.previewBodyTab,
    previewTabs: Array.isArray(state.previewTabs) ? [...state.previewTabs] : [],
    previewShowsBodyTabs: state.previewShowsBodyTabs,
    previewOverview: state.previewOverview,
    previewRequestHead: state.previewRequestHead,
    previewResponseHead: state.previewResponseHead,
    previewResponse: state.previewResponse,
    previewRequest: state.previewRequest,
    previewFindOpen: state.previewFindOpen,
    previewFindQuery: state.previewFindQuery,
    previewFindMatches: Array.isArray(state.previewFindMatches) ? [...state.previewFindMatches] : [],
    previewFindIndex: state.previewFindIndex,
    selectedCaptureId: state.selectedCaptureId,
    selectedRuleId: state.selectedRuleId,
    selectedRemoteRuleId: state.selectedRemoteRuleId,
    selectedCaptureDetail: state.selectedCaptureDetail,
    remoteExampleTab: state.remoteExampleTab,
    remoteExample: state.remoteExample,
    remoteExampleScroll: { ...(state.remoteExampleScroll || {}) },
    remotePreviewRefreshing: state.remotePreviewRefreshing,
    remoteSteps: Array.isArray(state.remoteSteps) ? structuredCloneSafe(state.remoteSteps) : [],
    selectedDslStepId: state.selectedDslStepId,
    selectedAiStepId: state.selectedAiStepId,
    savedEditorState: state.savedEditorState ? { ...state.savedEditorState } : null,
    manualRuleSaveRequired: state.manualRuleSaveRequired,
    manualRuleSaveMessage: state.manualRuleSaveMessage,
    manualRuleSaveScope: state.manualRuleSaveScope,
    expandedRuleHitCaptures: new Set(state.expandedRuleHitCaptures || [])
  };
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to JSON for plain data.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function restorePreviewPaneState(snapshot = {}) {
  state.previewMode = snapshot.previewMode || 'empty';
  state.previewBodyTab = normalizePreviewBodyTab(snapshot.previewBodyTab);
  state.previewTabs = Array.isArray(snapshot.previewTabs) ? [...snapshot.previewTabs] : [];
  state.previewShowsBodyTabs = Boolean(snapshot.previewShowsBodyTabs);
  state.previewOverview = snapshot.previewOverview || null;
  state.previewRequestHead = snapshot.previewRequestHead || null;
  state.previewResponseHead = snapshot.previewResponseHead || null;
  state.previewResponse = snapshot.previewResponse || null;
  state.previewRequest = snapshot.previewRequest || null;
  state.previewFindOpen = Boolean(snapshot.previewFindOpen);
  state.previewFindQuery = String(snapshot.previewFindQuery || '');
  state.previewFindMatches = Array.isArray(snapshot.previewFindMatches) ? [...snapshot.previewFindMatches] : [];
  state.previewFindIndex = Number.isFinite(snapshot.previewFindIndex) ? snapshot.previewFindIndex : -1;
  state.selectedCaptureId = snapshot.selectedCaptureId || null;
  state.selectedRuleId = snapshot.selectedRuleId || null;
  state.selectedRemoteRuleId = snapshot.selectedRemoteRuleId || null;
  state.selectedCaptureDetail = snapshot.selectedCaptureDetail || null;
  state.remoteExampleTab = normalizeRemoteExampleTab(snapshot.remoteExampleTab);
  state.remoteExample = snapshot.remoteExample || null;
  state.remoteExampleScroll = { ...(snapshot.remoteExampleScroll || {}) };
  state.remotePreviewRefreshing = Boolean(snapshot.remotePreviewRefreshing);
  state.remoteSteps = Array.isArray(snapshot.remoteSteps) ? structuredCloneSafe(snapshot.remoteSteps) : [];
  state.selectedDslStepId = snapshot.selectedDslStepId || '';
  state.selectedAiStepId = snapshot.selectedAiStepId || '';
  state.savedEditorState = snapshot.savedEditorState ? { ...snapshot.savedEditorState } : null;
  state.manualRuleSaveRequired = Boolean(snapshot.manualRuleSaveRequired);
  state.manualRuleSaveMessage = String(snapshot.manualRuleSaveMessage || '');
  state.manualRuleSaveScope = String(snapshot.manualRuleSaveScope || '');
  state.expandedRuleHitCaptures = snapshot.expandedRuleHitCaptures instanceof Set
    ? new Set(snapshot.expandedRuleHitCaptures)
    : new Set();
  updatePreviewChrome();
}

function rebindPreviewPaneElements(root = livePreviewPane()) {
  if (!root) return;
  for (const [key, selector] of Object.entries(previewPaneSelectors)) {
    els[key] = root.querySelector(selector);
  }
}

function bindPreviewPaneEvents(root = livePreviewPane()) {
  if (!root || root.dataset.previewPaneBound === '1') return;
  root.dataset.previewPaneBound = '1';
  root.addEventListener('click', handlePreviewPaneClick);
  root.addEventListener('input', handlePreviewPaneInput);
  root.addEventListener('change', handlePreviewPaneChange);
  root.addEventListener('keydown', handlePreviewPaneKeydown);
  root.addEventListener('pointerdown', handlePreviewPanePointerDown);
  root.addEventListener('scroll', handlePreviewPaneScroll, true);
  root.addEventListener('focusout', handlePreviewPaneFocusOut);
  root.addEventListener('blur', handlePreviewPaneBlur, true);
}

function syncCurrentPreviewPaneCache() {
  if (!activePreviewPaneCacheKey) return;
  const pane = livePreviewPane();
  const cached = previewPaneCache.get(activePreviewPaneCacheKey);
  if (!pane || !cached || cached.node !== pane) return;
  cached.state = snapshotPreviewPaneState();
}

function parkActivePreviewPane() {
  const pane = livePreviewPane();
  const key = activePreviewPaneCacheKey || previewPaneCacheKey();
  if (!pane || !key) return;
  syncSelectedAiStepFromEditor();
  syncSelectedDslStepFromEditor();
  updateActivePreviewBodyFromEditor();
  rememberRemoteExampleScroll();
  previewPaneCache.set(key, {
    node: pane,
    state: snapshotPreviewPaneState()
  });
  parkPreviewPaneNode(pane);
  activePreviewPaneCacheKey = '';
}

async function preparePreviewPaneSwitch() {
  const currentTabId = state.activePreviewTabId;
  if (!currentTabId) return;
  await flushCurrentRuleAutoSaveSafely();
  if (state.activePreviewTabId !== currentTabId) return;
  parkActivePreviewPane();
}

async function flushCurrentRuleAutoSaveSafely() {
  try {
    await flushCurrentRuleAutoSave();
  } catch (error) {
    console.error(error);
    if (!state.manualRuleSaveRequired) {
      markManualRuleSaveRequired(error?.message || t('actions.saveFailed'));
    }
  }
}

function restoreCachedPreviewPane(tabId) {
  const key = previewPaneCacheKey(tabId);
  const cached = key ? previewPaneCache.get(key) : null;
  if (!cached?.node || !els.previewPanel) return false;
  const current = livePreviewPane();
  if (current && current !== cached.node) {
    parkPreviewPaneNode(current);
  }
  insertPreviewPaneIntoPanel(cached.node);
  activePreviewPaneCacheKey = key;
  rebindPreviewPaneElements(cached.node);
  bindPreviewPaneEvents(cached.node);
  restorePreviewPaneState(cached.state);
  closeRemoteAddMenu();
  renderPreviewWorkspaceTabs();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  renderAiSelector();
  updateManualRuleSaveButton();
  updatePreviewChrome();
  return true;
}

function ensurePreviewPaneForTab(tabId) {
  const targetKey = previewPaneCacheKey(tabId);
  const pane = livePreviewPane();
  if (pane && targetKey && activePreviewPaneCacheKey === targetKey) {
    adoptLivePreviewPane(tabId);
    return { restored: false };
  }
  if (pane && !activePreviewPaneCacheKey) {
    adoptLivePreviewPane(tabId);
    return { restored: false };
  }
  if (pane) {
    parkActivePreviewPane();
  }
  if (restoreCachedPreviewPane(tabId)) {
    return { restored: true };
  }
  ensureFreshPreviewPane(tabId);
  return { restored: false };
}

function ensureFreshPreviewPane(tabId = state.activePreviewTabId) {
  const panel = els.previewPanel;
  if (!panel || !previewPaneTemplate) return;
  const current = livePreviewPane();
  if (current) parkPreviewPaneNode(current);
  const pane = previewPaneTemplate.cloneNode(true);
  delete pane.dataset.previewPaneBound;
  insertPreviewPaneIntoPanel(pane);
  activePreviewPaneCacheKey = previewPaneCacheKey(tabId);
  rebindPreviewPaneElements(pane);
  bindPreviewPaneEvents(pane);
  applyStaticTranslations(pane);
  convertTitleToInstantTooltip(pane);
  if (activePreviewPaneCacheKey) {
    previewPaneCache.set(activePreviewPaneCacheKey, {
      node: pane,
      state: snapshotPreviewPaneState()
    });
  }
}

function adoptLivePreviewPane(tabId = state.activePreviewTabId) {
  const pane = livePreviewPane();
  if (!pane) return;
  activePreviewPaneCacheKey = previewPaneCacheKey(tabId);
  if (activePreviewPaneCacheKey) {
    previewPaneCache.set(activePreviewPaneCacheKey, {
      node: pane,
      state: snapshotPreviewPaneState()
    });
  }
  rebindPreviewPaneElements(pane);
  bindPreviewPaneEvents(pane);
}

function removeCachedPreviewPane(tabId) {
  const key = previewPaneCacheKey(tabId);
  if (!key) return;
  const cached = previewPaneCache.get(key);
  cached?.node?.remove?.();
  previewPaneCache.delete(key);
  if (activePreviewPaneCacheKey === key) activePreviewPaneCacheKey = '';
}

function clearPreviewPaneCacheForCaptureTab(tabId) {
  if (!tabId) return;
  const prefix = `${tabId}::`;
  for (const [key, cached] of previewPaneCache.entries()) {
    if (!key.startsWith(prefix)) continue;
    cached.node?.remove?.();
    previewPaneCache.delete(key);
  }
  if (activePreviewPaneCacheKey.startsWith(prefix)) activePreviewPaneCacheKey = '';
}

function clearPreviewPaneCache() {
  for (const cached of previewPaneCache.values()) {
    cached.node?.remove?.();
  }
  previewPaneCache.clear();
  activePreviewPaneCacheKey = '';
}

function handlePreviewPaneClick(event) {
  const target = event.target;
  if (target.closest('#overview-tab')) {
    setPreviewBodyTab('overview');
    return;
  }
  if (target.closest('#request-head-tab')) {
    setPreviewBodyTab('requestHead');
    return;
  }
  if (target.closest('#response-head-tab')) {
    setPreviewBodyTab('responseHead');
    return;
  }
  if (target.closest('#query-tab')) {
    setPreviewBodyTab('query');
    return;
  }
  if (target.closest('#response-body-tab')) {
    if (state.previewMode === 'remote') {
      openRemoteDslEditor();
      return;
    }
    setPreviewBodyTab('response');
    return;
  }
  if (target.closest('#request-body-tab')) {
    setPreviewBodyTab('request');
    return;
  }
  if (target.closest('#format-body-btn')) {
    formatEditableJsonBody();
    return;
  }
  if (target.closest('#manual-rule-save-btn')) {
    saveCurrentRuleManually();
    return;
  }
  if (target.closest('#preview-find-prev')) {
    movePreviewFind(-1, { preserveFocus: true });
    keepPreviewFindInputFocused();
    return;
  }
  if (target.closest('#preview-find-next')) {
    movePreviewFind(1, { preserveFocus: true });
    keepPreviewFindInputFocused();
    return;
  }
  if (target.closest('#remote-example-request-tab')) {
    setRemoteExampleTab('request');
    return;
  }
  if (target.closest('#remote-example-response-tab')) {
    setRemoteExampleTab('response');
    return;
  }
  if (target.closest('#remote-example-request-head-tab')) {
    setRemoteExampleTab('requestHead');
    return;
  }
  if (target.closest('#remote-example-response-head-tab')) {
    setRemoteExampleTab('responseHead');
    return;
  }
  if (target.closest('#remote-example-query-tab')) {
    setRemoteExampleTab('query');
    return;
  }
  if (target.closest('#local-btn')) {
    saveSelectedCapture('exact');
    return;
  }
  if (target.closest('#remote-btn')) {
    saveSelectedRemoteRule();
    return;
  }
  if (target.closest('#copy-curl-btn')) {
    copySelectedCurl();
    return;
  }
  if (target.closest('#repeat-btn')) {
    repeatSelectedRequest();
    return;
  }
  if (target.closest('#note-btn')) {
    openNoteDialog();
    return;
  }
  if (target.closest('#analyze-note-btn')) {
    openCurrentDetailNote();
    return;
  }
  if (target.closest('#delete-rule-btn')) {
    deleteSelectedRule();
    return;
  }
  if (target.closest('#add-remote-rule-btn')) {
    event.stopPropagation();
    toggleRemoteAddMenu();
    return;
  }
  if (target.closest('#remote-add-menu')) {
    event.stopPropagation();
  }
  if (target.closest('#add-remote-dsl-btn')) {
    closeRemoteAddMenu();
    addRemoteDslRow();
    return;
  }
  if (target.closest('#remote-ai-rule-btn')) {
    closeRemoteAddMenu();
    addRemoteAiStep();
    return;
  }
  if (target.closest('#remote-ai-generate-btn')) {
    handleRemoteAiPrimaryAction();
    return;
  }
  if (target.closest('#ask-ai-btn')) {
    askAiAboutCurrentCapture();
    return;
  }
  if (target.closest('#remote-dsl-back-btn') || target.closest('#remote-ai-back-btn')) {
    openRemoteDslEditor();
    return;
  }
  if (target.closest('#remote-rule-help-btn')) {
    showRemoteRuleHelp();
  }
}

function handlePreviewPanePointerDown(event) {
  if (event.target.closest('.remote-example-divider')) {
    startRemoteExampleResize(event);
  }
}

function handlePreviewPaneInput(event) {
  const target = event.target;
  if (target.matches('#capture-query-input')) {
    handleCaptureQueryInput();
    return;
  }
  if (target.matches('#rule-query-input')) {
    if (state.previewMode === 'remote') {
      scheduleRemotePreview();
    }
    scheduleRuleAutoSave();
    return;
  }
  if (target.matches('#preview-find-input')) {
    updatePreviewFind(target.value, { select: true });
    return;
  }
  if (target.matches('#body-editor')) {
    handleBodyEditorInput();
    return;
  }
  if (target.matches('#remote-dsl-summary')) {
    const step = selectedDslStep();
    if (!step) return;
    step.note = target.value;
    renderRemoteDslRows();
    scheduleRuleAutoSave();
    return;
  }
  if (target.matches('#remote-dsl-path')) {
    const step = selectedDslStep();
    if (!step) return;
    step.path = target.value;
    renderRemoteDslRows();
    scheduleRemotePreview();
    scheduleRuleAutoSave();
    return;
  }
  if (target.matches('#remote-dsl-value')) {
    const step = selectedDslStep();
    if (!step) return;
    step.value = target.value;
    renderRemoteDslRows();
    scheduleRemotePreview();
    scheduleRuleAutoSave();
    return;
  }
  if (target.matches('#remote-ai-script')) {
    updateRemoteAiScriptHighlight();
    saveRemoteAiDraft();
    scheduleRemotePreview();
    scheduleRuleAutoSave();
    return;
  }
  if (target.matches('#remote-ai-prompt')) {
    resetRemoteAiPromptHistoryCursor();
    saveRemoteAiDraft();
    refreshRemoteAiGuideText();
    scheduleRuleAutoSave();
    return;
  }
  if (target.matches('#remote-ai-summary')) {
    const step = selectedAiStep();
    if (step) {
      step.summary = normalizeAiSummary(target.value);
      renderRemoteDslRows();
    }
    saveRemoteAiDraft();
    scheduleRuleAutoSave();
  }
}

function handlePreviewPaneChange(event) {
  const target = event.target;
  if (target.matches('#capture-merge-query')) {
    handleCaptureMergeQueryChange();
    return;
  }
  if (target.matches('#capture-merge-body')) {
    handleCaptureMergeBodyChange();
    return;
  }
  if (target.matches('#rule-option-query')) {
    if (state.selectedRuleId) {
      toggleRuleQuery(state.selectedRuleId, target.checked);
      return;
    }
    if (state.selectedRemoteRuleId) {
      toggleRemoteRuleQuery(state.selectedRemoteRuleId, target.checked);
    }
    return;
  }
  if (target.matches('#rule-option-body')) {
    if (state.selectedRuleId) {
      toggleRuleBody(state.selectedRuleId, target.checked);
      return;
    }
    if (state.selectedRemoteRuleId) {
      toggleRemoteRuleBody(state.selectedRemoteRuleId, target.checked);
    }
    return;
  }
  if (target.matches('#rule-option-enabled')) {
    if (state.selectedRuleId) {
      toggleRuleEnabled(state.selectedRuleId, target.checked);
      return;
    }
    if (state.selectedRemoteRuleId) {
      toggleRemoteRuleEnabled(state.selectedRemoteRuleId, target.checked);
    }
    return;
  }
  if (target.matches('#global-remote-enabled')) {
    const rule = selectedRemoteRule();
    if (!rule || !isGlobalRemoteRule(rule)) return;
    rule.enabled = target.checked;
    renderRemoteRules();
    scheduleRuleAutoSave({ immediate: true });
    return;
  }
  if (target.matches('#remote-dsl-enabled')) {
    const step = selectedDslStep();
    if (!step) return;
    step.enabled = target.checked;
    renderRemoteDslRows();
    scheduleRemotePreview();
    scheduleRuleAutoSave();
    return;
  }
  if (target.matches('#remote-dsl-action')) {
    const step = selectedDslStep();
    if (!step) return;
    step.action = target.value;
    syncRemoteExampleTabForDslAction(step.action);
    renderRemoteDslRows();
    scheduleRemotePreview();
    scheduleRuleAutoSave();
    return;
  }
  if (target.matches('#remote-ai-enabled')) {
    const step = selectedAiStep();
    if (!step) return;
    step.enabled = target.checked;
    renderRemoteDslRows();
    scheduleRemotePreview();
    scheduleRuleAutoSave();
  }
}

function handlePreviewPaneKeydown(event) {
  if (event.target.matches('#preview-find-input')) {
    if (event.key === 'Enter') {
      event.preventDefault();
      movePreviewFind(event.shiftKey ? -1 : 1, { preserveFocus: true });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closePreviewFindBar();
    }
    return;
  }
  if (event.target.matches('#remote-ai-prompt')) {
    handleRemoteAiPromptHistoryKey(event);
  }
}

function handlePreviewPaneScroll(event) {
  if (event.target.matches('#body-editor')) {
    syncEditableCodeHighlightScroll();
    return;
  }
  if (event.target.matches('#remote-ai-script')) {
    syncRemoteAiScriptHighlightScroll();
    return;
  }
  if (event.target.matches('#remote-example-preview')) {
    rememberRemoteExampleScroll();
  }
}

function handlePreviewPaneFocusOut(event) {
  if (event.target.matches('#preview-find-bar, #preview-find-bar *')) {
    if (event.relatedTarget && els.previewFindBar.contains(event.relatedTarget)) return;
    window.setTimeout(() => {
      if (!els.previewFindBar.hidden && !els.previewFindBar.contains(document.activeElement)) {
        closePreviewFindBar({ keepSelection: true });
      }
    });
  }
}

function handlePreviewPaneBlur(event) {
  if (event.target.matches('#capture-query-input')) {
    commitCaptureQueryInput();
    return;
  }
  if (event.target.matches('#body-editor')) {
    commitCaptureBodyEditorOnBlur();
  }
}

async function selectFirstVisibleItemForActiveTab() {
  if (state.activeTab === 'captures') {
    const captures = visibleCapturesForActiveWorkspace();
    if (state.selectedCaptureId && captures.some((capture) => captureContainsId(capture, state.selectedCaptureId))) return;
    if (captures[0]) await selectCapture(captures[0].id);
    return;
  }

  if (state.activeTab === 'rules') {
    const rules = visibleLocalRulesForActiveWorkspace();
    if (state.selectedRuleId && rules.some((rule) => rule.id === state.selectedRuleId)) return;
    if (rules[0]) await selectRule(rules[0].id);
    return;
  }

  if (state.activeTab === 'remote') {
    const rules = visibleRemoteRulesForActiveWorkspace();
    if (state.selectedRemoteRuleId && rules.some((rule) => rule.id === state.selectedRemoteRuleId)) return;
    if (rules[0]) await selectRemoteRule(rules[0].id);
  }
}

function visibleCapturesForActiveWorkspace() {
  const primaryCaptures = filterCaptures(state.captures, state.captureFilter);
  return filterCaptures(primaryCaptures, state.displayFilter, { scope: 'secondary', includeNote: true });
}

function captureContainsId(capture = {}, captureId = '') {
  if (!captureId) return false;
  if (capture.id === captureId) return true;
  return Array.isArray(capture.history) && capture.history.some((item) => item.id === captureId);
}

function visibleLocalRulesForActiveWorkspace() {
  const domain = currentProjectDomain();
  return sortRulesByPath(domain
    ? state.rules.filter((rule) => normalizeHostInput(rule.host) === domain)
    : state.rules);
}

function visibleRemoteRulesForActiveWorkspace() {
  const domain = currentProjectDomain();
  const globalRules = sortRulesByPath(state.remoteRules.filter((rule) => {
    if (!isGlobalRemoteRule(rule) || !rule.host) return false;
    return !domain || normalizeHostInput(rule.host) === domain;
  }));
  const realRules = sortRulesByPath(state.remoteRules.filter((rule) => {
    if (isGlobalRemoteRule(rule)) return false;
    return !domain || normalizeHostInput(rule.host) === domain;
  }));
  return [...globalRules, ...realRules];
}

async function loadSettings() {
  const [result, providersResult] = await Promise.all([
    getJson('/api/settings'),
    getJson('/api/ai/providers').catch((error) => {
      console.error(error);
      return { providers: [] };
    })
  ]);
  state.availableAiProviders = Array.isArray(providersResult.providers) ? providersResult.providers : [];
  state.aiProvider = result.settings?.aiProvider || 'none';
  if (state.aiProvider !== 'none' && !state.availableAiProviders.some((provider) => provider.id === state.aiProvider)) {
    state.aiProvider = 'none';
  }
  state.aiNotesEnabled = result.settings?.aiNotesEnabled !== false;
  state.captureFilter = result.settings?.captureFilter || '';
  state.displayFilter = result.settings?.displayFilter || '';
  state.captureMergeRules = result.settings?.captureMergeRules || {};
  state.captureMergeEnabled = result.settings?.captureMergeEnabled !== false;
  state.captureTreeViewEnabled = result.settings?.captureTreeViewEnabled === true;
  state.apiNotes = result.settings?.apiNotes || {};
  state.apiDetails = result.settings?.apiDetails || {};
  state.apiDetailFailures = result.settings?.apiDetailFailures || {};
  state.showListNotes = result.settings?.showListNotes !== false;
  state.maxRecentRequests = normalizeMaxRecentRequests(result.settings?.maxRecentRequests);
  state.language = normalizeLanguage(result.settings?.language);
  state.appearance = normalizeAppearance(result.settings?.appearance);
  applyAppearance();
  state.domainHistory = normalizeDomainHistory(result.settings?.domainHistory || [], result.settings?.captureTabs || []);
  state.domainProjectPaths = normalizeDomainProjectPaths(result.settings?.domainProjectPaths || {}, result.settings?.captureTabs || []);
  state.domainProjectsInitialized = result.settings?.domainProjectsInitialized === true ||
    Boolean((result.settings?.captureTabs || []).length) ||
    Boolean(String(result.settings?.captureFilter || '').trim());
  state.requireDomainHistorySelection = result.settings?.requireDomainHistorySelection === true;
  state.captureTabs = mergeCaptureTabsFromSettings(result.settings?.captureTabs || [], state.captureFilter, state.displayFilter);
  state.activeCaptureTabId = result.settings?.activeCaptureTabId || state.captureTabs[0]?.id || '';
  applyLanguage({ staticOnly: true });
  applyActiveCaptureTab();
  restorePreviewWorkspaceFromActiveCaptureTab();
  renderAiSelector();
  els.displayFilter.value = state.displayFilter;
  renderCaptureWorkspaceTabs();
  renderProjectPath();
  updateTerminalAfterProjectSwitch();
}

async function refresh() {
  window.clearTimeout(state.refreshTimer);
  const editingRuleId = state.selectedRuleId;
  const editingRemoteRuleId = state.selectedRemoteRuleId;
  const preserveRuleDraft = shouldPreserveSelectedRuleDraft();
  const preservedRule = preserveRuleDraft && editingRuleId
    ? mergeRuleDraft(state.rules.find((item) => item.id === editingRuleId))
    : null;
  const [health, captures, rules, remoteRules, settingsResult] = await Promise.all([
    getJson('/api/health'),
    getJson('/api/captures'),
    getJson('/api/rules'),
    getJson('/api/remote-rules'),
    getJson('/api/settings')
  ]);
  const preservedRemoteRule = preserveRuleDraft && editingRemoteRuleId
    ? mergeRemoteRuleDraft(remoteRules.rules.find((item) => item.id === editingRemoteRuleId))
    : null;
  const preservedRemoteSteps = preservedRemoteRule ? cloneRemoteSteps(preservedRemoteRule.steps || []) : null;

  els.proxyPort.textContent = health.proxyPort;
  state.proxyRunning = Boolean(health.proxyRunning);
  state.recordingEnabled = health.recordingEnabled !== false;
  state.codexQueue = health.codexQueue || null;
  state.apiNotes = settingsResult.settings?.apiNotes || state.apiNotes;
  state.apiDetails = settingsResult.settings?.apiDetails || state.apiDetails;
  state.apiDetailFailures = settingsResult.settings?.apiDetailFailures || state.apiDetailFailures;
  state.captureMergeEnabled = settingsResult.settings?.captureMergeEnabled !== false;
  state.captureTreeViewEnabled = settingsResult.settings?.captureTreeViewEnabled === true;
  state.showListNotes = settingsResult.settings?.showListNotes !== false;
  state.maxRecentRequests = normalizeMaxRecentRequests(settingsResult.settings?.maxRecentRequests);
  state.language = normalizeLanguage(settingsResult.settings?.language || state.language);
  state.appearance = normalizeAppearance(settingsResult.settings?.appearance || state.appearance);
  applyAppearance();
  state.domainHistory = normalizeDomainHistory(settingsResult.settings?.domainHistory || state.domainHistory, settingsResult.settings?.captureTabs || state.captureTabs);
  if (Object.hasOwn(settingsResult.settings || {}, 'domainProjectsInitialized')) {
    state.domainProjectsInitialized = state.domainProjectsInitialized || settingsResult.settings.domainProjectsInitialized === true;
  }
  if (Object.hasOwn(settingsResult.settings || {}, 'requireDomainHistorySelection')) {
    state.requireDomainHistorySelection = settingsResult.settings.requireDomainHistorySelection === true;
  }
  state.aiNotesEnabled = settingsResult.settings?.aiNotesEnabled !== false;
  renderProxyStatus();
  updateCaCertTooltip(health);
  renderDetailNoteButton();
  els.localIp.textContent = (health.lanIps && health.lanIps.length)
    ? health.lanIps.join(' / ')
    : window.location.hostname;
  state.captures = shouldMergeCaptureList()
    ? mergeCaptureSnapshot(captures.captures || [])
    : (captures.captures || []);
  state.rules = mergePreservedRuleList(rules.rules, preservedRule);
  state.remoteRules = mergePreservedRuleList(remoteRules.rules, preservedRemoteRule);
  if (preservedRemoteRule && preservedRemoteSteps) {
    state.remoteSteps = preservedRemoteSteps;
    renderSelectedRemoteRuleEditor();
  } else {
    syncSelectedRemoteRuleFromState();
  }
  renderCaptureWorkspaceTabs();
  renderProjectPath();
  applyLanguage();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  prunePreviewWorkspaceTabs({ selectReplacement: false });
  renderPreviewWorkspaceTabs();
  restorePreviewWorkspaceActiveSelection();
  captureSavedStateAfterAiCompletion();
  scheduleRefresh();
}

function scheduleRefresh() {
  window.clearTimeout(state.refreshTimer);
  if (state.eventSource && state.eventSource.readyState !== EventSource.CLOSED) return;
  if (document.hidden && !aiQueueActive()) return;
  state.refreshTimer = window.setTimeout(() => {
    refresh().catch((error) => {
      console.error(error);
      scheduleRefresh();
    });
  }, refreshIntervalMs());
}

function refreshIntervalMs() {
  if (aiQueueActive()) return 1000;
  if (document.hidden) return 60 * 1000;
  return 5 * 60 * 1000;
}

function aiQueueActive() {
  const aiRules = state.codexQueue?.aiRules || {};
  const notes = state.codexQueue?.notes || {};
  const details = notes.details || {};
  const selectedAiGenerating = state.remoteSteps.some((step) => step.type === 'ai' && isAiStepGenerating(step));
  return Boolean(
    Number(aiRules.running || 0) ||
    Number(aiRules.pending || 0) ||
    notes.running ||
    Number(notes.pending || 0) ||
    details.running ||
    Number(details.pending || 0) ||
    selectedAiGenerating
  );
}

function connectAppEvents() {
  if (document.hidden || !window.EventSource || state.eventSource) return;
  const source = new EventSource('/api/events');
  state.eventSource = source;

  source.addEventListener('connected', (event) => {
    const data = parseEventSourceJson(event);
    if (data.codexQueue) {
      state.codexQueue = data.codexQueue;
      renderProxyStatus();
    }
    window.clearTimeout(state.refreshTimer);
  });

  source.addEventListener('capturesChanged', (event) => {
    handleCapturesChangedEvent(parseEventSourceJson(event)).catch((error) => {
      console.error(error);
      scheduleCapturesReload();
    });
  });

  source.addEventListener('rulesChanged', (event) => {
    handleRulesChangedEvent(parseEventSourceJson(event)).catch((error) => {
      console.error(error);
      scheduleRulesReload();
    });
  });

  source.addEventListener('settingsChanged', (event) => {
    handleSettingsChangedEvent(parseEventSourceJson(event)).catch((error) => {
      console.error(error);
      scheduleSettingsReload();
    });
  });

  source.addEventListener('codexQueueChanged', () => {
    scheduleHealthReload();
  });

  source.onerror = () => {
    source.close();
    state.eventSource = null;
    window.clearTimeout(state.eventReconnectTimer);
    if (document.hidden) return;
    state.eventReconnectTimer = window.setTimeout(() => {
      connectAppEvents();
      scheduleRefresh();
    }, 2000);
  };
}

function closeAppEvents() {
  window.clearTimeout(state.eventReconnectTimer);
  state.eventReconnectTimer = null;
  if (!state.eventSource) return;
  state.eventSource.close();
  state.eventSource = null;
}

function closeBackgroundConnections() {
  closeAppEvents();
  closeAdbDeviceTracker();
  window.clearTimeout(state.refreshTimer);
  window.clearTimeout(state.adbStatusTimer);
}

async function handleCapturesChangedEvent(data = {}) {
  if (data.mode === 'append' && data.capture) {
    mergeCaptureSummary(data.capture);
    renderCaptures();
    renderSelectedRuleHitCaptures();
    return;
  }
  if (data.mode === 'clear') {
    state.captures = [];
    state.selectedCaptureId = null;
    clearPreviewPaneCache();
    state.previewOpenTabs = [];
    state.activePreviewTabId = '';
    persistPreviewWorkspaceAndSettings();
    clearPreview();
    renderPreviewWorkspaceTabs();
    renderCaptures();
    renderSelectedRuleHitCaptures();
    return;
  }
  await reloadCaptures({
    replace: data.reason === 'clearOlder' ||
      data.reason === 'deleteGroup' ||
      data.reason === 'mergeRules' ||
      data.reason === 'clearNotes' ||
      data.reason === 'clearRules'
  });
}

async function handleRulesChangedEvent(data = {}) {
  if (data.action === 'upsert' && data.rule) {
    if (data.kind === 'local') {
      replaceRuleInState(data.rule);
      if (state.selectedRuleId === data.rule.id) {
        updateRuleEditorTitle(data.rule);
        syncRuleOptionControls(data.rule);
      }
      renderRules();
    } else if (data.kind === 'remote') {
      replaceRemoteRuleInState(data.rule);
      if (state.selectedRemoteRuleId === data.rule.id) {
        renderSelectedRemoteRuleEditor();
      } else {
        syncSelectedRemoteRuleFromState();
      }
      renderRemoteRules();
    } else {
      await reloadRules();
    }
    captureSavedStateAfterAiCompletion();
    return;
  }
  if (data.action === 'delete' && data.id) {
    if (data.kind === 'local') {
      await applyDeletedRule('local', data.id);
    } else if (data.kind === 'remote') {
      await applyDeletedRule('remote', data.id);
    } else {
      await reloadRules();
    }
    return;
  }
  await reloadRules();
}

async function handleSettingsChangedEvent(data = {}) {
  if (data.reason === 'noteGenerated' || data.reason === 'noteFailed') {
    await reloadSettings({ renderCapturesOnly: true });
    refreshPreviewNote();
    return;
  }
  if (data.reason === 'detailGenerated' || data.reason === 'detailFailed') {
    await reloadSettings({ renderDetailOnly: true });
    return;
  }
  const previousShouldMerge = shouldMergeCaptureList();
  const previousTreeViewEnabled = state.captureTreeViewEnabled === true;
  await reloadSettings();
  refreshPreviewNote();
  const mergeOrTreeChanged = previousShouldMerge !== shouldMergeCaptureList() ||
    previousTreeViewEnabled !== (state.captureTreeViewEnabled === true);
  if (
    data.reason === 'settings' &&
    mergeOrTreeChanged
  ) {
    refreshCaptureMergeDependentPreview();
    await reloadCaptures({ replace: true });
  }
}

function mergeCaptureSummary(capture) {
  if (!shouldMergeCaptureList()) {
    state.captures = [capture, ...state.captures.filter((item) => item.id !== capture.id)];
    trimCaptureSummaries();
    return;
  }
  const existingIndex = bestCaptureMergeGroupIndex(state.captures, capture);
  const nextCapture = {
    ...capture,
    history: []
  };
  if (existingIndex < 0) {
    state.captures = [nextCapture, ...state.captures];
    trimCaptureSummaries();
    return;
  }

  const existing = state.captures[existingIndex];
  const history = [
    captureListHistorySummary(existing),
    ...(Array.isArray(existing.history) ? existing.history : [])
  ].filter((item) => item.id !== capture.id);
  nextCapture.history = history;
  state.captures = [
    nextCapture,
    ...state.captures.slice(0, existingIndex),
    ...state.captures.slice(existingIndex + 1)
  ];
  trimCaptureSummaries();
}

function trimCaptureSummaries() {
  state.captures = trimCaptureList(state.captures);
}

function captureListHistorySummary(capture = {}) {
  return {
    id: capture.id,
    createdAt: capture.createdAt,
    method: capture.method,
    url: capture.url,
    protocol: capture.protocol,
    host: capture.host,
    port: capture.port,
    path: capture.path,
    query: capture.query || '',
    statusCode: capture.statusCode,
    contentType: capture.contentType || '',
    bodySize: Number(capture.bodySize || 0),
    contentLength: Number(capture.contentLength || capture.bodySize || 0),
    requestBodySize: Number(capture.requestBodySize || 0),
    requestStartedAt: capture.requestStartedAt || '',
    requestEndedAt: capture.requestEndedAt || '',
    responseStartedAt: capture.responseStartedAt || '',
    responseEndedAt: capture.responseEndedAt || '',
    durationMs: capture.durationMs,
    requestMs: capture.requestMs,
    responseMs: capture.responseMs,
    latencyMs: capture.latencyMs,
    clientAddress: capture.clientAddress || '',
    remoteAddress: capture.remoteAddress || '',
    httpVersion: capture.httpVersion || '',
    keptAlive: capture.keptAlive,
    tlsProtocol: capture.tlsProtocol || '',
    tlsCipher: capture.tlsCipher || '',
    requestHeaderSize: capture.requestHeaderSize,
    requestQuerySize: capture.requestQuerySize,
    requestCookieSize: capture.requestCookieSize,
    responseHeaderSize: capture.responseHeaderSize,
    responseCookieSize: capture.responseCookieSize,
    requestBodyHash: capture.requestBodyHash || '',
    requestContentType: capture.requestContentType || '',
    requestBodyBase64: capture.requestBodyBase64 || '',
    summaryOnly: capture.summaryOnly === true,
    contentCaptured: capture.contentCaptured !== false,
    requestContentCaptured: capture.requestContentCaptured !== false,
    mapType: capture.mapType || '',
    mapRuleId: capture.mapRuleId || '',
    mapRuleIds: Array.isArray(capture.mapRuleIds) ? capture.mapRuleIds : [],
    mergeKey: capture.mergeKey || '',
    mergeGroupKey: capture.mergeGroupKey || '',
    mergeOptions: capture.mergeOptions || {},
    note: capture.note
  };
}

function scheduleCapturesReload() {
  debounceTask('capturesReloadTimer', reloadCaptures, 120);
}

function scheduleRulesReload() {
  debounceTask('rulesReloadTimer', reloadRules, 120);
}

function scheduleSettingsReload() {
  debounceTask('settingsReloadTimer', reloadSettings, 120);
}

function scheduleHealthReload() {
  debounceTask('healthReloadTimer', reloadHealth, 120);
}

function debounceTask(timerKey, task, delayMs) {
  window.clearTimeout(state[timerKey]);
  state[timerKey] = window.setTimeout(() => {
    task().catch((error) => {
      console.error(error);
    });
  }, delayMs);
}

async function reloadHealth() {
  const health = await getJson('/api/health');
  applyHealth(health);
}

async function reloadCaptures(options = {}) {
  const result = await getJson('/api/captures');
  state.captures = options.replace || !shouldMergeCaptureList()
    ? (result.captures || [])
    : mergeCaptureSnapshot(result.captures || []);
  prunePreviewWorkspaceTabs({ selectReplacement: false });
  renderCaptures();
  renderSelectedRuleHitCaptures();
  renderPreviewWorkspaceTabs();
  restorePreviewWorkspaceActiveSelection();
}

function renderSelectedRuleHitCaptures() {
  if (state.activeTab === 'rules' && state.selectedRuleId) {
    renderSelectedRuleHitCaptureBlock('local', state.selectedRuleId);
    return;
  }
  if (state.activeTab === 'remote' && state.selectedRemoteRuleId) {
    renderSelectedRuleHitCaptureBlock('remote', state.selectedRemoteRuleId);
  }
}

function renderSelectedRuleHitCaptureBlock(kind, ruleId) {
  if (!ruleId) return;
  const list = kind === 'local' ? els.rules : els.remoteRules;
  const rules = kind === 'local' ? state.rules : state.remoteRules;
  const rule = rules.find((item) => item.id === ruleId);
  const item = list?.querySelector?.(`.rule[data-rule-id="${cssEscape(ruleId)}"]`);
  const layout = item?.querySelector?.('.rule-layout');
  if (!rule || !item || !layout) {
    if (kind === 'local') renderRules();
    else renderRemoteRules();
    return;
  }
  const existing = layout.querySelector('.rule-hit-captures');
  const html = ruleHitCaptureListHtml(rule, kind);
  if (!html) {
    existing?.remove();
    return;
  }
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const next = template.content.firstElementChild;
  if (!next) return;
  if (existing) {
    existing.replaceWith(next);
  } else {
    layout.append(next);
  }
  bindRuleHitCaptureItems(item, rule.id, kind);
}

function shouldMergeCaptureList() {
  return state.captureMergeEnabled !== false && state.captureTreeViewEnabled !== true;
}

function mergeCaptureSnapshot(captures = []) {
  const nextCaptures = [];
  const usedCurrentIds = new Set();
  const snapshotIds = new Set(captures.flatMap((capture) => captureGroupIds(capture)));
  for (const capture of captures) {
    const existingIndex = bestCaptureMergeGroupIndex(state.captures, capture);
    if (existingIndex >= 0) {
      const existing = state.captures[existingIndex];
      usedCurrentIds.add(existing.id);
      for (const item of Array.isArray(existing.history) ? existing.history : []) {
        if (item?.id) usedCurrentIds.add(item.id);
      }
      nextCaptures.push(mergeCaptureSnapshotItem(existing, capture));
    } else {
      nextCaptures.push(capture);
    }
  }
  for (const current of state.captures) {
    if (usedCurrentIds.has(current.id) || captureGroupIds(current).some((id) => usedCurrentIds.has(id))) continue;
    if (captureGroupIds(current).some((id) => snapshotIds.has(id))) continue;
    nextCaptures.push(current);
  }
  return trimCaptureList(nextCaptures.sort((a, b) => captureTimestamp(b) - captureTimestamp(a)));
}

function mergeCaptureSnapshotItem(current = {}, snapshot = {}) {
  const historyById = new Map();
  const currentTime = captureTimestamp(current);
  const snapshotTime = captureTimestamp(snapshot);
  const primary = snapshotTime >= currentTime
    ? { ...current, ...snapshot }
    : { ...snapshot, ...current };
  const addHistory = (item) => {
    if (!item?.id || item.id === primary.id) return;
    const previous = historyById.get(item.id) || {};
    historyById.set(item.id, { ...previous, ...item });
  };
  if (current.id !== primary.id) {
    addHistory(current);
  }
  if (snapshot.id !== primary.id) {
    addHistory(snapshot);
  }
  for (const item of Array.isArray(snapshot.history) ? snapshot.history : []) addHistory(item);
  for (const item of Array.isArray(current.history) ? current.history : []) addHistory(item);
  return {
    ...primary,
    history: [...historyById.values()]
      .sort((a, b) => captureTimestamp(b) - captureTimestamp(a))
  };
}

function trimCaptureList(captures = []) {
  let remaining = clientCaptureSummaryLimit();
  return captures.map((capture) => {
    if (remaining <= 0) return null;
    remaining -= 1;
    const history = Array.isArray(capture.history) ? capture.history.slice(0, Math.max(0, remaining)) : [];
    remaining -= history.length;
    return {
      ...capture,
      history
    };
  }).filter(Boolean);
}

function clientCaptureSummaryLimit() {
  return normalizeMaxRecentRequests(state.maxRecentRequests);
}

function captureGroupIds(capture = {}) {
  return [
    capture.id,
    ...(Array.isArray(capture.history) ? capture.history.map((item) => item?.id) : [])
  ].filter(Boolean);
}

function captureTimestamp(capture = {}) {
  const timestamp = Date.parse(capture.createdAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function reloadRules() {
  const editingRuleId = state.selectedRuleId;
  const editingRemoteRuleId = state.selectedRemoteRuleId;
  const preserveRuleDraft = shouldPreserveSelectedRuleDraft();
  const preservedRule = preserveRuleDraft && editingRuleId
    ? mergeRuleDraft(state.rules.find((item) => item.id === editingRuleId))
    : null;
  const [rules, remoteRules] = await Promise.all([
    getJson('/api/rules'),
    getJson('/api/remote-rules')
  ]);
  const preservedRemoteRule = preserveRuleDraft && editingRemoteRuleId
    ? mergeRemoteRuleDraft(remoteRules.rules.find((item) => item.id === editingRemoteRuleId))
    : null;
  const preservedRemoteSteps = preservedRemoteRule ? cloneRemoteSteps(preservedRemoteRule.steps || []) : null;
  state.rules = mergePreservedRuleList(rules.rules, preservedRule);
  state.remoteRules = mergePreservedRuleList(remoteRules.rules, preservedRemoteRule);
  if (preservedRemoteRule && preservedRemoteSteps) {
    state.remoteSteps = preservedRemoteSteps;
    renderSelectedRemoteRuleEditor();
  } else {
    syncSelectedRemoteRuleFromState();
  }
  prunePreviewWorkspaceTabs({ selectReplacement: false });
  renderRules();
  renderRemoteRules();
  renderPreviewWorkspaceTabs();
  restorePreviewWorkspaceActiveSelection();
  captureSavedStateAfterAiCompletion();
}

async function reloadSettings(options = {}) {
  const result = await getJson('/api/settings');
  applySettings(result.settings || {}, options);
}

function applyHealth(health = {}) {
  els.proxyPort.textContent = health.proxyPort;
  state.proxyRunning = Boolean(health.proxyRunning);
  state.recordingEnabled = health.recordingEnabled !== false;
  state.codexQueue = health.codexQueue || state.codexQueue;
  if (Object.hasOwn(health, 'aiNotesEnabled')) {
    state.aiNotesEnabled = health.aiNotesEnabled !== false;
  }
  renderProxyStatus();
  updateCaCertTooltip(health);
  els.localIp.textContent = (health.lanIps && health.lanIps.length)
    ? health.lanIps.join(' / ')
    : window.location.hostname;
}

function applySettings(settings = {}, options = {}) {
  const previousActiveTabId = state.activeCaptureTabId;
  const previousActiveTab = activeCaptureTab();
  const previousDisplayFilter = state.displayFilter;
  state.apiNotes = settings.apiNotes || state.apiNotes;
  state.apiDetails = settings.apiDetails || state.apiDetails;
  state.apiDetailFailures = settings.apiDetailFailures || state.apiDetailFailures;
  state.captureMergeEnabled = settings.captureMergeEnabled !== false;
  state.captureTreeViewEnabled = settings.captureTreeViewEnabled === true;
  state.showListNotes = settings.showListNotes !== false;
  state.maxRecentRequests = normalizeMaxRecentRequests(settings.maxRecentRequests);
  state.language = normalizeLanguage(settings.language || state.language);
  state.appearance = normalizeAppearance(settings.appearance || state.appearance);
  applyAppearance();
  state.domainHistory = normalizeDomainHistory(settings.domainHistory || state.domainHistory, settings.captureTabs || state.captureTabs);
  state.domainProjectPaths = normalizeDomainProjectPaths(settings.domainProjectPaths || state.domainProjectPaths, settings.captureTabs || state.captureTabs);
  if (Object.hasOwn(settings || {}, 'domainProjectsInitialized')) {
    state.domainProjectsInitialized = state.domainProjectsInitialized || settings.domainProjectsInitialized === true;
  }
  if (Object.hasOwn(settings || {}, 'requireDomainHistorySelection')) {
    state.requireDomainHistorySelection = settings.requireDomainHistorySelection === true;
  }
  state.aiProvider = settings.aiProvider || state.aiProvider;
  if (Object.hasOwn(settings || {}, 'aiNotesEnabled')) {
    state.aiNotesEnabled = settings.aiNotesEnabled !== false;
  }
  state.captureMergeRules = settings.captureMergeRules || state.captureMergeRules;
  if (!options.renderCapturesOnly && !options.renderDetailOnly) {
    state.captureTabs = mergeCaptureTabsFromSettings(settings.captureTabs || [], state.captureFilter, state.displayFilter, {
      preserveExisting: options.preserveCaptureTabs !== false && state.captureTabs.length > 0
    });
    const currentTabFromSettings = previousActiveTabId
      ? state.captureTabs.find((tab) => tab.id === previousActiveTabId)
      : null;
    if (currentTabFromSettings) {
      state.activeCaptureTabId = previousActiveTabId;
      currentTabFromSettings.displayFilter = previousDisplayFilter;
      if (previousActiveTab?.terminal) {
        currentTabFromSettings.terminal = previousActiveTab.terminal;
      }
      if (previousActiveTab?.transient && !String(previousActiveTab.filter || '').trim()) {
        currentTabFromSettings.transient = true;
      }
    } else {
      state.activeCaptureTabId = settings.activeCaptureTabId || state.activeCaptureTabId;
    }
    applyActiveCaptureTab();
    restorePreviewWorkspaceFromActiveCaptureTab();
    els.displayFilter.value = state.displayFilter;
    renderCaptureWorkspaceTabs();
    renderProjectPath();
    updateTerminalAfterProjectSwitch();
  }
  renderDetailNoteButton();
  applyLanguage(options.renderCapturesOnly || options.renderDetailOnly ? { staticOnly: true } : {});
  refreshPreviewNote();
  if (options.renderDetailOnly) return;
  renderCaptures();
  renderRules();
  renderRemoteRules();
}

function shouldPreserveSelectedRuleDraft() {
  if (!(state.selectedRuleId || state.selectedRemoteRuleId)) return false;
  if (!(state.previewMode === 'rule' || state.previewMode === 'remote')) return false;
  if (!state.savedEditorState) return false;
  return editorStateChanged(state.savedEditorState, currentEditorState());
}

function mergePreservedRuleList(rules = [], preservedRule = null) {
  if (!preservedRule?.id) return rules || [];
  const exists = (rules || []).some((item) => item.id === preservedRule.id);
  if (!exists) return [preservedRule, ...(rules || [])];
  return (rules || []).map((item) => item.id === preservedRule.id ? preservedRule : item);
}

function mergeRuleDraft(rule) {
  if (!rule) return null;
  updateActivePreviewBodyFromEditor();
  return {
    ...rule,
    query: normalizeQuery(els.ruleQueryInput.value)
  };
}

function mergeRemoteRuleDraft(rule) {
  if (!rule) return null;
  syncSelectedAiStepFromEditor();
  syncSelectedDslStepFromEditor();
  const serverSteps = parseRemoteScriptForEditor(rule.script, rule);
  const localSteps = state.remoteSteps;
  const mergedSteps = mergeRemoteStepsForDraft(serverSteps, localSteps);
  return {
    ...rule,
    host: isGlobalRemoteRule(rule) ? normalizeHostInput(els.globalRemoteHostInput.value) : rule.host,
    enabled: isGlobalRemoteRule(rule) ? Boolean(els.globalRemoteEnabled.checked) : rule.enabled,
    query: isGlobalRemoteRule(rule) ? '' : normalizeQuery(els.ruleQueryInput.value),
    script: serializeRemoteRowsForState(mergedSteps),
    steps: serializeRemoteStepsForApi(mergedSteps)
  };
}

function mergeRemoteStepsForDraft(serverSteps = [], localSteps = []) {
  const serverById = new Map(serverSteps.map((step) => [step.id, step]));
  const summaryFocused = document.activeElement === els.remoteAiSummary;
  const scriptFocused = document.activeElement === els.remoteAiScript;
  const listSummaryEdit = currentRemoteStepSummaryEdit();
  return localSteps.map((localStep) => {
    const serverStep = serverById.get(localStep.id);
    if (!serverStep || localStep.type !== 'ai') {
      return localStep;
    }
    if (serverStep.type !== 'ai') {
      return localStep;
    }
    const keepLocalSummary = summaryFocused &&
      localStep.id === state.selectedAiStepId &&
      !isDefaultAiSummary(localStep.summary);
    const keepLocalScript = scriptFocused &&
      localStep.id === state.selectedAiStepId &&
      !isAiStepGenerating(serverStep);
    const keepListSummary = listSummaryEdit?.rowId === localStep.id;
    return {
      ...localStep,
      summary: keepListSummary
        ? normalizeAiSummary(listSummaryEdit.value)
        : keepLocalSummary
          ? localStep.summary
          : (serverStep.summary || localStep.summary || ''),
      pythonScript: keepLocalScript ? (localStep.pythonScript || '') : (serverStep.pythonScript ?? localStep.pythonScript ?? ''),
      aiOutputLines: Array.isArray(serverStep.aiOutputLines) ? [...serverStep.aiOutputLines] : [],
      aiPromptHistory: Array.isArray(serverStep.aiPromptHistory) ? [...serverStep.aiPromptHistory] : [],
      aiContext: serverStep.aiContext || localStep.aiContext || null,
      aiStatus: serverStep.aiStatus || '',
      aiJobId: serverStep.aiJobId || '',
      aiError: serverStep.aiError || '',
      aiUpdatedAt: serverStep.aiUpdatedAt || ''
    };
  });
}

function cloneRemoteSteps(steps = []) {
  return steps.map((step) => ({
    ...step,
    aiOutputLines: Array.isArray(step.aiOutputLines) ? [...step.aiOutputLines] : [],
    aiPromptHistory: Array.isArray(step.aiPromptHistory) ? [...step.aiPromptHistory] : [],
    aiContext: step.aiContext && typeof step.aiContext === 'object'
      ? JSON.parse(JSON.stringify(step.aiContext))
      : null
  }));
}

function syncSelectedRemoteRuleFromState() {
  if (!state.selectedRemoteRuleId) return;
  const rule = state.remoteRules.find((item) => item.id === state.selectedRemoteRuleId);
  if (!rule) return;
  const listSummaryEdit = currentRemoteStepSummaryEdit();
  const currentAiStepId = state.selectedAiStepId;
  const currentDslStepId = state.selectedDslStepId;
  const activeStep = selectedAiStep();
  const activeDslStep = selectedDslStep();
  const activeDraft = activeStep?.aiPromptDraft || els.remoteAiPrompt?.value || '';
  const activeSummary = normalizeAiSummary(els.remoteAiSummary?.value || '');
  const summaryFocused = document.activeElement === els.remoteAiSummary;
  const scriptFocused = document.activeElement === els.remoteAiScript;
  const activeScript = els.remoteAiScript?.value || '';
  const dslFocused = [
    els.remoteDslSummary,
    els.remoteDslAction,
    els.remoteDslPath,
    els.remoteDslValue
  ].includes(document.activeElement);
  const activeDslDraft = activeDslStep ? {
    note: els.remoteDslSummary?.value || activeDslStep.note || '',
    enabled: els.remoteDslEnabled?.checked ?? activeDslStep.enabled !== false,
    action: els.remoteDslAction?.value || activeDslStep.action || '',
    path: els.remoteDslPath?.value || activeDslStep.path || '',
    value: els.remoteDslValue?.value ?? activeDslStep.value ?? ''
  } : null;
  state.remoteSteps = parseRemoteScriptForEditor(rule.script, rule);
  if (listSummaryEdit?.rowId) {
    const step = state.remoteSteps.find((item) => item.id === listSummaryEdit.rowId);
    if (step?.type === 'ai') {
      step.summary = normalizeAiSummary(listSummaryEdit.value);
    } else if (step) {
      step.note = listSummaryEdit.value;
    }
  }
  if (currentAiStepId && state.remoteSteps.some((step) => step.id === currentAiStepId && step.type === 'ai')) {
    state.selectedAiStepId = currentAiStepId;
    const step = selectedAiStep();
    if (step && activeDraft && (
      step.aiStatus === 'queued' ||
      step.aiStatus === 'running' ||
      document.activeElement === els.remoteAiPrompt
    )) {
      step.aiPromptDraft = activeDraft;
    }
    if (step && activeSummary && (summaryFocused || step.aiStatus === 'queued' || step.aiStatus === 'running')) {
      step.summary = activeSummary;
    }
    if (step && scriptFocused && activeStep?.pythonScript === step.pythonScript) {
      step.pythonScript = activeScript;
    }
  }
  if (currentDslStepId && state.remoteSteps.some((step) => step.id === currentDslStepId && step.type !== 'ai')) {
    state.selectedDslStepId = currentDslStepId;
    const step = selectedDslStep();
    if (step && dslFocused && activeDslDraft) {
      Object.assign(step, activeDslDraft);
    }
  }
  if (state.previewMode === 'remote') {
    renderSelectedRemoteRuleEditor();
  }
}

function renderSelectedRemoteRuleEditor() {
  if (state.previewMode !== 'remote') return;
  renderRemoteDslRows();
  renderRemoteRuleEditorMode();
}

function captureSavedStateAfterAiCompletion() {
  const statuses = {};
  let selectedAiCompleted = false;
  for (const rule of state.remoteRules || []) {
    for (const step of normalizeRemoteStepsForEditor(rule.steps || [])) {
      if (step.type !== 'ai') continue;
      const key = `${rule.id}:${step.id}`;
      const status = step.aiStatus || '';
      const previousStatus = state.lastAiStepStatuses[key] || '';
      statuses[key] = status;
      if (
        state.previewMode === 'remote' &&
        rule.id === state.selectedRemoteRuleId &&
        step.id === state.selectedAiStepId &&
        (status === 'succeeded' || status === 'failed' || status === 'stopped') &&
        (previousStatus === 'queued' || previousStatus === 'running')
      ) {
        selectedAiCompleted = true;
      }
    }
  }
  state.lastAiStepStatuses = statuses;
  if (selectedAiCompleted) {
    captureSavedEditorState();
    scheduleRemotePreview();
  }
}

function renderProxyStatus() {
  const recording = state.proxyRunning && state.recordingEnabled;
  const codexText = codexQueueText();
  const baseText = recording
    ? t('status.recording')
    : state.proxyRunning
      ? t('status.passThrough')
      : t('status.proxyStopped');
  els.proxyStatus.textContent = codexText ? `${baseText} · ${codexText}` : baseText;
  els.proxyStatus.classList.toggle('on', recording);
  els.proxyStatus.classList.toggle('off', !recording);
  renderAiStatusDialog();
  const proxyToggleTitle = recording
    ? t('status.stopRecordingTip')
    : t('status.startRecordingTip');
  setInstantTooltip(els.proxyToggleBtn, proxyToggleTitle);
  els.proxyToggleBtn.setAttribute('aria-label', recording ? t('status.stopRecording') : t('status.startRecording'));
  els.proxyToggleBtn.classList.toggle('danger-button', recording);
}

function codexQueueText() {
  const queue = state.codexQueue;
  if (!queue) return '';
  const parts = [];
  const aiRules = queue.aiRules || {};
  const aiRunning = Number(aiRules.running || 0);
  const aiPending = Number(aiRules.pending || 0);
  const aiTotal = aiRunning + aiPending;
  if (aiRunning || aiPending) {
    parts.push(t('ai.generationQueue', {
      running: aiRunning,
      total: aiTotal,
      pendingText: aiPending ? t('ai.pendingSuffix', { pending: aiPending }) : ''
    }));
  }
  const notes = queue.notes || {};
  const noteRunning = notes.running ? 1 : 0;
  const notePending = Number(notes.pending || 0);
  if (noteRunning || notePending) {
    parts.push(t('ai.noteQueue', {
      state: noteRunning ? t('note.generating') : t('common.queued'),
      running: noteRunning,
      total: notePending + noteRunning
    }));
  }
  const details = notes.details || {};
  const detailRunning = details.running ? 1 : 0;
  const detailPending = Number(details.pending || 0);
  if (detailRunning || detailPending) {
    parts.push(t('ai.detailQueue', {
      state: detailRunning ? t('note.generating') : t('common.queued'),
      running: detailRunning,
      total: detailPending + detailRunning
    }));
  }
  if (!parts.length) {
    const failed = Number(queue.failed || 0);
    if (!failed) {
      state.codexFailureSignature = '';
      state.codexFailureSeenAt = 0;
      return '';
    }
    const signature = `${failed}:${queue.lastError || ''}`;
    const now = Date.now();
    if (state.codexFailureSignature !== signature) {
      state.codexFailureSignature = signature;
      state.codexFailureSeenAt = now;
    }
    return now - state.codexFailureSeenAt < 60_000 ? t('ai.failedShort', { count: failed }) : '';
  }
  return parts.join(' · ');
}

function openAiStatusDialog() {
  renderAiStatusDialog();
  if (typeof els.aiStatusDialog?.showModal === 'function') {
    if (!els.aiStatusDialog.open) els.aiStatusDialog.showModal();
  } else {
    els.aiStatusDialog?.setAttribute('open', '');
  }
  reloadHealth().catch((error) => {
    console.error(error);
  });
}

function closeAiStatusDialog() {
  if (typeof els.aiStatusDialog?.close === 'function') {
    els.aiStatusDialog.close();
    return;
  }
  els.aiStatusDialog?.removeAttribute('open');
}

function renderAiStatusDialog() {
  if (!els.aiStatusDialogBody) return;
  const queue = state.codexQueue || {};
  const aiRules = queue.aiRules || {};
  const notes = queue.notes || {};
  const details = notes.details || {};
  const providerLabel = aiProviderLabel(state.aiProvider);
  const noteEnabled = state.aiNotesEnabled !== false && !aiProviderDisabled();
  const rows = [
    aiStatusCard(t('ai.scriptGeneration'), {
      running: Number(aiRules.running || 0),
      pending: Number(aiRules.pending || 0),
      completed: Number(aiRules.completed || 0),
      failed: Number(aiRules.failed || 0),
      current: Array.isArray(aiRules.current) ? aiRules.current : [],
      lastError: aiRules.lastError
    }),
    aiStatusCard(t('ai.noteAnalysis'), {
      running: notes.running ? 1 : 0,
      pending: Number(notes.pending || 0),
      completed: Number(notes.completed || 0),
      failed: Number(notes.failed || 0),
      current: notes.current ? [notes.current] : [],
      lastError: notes.lastError
    }),
    aiStatusCard(t('ai.detailAnalysis'), {
      running: details.running ? 1 : 0,
      pending: Number(details.pending || 0),
      completed: Number(details.completed || 0),
      failed: Number(details.failed || 0),
      current: details.current ? [details.current] : [],
      lastError: details.lastError
    })
  ];
  els.aiStatusDialogBody.innerHTML = `
    <div class="ai-status-summary">
      <div>${escapeHtml(t('ai.provider'))}：<span class="ai-status-value">${escapeHtml(providerLabel)}</span></div>
      <div>${escapeHtml(t('ai.autoNotes'))}：<span class="ai-status-value">${noteEnabled ? escapeHtml(t('ai.runningState')) : escapeHtml(t('ai.stoppedState'))}</span></div>
      <div>${escapeHtml(t('ai.totalQueue'))}：<span class="ai-status-value">${Number(queue.running || 0)} ${escapeHtml(t('ai.running'))} · ${Number(queue.pending || 0)} ${escapeHtml(t('ai.pending'))} · ${Number(queue.failed || 0)} ${escapeHtml(t('ai.failed'))}</span></div>
    </div>
    ${rows.join('')}
  `;
  if (els.aiWorkToggleBtn) {
    const disabled = aiProviderDisabled();
    els.aiWorkToggleBtn.disabled = disabled;
    els.aiWorkToggleBtn.textContent = noteEnabled ? t('actions.stop') : t('actions.start');
    els.aiWorkToggleBtn.classList.toggle('danger-button', noteEnabled);
    setInstantTooltip(els.aiWorkToggleBtn, disabled
      ? t('ai.disabledWorkTip')
      : noteEnabled
        ? t('ai.stopWorkTip')
        : t('ai.startWorkTip'));
  }
}

function aiStatusCard(title, data = {}) {
  const running = Number(data.running || 0);
  const pending = Number(data.pending || 0);
  const completed = Number(data.completed || 0);
  const failed = Number(data.failed || 0);
  const current = Array.isArray(data.current) ? data.current : [];
  const currentText = current
    .map((item) => [item.host, item.path].filter(Boolean).join('') || item.key || item.id || '')
    .filter(Boolean)
    .slice(0, 3)
    .join('；');
  const lastError = String(data.lastError || '').trim();
  return `
    <section class="ai-status-card">
      <div class="ai-status-card-head">
        <span>${escapeHtml(title)}</span>
        <span class="ai-status-value">${running ? escapeHtml(t('common.running')) : pending ? escapeHtml(t('common.queued')) : escapeHtml(t('common.idle'))}</span>
      </div>
      <div class="ai-status-row">
        <span>${escapeHtml(t('ai.runPending'))}</span>
        <span class="ai-status-value">${running} / ${pending}</span>
      </div>
      <div class="ai-status-row">
        <span>${escapeHtml(t('ai.completedFailed'))}</span>
        <span class="ai-status-value">${completed} / ${failed}</span>
      </div>
      ${currentText ? `<div class="ai-status-row"><span class="ai-status-current">${escapeHtml(t('ai.current'))}：${escapeHtml(currentText)}</span></div>` : ''}
      ${lastError ? `<div class="ai-status-row"><span class="ai-status-current">${escapeHtml(t('ai.lastFailure'))}：${escapeHtml(lastError)}</span></div>` : ''}
    </section>
  `;
}

async function toggleAiWork() {
  if (aiProviderDisabled()) return;
  const shouldStop = state.aiNotesEnabled !== false;
  els.aiWorkToggleBtn.disabled = true;
  els.aiWorkToggleBtn.textContent = shouldStop ? t('actions.stopping') : t('actions.starting');
  try {
    const result = await postJson(shouldStop ? '/api/ai/stop' : '/api/ai/start', {});
    if (result.settings) {
      state.aiProvider = result.settings.aiProvider || state.aiProvider;
      state.aiNotesEnabled = result.settings.aiNotesEnabled !== false;
    } else {
      state.aiNotesEnabled = !shouldStop;
    }
    if (result.status) state.codexQueue = result.status;
    await reloadHealth();
    await reloadSettings({ renderDetailOnly: true });
    renderAiSelector();
    renderAiStatusDialog();
  } catch (error) {
    console.error(error);
    window.alert(error.message || t('ai.toggleFailed'));
    renderAiStatusDialog();
  }
}

function aiProviderLabel(provider) {
  if (provider === 'none') return t('ai.none');
  if (provider === 'cursor') return 'Cursor';
  if (provider === 'claude') return 'Claude';
  return 'Codex';
}

function normalizeCaptureTabs(tabs, fallbackFilter) {
  const normalized = (Array.isArray(tabs) ? tabs : []).map((tab) => {
    const previewTabs = normalizePreviewWorkspaceTabs(tab.previewTabs);
    const tabHistory = normalizePreviewWorkspaceTabHistory(tab.previewTabHistory, tab.previewTabHistoryIndex, previewTabs);
    return {
      id: String(tab.id || ''),
      name: String(tab.name || '').trim(),
      filter: String(tab.filter || '').trim(),
      displayFilter: String(tab.displayFilter || '').trim(),
      projectPath: String(tab.filter || '').trim() ? String(tab.projectPath || '').trim() : '',
      terminal: normalizeTerminalState(tab.terminal),
      previewTabs,
      activePreviewTabId: normalizePreviewWorkspaceActiveTabId(tab.activePreviewTabId, previewTabs),
      previewTabHistory: tabHistory.history,
      previewTabHistoryIndex: tabHistory.index,
      transient: tab.transient === true
    };
  }).filter((tab) => tab.id).map((tab) => ({
    ...tab,
    name: tab.name || (tab.filter ? tab.filter : t('project.noDomain'))
  }));
  if (normalized.length) return normalized;
  const filter = String(fallbackFilter || '').trim();
  return [{
    id: createId('capture-tab'),
    name: filter || t('project.noDomain'),
    filter,
    displayFilter: '',
    projectPath: '',
    terminal: normalizeTerminalState(),
    previewTabs: [],
    activePreviewTabId: '',
    previewTabHistory: [],
    previewTabHistoryIndex: -1,
    transient: !filter
  }];
}

function mergeCaptureTabsFromSettings(tabs, fallbackFilter, fallbackDisplayFilter = '', options = {}) {
  const currentTab = state.captureTabs.find((tab) => tab.id === state.activeCaptureTabId) || state.captureTabs[0] || null;
  const transientTab = currentTab?.transient ? currentTab : null;
  const normalized = normalizeCaptureTabs(tabs, fallbackFilter);
  if (options.preserveExisting) {
    const settingsById = new Map(normalized.map((tab) => [tab.id, tab]));
    const mergedExisting = state.captureTabs.map((tab) => ({
      ...tab,
      ...(settingsById.get(tab.id) || {}),
      terminal: tab.terminal ? normalizeTerminalState(tab.terminal) : normalizeTerminalState(settingsById.get(tab.id)?.terminal),
      previewTabs: tab.previewTabs ? normalizePreviewWorkspaceTabs(tab.previewTabs) : normalizePreviewWorkspaceTabs(settingsById.get(tab.id)?.previewTabs),
      activePreviewTabId: tab.activePreviewTabId || settingsById.get(tab.id)?.activePreviewTabId || '',
      previewTabHistory: Array.isArray(tab.previewTabHistory) ? tab.previewTabHistory : [],
      previewTabHistoryIndex: Number.isFinite(tab.previewTabHistoryIndex) ? tab.previewTabHistoryIndex : -1
    }));
    return ensureCaptureTabs(mergedExisting, { createIfEmpty: false });
  }
  if (fallbackDisplayFilter && normalized.length === 1 && !normalized[0].displayFilter) {
    normalized[0].displayFilter = String(fallbackDisplayFilter || '').trim();
  }
  if (transientTab && !normalized.some((tab) => tab.id === transientTab.id)) {
    return [...normalized, transientTab];
  }
  const merged = normalized.map((tab) => (
    transientTab && tab.id === transientTab.id ? { ...tab, transient: false } : tab
  ));
  return ensureCaptureTabs(merged);
}

function ensureCaptureTabs(tabs = state.captureTabs, options = {}) {
  let nextTabs = Array.isArray(tabs) ? tabs.filter((tab) => tab?.id) : [];
  const transientTabs = nextTabs.filter((tab) => tab.transient && !String(tab.filter || '').trim());
  if (transientTabs.length > 1) {
    const keepId = state.activeCaptureTabId && transientTabs.some((tab) => tab.id === state.activeCaptureTabId)
      ? state.activeCaptureTabId
      : transientTabs[0].id;
    nextTabs = nextTabs.filter((tab) => !(tab.transient && !String(tab.filter || '').trim()) || tab.id === keepId);
  }
  if (!nextTabs.length && options.createIfEmpty !== false) {
    const tab = createBlankCaptureTab();
    nextTabs = [tab];
    state.activeCaptureTabId = tab.id;
  }
  state.captureTabs = nextTabs;
  return nextTabs;
}

function normalizeDomainHistory(domains = [], tabs = []) {
  const result = [];
  const pushDomain = (value) => {
    const domain = normalizeHostInput(value);
    if (domain && !result.includes(domain)) result.push(domain);
  };
  for (const domain of Array.isArray(domains) ? domains : []) {
    pushDomain(domain);
  }
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    pushDomain(tab?.filter);
  }
  return result.slice(0, 80);
}

function normalizeDomainProjectPaths(value = {}, tabs = []) {
  const result = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [domain, projectPath] of Object.entries(value)) {
      const normalized = normalizeHostInput(domain);
      const normalizedPath = String(projectPath || '').trim();
      if (normalized && normalizedPath) result[normalized] = normalizedPath;
    }
  }
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    const normalized = normalizeHostInput(tab?.filter);
    const projectPath = String(tab?.projectPath || '').trim();
    if (normalized && projectPath) result[normalized] = projectPath;
  }
  return result;
}

function createBlankCaptureTab() {
  const id = createId('capture-tab');
  state.transientCaptureTabId = id;
  return {
    id,
    name: t('project.noDomain'),
    filter: '',
    displayFilter: '',
    projectPath: '',
    terminal: normalizeTerminalState(),
    previewTabs: [],
    activePreviewTabId: '',
    previewTabHistory: [],
    previewTabHistoryIndex: -1,
    transient: true
  };
}

function persistedCaptureTabs() {
  persistPreviewWorkspaceToActiveCaptureTab();
  return state.captureTabs
    .filter((tab) => tab.transient !== true || String(tab.filter || '').trim())
    .map((tab) => ({
      id: tab.id,
      name: String(tab.name || tab.filter || t('project.noDomain')).trim(),
      filter: String(tab.filter || '').trim(),
      displayFilter: String(tab.displayFilter || '').trim(),
      projectPath: String(tab.filter || '').trim() ? String(tab.projectPath || '').trim() : '',
      terminal: persistedTerminalState(tab.terminal),
      previewTabs: normalizePreviewWorkspaceTabs(tab.previewTabs),
      activePreviewTabId: normalizePreviewWorkspaceActiveTabId(tab.activePreviewTabId, tab.previewTabs),
      previewTabHistory: normalizePreviewWorkspaceTabHistory(tab.previewTabHistory, tab.previewTabHistoryIndex, tab.previewTabs).history,
      previewTabHistoryIndex: normalizePreviewWorkspaceTabHistory(tab.previewTabHistory, tab.previewTabHistoryIndex, tab.previewTabs).index
    }));
}

function persistedTerminalState(value = {}) {
  const terminal = normalizeTerminalState(value);
  return {
    open: terminal.open,
    activeId: terminal.activeId,
    tabs: terminal.tabs.map((tab) => ({
      id: tab.id,
      name: tab.name
    }))
  };
}

function normalizePreviewWorkspaceTabs(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map((tab) => {
    const type = normalizePreviewWorkspaceTabType(tab?.type);
    const targetId = String(tab?.targetId || '').trim();
    if (!type || !targetId) return null;
    return {
      id: previewWorkspaceTabId(type, targetId),
      type,
      targetId,
      bodyTab: normalizePreviewBodyTab(tab?.bodyTab),
      ruleEditorMode: normalizePreviewRuleEditorMode(tab?.ruleEditorMode),
      ruleEditorStepId: String(tab?.ruleEditorStepId || '').trim(),
      remoteExampleTab: normalizeRemoteExampleTab(tab?.remoteExampleTab),
      title: String(tab?.title || '').trim()
    };
  }).filter(Boolean).reduce((tabs, tab) => {
    const existingIndex = tabs.findIndex((item) => item.id === tab.id);
    if (existingIndex >= 0) {
      tabs[existingIndex] = tab;
    } else {
      tabs.push(tab);
    }
    return tabs;
  }, []).slice(-previewWorkspaceTabLimit);
}

function normalizePreviewWorkspaceTabType(type) {
  const value = String(type || '').trim();
  return ['capture', 'rule', 'remote'].includes(value) ? value : '';
}

function normalizePreviewBodyTab(tab) {
  const value = String(tab || '').trim();
  return ['overview', 'query', 'requestHead', 'request', 'responseHead', 'response'].includes(value)
    ? value
    : 'response';
}

function normalizePreviewRuleEditorMode(mode) {
  const value = String(mode || '').trim();
  return ['list', 'dsl', 'ai'].includes(value) ? value : 'list';
}

function normalizeRemoteExampleTab(tab) {
  const value = String(tab || '').trim();
  return ['query', 'requestHead', 'responseHead', 'request', 'response'].includes(value)
    ? value
    : 'query';
}

function normalizePreviewWorkspaceActiveTabId(tabId, tabs = []) {
  const id = String(tabId || '').trim();
  const normalizedTabs = normalizePreviewWorkspaceTabs(tabs);
  if (normalizedTabs.some((tab) => tab.id === id)) return id;
  return normalizedTabs.length ? normalizedTabs[normalizedTabs.length - 1].id : '';
}

function normalizePreviewWorkspaceTabHistory(history = [], index = -1, tabs = state.previewOpenTabs) {
  const normalizedTabs = normalizePreviewWorkspaceTabs(tabs);
  const ids = new Set(normalizedTabs.map((tab) => tab.id));
  const normalized = (Array.isArray(history) ? history : [])
    .map((id) => String(id || '').trim())
    .filter((id) => id && ids.has(id));
  if (!normalized.length) {
    return { history: [], index: -1 };
  }
  for (const tab of normalizedTabs) {
    if (!normalized.includes(tab.id)) normalized.push(tab.id);
  }
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, normalized.length - 1));
  return { history: normalized, index: safeIndex };
}

function previewWorkspaceTabOrderHistory(activeTabId = state.activePreviewTabId, tabs = state.previewOpenTabs) {
  const normalizedTabs = normalizePreviewWorkspaceTabs(tabs);
  const history = normalizedTabs.map((tab) => tab.id);
  if (!history.length) return { history: [], index: -1 };
  const index = Math.max(0, history.indexOf(activeTabId || history[history.length - 1]));
  return { history, index };
}

function shouldUsePreviewWorkspaceTabOrderHistory() {
  return state.previewTabHistory.length < state.previewOpenTabs.length ||
    state.previewOpenTabs.some((tab, index) => state.previewTabHistory[index] !== tab.id);
}

function ensurePreviewWorkspaceTabHistory(options = {}) {
  const tabIds = state.previewOpenTabs.map((tab) => tab.id).filter(Boolean);
  if (!tabIds.length) {
    state.previewTabHistory = [];
    state.previewTabHistoryIndex = -1;
    return;
  }
  prunePreviewWorkspaceTabHistory();
  const activeId = state.activePreviewTabId && tabIds.includes(state.activePreviewTabId)
    ? state.activePreviewTabId
    : tabIds[tabIds.length - 1];
  if (!state.previewTabHistory.length ||
      (options.preferTabOrder === true && shouldUsePreviewWorkspaceTabOrderHistory())) {
    const tabOrderHistory = previewWorkspaceTabOrderHistory(activeId);
    state.previewTabHistory = tabOrderHistory.history;
    state.previewTabHistoryIndex = tabOrderHistory.index;
  }
  if (state.previewTabHistoryIndex < 0 || state.previewTabHistory[state.previewTabHistoryIndex] !== activeId) {
    const activeIndex = state.previewTabHistory.indexOf(activeId);
    if (activeIndex >= 0) state.previewTabHistoryIndex = activeIndex;
  }
}

function persistPreviewWorkspaceToActiveCaptureTab() {
  const tab = activeCaptureTab();
  if (!tab) return;
  syncCurrentPreviewWorkspaceTabState();
  tab.previewTabs = normalizePreviewWorkspaceTabs(state.previewOpenTabs);
  tab.activePreviewTabId = normalizePreviewWorkspaceActiveTabId(state.activePreviewTabId, tab.previewTabs);
  ensurePreviewWorkspaceTabHistory();
  const tabHistory = normalizePreviewWorkspaceTabHistory(state.previewTabHistory, state.previewTabHistoryIndex, tab.previewTabs);
  tab.previewTabHistory = tabHistory.history;
  tab.previewTabHistoryIndex = tabHistory.index;
}

function restorePreviewWorkspaceFromActiveCaptureTab(options = {}) {
  const tab = activeCaptureTab();
  state.previewOpenTabs = normalizePreviewWorkspaceTabs(tab?.previewTabs);
  state.activePreviewTabId = normalizePreviewWorkspaceActiveTabId(tab?.activePreviewTabId, state.previewOpenTabs);
  restorePreviewWorkspaceTabHistoryFromActiveCaptureTab();
  if (options.prune === true) {
    prunePreviewWorkspaceTabs({ selectReplacement: false, persist: false });
  }
  const activeTab = state.previewOpenTabs.find((item) => item.id === state.activePreviewTabId);
  if (activeTab && options.selectActive === true) {
    selectPreviewWorkspaceTab(activeTab.id, { persist: false }).catch((error) => {
      console.error(error);
    });
    return;
  }
  if (!activeTab) {
    clearCurrentPreviewSelection();
    clearPreview();
  }
  renderPreviewWorkspaceTabs();
  renderCaptures();
  renderRules();
  renderRemoteRules();
}

function resetPreviewWorkspaceTabHistory() {
  const tabOrderHistory = previewWorkspaceTabOrderHistory();
  state.previewTabHistory = tabOrderHistory.history;
  state.previewTabHistoryIndex = tabOrderHistory.index;
  syncBrowserPreviewHistory({ replace: true });
}

function restorePreviewWorkspaceTabHistoryFromActiveCaptureTab() {
  const tab = activeCaptureTab();
  const tabHistory = normalizePreviewWorkspaceTabHistory(tab?.previewTabHistory, tab?.previewTabHistoryIndex, state.previewOpenTabs);
  state.previewTabHistory = tabHistory.history;
  state.previewTabHistoryIndex = tabHistory.index;
  if (!state.previewTabHistory.length || !state.previewTabHistory.includes(state.activePreviewTabId)) {
    resetPreviewWorkspaceTabHistory();
  } else {
    ensurePreviewWorkspaceTabHistory({ preferTabOrder: true });
  }
  syncBrowserPreviewHistory({ replace: true });
}

function restorePreviewWorkspaceActiveSelection() {
  const activeTab = activePreviewTabState();
  if (!activeTab || !previewWorkspaceTabExists(activeTab)) return;
  if (activeTab.id === selectedPreviewWorkspaceTabId()) return;
  selectPreviewWorkspaceTab(activeTab.id, { persist: false }).catch((error) => {
    console.error(error);
  });
}

function persistPreviewWorkspaceAndSettings(options = {}) {
  persistPreviewWorkspaceToActiveCaptureTab();
  scheduleSettingsSave(options);
}

function persistedActiveCaptureTabId() {
  const persisted = persistedCaptureTabs();
  if (persisted.some((tab) => tab.id === state.activeCaptureTabId)) {
    return state.activeCaptureTabId;
  }
  return state.activeCaptureTabId || persisted[0]?.id || '';
}

function activeCaptureTab() {
  return state.captureTabs.find((tab) => tab.id === state.activeCaptureTabId) || state.captureTabs[0] || null;
}

function applyActiveCaptureTab() {
  ensureCaptureTabs();
  const tab = activeCaptureTab();
  if (!tab) {
    state.activeCaptureTabId = '';
    state.captureFilter = '';
    state.displayFilter = '';
    return;
  }
  state.activeCaptureTabId = tab.id;
  state.captureFilter = tab.filter || '';
  state.displayFilter = tab.displayFilter || '';
}

function updateActiveCaptureTab(patch) {
  const tab = activeCaptureTab();
  if (!tab) return;
  const previousTerminalProjectKey = activeTerminalProjectKey();
  const projectPathChanged = Object.hasOwn(patch, 'projectPath') && String(tab.projectPath || '') !== String(patch.projectPath || '');
  Object.assign(tab, patch);
  if (Object.hasOwn(patch, 'filter')) {
    tab.filter = normalizeHostInput(tab.filter);
    tab.name = String(tab.filter || '').trim() || t('project.noDomain');
  }
  if (!String(tab.filter || '').trim()) {
    tab.projectPath = '';
  }
  if (String(tab.filter || '').trim()) {
    tab.transient = false;
    if (state.transientCaptureTabId === tab.id) {
      state.transientCaptureTabId = '';
    }
  }
  ensureCaptureTabs();
  renderCaptureWorkspaceTabs();
  renderProjectPath();
  if (projectPathChanged) updateTerminalAfterProjectPathChange(previousTerminalProjectKey);
}

function renderCaptureWorkspaceTabs() {
  ensureCaptureTabs();
  els.captureWorkspaceTabs.innerHTML = '';
  for (const tab of state.captureTabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `capture-workspace-tab${tab.id === state.activeCaptureTabId ? ' active' : ''}`;
    button.innerHTML = `
      <span class="capture-workspace-close" aria-hidden="true">×</span>
      <span class="capture-workspace-title">${escapeHtml(captureTabLabel(tab))}</span>
    `;
    setInstantTooltip(button, tab.projectPath
      ? `${captureTabName(tab)}\n${tab.projectPath}`
      : captureTabName(tab));
    button.addEventListener('click', (event) => {
      if (event.target.closest('.capture-workspace-close')) {
        closeCaptureWorkspaceTab(tab.id);
        return;
      }
      switchCaptureWorkspaceTab(tab.id);
    });
    els.captureWorkspaceTabs.append(button);
  }
}

function captureTabCounts(tab) {
  const primaryCaptures = filterCaptures(state.captures, String(tab?.filter || ''));
  const filteredCaptures = filterCaptures(primaryCaptures, String(tab?.displayFilter || ''), { scope: 'secondary', includeNote: true });
  return {
    primary: primaryCaptures.length,
    visible: filteredCaptures.length,
    hasDisplayFilter: Boolean(String(tab?.displayFilter || '').trim())
  };
}

function captureTabLabel(tab) {
  return captureTabName(tab);
}

function captureTabName(tab) {
  return String(tab?.filter || tab?.name || t('project.noDomain')).trim() || t('project.noDomain');
}

function captureTabCountText(counts) {
  return counts.hasDisplayFilter ? `${counts.visible}/${counts.primary}` : String(counts.primary);
}

function renderProjectPath() {
  const tab = activeCaptureTab();
  const domain = currentProjectDomain();
  const projectPath = tab?.projectPath || '';
  els.projectPathInput.value = domain ? projectPath : '';
  const hidden = !domain || aiProviderDisabled();
  els.selectProjectPathBtn.hidden = hidden;
  els.selectProjectPathBtn.classList.toggle('is-hidden', hidden);
  if (!domain) {
    const hadStaleProjectPath = Boolean(tab?.projectPath);
    if (tab && tab.projectPath) tab.projectPath = '';
    els.selectProjectPathBtn.classList.remove('has-project');
    renderProjectPathGuide();
    setInstantTooltip(els.selectProjectPathBtn, '');
    els.selectProjectPathBtn.setAttribute('aria-label', t('project.selectDirectory'));
    renderDetailNoteButton();
    renderAskAiButton();
    if (hadStaleProjectPath) scheduleSettingsSave({ immediate: true });
    return;
  }
  els.selectProjectPathBtn.classList.toggle('has-project', Boolean(projectPath));
  const title = projectPath
    ? t('project.linkedDirectory', { path: projectPath })
    : state.projectPathGuideTabId === tab?.id
      ? t('project.needDirectory')
      : t('project.pickDirectoryTip');
  setInstantTooltip(els.selectProjectPathBtn, title);
  els.selectProjectPathBtn.setAttribute('aria-label', projectPath ? t('project.clearDirectory') : t('project.selectDirectory'));
  renderProjectPathGuide();
  renderDetailNoteButton();
  renderAskAiButton();
}

function renderProjectPathGuide() {
  const guide = els.projectPathGuide;
  if (!guide) return;
  const tab = activeCaptureTab();
  const shouldShow = Boolean(
    tab &&
    state.projectPathGuideTabId === tab.id &&
    currentProjectDomain() &&
    !aiProviderDisabled() &&
    !tab.projectPath &&
    state.activeTab === 'captures' &&
    !els.selectProjectPathBtn.hidden
  );
  guide.hidden = !shouldShow;
  if (!shouldShow) return;
  const buttonRect = els.selectProjectPathBtn.getBoundingClientRect();
  const spot = els.projectPathGuideSpot;
  const card = els.projectPathGuideCard;
  const hand = document.querySelector('.project-path-guide-hand');
  if (spot) {
    spot.style.left = `${buttonRect.left - 5}px`;
    spot.style.top = `${buttonRect.top - 5}px`;
    spot.style.width = `${buttonRect.width + 10}px`;
    spot.style.height = `${buttonRect.height + 10}px`;
  }
  if (card) {
    card.style.width = '';
    const cardWidth = Math.min(card.offsetWidth || 126, window.innerWidth - 24);
    const left = Math.max(8, Math.min(window.innerWidth - cardWidth - 8, buttonRect.left + (buttonRect.width / 2) - (cardWidth / 2)));
    const top = Math.min(window.innerHeight - 62, buttonRect.bottom + 31);
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(8, top)}px`;
    if (hand) {
      const handLeft = buttonRect.left + (buttonRect.width / 2) - 10;
      hand.style.left = `${Math.max(8, Math.min(window.innerWidth - 28, handLeft))}px`;
      hand.style.top = `${Math.max(8, Math.min(window.innerHeight - 62, buttonRect.bottom + 8))}px`;
    }
  }
}

function dismissProjectPathGuide() {
  if (!state.projectPathGuideTabId) return;
  state.projectPathGuideTabId = '';
  renderProjectPathGuide();
  renderProjectPath();
}

function currentProjectPath() {
  const domain = currentProjectDomain();
  if (!domain) return '';
  return String(activeCaptureTab()?.projectPath || '').trim();
}

function currentProjectDomain() {
  return normalizeHostInput(activeCaptureTab()?.filter || '');
}

function openGlobalSearchDialog() {
  renderGlobalSearchScope();
  renderGlobalSearchResults();
  if (typeof els.globalSearchDialog?.showModal === 'function') {
    if (!els.globalSearchDialog.open) els.globalSearchDialog.showModal();
  } else {
    els.globalSearchDialog?.setAttribute('open', '');
  }
  window.setTimeout(() => {
    els.globalSearchInput.value = state.globalSearchQuery || '';
    els.globalSearchInput.focus();
    els.globalSearchInput.select();
  });
}

function closeGlobalSearchDialog() {
  if (typeof els.globalSearchDialog?.close === 'function') {
    els.globalSearchDialog.close();
  } else {
    els.globalSearchDialog?.removeAttribute('open');
  }
}

async function runGlobalSearch() {
  const query = String(els.globalSearchInput?.value || '').trim();
  state.globalSearchQuery = query;
  state.globalSearchExpandedKeys.clear();
  if (!query) {
    state.globalSearchResults = [];
    state.globalSearchError = '';
    renderGlobalSearchResults();
    return;
  }
  state.globalSearchLoading = true;
  state.globalSearchError = '';
  renderGlobalSearchScope();
  renderGlobalSearchResults();
  try {
    const params = new URLSearchParams({
      q: query,
      domain: currentProjectDomain()
    });
    const result = await getJson(`/api/search?${params}`);
    if (state.globalSearchQuery !== query) return;
    state.globalSearchResults = Array.isArray(result.groups) ? result.groups : [];
    state.globalSearchError = '';
    renderGlobalSearchScope(result.domain || currentProjectDomain());
    renderGlobalSearchResults();
  } catch (error) {
    console.error(error);
    state.globalSearchResults = [];
    state.globalSearchError = error.message || t('globalSearch.failed');
  } finally {
    if (state.globalSearchQuery === query) {
      state.globalSearchLoading = false;
      renderGlobalSearchResults();
    }
  }
}

function renderGlobalSearchScope(domain = currentProjectDomain()) {
  if (!els.globalSearchScope) return;
  const scope = domain ? t('globalSearch.currentProject', { domain }) : t('globalSearch.allDomains');
  els.globalSearchScope.textContent = scope;
}

function renderGlobalSearchResults() {
  const container = els.globalSearchResults;
  if (!container) return;
  container.innerHTML = '';
  if (state.globalSearchError) {
    container.append(empty(state.globalSearchError));
    return;
  }
  if (state.globalSearchLoading) {
    container.append(empty(t('globalSearch.loading')));
    return;
  }
  const query = String(state.globalSearchQuery || '').trim();
  if (!query) {
    container.append(empty(t('globalSearch.start')));
    return;
  }
  const groups = Array.isArray(state.globalSearchResults) ? state.globalSearchResults : [];
  if (!groups.length) {
    container.append(empty(t('globalSearch.noResults')));
    return;
  }
  for (const group of groups) {
    container.append(renderGlobalSearchGroup(group));
  }
}

function renderGlobalSearchGroup(group = {}) {
  const expanded = state.globalSearchExpandedKeys.has(group.key);
  const article = document.createElement('article');
  article.className = `global-search-group${expanded ? ' expanded' : ''}`;
  const count = Array.isArray(group.items) ? group.items.length : 0;
  const note = String(group.note || '').trim();
  const endpoint = `${group.host || t('globalSearch.unknownHost')}${group.path || '/'}`;
  article.innerHTML = `
    <button class="global-search-group-head" type="button" aria-expanded="${String(expanded)}">
      <span class="global-search-title">
        <span class="global-search-endpoint">${escapeHtml(endpoint)}</span>
        ${note ? `<span class="global-search-note">${escapeHtml(note)}</span>` : ''}
      </span>
      <span class="global-search-count">${count}</span>
    </button>
    <div class="global-search-group-items"${expanded ? '' : ' hidden'}></div>
  `;
  article.querySelector('.global-search-group-head')?.addEventListener('click', () => {
    toggleGlobalSearchGroup(group.key);
  });
  const items = article.querySelector('.global-search-group-items');
  if (items && expanded) {
    for (const item of group.items || []) {
      items.append(renderGlobalSearchItem(item));
    }
  }
  return article;
}

function renderGlobalSearchItem(item = {}) {
  const row = document.createElement('div');
  row.className = 'global-search-item';
  const time = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
  row.innerHTML = `
    <div class="global-search-item-meta">
      <span>${escapeHtml(displayMethod(item.method))}</span>
      <span>${escapeHtml(String(item.statusCode || '-'))}</span>
      <span>${escapeHtml(time)}</span>
    </div>
    <div class="global-search-hit-buttons"></div>
  `;
  const buttons = row.querySelector('.global-search-hit-buttons');
  for (const match of item.matches || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'global-search-hit-btn';
    button.textContent = match.label || globalSearchMatchLabel(match.type);
    setInstantTooltip(button, match.snippet || '');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openGlobalSearchHit(item.id, match.type);
    });
    buttons.append(button);
  }
  return row;
}

function toggleGlobalSearchGroup(key = '') {
  if (!key) return;
  if (state.globalSearchExpandedKeys.has(key)) {
    state.globalSearchExpandedKeys.delete(key);
  } else {
    state.globalSearchExpandedKeys.add(key);
  }
  renderGlobalSearchResults();
}

async function openGlobalSearchHit(captureId, matchType) {
  if (!captureId) return;
  const keyword = String(state.globalSearchQuery || '').trim();
  closeGlobalSearchDialog();
  setActiveTab('captures', { autoSelect: false });
  await ensureCaptureSelected(captureId);
  setPreviewBodyTab(globalSearchPreviewTab(matchType), { preserveCurrentEditor: false });
  window.setTimeout(() => {
    locatePreviewFindKeyword(keyword, { showBarWhenMultiple: true, focusInput: false });
  }, 0);
}

function globalSearchPreviewTab(matchType) {
  if (matchType === 'query') return 'query';
  if (matchType === 'requestHead') return 'requestHead';
  if (matchType === 'responseHead') return 'responseHead';
  if (matchType === 'request') return 'request';
  return 'response';
}

function globalSearchMatchLabel(matchType) {
  if (matchType === 'query') return t('tabs.query');
  if (matchType === 'requestHead') return t('tabs.requestHead');
  if (matchType === 'responseHead') return t('tabs.responseHead');
  if (matchType === 'request') return t('tabs.requestBody');
  return t('tabs.responseBody');
}

function canSearchCurrentPreview() {
  return Boolean(currentPreviewFindTarget());
}

function shouldHandlePreviewFindShortcut(target) {
  if (els.previewFindBar?.contains(target)) return true;
  if (!isTextEntryElement(target)) return true;
  const previewTarget = currentPreviewFindTarget();
  return previewTarget?.element === target;
}

function openPreviewFindBar(options = {}) {
  if (!canSearchCurrentPreview()) return;
  state.previewFindOpen = true;
  els.previewFindBar.hidden = false;
  const selectedText = getCurrentSelectionText();
  const nextQuery = Object.hasOwn(options, 'query')
    ? String(options.query || '')
    : (selectedText || state.previewFindQuery || '');
  els.previewFindInput.value = nextQuery;
  updatePreviewFind(nextQuery, { select: true, preserveFocus: true });
  if (options.focusInput !== false) {
    window.setTimeout(() => {
      els.previewFindInput.focus();
      els.previewFindInput.select();
    });
  }
}

function closePreviewFindBar(options = {}) {
  state.previewFindOpen = false;
  state.previewFindQuery = '';
  state.previewFindMatches = [];
  state.previewFindIndex = -1;
  if (!options.keepSelection) clearPreviewFindDomMarks();
  els.previewFindBar.hidden = true;
  els.previewFindInput.value = '';
  updatePreviewFindCount();
}

function keepPreviewFindInputFocused() {
  window.setTimeout(() => {
    if (!els.previewFindBar.hidden) els.previewFindInput.focus();
  });
}

function handlePreviewFindOutsidePointerDown(event) {
  if (!state.previewFindOpen || els.previewFindBar.hidden) return;
  if (els.previewFindBar.contains(event.target)) return;
  closePreviewFindBar({ keepSelection: true });
}

function locatePreviewFindKeyword(query, options = {}) {
  state.previewFindQuery = String(query || '');
  state.previewFindMatches = previewFindMatchesForQuery(state.previewFindQuery);
  state.previewFindIndex = state.previewFindMatches.length ? 0 : -1;
  const shouldShow = options.showBarWhenMultiple === true
    ? state.previewFindMatches.length > 1
    : options.showBar === true;
  state.previewFindOpen = shouldShow;
  els.previewFindBar.hidden = !shouldShow;
  els.previewFindInput.value = state.previewFindQuery;
  updatePreviewFindCount();
  selectCurrentPreviewFindMatch({ preserveFocus: options.preserveFocus === true });
  if (shouldShow && options.focusInput !== false) {
    window.setTimeout(() => {
      els.previewFindInput.focus();
      els.previewFindInput.select();
    });
  }
}

function updatePreviewFind(query, options = {}) {
  state.previewFindQuery = String(query || '');
  state.previewFindMatches = previewFindMatchesForQuery(state.previewFindQuery);
  state.previewFindIndex = state.previewFindMatches.length ? 0 : -1;
  updatePreviewFindCount();
  if (options.select !== false) selectCurrentPreviewFindMatch({ preserveFocus: options.preserveFocus !== false });
}

function refreshPreviewFindForCurrentTab() {
  if (!state.previewFindOpen) {
    updatePreviewFindCount();
    return;
  }
  if (!canSearchCurrentPreview()) {
    closePreviewFindBar();
    return;
  }
  els.previewFindBar.hidden = false;
  updatePreviewFind(state.previewFindQuery, { select: false });
}

function movePreviewFind(delta, options = {}) {
  if (!state.previewFindMatches.length) return;
  const total = state.previewFindMatches.length;
  state.previewFindIndex = (state.previewFindIndex + delta + total) % total;
  updatePreviewFindCount();
  selectCurrentPreviewFindMatch({ preserveFocus: options.preserveFocus === true });
}

function updatePreviewFindCount() {
  const total = state.previewFindMatches.length;
  const current = total && state.previewFindIndex >= 0 ? state.previewFindIndex + 1 : 0;
  els.previewFindCount.textContent = `${current}/${total}`;
  els.previewFindPrev.disabled = !total;
  els.previewFindNext.disabled = !total;
}

function previewFindMatchesForQuery(query) {
  clearPreviewFindDomMarks();
  const needle = String(query || '');
  if (!needle) return [];
  const target = currentPreviewFindTarget();
  if (!target) return [];
  const lowerText = target.text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const matches = [];
  let index = 0;
  while (index <= lowerText.length) {
    const found = lowerText.indexOf(lowerNeedle, index);
    if (found < 0) break;
    matches.push({ target, start: found, end: found + needle.length });
    index = found + Math.max(needle.length, 1);
  }
  return matches;
}

function selectCurrentPreviewFindMatch(options = {}) {
  const match = state.previewFindMatches[state.previewFindIndex];
  if (!match) return;
  selectPreviewFindRange(match.target, match.start, match.end, options);
}

function currentPreviewFindTarget() {
  if (state.previewBodyTab === 'query') {
    if (!els.captureQueryEditor.hidden && !els.captureQueryPreview.hidden) {
      return { kind: 'dom', element: els.captureQueryPreview, text: elementPlainText(els.captureQueryPreview) };
    }
    if (!els.ruleQueryEditor.hidden && !els.ruleQueryInput.disabled && els.ruleQueryInput.offsetParent !== null) {
      return { kind: 'input', element: els.ruleQueryInput, text: String(els.ruleQueryInput.value || '') };
    }
    return null;
  }
  const diffBody = !els.captureDiffView.hidden
    ? els.captureDiffView.querySelector('.diff-body')
    : (!els.remoteExampleDiff.hidden ? els.remoteExampleDiff.querySelector('.diff-body') : null);
  if (diffBody) return { kind: 'dom', element: diffBody, text: elementPlainText(diffBody) };
  if (!els.bodyEditorStack.hidden) {
    if (!els.editor.hidden && !els.editor.disabled) {
      return { kind: 'textarea', element: els.editor, text: String(els.editor.value || '') };
    }
    if (!els.bodyHighlight.hidden) {
      return { kind: 'dom', element: els.bodyHighlight, text: elementPlainText(els.bodyHighlight) };
    }
  }
  if (!els.remoteExamplePreview.hidden) {
    return { kind: 'dom', element: els.remoteExamplePreview, text: elementPlainText(els.remoteExamplePreview) };
  }
  return null;
}

function selectPreviewFindRange(target, start, end, options = {}) {
  if (!target?.element) return;
  if (target.kind === 'input' || target.kind === 'textarea') {
    selectTextEntryRange(target.element, start, end, options);
    return;
  }
  selectDomTextRange(target.element, start, end, options);
}

function selectTextEntryRange(element, start, end, options = {}) {
  const previousFocus = document.activeElement;
  element.focus();
  element.setSelectionRange(start, end);
  const textBefore = String(element.value || '').slice(0, start);
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 20;
  const line = textBefore.split('\n').length - 1;
  element.scrollTop = Math.max(0, (line * lineHeight) - (element.clientHeight / 2));
  element.scrollLeft = 0;
  if (options.preserveFocus && previousFocus && previousFocus !== element) {
    previousFocus.focus?.({ preventScroll: true });
  }
}

function selectDomTextRange(root, start, end, options = {}) {
  clearPreviewFindDomMarks(root);
  const marker = markTextOffsets(root, start, end);
  if (!marker) {
    root.scrollIntoView({ block: 'center', inline: 'nearest' });
    return;
  }
  const rect = marker.getBoundingClientRect();
  scrollRangeIntoContainer(root, rect);
  if (options.preserveFocus && els.previewFindBar.contains(document.activeElement)) return;
}

function markTextOffsets(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isTextNodeVisible(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });
  let current = walker.nextNode();
  let offset = 0;
  let firstMarker = null;
  while (current) {
    const nextOffset = offset + current.nodeValue.length;
    if (end <= offset) break;
    if (start < nextOffset && end > offset) {
      const localStart = Math.max(0, start - offset);
      const localEnd = Math.min(current.nodeValue.length, end - offset);
      if (localEnd > localStart) {
        const marker = document.createElement('mark');
        marker.className = 'preview-find-match preview-find-match-active';
        marker.setAttribute('data-preview-find-match', 'true');
        const range = document.createRange();
        range.setStart(current, localStart);
        range.setEnd(current, localEnd);
        range.surroundContents(marker);
        if (!firstMarker) firstMarker = marker;
        current = marker.nextSibling;
        offset = nextOffset;
        if (!current) current = walker.nextNode();
        continue;
      }
    }
    offset = nextOffset;
    current = walker.nextNode();
  }
  return firstMarker;
}

function clearPreviewFindDomMarks(root = document) {
  const scope = root?.querySelectorAll ? root : document;
  scope.querySelectorAll('.preview-find-match').forEach((marker) => {
    const parent = marker.parentNode;
    if (!parent) return;
    while (marker.firstChild) {
      parent.insertBefore(marker.firstChild, marker);
    }
    parent.removeChild(marker);
    parent.normalize();
  });
}

function scrollRangeIntoContainer(root, rect) {
  const container = scrollableAncestor(root);
  if (!container || !rect?.height) {
    root.scrollIntoView({ block: 'center', inline: 'nearest' });
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const targetTop = rect.top - containerRect.top + container.scrollTop - (container.clientHeight / 2) + (rect.height / 2);
  container.scrollTop = Math.max(0, targetTop);
  const targetLeft = rect.left - containerRect.left + container.scrollLeft - 18;
  container.scrollLeft = Math.max(0, targetLeft);
}

function scrollableAncestor(element) {
  let current = element;
  while (current && current !== document.body) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`)) return current;
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function elementPlainText(element) {
  if (!element) return '';
  if (!element.classList?.contains('collapsible-json-preview')) return element.textContent || '';
  return visibleElementPlainText(element);
}

function visibleElementPlainText(element) {
  if (!element) return '';
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isTextNodeVisible(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });
  let text = '';
  let current = walker.nextNode();
  while (current) {
    text += current.nodeValue || '';
    current = walker.nextNode();
  }
  return text;
}

function isTextNodeVisible(node) {
  let current = node?.parentElement;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (current.hidden) return false;
    if (current.getAttribute('aria-hidden') === 'true') return false;
    current = current.parentElement;
  }
  return true;
}

function getCurrentSelectionText() {
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return String(active.value || '').slice(start, end);
    }
  }
  return String(window.getSelection()?.toString() || '').trim();
}

async function ensureDomainProjectInitialized() {
  if (state.domainProjectsInitialized) return;
  await openDomainProjectDialog(state.requireDomainHistorySelection ? 'initialHistory' : 'initial');
}

function openDomainProjectDialog(mode = 'add') {
  state.domainDialogMode = mode;
  renderDomainProjectDialog(mode);
  if (typeof els.domainProjectDialog.showModal === 'function') {
    if (!els.domainProjectDialog.open) els.domainProjectDialog.showModal();
  } else {
    els.domainProjectDialog.setAttribute('open', '');
  }
  window.setTimeout(() => {
    if (mode !== 'initialHistory') {
      els.domainProjectInput?.focus();
    }
  });
  if (mode !== 'initial') return Promise.resolve();
  return new Promise((resolve) => {
    state.domainDialogResolve = resolve;
  });
}

function renderDomainProjectDialog(mode) {
  const initial = mode === 'initial';
  const initialHistory = mode === 'initialHistory';
  const historyOnly = initialHistory;
  els.domainProjectDialogTitle.textContent = t('project.dialog.openTitle');
  els.domainProjectDialogText.textContent = initialHistory
    ? t('project.dialog.initialHistory')
    : initial
    ? t('project.dialog.initial')
    : t('project.dialog.add');
  els.domainProjectInput.hidden = historyOnly;
  els.domainProjectInput.value = '';
  els.domainProjectInput.placeholder = 'api.example.com';
  els.domainProjectNoneBtn.hidden = historyOnly;
  els.domainProjectCancelBtn.hidden = initial || initialHistory;
  els.domainProjectSaveBtn.hidden = historyOnly;
  els.domainProjectSaveBtn.textContent = initial ? t('actions.open') : t('actions.add');
  renderDomainHistoryList(true);
}

function renderDomainHistoryList(visible) {
  if (els.domainHistoryTitle) {
    els.domainHistoryTitle.hidden = !visible;
    els.domainHistoryTitle.textContent = t('project.dialog.historyTitle');
  }
  els.domainHistoryList.hidden = !visible;
  els.domainHistoryList.innerHTML = '';
  if (!visible) return;
  const domains = normalizeDomainHistory(state.domainHistory, state.captureTabs);
  if (!domains.length) {
    els.domainHistoryList.append(empty(state.domainDialogMode === 'initialHistory'
      ? t('project.dialog.noHistoryInitial')
      : t('project.dialog.noHistory')));
    return;
  }
  for (const domain of domains) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'domain-history-item';
    button.innerHTML = `
      <span class="domain-history-name">${escapeHtml(domain)}</span>
      <span class="domain-history-delete" role="button" tabindex="-1" aria-label="${escapeHtml(t('actions.delete'))}" title="${escapeHtml(t('actions.delete'))}">×</span>
    `;
    button.addEventListener('click', () => {
      selectOrAddDomainProject(domain);
      closeDomainProjectDialog();
    });
    button.querySelector('.domain-history-delete')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeDomainHistoryItem(domain);
    });
    els.domainHistoryList.append(button);
  }
}

function removeDomainHistoryItem(domain) {
  const target = normalizeHostInput(domain);
  state.domainHistory = normalizeDomainHistory(state.domainHistory, state.captureTabs)
    .filter((item) => normalizeHostInput(item) !== target);
  renderDomainHistoryList(true);
  scheduleSettingsSave({ immediate: true });
}

function closeDomainProjectDialog() {
  if (!state.domainProjectsInitialized && (state.domainDialogMode === 'initial' || state.domainDialogMode === 'initialHistory')) return;
  if (typeof els.domainProjectDialog.close === 'function') {
    els.domainProjectDialog.close();
  } else {
    els.domainProjectDialog.removeAttribute('open');
  }
  resolveDomainDialog();
}

function resolveDomainDialog() {
  const resolve = state.domainDialogResolve;
  state.domainDialogResolve = null;
  state.domainDialogMode = '';
  if (resolve) resolve();
}

function saveDomainProjectFromDialog(options = {}) {
  const domain = options.unspecified ? '' : normalizeHostInput(els.domainProjectInput.value);
  if (!options.unspecified && !domain) {
    els.domainProjectInput.focus();
    return;
  }
  selectOrAddDomainProject(domain, { unspecified: options.unspecified });
  closeDomainProjectDialog();
}

function selectOrAddDomainProject(domain, options = {}) {
  const normalized = normalizeHostInput(domain);
  const existing = state.captureTabs.find((tab) => normalizeHostInput(tab.filter) === normalized && (normalized || !tab.filter));
  parkActivePreviewPane();
  persistPreviewWorkspaceToActiveCaptureTab();
  const tab = existing || {
    id: createId('capture-tab'),
    name: normalized || t('project.noDomain'),
    filter: normalized,
    displayFilter: '',
    projectPath: normalized ? state.domainProjectPaths[normalized] || '' : '',
    terminal: normalizeTerminalState(),
    previewTabs: [],
    activePreviewTabId: '',
    previewTabHistory: [],
    previewTabHistoryIndex: -1,
    transient: false
  };
  if (!existing) {
    const withoutTransientBlank = state.captureTabs.filter((item) => !(item.transient && !String(item.filter || '').trim()));
    state.captureTabs = [...withoutTransientBlank, tab];
  }
  tab.name = normalized || t('project.noDomain');
  tab.filter = normalized;
  if (normalized && !tab.projectPath && state.domainProjectPaths[normalized]) {
    tab.projectPath = state.domainProjectPaths[normalized];
  }
  tab.transient = false;
  state.activeCaptureTabId = tab.id;
  state.domainProjectsInitialized = true;
  state.requireDomainHistorySelection = false;
  if (normalized) {
    state.domainHistory = normalizeDomainHistory([normalized, ...state.domainHistory], state.captureTabs);
  }
  applyActiveCaptureTab();
  restorePreviewWorkspaceFromActiveCaptureTab({ prune: true, selectActive: true });
  els.displayFilter.value = state.displayFilter;
  renderCaptureWorkspaceTabs();
  renderProjectPath();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  scheduleSettingsSave({ immediate: true });
  promptProjectPathForActiveDomain();
}

function switchCaptureWorkspaceTab(tabId) {
  const tab = state.captureTabs.find((item) => item.id === tabId);
  if (!tab) return;
  if (tab.id === state.activeCaptureTabId) return;
  parkActivePreviewPane();
  persistPreviewWorkspaceToActiveCaptureTab();
  state.activeCaptureTabId = tab.id;
  state.captureFilter = tab.filter || '';
  state.displayFilter = tab.displayFilter || '';
  restorePreviewWorkspaceFromActiveCaptureTab({ prune: true, selectActive: true });
  els.displayFilter.value = state.displayFilter;
  renderCaptureWorkspaceTabs();
  renderProjectPath();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  promptProjectPathForActiveDomain();
  updateTerminalAfterProjectSwitch();
  if (!tab.transient) {
    scheduleSettingsSave({ immediate: true });
  }
}

function closeCaptureWorkspaceTab(tabId) {
  const tab = state.captureTabs.find((item) => item.id === tabId);
  if (!tab) return;
  parkActivePreviewPane();
  persistPreviewWorkspaceToActiveCaptureTab();
  clearPreviewPaneCacheForCaptureTab(tab.id);
  disposeTerminalInstancesForCaptureTab(tab);
  const isUnspecifiedTab = !normalizeHostInput(tab.filter);
  const remainingTabs = state.captureTabs.filter((item) => item.id !== tab.id);
  if (isUnspecifiedTab && !remainingTabs.length) {
    state.captureTabs = [];
    state.activeCaptureTabId = '';
    state.captureFilter = '';
    state.displayFilter = '';
    state.domainProjectsInitialized = false;
    state.requireDomainHistorySelection = true;
    patchJson('/api/settings', {
      captureFilter: '',
      displayFilter: '',
      captureTabs: [],
      activeCaptureTabId: '',
      domainHistory: normalizeDomainHistory(state.domainHistory, state.captureTabs),
      domainProjectPaths: normalizeDomainProjectPaths(state.domainProjectPaths, state.captureTabs),
      domainProjectsInitialized: false,
      requireDomainHistorySelection: true
    }).catch((error) => {
      console.error(error);
    }).finally(() => {
      window.location.assign('/_electron/quit');
    });
    return;
  }
  const wasActive = tab.id === state.activeCaptureTabId;
  state.captureTabs = remainingTabs;
  if (wasActive) {
    state.activeCaptureTabId = state.captureTabs[0]?.id || '';
  }
  ensureCaptureTabs();
  applyActiveCaptureTab();
  restorePreviewWorkspaceFromActiveCaptureTab({ prune: true, selectActive: true });
  els.displayFilter.value = state.displayFilter;
  renderCaptureWorkspaceTabs();
  renderProjectPath();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  scheduleSettingsSave({ immediate: true });
}

async function selectProjectPath() {
  if (!currentProjectDomain()) return;
  try {
    const result = await postJson('/api/project-path/select', {});
    if (!result.projectPath) return;
    state.projectPathGuideTabId = '';
    const domain = currentProjectDomain();
    if (domain) {
      state.domainProjectPaths = {
        ...state.domainProjectPaths,
        [domain]: result.projectPath
      };
    }
    updateActiveCaptureTab({ projectPath: result.projectPath });
    scheduleSettingsSave();
  } catch (error) {
    window.alert(error.message || t('project.selectPathFailed'));
  }
}

function clearProjectPath() {
  const tab = activeCaptureTab();
  if (!tab) return;
  state.projectPathGuideTabId = '';
  const domain = currentProjectDomain();
  if (domain) {
    const nextPaths = { ...state.domainProjectPaths };
    delete nextPaths[domain];
    state.domainProjectPaths = nextPaths;
  }
  updateActiveCaptureTab({ projectPath: '' });
  state.projectPathPromptedTabs.add(tab.id);
  scheduleSettingsSave();
}

function toggleProjectPath() {
  if (!currentProjectDomain()) return;
  const tab = activeCaptureTab();
  if (tab?.projectPath) {
    clearProjectPath();
    return;
  }
  selectProjectPath();
}

function promptProjectPathForActiveDomain() {
  const tab = activeCaptureTab();
  const domain = currentProjectDomain();
  if (!tab || !domain || aiProviderDisabled() || tab.projectPath) return;
  if (state.projectPathPromptedTabs.has(tab.id)) return;
  state.projectPathPromptedTabs.add(tab.id);
  state.projectPathGuideTabId = tab.id;
  if (state.activeTab !== 'captures') {
    setActiveTab('captures');
  }
  renderProjectPath();
  window.requestAnimationFrame(() => renderProjectPathGuide());
}

async function toggleCaptureViewMode() {
  await setCaptureTreeViewEnabled(!(state.captureTreeViewEnabled === true));
}

async function setCaptureTreeViewEnabled(treeViewEnabled) {
  const previousTreeViewEnabled = state.captureTreeViewEnabled === true;
  const previousShouldMerge = shouldMergeCaptureList();
  state.captureTreeViewEnabled = treeViewEnabled === true;
  syncSettingsDialogControls();
  renderCaptureViewModeButton();
  if (pageMode !== 'settings') {
    refreshCaptureMergeDependentPreview();
    renderCaptures();
  }
  await patchJson('/api/settings', { captureTreeViewEnabled: state.captureTreeViewEnabled });
  if (pageMode !== 'settings') {
    if (previousShouldMerge !== shouldMergeCaptureList() || previousTreeViewEnabled !== (state.captureTreeViewEnabled === true)) {
      await reloadCaptures({ replace: true });
    } else {
      renderCaptures();
    }
    focusActiveSideList();
  }
}

function renderCaptureViewModeButton() {
  if (!els.captureViewModeBtn) return;
  const isTree = state.captureTreeViewEnabled === true;
  els.captureViewModeBtn.innerHTML = isTree
    ? `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 5h5v5H6zM13 14h5v5h-5zM6 14h5v5H6z"/>
        <path d="M11 7.5h3v9.5M11 16.5h2"/>
      </svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h.01M6 12h.01M6 17h.01"/>
        <path d="M10 7h8M10 12h8M10 17h8"/>
      </svg>`;
  const title = isTree ? t('capture.viewTreeTip') : t('capture.viewListTip');
  setInstantTooltip(els.captureViewModeBtn, title);
  els.captureViewModeBtn.setAttribute('aria-label', title);
}

async function toggleProxyService() {
  const startRecording = !state.recordingEnabled || !state.proxyRunning;
  els.proxyToggleBtn.disabled = true;
  try {
    if (!state.proxyRunning) {
      await postJson('/api/proxy/start', {});
    }
    await postJson(startRecording ? '/api/recording/start' : '/api/recording/stop', {});
    await reloadHealth();
  } catch (error) {
    console.error(error);
    window.alert(error.message || t('status.toggleFailed'));
  } finally {
    els.proxyToggleBtn.disabled = false;
  }
}

async function refreshAdbProxyStatus() {
  if (state.adbStatusRefreshing) return;
  state.adbStatusRefreshing = true;
  try {
    const result = await getJson('/api/adb/proxy/status');
    state.adbDevices = Array.isArray(result.devices) ? result.devices : [];
  } catch (error) {
    console.error(error);
  } finally {
    state.adbStatusRefreshing = false;
    renderAdbProxyActions();
    maybeShowAdbProxyGuide();
  }
}

function connectAdbDeviceTracker() {
  if (state.adbTrackSource || document.hidden || !window.EventSource) return;
  window.clearTimeout(state.adbTrackReconnectTimer);
  state.adbTrackReconnectTimer = null;

  const source = new EventSource('/api/adb/devices/track');
  state.adbTrackSource = source;
  source.addEventListener('devices', (event) => {
    const data = parseEventSourceJson(event);
    state.adbDevices = mergeTrackedAdbDevices(Array.isArray(data.devices) ? data.devices : []);
    renderAdbProxyActions();
    refreshAdbProxyStatus();
  });
  source.addEventListener('adb-error', (event) => {
    const data = parseEventSourceJson(event);
    if (data.error) {
      console.error(data.error);
    }
  });
  source.addEventListener('close', () => {
    reconnectAdbDeviceTracker();
  });
  source.onerror = reconnectAdbDeviceTracker;
}

function reconnectAdbDeviceTracker() {
  closeAdbDeviceTracker();
  if (document.hidden) return;
  state.adbTrackReconnectTimer = window.setTimeout(connectAdbDeviceTracker, 5000);
}

function closeAdbDeviceTracker() {
  if (state.adbTrackSource) {
    state.adbTrackSource.close();
    state.adbTrackSource = null;
  }
  window.clearTimeout(state.adbTrackReconnectTimer);
  state.adbTrackReconnectTimer = null;
}

function mergeTrackedAdbDevices(devices) {
  return devices.map((device) => {
    const previous = state.adbDevices.find((item) => item.id === device.id);
    return {
      ...(previous || {}),
      ...device,
      proxy: previous?.proxy || '',
      proxyEnabled: previous?.proxyEnabled || false,
      matchesCurrentProxy: previous?.matchesCurrentProxy || false
    };
  });
}

function maybeShowAdbProxyGuide() {
  if (pageMode !== 'main' || document.hidden) {
    closeAdbProxyGuide();
    return;
  }
  const available = state.adbDevices.filter((device) => device.available);
  const availableIds = new Set(available.map((device) => device.id).filter(Boolean));
  for (const id of [...state.adbGuideKnownDeviceIds]) {
    if (!availableIds.has(id)) state.adbGuideKnownDeviceIds.delete(id);
  }

  if (state.adbGuidePromptDeviceId) {
    const promptedDevice = available.find((item) => item.id === state.adbGuidePromptDeviceId);
    if (promptedDevice && !promptedDevice.matchesCurrentProxy) {
      renderAdbProxyGuide(promptedDevice);
      return;
    }
    closeAdbProxyGuide();
    state.adbGuidePromptDeviceId = '';
  }

  const dismissedIds = readDismissedAdbProxyGuideDeviceIds();
  const device = available.find((item) => {
    if (!item.id || state.adbGuideKnownDeviceIds.has(item.id)) return false;
    if (item.matchesCurrentProxy) return false;
    return !dismissedIds.has(item.id);
  });
  available.forEach((item) => {
    if (item.id) state.adbGuideKnownDeviceIds.add(item.id);
  });
  if (!device) return;
  state.adbGuidePromptDeviceId = device.id;
  renderAdbProxyGuide(device);
}

function renderAdbProxyGuide(device) {
  const guide = els.adbProxyGuide;
  if (!guide || !els.adbProxyActions || !device?.id) return;
  const button = els.adbProxyActions.querySelector('.adb-proxy-button');
  if (!button) return;

  guide.hidden = false;
  guide.dataset.deviceId = device.id;
  if (els.adbProxyGuideBody) {
    els.adbProxyGuideBody.textContent = t('adb.guide');
  }
  positionAdbProxyGuide(button);
}

function positionAdbProxyGuide(button) {
  const spot = els.adbProxyGuideSpot;
  const card = els.adbProxyGuideCard;
  const hand = els.adbProxyGuideHand;
  if (!button || !spot || !card) return;

  const buttonRect = button.getBoundingClientRect();
  spot.style.left = `${buttonRect.left - 5}px`;
  spot.style.top = `${buttonRect.top - 5}px`;
  spot.style.width = `${buttonRect.width + 10}px`;
  spot.style.height = `${buttonRect.height + 10}px`;

  card.style.width = '';
  const cardWidth = Math.min(card.offsetWidth || 126, window.innerWidth - 24);
  const cardHeight = card.offsetHeight || 28;
  const left = Math.max(8, Math.min(window.innerWidth - cardWidth - 8, buttonRect.right + 42));
  const top = Math.max(8, Math.min(window.innerHeight - cardHeight - 8, buttonRect.top + (buttonRect.height / 2) - (cardHeight / 2)));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;

  if (hand) {
    hand.style.left = `${Math.max(8, Math.min(window.innerWidth - 28, buttonRect.right + 14))}px`;
    hand.style.top = `${Math.max(8, Math.min(window.innerHeight - 28, buttonRect.top + (buttonRect.height / 2) - 10))}px`;
  }
}

function closeAdbProxyGuide() {
  if (els.adbProxyGuide) {
    els.adbProxyGuide.hidden = true;
    els.adbProxyGuide.removeAttribute('data-device-id');
  }
}

function dismissAdbProxyGuide(deviceId) {
  closeAdbProxyGuide();
  state.adbGuidePromptDeviceId = '';
  if (!deviceId) return;
  const dismissedIds = readDismissedAdbProxyGuideDeviceIds();
  dismissedIds.add(deviceId);
  writeDismissedAdbProxyGuideDeviceIds(dismissedIds);
}

function handleAdbProxyGuideOutsidePointerDown(event) {
  if (!els.adbProxyGuide || els.adbProxyGuide.hidden || !state.adbGuidePromptDeviceId) return;
  if (event.target?.closest?.('#adb-proxy-actions')) return;
  dismissAdbProxyGuide(state.adbGuidePromptDeviceId);
}

function readDismissedAdbProxyGuideDeviceIds() {
  try {
    const values = JSON.parse(localStorage.getItem(adbProxyGuideDismissedStorageKey) || '[]');
    return new Set(Array.isArray(values) ? values.filter(Boolean).map(String) : []);
  } catch (_error) {
    return new Set();
  }
}

function writeDismissedAdbProxyGuideDeviceIds(ids) {
  localStorage.setItem(adbProxyGuideDismissedStorageKey, JSON.stringify([...ids]));
}

function parseEventSourceJson(event) {
  try {
    return JSON.parse(event.data || '{}');
  } catch (_error) {
    return {};
  }
}

function renderAdbProxyActions() {
  els.adbProxyActions.innerHTML = '';
  const available = state.adbDevices.filter((device) => device.available);
  if (!available.length) {
    state.adbDeviceMenuOpen = false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'adb-proxy-button rail-button';
    button.innerHTML = adbNoDeviceMarkHtml();
    setInstantTooltip(button, t('adb.refreshDevices'));
    button.setAttribute('aria-label', t('adb.refreshDevices'));
    button.addEventListener('click', refreshAdbProxyStatus);
    els.adbProxyActions.append(button);
    return;
  }

  const singleDevice = available.length === 1 ? available[0] : null;
  if (singleDevice) {
    state.adbDeviceMenuOpen = false;
  }
  const hasCurrentProxyDevice = available.some((device) => device.matchesCurrentProxy);
  const hasForeignProxyDevice = !hasCurrentProxyDevice && available.some((device) => device.proxyEnabled);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    'adb-proxy-button',
    'rail-button',
    'has-device',
    hasCurrentProxyDevice ? 'is-connected' : '',
    hasForeignProxyDevice ? 'is-foreign-proxy' : ''
  ].filter(Boolean).join(' ');
  button.innerHTML = adbProxyMarkHtml();
  if (singleDevice) {
    const text = adbDeviceTooltip(singleDevice);
    setInstantTooltip(button, text);
    button.setAttribute('aria-label', (singleDevice.matchesCurrentProxy || singleDevice.proxyEnabled)
      ? t('adb.clearProxyFor', { device: deviceDisplayName(singleDevice) })
      : t('adb.setProxyFor', { device: deviceDisplayName(singleDevice) }));
    button.addEventListener('click', () => toggleAdbProxy(singleDevice, button));
  } else {
    setInstantTooltip(button, t('adb.chooseProxy'));
    button.setAttribute('aria-label', t('adb.chooseDevice'));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleAdbDeviceMenu(available);
    });
  }
  els.adbProxyActions.append(button);
  if (!singleDevice && state.adbDeviceMenuOpen) {
    renderAdbDeviceMenu(available);
  }
}

function adbNoDeviceMarkHtml() {
  return `
    <svg class="adb-proxy-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.4"/>
      <path d="M10.5 5.4h3"/>
      <path d="M11 18.2h2"/>
      <path class="adb-proxy-icon-slash" d="M5 5l14 14"/>
    </svg>
  `;
}

function adbProxyMarkHtml() {
  return `
    <svg class="adb-proxy-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="2.75" width="10" height="18.5" rx="2.4"/>
      <path d="M10.5 5h3"/>
      <path d="M11 18h2"/>
    </svg>
  `;
}

function adbDeviceTooltip(device) {
  const shouldClear = device.matchesCurrentProxy || device.proxyEnabled;
  const actionDescription = shouldClear
    ? t('adb.clearProxyTip')
    : t('adb.setProxyTip');
  const currentProxyDescription = device.proxy
    ? t('adb.currentProxy', { proxy: device.proxy })
    : t('adb.noProxy');
  const displayName = deviceDisplayName(device);
  return `${actionDescription}\n${displayName} ${currentProxyDescription}`;
}

function toggleAdbDeviceMenu(devices) {
  if (state.adbDeviceMenuOpen) {
    closeAdbDeviceMenu();
    return;
  }
  state.adbDeviceMenuOpen = true;
  renderAdbDeviceMenu(devices);
}

function closeAdbDeviceMenu() {
  state.adbDeviceMenuOpen = false;
  removeAdbDeviceMenu();
}

function removeAdbDeviceMenu() {
  els.adbProxyActions.querySelectorAll('.adb-device-menu').forEach((menu) => menu.remove());
}

function renderAdbDeviceMenu(devices) {
  removeAdbDeviceMenu();
  const menu = document.createElement('div');
  menu.className = 'adb-device-menu';
  menu.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  for (const device of devices) {
    const shouldClear = device.matchesCurrentProxy || device.proxyEnabled;
    const displayName = deviceDisplayName(device);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = shouldClear ? 'danger-button' : '';
    item.innerHTML = `
      <span>${escapeHtml(shouldClear ? t('adb.clearProxy') : t('adb.setProxy'))}</span>
      <small>${escapeHtml(displayName)}</small>
    `;
    setInstantTooltip(item, adbDeviceTooltip(device));
    item.addEventListener('click', () => {
      closeAdbDeviceMenu();
      toggleAdbProxy(device, item);
    });
    menu.append(item);
  }
  els.adbProxyActions.append(menu);
}

function deviceDisplayName(device) {
  return device.displayName || device.model || device.product || device.deviceName || device.id;
}

async function toggleAdbProxy(device, button) {
  const shouldClear = device.matchesCurrentProxy || device.proxyEnabled;
  button.disabled = true;
  try {
    const payload = { deviceId: device.id };
    if (!shouldClear) {
      payload.host = firstLanIp();
    }
    await postJson(shouldClear ? '/api/adb/proxy/clear' : '/api/adb/proxy/set', payload);
    await refreshAdbProxyStatus();
  } catch (error) {
    console.error(error);
    window.alert(adbErrorMessage(error));
    await refreshAdbProxyStatus();
  }
}

async function setAdbProxyForDevice(device, button, options = {}) {
  if (!device?.id) return;
  if (button) button.disabled = true;
  try {
    await postJson('/api/adb/proxy/set', {
      deviceId: device.id,
      host: firstLanIp()
    });
    if (options.closeGuide) {
      closeAdbProxyGuide();
      state.adbGuidePromptDeviceId = '';
    }
    await refreshAdbProxyStatus();
  } catch (error) {
    console.error(error);
    window.alert(adbErrorMessage(error));
    await refreshAdbProxyStatus();
  } finally {
    if (button) button.disabled = false;
  }
}

function scheduleAdbStatusPolling() {
  window.clearTimeout(state.adbStatusTimer);
  if (document.hidden) return;
  state.adbStatusTimer = window.setTimeout(async () => {
    await refreshAdbProxyStatus();
    scheduleAdbStatusPolling();
  }, 5 * 60 * 1000);
}

async function handleVisibilityChange() {
  if (document.hidden) {
    closeBackgroundConnections();
    return;
  }
  if (state.eventSource) {
    await reloadHealth();
    await reloadCaptures();
  } else {
    await refresh();
  }
  await refreshAdbProxyStatus();
  connectAppEvents();
  connectAdbDeviceTracker();
  scheduleAdbStatusPolling();
}

function firstLanIp() {
  return String(els.localIp.textContent || '')
    .split('/')
    .map((item) => item.trim())
    .find(Boolean) || '';
}

function adbErrorMessage(error) {
  const message = error?.message || t('adb.failed');
  if (message.includes('ENOENT') || message.includes('adb')) {
    return `${message}\n\n${t('adb.pathHint')}`;
  }
  return message;
}

function renderCaptures() {
  const primaryCaptures = filterCaptures(state.captures, state.captureFilter);
  const filteredCaptures = filterCaptures(primaryCaptures, state.displayFilter, { scope: 'secondary', includeNote: true });
  const domain = currentProjectDomain();
  const nextSignature = captureRenderSignature(primaryCaptures, filteredCaptures, domain);
  if (state.captureRenderSignature === nextSignature && els.captures.children.length) return;
  state.captureRenderSignature = nextSignature;
  renderCaptureViewModeButton();
  els.captureCount.textContent = String(filteredCaptures.length);
  renderCaptureWorkspaceTabs();
  els.captures.innerHTML = '';

  if (!state.captures.length) {
    els.captures.append(empty(t('capture.empty')));
    return;
  }

  if (!filteredCaptures.length) {
    els.captures.append(empty(t('capture.noMatch')));
    return;
  }

  if (state.captureTreeViewEnabled === true) {
    renderCaptureTree(filteredCaptures);
    return;
  }

  for (const capture of filteredCaptures) {
    const history = Array.isArray(capture.history) ? capture.history : [];
    const selectedInGroup = capture.id === state.selectedCaptureId || history.some((item) => item.id === state.selectedCaptureId);
    const expanded = selectedInGroup;
    const historyGroupKey = captureHistoryGroupKey(capture);
    const historyExpanded = state.collapsedHistoryGroups.has(historyGroupKey);
    const item = document.createElement('article');
    item.className = `capture${selectedInGroup ? ' active' : ''}${expanded ? ' expanded' : ''}`;
    item.dataset.captureId = capture.id || '';
    const captureSummaryHtml = shouldMergeCaptureList() ? captureMergeSummaryHtml(capture) : '';
    item.innerHTML = `
      <div class="capture-layout">
        <div class="capture-main">
          <div class="capture-title-row">
            <span class="request-line capture-title-status">${requestLineHtml(capture, { includeStatus: true })}</span>
            <span class="meta request-target${expanded ? ' selectable-text' : ''}"${expanded ? ' data-text="target"' : ''}>${escapeHtml(requestTarget(capture))}</span>
          </div>
	          ${domain ? '' : `<div class="meta capture-domain">${escapeHtml(capture.host || hostFromUrl(capture.url) || t('capture.unknownHost'))}</div>`}
	          ${captureSummaryHtml}
	          ${listNoteHtml(capture)}
	        </div>
        <div class="capture-time-row">
          <span class="status capture-time-text">${new Date(capture.createdAt).toLocaleTimeString()}</span>
        </div>
        ${expanded && history.length ? `
          <div class="capture-history" aria-label="${escapeHtml(t('capture.historyAria'))}">
            <button class="capture-history-label" type="button" aria-expanded="${String(historyExpanded)}">
              <span>${escapeHtml(t('capture.olderToggle', { action: historyExpanded ? t('capture.collapse') : t('capture.expand') }))}</span>
            </button>
            <div class="capture-history-times"${historyExpanded ? '' : ' hidden'}>
              ${history.map((item) => `
                <button class="capture-history-item${item.id === state.selectedCaptureId ? ' active' : ''}" type="button" data-capture-id="${escapeHtml(item.id)}">
                  <span class="capture-history-line"></span>
                  <span class="capture-time-row">
                    <span class="capture-time-text">${escapeHtml(new Date(item.createdAt).toLocaleTimeString())}</span>
                  </span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    item.addEventListener('click', (event) => {
      if (event.target.closest('input,label')) return;
      selectCaptureFromList(capture.id, els.captures);
    });
    item.addEventListener('contextmenu', (event) => {
      showCaptureContextMenu(event, capture.id);
    });
	    if (expanded) {
	      item.querySelectorAll('.selectable-text').forEach((element) => {
	        element.addEventListener('click', (event) => {
	          event.stopPropagation();
	          if (state.selectedCaptureId !== capture.id) {
	            selectCaptureFromList(capture.id, els.captures);
	            return;
	          }
	          selectElementText(element);
	        });
	      });
	    }
    item.querySelector('.capture-history-label')?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCaptureHistoryGroup(historyGroupKey);
    });
    item.querySelectorAll('.capture-history-item').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        selectCaptureFromList(button.dataset.captureId, els.captures);
      });
    });
    els.captures.append(item);
  }
}

function captureRenderSignature(primaryCaptures = [], filteredCaptures = [], domain = '') {
  return JSON.stringify({
    activeTab: state.activeTab,
    selectedCaptureId: state.selectedCaptureId || '',
    activePreviewTabId: state.activePreviewTabId || '',
    captureFilter: state.captureFilter || '',
    displayFilter: state.displayFilter || '',
    domain: domain || '',
    merge: shouldMergeCaptureList(),
    tree: state.captureTreeViewEnabled === true,
    treeFocus: state.captureTreeFocusedKey || '',
    showNotes: state.showListNotes !== false,
    primaryCount: primaryCaptures.length,
    filtered: filteredCaptures.map(captureRenderItemSignature),
    collapsedHistory: [...state.collapsedHistoryGroups].sort(),
    collapsedTree: [...state.captureTreeCollapsedKeys].sort(),
    overviewCollapsed: [...state.captureOverviewCollapsed].sort()
  });
}

function captureRenderItemSignature(capture = {}) {
  return [
    capture.id || '',
    capture.createdAt || '',
    capture.method || '',
    capture.statusCode || '',
    capture.host || '',
    capture.path || '',
    capture.query || '',
    capture.bodySize || 0,
    capture.requestBodySize || 0,
    capture.requestBodyHash || '',
    capture.mapType || '',
    capture.mapRuleId || '',
    apiNoteText(capture) || '',
    capture.mergeKey || '',
    capture.mergeGroupKey || '',
    JSON.stringify(capture.mergeOptions || {}),
    ...(Array.isArray(capture.history)
      ? capture.history.map((item) => [
        item.id || '',
        item.createdAt || '',
        item.query || '',
        item.requestBodySize || 0,
        item.requestBodyHash || '',
        item.mergeKey || '',
        item.mergeGroupKey || '',
        JSON.stringify(item.mergeOptions || {})
      ].join(':'))
      : [])
  ];
}

function renderCaptureTree(captures) {
  const roots = hostTreeRoots(captures);
  if (!roots.length) {
    els.captures.append(empty(t('capture.noMatch')));
    return;
  }
  ensureCaptureTreeFocusedKey(roots);
  for (const root of roots) {
    els.captures.append(renderCaptureTreeNode(root, 0));
  }
}

function ensureCaptureTreeFocusedKey(roots = []) {
  const keys = new Set();
  const selectedCaptureKeys = [];
  const selectedAncestorKeys = [];
  const collect = (node) => {
    if (!node?.key) return;
    keys.add(node.key);
    if (state.selectedCaptureId && (node.captures || []).some((capture) => capture.id === state.selectedCaptureId)) {
      selectedCaptureKeys.push(node.key);
    } else if (captureTreeNodeContainsSelected(node)) {
      selectedAncestorKeys.push(node.key);
    }
    (node.children || []).forEach(collect);
  };
  roots.forEach(collect);
  if (state.captureTreeFocusedKey && keys.has(state.captureTreeFocusedKey)) return;
  state.captureTreeFocusedKey = selectedCaptureKeys[0] || selectedAncestorKeys[0] || roots[0]?.key || '';
}

function hostTreeRoots(captures) {
  const groups = new Map();
  for (const capture of captures) {
    const host = capture.host || hostFromUrl(capture.url) || t('capture.unknownHost');
    if (!groups.has(host)) {
      groups.set(host, {
        label: host,
        key: `host:${host}`,
        kind: 'host',
        path: [],
        children: new Map(),
        captures: []
      });
    }
    insertCapturePathNode(groups.get(host).children, capture);
  }
  return [...groups.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(finalizeCaptureTreeNode);
}

function insertCapturePathNode(children, capture) {
  const parts = pathPartsForTree(capture.path || pathFromUrl(capture.url) || '/');
  let currentChildren = children;
  let node = null;
  const fullKeyPrefix = captureTreeHostKey(capture);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const path = parts.slice(0, index + 1);
    if (!currentChildren.has(part)) {
      currentChildren.set(part, {
        label: part,
        key: `${fullKeyPrefix}:${path.join('/')}`,
        kind: 'path',
        path,
        children: new Map(),
        captures: []
      });
    }
    node = currentChildren.get(part);
    currentChildren = node.children;
  }
  if (node) node.captures.push(capture);
}

function finalizeCaptureTreeNode(node) {
  return finalizeCaptureTreeNodeList(node)[0];
}

function finalizeCaptureTreeNodeList(node) {
  const captures = [...node.captures].sort((a, b) => captureTimestamp(b) - captureTimestamp(a));
  const children = [...node.children.values()]
    .sort(compareCaptureTreeNodes)
    .flatMap(finalizeCaptureTreeNodeList);
  if (node.kind !== 'host' && captures.length > 1) {
    const branch = {
      ...node,
      children,
      captures: []
    };
    const leaves = captures.map((capture, index) => captureTreeCaptureLeaf(capture, node, index));
    return children.length ? [branch, ...leaves] : leaves;
  }
  return [{
    ...node,
    children,
    captures
  }];
}

function captureTreeCaptureLeaf(capture, sourceNode, index) {
  return {
    label: sourceNode.label,
    key: `${sourceNode.key}:capture:${capture.id || index}`,
    kind: 'capture',
    path: sourceNode.path || [],
    children: [],
    captures: [capture]
  };
}

function compareCaptureTreeNodes(a, b) {
  if (a.kind === 'capture' || b.kind === 'capture') {
    if (a.kind !== b.kind) return a.kind === 'capture' ? 1 : -1;
    return captureTimestamp(b.captures?.[0]) - captureTimestamp(a.captures?.[0]);
  }
  return a.label.localeCompare(b.label);
}

function captureTreeHostKey(capture = {}) {
  const host = capture.host || hostFromUrl(capture.url) || t('capture.unknownHost');
  return `host:${host}`;
}

function pathPartsForTree(path) {
  const parts = String(path || '/').split('/').filter(Boolean);
  return parts.length ? parts : ['/'];
}

function renderCaptureTreeNode(node, depth) {
  const item = document.createElement('article');
  const nodeCapture = node.captures[0] || null;
  const children = node.children || [];
  const hasChildren = children.length > 0;
  const collapsed = hasChildren && state.captureTreeCollapsedKeys.has(node.key);
  const isHost = node.kind === 'host';
  const selected = nodeCapture && captureTreeNodeContainsSelected({ ...node, children: [] });
  const focused = captureTreeFocusedKey() === node.key;
  item.className = [
    'capture',
    'capture-tree-node',
    hasChildren ? 'branch' : 'leaf',
    collapsed ? 'collapsed' : 'expanded',
    nodeCapture ? 'has-capture' : '',
    isHost ? 'host' : '',
    focused ? 'tree-focused' : '',
    selected ? 'active' : ''
  ].filter(Boolean).join(' ');
  item.style.setProperty('--tree-depth', String(depth));
  item.dataset.treeKey = node.key || '';
  item.dataset.hasChildren = String(hasChildren);
  item.dataset.collapsed = String(collapsed);
  item.dataset.treeKind = node.kind || '';
  if (nodeCapture?.id) item.dataset.captureId = nodeCapture.id;
  if (nodeCapture) item.dataset.captureTime = String(captureTimestamp(nodeCapture));
  const latestCapture = nodeCapture || latestCaptureInTree(node);
  if (latestCapture?.id) item.dataset.latestCaptureId = latestCapture.id;
  const title = captureTreeNodeLabel(node, nodeCapture);
  item.innerHTML = isHost
    ? `
    <div class="capture-tree-group-row" role="treeitem"${hasChildren ? ` aria-expanded="${String(!collapsed)}"` : ''} title="${escapeHtml(title)}">
      <button class="capture-tree-toggle" type="button" ${hasChildren ? `aria-label="${escapeHtml(collapsed ? t('tree.expand') : t('tree.collapse'))}"` : 'disabled aria-hidden="true" tabindex="-1"'}>
        <span class="capture-tree-caret"></span>
      </button>
      <span class="capture-tree-icon folder" aria-hidden="true"></span>
      <span class="capture-tree-label">
        <span class="capture-tree-name">${escapeHtml(node.label)}</span>
      </span>
      <span class="capture-tree-group-actions" aria-label="${escapeHtml(t('tree.actions'))}">
        <button class="capture-tree-action" type="button" data-tree-action="expand" aria-label="${escapeHtml(t('tree.expandAll'))}" title="${escapeHtml(t('tree.expandAll'))}">
          <span class="tree-action-line top"></span>
          <span class="tree-action-caret down"></span>
          <span class="tree-action-line bottom"></span>
        </button>
        <button class="capture-tree-action" type="button" data-tree-action="collapse" aria-label="${escapeHtml(t('tree.collapseAll'))}" title="${escapeHtml(t('tree.collapseAll'))}">
          <span class="tree-action-line top"></span>
          <span class="tree-action-caret up"></span>
          <span class="tree-action-line bottom"></span>
        </button>
      </span>
    </div>
  `
    : `
    <div class="capture-tree-row" role="treeitem"${hasChildren ? ` aria-expanded="${String(!collapsed)}"` : ''} title="${escapeHtml(title)}">
      <button class="capture-tree-toggle" type="button" ${hasChildren ? `aria-label="${escapeHtml(collapsed ? t('tree.expand') : t('tree.collapse'))}"` : 'disabled aria-hidden="true" tabindex="-1"'}>
        <span class="capture-tree-caret"></span>
      </button>
      <span class="capture-tree-icon ${hasChildren ? 'folder' : 'file'}" aria-hidden="true"></span>
      <span class="capture-tree-label">
        <span class="capture-tree-name">${escapeHtml(node.label)}</span>
      </span>
      ${nodeCapture ? `<span class="capture-tree-meta">${escapeHtml(captureTreeNodeMeta(nodeCapture))}</span>` : ''}
    </div>
  `;
  item.querySelector('.capture-tree-toggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleCaptureTreeNode(node);
  });
  item.querySelector(isHost ? '.capture-tree-group-row' : '.capture-tree-row')?.addEventListener('click', (event) => {
    if (event.target.closest('.capture-tree-action')) return;
    setCaptureTreeFocusedKey(node.key, { render: false });
    if (nodeCapture) {
      selectCaptureFromList(nodeCapture.id, els.captures);
      return;
    }
    if (hasChildren) {
      toggleCaptureTreeNode(node);
    }
  });
  item.querySelector('[data-tree-action="expand"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setCaptureTreeSubtreeCollapsed(node, false);
  });
  item.querySelector('[data-tree-action="collapse"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setCaptureTreeSubtreeCollapsed(node, true);
  });
  if (nodeCapture) {
    item.addEventListener('contextmenu', (event) => {
      showCaptureContextMenu(event, nodeCapture.id);
    });
  }
  if (hasChildren) {
    const childWrap = document.createElement('div');
    childWrap.className = 'capture-tree-children';
    childWrap.hidden = collapsed;
    for (const child of children) {
      childWrap.append(renderCaptureTreeNode(child, isHost ? 1 : depth + 1));
    }
    item.append(childWrap);
  }
  return item;
}

function captureTreeNodeLabel(node, latest) {
  return `${node.label}${latest ? ` · ${captureTreeNodeMeta(latest)}` : ''}`;
}

function captureTreeNodeMeta(capture = {}) {
  return `${String(capture.method || '').toUpperCase()} · ${capture.statusCode || '-'}`;
}

function toggleCaptureTreeNode(node) {
  if (!node?.key) return;
  setCaptureTreeFocusedKey(node.key, { render: false });
  if (state.captureTreeCollapsedKeys.has(node.key)) {
    state.captureTreeCollapsedKeys.delete(node.key);
  } else {
    collectCaptureTreeNodeKeys(node).forEach((key) => state.captureTreeCollapsedKeys.add(key));
  }
  renderCaptures();
}

function setCaptureTreeSubtreeCollapsed(node, collapsed) {
  if (node?.key) setCaptureTreeFocusedKey(node.key, { render: false });
  collectCaptureTreeNodeKeys(node).forEach((key) => {
    if (collapsed) {
      state.captureTreeCollapsedKeys.add(key);
    } else {
      state.captureTreeCollapsedKeys.delete(key);
    }
  });
  renderCaptures();
}

function collectCaptureTreeNodeKeys(node, keys = []) {
  if (node?.key) keys.push(node.key);
  for (const child of node?.children || []) {
    collectCaptureTreeNodeKeys(child, keys);
  }
  return keys;
}

function latestCaptureInTree(node) {
  const candidates = [
    ...(node.captures || []),
    ...(node.children || []).map(latestCaptureInTree).filter(Boolean)
  ];
  return candidates.sort((a, b) => captureTimestamp(b) - captureTimestamp(a))[0] || null;
}

function captureTreeNodeContainsSelected(node) {
  if (!state.selectedCaptureId) return false;
  return (node.captures || []).some((capture) => capture.id === state.selectedCaptureId) ||
    (node.children || []).some(captureTreeNodeContainsSelected);
}

function captureHistoryGroupKey(capture) {
  return capture.mergeKey || capture.id;
}

function showCaptureContextMenu(event, captureId) {
  const capture = findCaptureSummaryById(captureId);
  const hasRemoteRule = capture && state.remoteRules.some((rule) => !isGlobalRemoteRule(rule) && sameRemoteRuleTarget(rule, captureRuleTarget(capture, 'remote')));
  const actions = [
    {
      label: t('context.createLocal'),
      run: async () => {
        await ensureCaptureSelected(captureId);
        await saveSelectedCapture('exact');
      }
    },
    {
      label: hasRemoteRule ? t('context.updateRemote') : t('context.createRemote'),
      run: async () => {
        await ensureCaptureSelected(captureId);
        await saveSelectedRemoteRule();
      }
    },
    {
      label: t('note.short'),
      run: async () => {
        await ensureCaptureSelected(captureId);
        openNoteDialog();
      }
    },
    {
      label: t('actions.copyCurl'),
      run: async () => {
        await ensureCaptureSelected(captureId);
        await copySelectedCurl();
      }
    },
    {
      label: 'Repeat',
      run: async () => {
        await ensureCaptureSelected(captureId);
        await repeatSelectedRequest();
      }
    }
  ];
  const captureHost = normalizeHostInput(capture?.host || hostFromUrl(capture?.url));
  const hasProjectDomain = captureHost && state.captureTabs.some((tab) => normalizeHostInput(tab.filter) === captureHost);
  const currentDomain = normalizeHostInput(activeCaptureTab()?.filter || state.captureFilter || '');
  if (captureHost && !hasProjectDomain) {
    actions.push({
      label: currentDomain ? t('context.addAsDomain') : t('context.openDomain'),
      run: async () => {
        selectOrAddDomainProject(captureHost);
      }
    });
  }
  showItemContextMenu(event, actions);
}

function showLocalRuleContextMenu(event, ruleId) {
  showItemContextMenu(event, [
    {
      label: t('note.short'),
      run: async () => {
        await ensureLocalRuleSelected(ruleId);
        openNoteDialog();
      }
    },
    {
      label: t('actions.copyCurl'),
      run: async () => {
        await ensureLocalRuleSelected(ruleId);
        await copySelectedCurl();
      }
    },
    {
      label: 'Repeat',
      run: async () => {
        await ensureLocalRuleSelected(ruleId);
        await repeatSelectedRequest();
      }
    },
    {
      label: t('actions.delete'),
      danger: true,
      run: async () => {
        await ensureLocalRuleSelected(ruleId);
        await deleteSelectedRule();
      }
    }
  ]);
}

function showRemoteRuleContextMenu(event, ruleId) {
  const rule = state.remoteRules.find((item) => item.id === ruleId);
  if (isGlobalRemoteRule(rule)) return;
  showItemContextMenu(event, [
    {
      label: t('note.short'),
      run: async () => {
        await ensureRemoteRuleSelected(ruleId);
        openNoteDialog();
      }
    },
    {
      label: t('actions.copyCurl'),
      run: async () => {
        await ensureRemoteRuleSelected(ruleId);
        await copySelectedCurl();
      }
    },
    {
      label: 'Repeat',
      run: async () => {
        await ensureRemoteRuleSelected(ruleId);
        await repeatSelectedRequest();
      }
    },
    {
      label: t('actions.delete'),
      danger: true,
      run: async () => {
        await ensureRemoteRuleSelected(ruleId);
        await deleteSelectedRule();
      }
    }
  ]);
}

async function ensureCaptureSelected(captureId) {
  if (state.previewMode === 'capture' && state.selectedCaptureId === captureId && state.selectedCaptureDetail?.id === captureId) return;
  await selectCapture(captureId);
}

async function ensureLocalRuleSelected(ruleId) {
  if (state.previewMode === 'rule' && state.selectedRuleId === ruleId) return;
  await selectRule(ruleId);
}

async function ensureRemoteRuleSelected(ruleId) {
  if (state.previewMode === 'remote' && state.selectedRemoteRuleId === ruleId) return;
  await selectRemoteRule(ruleId);
}

function findCaptureSummaryById(captureId) {
  for (const capture of state.captures) {
    if (capture.id === captureId) return capture;
    const historical = Array.isArray(capture.history)
      ? capture.history.find((item) => item.id === captureId)
      : null;
    if (historical) {
      return { ...capture, ...historical };
    }
  }
  return null;
}

function toggleCaptureHistoryGroup(key) {
  if (!key) return;
  if (state.collapsedHistoryGroups.has(key)) {
    state.collapsedHistoryGroups.delete(key);
  } else {
    state.collapsedHistoryGroups.add(key);
  }
  renderCaptures();
}

function filterCaptures(captures, keyword, options = {}) {
  const query = keyword.trim().toLowerCase();
  if (!query) return captures;

  return captures.filter((capture) => {
    const haystack = options.scope === 'secondary'
      ? [
        capture.path,
        options.includeNote ? apiNoteText(capture) : ''
      ].join(' ').toLowerCase()
      : [
        capture.method,
        capture.statusCode,
        capture.url,
        capture.host,
        capture.path,
        capture.query,
        capture.contentType,
        options.includeNote ? apiNoteText(capture) : ''
      ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function sameCaptureMergeGroup(base, capture) {
  return captureMergeGroupMatchScore(base, capture) >= 0;
}

function captureMergeGroupMatchScore(base, capture) {
  if (!sameCaptureTarget(base, capture)) return -1;
  const baseGroupKey = captureMergeGroupKeyForCapture(base);
  const captureGroupKey = captureMergeGroupKeyForCapture(capture);
  if (
    baseGroupKey !== captureTargetKey(base) ||
    captureGroupKey !== captureTargetKey(capture)
  ) {
    return baseGroupKey === captureGroupKey ? captureMergeGroupSpecificity(base) : -1;
  }
  const options = captureMergeOptionsForCapture(base);
  if (!captureQueryMatchesMergeTemplate(capture, base, options)) return -1;
  if (!captureBodyMatchesMergeTemplate(capture, base, options)) return -1;
  return captureMergeOptionsSpecificity(options);
}

function bestCaptureMergeGroupIndex(groups = [], capture = {}) {
  let bestIndex = -1;
  let bestScore = -1;
  groups.forEach((group, index) => {
    const score = captureMergeGroupMatchScore(group, capture);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestScore >= 0 ? bestIndex : -1;
}

function captureMergeGroupSpecificity(capture = {}) {
  return captureMergeOptionsSpecificity(captureMergeOptionsForCapture(capture));
}

function captureMergeOptionsSpecificity(options = {}) {
  let score = 0;
  if (options.query === true) {
    score += paramsToEntries(options.queryTemplate || '').length * 100;
  }
  if (options.body === true) {
    score += captureMergeBodySpecificity(
      String(options.bodyTemplate || ''),
      String(options.requestContentType || '')
    );
  }
  return score;
}

function captureMergeGroupKeyForCapture(capture = {}) {
  const baseKey = capture.mergeKey || captureTargetKey(capture);
  if (!baseKey) return '';
  const options = captureMergeOptionsForCapture(capture);
  const variantKey = options.variantKey || captureMergeVariantKey(capture, options);
  return variantKey ? `${baseKey}\u0000${variantKey}` : baseKey;
}

function sameCaptureTarget(a = {}, b = {}) {
  return String(a.method || '').toUpperCase() === String(b.method || '').toUpperCase() &&
    a.protocol === b.protocol &&
    a.host === b.host &&
    Number(a.port) === Number(b.port) &&
    a.path === b.path;
}

function captureTargetKey(capture = {}) {
  if (capture.mergeKey) return capture.mergeKey;
  return [
    capture.method,
    capture.protocol,
    capture.host,
    Number(capture.port),
    capture.path
  ].join('\u0000');
}

function captureMergeVariantKey(capture = {}, options = {}) {
  const parts = [];
  if (options.query === true) parts.push(`q:${hashText(normalizeQuery(capture.query || ''))}`);
  if (options.body === true && methodHasRequestBody(capture.method)) {
    parts.push(`b:${capture.requestBodyHash || hashText(capture.requestBodyBase64 || String(capture.requestBodySize || 0))}`);
  }
  return parts.join('|');
}

function captureMergeVariantForCapture(rule = {}, capture = {}, options = {}) {
  if (!rule || typeof rule !== 'object') return { key: '', rule: null };
  const variants = rule.variants && typeof rule.variants === 'object' && !Array.isArray(rule.variants)
    ? rule.variants
    : {};
  const directKey = captureMergeVariantKey(capture, options);
  const matches = [];
  for (const [key, variantRule] of Object.entries(variants)) {
    if (!variantRule || typeof variantRule !== 'object') continue;
    if (captureMatchesMergeVariant(capture, rule, variantRule)) matches.push({ key, rule: variantRule });
  }
  if (matches.length) {
    matches.sort((a, b) => (
      captureMergeVariantSpecificity(rule, b.rule) - captureMergeVariantSpecificity(rule, a.rule) ||
      Number(b.key === directKey) - Number(a.key === directKey)
    ));
    return matches[0];
  }
  if (directKey && variants[directKey] && typeof variants[directKey] === 'object') {
    return { key: directKey, rule: variants[directKey] };
  }
  if (!Object.keys(variants).length && (rule.queryTemplate || rule.bodyTemplate)) {
    return { key: '', rule: null };
  }
  return { key: directKey, rule: null };
}

function captureMatchesMergeVariant(capture = {}, baseRule = {}, variantRule = {}) {
  if (baseRule.query === true) {
    const queryTemplate = String(variantRule.queryTemplate || '').replace(/^\?/, '');
    if (queryTemplate && !queryIncludesRequired(capture.query || '', queryTemplate)) return false;
  }
  if (baseRule.body === true && methodHasRequestBody(capture.method)) {
    const bodyTemplate = String(variantRule.bodyTemplate || '');
    if (bodyTemplate && !captureMatchesBodyTemplate(capture, {
      body: true,
      bodyTemplate,
      requestContentType: variantRule.requestContentType || baseRule.requestContentType || capture.requestContentType || ''
    })) {
      return false;
    }
  }
  return true;
}

function captureMergeVariantSpecificity(rule = {}, variantRule = {}) {
  let score = 0;
  if (rule.query === true) {
    score += paramsToEntries(variantRule.queryTemplate || '').length * 100;
  }
  if (rule.body === true) {
    score += captureMergeBodySpecificity(
      String(variantRule.bodyTemplate || ''),
      String(variantRule.requestContentType || rule.requestContentType || '')
    );
  }
  return score;
}

function captureMergeBodySpecificity(bodyTemplate = '', contentType = '') {
  const text = String(bodyTemplate || '').trim();
  if (!text) return 0;
  if (String(contentType || '').toLowerCase().includes('application/x-www-form-urlencoded')) {
    return paramsToEntries(text).length * 100;
  }
  const parsed = parseJson(text);
  return parsed.ok ? countJsonSpecificity(parsed.value) * 100 : Math.max(1, text.length);
}

function countJsonSpecificity(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countJsonSpecificity(item), value.length);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => sum + countJsonSpecificity(item), Object.keys(value).length);
  }
  return 1;
}

function hashText(value) {
  return sha1Hex(new TextEncoder().encode(String(value || ''))).slice(0, 12);
}

function sha1Hex(bytes) {
  const message = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const bitLength = message.length * 8;
  const paddedLength = (((message.length + 8) >> 6) + 1) << 6;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(message);
  buffer[message.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 4, bitLength, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f;
      let k;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((item) => item.toString(16).padStart(8, '0'))
    .join('');
}

function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function captureQueryMatchesMergeTemplate(capture, base, options = {}) {
  if (options.query !== true) {
    return true;
  }
  const template = String(options.queryTemplate || '').replace(/^\?/, '');
  if (!template) return true;
  const baseMatches = queryIncludesRequired(base.query || '', template);
  const captureMatches = queryIncludesRequired(capture.query || '', template);
  if (baseMatches || captureMatches) return baseMatches && captureMatches;
  return queryIncludesRequired(capture.query || '', base.query || '') &&
    queryIncludesRequired(base.query || '', capture.query || '');
}

function captureBodyMatchesMergeTemplate(capture, base, options = {}) {
  if (!methodHasRequestBody(capture.method)) return true;
  if (options.body !== true) {
    return true;
  }
  const template = String(options.bodyTemplate || '');
  if (!template) return true;
  const contentType = options.requestContentType || base.requestContentType || capture.requestContentType || '';
  const bodyBase64 = bodyToBase64(template);
  const templateRule = {
    method: base.method,
    requestBodyMode: 'exact',
    requestContentType: contentType,
    requestBodyBase64: bodyBase64,
    requestBodySize: new TextEncoder().encode(template).length
  };
  const baseMatches = requestBodyIncludesRequired(base, templateRule);
  const captureMatches = requestBodyIncludesRequired(capture, templateRule);
  if (baseMatches || captureMatches) return baseMatches && captureMatches;
  return sameCaptureBodyExact(base, capture);
}

function captureMatchesBodyTemplate(capture, options = {}) {
  if (!capture || !methodHasRequestBody(capture.method)) return false;
  if (options.body !== true || !String(options.bodyTemplate || '')) return false;
  const contentType = options.requestContentType || capture.requestContentType || '';
  const template = String(options.bodyTemplate || '');
  return requestBodyIncludesRequired(capture, {
    method: capture.method,
    requestBodyMode: 'exact',
    requestContentType: contentType,
    requestBodyBase64: bodyToBase64(template),
    requestBodySize: new TextEncoder().encode(template).length
  });
}

function sameCaptureBodyExact(a = {}, b = {}) {
  const aHash = a.requestBodyHash || '';
  const bHash = b.requestBodyHash || '';
  if (aHash || bHash) return aHash === bHash;
  const aSize = Number(a.requestBodySize || 0);
  const bSize = Number(b.requestBodySize || 0);
  if (aSize !== bSize) return false;
  return String(a.requestBodyBase64 || '') === String(b.requestBodyBase64 || '');
}

async function updateCaptureMergeRule(capture, options) {
  if (!capture.mergeKey) return;
  const skipConflictValidation = options.skipConflictValidation === true;
  if (
    state.manualRuleSaveRequired &&
    state.manualRuleSaveScope !== 'capture-merge' &&
    options.manual !== true &&
    !skipConflictValidation
  ) {
    updateManualRuleSaveButton();
    return;
  }
  applyCaptureMergeRuleDraft(capture, options);
  const sourceCheck = options.manual === true || skipConflictValidation
    ? { valid: true }
    : captureMergeTemplateSourceCheck(capture, options);
  if (!sourceCheck.valid) {
    markManualRuleSaveRequired(captureMergeSourceChangeText(sourceCheck.reason), 'capture-merge');
    return;
  }
  const conflict = options.manual === true || skipConflictValidation
    ? null
    : captureMergeRuleConflictForOptions(capture, options);
  if (conflict) {
    clearManualRuleSaveRequired();
  }
  try {
    const payload = {
      captureMergeRules: state.captureMergeRules
    };
    if (!skipConflictValidation) {
      payload.validateCaptureMergeRules = true;
      payload.captureMergeValidation = {
        mergeKey: capture.mergeKey,
        variantKey: mergeVariantKeyForDraft(capture, options)
      };
    }
    await patchJson('/api/settings', payload);
  } catch (error) {
    if (isRuleConflictError(error)) {
      markManualRuleSaveRequired(ruleConflictMessage(error) || captureMergeConflictText(), 'capture-merge');
      if (options.manual === true) window.alert(ruleConflictMessage(error) || captureMergeConflictText());
      return;
    }
    throw error;
  }
  clearManualRuleSaveRequired();
  await reloadCaptures({ replace: true });
  syncSelectedCaptureMergeState();
  updateCaptureMergeEditor();
}

function applyCaptureMergeRuleDraft(capture, options, renderOptions = {}) {
  if (!capture?.mergeKey) return;
  const nextRules = { ...state.captureMergeRules };
  const existingRule = state.captureMergeRules[capture.mergeKey] || {};
  const nextRule = {
    ...(existingRule || {})
  };
  delete nextRule.queryTemplate;
  delete nextRule.bodyTemplate;
  delete nextRule.requestContentType;
  if (options.query === true) nextRule.query = true;
  if (options.query !== true) delete nextRule.query;
  if (options.body === true) nextRule.body = true;
  if (options.body !== true) delete nextRule.body;
  const queryTemplate = Object.hasOwn(options, 'queryTemplate')
    ? normalizeQuery(options.queryTemplate)
    : String(captureMergeOptionsForCapture(capture).queryTemplate || '');
  const bodyTemplate = Object.hasOwn(options, 'bodyTemplate')
    ? String(options.bodyTemplate || '')
    : String(captureMergeOptionsForCapture(capture).bodyTemplate || '');
  const requestContentType = Object.hasOwn(options, 'requestContentType')
    ? String(options.requestContentType || '')
    : String(captureMergeOptionsForCapture(capture).requestContentType || capture.requestContentType || '');
  let variantKey = options.variantKey || mergeVariantKeyForDraft(capture, {
    query: options.query === true,
    body: options.body === true
  });
  const variants = {
    ...(nextRule.variants || {})
  };
  if (options.recycleDimension) {
    recycleCaptureMergeDimension(nextRule, variants, options.recycleDimension);
    variantKey = captureMergeVariantKey(capture, {
      query: options.query === true,
      body: options.body === true
    });
  }
  if (variantKey && (options.query === true || options.body === true)) {
    const variantRule = {
      ...(variants[variantKey] || {})
    };
    if (options.query === true) variantRule.queryTemplate = queryTemplate;
    if (options.body === true && bodyTemplate) variantRule.bodyTemplate = bodyTemplate;
    if (options.body === true && requestContentType) variantRule.requestContentType = requestContentType;
    if (Object.keys(variantRule).length) {
      variants[variantKey] = variantRule;
    }
  }
  if (Object.keys(variants).length) {
    nextRule.variants = variants;
  } else {
    delete nextRule.variants;
  }
  if (!Object.keys(nextRule).length || (!nextRule.query && !nextRule.body)) {
    delete nextRules[capture.mergeKey];
  } else {
    nextRules[capture.mergeKey] = nextRule;
  }
  state.captureMergeRules = nextRules;
  const nextOptions = {
    query: options.query === true,
    body: options.body === true,
    variantKey,
    queryTemplate: options.query === true ? queryTemplate : String(capture.query || ''),
    bodyTemplate: options.body === true ? bodyTemplate : requestBodyText(capture.requestBody),
    requestContentType
  };
  if (capture) {
    capture.mergeOptions = nextOptions;
    capture.mergeGroupKey = captureMergeGroupKeyForCapture(capture);
  }
  if (state.selectedCaptureDetail?.id === capture.id) {
    state.selectedCaptureDetail.mergeOptions = nextOptions;
    state.selectedCaptureDetail.mergeGroupKey = capture.mergeGroupKey;
  }
  if (renderOptions.render !== false) {
    updateCaptureMergeEditor();
    refreshCaptureRequestEditor();
  }
}

function recycleCaptureMergeDimension(rule = {}, variants = {}, dimension = '') {
  const prefix = dimension === 'query' ? 'q:' : dimension === 'body' ? 'b:' : '';
  if (!prefix) return;
  const nextVariants = {};
  for (const [key, variantRule] of Object.entries(variants)) {
    if (!variantRule || typeof variantRule !== 'object') continue;
    const nextKey = String(key || '')
      .split('|')
      .filter((part) => part && !part.startsWith(prefix))
      .join('|');
    const nextRule = { ...variantRule };
    if (dimension === 'query') {
      delete nextRule.queryTemplate;
    } else if (dimension === 'body') {
      delete nextRule.bodyTemplate;
      delete nextRule.requestContentType;
    }
    if (!nextKey || !Object.keys(nextRule).length) continue;
    nextVariants[nextKey] = {
      ...(nextVariants[nextKey] || {}),
      ...nextRule
    };
  }
  Object.keys(variants).forEach((key) => {
    delete variants[key];
  });
  Object.assign(variants, nextVariants);
}

function scheduleCaptureMergeRuleSave(capture, options) {
  debounceTask('captureMergeRuleSaveTimer', () => updateCaptureMergeRule(capture, options), 350);
}

function applyCaptureMergeRuleDraftForAutoSave(capture, options, renderOptions = {}) {
  const sourceCheck = captureMergeTemplateSourceCheck(capture, options);
  if (!sourceCheck.valid) {
    markManualRuleSaveRequired(captureMergeSourceChangeText(sourceCheck.reason), 'capture-merge');
    return false;
  }
  applyCaptureMergeRuleDraft(capture, options, renderOptions);
  return true;
}

function saveCurrentCaptureMergeRuleManually() {
  const capture = selectedCaptureSummary();
  if (!capture || !shouldMergeCaptureList()) return Promise.resolve();
  const options = {
    query: !els.captureMergeQuery.checked,
    body: methodHasRequestBody(capture.method) && !els.captureMergeBody.checked,
    variantKey: mergeVariantKeyForDraft(capture, {
      query: !els.captureMergeQuery.checked,
      body: methodHasRequestBody(capture.method) && !els.captureMergeBody.checked
    })
  };
  if (state.previewBodyTab === 'query') {
    options.query = true;
    options.queryTemplate = els.captureQueryInput.value;
  }
  if (state.previewBodyTab === 'request') {
    options.body = true;
    options.bodyTemplate = els.editor.value;
    options.requestContentType = capture.requestContentType || '';
  }
  return updateCaptureMergeRule(capture, { ...options, manual: true });
}

function mergeVariantKeyForDraft(capture = {}, options = {}) {
  if (options.variantKey) return options.variantKey;
  const existingOptions = captureMergeOptionsForCapture(capture);
  if (existingOptions.variantKey && state.selectedCaptureDetail?.id === capture.id) return existingOptions.variantKey;
  return captureMergeVariantKey(capture, options);
}

function syncSelectedCaptureMergeState() {
  const capture = selectedCaptureSummary();
  if (!capture) return;
  const options = captureMergeOptionsForCapture(capture);
  capture.mergeOptions = options;
  capture.mergeGroupKey = captureMergeGroupKeyForCapture(capture);
  if (state.selectedCaptureDetail?.id === capture.id) {
    state.selectedCaptureDetail.mergeOptions = options;
    state.selectedCaptureDetail.mergeGroupKey = capture.mergeGroupKey;
  }
}

function captureMergeTemplateSourceCheck(capture = {}, options = {}) {
  if (options.query === true && Object.hasOwn(options, 'queryTemplate')) {
    const template = normalizeQuery(options.queryTemplate || '');
    const source = normalizeQuery(capture.query || '');
    if (!queryIncludesRequired(source, template)) {
      return { valid: false, reason: 'query' };
    }
  }
  if (options.body === true && Object.hasOwn(options, 'bodyTemplate')) {
    const template = String(options.bodyTemplate || '');
    if (template) {
      const contentType = String(options.requestContentType || capture.requestContentType || '');
      const source = captureRuleFromCurrentRequest(capture);
      const required = requestBodyFieldsFromTextForRule(template, contentType);
      if (!requestBodyIncludesRequired(source, required)) {
        return { valid: false, reason: 'body' };
      }
    }
  }
  return { valid: true };
}

function captureRuleFromCurrentRequest(capture = {}) {
  return {
    method: capture.method,
    requestContentType: capture.requestContentType || '',
    requestBodyHash: capture.requestBodyHash || '',
    requestBodyBase64: capture.requestBodyBase64 || bodyToBase64(requestBodyText(capture.requestBody)),
    requestBodySize: Number(capture.requestBodySize || new TextEncoder().encode(requestBodyText(capture.requestBody)).length)
  };
}

function captureMergeSourceChangeText(reason = '') {
  if (reason === 'query') {
    return t('merge.querySourceError');
  }
  if (reason === 'body') {
    return t('merge.bodySourceError');
  }
  return t('merge.sourceError');
}

function captureMergeRuleConflictForOptions(capture = {}, options = {}) {
  if (!capture?.mergeKey) return null;
  const rule = state.captureMergeRules[capture.mergeKey] || {};
  const variants = rule.variants || {};
  const variantKey = mergeVariantKeyForDraft(capture, options);
  const current = variants[variantKey];
  if (!current) return null;
  const conflictKey = Object.keys(variants).find((key) => (
    key !== variantKey &&
    captureMergeVariantContains(rule, variants[key], current)
  ));
  return conflictKey ? { variantKey: conflictKey } : null;
}

function captureMergeVariantContains(rule = {}, container = {}, contained = {}) {
  const checks = captureMergeVariantContainmentChecks(rule, container, contained);
  if (!checks.length) return false;
  return checks.every((check) => check);
}

function captureMergeVariantContainmentChecks(rule = {}, container = {}, contained = {}) {
  const checks = [];
  if (rule.query === true) {
    checks.push(queryIncludesRequired(
      normalizeQuery(contained.queryTemplate || ''),
      normalizeQuery(container.queryTemplate || '')
    ));
  }
  if (rule.body === true) {
    checks.push(captureMergeBodyVariantContains(rule, container, contained));
  }
  return checks;
}

function captureMergeBodyVariantContains(rule = {}, container = {}, contained = {}) {
  const containerBody = String(container.bodyTemplate || '');
  const containedBody = String(contained.bodyTemplate || '');
  if (!containerBody) return true;
  if (!containedBody) return false;
  const contentType = container.requestContentType || contained.requestContentType || rule.requestContentType || '';
  const containerRule = requestBodyFieldsFromTextForRule(containerBody, contentType);
  const containedRule = requestBodyFieldsFromTextForRule(containedBody, contentType);
  return requestBodyIncludesRequired(containedRule, containerRule);
}

function captureMergeConflictText() {
  return t('merge.conflictAutoSave');
}

function refreshCaptureRequestEditor() {
  if (state.previewMode !== 'capture' || state.previewBodyTab !== 'request') return;
  setPreviewBodyTab('request', { preserveCurrentEditor: false });
}

function refreshCaptureMergeDependentPreview() {
  updateCaptureMergeEditor();
  if (state.previewMode !== 'capture') return;
  if (state.previewBodyTab === 'request') {
    setPreviewBodyTab('request', { preserveCurrentEditor: false });
    return;
  }
  if (state.previewBodyTab === 'query') {
    setPreviewBodyTab('query', { preserveCurrentEditor: false });
  }
}

function selectedCaptureSummary() {
  if (!state.selectedCaptureId) return null;
  if (state.selectedCaptureDetail?.id === state.selectedCaptureId) {
    return state.selectedCaptureDetail;
  }
  return findCaptureSummaryById(state.selectedCaptureId) || state.selectedCaptureDetail;
}

function updateCaptureMergeEditor() {
  const capture = selectedCaptureSummary();
  const isCapturePreview = state.previewMode === 'capture' && Boolean(capture?.mergeKey);
  const showMergeControls = isCapturePreview && shouldMergeCaptureList();
  const showQueryMergeControls = showMergeControls && captureHasQuery(capture);
  const showBodyMergeControls = showMergeControls && captureHasRequestBodyContent(capture);
  els.captureQueryEditor.hidden = !(isCapturePreview && state.previewBodyTab === 'query');
  els.captureMergeQueryRow?.closest('.query-merge-bar')?.toggleAttribute('hidden', !showQueryMergeControls);
  els.captureMergeQueryRow.hidden = !showQueryMergeControls;
  els.captureBodyMergeEditor.hidden = !(isCapturePreview && showBodyMergeControls && state.previewBodyTab === 'request');
  if (!isCapturePreview) {
    els.captureQueryOriginal.hidden = true;
    els.captureQueryOriginal.textContent = '';
    els.captureQueryInput.hidden = true;
    els.captureQueryPreview.innerHTML = '';
    return;
  }
  const options = captureMergeOptionsForCapture(capture);
  els.captureQueryInput.value = options.query === true
    ? String(options.queryTemplate || '')
    : String(capture.query || '');
  els.captureQueryInput.hidden = true;
  els.captureQueryInput.readOnly = !showMergeControls || options.query !== true;
  els.captureQueryInput.placeholder = showMergeControls && options.query === true
    ? t('query.ignoreTip')
    : '';
  setInstantTooltip(els.captureQueryInput, showMergeControls && options.query === true
    ? t('query.templateTip')
      : showMergeControls
        ? t('query.mergeTip')
        : '');
  els.captureMergeQuery.checked = options.query !== true;
  els.captureQueryOriginal.hidden = true;
  els.captureQueryOriginal.textContent = '';
  els.captureMergeBody.checked = options.body !== true;
  els.captureMergeBodyRow.hidden = !showBodyMergeControls;
  renderCaptureQueryPreview(capture, options, showQueryMergeControls);
}

function renderCaptureQueryPreview(capture = {}, options = {}, showMergeControls = false) {
  if (!els.captureQueryPreview) return;
  const actualEntries = paramsToEntries(capture.query || '');
  if (showMergeControls && options.query === true) {
    const matchedEntries = paramsToEntries(options.queryTemplate || '');
    const matchedIndexes = queryMatchedEntryIndexes(actualEntries, matchedEntries);
    const ignoredEntries = actualEntries
      .map((entry, index) => ({ entry, index }))
      .filter((item) => !matchedIndexes.has(item.index));
    els.captureQueryPreview.className = 'capture-query-preview capture-split-delete-preview';
    els.captureQueryPreview.innerHTML = `
      ${captureDeleteSectionHtml(t('query.matchingTitle'), actualEntries
        .map((entry, index) => ({ entry, index }))
        .filter((item) => matchedIndexes.has(item.index)), 'query-match')}
      ${captureDeleteSectionHtml(t('query.ignoredTitle'), ignoredEntries, 'query-ignore')}
    `;
    bindCaptureQueryDeleteActions(capture, options);
    return;
  }
  els.captureQueryPreview.className = 'capture-query-preview code-preview';
  const text = formatQueryPreview(capture.query || '');
  const language = detectPreviewLanguage(text, 'query');
  els.captureQueryPreview.dataset.language = language.label;
  els.captureQueryPreview.innerHTML = highlightCodeHtml(text || ' ', language.kind);
}

function captureDeleteSectionHtml(title, items, kind) {
  const rows = items.length
    ? items.map((item) => captureDeleteRowHtml(item.entry, item.index, kind)).join('')
    : '<div class="capture-delete-empty">(empty)</div>';
  return `
    <section class="capture-delete-section">
      <div class="capture-delete-title">${escapeHtml(title)}</div>
      <div class="capture-delete-list">${rows}</div>
    </section>
  `;
}

function captureDeleteRowHtml(entry, index, kind) {
  const [key, value] = entry;
  const canDelete = kind === 'query-match' || kind === 'body-form';
  const content = kind === 'body-form'
    ? `<span class="code-token-key">${escapeHtml(key)}</span><span class="code-token-punctuation">=</span><span class="code-token-string">${escapeHtml(value)}</span>`
    : queryHighlightHtml(`${key}=${value}`);
  return `
    <div class="capture-delete-row${canDelete ? ' can-delete' : ''}" data-query-index="${index}">
      <span class="capture-delete-gutter">
        ${canDelete ? `<button class="capture-delete-btn" type="button" aria-label="${escapeHtml(t('query.deleteAria'))}">×</button>` : ''}
      </span>
      <code>${content}</code>
    </div>
  `;
}

function bindCaptureQueryDeleteActions(capture, options) {
  els.captureQueryPreview.querySelectorAll('.capture-delete-row.can-delete .capture-delete-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('.capture-delete-row');
      const index = Number(row?.dataset.queryIndex);
      removeCaptureQueryMatchEntry(capture, options, index);
    });
  });
}

function queryMatchedEntryIndexes(actualEntries = [], requiredEntries = []) {
  const matched = new Set();
  for (const required of requiredEntries) {
    const index = actualEntries.findIndex((entry, candidateIndex) => (
      !matched.has(candidateIndex) &&
      entry[0] === required[0] &&
      entry[1] === required[1]
    ));
    if (index >= 0) matched.add(index);
  }
  return matched;
}

function removeCaptureQueryMatchEntry(capture, options, removeIndex) {
  if (!Number.isInteger(removeIndex) || removeIndex < 0) return;
  const actualEntries = paramsToEntries(capture.query || '');
  const currentTemplate = paramsToEntries(options.queryTemplate || '');
  const matchedIndexes = queryMatchedEntryIndexes(actualEntries, currentTemplate);
  if (!matchedIndexes.has(removeIndex)) return;
  const nextEntries = actualEntries.filter((_entry, index) => matchedIndexes.has(index) && index !== removeIndex);
  const nextQuery = queryEntriesToString(nextEntries);
  const nextOptions = {
    query: true,
    body: !els.captureMergeBody.checked,
    variantKey: mergeVariantKeyForDraft(capture, {
      query: true,
      body: !els.captureMergeBody.checked
    }),
    queryTemplate: nextQuery
  };
  els.captureQueryInput.value = nextQuery;
  applyCaptureMergeRuleDraft(capture, nextOptions, { render: false });
  renderCaptureQueryPreview(capture, { ...options, queryTemplate: nextQuery }, true);
  scheduleCaptureMergeRuleSave(capture, nextOptions);
}

function queryEntriesToString(entries = []) {
  const params = new URLSearchParams();
  entries.forEach(([key, value]) => params.append(key, value));
  return params.toString();
}

function renderCaptureBodyDeleteEditor(capture = {}, options = {}) {
  const template = String(options.bodyTemplate || '');
  els.editor.classList.remove('preview-code-active', 'edit-highlight-active');
  els.bodyHighlight.classList.remove('edit-highlight-active');
  els.bodyHighlight.classList.add('capture-body-delete-editor');
  els.bodyHighlight.tabIndex = 0;
  els.bodyHighlight.hidden = false;
  els.bodyHighlight.dataset.language = 'Body';
  const contentType = String(options.requestContentType || capture.requestContentType || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    renderCaptureFormBodyDeleteEditor(capture, options, template);
    return;
  }
  const parsed = parseJson(template);
  if (parsed.ok) {
    els.bodyHighlight.innerHTML = captureJsonDeleteCodeHtml(parsed.value);
    bindCaptureJsonBodyDeleteActions(capture, options, parsed.value);
    return;
  }
  els.bodyHighlight.innerHTML = highlightCodeHtml(template || ' ', detectPreviewLanguage(template, 'request').kind);
}

function renderCaptureFormBodyDeleteEditor(capture, options, template) {
  const entries = paramsToEntries(template);
  els.bodyHighlight.innerHTML = entries.length
    ? entries.map((entry, index) => captureFormBodyDeleteLineHtml(entry, index)).join('')
    : '<span class="capture-delete-empty">(empty)</span>';
  els.bodyHighlight.querySelectorAll('.capture-json-code-line.can-delete > .capture-delete-gutter > .capture-delete-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('.capture-json-code-line');
      const index = Number(row?.dataset.queryIndex);
      if (!Number.isInteger(index)) return;
      const nextBody = queryEntriesToString(entries.filter((_entry, itemIndex) => itemIndex !== index));
      saveCaptureBodyTemplateAfterDelete(capture, options, nextBody);
    });
  });
}

function captureFormBodyDeleteLineHtml(entry, index) {
  const [key, value] = entry;
  return `<span class="capture-json-code-line can-delete" data-query-index="${index}"><span class="capture-delete-gutter"><button class="capture-delete-btn" type="button" aria-label="${escapeHtml(t('body.deleteAria'))}">×</button></span><span class="capture-json-code-text"><span class="code-token-key">${escapeHtml(key)}</span><span class="code-token-punctuation">=</span><span class="code-token-string">${escapeHtml(value)}</span></span></span>`;
}

function captureJsonDeleteCodeHtml(value) {
  const lines = JSON.stringify(value, null, 2).split('\n');
  const pathByLine = jsonDeletablePathByLine(value);
  return lines.map((line, index) => {
    const path = pathByLine.get(index);
    const canDelete = Boolean(path?.length);
    const encodedPath = canDelete ? encodeURIComponent(JSON.stringify(path)) : '';
    return `<span class="capture-json-code-line${canDelete ? ' can-delete' : ''}"${canDelete ? ` data-json-path="${encodedPath}"` : ''}><span class="capture-delete-gutter">${canDelete ? `<button class="capture-delete-btn" type="button" aria-label="${escapeHtml(t('body.deleteAria'))}">×</button>` : ''}</span><span class="capture-json-code-text">${jsonHighlightHtml(line || ' ')}</span></span>`;
  }).join('');
}

function jsonDeletablePathByLine(value) {
  const paths = new Map();
  let line = 0;
  walkJsonLines(value, [], paths, () => {
    line += 1;
  }, () => line);
  return paths;
}

function walkJsonLines(value, path, paths, nextLine, currentLine) {
  if (Array.isArray(value)) {
    nextLine();
    value.forEach((item, index) => {
      paths.set(currentLine(), [...path, index]);
      walkJsonLines(item, [...path, index], paths, nextLine, currentLine);
    });
    nextLine();
    return;
  }
  if (value && typeof value === 'object') {
    nextLine();
    Object.entries(value).forEach(([key, item]) => {
      paths.set(currentLine(), [...path, key]);
      walkJsonLines(item, [...path, key], paths, nextLine, currentLine);
    });
    nextLine();
    return;
  }
  nextLine();
}

function bindCaptureJsonBodyDeleteActions(capture, options, value) {
  els.bodyHighlight.querySelectorAll('.capture-json-code-line.can-delete > .capture-delete-gutter > .capture-delete-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const row = button.closest('[data-json-path]');
      const path = decodeJsonDeletePath(row?.dataset.jsonPath || '');
      if (!path.length) return;
      const nextValue = deleteJsonPath(value, path);
      saveCaptureBodyTemplateAfterDelete(capture, options, JSON.stringify(nextValue, null, 2));
    });
  });
}

function decodeJsonDeletePath(value) {
  try {
    const parsed = JSON.parse(decodeURIComponent(value || ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deleteJsonPath(source, path) {
  const clone = JSON.parse(JSON.stringify(source));
  let target = clone;
  for (let index = 0; index < path.length - 1; index += 1) {
    target = target?.[path[index]];
  }
  const last = path[path.length - 1];
  if (Array.isArray(target) && typeof last === 'number') {
    target.splice(last, 1);
  } else if (target && typeof target === 'object') {
    delete target[last];
  }
  return clone;
}

function saveCaptureBodyTemplateAfterDelete(capture, options, nextBody) {
  const nextOptions = {
    query: !els.captureMergeQuery.checked,
    body: true,
    variantKey: mergeVariantKeyForDraft(capture, {
      query: !els.captureMergeQuery.checked,
      body: true
    }),
    bodyTemplate: nextBody,
    requestContentType: options.requestContentType || capture.requestContentType || ''
  };
  els.editor.value = nextBody;
  applyCaptureMergeRuleDraft(capture, nextOptions, { render: false });
  renderCaptureBodyDeleteEditor(capture, nextOptions);
  scheduleCaptureMergeRuleSave(capture, nextOptions);
}

function captureMergeOptionsForCapture(capture = {}) {
  if (!capture?.mergeKey) return capture?.mergeOptions || {};
  const baseRule = state.captureMergeRules[capture.mergeKey] || {};
  const hasLocalRule = Object.hasOwn(state.captureMergeRules, capture.mergeKey);
  const serverOptions = capture.mergeOptions || {};
  const hasVariants = Boolean(baseRule.variants && Object.keys(baseRule.variants).length);
  const hasLegacyTemplate = Boolean(baseRule.queryTemplate || baseRule.bodyTemplate);
  const variant = captureMergeVariantForCapture(baseRule, capture, baseRule);
  const variantKey = hasVariants || !hasLegacyTemplate ? variant.key : (serverOptions.variantKey || '');
  const variantRule = variant.rule || (variantKey && baseRule.variants ? baseRule.variants[variantKey] : null);
  return {
    query: hasLocalRule ? baseRule.query === true : serverOptions.query === true,
    body: hasLocalRule ? baseRule.body === true : serverOptions.body === true,
    variantKey,
    queryTemplate: variantRule && Object.hasOwn(variantRule, 'queryTemplate')
      ? String(variantRule.queryTemplate || '')
      : (!hasVariants && Object.hasOwn(serverOptions, 'queryTemplate') ? String(serverOptions.queryTemplate || '') : String(capture.query || '')),
    bodyTemplate: variantRule && Object.hasOwn(variantRule, 'bodyTemplate')
      ? String(variantRule.bodyTemplate || '')
      : (!hasVariants && Object.hasOwn(serverOptions, 'bodyTemplate') ? String(serverOptions.bodyTemplate || '') : requestBodyText(capture.requestBody)),
    requestContentType: String(variantRule?.requestContentType || serverOptions.requestContentType || capture.requestContentType || '')
  };
}

function updateRuleOptionEditor() {
  const rule = state.selectedRuleId
    ? state.rules.find((item) => item.id === state.selectedRuleId)
    : state.remoteRules.find((item) => item.id === state.selectedRemoteRuleId);
  const isRulePreview = (state.previewMode === 'rule' || state.previewMode === 'remote') && Boolean(rule);
  const isGlobal = isGlobalRemoteRule(rule);
  els.ruleOptionEditor.hidden = !isRulePreview || isGlobal;
  els.ruleBodyMatchEditor.hidden = !(isRulePreview && !isGlobal && state.previewBodyTab === 'request');
  if (!isRulePreview) {
    refreshEditorTitle();
    return;
  }

  els.ruleOptionQuery.checked = rule.queryMode === 'exact';
  els.ruleOptionEnabled.checked = rule.enabled !== false;
  els.ruleOptionBodyRow.hidden = !methodHasRequestBody(rule.method);
  els.ruleOptionBody.checked = rule.requestBodyMode !== 'ignore';
  refreshEditorTitle();
}

async function clearAllCaptures() {
  closeClearCapturesMenu();
  if (!window.confirm(t('clear.confirmAllCaptures'))) return;
  state.selectedCaptureId = null;
  clearPreviewPaneCache();
  state.previewOpenTabs = [];
  state.activePreviewTabId = '';
  resetPreviewWorkspaceTabHistory();
  persistPreviewWorkspaceAndSettings({ immediate: true });
  clearPreview();
  renderPreviewWorkspaceTabs();
  await fetch('/api/captures', { method: 'DELETE' });
  state.captures = [];
  renderCaptures();
}

async function clearOlderCaptures() {
  closeClearCapturesMenu();
  if (!window.confirm(t('clear.confirmOlderCaptures'))) return;
  const selectedGroup = selectedCaptureSummary();
  const keepSelectedPreview = Boolean(selectedGroup && selectedGroup.id === state.selectedCaptureId);
  if (!keepSelectedPreview) {
    state.selectedCaptureId = null;
    clearPreview();
  }
  await fetch('/api/captures/history', { method: 'DELETE' });
  await reloadCaptures({ replace: true });
}

async function clearNotes() {
  closeClearCapturesMenu();
  if (!window.confirm(t('clear.confirmNotes'))) return;
  await fetch('/api/notes', { method: 'DELETE' });
  state.apiNotes = {};
  state.apiDetails = {};
  state.activeDetailNoteKey = '';
  state.activeDetailNoteText = '';
  setEditorNote('');
  closeDetailNoteDialog();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  renderDetailNoteButton();
}

async function clearRules() {
  closeClearCapturesMenu();
  if (!window.confirm(t('clear.confirmRules'))) return;
  state.selectedRuleId = null;
  state.selectedRemoteRuleId = null;
  state.remoteSteps = [];
  await fetch('/api/rules/all', { method: 'DELETE' });
  state.rules = [];
  state.remoteRules = [];
  clearPreviewPaneCache();
  prunePreviewWorkspaceTabs();
  if (!state.previewOpenTabs.length) {
    state.activePreviewTabId = '';
    clearPreview();
  }
  persistPreviewWorkspaceAndSettings({ immediate: true });
  renderPreviewWorkspaceTabs();
  renderRules();
  renderRemoteRules();
  renderCaptures();
}

function scheduleSettingsSave(options = {}) {
  window.clearTimeout(settingsSaveTimer);
  const save = () => {
    const payload = {
      aiNotesEnabled: state.aiNotesEnabled,
      aiProvider: state.aiProvider,
      language: state.language,
      appearance: state.appearance,
      captureFilter: state.captureFilter,
      displayFilter: state.displayFilter,
      captureMergeEnabled: state.captureMergeEnabled,
      captureTreeViewEnabled: state.captureTreeViewEnabled,
      maxRecentRequests: state.maxRecentRequests,
      captureTabs: persistedCaptureTabs(),
      activeCaptureTabId: persistedActiveCaptureTabId(),
      domainHistory: normalizeDomainHistory(state.domainHistory, state.captureTabs),
      domainProjectPaths: normalizeDomainProjectPaths(state.domainProjectPaths, state.captureTabs),
      domainProjectsInitialized: state.domainProjectsInitialized,
      requireDomainHistorySelection: state.requireDomainHistorySelection
    };
    if (!state.manualRuleSaveRequired) {
      payload.captureMergeRules = state.captureMergeRules;
    }
    patchJson('/api/settings', payload).catch((error) => {
      console.error(error);
    });
  };
  if (options.immediate) {
    save();
    return;
  }
  settingsSaveTimer = window.setTimeout(save, 250);
}

function renderRules() {
  const domain = currentProjectDomain();
  const visibleRules = sortRulesByPath(domain
    ? state.rules.filter((rule) => normalizeHostInput(rule.host) === domain)
    : state.rules);
  els.ruleCount.textContent = String(visibleRules.length);
  els.rules.innerHTML = '';

  if (!visibleRules.length) {
    els.rules.append(empty(t('local.empty')));
    return;
  }

  if (domain) {
    for (const rule of visibleRules) {
      els.rules.append(renderLocalRuleItem(rule));
    }
    return;
  }
  renderRuleGroups(els.rules, visibleRules, renderLocalRuleItem);
}

function renderLocalRuleItem(rule) {
  const item = document.createElement('article');
  const selected = rule.id === state.selectedRuleId;
  item.className = `rule${selected ? ' active' : ''}`;
  item.dataset.ruleId = rule.id || '';
  const summaryHtml = shouldShowRuleMatchSummary(rule) ? ruleMatchSummaryHtml(rule) : '';
  item.innerHTML = `
    <div class="rule-layout">
      <div class="rule-content">
        <div class="row rule-main">
          <span class="request-line selectable-text" data-text="target">${requestLineHtml(rule, { target: ruleTarget(rule), includeStatus: false })}</span>
          <span class="rule-enabled-dot${rule.enabled === false ? ' off' : ''}"></span>
        </div>
        ${summaryHtml}
      </div>
      ${selected ? ruleHitCaptureListHtml(rule, 'local') : ''}
    </div>
  `;

  item.addEventListener('click', () => {
    selectRuleFromList(rule.id, els.rules);
  });
  item.addEventListener('contextmenu', (event) => {
    showLocalRuleContextMenu(event, rule.id);
  });
  item.querySelectorAll('[data-text]').forEach((element) => {
    element.addEventListener('click', (event) => {
      handleSelectableTextClick(event, rule.id === state.selectedRuleId, () => selectRuleFromList(rule.id, els.rules));
    });
  });
  bindRuleHitCaptureItems(item, rule.id, 'local');
  return item;
}

function renderRemoteRules() {
  const domain = currentProjectDomain();
  const realRules = sortRulesByPath(state.remoteRules.filter((rule) => {
    if (isGlobalRemoteRule(rule)) return false;
    return !domain || normalizeHostInput(rule.host) === domain;
  }));
  const globalRules = sortRulesByPath(state.remoteRules.filter((rule) => {
    if (!isGlobalRemoteRule(rule) || !rule.host) return false;
    return !domain || normalizeHostInput(rule.host) === domain;
  }));
  const visibleRuleCount = realRules.length + globalRules.length;
  els.remoteRuleCount.textContent = String(visibleRuleCount);
  els.remoteRules.innerHTML = '';

  renderGlobalRemoteRuleGroup(globalRules, { placeholderHost: domain && !globalRules.length ? domain : '' });

  if (!realRules.length) {
    return;
  }

  renderRuleGroups(els.remoteRules, realRules, renderRemoteRuleItem);
}

function renderGlobalRemoteRuleGroup(rules = [], options = {}) {
  const placeholderHost = normalizeHostInput(options.placeholderHost || '');
  const entries = rules.length ? rules : (placeholderHost ? [null] : []);
  if (!entries.length) return;
  const section = document.createElement('section');
  section.className = 'rule-group global-rule-group';
  const head = document.createElement('div');
  head.className = 'rule-group-head';
  head.innerHTML = `
    <span class="rule-group-title">${escapeHtml(t('remote.globalRules'))}</span>
    <span class="rule-group-count" data-count="${rules.filter(Boolean).length}"></span>
  `;
  section.append(head);
  for (const rule of entries) {
    section.append(rule ? renderGlobalRemoteRuleItem(rule) : renderProjectGlobalRemoteRuleEntry(placeholderHost));
  }
  els.remoteRules.append(section);
}

function renderProjectGlobalRemoteRuleEntry(domain) {
  const item = document.createElement('article');
  item.className = 'rule global-rule-placeholder';
  item.innerHTML = `
      <div class="rule-layout">
        <div class="rule-content">
          <div class="row rule-main">
            <strong class="path host">${escapeHtml(t('remote.addGlobalRule'))}</strong>
          </div>
        </div>
      </div>
    `;
  item.addEventListener('click', () => {
    selectOrCreateGlobalRemoteRule(domain).catch((error) => {
      console.error(error);
    });
  });
  return item;
}

function renderGlobalRemoteRuleItem(rule) {
  const item = document.createElement('article');
  item.className = `rule global-rule-item${rule.id === state.selectedRemoteRuleId ? ' active' : ''}`;
  item.dataset.ruleId = rule.id || '';
  const title = normalizeHostInput(rule.host) || t('capture.unknownHost');
  item.innerHTML = `
    <div class="rule-layout">
      <div class="rule-content">
        <div class="row rule-main">
          <span class="request-line selectable-text" data-text="target">${escapeHtml(title)}</span>
          <span class="rule-enabled-dot${rule.enabled === false ? ' off' : ''}"></span>
        </div>
      </div>
    </div>
  `;
  item.addEventListener('click', () => {
    selectRemoteRuleFromList(rule.id, els.remoteRules);
  });
  item.querySelectorAll('[data-text]').forEach((element) => {
    element.addEventListener('click', (event) => {
      handleSelectableTextClick(event, rule.id === state.selectedRemoteRuleId, () => selectRemoteRuleFromList(rule.id, els.remoteRules));
    });
  });
  return item;
}

function renderRemoteRuleItem(rule) {
  const item = document.createElement('article');
  const selected = rule.id === state.selectedRemoteRuleId;
  item.className = `rule${selected ? ' active' : ''}`;
  item.dataset.ruleId = rule.id || '';
  const summaryHtml = shouldShowRuleMatchSummary(rule) ? ruleMatchSummaryHtml(rule) : '';
  item.innerHTML = `
    <div class="rule-layout">
      <div class="rule-content">
        <div class="row rule-main">
          <span class="request-line selectable-text" data-text="target">${requestLineHtml(rule, { target: ruleTarget(rule), includeStatus: false })}</span>
          <span class="rule-enabled-dot${rule.enabled === false ? ' off' : ''}"></span>
        </div>
        ${summaryHtml}
      </div>
      ${selected ? ruleHitCaptureListHtml(rule, 'remote') : ''}
    </div>
  `;

  item.addEventListener('click', () => {
    selectRemoteRuleFromList(rule.id, els.remoteRules);
  });
  item.addEventListener('contextmenu', (event) => {
    showRemoteRuleContextMenu(event, rule.id);
  });
  item.querySelectorAll('[data-text]').forEach((element) => {
    element.addEventListener('click', (event) => {
      handleSelectableTextClick(event, rule.id === state.selectedRemoteRuleId, () => selectRemoteRuleFromList(rule.id, els.remoteRules));
    });
  });
  bindRuleHitCaptureItems(item, rule.id, 'remote');
  return item;
}

function ruleHitCaptureListHtml(rule, kind) {
  const captures = ruleHitCaptures(rule, kind);
  if (!captures.length) return '';
  const key = ruleHitCaptureKey(kind, rule.id);
  const expanded = state.expandedRuleHitCaptures.has(key);
  return `
    <div class="rule-hit-captures" aria-label="${escapeHtml(t('capture.historyAria'))}">
      <button class="capture-history-label rule-hit-captures-label" type="button" data-rule-hit-key="${escapeHtml(key)}" aria-expanded="${String(expanded)}">
        <span>${escapeHtml(t('rule.hitCaptures'))} · ${escapeHtml(t(expanded ? 'capture.collapse' : 'capture.expand'))}</span>
      </button>
      <div class="rule-hit-capture-list"${expanded ? '' : ' hidden'}>
        ${captures.map((capture) => `
          <button class="capture-history-item rule-hit-capture${capture.id === state.selectedCaptureId ? ' active' : ''}" type="button" data-capture-id="${escapeHtml(capture.id)}">
            <span class="capture-history-line"></span>
            <span class="rule-hit-capture-main">
              <span class="request-line">${requestLineHtml(capture, { target: requestTarget(capture), includeStatus: true })}</span>
            </span>
            <span class="capture-time-row">
              <span class="capture-time-text">${escapeHtml(new Date(capture.createdAt).toLocaleTimeString())}</span>
            </span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function bindRuleHitCaptureItems(container, ruleId, kind) {
  container.querySelector('.rule-hit-captures-label')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleRuleHitCaptures(ruleHitCaptureKey(kind, ruleId));
  });
  container.querySelectorAll('.rule-hit-capture').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      previewRuleHitCapture(button.dataset.captureId, ruleId, kind).catch((error) => {
        console.error(error);
      });
    });
  });
}

function ruleHitCaptureKey(kind, ruleId) {
  return `${kind}:${ruleId || ''}`;
}

function toggleRuleHitCaptures(key) {
  if (!key) return;
  if (state.expandedRuleHitCaptures.has(key)) {
    state.expandedRuleHitCaptures.delete(key);
  } else {
    state.expandedRuleHitCaptures.add(key);
  }
  renderRules();
  renderRemoteRules();
}

function ruleHitCaptures(rule, kind) {
  if (!rule?.id) return [];
  const captures = [];
  for (const capture of state.captures) {
    for (const item of captureGroupItems(capture)) {
      if (captureMatchesRuleHit(item, rule.id, kind)) {
        captures.push(item);
      }
    }
  }
  return captures.sort((a, b) => captureTimestamp(b) - captureTimestamp(a));
}

function captureGroupItems(capture = {}) {
  return [
    capture,
    ...(Array.isArray(capture.history)
      ? capture.history.map((item) => captureHistoryItemWithGroupContext(capture, item))
      : [])
  ].filter((item) => item?.id);
}

function captureHistoryItemWithGroupContext(capture = {}, item = {}) {
  return {
    ...capture,
    ...item,
    mapType: item.mapType || '',
    mapRuleId: item.mapRuleId || '',
    mapRuleIds: Array.isArray(item.mapRuleIds) ? item.mapRuleIds : []
  };
}

function captureMatchesRuleHit(capture = {}, ruleId, kind) {
  if (kind === 'local') {
    return capture.mapType === 'local' && capture.mapRuleId === ruleId;
  }
  const ids = new Set([
    capture.mapRuleId,
    ...(Array.isArray(capture.mapRuleIds) ? capture.mapRuleIds : [])
  ].filter(Boolean));
  return capture.mapType === 'remote' && ids.has(ruleId);
}

async function previewRuleHitCapture(captureId, ruleId, kind) {
  if (!captureId || !ruleId) return;
  const expectedRuleId = kind === 'local' ? state.selectedRuleId : state.selectedRemoteRuleId;
  if (expectedRuleId !== ruleId) {
    if (kind === 'local') {
      await selectRule(ruleId);
    } else {
      await selectRemoteRule(ruleId);
    }
  }
  await selectCapture(captureId, { keepSelectedRule: true });
  state.selectedRuleId = kind === 'local' ? ruleId : null;
  state.selectedRemoteRuleId = kind === 'remote' ? ruleId : null;
  renderRules();
  renderRemoteRules();
}

function renderRuleGroups(container, rules, renderItem) {
  for (const group of groupRulesByHost(rules)) {
    const section = document.createElement('section');
    section.className = 'rule-group';

    const head = document.createElement('div');
    head.className = 'rule-group-head';
    head.innerHTML = `
      <span class="rule-group-title">${escapeHtml(group.host)}</span>
      <span class="rule-group-count" data-count="${group.rules.length}"></span>
    `;
    section.append(head);

    for (const rule of group.rules) {
      section.append(renderItem(rule));
    }

    container.append(section);
  }
}

function groupRulesByHost(rules = []) {
  const groups = new Map();
  for (const rule of sortRulesByPath(rules)) {
    const host = String(rule.host || t('capture.unknownHost'));
    if (!groups.has(host)) {
      groups.set(host, []);
    }
    groups.get(host).push(rule);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([host, groupedRules]) => ({
    host,
    rules: sortRulesByPath(groupedRules)
  }));
}

function sortRulesByPath(rules = []) {
  return [...rules].sort((a, b) => compareRulesByPath(a, b));
}

function compareRulesByPath(a = {}, b = {}) {
  return String(a.path || '').localeCompare(String(b.path || '')) ||
    String(a.method || '').localeCompare(String(b.method || '')) ||
    String(a.host || '').localeCompare(String(b.host || '')) ||
    String(a.id || '').localeCompare(String(b.id || ''));
}

function requestLine(item = {}, options = {}) {
  const parts = [displayMethod(item.method)].filter(Boolean);
  if (options.includeStatus) {
    parts.push(String(item.statusCode || '-'));
  }
  if (options.target) {
    parts.push(options.target);
  }
  if (options.suffix) {
    parts.push(options.suffix);
  }
  return parts.join(' · ');
}

function requestLineHtml(item = {}, options = {}) {
  const method = displayMethod(item.method);
  const status = options.includeStatus ? String(item.statusCode || '-') : '';
  const parts = [];
  if (options.target) {
    parts.push(options.target);
  }
  if (options.suffix) {
    parts.push(options.suffix);
  }
  const hasMore = Boolean(status || parts.length);
  const text = [
    method,
    status,
    ...parts
  ].filter(Boolean).join(' · ');
  return `<span class="request-line-inline">${escapeHtml(text)}</span>`;
}

function displayMethod(method) {
  const value = String(method || '').toUpperCase();
  if (!value) return '';
  if (value === 'DELETE') return 'DEL';
  if (value === 'OPTIONS') return 'OPT';
  if (value === 'CONNECT') return 'CON';
  if (value === 'PATCH') return 'PAT';
  if (value === 'HEAD') return 'HEA';
  return value.slice(0, 3);
}

function remoteRuleSummary(rule) {
  const aiSummaries = parseRemoteScriptForEditor(rule.script, rule)
    .filter((step) => step.type === 'ai')
    .map((step) => normalizeAiSummary(step.summary || t('remote.aiDefaultSummary')));
  return aiSummaries.join(' / ');
}

function renderRemoteDslRows() {
  const summaryFocus = currentRemoteStepSummaryEdit();
  if (summaryFocus?.rowId) {
    const row = state.remoteSteps.find((item) => item.id === summaryFocus.rowId);
    if (row) applyRemoteStepSummaryEdit(row, summaryFocus.value);
  }
  if (summaryFocus?.composing && document.activeElement?.classList?.contains('remote-step-list-summary')) {
    return;
  }

  renderingRemoteDslRows = true;
  els.remoteDslList.innerHTML = '';

  if (!state.remoteSteps.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'remote-dsl-empty';
    emptyState.textContent = t('remote.emptySteps');
    els.remoteDslList.append(emptyState);
    renderingRemoteDslRows = false;
    return;
  }

  for (const row of state.remoteSteps) {
    const item = document.createElement('div');
    item.className = `remote-dsl-row${row.type === 'ai' ? ' remote-ai-step-row' : ''}${row.enabled === false ? ' is-disabled' : ''}`;
    item.dataset.rowId = row.id;
    item.draggable = false;

    const dragHandle = document.createElement('button');
    dragHandle.className = `remote-dsl-drag${row.type === 'ai' ? ' remote-dsl-ai-drag' : ''}`;
    dragHandle.type = 'button';
    if (row.type === 'ai') {
      dragHandle.textContent = 'AI';
    }
    setInstantTooltip(dragHandle, t('remote.dragSort'));
    dragHandle.setAttribute('aria-label', t('remote.dragSort'));
    dragHandle.addEventListener('pointerdown', () => {
      item.draggable = true;
    });
    dragHandle.addEventListener('pointerup', () => {
      item.draggable = false;
    });
    dragHandle.addEventListener('pointercancel', () => {
      item.draggable = false;
    });

    const enabledLabel = createRemoteStepEnabledControl(row, item);

    if (row.type === 'ai') {
      const editButton = createRemoteStepEditButton(t('remote.editAiRule'), () => openRemoteAiEditor(row.id));
      const summary = createRemoteStepSummaryInput(row, t('remote.aiDefaultSummary'));
      const deleteButton = createRemoteStepDeleteButton(row, t('remote.deleteAiRule'));
      item.append(dragHandle, enabledLabel, summary, editButton, deleteButton);
      els.remoteDslList.append(item);
      continue;
    }

    const editButton = createRemoteStepEditButton(t('remote.editManualRule'), () => openRemoteDslStepEditor(row.id));
    const summary = createRemoteStepSummaryInput(row, t('remote.manualDefaultSummary'));
    const deleteButton = createRemoteStepDeleteButton(row, t('remote.deleteManualRule'));
    item.append(dragHandle, enabledLabel, summary, editButton, deleteButton);
    els.remoteDslList.append(item);
  }
  attachRemoteStepDragHandlers();
  renderingRemoteDslRows = false;
  restoreRemoteStepSummaryFocus(summaryFocus);
}

function createRemoteStepEnabledControl(row, item) {
  const enabledLabel = document.createElement('label');
  enabledLabel.className = 'switch remote-dsl-enabled';
  const enabledInput = document.createElement('input');
  enabledInput.type = 'checkbox';
  enabledInput.checked = row.enabled !== false;
  enabledInput.setAttribute('aria-label', t('remote.ruleEnabledAria'));
  enabledInput.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  enabledLabel.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  enabledInput.addEventListener('change', (event) => {
    event.stopPropagation();
    row.enabled = enabledInput.checked;
    item.classList.toggle('is-disabled', !row.enabled);
    scheduleRemotePreview();
    scheduleRuleAutoSave();
    if (row.id === state.selectedAiStepId) {
      renderRemoteAiEditor(state.remoteRules.find((rule) => rule.id === state.selectedRemoteRuleId));
    }
    if (row.id === state.selectedDslStepId) {
      renderRemoteDslStepEditor();
    }
  });
  enabledLabel.append(enabledInput, document.createTextNode(t('common.enabled')));
  return enabledLabel;
}

function createRemoteStepEditButton(title, onClick) {
  const editButton = document.createElement('button');
  editButton.className = 'remote-step-edit';
  editButton.type = 'button';
  editButton.textContent = t('actions.edit');
  setInstantTooltip(editButton, title);
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return editButton;
}

function createRemoteStepSummaryInput(row, fallback) {
  const summary = document.createElement('input');
  summary.className = 'remote-step-list-summary';
  summary.type = 'text';
  summary.dataset.rowId = row.id || '';
  summary.autocomplete = 'off';
  summary.spellcheck = false;
  summary.value = remoteStepSummaryText(row, fallback);
  setInstantTooltip(summary, summary.value);
  summary.placeholder = t('remote.summaryPlaceholder');
  summary.setAttribute('aria-label', t('remote.summaryAria'));
  summary.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  summary.addEventListener('focus', () => {
    rememberRemoteStepSummaryFocus(summary);
  });
  summary.addEventListener('compositionstart', () => {
    summary.dataset.composing = 'true';
    rememberRemoteStepSummaryFocus(summary, { composing: true });
  });
  summary.addEventListener('compositionend', () => {
    summary.dataset.composing = 'false';
    rememberRemoteStepSummaryFocus(summary, { composing: false });
    scheduleRuleAutoSave();
  });
  summary.addEventListener('select', () => {
    rememberRemoteStepSummaryFocus(summary);
  });
  summary.addEventListener('input', (event) => {
    event.stopPropagation();
    rememberRemoteStepSummaryFocus(summary);
    if (row.type === 'ai') {
      row.summary = normalizeAiSummary(summary.value);
      if (row.id === state.selectedAiStepId && !els.remoteAiEditor.hidden) {
        els.remoteAiSummary.value = isDefaultAiSummary(row.summary) ? '' : row.summary;
      }
    } else {
      row.note = summary.value;
      if (row.id === state.selectedDslStepId && !els.remoteDslStepEditor.hidden) {
        els.remoteDslSummary.value = row.note || '';
      }
    }
    if (event.isComposing || summary.dataset.composing === 'true') return;
    scheduleRuleAutoSave();
  });
  summary.addEventListener('keydown', (event) => {
    event.stopPropagation();
  });
  summary.addEventListener('keyup', () => {
    rememberRemoteStepSummaryFocus(summary);
  });
  summary.addEventListener('blur', () => {
    if (renderingRemoteDslRows) return;
    const rowId = summary.dataset.rowId || '';
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active?.classList?.contains('remote-step-list-summary')) return;
      if (state.remoteStepSummaryFocus?.rowId === rowId) {
        state.remoteStepSummaryFocus = null;
      }
    }, 0);
  });
  return summary;
}

function applyRemoteStepSummaryEdit(row, value) {
  if (!row) return;
  if (row.type === 'ai') {
    row.summary = normalizeAiSummary(value);
    return;
  }
  row.note = value;
}

function currentRemoteStepSummaryEdit() {
  const active = document.activeElement;
  if (active?.classList?.contains('remote-step-list-summary')) {
    return captureRemoteStepSummaryFocus(active);
  }
  return state.remoteStepSummaryFocus?.rowId ? { ...state.remoteStepSummaryFocus } : null;
}

function captureRemoteStepSummaryFocus(input) {
  const value = input?.value || '';
  const start = Number.isFinite(input?.selectionStart) ? input.selectionStart : value.length;
  const end = Number.isFinite(input?.selectionEnd) ? input.selectionEnd : start;
  const previous = state.remoteStepSummaryFocus;
  const rowId = input?.dataset?.rowId || '';
  return {
    rowId,
    value,
    selectionStart: Math.max(0, Math.min(start, value.length)),
    selectionEnd: Math.max(0, Math.min(end, value.length)),
    composing: input?.dataset?.composing === 'true' || (previous?.rowId === rowId && previous.composing === true)
  };
}

function rememberRemoteStepSummaryFocus(input, patch = {}) {
  state.remoteStepSummaryFocus = {
    ...captureRemoteStepSummaryFocus(input),
    ...patch
  };
}

function restoreRemoteStepSummaryFocus(snapshot) {
  if (!snapshot?.rowId || !els.remoteDslList) return;
  window.requestAnimationFrame(() => {
    const input = els.remoteDslList.querySelector(`.remote-step-list-summary[data-row-id="${cssEscape(snapshot.rowId)}"]`);
    if (!input) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== input && !els.remoteDslList.contains(active)) return;
    input.focus({ preventScroll: true });
    const length = input.value.length;
    const start = Math.max(0, Math.min(snapshot.selectionStart ?? length, length));
    const end = Math.max(0, Math.min(snapshot.selectionEnd ?? start, length));
    input.setSelectionRange(start, end);
    state.remoteStepSummaryFocus = {
      ...snapshot,
      value: input.value,
      selectionStart: start,
      selectionEnd: end
    };
  });
}

function createRemoteStepDeleteButton(row, title) {
  const deleteButton = document.createElement('button');
  deleteButton.className = 'remote-dsl-delete';
  deleteButton.type = 'button';
  deleteButton.textContent = t('actions.delete');
  setInstantTooltip(deleteButton, title);
  deleteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    deleteRemoteStep(row.id);
  });
  return deleteButton;
}

function remoteStepSummaryText(row, fallback) {
  if (row.type === 'ai') return normalizeAiSummary(row.summary || fallback);
  return String(row.note || '').trim() || defaultDslStepSummary(row, fallback);
}

function defaultDslStepSummary(row, fallback = t('remote.manualDefaultSummary')) {
  const path = String(row.path || '').trim();
  const value = String(row.value ?? '');
  if (!path && !value) return fallback;
  return `${t('remote.manualDefaultSummary')}: ${path || t('remote.defaultDslMissing')}=${value || t('remote.defaultDslEmpty')}`;
}

function attachRemoteStepDragHandlers() {
  els.remoteDslList.querySelectorAll('.remote-dsl-row').forEach((item) => {
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.dataset.rowId || '');
      item.classList.add('is-dragging');
    });
    item.addEventListener('dragend', () => {
      item.draggable = false;
      item.classList.remove('is-dragging');
      els.remoteDslList.querySelectorAll('.remote-dsl-row.is-drop-target').forEach((target) => {
        target.classList.remove('is-drop-target');
      });
    });
    item.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      item.classList.add('is-drop-target');
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('is-drop-target');
    });
    item.addEventListener('drop', (event) => {
      event.preventDefault();
      item.classList.remove('is-drop-target');
      const sourceId = event.dataTransfer.getData('text/plain');
      const targetId = item.dataset.rowId || '';
      reorderRemoteStep(sourceId, targetId);
    });
  });
}

function reorderRemoteStep(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = state.remoteSteps.findIndex((step) => step.id === sourceId);
  const targetIndex = state.remoteSteps.findIndex((step) => step.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [step] = state.remoteSteps.splice(sourceIndex, 1);
  state.remoteSteps.splice(targetIndex, 0, step);
  renderRemoteDslRows();
  scheduleRemotePreview();
  scheduleRuleAutoSave();
}

function addRemoteDslRow() {
  const row = createRemoteDslRow();
  state.remoteSteps.push(row);
  openRemoteDslStepEditor(row.id);
  renderRemoteDslRows();
  scheduleRemotePreview();
  scheduleRuleAutoSave();
  window.requestAnimationFrame(() => {
    els.remoteDslAction.focus();
  });
}

async function addRemoteAiStep() {
  if (aiProviderDisabled()) return;
  const step = createRemoteAiStep();
  step.aiContext = null;
  step.aiPromptHistory = [];
  state.remoteSteps.push(step);
  openRemoteAiEditor(step.id);
  renderRemoteDslRows();
  scheduleRemotePreview();
  scheduleRuleAutoSave();
  await persistCurrentRemoteEditor({ preserveSelection: true, allowIncompleteDsl: true });
}

function deleteRemoteStep(stepId) {
  state.remoteSteps = state.remoteSteps.filter((candidate) => candidate.id !== stepId);
  if (state.selectedAiStepId === stepId) {
    state.selectedAiStepId = '';
    setPreviewBodyTab('response');
  }
  if (state.selectedDslStepId === stepId) {
    state.selectedDslStepId = '';
    setPreviewBodyTab('response');
  }
  renderRemoteDslRows();
  renderRemoteRuleEditorMode();
  scheduleRemotePreview();
  scheduleRuleAutoSave();
}

function openRemoteDslEditor() {
  if (!state.selectedRemoteRuleId) return;
  state.selectedAiStepId = '';
  state.selectedDslStepId = '';
  setPreviewBodyTab('response');
  syncCurrentPreviewWorkspaceTabState();
  persistPreviewWorkspaceAndSettings();
  renderRemoteRuleEditorMode();
  scheduleRemotePreview();
}

function openRemoteDslStepEditor(stepId = '') {
  if (!state.selectedRemoteRuleId) return;
  const dslStep = stepId
    ? state.remoteSteps.find((step) => step.id === stepId && step.type !== 'ai')
    : state.remoteSteps.find((step) => step.id === state.selectedDslStepId && step.type !== 'ai') ||
      state.remoteSteps.find((step) => step.type !== 'ai');
  if (!dslStep) return;
  state.selectedDslStepId = dslStep.id;
  state.selectedAiStepId = '';
  setPreviewBodyTab('response');
  syncRemoteExampleTabForDslAction(dslStep.action);
  syncCurrentPreviewWorkspaceTabState();
  persistPreviewWorkspaceAndSettings();
  renderRemoteRuleEditorMode();
  scheduleRemotePreview();
  window.requestAnimationFrame(() => {
    els.remoteDslAction.focus();
  });
}

function openRemoteAiEditor(stepId = '') {
  if (!state.selectedRemoteRuleId) return;
  const aiStep = stepId
    ? state.remoteSteps.find((step) => step.id === stepId && step.type === 'ai')
    : state.remoteSteps.find((step) => step.id === state.selectedAiStepId && step.type === 'ai') ||
      state.remoteSteps.find((step) => step.type === 'ai');
  if (!aiStep) return;
  state.selectedAiStepId = aiStep.id;
  state.selectedDslStepId = '';
  resetRemoteAiPromptHistoryCursor();
  setPreviewBodyTab('response');
  syncCurrentPreviewWorkspaceTabState();
  persistPreviewWorkspaceAndSettings();
  renderRemoteRuleEditorMode();
  scheduleRemotePreview();
  window.requestAnimationFrame(() => {
    els.remoteAiPrompt.focus();
  });
}

function renderRemoteRuleEditorMode() {
  const rule = state.remoteRules.find((item) => item.id === state.selectedRemoteRuleId);
  const isGlobal = isGlobalRemoteRule(rule);
  const aiMode = Boolean(selectedAiStep());
  const dslStepMode = Boolean(selectedDslStep());
  setGlobalRemoteHeadEditorVisible(isGlobal, rule);
  els.remoteDslEditor.hidden = aiMode || dslStepMode;
  els.remoteDslStepEditor.hidden = !dslStepMode;
  els.remoteAiEditor.hidden = !aiMode;
  els.remoteExampleDivider.hidden = false;
  els.remoteExampleDividerLabel.textContent = isGlobal ? t('remote.compatExample') : t('remote.example');
  els.remoteRuleLower.hidden = false;
  if (isGlobal) {
    els.globalRemoteHostInput.value = rule?.host || '';
    els.globalRemoteEnabled.checked = rule?.enabled !== false;
  }
  els.responseBodyTab.classList.toggle('active', state.previewBodyTab === 'response');
  els.responseBodyTab.setAttribute('aria-selected', String(state.previewBodyTab === 'response'));
  if (dslStepMode) {
    renderRemoteDslStepEditor();
  }
  if (aiMode) {
    renderRemoteAiEditor(rule);
  }
  refreshEditorTitle();
}

function setGlobalRemoteHeadEditorVisible(visible, rule = null) {
  const show = Boolean(visible);
  els.globalRemoteRuleEditor.hidden = !show;
  if (!show) return;
  els.globalRemoteHostInput.value = rule?.host || '';
  els.globalRemoteEnabled.checked = rule?.enabled !== false;
}

function renderRemoteDslStepEditor() {
  const step = selectedDslStep();
  if (!step) return;
  els.remoteDslSummary.value = step.note || '';
  els.remoteDslEnabled.checked = step.enabled !== false;
  els.remoteDslAction.innerHTML = [
    `<option value="">${escapeHtml(t('remote.action.placeholder'))}</option>`,
    ...remoteActions.map(([value, labelKey]) => {
      return `<option value="${value}"${step.action === value ? ' selected' : ''}>${escapeHtml(t(labelKey))}</option>`;
    })
  ].join('');
  els.remoteDslPath.value = step.path || '';
  els.remoteDslValue.value = step.value || '';
}

function renderRemoteAiEditor(rule) {
  const step = selectedAiStep();
  const draft = remoteAiDraft(step?.id);
  const script = step?.pythonScript ?? '';
  const prompt = draft.prompt ?? step?.aiPromptDraft ?? '';
  const outputLines = Array.isArray(step?.aiOutputLines) ? step.aiOutputLines : [];
  const summary = draft.summary ?? step?.summary ?? '';
  els.remoteAiPrompt.value = prompt;
  els.remoteAiScript.value = script;
  updateRemoteAiScriptHighlight();
  els.remoteAiSummary.hidden = false;
  els.remoteAiSummary.value = isDefaultAiSummary(summary) ? '' : summary;
  els.remoteAiEnabled.checked = step?.enabled !== false;
  els.remoteAiOutput.hidden = false;
  const hasAiGenerateHistory = Array.isArray(step?.aiPromptHistory) && step.aiPromptHistory.length > 0;
  const hasAiOutput = outputLines.length > 0 || isAiStepGenerating(step);
  setRemoteAiOutputText(hasAiGenerateHistory || hasAiOutput
    ? outputLines.join('\n')
    : aiScriptGuideText(prompt));
  els.remoteAiOutput.classList.toggle('is-guide', !hasAiGenerateHistory && !hasAiOutput);
  els.remoteAiStatus.textContent = aiStepStatusText(step);
  const aiGenerating = isAiStepGenerating(step);
  els.remoteAiScript.readOnly = aiGenerating;
  els.remoteAiScript.classList.toggle('is-readonly', aiGenerating);
  const aiDisabled = aiProviderDisabled();
  els.remoteAiGenerateBtn.textContent = aiDisabled ? t('remote.copyPrompt') : t('remote.aiGenerate');
  els.remoteAiGenerateBtn.disabled = !aiDisabled && aiGenerating;
  setInstantTooltip(els.remoteAiGenerateBtn, aiDisabled
    ? t('remote.copyPromptTip')
    : '');
}

function setRemoteAiOutputText(value) {
  const output = els.remoteAiOutput;
  if (!output) return;
  const wasAtBottom = isScrolledToBottom(output);
  output.textContent = value;
  if (wasAtBottom) {
    keepScrolledToBottom(output);
  }
}

function refreshRemoteAiGuideText() {
  if (!els.remoteAiOutput?.classList.contains('is-guide')) return;
  setRemoteAiOutputText(aiScriptGuideText(els.remoteAiPrompt.value));
}

function updateRemoteAiScriptHighlight() {
  if (!els.remoteAiScriptHighlight || !els.remoteAiScript) return;
  const value = els.remoteAiScript.value || '';
  els.remoteAiScriptHighlight.dataset.language = 'Python';
  els.remoteAiScriptHighlight.innerHTML = pythonHighlightHtml(value || ' ');
  syncRemoteAiScriptHighlightScroll();
}

function syncRemoteAiScriptHighlightScroll() {
  if (!els.remoteAiScriptHighlight || !els.remoteAiScript) return;
  els.remoteAiScriptHighlight.scrollTop = els.remoteAiScript.scrollTop;
  els.remoteAiScriptHighlight.scrollLeft = els.remoteAiScript.scrollLeft;
}

function pythonHighlightHtml(source) {
  const keywords = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
  ]);
  const builtins = new Set([
    'bool', 'dict', 'float', 'int', 'len', 'list', 'max', 'min', 'print',
    'range', 'set', 'str', 'sum', 'tuple', 'json', 'loads', 'dumps'
  ]);
  const tokenPattern = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  let html = '';
  let lastIndex = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    html += escapeHtml(source.slice(lastIndex, match.index));
    html += pythonTokenHtml(token, keywords, builtins);
    lastIndex = match.index + token.length;
  }
  html += escapeHtml(source.slice(lastIndex));
  return html;
}

function pythonTokenHtml(token, keywords, builtins) {
  const escaped = escapeHtml(token);
  if (token.startsWith('#')) return `<span class="py-comment">${escaped}</span>`;
  if (token.startsWith('"') || token.startsWith("'")) return `<span class="py-string">${escaped}</span>`;
  if (/^\d/.test(token)) return `<span class="py-number">${escaped}</span>`;
  if (keywords.has(token)) return `<span class="py-keyword">${escaped}</span>`;
  if (builtins.has(token)) return `<span class="py-builtin">${escaped}</span>`;
  return escaped;
}

function renderBodyCodePreview(body, tab) {
  if (els.bodyHighlight.classList.contains('capture-body-delete-editor')) {
    setBodyEditorStackVisible(true);
    setBodyTextareaVisible(false);
    updateFormatBodyButton();
    return;
  }
  const text = String(body?.body || '');
  const readOnly = Boolean(body?.readOnly);
  const language = detectPreviewLanguage(text, tab);
  const shouldEditHighlight = false;
  const shouldHighlight = readOnly && state.previewMode !== 'empty' && tab !== 'query';
  els.editor.classList.toggle('preview-code-active', shouldHighlight);
  els.editor.classList.toggle('edit-highlight-active', shouldEditHighlight);
  els.bodyHighlight.classList.toggle('edit-highlight-active', shouldEditHighlight);
  if (shouldEditHighlight) {
    els.bodyHighlight.dataset.language = '';
    els.bodyHighlight.innerHTML = jsonHighlightHtml(text || ' ');
    els.bodyHighlight.hidden = false;
    setBodyEditorStackVisible(true);
    setBodyTextareaVisible(true);
    syncEditableCodeHighlightScroll();
    updateFormatBodyButton();
    return;
  }
  if (!shouldHighlight) {
    els.bodyHighlight.hidden = true;
    els.bodyHighlight.innerHTML = '';
    setBodyEditorStackVisible(true);
    setBodyTextareaVisible(true);
    updateFormatBodyButton();
    return;
  }
  els.bodyHighlight.dataset.language = language.label;
  els.bodyHighlight.tabIndex = 0;
  renderCodePreview(els.bodyHighlight, text || ' ', language.kind);
  els.bodyHighlight.hidden = false;
  setBodyEditorStackVisible(true);
  setBodyTextareaVisible(false);
  updateFormatBodyButton();
}

function renderCaptureBodyOriginalPreview(capture, options = {}) {
  const sourceCapture = capture?.requestBody
    ? capture
    : state.selectedCaptureDetail?.id === state.selectedCaptureId
      ? state.selectedCaptureDetail
      : selectedCaptureSummary() || capture;
  const showOriginal = state.previewMode === 'capture' &&
    state.previewBodyTab === 'request' &&
    shouldMergeCaptureList() &&
    options.body === true &&
    methodHasRequestBody(sourceCapture?.method);
  els.bodyEditorStack.classList.toggle('split-original', showOriginal);
  els.captureBodyDivider.hidden = !showOriginal;
  if (!showOriginal) {
    els.captureBodyOriginal.hidden = true;
    els.captureBodyOriginal.innerHTML = '';
    return;
  }
  const original = requestBodyText(sourceCapture?.requestBody);
  const language = detectPreviewLanguage(original, 'request');
  els.captureBodyOriginal.tabIndex = 0;
  renderCodePreview(els.captureBodyOriginal, original || ' ', language.kind);
  els.captureBodyOriginal.hidden = false;
}

function setBodyEditorStackVisible(visible) {
  els.bodyEditorStack.hidden = !visible;
}

function setBodyTextareaVisible(visible) {
  els.editor.hidden = !visible;
}

function updateEditableCodeHighlight() {
  const canEditHighlight = !els.bodyEditorStack.hidden &&
    !els.editor.hidden &&
    !els.editor.disabled &&
    !els.editor.readOnly &&
    state.previewMode !== 'empty' &&
    state.previewBodyTab !== 'query';
  const language = detectPreviewLanguage(els.editor.value, state.previewBodyTab);
  const shouldEditHighlight = false;
  els.editor.classList.toggle('edit-highlight-active', shouldEditHighlight);
  els.bodyHighlight.classList.toggle('edit-highlight-active', shouldEditHighlight);
  if (!shouldEditHighlight) {
    els.editor.classList.remove('edit-highlight-active');
    els.bodyHighlight.classList.remove('edit-highlight-active', 'capture-body-delete-editor');
    els.bodyHighlight.hidden = true;
    els.bodyHighlight.innerHTML = '';
    updateFormatBodyButton();
    return;
  }
  els.bodyHighlight.dataset.language = '';
  els.bodyHighlight.innerHTML = jsonHighlightHtml(els.editor.value || ' ');
  els.bodyHighlight.hidden = false;
  syncEditableCodeHighlightScroll();
  updateFormatBodyButton();
}

function syncEditableCodeHighlightScroll() {
  if (els.editor.classList.contains('edit-highlight-active')) {
    els.bodyHighlight.scrollTop = els.editor.scrollTop;
    els.bodyHighlight.scrollLeft = els.editor.scrollLeft;
  }
  if (!els.captureBodyOriginal.hidden) {
    els.captureBodyOriginal.scrollTop = els.editor.scrollTop;
  }
}

function insertChildBefore(parent, child, reference = null) {
  if (!parent || !child) return;
  const safeReference = reference?.parentElement === parent ? reference : null;
  parent.insertBefore(child, safeReference);
}

function updateFormatBodyButton() {
  if (!els.formatBodyBtn) return;
  const target = formatBodyButtonTarget();
  if (target && els.formatBodyBtn.parentElement !== target) {
    insertChildBefore(target, els.formatBodyBtn, target.firstElementChild);
  }
  if (target && els.manualRuleSaveBtn?.parentElement !== target) {
    insertChildBefore(target, els.manualRuleSaveBtn, els.formatBodyBtn.nextSibling || target.firstElementChild);
  }
  els.responseBodyToolbar.hidden = !shouldShowResponseBodyToolbar();
  const canFormat = Boolean(target) &&
    !target.hidden &&
    !els.bodyEditorStack.hidden &&
    !els.editor.hidden &&
    !els.editor.disabled &&
    !els.editor.readOnly &&
    state.previewMode !== 'empty' &&
    canAttemptJsonFormat(els.editor.value);
  els.formatBodyBtn.hidden = !canFormat;
  updateManualRuleSaveButton();
}

function formatEditableJsonBody() {
  if (els.formatBodyBtn.hidden || els.editor.disabled || els.editor.readOnly) return;
  let formatted = '';
  try {
    formatted = JSON.stringify(JSON.parse(els.editor.value), null, 2);
  } catch {
    flashButton(els.formatBodyBtn, t('actions.invalidJson'));
    return;
  }
  if (formatted === els.editor.value) {
    updateEditableCodeHighlight();
    flashButton(els.formatBodyBtn, t('actions.formatted'));
    return;
  }
  const nextSelection = Math.min(formatted.length, els.editor.selectionStart || 0);
  els.editor.value = formatted;
  els.editor.setSelectionRange(nextSelection, nextSelection);
  handleBodyEditorInput();
  els.editor.focus();
  flashButton(els.formatBodyBtn, t('actions.formatted'));
}

function canAttemptJsonFormat(source) {
  const text = String(source || '').trim();
  if (!text) return false;
  return (text.startsWith('{') || text.startsWith('['));
}

function placeFormatBodyButton() {
  if (!els.formatBodyBtn) return;
  const target = formatBodyButtonTarget();
  if (target && els.formatBodyBtn.parentElement !== target) {
    insertChildBefore(target, els.formatBodyBtn, target.firstElementChild);
  }
  if (target && els.manualRuleSaveBtn?.parentElement !== target) {
    insertChildBefore(target, els.manualRuleSaveBtn, els.formatBodyBtn.nextSibling || target.firstElementChild);
  }
  updateManualRuleSaveButton();
}

function formatBodyButtonTarget() {
  if (state.previewMode === 'capture' && state.previewBodyTab === 'request') {
    return els.captureBodyMergeEditor;
  }
  if ((state.previewMode === 'rule' || state.previewMode === 'remote') && state.previewBodyTab === 'request') {
    return els.ruleBodyMatchEditor;
  }
  if (state.previewMode === 'rule' && state.previewBodyTab === 'response') {
    return els.responseBodyToolbar;
  }
  return null;
}

function shouldShowResponseBodyToolbar() {
  const language = detectPreviewLanguage(els.editor.value, state.previewBodyTab);
  return state.previewMode === 'rule' &&
    state.previewBodyTab === 'response' &&
    !els.bodyEditorStack.hidden &&
    !els.editor.hidden &&
    !els.editor.disabled &&
    !els.editor.readOnly &&
    language.kind === 'json';
}

function updateManualRuleSaveButton() {
  if (!els.manualRuleSaveBtn) return;
  const target = manualRuleSaveButtonTarget();
  placeManualRuleSaveButton(target);
  const shouldShow = Boolean(
    state.manualRuleSaveRequired &&
    target &&
    !target.hidden &&
    (state.previewMode === 'rule' || state.previewMode === 'remote' || state.previewMode === 'capture')
  );
  els.manualRuleSaveBtn.hidden = !shouldShow;
  els.manualRuleSaveBtn.disabled = !shouldShow || state.autoSaveInFlight;
  const message = state.manualRuleSaveMessage || t('merge.manualSaveDefault');
  els.manualRuleSaveBtn.title = message;
  setInstantTooltip(els.manualRuleSaveBtn, message);
}

function placeManualRuleSaveButton(target) {
  if (!target) return;
  if (target === els.ruleQueryEditor) {
    insertChildBefore(target, els.manualRuleSaveBtn, target.querySelector('#rule-query-match-row'));
    return;
  }
  if (target === els.captureQueryEditor) {
    const mergeBar = target.querySelector('.query-merge-bar');
    insertChildBefore(mergeBar, els.manualRuleSaveBtn, target.querySelector('#capture-query-merge-row'));
    return;
  }
  if (els.manualRuleSaveBtn.parentElement === target) return;
  insertChildBefore(target, els.manualRuleSaveBtn, els.formatBodyBtn?.nextSibling || target.firstElementChild);
}

function manualRuleSaveButtonTarget() {
  if (state.previewMode === 'capture') {
    if (state.previewBodyTab === 'query') return els.captureQueryEditor;
    if (state.previewBodyTab === 'request') return els.captureBodyMergeEditor;
    return null;
  }
  if (state.previewMode === 'rule' || state.previewMode === 'remote') {
    if (state.previewBodyTab === 'query') return els.ruleQueryEditor;
    return formatBodyButtonTarget();
  }
  return null;
}

function detectPreviewLanguage(text, tab) {
  if (tab === 'requestHead' || tab === 'responseHead') return { kind: 'headers', label: 'Headers' };
  if (tab === 'query') return { kind: 'query', label: 'Query' };
  const trimmed = String(text || '').trim();
  const jsonText = extractJsonLikeText(trimmed);
  if (looksLikeJson(trimmed)) return { kind: 'json', label: 'JSON' };
  if (jsonText && looksLikeJson(jsonText)) return { kind: 'json', label: 'JSON' };
  if (trimmed.includes('=') && !trimmed.includes('\n')) return { kind: 'query', label: 'Query' };
  return { kind: 'text', label: 'Text' };
}

function detectDiffLanguageKind(before, after) {
  const tab = currentDiffPreviewTab();
  if (tab === 'requestHead' || tab === 'responseHead') return 'headers';
  if (tab === 'query') return 'query';

  const beforeKind = detectPreviewLanguage(before, tab).kind;
  const afterKind = detectPreviewLanguage(after, tab).kind;
  if (beforeKind === afterKind) return beforeKind;
  if (beforeKind !== 'text') return beforeKind;
  if (afterKind !== 'text') return afterKind;
  return 'text';
}

function highlightCodeHtml(source, kind) {
  if (kind === 'python') return pythonHighlightHtml(source);
  if (kind === 'json') return jsonHighlightHtml(formatJsonForPreview(extractJsonLikeText(source) || source));
  if (kind === 'headers') return headersHighlightHtml(source);
  if (kind === 'query') return queryHighlightHtml(source);
  return escapeHtml(source);
}

function renderCodePreview(element, source, kind) {
  if (!element) return;
  element.classList.remove('collapsible-json-preview');
  if (kind !== 'json') {
    element.innerHTML = highlightCodeHtml(source, kind);
    return;
  }
  const preview = collapsibleJsonPreviewHtml(source);
  element.innerHTML = preview.html;
  element.classList.toggle('collapsible-json-preview', preview.collapsible);
  if (preview.collapsible) bindCollapsibleJsonPreview(element);
}

function highlightInlineCodeHtml(source, kind) {
  if (kind === 'json') return jsonHighlightHtml(source);
  if (kind === 'headers') return headersHighlightHtml(source);
  if (kind === 'query') return queryHighlightHtml(source);
  return escapeHtml(source);
}

function formatJsonForPreview(source) {
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}

function looksLikeJson(source) {
  if (!source) return false;
  if (!(source.startsWith('{') && source.endsWith('}')) && !(source.startsWith('[') && source.endsWith(']'))) return false;
  try {
    JSON.parse(source);
    return true;
  } catch {
    return false;
  }
}

function extractJsonLikeText(source) {
  const text = String(source || '').trim();
  const objectIndex = text.search(/[\[{]/);
  if (objectIndex < 0) return '';
  return text.slice(objectIndex);
}

function jsonHighlightHtml(source) {
  const tokenPattern = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi;
  let html = '';
  let lastIndex = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const stringPart = match[1];
    const colonPart = match[2] || '';
    html += escapeHtml(source.slice(lastIndex, match.index));
    if (stringPart && colonPart) {
      html += `<span class="code-token-key">${escapeHtml(stringPart)}</span>${escapeHtml(colonPart)}`;
    } else if (stringPart) {
      html += `<span class="code-token-string">${escapeHtml(stringPart)}</span>`;
    } else if (/^(true|false)$/i.test(token)) {
      html += `<span class="code-token-boolean">${escapeHtml(token)}</span>`;
    } else if (/^null$/i.test(token)) {
      html += `<span class="code-token-null">${escapeHtml(token)}</span>`;
    } else {
      html += `<span class="code-token-number">${escapeHtml(token)}</span>`;
    }
    lastIndex = match.index + token.length;
  }
  html += escapeHtml(source.slice(lastIndex));
  return html;
}

function collapsibleJsonPreviewHtml(source) {
  const rawJsonSource = String(extractJsonLikeText(source) || source || '');
  if (rawJsonSource.length > collapsibleJsonPreviewMaxChars) {
    const formattedSource = formatJsonForPreview(rawJsonSource);
    return {
      html: jsonHighlightHtml(formattedSource || ' '),
      collapsible: false
    };
  }
  const jsonSource = formatJsonForPreview(rawJsonSource);
  const parsed = parseJson(jsonSource);
  if (!parsed.ok) {
    return {
      html: jsonHighlightHtml(jsonSource || ' '),
      collapsible: false
    };
  }
  return {
    html: `<span class="json-tree-preview">${jsonTreeNodeHtml(parsed.value, {
      depth: 0,
      path: 'root',
      trailingComma: false
    })}</span>`,
    collapsible: true
  };
}

function jsonTreeNodeHtml(value, options = {}) {
  const depth = Number(options.depth || 0);
  const path = String(options.path || 'root');
  const keyHtml = options.keyHtml || '';
  const trailingComma = options.trailingComma === true;
  if (Array.isArray(value)) {
    return jsonTreeCollectionHtml(value, {
      depth,
      path,
      keyHtml,
      trailingComma,
      open: '[',
      close: ']',
      entries: value.map((item, index) => ({
        key: index,
        value: item,
        keyHtml: ''
      }))
    });
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => ({
      key,
      value: item,
      keyHtml: `<span class="code-token-key">${escapeHtml(JSON.stringify(key))}</span><span class="code-token-punctuation">: </span>`
    }));
    return jsonTreeCollectionHtml(value, {
      depth,
      path,
      keyHtml,
      trailingComma,
      open: '{',
      close: '}',
      entries
    });
  }
  return jsonTreeLineHtml({
    depth,
    toggle: false,
    content: `${keyHtml}${jsonPrimitiveHtml(value)}${trailingComma ? '<span class="code-token-punctuation">,</span>' : ''}`
  });
}

function jsonTreeCollectionHtml(value, options = {}) {
  const entries = options.entries || [];
  const depth = Number(options.depth || 0);
  const path = String(options.path || 'root');
  const keyHtml = options.keyHtml || '';
  const trailingComma = options.trailingComma === true;
  const open = options.open || '{';
  const close = options.close || '}';
  if (!entries.length) {
    return jsonTreeLineHtml({
      depth,
      toggle: false,
      content: `${keyHtml}<span class="code-token-punctuation">${escapeHtml(open)}${escapeHtml(close)}</span>${trailingComma ? '<span class="code-token-punctuation">,</span>' : ''}`
    });
  }
  const encodedPath = escapeHtml(path);
  const children = entries.map((entry, index) => jsonTreeNodeHtml(entry.value, {
    depth: depth + 1,
    path: `${path}.${encodeURIComponent(String(entry.key))}`,
    keyHtml: entry.keyHtml,
    trailingComma: index < entries.length - 1
  })).join('');
  const summaryText = Array.isArray(value)
    ? `${entries.length} ${entries.length === 1 ? 'item' : 'items'}`
    : `${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`;
  return '<span class="json-tree-node" data-json-path="' + encodedPath + '">' +
    jsonTreeLineHtml({
      depth,
      toggle: true,
      content: `${keyHtml}<span class="code-token-punctuation">${escapeHtml(open)}</span><span class="json-fold-summary" hidden> ${escapeHtml(summaryText)} <span class="code-token-punctuation">${escapeHtml(close)}</span></span>${trailingComma ? '<span class="json-fold-comma code-token-punctuation" hidden>,</span>' : ''}`
    }) +
    `<span class="json-tree-children">${children}</span>` +
    jsonTreeLineHtml({
      depth,
      toggle: false,
      closeLine: true,
      content: `<span class="code-token-punctuation">${escapeHtml(close)}${trailingComma ? ',' : ''}</span>`
    }) +
    '</span>';
}

function jsonTreeLineHtml(options = {}) {
  const depth = Number(options.depth || 0);
  const toggle = options.toggle === true;
  const closeLine = options.closeLine === true;
  return `<span class="json-tree-line${closeLine ? ' json-tree-close-line' : ''}" style="--json-depth: ${depth}">${toggle
    ? '<button class="json-fold-toggle" type="button" tabindex="-1" aria-expanded="true" aria-label="Toggle JSON node"></button>'
    : '<span class="json-fold-spacer"></span>'}<span class="json-tree-code">${options.content || ''}</span></span>`;
}

function jsonPrimitiveHtml(value) {
  if (typeof value === 'string') {
    return `<span class="code-token-string">${escapeHtml(JSON.stringify(value))}</span>`;
  }
  if (typeof value === 'number') {
    return `<span class="code-token-number">${escapeHtml(String(value))}</span>`;
  }
  if (typeof value === 'boolean') {
    return `<span class="code-token-boolean">${value ? 'true' : 'false'}</span>`;
  }
  if (value === null) {
    return '<span class="code-token-null">null</span>';
  }
  return escapeHtml(JSON.stringify(value));
}

function bindCollapsibleJsonPreview(element) {
  if (element.dataset.jsonFoldBound === 'true') return;
  element.dataset.jsonFoldBound = 'true';
  element.addEventListener('click', (event) => {
    const button = event.target?.closest?.('.json-fold-toggle');
    if (!button || !element.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    toggleJsonPreviewNode(button);
  });
}

function toggleJsonPreviewNode(button) {
  const node = button.closest('.json-tree-node');
  if (!node) return;
  const collapsed = !node.classList.contains('collapsed');
  node.classList.toggle('collapsed', collapsed);
  button.setAttribute('aria-expanded', String(!collapsed));
  const children = node.querySelector(':scope > .json-tree-children');
  const closeLine = node.querySelector(':scope > .json-tree-close-line');
  const summary = node.querySelector(':scope > .json-tree-line .json-fold-summary');
  const comma = node.querySelector(':scope > .json-tree-line .json-fold-comma');
  if (children) children.hidden = collapsed;
  if (closeLine) closeLine.hidden = collapsed;
  if (summary) summary.hidden = !collapsed;
  if (comma) comma.hidden = !collapsed;
  if (state.previewFindOpen && state.previewFindQuery) {
    updatePreviewFind(state.previewFindQuery, { select: false });
  }
}

function headersHighlightHtml(source) {
  return String(source || '').split('\n').map((line) => {
    const index = line.indexOf(':');
    if (index < 0) return escapeHtml(line);
    return `<span class="code-token-key">${escapeHtml(line.slice(0, index))}</span>${escapeHtml(line.slice(index, index + 1))}<span class="code-token-string">${escapeHtml(line.slice(index + 1))}</span>`;
  }).join('\n');
}

function queryHighlightHtml(source) {
  return String(source || '').split('\n').map((line) => {
    return line.split(/(&)/).map((part) => {
      if (part === '&') return '<span class="code-token-punctuation">&amp;</span>';
      const index = part.indexOf('=');
      if (index < 0) return escapeHtml(part);
      return `<span class="code-token-key">${escapeHtml(part.slice(0, index))}</span><span class="code-token-punctuation">=</span><span class="code-token-string">${escapeHtml(part.slice(index + 1))}</span>`;
    }).join('');
  }).join('\n');
}

function isScrolledToBottom(element) {
  if (!element) return false;
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distance <= 4;
}

function keepScrolledToBottom(element) {
  window.requestAnimationFrame(() => {
    element.scrollTop = element.scrollHeight;
  });
}

function saveRemoteAiDraft() {
  const step = selectedAiStep();
  if (!step || !els.remoteAiEditor || els.remoteAiEditor.hidden) return;
  state.remoteAiDrafts[step.id] = {
    prompt: els.remoteAiPrompt.value,
    summary: normalizeAiSummary(els.remoteAiSummary.value) || step?.summary || ''
  };
  step.aiPromptDraft = els.remoteAiPrompt.value;
  step.summary = normalizeAiSummary(els.remoteAiSummary.value) || step.summary;
}

function handleRemoteAiPromptHistoryKey(event) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!shouldHandlePromptHistoryKey(event.key)) return;

  const prompts = currentAiPromptHistory();
  if (!prompts.length) return;

  event.preventDefault();
  if (state.remoteAiPromptHistoryIndex === null) {
    state.remoteAiPromptHistoryDraft = els.remoteAiPrompt.value;
    state.remoteAiPromptHistoryIndex = prompts.length;
  }

  if (event.key === 'ArrowUp') {
    state.remoteAiPromptHistoryIndex = Math.max(0, state.remoteAiPromptHistoryIndex - 1);
  } else {
    state.remoteAiPromptHistoryIndex = Math.min(prompts.length, state.remoteAiPromptHistoryIndex + 1);
  }

  const nextPrompt = state.remoteAiPromptHistoryIndex === prompts.length
    ? state.remoteAiPromptHistoryDraft
    : prompts[state.remoteAiPromptHistoryIndex];
  setRemoteAiPromptValue(nextPrompt);
}

function shouldHandlePromptHistoryKey(key) {
  const value = els.remoteAiPrompt.value;
  const start = els.remoteAiPrompt.selectionStart ?? 0;
  const end = els.remoteAiPrompt.selectionEnd ?? start;
  if (start !== end) return false;
  if (key === 'ArrowUp') {
    return !value.slice(0, start).includes('\n');
  }
  return !value.slice(end).includes('\n');
}

function currentAiPromptHistory() {
  const step = selectedAiStep();
  const history = Array.isArray(step?.aiPromptHistory) ? step.aiPromptHistory : [];
  return history
    .map((item) => typeof item === 'string' ? item : item?.prompt)
    .map((prompt) => String(prompt || '').trim())
    .filter(Boolean);
}

function setRemoteAiPromptValue(value) {
  els.remoteAiPrompt.value = value;
  window.requestAnimationFrame(() => {
    const end = els.remoteAiPrompt.value.length;
    els.remoteAiPrompt.setSelectionRange(end, end);
  });
  saveRemoteAiDraft();
  scheduleRuleAutoSave();
}

function resetRemoteAiPromptHistoryCursor() {
  state.remoteAiPromptHistoryIndex = null;
  state.remoteAiPromptHistoryDraft = '';
}

function remoteAiDraft(ruleId) {
  if (!ruleId) return {};
  const draft = state.remoteAiDrafts[ruleId] || {};
  return {
    prompt: Object.hasOwn(draft, 'prompt') ? draft.prompt : undefined,
    summary: Object.hasOwn(draft, 'summary') ? draft.summary : undefined
  };
}

function selectedAiStep() {
  if (!state.selectedAiStepId) return null;
  return state.remoteSteps.find((step) => step.id === state.selectedAiStepId && step.type === 'ai') || null;
}

function selectedDslStep() {
  if (!state.selectedDslStepId) return null;
  return state.remoteSteps.find((step) => step.id === state.selectedDslStepId && step.type !== 'ai') || null;
}

function syncSelectedAiStepFromEditor(options = {}) {
  const step = selectedAiStep();
  if (!step || els.remoteAiEditor.hidden) return;
  if (options.forceScript || document.activeElement === els.remoteAiScript) {
    step.pythonScript = els.remoteAiScript.value;
  }
  step.aiPromptDraft = els.remoteAiPrompt.value;
  step.summary = normalizeAiSummary(els.remoteAiSummary.value) || step.summary;
}

function syncSelectedDslStepFromEditor() {
  const step = selectedDslStep();
  if (!step || els.remoteDslStepEditor.hidden) return;
  step.note = els.remoteDslSummary.value;
  step.enabled = els.remoteDslEnabled.checked;
  step.action = els.remoteDslAction.value;
  step.path = els.remoteDslPath.value;
  step.value = els.remoteDslValue.value;
}

function aiStepStatusText(step) {
  if (!step?.aiStatus) return '';
  if (step.aiStatus === 'queued') return t('ai.statusQueued');
  if (step.aiStatus === 'running') return t('ai.statusGenerating');
  if (step.aiStatus === 'succeeded') return t('ai.statusGenerated');
  if (step.aiStatus === 'stopped') return t('ai.statusStopped');
  if (step.aiStatus === 'failed') return step.aiError ? `${t('ai.statusFailed')}：${step.aiError}` : t('ai.statusFailed');
  return '';
}

function isAiStepGenerating(step) {
  return step?.aiStatus === 'queued' || step?.aiStatus === 'running';
}

async function persistCurrentRemoteEditor(options = {}) {
  if (!state.selectedRemoteRuleId) return null;
  const ruleId = state.selectedRemoteRuleId;
  const rule = state.remoteRules.find((item) => item.id === ruleId);
  if (!rule) return null;
  const isGlobal = isGlobalRemoteRule(rule);
  syncSelectedAiStepFromEditor({ forceScript: true });
  syncSelectedDslStepFromEditor();
  const script = options.allowIncompleteDsl
    ? serializeRemoteRowsForState(state.remoteSteps)
    : serializeRemoteRows(state.remoteSteps);
  if (script === null) return null;
  const payload = {
    script,
    steps: serializeRemoteStepsForApi(state.remoteSteps),
    query: normalizeQuery(els.ruleQueryInput.value),
    queryMode: rule.queryMode === 'ignore' ? 'ignore' : 'exact',
    requestBodyMode: rule.requestBodyMode === 'ignore' ? 'ignore' : 'exact'
  };
  if (isGlobal) {
    payload.host = normalizeHostInput(els.globalRemoteHostInput.value);
    payload.enabled = els.globalRemoteEnabled.checked;
    delete payload.query;
    delete payload.queryMode;
    delete payload.requestBodyMode;
  }
  if (!isGlobal && state.previewBodyTab === 'request' && !els.editor.readOnly) {
    payload.requestBody = els.editor.value;
  }
  const result = await putJson(`/api/remote-rules/${ruleId}/editor`, payload);
  if (options.preserveSelection) {
    const currentAiStepId = state.selectedAiStepId;
    const currentDslStepId = state.selectedDslStepId;
    const updatedRule = result.rule || {};
    const index = state.remoteRules.findIndex((item) => item.id === ruleId);
    if (index >= 0) state.remoteRules[index] = updatedRule;
    state.remoteSteps = parseRemoteScriptForEditor(updatedRule.script, updatedRule);
    state.selectedAiStepId = state.remoteSteps.some((step) => step.id === currentAiStepId && step.type === 'ai') ? currentAiStepId : state.selectedAiStepId;
    state.selectedDslStepId = state.remoteSteps.some((step) => step.id === currentDslStepId && step.type !== 'ai') ? currentDslStepId : state.selectedDslStepId;
    renderRemoteDslRows();
    renderRemoteRuleEditorMode();
    captureSavedEditorState();
  }
  return result;
}

async function handleRemoteAiPrimaryAction() {
  if (aiProviderDisabled()) {
    await copyRemoteAiPromptGuide();
    return;
  }
  await generateRemoteAiRule();
}

async function copyRemoteAiPromptGuide() {
  const text = els.remoteAiOutput?.textContent || aiScriptGuideText(els.remoteAiPrompt.value);
  try {
    await writeClipboard(text);
    els.remoteAiStatus.textContent = t('ai.copied');
    window.setTimeout(() => {
      if (aiProviderDisabled() && els.remoteAiStatus.textContent === t('ai.copied')) {
        els.remoteAiStatus.textContent = '';
      }
    }, 3000);
  } catch (error) {
    console.error(error);
    els.remoteAiStatus.textContent = t('ai.copyFailed');
  }
}

async function generateRemoteAiRule() {
  if (aiProviderDisabled()) return;
  if (!state.selectedRemoteRuleId) return;
  const ruleId = state.selectedRemoteRuleId;
  const step = selectedAiStep();
  if (!step) return;
  const prompt = els.remoteAiPrompt.value.trim();
  if (!prompt) {
    window.alert(t('ai.promptRequired'));
    return;
  }

  els.remoteAiGenerateBtn.disabled = true;
  els.remoteAiStatus.textContent = t('ai.queuedDots');
  els.remoteAiOutput.hidden = false;
  els.remoteAiOutput.classList.remove('is-guide');
  setRemoteAiOutputText(t('ai.submitJob'));
  syncSelectedAiStepFromEditor();
  try {
    await persistCurrentRemoteEditor({ preserveSelection: true, allowIncompleteDsl: true });
    const rule = selectedRemoteRule();
    const isGlobal = isGlobalRemoteRule(rule);
    const result = await postJson(`/api/remote-rules/${ruleId}/ai-generate`, {
      stepId: step.id,
      prompt,
      pythonScript: els.remoteAiScript.value,
      steps: serializeRemoteStepsForApi(state.remoteSteps),
      userSummary: normalizeAiSummary(els.remoteAiSummary.value),
      query: isGlobal ? '' : normalizeQuery(els.ruleQueryInput.value),
      requestBody: isGlobal ? '' : (state.previewRequest?.body || '')
    });
    delete state.remoteAiDrafts[step.id];
    applyAiGenerateQueueResult(step.id, result);
    els.remoteAiStatus.textContent = result.existing ? t('ai.generatingDots') : t('ai.queued');
    renderRemoteRuleEditorMode();
    await reloadRules();
    if (state.selectedRemoteRuleId === ruleId) {
      state.selectedAiStepId = step.id;
      renderRemoteDslRows();
      renderRemoteRuleEditorMode();
      scheduleRemotePreview();
      captureSavedEditorState();
    }
  } catch (error) {
    console.error(error);
    els.remoteAiStatus.textContent = t('ai.statusFailed');
    if (error.data?.script) {
      els.remoteAiScript.value = error.data.script;
    }
    if (error.data?.summary) {
      els.remoteAiSummary.hidden = false;
      els.remoteAiSummary.value = normalizeAiSummary(error.data.summary);
    }
    const outputLines = Array.isArray(error.data?.outputLines) ? error.data.outputLines : [];
    els.remoteAiOutput.hidden = false;
    setRemoteAiOutputText(outputLines.length
      ? outputLines.join('\n')
      : (error.message || t('ai.failedSentence')));
    syncSelectedAiStepFromEditor();
    scheduleRuleAutoSave();
  } finally {
    const latestStep = selectedAiStep();
    els.remoteAiGenerateBtn.disabled = !aiProviderDisabled() && isAiStepGenerating(latestStep);
  }
}

function applyAiGenerateQueueResult(stepId, result) {
  const target = state.remoteSteps.find((item) => item.id === stepId && item.type === 'ai');
  if (!target) return;
  target.aiJobId = result?.jobId || target.aiJobId || '';
  if (!isAiStepGenerating(target)) {
    target.aiStatus = result?.existing ? 'running' : 'queued';
  }
  if (!Array.isArray(target.aiOutputLines) || !target.aiOutputLines.length) {
    target.aiOutputLines = [result?.existing ? t('ai.existingJob') : t('ai.enqueuedJob')];
  }
}

function showRemoteRuleHelp() {
  if (typeof els.remoteRuleHelpDialog.showModal === 'function') {
    els.remoteRuleHelpDialog.showModal();
    return;
  }
  els.remoteRuleHelpDialog.setAttribute('open', '');
}

function closeRemoteRuleHelp() {
  if (typeof els.remoteRuleHelpDialog.close === 'function') {
    els.remoteRuleHelpDialog.close();
    return;
  }
  els.remoteRuleHelpDialog.removeAttribute('open');
}

function openNoteDialog() {
  const target = currentNoteTarget();
  if (!target) return;
  state.noteTarget = target;
  els.noteInput.value = displayNoteText(target);
  if (typeof els.noteDialog.showModal === 'function') {
    els.noteDialog.showModal();
  } else {
    els.noteDialog.setAttribute('open', '');
  }
  window.setTimeout(() => {
    els.noteInput.focus();
    els.noteInput.select();
  });
}

function closeNoteDialog() {
  state.noteTarget = null;
  if (typeof els.noteDialog.close === 'function') {
    els.noteDialog.close();
    return;
  }
  els.noteDialog.removeAttribute('open');
}

function openSettingsDialog() {
  syncSettingsDialogControls();
  if (typeof els.settingsDialog.showModal === 'function') {
    if (!els.settingsDialog.open) els.settingsDialog.showModal();
    return;
  }
  els.settingsDialog.setAttribute('open', '');
}

function closeSettingsDialog() {
  if (pageMode === 'settings') {
    window.location.assign('/_electron/quit');
    return;
  }
  if (typeof els.settingsDialog.close === 'function') {
    els.settingsDialog.close();
    return;
  }
  els.settingsDialog.removeAttribute('open');
}

async function saveSettingsDialog() {
  const treeViewEnabled = els.captureTreeViewEnabled.checked;
  const language = normalizeLanguage(els.languageSelect?.value || state.language);
  const appearance = normalizeAppearance(els.appearanceSelect?.value || state.appearance);
  const maxRecentRequests = normalizeMaxRecentRequests(els.maxRecentRequests?.value || state.maxRecentRequests);
  const aiNotesEnabled = els.aiNotesEnabled ? els.aiNotesEnabled.checked : state.aiNotesEnabled !== false;
  const previousAiNotesEnabled = state.aiNotesEnabled !== false;
  if (els.maxRecentRequests) {
    els.maxRecentRequests.value = String(maxRecentRequests);
  }
  if (treeViewEnabled !== (state.captureTreeViewEnabled === true)) {
    state.language = language;
    state.appearance = appearance;
    state.maxRecentRequests = maxRecentRequests;
    state.aiNotesEnabled = aiNotesEnabled;
    applyLanguage();
    applyAppearance();
    await setCaptureTreeViewEnabled(treeViewEnabled);
    await patchJson('/api/settings', { language, appearance, maxRecentRequests, aiNotesEnabled });
    await syncAiNotesWorkFromSettings(previousAiNotesEnabled, aiNotesEnabled);
    return;
  }
  const previousShouldMerge = shouldMergeCaptureList();
  const patch = {
    captureTreeViewEnabled: treeViewEnabled,
    language,
    appearance,
    aiNotesEnabled,
    maxRecentRequests
  };
  if (!treeViewEnabled) {
    patch.captureMergeEnabled = els.captureMergeEnabled.checked;
    patch.showListNotes = els.showListNotes.checked;
  }
  if (Object.hasOwn(patch, 'captureMergeEnabled')) {
    state.captureMergeEnabled = patch.captureMergeEnabled;
  }
  if (Object.hasOwn(patch, 'showListNotes')) {
    state.showListNotes = patch.showListNotes;
  }
  state.language = language;
  state.appearance = appearance;
  state.aiNotesEnabled = aiNotesEnabled;
  state.maxRecentRequests = maxRecentRequests;
  applyLanguage();
  applyAppearance();
  syncSettingsDialogControls();
  if (pageMode !== 'settings') {
    refreshCaptureMergeDependentPreview();
    refreshPreviewNote();
    renderCaptures();
  }
  await patchJson('/api/settings', patch);
  await syncAiNotesWorkFromSettings(previousAiNotesEnabled, aiNotesEnabled);
  if (pageMode !== 'settings') {
    if (previousShouldMerge !== shouldMergeCaptureList()) {
      await reloadCaptures({ replace: true });
    } else {
      renderCaptures();
    }
    renderRules();
    renderRemoteRules();
  }
}

async function syncAiNotesWorkFromSettings(previousEnabled, nextEnabled) {
  if (previousEnabled === nextEnabled) return;
  const url = nextEnabled ? '/api/codex-notes/start' : '/api/codex-notes/stop';
  try {
    const result = await postJson(url, {});
    if (result?.settings) {
      state.aiProvider = result.settings.aiProvider || state.aiProvider;
      state.aiNotesEnabled = result.settings.aiNotesEnabled !== false;
    }
    if (result?.status) state.codexQueue = result.status;
    renderAiSelector();
    renderAiStatusDialog();
  } catch (error) {
    console.error(error);
  }
}

async function saveLanguageSetting() {
  state.language = normalizeLanguage(els.languageSelect?.value || state.language);
  applyLanguage();
  await patchJson('/api/settings', { language: state.language }).catch((error) => {
    console.error(error);
  });
}

async function saveAppearanceSetting() {
  state.appearance = normalizeAppearance(els.appearanceSelect?.value || state.appearance);
  applyAppearance();
  await patchJson('/api/settings', { appearance: state.appearance }).catch((error) => {
    console.error(error);
  });
}

function syncSettingsDialogControls() {
  if (els.languageSelect) {
    els.languageSelect.value = normalizeLanguage(state.language);
  }
  if (els.appearanceSelect) {
    els.appearanceSelect.value = normalizeAppearance(state.appearance);
  }
  if (els.maxRecentRequests) {
    els.maxRecentRequests.min = String(maxRecentRequestsMin);
    els.maxRecentRequests.max = String(maxRecentRequestsMax);
    els.maxRecentRequests.value = String(normalizeMaxRecentRequests(state.maxRecentRequests));
  }
  els.captureTreeViewEnabled.checked = state.captureTreeViewEnabled === true;
  els.captureMergeEnabled.checked = state.captureMergeEnabled !== false;
  els.showListNotes.checked = state.showListNotes !== false;
  if (els.aiNotesEnabled) els.aiNotesEnabled.checked = state.aiNotesEnabled !== false;
  els.captureMergeEnabled.disabled = state.captureTreeViewEnabled === true;
  els.showListNotes.disabled = state.captureTreeViewEnabled === true;
  renderCaptureViewModeButton();
}

async function clearCurrentNote() {
  els.noteInput.value = '';
  await saveCurrentNote();
}

async function saveCurrentNote() {
  const target = state.noteTarget || currentNoteTarget();
  if (!target) return;
  const note = singleLineNote(els.noteInput.value);
  if (target.id && state.rules.some((rule) => rule.id === target.id)) {
    const result = await patchJson(`/api/rules/${target.id}`, { note });
    if (result?.rule) replaceRuleInState(result.rule);
    setEditorNote(result?.rule?.note || '');
    closeNoteDialog();
    renderRules();
    setPreviewMode(state.previewMode);
    return;
  }
  if (target.id && state.remoteRules.some((rule) => rule.id === target.id)) {
    const result = await patchJson(`/api/remote-rules/${target.id}`, { note });
    if (result?.rule) replaceRemoteRuleInState(result.rule);
    setEditorNote(result?.rule?.note || '');
    closeNoteDialog();
    renderRemoteRules();
    setPreviewMode(state.previewMode);
    return;
  }

  const key = apiNoteKey(target);
  if (!key) return;
  const result = await putJson('/api/notes', { key, note });
  if (note) {
    state.apiNotes = {
      ...state.apiNotes,
      [key]: note
    };
  } else {
    const next = { ...state.apiNotes };
    delete next[key];
    state.apiNotes = next;
  }
  if (state.selectedCaptureDetail && apiNoteKey(state.selectedCaptureDetail) === key) {
    state.selectedCaptureDetail.note = result.note || '';
  }
  syncItemNotes(state.captures, key, result.note || '');
  setEditorNote(result.note || '');
  closeNoteDialog();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  setPreviewMode(state.previewMode);
}

function syncItemNotes(items, key, note) {
  for (const item of items || []) {
    if (apiNoteKey(item) === key) {
      item.note = note;
    }
    if (Array.isArray(item.history)) {
      syncItemNotes(item.history, key, note);
    }
  }
}

async function openCurrentDetailNote() {
  const target = currentDetailNoteTarget();
  if (!target) return;
  const key = currentDetailNoteKey();
  if (!key) return;
  state.activeDetailNoteKey = key;
  state.activeDetailNoteText = detailNoteTextForKey(key);
  if (state.activeDetailNoteText) {
    clearDetailNoteGenerating(target.url, key);
    openDetailNoteDialog(state.activeDetailNoteText);
    return;
  }
  const failure = detailNoteFailureForKey(key);
  if (failure) {
    openDetailNoteDialog(detailNoteFailureDialogText(failure));
    return;
  }
  if (isCurrentDetailNoteGenerating()) {
    openAiStatusDialog();
    return;
  }
  const result = await getJson(target.url).catch((error) => {
    console.error(error);
    return null;
  });
  if (result?.detail) {
    setDetailNoteForKey(key, result.detail);
    clearDetailNoteGenerating(target.url, key);
    openDetailNoteDialog(result.detail);
    await reloadSettings({ renderDetailOnly: true });
    return;
  }
  if (result?.failure) {
    setDetailNoteFailureForKey(key, result.failure);
    openDetailNoteDialog(detailNoteFailureDialogText(result.failure));
    return;
  }
  await generateCurrentDetailNote();
}

async function generateCurrentDetailNote(options = {}) {
  const target = currentDetailNoteTarget();
  const key = currentDetailNoteKey();
  if (!target || !key) return;
  clearDetailNoteFailureForKey(key);
  setDetailNoteGenerating(target.url, key);
  updateOpenDetailNoteDialogForKey(key, t('note.detailGenerating'));
  try {
    const result = await postJson(target.url, { force: Boolean(options.force) });
    if (result.detail) {
      setDetailNoteForKey(key, result.detail);
      updateOpenDetailNoteDialogForKey(key, result.detail);
      return;
    }
    if (result.failure) {
      setDetailNoteFailureForKey(key, result.failure);
      clearDetailNoteGenerating(target.url, key);
      updateOpenDetailNoteDialogForKey(key, detailNoteFailureDialogText(result.failure));
      return;
    }
    renderDetailNoteButton();
    pollCurrentDetailNote(target.url, key).catch((error) => {
      console.error(error);
      clearDetailNoteGenerating(target.url, key);
      updateOpenDetailNoteDialogForKey(key, error.message || t('note.detailFailed'));
      renderDetailNoteButton();
    });
  } catch (error) {
    console.error(error);
    clearDetailNoteGenerating(target.url, key);
    updateOpenDetailNoteDialogForKey(key, error.message || t('note.detailFailed'));
  }
}

async function pollCurrentDetailNote(url, key, attempts = 120) {
  const token = state.detailNotePollToken;
  for (let index = 0; index < attempts; index += 1) {
    if (token !== state.detailNotePollToken || url !== state.detailNotePollUrl || key !== state.detailNotePollKey) {
      return;
    }
    const cachedDetail = detailNoteTextForKey(key);
    if (cachedDetail) {
      clearDetailNoteGenerating(url, key);
      updateOpenDetailNoteDialogForKey(key, cachedDetail);
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, index ? 2000 : 1000));
    const latestCachedDetail = detailNoteTextForKey(key);
    if (latestCachedDetail) {
      clearDetailNoteGenerating(url, key);
      updateOpenDetailNoteDialogForKey(key, latestCachedDetail);
      return;
    }
    const result = await getJson(url);
    if (result.detail) {
      setDetailNoteForKey(key, result.detail);
      clearDetailNoteGenerating(url, key);
      updateOpenDetailNoteDialogForKey(key, result.detail);
      await reloadSettings({ renderDetailOnly: true });
      return;
    }
    if (result.failure) {
      setDetailNoteFailureForKey(key, result.failure);
      clearDetailNoteGenerating(url, key);
      updateOpenDetailNoteDialogForKey(key, detailNoteFailureDialogText(result.failure));
      return;
    }
    const status = result.status || {};
    if (!status.running && !Number(status.pending || 0) && Number(status.failed || 0)) {
      throw new Error(status.lastError || t('note.detailFailed'));
    }
    renderDetailNoteButton();
    if (!detailNoteTextForKey(key)) {
      updateOpenDetailNoteDialogForKey(key, t('note.detailQueue', {
        running: status.running ? 1 : 0,
        total: (status.running ? 1 : 0) + Number(status.pending || 0)
      }));
    }
  }
  throw new Error(t('note.detailStillGenerating'));
}

function openDetailNoteDialog(text) {
  renderMarkdown(els.detailNoteContent, String(text || '').trim() || t('note.emptyDetail'));
  if (typeof els.detailNoteDialog.showModal === 'function') {
    if (!els.detailNoteDialog.open) els.detailNoteDialog.showModal();
  } else {
    els.detailNoteDialog.setAttribute('open', '');
  }
}

function updateOpenDetailNoteDialog(text) {
  if (!els.detailNoteDialog.open) return;
  renderMarkdown(els.detailNoteContent, String(text || '').trim() || t('note.emptyDetail'));
}

function updateOpenDetailNoteDialogForKey(key, text) {
  if (state.activeDetailNoteKey !== key) return;
  updateOpenDetailNoteDialog(text);
}

function closeDetailNoteDialog() {
  if (typeof els.detailNoteDialog.close === 'function') {
    els.detailNoteDialog.close();
    return;
  }
  els.detailNoteDialog.removeAttribute('open');
}

function currentDetailNoteTarget() {
  if (state.previewMode === 'capture' && state.selectedCaptureId) {
    return { url: `/api/captures/${state.selectedCaptureId}/detail-note` };
  }
  return null;
}

function scheduleRemotePreview() {
  window.clearTimeout(state.remotePreviewTimer);
  state.remotePreviewTimer = window.setTimeout(updateRemotePreview, 250);
}

async function updateRemotePreview() {
  if (!state.selectedRemoteRuleId) return;
  const rule = state.remoteRules.find((item) => item.id === state.selectedRemoteRuleId);
  if (!rule) return;

  syncSelectedAiStepFromEditor();
  syncSelectedDslStepFromEditor();
  const requestId = state.remotePreviewRequestId + 1;
  state.remotePreviewRequestId = requestId;
  rememberRemoteExampleScroll();
  state.remotePreviewRefreshing = true;

  try {
    const payload = {
      steps: serializeRemoteStepsForApi(state.remoteSteps)
    };
    if (!isGlobalRemoteRule(rule)) {
      payload.query = normalizeQuery(els.ruleQueryInput.value);
      payload.requestBody = state.previewRequest?.body || '';
    }
    const result = await postJson(`/api/remote-rules/${rule.id}/preview`, payload);
    if (requestId !== state.remotePreviewRequestId) return;
    state.remoteExample = result;
    renderRemoteExample();
  } catch (error) {
    if (requestId !== state.remotePreviewRequestId) return;
    const message = error.message || t('remote.previewFailed');
    state.remoteExample = {
      errors: [message],
      request: { body: '' },
      response: { body: '' },
      requestHead: { body: '' },
      responseHead: { body: '' },
      query: { body: '' }
    };
    renderRemoteExample();
  } finally {
    if (requestId === state.remotePreviewRequestId) {
      window.setTimeout(() => {
        state.remotePreviewRefreshing = false;
      }, 80);
    }
  }
}

function setRemoteExampleTab(tab) {
  rememberRemoteExampleScroll();
  state.remoteExampleTab = tab;
  syncCurrentPreviewWorkspaceTabState();
  persistPreviewWorkspaceAndSettings();
  renderRemoteExample();
}

function remoteExampleTabForDslAction(action = '') {
  if (action === 'change_query') return 'query';
  if (action === 'change_req_head') return 'requestHead';
  if (action === 'change_req_body') return 'request';
  if (action === 'change_resp_head') return 'responseHead';
  if (action === 'change_resp_body') return 'response';
  return '';
}

function syncRemoteExampleTabForDslAction(action = '') {
  const tab = remoteExampleTabForDslAction(action);
  if (!tab || tab === state.remoteExampleTab) return;
  setRemoteExampleTab(tab);
}

function renderRemoteExample() {
  const tab = state.remoteExampleTab;
  const result = state.remoteExample || {};
  const errors = result.errors?.length ? `${t('remote.previewError')}:\n${result.errors.join('\n')}\n\n` : '';

  els.remoteExampleRequestTab.classList.toggle('active', tab === 'request');
  els.remoteExampleResponseTab.classList.toggle('active', tab === 'response');
  els.remoteExampleRequestHeadTab.classList.toggle('active', tab === 'requestHead');
  els.remoteExampleResponseHeadTab.classList.toggle('active', tab === 'responseHead');
  els.remoteExampleQueryTab.classList.toggle('active', tab === 'query');
  els.remoteExampleRequestTab.setAttribute('aria-selected', String(tab === 'request'));
  els.remoteExampleResponseTab.setAttribute('aria-selected', String(tab === 'response'));
  els.remoteExampleRequestHeadTab.setAttribute('aria-selected', String(tab === 'requestHead'));
  els.remoteExampleResponseHeadTab.setAttribute('aria-selected', String(tab === 'responseHead'));
  els.remoteExampleQueryTab.setAttribute('aria-selected', String(tab === 'query'));

  const diff = remoteExampleDiffForTab(tab, result);
  if (diff) {
    els.remoteExamplePreview.hidden = true;
    els.remoteExampleDiff.hidden = false;
    renderTextDiff(diff, {
      container: els.remoteExampleDiff,
      beforeTitle: t('remote.diffBefore'),
      afterTitle: t('remote.diffAfter'),
      prefix: errors
    });
    els.remoteExampleDiff.querySelector('.diff-body')?.addEventListener('scroll', rememberRemoteExampleScroll);
  } else {
    els.remoteExampleDiff.hidden = true;
    els.remoteExampleDiff.innerHTML = '';
    els.remoteExamplePreview.hidden = false;
    renderRemoteExampleCodePreview(tab, `${errors}${remoteExampleAfterText(tab, result)}`);
  }
  restoreRemoteExampleScroll(tab);
}

function renderRemoteExampleCodePreview(tab, text) {
  if (!String(text || '').trim()) {
    els.remoteExamplePreview.hidden = true;
    els.remoteExamplePreview.innerHTML = '';
    return;
  }
  const language = detectPreviewLanguage(text, tab);
  els.remoteExamplePreview.tabIndex = 0;
  els.remoteExamplePreview.dataset.language = language.label;
  renderCodePreview(els.remoteExamplePreview, text || ' ', language.kind);
}

function remoteExampleDiffForTab(tab, result) {
  const before = remoteExampleBeforeText(tab, result);
  const after = remoteExampleAfterText(tab, result);
  if (!String(before).trim() && !String(after).trim()) return null;
  if (before === after) return null;
  return { before, after };
}

function remoteExampleBeforeText(tab, result) {
  if (tab === 'request') return String(result.request?.beforeBody ?? '');
  if (tab === 'response') return String(result.response?.beforeBody ?? '');
  if (tab === 'requestHead') return formatHeadersPreview(result.request?.beforeHeaders || {});
  if (tab === 'responseHead') return formatHeadersPreview(result.response?.beforeHeaders || {});
  if (tab === 'query') return formatQueryPreview(result.query?.beforeBody ?? '');
  return '';
}

function remoteExampleAfterText(tab, result) {
  if (tab === 'request') return textWithEmptyPlaceholder(result.request?.body, 'empty request body');
  if (tab === 'response') return textWithEmptyPlaceholder(result.response?.body, 'empty response body');
  if (tab === 'requestHead') return formatHeadersPreview(result.request?.headers);
  if (tab === 'responseHead') return formatHeadersPreview(result.response?.headers);
  if (tab === 'query') return formatQueryPreview(result.query?.body ?? '');
  return '';
}

function textWithEmptyPlaceholder(value, label) {
  const text = String(value ?? '');
  return text.trim() ? text : `(${label})`;
}

function rememberRemoteExampleScroll() {
  if (state.restoringRemoteExampleScroll) return;
  if (state.remotePreviewRefreshing) return;
  if (!state.remoteExampleTab || !els.remoteExamplePreview) return;
  const scrollTarget = currentRemoteExampleScrollTarget();
  if (!scrollTarget) return;
  state.remoteExampleScroll[state.remoteExampleTab] = {
    top: scrollTarget.scrollTop,
    left: scrollTarget.scrollLeft
  };
}

function restoreRemoteExampleScroll(tab) {
  const position = state.remoteExampleScroll[tab];
  if (!position) return;
  const scrollTarget = currentRemoteExampleScrollTarget();
  if (!scrollTarget) return;
  let remainingFrames = 3;
  const apply = () => {
    state.restoringRemoteExampleScroll = true;
    scrollTarget.scrollTop = Math.min(position.top, scrollTarget.scrollHeight);
    scrollTarget.scrollLeft = Math.min(position.left, scrollTarget.scrollWidth);
    remainingFrames -= 1;
    window.requestAnimationFrame(() => {
      if (remainingFrames > 0) {
        apply();
        return;
      }
      window.setTimeout(() => {
        state.restoringRemoteExampleScroll = false;
      }, 0);
    });
  };
  window.requestAnimationFrame(apply);
}

function currentRemoteExampleScrollTarget() {
  if (!els.remoteExampleDiff.hidden) {
    return els.remoteExampleDiff.querySelector('.diff-body') || els.remoteExampleDiff;
  }
  return els.remoteExamplePreview;
}

function createRemoteDslRow(values = {}) {
  return {
    id: values.id || `remote-dsl-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'dsl',
    enabled: values.enabled !== false,
    action: values.action || '',
    path: values.path || '',
    value: values.value || '',
    note: values.note || ''
  };
}

function createRemoteAiStep(values = {}) {
  return {
    id: values.id || `remote-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'ai',
    enabled: values.enabled !== false,
    summary: normalizeAiSummary(values.summary || values.aiSummary || t('remote.aiDefaultSummary')),
    pythonScript: values.pythonScript || '',
    aiOutputLines: Array.isArray(values.aiOutputLines) ? values.aiOutputLines : [],
    aiPromptHistory: Array.isArray(values.aiPromptHistory) ? values.aiPromptHistory : [],
    aiContext: values.aiContext || null,
    aiPromptDraft: values.aiPromptDraft || '',
    aiStatus: values.aiStatus || '',
    aiJobId: values.aiJobId || '',
    aiError: values.aiError || '',
    aiUpdatedAt: values.aiUpdatedAt || ''
  };
}

function parseRemoteScriptForEditor(script, rule = null) {
  const rows = [];
  if (Array.isArray(rule?.steps)) {
    return normalizeRemoteStepsForEditor(rule.steps);
  }
  String(script || '').split(/\r?\n/).forEach((rawLine) => {
    const rawTrimmed = rawLine.trim();
    if (!rawTrimmed) return;
    const enabled = !rawTrimmed.startsWith(disabledRemoteDslPrefix);
    const line = enabled ? rawTrimmed : rawTrimmed.slice(disabledRemoteDslPrefix.length).trim();
    if (!line || line.startsWith('#')) return;

    const match = line.match(remoteCommandPattern);
    if (!match) return;

    rows.push(createRemoteDslRow({
      enabled,
      action: match[1],
      path: normalizeRemotePathForEditor(match[2]),
      value: decodeRemoteDslValue(match[3])
    }));
  });
  if (rule?.pythonScript) {
    rows.push(createRemoteAiStep({
      id: rule.aiStepId || `remote-ai-legacy-${rule.id || Date.now()}`,
      summary: rule.aiSummary || t('remote.aiDefaultSummary'),
      pythonScript: rule.pythonScript || '',
      aiOutputLines: rule.aiOutputLines || [],
      aiPromptHistory: rule.aiPromptHistory || [],
      aiContext: rule.aiContext || null
    }));
  }
  return rows;
}

function normalizeRemoteStepsForEditor(steps = []) {
  return steps.map((step) => {
    return step?.type === 'ai'
      ? createRemoteAiStep(step)
      : createRemoteDslRow(step);
  });
}

function serializeRemoteRows(rows) {
  const lines = [];
  const allowedActions = new Set(remoteActions.map(([value]) => value));

  for (const row of rows) {
    if (row.type === 'ai') continue;
    const action = String(row.action || '');
    const path = String(row.path || '').trim();
    const value = String(row.value ?? '');
    if (!action && !path && !value) continue;
    if (!allowedActions.has(action) || !path) {
      window.alert(t('remote.incomplete'));
      return null;
    }
    if (/\s/.test(path)) {
      window.alert(t('remote.pathNoSpace'));
      return null;
    }

    const line = serializeRemoteRow(row);
    if (!line) {
      window.alert(t('remote.valueEncodeError'));
      return null;
    }
    lines.push(row.enabled === false ? `${disabledRemoteDslPrefix}${line}` : line);
  }

  return lines.join('\n');
}

function serializeRemoteRowsForPreview(rows) {
  return rows
    .filter((row) => row.type !== 'ai')
    .filter((row) => row.enabled !== false)
    .map(serializeRemoteRow)
    .filter(Boolean)
    .join('\n');
}

function serializeRemoteRowsForState(rows) {
  return rows.map((row) => {
    if (row.type === 'ai') return '';
    const action = String(row.action || '');
    const path = String(row.path || '').trim();
    const value = String(row.value ?? '');
    if (!action && !path && !value) return '';
    const line = serializeRemoteRow(row);
    if (!line) return `${row.enabled === false ? disabledRemoteDslPrefix : ''}${action} ${path} to ""`;
    return row.enabled === false ? `${disabledRemoteDslPrefix}${line}` : line;
  }).filter(Boolean).join('\n');
}

function serializeRemoteStepsForApi(rows) {
  return rows.map((row) => {
    if (row.type === 'ai') {
      return {
        id: row.id,
        type: 'ai',
        enabled: row.enabled !== false,
        summary: normalizeAiSummary(row.summary || t('remote.aiDefaultSummary')),
        pythonScript: row.pythonScript || '',
        aiOutputLines: row.aiOutputLines || [],
        aiPromptHistory: row.aiPromptHistory || [],
        aiContext: row.aiContext || null,
        aiPromptDraft: row.aiPromptDraft || '',
        aiStatus: row.aiStatus || '',
        aiJobId: row.aiJobId || '',
        aiError: row.aiError || '',
        aiUpdatedAt: row.aiUpdatedAt || ''
      };
    }
    return {
      id: row.id,
      type: 'dsl',
        enabled: row.enabled !== false,
        action: row.action || '',
        path: normalizeRemotePathForEditor(row.path),
        value: String(row.value ?? ''),
        note: String(row.note || '')
      };
    });
}

function normalizeAiSummary(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || t('remote.aiDefaultSummary');
}

function isDefaultAiSummary(value) {
  const text = normalizeAiSummary(value);
  return text === t('remote.aiDefaultSummary') || text === translations['zh-CN']['remote.aiDefaultSummary'];
}

function serializeRemoteRow(row) {
  const action = String(row.action || '');
  const path = normalizeRemotePathForEditor(row.path);
  const value = String(row.value ?? '');
  if (!action || !path) return '';
  try {
    return `${action} ${path} to "${escapeRemoteDslValue(encodeURIComponent(value))}"`;
  } catch {
    return '';
  }
}

function normalizeRemotePathForEditor(path) {
  return String(path || '')
    .trim()
    .replace(/\[\]\{add\}/g, '.add')
    .replace(/\[\]\{set(\d+)\}/g, '[$1]');
}

function decodeRemoteDslValue(value) {
  const unescaped = String(value)
    .replaceAll('\\"', '"')
    .replaceAll('\\\\', '\\');
  try {
    return decodeURIComponent(unescaped);
  } catch {
    return unescaped;
  }
}

function escapeRemoteDslValue(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');
}

function handleSelectableTextClick(event, isActive, selectItem, options = {}) {
  if (options.stopPropagation !== false) {
    event.stopPropagation();
  }
  if (isActive) {
    selectElementText(event.currentTarget);
    return;
  }
  selectItem();
}

function handleListKeyboardNavigation(event, listType) {
  if (listType === 'captures' && state.captureTreeViewEnabled === true && handleCaptureTreeKeyboardNavigation(event)) {
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  if (isTextEntryElement(event.target)) return;
  const list = listElementForType(listType);
  if (!list || document.activeElement !== list) return;
  const items = selectableListItems(list, listType);
  if (!items.length) return;
  event.preventDefault();
  const selectedId = selectedListItemId(listType);
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const activeIndex = selectedIndex >= 0
    ? selectedIndex
    : items.findIndex((item) => item.element.classList.contains('active'));
  const fallbackIndex = event.key === 'ArrowDown' ? -1 : items.length;
  const currentIndex = activeIndex >= 0 ? activeIndex : fallbackIndex;
  const nextIndex = Math.min(Math.max(currentIndex + (event.key === 'ArrowDown' ? 1 : -1), 0), items.length - 1);
  selectListItem(items[nextIndex], listType, list);
}

function handleCaptureTreeKeyboardNavigation(event) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return false;
  if (isTextEntryElement(event.target)) return false;
  if (document.activeElement !== els.captures) return false;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const nodes = visibleCaptureTreeNodes();
    if (!nodes.length) return false;
    event.preventDefault();
    const activeIndex = captureTreeActiveNodeIndex(nodes);
    const fallbackIndex = event.key === 'ArrowDown' ? -1 : nodes.length;
    const currentIndex = activeIndex >= 0 ? activeIndex : fallbackIndex;
    const nextIndex = Math.min(Math.max(currentIndex + (event.key === 'ArrowDown' ? 1 : -1), 0), nodes.length - 1);
    focusCaptureTreeNode(nodes[nextIndex].dataset.treeKey);
    return true;
  }

  const node = currentCaptureTreeNodeElement();
  if (!node?.dataset.treeKey) return false;
  event.preventDefault();
  if (event.key === 'Enter') {
    const captureId = node.dataset.captureId || node.dataset.latestCaptureId || latestCaptureIdInTreeNodeElement(node);
    if (captureId) selectCaptureFromList(captureId, els.captures);
    return true;
  }
  const hasChildren = node.dataset.hasChildren === 'true';
  const isCollapsed = node.dataset.collapsed === 'true';
  if (event.key === 'ArrowRight') {
    if (hasChildren && isCollapsed) {
      setCaptureTreeNodeCollapsedByKey(node.dataset.treeKey, false);
    } else {
      const child = firstVisibleCaptureTreeChildNode(node);
      if (child?.dataset.treeKey) focusCaptureTreeNode(child.dataset.treeKey);
    }
    return true;
  }
  if (event.key === 'ArrowLeft') {
    if (hasChildren && !isCollapsed) {
      setCaptureTreeNodeCollapsedByKey(node.dataset.treeKey, true);
    } else {
      const parent = captureTreeParentBranchElement(node);
      if (parent && parent !== node && parent.dataset.treeKey) {
        focusCaptureTreeNode(parent.dataset.treeKey);
      }
    }
    return true;
  }
  return false;
}

function visibleCaptureTreeNodes() {
  return [...els.captures.querySelectorAll('.capture-tree-node[data-tree-key]')]
    .filter((element) => element.getClientRects().length > 0);
}

function captureTreeActiveNodeIndex(nodes) {
  const focusedKey = captureTreeFocusedKey();
  if (focusedKey) {
    const focusedIndex = nodes.findIndex((element) => element.dataset.treeKey === focusedKey);
    if (focusedIndex >= 0) return focusedIndex;
  }
  const selectedIndex = nodes.findIndex((element) => element.dataset.captureId === state.selectedCaptureId);
  if (selectedIndex >= 0) return selectedIndex;
  return nodes.findIndex((element) => element.classList.contains('active'));
}

function currentCaptureTreeNodeElement() {
  const focusedKey = captureTreeFocusedKey();
  const focusedNode = focusedKey
    ? els.captures.querySelector(`.capture-tree-node[data-tree-key="${cssEscape(focusedKey)}"]`)
    : null;
  if (focusedNode) return focusedNode;
  const activeLeaf = state.selectedCaptureId
    ? els.captures.querySelector(`.capture-tree-node[data-capture-id="${cssEscape(state.selectedCaptureId)}"]`)
    : null;
  if (activeLeaf) return activeLeaf;
  return els.captures.querySelector('.capture-tree-node.active') ||
    els.captures.querySelector('.capture-tree-node[data-has-children="true"]');
}

function captureTreeFocusedKey() {
  return String(state.captureTreeFocusedKey || '');
}

function setCaptureTreeFocusedKey(treeKey, options = {}) {
  state.captureTreeFocusedKey = String(treeKey || '');
  if (options.render !== false) {
    renderCaptures();
  }
}

function focusCaptureTreeNode(treeKey) {
  if (!treeKey) return;
  setCaptureTreeFocusedKey(treeKey);
  keepListFocus(
    els.captures,
    treeKey,
    `.capture-tree-node[data-tree-key="${cssEscape(treeKey)}"]`
  );
}

function firstVisibleCaptureTreeChildNode(node) {
  return node?.querySelector(':scope > .capture-tree-children > .capture-tree-node[data-tree-key]');
}

function latestCaptureIdInTreeNodeElement(node) {
  const captures = [...(node?.querySelectorAll('.capture-tree-node[data-capture-id]') || [])]
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => ({
      id: element.dataset.captureId,
      time: Number(element.dataset.captureTime || 0)
    }))
    .filter((item) => item.id);
  captures.sort((a, b) => b.time - a.time);
  return captures[0]?.id || '';
}

function captureTreeParentBranchElement(node) {
  let current = node?.parentElement;
  while (current && current !== els.captures) {
    if (current.classList?.contains('capture-tree-children')) {
      const parentNode = current.parentElement;
      if (parentNode?.classList?.contains('capture-tree-node')) return parentNode;
    }
    current = current.parentElement;
  }
  return node;
}

function setCaptureTreeNodeCollapsedByKey(treeKey, collapsed) {
  if (!treeKey) return;
  setCaptureTreeFocusedKey(treeKey, { render: false });
  if (collapsed) {
    state.captureTreeCollapsedKeys.add(treeKey);
  } else {
    state.captureTreeCollapsedKeys.delete(treeKey);
  }
  renderCaptures();
  keepListFocus(els.captures, treeKey, `.capture-tree-node[data-tree-key="${cssEscape(treeKey)}"]`);
}

function listElementForType(listType) {
  if (listType === 'captures') return els.captures;
  if (listType === 'rules') return els.rules;
  if (listType === 'remote') return els.remoteRules;
  return null;
}

function selectableListItems(list, listType) {
  const selector = listType === 'captures'
    ? '.capture[data-capture-id]'
    : '.rule[data-rule-id]:not(.global-rule-placeholder)';
  return [...list.querySelectorAll(selector)]
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => ({
      element,
      id: listType === 'captures' ? element.dataset.captureId : element.dataset.ruleId
    }))
    .filter((item) => item.id);
}

function selectedListItemId(listType) {
  if (listType === 'captures') return state.selectedCaptureId || '';
  if (listType === 'rules') return state.selectedRuleId || '';
  if (listType === 'remote') return state.selectedRemoteRuleId || '';
  return '';
}

function selectListItem(item, listType, list) {
  if (!item?.id) return;
  if (listType === 'captures') {
    selectCaptureFromList(item.id, list);
    return;
  }
  if (listType === 'rules') {
    selectRuleFromList(item.id, list);
    return;
  }
  selectRemoteRuleFromList(item.id, list);
}

function keepListFocus(list, id, selector) {
  requestAnimationFrame(() => {
    if (!list || list.hidden || list.offsetParent === null) return;
    list.focus({ preventScroll: true });
    list.querySelector(selector)?.scrollIntoView({ block: 'nearest' });
  });
}

function selectCaptureFromList(captureId, list = els.captures) {
  const selector = `.capture[data-capture-id="${cssEscape(captureId)}"]`;
  selectCapture(captureId).catch((error) => {
    console.error(error);
  }).finally(() => {
    keepListFocus(list, captureId, selector);
  });
  keepListFocus(list, captureId, selector);
}

function selectRuleFromList(ruleId, list = els.rules) {
  const selector = `.rule[data-rule-id="${cssEscape(ruleId)}"]`;
  selectRule(ruleId).catch((error) => {
    console.error(error);
  }).finally(() => {
    keepListFocus(list, ruleId, selector);
  });
  keepListFocus(list, ruleId, selector);
}

function selectRemoteRuleFromList(ruleId, list = els.remoteRules) {
  const selector = `.rule[data-rule-id="${cssEscape(ruleId)}"]`;
  selectRemoteRule(ruleId).catch((error) => {
    console.error(error);
  }).finally(() => {
    keepListFocus(list, ruleId, selector);
  });
  keepListFocus(list, ruleId, selector);
}

function cssEscape(value) {
  return window.CSS?.escape
    ? window.CSS.escape(String(value || ''))
    : String(value || '').replace(/["\\]/g, '\\$&');
}

function selectElementText(element) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function readonlyPreviewSelectTarget(activeTarget) {
  if (isTextEntryElement(activeTarget)) return null;
  const candidates = [
    els.bodyHighlight,
    els.captureBodyOriginal,
    els.captureDiffView,
    els.remoteExampleDiff,
    els.remoteExamplePreview,
    els.remoteAiOutput
  ].filter((element) => element && !element.hidden && element.offsetParent !== null);

  const focusedCandidate = candidates.find((element) => element.contains(activeTarget));
  if (focusedCandidate) return focusedCandidate;
  if (!els.bodyEditorStack.hidden && els.editor.hidden && !els.bodyHighlight.hidden) return els.bodyHighlight;
  return candidates[0] || null;
}

function isTextEntryElement(element) {
  if (!element || element === document.body) return false;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') return true;
  if (element.isContentEditable) return true;
  return false;
}

function isSpaceKey(event) {
  return event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space';
}

function shouldPreventSpacePageScroll(target) {
  if (isTextEntryElement(target)) return false;
  return true;
}

async function saveSelectedCapture(queryMode) {
  if (!state.selectedCaptureId) return;
  await saveLocal(state.selectedCaptureId, queryMode);
}

async function saveSelectedRemoteRule() {
  if (!state.selectedCaptureId) return;
  const result = await postJson(`/api/captures/${state.selectedCaptureId}/remote-rule`, {});
  showRuleWarning(result);
  replaceRemoteRuleInState(result.rule);
  setActiveTab('remote', { autoSelect: false });
  await selectRemoteRule(result.rule.id);
}

async function selectOrCreateGlobalRemoteRule(domain = currentProjectDomain()) {
  const host = normalizeHostInput(domain);
  const existing = state.remoteRules.find((rule) => isGlobalRemoteRule(rule) && normalizeHostInput(rule.host) === host);
  if (existing) {
    await selectRemoteRule(existing.id);
    return;
  }
  const result = await postJson('/api/remote-rules/global', { host });
  const rule = result.rule;
  state.remoteRules = [
    rule,
    ...state.remoteRules.filter((item) => item.id !== rule.id)
  ];
  await selectRemoteRule(rule.id);
}

async function copySelectedCurl() {
  const curl = buildSelectedCurl();
  if (!curl) return;

  await writeClipboard(curl);
  flashButton(els.copyCurlBtn, t('ai.copied'));
}

async function repeatSelectedRequest() {
  const target = repeatTarget();
  if (!target) return;

  els.repeatBtn.disabled = true;
  try {
    const result = await postJson('/api/repeat', target);
    await reloadRules();
    flashButton(els.repeatBtn, t('actions.done'));
  } catch (error) {
    console.error(error);
    window.alert(error.message || t('actions.repeatFailed'));
  } finally {
    setPreviewMode(state.previewMode);
  }
}

function repeatTarget() {
  if (state.selectedCaptureId) {
    return { source: 'capture', id: state.selectedCaptureId };
  }
  if (state.selectedRuleId) {
    return { source: 'rule', id: state.selectedRuleId };
  }
  if (state.selectedRemoteRuleId) {
    return { source: 'remote', id: state.selectedRemoteRuleId };
  }
  return null;
}

function buildSelectedCurl() {
  if (state.selectedCaptureId) {
    const capture = state.selectedCaptureDetail || state.captures.find((item) => item.id === state.selectedCaptureId);
    if (!capture) return '';
    return buildCurl({
      method: capture.method,
      url: capture.url || buildUrl(capture, { includeQuery: true }),
      headers: capture.requestHeaders,
      body: capture.requestBody?.editable ? capture.requestBody.body : ''
    });
  }

  if (state.selectedRuleId) {
    const rule = state.rules.find((item) => item.id === state.selectedRuleId);
    if (!rule) return '';
    const matchingCapture = findCaptureForRule(rule);
    const effectiveRule = {
      ...rule,
      query: currentRuleQuery(rule)
    };
    const editedRequestBody = state.previewMode === 'rule' &&
      state.previewBodyTab === 'request' &&
      !els.editor.readOnly
      ? els.editor.value
      : null;
    return buildCurl({
      method: rule.method,
      url: buildUrl(effectiveRule, { includeQuery: true }),
      headers: rule.requestHeaders || matchingCapture?.requestHeaders,
      body: editedRequestBody ?? (rule.requestBodyEditable
        ? bodyFromBase64(rule.requestBodyBase64)
        : (matchingCapture?.requestBodyEditable ? bodyFromBase64(matchingCapture.requestBodyBase64) : ''))
    });
  }

  if (state.selectedRemoteRuleId) {
    const rule = state.remoteRules.find((item) => item.id === state.selectedRemoteRuleId);
    if (!rule) return '';
    return buildCurl({
      method: rule.method,
      url: buildUrl({
        ...rule,
        query: currentRemoteRuleQuery(rule)
      }, { includeQuery: true }),
      headers: {},
      body: state.previewMode === 'remote' &&
        state.previewBodyTab === 'request' &&
        !els.editor.readOnly
        ? els.editor.value
        : (rule.requestBodyEditable ? bodyFromBase64(rule.requestBodyBase64) : '')
    });
  }

  return '';
}

function findCaptureForRule(rule) {
  const sameTarget = (capture) => {
    return capture.method === rule.method &&
      capture.protocol === rule.protocol &&
      capture.host === rule.host &&
      Number(capture.port) === Number(rule.port) &&
      capture.path === rule.path;
  };

  return state.captures.find((capture) => {
    return sameTarget(capture) && (capture.query || '') === (rule.query || '');
  }) || state.captures.find(sameTarget);
}

async function saveLocal(captureId, queryMode) {
  const result = await postJson(`/api/captures/${captureId}/local`, { queryMode });
  showRuleWarning(result);
  if (!result?.rule?.id) return;
  replaceRuleInState(result.rule);
  setActiveTab('rules', { autoSelect: false });
  await selectRule(result.rule.id);
  keepListFocus(els.rules, result.rule.id, `.rule[data-rule-id="${cssEscape(result.rule.id)}"]`);
}

async function selectCapture(captureId, options = {}) {
  const targetTabId = previewWorkspaceTabId('capture', captureId);
  if (state.activePreviewTabId && state.activePreviewTabId !== targetTabId) {
    await preparePreviewPaneSwitch();
  } else if (selectedPreviewWorkspaceTabId() === targetTabId) {
    await flushCurrentRuleAutoSaveSafely();
  }
  if (state.previewMode === 'capture' && state.selectedCaptureId === captureId && state.selectedCaptureDetail?.id === captureId) {
    renderPreviewWorkspaceTabs();
    renderCaptures();
    if (options.keepSelectedRule === true) {
      renderRules();
      renderRemoteRules();
    }
    return;
  }
  const previousTabId = state.activePreviewTabId;
  const nextTab = openCapturePreviewTab(captureId);
  const paneResult = ensurePreviewPaneForTab(nextTab?.id);
  if (previousTabId && nextTab?.id && previousTabId !== nextTab.id && paneResult.restored) return;
  clearManualRuleSaveRequired();
  const tabState = activePreviewTabState();
  const preserveCapturePreviewTab = state.previewMode === 'capture' || Boolean(tabState?.bodyTab);
  if (tabState?.bodyTab) {
    state.previewBodyTab = tabState.bodyTab;
  }
  const requestId = state.captureSelectRequestId + 1;
  state.captureSelectRequestId = requestId;
  const keepSelectedRule = options.keepSelectedRule === true ? state.selectedRuleId : null;
  const keepSelectedRemoteRule = options.keepSelectedRule === true ? state.selectedRemoteRuleId : null;
  state.selectedCaptureId = captureId;
  if (options.keepSelectedRule !== true) {
    state.selectedRuleId = null;
    state.selectedRemoteRuleId = null;
  }
  state.selectedCaptureDetail = null;
  state.previewRequest = null;
  const summary = selectedCaptureSummary();
  renderPendingCapturePreview(summary, { preserveCurrentTab: preserveCapturePreviewTab });
  if (options.keepSelectedRule === true) {
    state.selectedRuleId = keepSelectedRule;
    state.selectedRemoteRuleId = keepSelectedRemoteRule;
  }
  renderCaptures();
  renderRules();
  renderRemoteRules();
  let result;
  try {
    result = await getCaptureDetail(captureId);
  } catch (error) {
    if (requestId !== state.captureSelectRequestId || state.activePreviewTabId !== nextTab?.id) return;
    console.error(error);
    renderFailedCapturePreview(summary, error, { preserveCurrentTab: preserveCapturePreviewTab });
    return;
  }
  if (requestId !== state.captureSelectRequestId || state.activePreviewTabId !== nextTab?.id) return;
  state.selectedCaptureDetail = result;
  if (options.keepSelectedRule === true) {
    state.selectedRuleId = keepSelectedRule;
    state.selectedRemoteRuleId = keepSelectedRemoteRule;
  }
  const mergeOptions = captureMergeOptionsForCapture(result);

  setGlobalRemoteHeadEditorVisible(false);
  els.editorTitle.textContent = '';
  setEditorNote(apiNoteText(result));
  renderCaptureTimeDisplay(result);
  els.captureTimeDisplay.hidden = false;
  els.editorPath.textContent = '';
  setPreviewBodies({
    mode: 'capture',
    tabs: previewTabsForCapture(result),
    defaultTab: 'response',
    preserveCurrentTab: preserveCapturePreviewTab,
    overview: {
      capture: result,
      readOnly: true
    },
    requestHead: {
      body: formatHeadersPreview(result.requestHeaders),
      readOnly: true
    },
    responseHead: {
      body: formatHeadersPreview(result.responseHeaders),
      readOnly: true
    },
    response: {
      body: result.proxyError
        ? proxyErrorPreviewText(result)
        : result.editable
          ? (result.body || '(empty response body)')
          : (result.note || 'Binary response saved, but inline preview is disabled.'),
      readOnly: true
    },
    request: {
      body: requestBodyText(result.requestBody),
      readOnly: !shouldMergeCaptureList() || mergeOptions.body !== true
    }
  });
  state.savedEditorState = null;

  renderCaptures();
  renderRules();
  renderRemoteRules();
  renderPreviewWorkspaceTabs();
  adoptLivePreviewPane(nextTab?.id);
}

function openCapturePreviewTab(captureId) {
  if (!captureId) return null;
  rememberWorkspaceFocus('preview');
  const tabId = previewWorkspaceTabId('capture', captureId);
  let tab = state.previewOpenTabs.find((item) => item.id === tabId);
  if (!tab) {
    const summary = findCaptureSummaryById(captureId);
    tab = {
      id: tabId,
      type: 'capture',
      targetId: captureId,
      bodyTab: state.previewMode === 'capture' ? state.previewBodyTab : 'response',
      title: previewWorkspaceTabTitle(summary || { id: captureId })
    };
    state.previewOpenTabs.push(tab);
  }
  syncCurrentPreviewWorkspaceTabState();
  state.activePreviewTabId = tab.id;
  if (!state.suppressPreviewTabVisit) {
    rememberPreviewWorkspaceTabVisit(tab.id);
  }
  trimPreviewWorkspaceTabs();
  renderPreviewWorkspaceTabs();
  persistPreviewWorkspaceAndSettings();
  return tab;
}

function activePreviewTabState() {
  if (!state.activePreviewTabId) return null;
  return state.previewOpenTabs.find((tab) => tab.id === state.activePreviewTabId) || null;
}

function syncCurrentPreviewWorkspaceTabState() {
  const tab = activePreviewTabState();
  if (!tab) return;
  if (tab.id !== selectedPreviewWorkspaceTabId()) return;
  tab.bodyTab = normalizePreviewBodyTab(state.previewBodyTab);
  if (tab.type === 'remote') {
    tab.ruleEditorMode = currentRemoteRuleEditorMode();
    tab.ruleEditorStepId = currentRemoteRuleEditorStepId();
    tab.remoteExampleTab = normalizeRemoteExampleTab(state.remoteExampleTab);
  } else if (tab.type === 'rule') {
    tab.ruleEditorMode = 'list';
    tab.ruleEditorStepId = '';
  }
}

function currentRemoteRuleEditorMode() {
  if (state.selectedAiStepId) return 'ai';
  if (state.selectedDslStepId) return 'dsl';
  return 'list';
}

function currentRemoteRuleEditorStepId() {
  if (state.selectedAiStepId) return state.selectedAiStepId;
  if (state.selectedDslStepId) return state.selectedDslStepId;
  return '';
}

function previewWorkspaceTabId(type, targetId) {
  return `${type}:${targetId}`;
}

function previewWorkspaceTabTitle(capture = {}) {
  const path = capture.path || pathFromUrl(capture.url) || '/';
  return path;
}

function previewWorkspaceRuleTabTitle(rule = {}, type = 'rule') {
  const label = type === 'remote'
    ? (isGlobalRemoteRule(rule) ? t('preview.globalRemote') : t('nav.remote'))
    : t('nav.local');
  if (isGlobalRemoteRule(rule)) {
    return `${label} · ${normalizeHostInput(rule.host) || t('capture.unknownHost')}`;
  }
  const path = ruleTarget(rule);
  return [label, path].filter(Boolean).join(' · ');
}

function previewWorkspaceTabTitleFor(tab) {
  if (tab.type === 'capture') {
    const summary = findCaptureSummaryById(tab.targetId || tab.id);
    return previewWorkspaceTabTitle(summary || tab);
  }
  if (tab.type === 'rule') {
    const rule = state.rules.find((item) => item.id === tab.targetId);
    return previewWorkspaceRuleTabTitle(rule || tab, 'rule');
  }
  if (tab.type === 'remote') {
    const rule = state.remoteRules.find((item) => item.id === tab.targetId);
    return previewWorkspaceRuleTabTitle(rule || tab, 'remote');
  }
  return tab.title || '';
}

function previewWorkspaceVisibleTitles(tabs) {
  const titles = tabs.map((tab) => {
    const fullTitle = previewWorkspaceTabTitleFor(tab);
    return {
      fullTitle,
      visibleTitle: previewWorkspaceTabBaseVisibleTitle(tab, fullTitle)
    };
  });
  const commonPart = previewWorkspaceCommonTitlePart(titles.map((item) => item.visibleTitle));
  return titles.map(({ fullTitle, visibleTitle }) => ({
    fullTitle,
    visibleTitle: commonPart ? removePreviewWorkspaceCommonPart(visibleTitle, commonPart) : visibleTitle
  }));
}

function previewWorkspaceTabBaseVisibleTitle(tab, fullTitle) {
  const value = String(fullTitle || '').trim();
  if (!value || tab.type === 'capture') return value;
  const delimiter = ' · ';
  const delimiterIndex = value.indexOf(delimiter);
  if (delimiterIndex < 0) return value;
  const next = value.slice(delimiterIndex + delimiter.length).trim();
  return next || value;
}

function previewWorkspaceCommonTitlePart(titles) {
  const values = titles.map((title) => String(title || '')).filter(Boolean);
  if (values.length <= 1) return '';
  const pathPrefix = commonPreviewWorkspacePathPrefix(values);
  if (pathPrefix) return pathPrefix;
  return longestPreviewWorkspaceCommonSubstring(values);
}

function commonPreviewWorkspacePathPrefix(titles) {
  const paths = titles.map((title) => {
    const index = title.indexOf('/');
    return index >= 0 ? title.slice(index) : '';
  });
  if (paths.some((path) => !path)) return '';
  const segments = paths.map((path) => path.split('/'));
  const first = segments[0];
  const common = [];
  for (let index = 0; index < first.length; index += 1) {
    const segment = first[index];
    if (!segments.every((parts) => parts[index] === segment)) break;
    common.push(segment);
  }
  const meaningfulSegments = common.filter(Boolean);
  if (!meaningfulSegments.length) return '';
  const shared = common.join('/');
  const normalized = shared.startsWith('/') ? shared : `/${shared}`;
  const withTrailingSlash = paths.every((path) => path.length > normalized.length)
    ? `${normalized}/`
    : normalized;
  return withTrailingSlash.length >= 5 ? withTrailingSlash : '';
}

function longestPreviewWorkspaceCommonSubstring(titles) {
  const [firstTitle, ...rest] = titles;
  let best = '';
  for (let start = 0; start < firstTitle.length; start += 1) {
    for (let end = start + 5; end <= firstTitle.length; end += 1) {
      const candidate = firstTitle.slice(start, end);
      if (candidate.length <= best.length) continue;
      if (!/[/.:-]/.test(candidate)) continue;
      if (rest.every((title) => title.includes(candidate))) {
        best = candidate;
      }
    }
  }
  return best.trim();
}

function removePreviewWorkspaceCommonPart(title, commonPart) {
  const value = String(title || '');
  if (!commonPart || !value.includes(commonPart) || value === commonPart) return value;
  const next = value.replace(commonPart, '').replace(/\s+·\s*$/, '').trim();
  return next || value;
}

function previewWorkspaceTabIconSvg(tab) {
  if (tab.type === 'rule') {
    return '<svg class="preview-workspace-tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h7l2 3h7v10H4z"/><path d="M4 7v13"/></svg>';
  }
  if (tab.type === 'remote') {
    return '<svg class="preview-workspace-tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16z"/><path d="M14.8 6.2l3 3"/><path d="M4 20l1.5-4"/></svg>';
  }
  return '<svg class="preview-workspace-tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h10"/></svg>';
}

function openRulePreviewTab(ruleId, type) {
  if (!ruleId) return null;
  rememberWorkspaceFocus('preview');
  const tabId = previewWorkspaceTabId(type, ruleId);
  let tab = state.previewOpenTabs.find((item) => item.id === tabId);
  if (!tab) {
    const rule = type === 'remote'
      ? state.remoteRules.find((item) => item.id === ruleId)
      : state.rules.find((item) => item.id === ruleId);
    tab = {
      id: tabId,
      type,
      targetId: ruleId,
      bodyTab: state.previewMode === (type === 'remote' ? 'remote' : 'rule') ? state.previewBodyTab : 'response',
      title: previewWorkspaceRuleTabTitle(rule || { id: ruleId }, type)
    };
    state.previewOpenTabs.push(tab);
  }
  syncCurrentPreviewWorkspaceTabState();
  state.activePreviewTabId = tab.id;
  if (!state.suppressPreviewTabVisit) {
    rememberPreviewWorkspaceTabVisit(tab.id);
  }
  trimPreviewWorkspaceTabs();
  renderPreviewWorkspaceTabs();
  persistPreviewWorkspaceAndSettings();
  return tab;
}

function trimPreviewWorkspaceTabs() {
  if (!Array.isArray(state.previewOpenTabs)) {
    clearPreviewPaneCache();
    state.previewOpenTabs = [];
    return;
  }
  while (state.previewOpenTabs.length > previewWorkspaceTabLimit) {
    const removableIndex = state.previewOpenTabs.findIndex((tab) => tab.id !== state.activePreviewTabId);
    const [removed] = state.previewOpenTabs.splice(removableIndex >= 0 ? removableIndex : 0, 1);
    removeCachedPreviewPane(removed?.id);
  }
}

function renderPreviewWorkspaceTabs() {
  if (!els.previewWorkspaceTabs) return;
  const tabs = state.previewOpenTabs.filter((tab) => tab?.id);
  ensurePreviewWorkspaceTabHistory();
  const titles = previewWorkspaceVisibleTitles(tabs);
  els.previewWorkspaceTabs.hidden = !tabs.length;
  els.previewWorkspaceTabs.innerHTML = '';
  for (const [index, tab] of tabs.entries()) {
    const { fullTitle, visibleTitle } = titles[index] || {};
    const title = fullTitle || previewWorkspaceTabTitleFor(tab);
    const displayTitle = visibleTitle || title;
    tab.title = title;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `preview-workspace-tab${tab.id === state.activePreviewTabId ? ' active' : ''}`;
    button.dataset.previewTabId = tab.id;
    button.title = title;
    button.draggable = true;
    button.innerHTML = `
      <span class="preview-workspace-tab-leading" role="button" tabindex="-1" aria-label="${escapeHtml(t('actions.close'))}">
        ${previewWorkspaceTabIconSvg(tab)}
        <span class="preview-workspace-tab-hover-close" aria-hidden="true">×</span>
      </span>
      <span class="preview-workspace-tab-title"><span class="preview-workspace-tab-title-text">${escapeHtml(displayTitle)}</span></span>
    `;
    button.addEventListener('click', (event) => {
      if (suppressPreviewWorkspaceTabClick) {
        event.preventDefault();
        suppressPreviewWorkspaceTabClick = false;
        return;
      }
      rememberWorkspaceFocus('preview');
      if (event.target.closest('.preview-workspace-tab-leading')) {
        closePreviewWorkspaceTab(tab.id);
        return;
      }
      selectPreviewWorkspaceTab(tab.id).catch((error) => {
        console.error(error);
      });
    });
    button.addEventListener('dragstart', (event) => {
      if (event.target.closest('.preview-workspace-tab-leading')) {
        event.preventDefault();
        return;
      }
      rememberWorkspaceFocus('preview');
      draggedPreviewWorkspaceTabId = tab.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tab.id);
      button.classList.add('is-dragging');
    });
    button.addEventListener('dragover', (event) => {
      if (!draggedPreviewWorkspaceTabId || draggedPreviewWorkspaceTabId === tab.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearTabDropTargets(els.previewWorkspaceTabs, '.preview-workspace-tab');
      button.classList.add('is-drop-target');
    });
    button.addEventListener('dragleave', () => {
      button.classList.remove('is-drop-target');
    });
    button.addEventListener('drop', (event) => {
      if (!draggedPreviewWorkspaceTabId || draggedPreviewWorkspaceTabId === tab.id) return;
      event.preventDefault();
      const moved = reorderPreviewWorkspaceTab(draggedPreviewWorkspaceTabId, tab.id);
      suppressPreviewWorkspaceTabClick = moved;
      draggedPreviewWorkspaceTabId = '';
      clearTabDropTargets(els.previewWorkspaceTabs, '.preview-workspace-tab');
      window.setTimeout(() => {
        suppressPreviewWorkspaceTabClick = false;
      }, 0);
    });
    button.addEventListener('dragend', () => {
      draggedPreviewWorkspaceTabId = '';
      button.classList.remove('is-dragging');
      clearTabDropTargets(els.previewWorkspaceTabs, '.preview-workspace-tab');
      window.setTimeout(() => {
        suppressPreviewWorkspaceTabClick = false;
      }, 0);
    });
    els.previewWorkspaceTabs.append(button);
  }
  scheduleRevealActivePreviewWorkspaceTab();
}

function reorderPreviewWorkspaceTab(sourceId, targetId) {
  const moved = moveItemBeforeId(state.previewOpenTabs, sourceId, targetId);
  if (!moved) return false;
  ensurePreviewWorkspaceTabHistory({ preferTabOrder: true });
  renderPreviewWorkspaceTabs();
  persistPreviewWorkspaceAndSettings();
  restorePreviewWorkspaceFocus();
  return true;
}

function focusPreviewWorkspaceTabs() {
  const activeTab = els.previewWorkspaceTabs?.querySelector?.('.preview-workspace-tab.active');
  if (activeTab) {
    revealActivePreviewWorkspaceTab(activeTab);
    activeTab.focus({ preventScroll: true });
    return true;
  }
  if (els.previewWorkspaceTabs && !els.previewWorkspaceTabs.hidden && els.previewWorkspaceTabs.offsetParent !== null) {
    els.previewWorkspaceTabs.focus({ preventScroll: true });
    return true;
  }
  if (els.previewPanel && els.previewPanel.offsetParent !== null) {
    els.previewPanel.focus({ preventScroll: true });
    return true;
  }
  return false;
}

function scheduleRevealActivePreviewWorkspaceTab() {
  window.cancelAnimationFrame(previewWorkspaceRevealFrame);
  previewWorkspaceRevealFrame = window.requestAnimationFrame(() => {
    revealActivePreviewWorkspaceTab();
    previewWorkspaceRevealFrame = window.requestAnimationFrame(() => {
      previewWorkspaceRevealFrame = 0;
      revealActivePreviewWorkspaceTab();
    });
  });
}

function revealActivePreviewWorkspaceTab(tabElement = els.previewWorkspaceTabs?.querySelector?.('.preview-workspace-tab.active')) {
  return revealTabInScrollContainer(els.previewWorkspaceTabs, tabElement, 8);
}

function restorePreviewWorkspaceFocus() {
  rememberWorkspaceFocus('preview');
  window.requestAnimationFrame(() => {
    focusPreviewWorkspaceTabs();
  });
}

function prunePreviewWorkspaceTabs(options = {}) {
  if (!Array.isArray(state.previewOpenTabs) || !state.previewOpenTabs.length) return;
  const beforeActive = state.activePreviewTabId;
  const beforeLength = state.previewOpenTabs.length;
  state.previewOpenTabs = state.previewOpenTabs.filter((tab) => previewWorkspaceTabExists(tab));
  if (beforeActive && !state.previewOpenTabs.some((tab) => tab.id === beforeActive)) {
    const nextTabId = state.previewOpenTabs[0]?.id || '';
    if (options.selectReplacement !== false) {
      clearCurrentPreviewSelection();
      if (nextTabId) {
        selectPreviewWorkspaceTab(nextTabId, { persist: options.persist !== false }).catch((error) => {
          console.error(error);
        });
      } else {
        state.activePreviewTabId = '';
        clearPreview();
      }
    } else if (!nextTabId) {
      state.activePreviewTabId = '';
      clearPreview();
    } else {
      state.activePreviewTabId = nextTabId;
    }
  }
  if (options.persist !== false && beforeLength !== state.previewOpenTabs.length) {
    persistPreviewWorkspaceAndSettings();
  }
}

function previewWorkspaceTabExists(tab) {
  if (!tab?.id) return false;
  if (tab.type === 'capture') return Boolean(findCaptureSummaryById(tab.targetId || tab.id));
  if (tab.type === 'rule') return state.rules.some((rule) => rule.id === tab.targetId);
  if (tab.type === 'remote') return state.remoteRules.some((rule) => rule.id === tab.targetId);
  return false;
}

function selectedPreviewWorkspaceTabId() {
  if (state.previewMode === 'capture' && state.selectedCaptureId) {
    return previewWorkspaceTabId('capture', state.selectedCaptureId);
  }
  if (state.previewMode === 'rule' && state.selectedRuleId) {
    return previewWorkspaceTabId('rule', state.selectedRuleId);
  }
  if (state.previewMode === 'remote' && state.selectedRemoteRuleId) {
    return previewWorkspaceTabId('remote', state.selectedRemoteRuleId);
  }
  return '';
}

function rememberPreviewWorkspaceTabVisit(tabId) {
  if (!tabId) return;
  prunePreviewWorkspaceTabHistory();
  const current = state.previewTabHistory[state.previewTabHistoryIndex];
  if (current === tabId) return;
  if (state.previewTabHistoryIndex < state.previewTabHistory.length - 1) {
    state.previewTabHistory = state.previewTabHistory.slice(0, state.previewTabHistoryIndex + 1);
  }
  state.previewTabHistory.push(tabId);
  state.previewTabHistoryIndex = state.previewTabHistory.length - 1;
  if (state.previewTabHistory.length > previewWorkspaceTabLimit * 2) {
    const overflow = state.previewTabHistory.length - previewWorkspaceTabLimit * 2;
    state.previewTabHistory.splice(0, overflow);
    state.previewTabHistoryIndex = Math.max(0, state.previewTabHistoryIndex - overflow);
  }
  syncBrowserPreviewHistory({ replace: !state.browserPreviewHistoryReady });
}

function prunePreviewWorkspaceTabHistory() {
  const ids = new Set(state.previewOpenTabs.map((tab) => tab.id));
  const beforeActive = state.previewTabHistory[state.previewTabHistoryIndex] || '';
  state.previewTabHistory = state.previewTabHistory.filter((id) => ids.has(id));
  if (!state.previewTabHistory.length) {
    state.previewTabHistoryIndex = -1;
    return;
  }
  const activeIndex = beforeActive ? state.previewTabHistory.indexOf(beforeActive) : -1;
  state.previewTabHistoryIndex = activeIndex >= 0 ? activeIndex : state.previewTabHistory.length - 1;
}

function browserPreviewHistoryPayload() {
  return {
    v: 1,
    captureTabId: state.activeCaptureTabId || '',
    previewTabId: state.activePreviewTabId || '',
    previewTabHistoryIndex: Number(state.previewTabHistoryIndex || 0),
    seq: state.browserPreviewHistorySeq
  };
}

function sameBrowserPreviewHistoryPayload(a = {}, b = {}) {
  return a.captureTabId === b.captureTabId &&
    a.previewTabId === b.previewTabId &&
    Number(a.previewTabHistoryIndex) === Number(b.previewTabHistoryIndex);
}

function syncBrowserPreviewHistory(options = {}) {
  if (pageMode === 'settings') return;
  if (state.suppressBrowserPreviewHistory) return;
  if (!window.history?.pushState || !window.history?.replaceState) return;
  const payload = browserPreviewHistoryPayload();
  const current = window.history.state?.httpMockerPreviewWorkspace;
  if (options.replace !== true && sameBrowserPreviewHistoryPayload(current, payload)) return;
  const nextState = {
    ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
    httpMockerPreviewWorkspace: {
      ...payload,
      seq: state.browserPreviewHistorySeq + 1
    }
  };
  state.browserPreviewHistorySeq += 1;
  try {
    if (options.replace === true || !state.browserPreviewHistoryReady) {
      window.history.replaceState(nextState, '', window.location.href);
    } else {
      window.history.pushState(nextState, '', window.location.href);
    }
    state.browserPreviewHistoryReady = true;
  } catch (error) {
    console.error(error);
  }
}

function handlePreviewWorkspaceBrowserHistory(event) {
  const payload = event.state?.httpMockerPreviewWorkspace;
  if (!payload || payload.v !== 1) {
    syncBrowserPreviewHistory({ replace: true });
    return;
  }
  if (payload.captureTabId !== state.activeCaptureTabId) {
    syncBrowserPreviewHistory({ replace: true });
    return;
  }
  const tabId = String(payload.previewTabId || '');
  if (!tabId || !state.previewOpenTabs.some((tab) => tab.id === tabId)) {
    syncBrowserPreviewHistory({ replace: true });
    return;
  }
  prunePreviewWorkspaceTabHistory();
  const payloadIndex = Number(payload.previewTabHistoryIndex);
  const nextIndex = state.previewTabHistory[payloadIndex] === tabId
    ? payloadIndex
    : state.previewTabHistory.indexOf(tabId);
  if (nextIndex >= 0) {
    state.previewTabHistoryIndex = nextIndex;
  }
  state.suppressPreviewTabVisit = true;
  state.suppressBrowserPreviewHistory = true;
  selectPreviewWorkspaceTab(tabId, { remember: false }).catch((error) => {
    console.error(error);
  }).finally(() => {
    state.suppressPreviewTabVisit = false;
    state.suppressBrowserPreviewHistory = false;
  });
  scheduleRevealActivePreviewWorkspaceTab();
}

function switchPreviewWorkspaceTabHistory(delta) {
  ensurePreviewWorkspaceTabHistory();
  if (state.previewTabHistory.length <= 1) return false;
  const nextIndex = state.previewTabHistoryIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.previewTabHistory.length) return false;
  const tabId = state.previewTabHistory[nextIndex];
  if (!state.previewOpenTabs.some((tab) => tab.id === tabId)) return false;
  state.previewTabHistoryIndex = nextIndex;
  state.suppressPreviewTabVisit = true;
  selectPreviewWorkspaceTab(tabId, { remember: false }).then(() => {
    syncBrowserPreviewHistory({ replace: true });
    scheduleRevealActivePreviewWorkspaceTab();
  }).catch((error) => {
    console.error(error);
  }).finally(() => {
    state.suppressPreviewTabVisit = false;
  });
  return true;
}

function shouldHandlePreviewWorkspaceHistoryShortcut(target, options = {}) {
  if (isTextEntryElement(target)) return false;
  if (options.global !== true) {
    if (els.terminalPanel?.contains(target)) return false;
  }
  if (els.globalSearchDialog?.open) return false;
  if (els.settingsDialog?.open) return false;
  if (els.noteDialog?.open) return false;
  return state.previewOpenTabs.length > 1;
}

function closeActiveWorkspaceTabForShortcut(target, options = {}) {
  if (isTextEntryElement(target) && options.force !== true) return false;
  if (els.globalSearchDialog?.open || els.settingsDialog?.open || els.noteDialog?.open) return false;
  const targetInTerminal = els.terminalPanel?.contains(target);
  const targetInPreview = els.previewPanel?.contains(target);
  const targetInTerminalBody = Boolean(target?.closest?.('.terminal-xterm'));
  if (options.preferPreview === true && state.activePreviewTabId && (!targetInTerminalBody || state.lastWorkspaceFocus !== 'terminal')) {
    closePreviewWorkspaceTab(state.activePreviewTabId);
    return true;
  }
  if (targetInTerminal && !targetInPreview) {
    const terminalState = ensureActiveTerminalState();
    if (!terminalState.open || !terminalState.activeId) return false;
    closeTerminalTab(terminalState.activeId).catch((error) => {
      console.error(error);
    });
    return true;
  }
  if (els.previewWorkspaceTabs?.contains(target) || state.activePreviewTabId) {
    if (!state.activePreviewTabId) return false;
    closePreviewWorkspaceTab(state.activePreviewTabId);
    return true;
  }
  return false;
}

function clearCurrentPreviewSelection() {
  state.selectedCaptureId = null;
  state.selectedRuleId = null;
  state.selectedRemoteRuleId = null;
  state.selectedCaptureDetail = null;
}

async function selectPreviewWorkspaceTab(tabId, options = {}) {
  if (!tabId) return;
  const tab = state.previewOpenTabs.find((item) => item.id === tabId);
  if (!tab) return;
  syncCurrentPreviewWorkspaceTabState();
  if (state.activePreviewTabId && state.activePreviewTabId !== tab.id) {
    await preparePreviewPaneSwitch();
  }
  rememberWorkspaceFocus('preview');
  state.activePreviewTabId = tab.id;
  scheduleRevealActivePreviewWorkspaceTab();
  if (options.remember !== false) {
    rememberPreviewWorkspaceTabVisit(tab.id);
  }
  if (options.persist !== false) {
    persistPreviewWorkspaceAndSettings();
  }
  const paneResult = ensurePreviewPaneForTab(tab.id);
  if (paneResult.restored) {
    setActiveTab(tab.type === 'capture' ? 'captures' : tab.type === 'rule' ? 'rules' : 'remote', { autoSelect: false });
    return;
  }
  if (tab.type === 'capture') {
    setActiveTab('captures', { autoSelect: false });
    await selectCapture(tab.targetId);
    return;
  }
  if (tab.type === 'rule') {
    setActiveTab('rules', { autoSelect: false });
    await selectRule(tab.targetId, { tabState: tab });
    return;
  }
  if (tab.type === 'remote') {
    setActiveTab('remote', { autoSelect: false });
    await selectRemoteRule(tab.targetId, { tabState: tab });
  }
}

function closePreviewWorkspaceTab(tabId) {
  rememberWorkspaceFocus('preview');
  const index = state.previewOpenTabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return;
  const wasActive = state.activePreviewTabId === tabId;
  state.previewOpenTabs.splice(index, 1);
  if (wasActive) {
    const pane = livePreviewPane();
    const key = previewPaneCacheKey(tabId);
    if (pane && activePreviewPaneCacheKey === key) {
      pane.remove();
      activePreviewPaneCacheKey = '';
    }
  }
  removeCachedPreviewPane(tabId);
  prunePreviewWorkspaceTabHistory();
  if (!wasActive) {
    renderPreviewWorkspaceTabs();
    persistPreviewWorkspaceAndSettings();
    restorePreviewWorkspaceFocus();
    return;
  }
  const next = state.previewOpenTabs[Math.max(0, index - 1)] || state.previewOpenTabs[0] || null;
  if (next) {
    renderPreviewWorkspaceTabs();
    selectPreviewWorkspaceTab(next.id).catch((error) => {
      console.error(error);
    });
    restorePreviewWorkspaceFocus();
    return;
  }
  state.activePreviewTabId = '';
  persistPreviewWorkspaceAndSettings();
  clearCurrentPreviewSelection();
  clearPreview();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  renderPreviewWorkspaceTabs();
  restorePreviewWorkspaceFocus();
}

async function getCaptureDetail(captureId) {
  const url = `/api/captures/${captureId}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await getJsonWithTimeout(url, 2500);
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await delay(250 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

function renderPendingCapturePreview(capture = {}, options = {}) {
  const tabs = previewTabsForCapture(capture);
  setGlobalRemoteHeadEditorVisible(false);
  els.editorTitle.textContent = '';
  setEditorNote(apiNoteText(capture));
  els.editorPath.textContent = '';
  els.captureTimeDisplay.hidden = true;
  setPreviewBodies({
    mode: 'capture',
    tabs,
    defaultTab: 'response',
    preserveCurrentTab: options.preserveCurrentTab === true,
    overview: {
      capture,
      loading: true,
      readOnly: true
    },
    requestHead: { body: '', readOnly: true },
    responseHead: { body: '', readOnly: true },
    response: { body: t('capture.loadingDetail'), readOnly: true },
    request: { body: t('capture.loadingDetail'), readOnly: true }
  });
}

function renderFailedCapturePreview(capture = {}, error, options = {}) {
  const tabs = previewTabsForCapture(capture);
  setGlobalRemoteHeadEditorVisible(false);
  els.editorTitle.textContent = '';
  setEditorNote(apiNoteText(capture));
  els.editorPath.textContent = '';
  els.captureTimeDisplay.hidden = true;
  setPreviewBodies({
    mode: 'capture',
    tabs,
    defaultTab: 'response',
    preserveCurrentTab: options.preserveCurrentTab === true,
    overview: {
      capture,
      error: error?.message || t('capture.retryLater'),
      readOnly: true
    },
    requestHead: { body: '', readOnly: true },
    responseHead: { body: '', readOnly: true },
    response: {
      body: `${t('capture.detailLoadFailed')}\n\n${error?.message || t('capture.retryLater')}`,
      readOnly: true
    },
    request: {
      body: `${t('capture.detailLoadFailed')}\n\n${error?.message || t('capture.retryLater')}`,
      readOnly: true
    }
  });
}

function previewTabsForCapture(capture = {}) {
  return methodHasRequestBody(capture.method)
    ? ['overview', 'query', 'requestHead', 'request', 'responseHead', 'response']
    : ['overview', 'query', 'requestHead', 'responseHead', 'response'];
}

function captureMappingText(capture) {
  if (capture.mapType === 'local') return t('capture.hitLocal');
  if (capture.mapType === 'remote') return t('capture.hitRemote');
  return '';
}

function proxyErrorPreviewText(capture = {}) {
  const error = capture.proxyError || {};
  return [
    error.title || t('capture.proxyFailed'),
    '',
    error.message ? t('capture.reason', { message: error.message }) : '',
    error.type ? t('capture.type', { type: error.type }) : ''
  ].filter((line) => line !== '').join('\n');
}

function renderCaptureTimeDisplay(capture) {
  els.captureTimeDisplay.innerHTML = '';
  const mappingText = captureMappingText(capture);
  const mappedRuleId = preferredMappedRuleId(capture);
  if (mappingText && mappedRuleId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mapping-link';
    button.textContent = mappingText;
    button.addEventListener('click', () => jumpToMappedRule(capture));
    els.captureTimeDisplay.append(button, document.createTextNode(' · '));
  } else if (mappingText) {
    const span = document.createElement('span');
    span.textContent = `${mappingText} · `;
    els.captureTimeDisplay.append(span);
  }
  els.captureTimeDisplay.append(document.createTextNode(t('capture.requestTime', { time: new Date(capture.createdAt).toLocaleString() })));
}

async function jumpToMappedRule(capture) {
  const mappedRuleId = preferredMappedRuleId(capture);
  if (!mappedRuleId) return;
  if (capture.mapType === 'local') {
    setActiveTab('rules', { autoSelect: false });
    await selectRule(mappedRuleId);
    return;
  }
  if (capture.mapType === 'remote') {
    setActiveTab('remote', { autoSelect: false });
    await selectRemoteRule(mappedRuleId);
  }
}

function preferredMappedRuleId(capture = {}) {
  if (capture.mapType === 'remote') return preferredMappedRemoteRuleId(capture);
  return capture.mapRuleId || '';
}

function preferredMappedRemoteRuleId(capture = {}) {
  const ids = [
    ...(Array.isArray(capture.mapRuleIds) ? capture.mapRuleIds : []),
    capture.mapRuleId
  ].filter(Boolean);
  return ids.find((id) => {
    const rule = state.remoteRules.find((item) => item.id === id);
    return rule && !isGlobalRemoteRule(rule);
  }) || ids[0] || '';
}

async function selectRule(ruleId, options = {}) {
  const rule = state.rules.find((item) => item.id === ruleId);
  if (!rule) return;
  const targetTabId = previewWorkspaceTabId('rule', ruleId);
  if (state.activePreviewTabId && state.activePreviewTabId !== targetTabId) {
    await preparePreviewPaneSwitch();
  } else if (selectedPreviewWorkspaceTabId() === targetTabId) {
    await flushCurrentRuleAutoSaveSafely();
  }
  if (state.previewMode === 'rule' && state.selectedRuleId === ruleId && state.activePreviewTabId === targetTabId) {
    renderPreviewWorkspaceTabs();
    renderCaptures();
    renderRules();
    renderRemoteRules();
    updateManualRuleSaveButton();
    return;
  }
  state.expandedRuleHitCaptures.clear();
  const tabState = previewWorkspaceTabStateFor('rule', ruleId, options.tabState);
  const previousTabId = state.activePreviewTabId;
  const nextTab = openRulePreviewTab(ruleId, 'rule');
  const paneResult = ensurePreviewPaneForTab(nextTab?.id);
  if (previousTabId && nextTab?.id && previousTabId !== nextTab.id && paneResult.restored) return;
  clearManualRuleSaveRequired();
  restorePreviewBodyTabFromTabState(tabState);
  state.selectedRuleId = ruleId;
  state.selectedRemoteRuleId = null;
  state.selectedCaptureId = null;
  state.selectedCaptureDetail = null;

  const result = await getJson(`/api/rules/${ruleId}/body`);
  if (state.activePreviewTabId !== nextTab?.id || state.selectedRuleId !== ruleId) return;
  setGlobalRemoteHeadEditorVisible(false);
  const noteText = displayNoteText(rule);
  els.editorTitle.textContent = '';
  els.captureTimeDisplay.hidden = true;
  els.captureTimeDisplay.textContent = '';
  setEditorNote(noteText);
  els.editorPath.textContent = '';
  els.ruleQueryInput.value = rule.query || '';
  const requestBodyEditable = Boolean(result.requestBody?.editable);
  setPreviewBodies({
    mode: 'rule',
    tabs: methodHasRequestBody(rule.method)
      ? ['query', 'request', 'response']
      : ['query', 'response'],
    defaultTab: 'response',
    preserveCurrentTab: Boolean(tabState?.bodyTab),
    requestHead: {
      body: formatHeadersPreview(rule.requestHeaders),
      readOnly: true
    },
    responseHead: {
      body: formatHeadersPreview(rule.responseHeaders),
      readOnly: true
    },
    response: {
      body: result.body,
      readOnly: false
    },
    request: {
      body: requestBodyText(result.requestBody),
      readOnly: !requestBodyEditable
    }
  });
  captureSavedEditorState();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  renderPreviewWorkspaceTabs();
  adoptLivePreviewPane(nextTab?.id);
}

async function selectRemoteRule(ruleId, options = {}) {
  const rule = state.remoteRules.find((item) => item.id === ruleId);
  if (!rule) return;
  const targetTabId = previewWorkspaceTabId('remote', ruleId);
  if (state.activePreviewTabId && state.activePreviewTabId !== targetTabId) {
    await preparePreviewPaneSwitch();
  } else if (selectedPreviewWorkspaceTabId() === targetTabId) {
    await flushCurrentRuleAutoSaveSafely();
  }
  if (state.previewMode === 'remote' && state.selectedRemoteRuleId === ruleId && state.activePreviewTabId === targetTabId) {
    renderPreviewWorkspaceTabs();
    renderCaptures();
    renderRules();
    renderRemoteRules();
    updateManualRuleSaveButton();
    return;
  }
  state.expandedRuleHitCaptures.clear();
  const tabState = previewWorkspaceTabStateFor('remote', ruleId, options.tabState);
  const previousTabId = state.activePreviewTabId;
  const nextTab = openRulePreviewTab(ruleId, 'remote');
  const paneResult = ensurePreviewPaneForTab(nextTab?.id);
  if (previousTabId && nextTab?.id && previousTabId !== nextTab.id && paneResult.restored) return;
  clearManualRuleSaveRequired();
  restorePreviewBodyTabFromTabState(tabState);
  state.selectedRemoteRuleId = ruleId;
  state.selectedRuleId = null;
  state.selectedCaptureId = null;
  state.selectedCaptureDetail = null;

  const isGlobal = isGlobalRemoteRule(rule);
  setGlobalRemoteHeadEditorVisible(isGlobal, rule);
  const noteText = displayNoteText(rule);
  els.editorTitle.textContent = '';
  els.captureTimeDisplay.hidden = true;
  els.captureTimeDisplay.textContent = '';
  setEditorNote(noteText);
  els.editorPath.textContent = '';
  els.ruleQueryInput.value = rule.query || '';
  els.globalRemoteHostInput.value = rule.host || '';
  els.globalRemoteEnabled.checked = rule.enabled !== false;
  state.remoteSteps = parseRemoteScriptForEditor(rule.script, rule);
  applyRemoteRuleTabState(tabState);
  const result = await getJson(`/api/remote-rules/${ruleId}/body`);
  if (state.activePreviewTabId !== nextTab?.id || state.selectedRemoteRuleId !== ruleId) return;
  const requestBodyEditable = Boolean(result.requestBody?.editable);
  setPreviewBodies({
    mode: 'remote',
    tabs: isGlobal
      ? ['response']
      : methodHasRequestBody(rule.method)
      ? ['query', 'request', 'response']
      : ['query', 'response'],
    defaultTab: 'response',
    preserveCurrentTab: Boolean(tabState?.bodyTab),
    requestHead: {
      body: formatHeadersPreview(rule.requestHeaders),
      readOnly: true
    },
    responseHead: {
      body: '',
      readOnly: true
    },
    response: {
      body: '',
      readOnly: true
    },
    request: {
      body: requestBodyText(result.requestBody),
      readOnly: !requestBodyEditable
    }
  });
  renderRemoteRuleEditorMode();
  captureSavedEditorState();
  scheduleRemotePreview();
  renderCaptures();
  renderRules();
  renderRemoteRules();
  renderPreviewWorkspaceTabs();
  adoptLivePreviewPane(nextTab?.id);
}

function applyRemoteRuleTabState(tabState = {}) {
  const stateFromTab = tabState || {};
  const mode = normalizePreviewRuleEditorMode(stateFromTab.ruleEditorMode);
  const stepId = String(stateFromTab.ruleEditorStepId || '').trim();
  state.selectedAiStepId = '';
  state.selectedDslStepId = '';
  if (mode === 'ai' && state.remoteSteps.some((step) => step.id === stepId && step.type === 'ai')) {
    state.selectedAiStepId = stepId;
  } else if (mode === 'dsl' && state.remoteSteps.some((step) => step.id === stepId && step.type !== 'ai')) {
    state.selectedDslStepId = stepId;
  }
  state.remoteExampleTab = normalizeRemoteExampleTab(stateFromTab.remoteExampleTab);
}

function previewWorkspaceTabStateFor(type, targetId, providedTab = null) {
  const tabId = previewWorkspaceTabId(type, targetId);
  if (providedTab?.id === tabId) return providedTab;
  return state.previewOpenTabs.find((tab) => tab.id === tabId) || null;
}

function restorePreviewBodyTabFromTabState(tabState = null) {
  if (!tabState?.bodyTab) return;
  state.previewBodyTab = normalizePreviewBodyTab(tabState.bodyTab);
}

async function saveCurrentRule(options = {}) {
  if (state.autoSaveInFlight) {
    state.autoSaveQueued = true;
    await state.autoSavePromise;
    return;
  }
  window.clearTimeout(state.autoSaveTimer);
  const startedAt = ++state.autoSaveCounter;
  state.autoSaveInFlight = true;
  const task = (async () => {
    if (state.selectedRemoteRuleId) {
      await saveCurrentRemoteRule({ startedAt, manual: options.manual === true });
    } else if (state.selectedRuleId) {
      await saveCurrentLocalRule({ startedAt, manual: options.manual === true });
    }
  })();
  state.autoSavePromise = task;
  try {
    await task;
  } finally {
    state.autoSaveInFlight = false;
    if (state.autoSavePromise === task) {
      state.autoSavePromise = null;
    }
    if (state.autoSaveQueued) {
      state.autoSaveQueued = false;
      if (!state.manualRuleSaveRequired) {
        scheduleRuleAutoSave({ immediate: true });
      }
    }
    updateManualRuleSaveButton();
  }
}

async function saveCurrentRuleManually() {
  try {
    if (state.previewMode === 'capture') {
      await saveCurrentCaptureMergeRuleManually();
      return;
    }
    await saveCurrentRule({ manual: true });
  } catch (error) {
    console.error(error);
    const message = ruleConflictMessage(error) || error?.message || t('actions.saveFailed');
    window.alert(message);
    markManualRuleSaveRequired(message, state.previewMode === 'capture' ? 'capture-merge' : '');
  }
}

async function flushCurrentRuleAutoSave() {
  if (!(state.selectedRuleId || state.selectedRemoteRuleId)) return;
  if (!(state.previewMode === 'rule' || state.previewMode === 'remote')) return;
  window.clearTimeout(state.autoSaveTimer);
  if (state.autoSaveInFlight) {
    await state.autoSavePromise;
    window.clearTimeout(state.autoSaveTimer);
    state.autoSaveQueued = false;
  }
  if (state.manualRuleSaveRequired) return;
  if (editorStateChanged(state.savedEditorState, currentEditorState())) {
    await saveCurrentRule({ immediate: true });
  }
}

async function saveCurrentLocalRule({ startedAt, manual = false } = {}) {
  if (!state.selectedRuleId) return;
  const ruleId = state.selectedRuleId;
  const bodyTab = state.previewBodyTab;
  const activeBody = bodyTab === 'request'
    ? state.previewRequest
    : bodyTab === 'response'
      ? state.previewResponse
      : null;
  const rule = state.rules.find((item) => item.id === ruleId);
  if (!rule) return;

  const payload = {
    query: normalizeQuery(els.ruleQueryInput.value),
    queryMode: rule.queryMode === 'ignore' ? 'ignore' : 'exact'
  };

  if (activeBody && !activeBody.readOnly) {
    if (bodyTab === 'request') {
      payload.requestBody = els.editor.value;
    } else {
      payload.responseBody = els.editor.value;
    }
  }

  if (!manual) {
    const conflict = localRuleConflictForPayload(rule, payload);
    if (conflict) {
      markManualRuleSaveRequired(ruleConflictText(conflict));
      return;
    }
  }

  let result;
  try {
    result = await putJson(`/api/rules/${ruleId}/editor`, payload);
  } catch (error) {
    if (isRuleConflictError(error)) {
      markManualRuleSaveRequired(ruleConflictMessage(error));
      if (manual) window.alert(ruleConflictMessage(error));
      return;
    }
    throw error;
  }
  if (state.selectedRuleId !== ruleId || startedAt !== state.autoSaveCounter) return;
  clearManualRuleSaveRequired();
  showRuleWarning(result);
  replaceRuleInState(result.rule);
  captureSavedEditorState();
  renderRules();
  renderCaptures();
}

async function saveCurrentRemoteRule({ startedAt, manual = false } = {}) {
  if (!state.selectedRemoteRuleId) return;
  const ruleId = state.selectedRemoteRuleId;
  const rule = selectedRemoteRule();
  if (!manual) {
    const conflict = remoteRuleConflictForEditor(rule);
    if (conflict) {
      markManualRuleSaveRequired(ruleConflictText(conflict));
      return;
    }
  }
  let result;
  try {
    result = await persistCurrentRemoteEditor({ allowIncompleteDsl: true });
  } catch (error) {
    if (isRuleConflictError(error)) {
      markManualRuleSaveRequired(ruleConflictMessage(error));
      if (manual) window.alert(ruleConflictMessage(error));
      return;
    }
    throw error;
  }
  if (state.selectedRemoteRuleId !== ruleId || startedAt !== state.autoSaveCounter) return;
  clearManualRuleSaveRequired();
  if (result?.rule) {
    showRuleWarning(result);
    replaceRemoteRuleInState(result.rule);
  }
  captureSavedEditorState();
  renderRemoteRules();
  renderCaptures();
  scheduleRemotePreview();
}

function replaceRuleInState(rule) {
  if (!rule?.id) return;
  const index = state.rules.findIndex((item) => item.id === rule.id);
  if (index >= 0) {
    state.rules[index] = rule;
  } else {
    state.rules = [rule, ...state.rules];
  }
  setEditorNote(displayNoteText(rule));
  if (state.previewMode === 'rule' && state.selectedRuleId === rule.id) {
    updateRuleEditorTitle(rule);
    syncRuleOptionControls(rule);
  }
  updatePreviewWorkspaceTab(rule.id, 'rule');
}

function replaceRemoteRuleInState(rule) {
  if (!rule?.id) return;
  const index = state.remoteRules.findIndex((item) => item.id === rule.id);
  if (index >= 0) {
    state.remoteRules[index] = rule;
  } else {
    state.remoteRules = [rule, ...state.remoteRules];
  }
  setEditorNote(displayNoteText(rule));
  if (state.previewMode === 'remote' && state.selectedRemoteRuleId === rule.id) {
    updateRuleEditorTitle(rule);
    syncRuleOptionControls(rule);
  }
  updatePreviewWorkspaceTab(rule.id, 'remote');
}

function updatePreviewWorkspaceTab(targetId, type) {
  const tab = state.previewOpenTabs.find((item) => item.id === previewWorkspaceTabId(type, targetId));
  if (!tab) return;
  tab.title = previewWorkspaceTabTitleFor(tab);
  renderPreviewWorkspaceTabs();
}

function markManualRuleSaveRequired(message, scope = '') {
  state.manualRuleSaveRequired = true;
  state.manualRuleSaveMessage = message || t('merge.manualSaveDefault');
  state.manualRuleSaveScope = scope;
  updateManualRuleSaveButton();
}

function clearManualRuleSaveRequired() {
  state.manualRuleSaveRequired = false;
  state.manualRuleSaveMessage = '';
  state.manualRuleSaveScope = '';
  updateManualRuleSaveButton();
}

function isRuleConflictError(error) {
  return error?.status === 409 && error?.data?.code === 'RULE_MATCH_CONFLICT';
}

function ruleConflictMessage(error) {
  if (!isRuleConflictError(error)) return '';
  return error.data?.message || error.data?.error || t('merge.conflictSave');
}

function ruleConflictText(conflict) {
  const target = conflict?.rule ? ruleDisplayTitle(conflict.rule) : t('merge.otherRule');
  return t('merge.duplicateWithRule', { target });
}

function ruleDisplayTitle(rule = {}) {
  const method = String(rule.method || '').toUpperCase() || '*';
  const host = normalizeHostInput(rule.host || '');
  const path = String(rule.path || '/');
  return `${method} ${host}${path}`;
}

function localRuleConflictForPayload(rule, payload = {}) {
  const candidate = {
    ...rule,
    enabled: Boolean(els.ruleOptionEnabled.checked),
    query: Object.hasOwn(payload, 'query') ? normalizeQuery(payload.query) : rule.query,
    queryMode: Object.hasOwn(payload, 'queryMode') ? payload.queryMode : rule.queryMode
  };
  if (Object.hasOwn(payload, 'requestBody')) {
    Object.assign(candidate, requestBodyFieldsFromTextForRule(payload.requestBody, rule.requestContentType || rule.requestHeaders?.['content-type'] || ''));
  }
  return duplicateRuleForCandidate(candidate);
}

function remoteRuleConflictForEditor(rule) {
  if (!rule || isGlobalRemoteRule(rule)) return null;
  const candidate = {
    ...rule,
    enabled: Boolean(els.ruleOptionEnabled.checked),
    query: normalizeQuery(els.ruleQueryInput.value),
    queryMode: rule.queryMode === 'ignore' ? 'ignore' : 'exact',
    requestBodyMode: rule.requestBodyMode === 'ignore' ? 'ignore' : 'exact'
  };
  if (state.previewBodyTab === 'request' && !els.editor.readOnly) {
    Object.assign(candidate, requestBodyFieldsFromTextForRule(els.editor.value, rule.requestContentType || ''));
  }
  return duplicateRuleForCandidate(candidate);
}

function duplicateRuleForCandidate(candidate) {
  if (!candidate || candidate.scope === 'global') return null;
  if (candidate.enabled === false) return null;
  const candidates = [
    ...state.rules,
    ...state.remoteRules.filter((rule) => !isGlobalRemoteRule(rule))
  ];
  const rule = candidates.find((item) => (
    item?.id !== candidate.id &&
    item?.enabled !== false &&
    sameBaseRuleTarget(item, candidate) &&
    sameRuleCoverageForDuplicate(item, candidate)
  ));
  return rule ? { rule } : null;
}

function sameRuleCoverageForDuplicate(rule, target) {
  return ruleCoversRuleForDuplicate(rule, target) &&
    ruleCoversRuleForDuplicate(target, rule);
}

function ruleCoversRuleForDuplicate(containerRule, containedRule) {
  if (!ruleQueryCoversForDuplicate(containerRule, containedRule)) return false;
  if (!ruleBodyCoversForDuplicate(containerRule, containedRule)) return false;
  return true;
}

function ruleQueryCoversForDuplicate(containerRule, containedRule) {
  if (containerRule.queryMode === 'ignore') return true;
  if (containedRule.queryMode === 'ignore') return false;
  return queryIncludesRequired(containedRule.query || '', containerRule.query || '');
}

function ruleBodyCoversForDuplicate(containerRule, containedRule) {
  if (!shouldMatchRuleBodyForDuplicate(containerRule)) return true;
  if (!shouldMatchRuleBodyForDuplicate(containedRule)) return false;
  return requestBodyIncludesRequired(containedRule, containerRule);
}

function shouldMatchRuleBodyForDuplicate(rule) {
  if (rule?.scope === 'global') return false;
  if (!methodHasRequestBody(rule?.method) || rule?.requestBodyMode === 'ignore') return false;
  if (isRemoteRuleForDuplicate(rule)) {
    return Boolean(rule.requestBodyHash || rule.requestBodyBase64 || Number(rule.requestBodySize || 0));
  }
  return true;
}

function isRemoteRuleForDuplicate(rule) {
  return rule?.scope === 'global' ||
    Object.hasOwn(rule || {}, 'script') ||
    Object.hasOwn(rule || {}, 'steps') ||
    Object.hasOwn(rule || {}, 'exampleCapture');
}

function requestBodyFieldsFromTextForRule(body, contentType = '') {
  const bodyText = String(body || '');
  const resolvedContentType = String(contentType || (bodyText ? 'text/plain; charset=utf-8' : ''));
  const requestBodyBase64 = bodyToBase64(bodyText);
  return {
    requestContentType: resolvedContentType,
    requestBodyBase64,
    requestBodySize: new TextEncoder().encode(bodyText).length,
    requestBodyHash: ''
  };
}

function syncRuleOptionControls(rule) {
  if (!rule) return;
  if (isGlobalRemoteRule(rule)) {
    els.globalRemoteEnabled.checked = rule.enabled !== false;
    return;
  }
  els.ruleOptionEnabled.checked = rule.enabled !== false;
  els.ruleOptionQuery.checked = rule.queryMode === 'exact';
  els.ruleOptionBodyRow.hidden = !methodHasRequestBody(rule.method);
  els.ruleOptionBody.checked = rule.requestBodyMode !== 'ignore';
}

function updateRuleEditorTitle(rule) {
  refreshEditorTitle();
}

async function toggleRuleEnabled(ruleId, enabled) {
  const result = await patchRuleWithConflictHandling(`/api/rules/${ruleId}`, { enabled }, { manualFallback: false });
  if (!result) return;
  showRuleWarning(result);
  if (result?.rule) replaceRuleInState(result.rule);
  renderRules();
  captureSavedEditorState();
}

async function toggleRuleQuery(ruleId, useQuery) {
  const result = await patchRuleWithConflictHandling(
    `/api/rules/${ruleId}`,
    { queryMode: useQuery ? 'exact' : 'ignore' },
    { manualFallback: false }
  );
  if (!result) return;
  showRuleWarning(result);
  if (result?.rule) replaceRuleInState(result.rule);
  renderRules();
  captureSavedEditorState();
}

async function toggleRuleBody(ruleId, useBody) {
  const result = await patchRuleWithConflictHandling(
    `/api/rules/${ruleId}`,
    { requestBodyMode: useBody ? 'exact' : 'ignore' },
    { manualFallback: false }
  );
  if (!result) return;
  showRuleWarning(result);
  if (result?.rule) replaceRuleInState(result.rule);
  renderRules();
  captureSavedEditorState();
}

async function toggleRemoteRuleEnabled(ruleId, enabled) {
  const result = await patchRuleWithConflictHandling(`/api/remote-rules/${ruleId}`, { enabled }, { manualFallback: false });
  if (!result) return;
  showRuleWarning(result);
  if (result?.rule) replaceRemoteRuleInState(result.rule);
  renderRemoteRules();
  captureSavedEditorState();
}

async function toggleRemoteRuleQuery(ruleId, useQuery) {
  const result = await patchRuleWithConflictHandling(
    `/api/remote-rules/${ruleId}`,
    { queryMode: useQuery ? 'exact' : 'ignore' },
    { manualFallback: false }
  );
  if (!result) return;
  showRuleWarning(result);
  if (result?.rule) replaceRemoteRuleInState(result.rule);
  renderRemoteRules();
  captureSavedEditorState();
}

async function toggleRemoteRuleBody(ruleId, useBody) {
  const result = await patchRuleWithConflictHandling(
    `/api/remote-rules/${ruleId}`,
    { requestBodyMode: useBody ? 'exact' : 'ignore' },
    { manualFallback: false }
  );
  if (!result) return;
  showRuleWarning(result);
  if (result?.rule) replaceRemoteRuleInState(result.rule);
  renderRemoteRules();
  captureSavedEditorState();
}

async function patchRuleWithConflictHandling(url, payload, options = {}) {
  try {
    const result = await patchJson(url, payload);
    clearManualRuleSaveRequired();
    return result;
  } catch (error) {
    if (isRuleConflictError(error)) {
      const message = ruleConflictMessage(error);
      if (options.manualFallback !== false) {
        markManualRuleSaveRequired(message);
      } else {
        updateManualRuleSaveButton();
      }
      window.alert(message);
      syncRuleOptionControls(selectedRemoteRule() || state.rules.find((rule) => rule.id === state.selectedRuleId));
      return null;
    }
    throw error;
  }
}

function showRuleWarning(result) {
  const warning = String(result?.warning || '').trim();
  if (!warning) return;
  const ruleId = result?.rule?.id || '';
  const key = `${ruleId}\u0000${warning}`;
  if (shownRuleWarnings.get(ruleId) === key) return;
  shownRuleWarnings.set(ruleId, key);
  window.alert(warning);
}

async function deleteRule(ruleId) {
  const replacementId = replacementRuleIdAfterDelete('local', ruleId);
  await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
  await applyDeletedRule('local', ruleId, { replacementId });
  await reloadRules();
}

async function deleteSelectedRule() {
  if (state.selectedRemoteRuleId) {
    const ruleId = state.selectedRemoteRuleId;
    const replacementId = replacementRuleIdAfterDelete('remote', ruleId);
    await fetch(`/api/remote-rules/${ruleId}`, { method: 'DELETE' });
    await applyDeletedRule('remote', ruleId, { replacementId });
    await reloadRules();
    return;
  }

  if (!state.selectedRuleId) return;
  await deleteRule(state.selectedRuleId);
}

async function applyDeletedRule(kind, ruleId, options = {}) {
  if (!ruleId) return;
  const tabType = rulePreviewTabType(kind);
  const tabId = previewWorkspaceTabId(tabType, ruleId);
  const wasSelected = kind === 'remote'
    ? state.selectedRemoteRuleId === ruleId || state.activePreviewTabId === tabId
    : state.selectedRuleId === ruleId || state.activePreviewTabId === tabId;
  const replacementId = options.replacementId ?? replacementRuleIdAfterDelete(kind, ruleId);

  if (kind === 'remote') {
    state.remoteRules = state.remoteRules.filter((rule) => rule.id !== ruleId);
  } else {
    state.rules = state.rules.filter((rule) => rule.id !== ruleId);
  }
  removePreviewWorkspaceTab(tabId);

  if (wasSelected) {
    clearCurrentPreviewSelection();
    setActiveTab(kind === 'remote' ? 'remote' : 'rules', { autoSelect: false });
  }
  renderRules();
  renderRemoteRules();
  renderPreviewWorkspaceTabs();

  if (wasSelected && replacementId && ruleExistsForKind(kind, replacementId)) {
    await selectRuleForKind(kind, replacementId);
    return;
  }
  if (wasSelected) {
    clearPreview();
    renderPreviewWorkspaceTabs();
  }
}

function replacementRuleIdAfterDelete(kind, ruleId) {
  const rules = kind === 'remote'
    ? visibleRemoteRulesForActiveWorkspace()
    : visibleLocalRulesForActiveWorkspace();
  const index = rules.findIndex((rule) => rule.id === ruleId);
  const remaining = rules.filter((rule) => rule.id !== ruleId);
  if (!remaining.length) return '';
  if (index < 0) return remaining[0]?.id || '';
  return (remaining[Math.min(index, remaining.length - 1)] || remaining[remaining.length - 1])?.id || '';
}

function removePreviewWorkspaceTab(tabId) {
  if (!tabId || !Array.isArray(state.previewOpenTabs)) return;
  const wasActive = state.activePreviewTabId === tabId;
  const beforeLength = state.previewOpenTabs.length;
  state.previewOpenTabs = state.previewOpenTabs.filter((tab) => tab.id !== tabId);
  if (beforeLength === state.previewOpenTabs.length) return;
  if (wasActive) {
    const pane = livePreviewPane();
    const key = previewPaneCacheKey(tabId);
    if (pane && activePreviewPaneCacheKey === key) {
      pane.remove();
      activePreviewPaneCacheKey = '';
    }
  }
  removeCachedPreviewPane(tabId);
  prunePreviewWorkspaceTabHistory();
  if (wasActive) {
    state.activePreviewTabId = '';
  }
  persistPreviewWorkspaceAndSettings();
}

function rulePreviewTabType(kind) {
  return kind === 'remote' ? 'remote' : 'rule';
}

function ruleExistsForKind(kind, ruleId) {
  const rules = kind === 'remote' ? state.remoteRules : state.rules;
  return rules.some((rule) => rule.id === ruleId);
}

function selectRuleForKind(kind, ruleId) {
  return kind === 'remote' ? selectRemoteRule(ruleId) : selectRule(ruleId);
}

function clearPreview() {
  if (!livePreviewPane()) {
    ensureFreshPreviewPane('');
  } else {
    rebindPreviewPaneElements();
    bindPreviewPaneEvents();
  }
  state.selectedCaptureDetail = null;
  state.selectedRuleId = null;
  state.selectedRemoteRuleId = null;
  state.remoteSteps = [];
  state.selectedAiStepId = '';
  state.remoteExample = null;
  state.remoteExampleScroll = {};
  state.savedEditorState = null;
  window.clearTimeout(state.remotePreviewTimer);
  setGlobalRemoteHeadEditorVisible(false);
  els.editorTitle.textContent = '';
  els.captureTimeDisplay.hidden = true;
  els.captureTimeDisplay.textContent = '';
  els.captureQueryEditor.hidden = true;
  els.captureMergeQueryRow?.closest('.query-merge-bar')?.setAttribute('hidden', '');
  els.captureBodyMergeEditor.hidden = true;
  els.ruleOptionEditor.hidden = true;
  els.ruleBodyMatchEditor.hidden = true;
  els.responseBodyToolbar.hidden = true;
  els.editorPath.textContent = '';
  setEditorNote('');
  els.captureQueryInput.value = '';
  els.captureQueryOriginal.hidden = true;
  els.captureQueryOriginal.textContent = '';
  els.ruleQueryInput.value = '';
  els.remoteExamplePreview.textContent = '';
  els.remoteExampleDivider.hidden = false;
  els.remoteRuleLower.hidden = false;
  els.remoteExampleDiff.hidden = true;
  els.remoteExampleDiff.innerHTML = '';
  els.captureOverview.hidden = true;
  els.captureOverview.innerHTML = '';
  els.captureDiffView.hidden = true;
  els.captureDiffView.innerHTML = '';
  els.bodyHighlight.hidden = true;
  els.bodyHighlight.innerHTML = '';
  els.captureBodyDivider.hidden = true;
  renderCaptureBodyOriginalPreview(null);
  setPreviewBodies({
    mode: 'empty',
    tabs: [],
    overview: null,
    requestHead: { body: '', readOnly: true },
    responseHead: { body: '', readOnly: true },
    response: { body: '', readOnly: false },
    request: { body: '', readOnly: true }
  });
}

function setPreviewBodies({ mode, tabs = [], defaultTab = 'response', preserveCurrentTab = true, overview, requestHead, responseHead, response, request }) {
  const availableTabs = tabs.length ? tabs : ['response'];
  const nextBodyTab = preserveCurrentTab && availableTabs.includes(state.previewBodyTab)
    ? state.previewBodyTab
    : defaultPreviewBodyTab(availableTabs, defaultTab);
  state.previewMode = mode;
  state.previewTabs = availableTabs;
  state.previewShowsBodyTabs = Boolean(tabs.length);
  state.previewOverview = overview;
  state.previewRequestHead = requestHead;
  state.previewResponseHead = responseHead;
  state.previewResponse = response;
  state.previewRequest = request;
  setPreviewBodyTab(nextBodyTab, { preserveCurrentEditor: false });
  setPreviewMode(mode);
}

function defaultPreviewBodyTab(availableTabs = [], preferredTab = 'response') {
  if (availableTabs.includes(preferredTab)) return preferredTab;
  if (availableTabs.includes('response')) return 'response';
  return availableTabs[0] || 'response';
}

function setPreviewBodyTab(tab, options = {}) {
  const preserveCurrentEditor = options.preserveCurrentEditor !== false;
  if (state.previewBodyTab !== tab && state.previewFindOpen) {
    closePreviewFindBar();
  }
  if (preserveCurrentEditor && state.previewMode === 'rule') {
    updateActivePreviewBodyFromEditor();
  }
  if (preserveCurrentEditor && state.previewMode === 'remote' && state.previewBodyTab === 'request') {
    state.previewRequest = {
      ...(state.previewRequest || {}),
      body: els.editor.value
    };
  }
  state.previewBodyTab = tab;
  const activePreviewTab = activePreviewTabState();
  if (activePreviewTab && activePreviewTab.id === selectedPreviewWorkspaceTabId()) {
    activePreviewTab.bodyTab = tab;
    persistPreviewWorkspaceAndSettings();
  }
  const isOverview = tab === 'overview';
  const isRequestHead = tab === 'requestHead';
  const isResponseHead = tab === 'responseHead';
  const isQuery = tab === 'query';
  const isRequest = tab === 'request';
  const body = isRequestHead
    ? state.previewRequestHead
    : isResponseHead
      ? state.previewResponseHead
      : isRequest
        ? state.previewRequest
        : state.previewResponse;
  const tabs = new Set(state.previewTabs || []);
  const diff = captureDiffForTab(tab);

  const shouldShowPreviewTabs = state.previewShowsBodyTabs && tabs.size > 1;
  els.previewTabs.hidden = !shouldShowPreviewTabs;
  els.overviewTab.hidden = !tabs.has('overview');
  els.requestHeadTab.hidden = !tabs.has('requestHead');
  els.responseHeadTab.hidden = !tabs.has('responseHead');
  els.queryTab.hidden = !tabs.has('query');
  els.requestBodyTab.hidden = !tabs.has('request');
  els.responseBodyTab.hidden = !tabs.has('response');
  els.overviewTab.classList.toggle('active', isOverview);
  els.requestHeadTab.classList.toggle('active', isRequestHead);
  els.responseHeadTab.classList.toggle('active', isResponseHead);
  els.queryTab.classList.toggle('active', isQuery);
  const remoteRuleStepMode = Boolean(selectedAiStep() || selectedDslStep());
  els.responseBodyTab.classList.toggle('active', !remoteRuleStepMode && !isOverview && !isRequestHead && !isResponseHead && !isQuery && !isRequest);
  els.requestBodyTab.classList.toggle('active', isRequest);
  els.overviewTab.setAttribute('aria-selected', String(isOverview));
  els.requestHeadTab.setAttribute('aria-selected', String(isRequestHead));
  els.responseHeadTab.setAttribute('aria-selected', String(isResponseHead));
  els.queryTab.setAttribute('aria-selected', String(isQuery));
  els.responseBodyTab.setAttribute('aria-selected', String(!remoteRuleStepMode && !isOverview && !isRequestHead && !isResponseHead && !isQuery && !isRequest));
  els.requestBodyTab.setAttribute('aria-selected', String(isRequest));

  if (isOverview) {
    renderCaptureOverview(state.previewOverview);
    els.captureOverview.hidden = false;
    els.captureDiffView.hidden = true;
    els.captureDiffView.innerHTML = '';
    setBodyEditorStackVisible(false);
    setBodyTextareaVisible(false);
    els.bodyHighlight.hidden = true;
    els.bodyHighlight.innerHTML = '';
    renderCaptureBodyOriginalPreview(null);
    els.editor.value = '';
    updateFormatBodyButton();
  } else if (diff) {
    els.captureOverview.hidden = true;
    els.captureOverview.innerHTML = '';
    renderCaptureDiff(diff);
    els.captureDiffView.hidden = false;
    setBodyEditorStackVisible(false);
    setBodyTextareaVisible(false);
    els.bodyHighlight.hidden = true;
    els.bodyHighlight.innerHTML = '';
    renderCaptureBodyOriginalPreview(null);
    els.editor.value = '';
    updateFormatBodyButton();
  } else {
    els.captureOverview.hidden = true;
    els.captureOverview.innerHTML = '';
    els.captureDiffView.hidden = true;
    els.captureDiffView.innerHTML = '';
    let editorBody = body;
    if (state.previewMode === 'capture' && isRequest) {
      const capture = state.selectedCaptureDetail?.id === state.selectedCaptureId
        ? state.selectedCaptureDetail
        : selectedCaptureSummary();
      const options = captureMergeOptionsForCapture(capture);
      const bodyTemplate = String(options.bodyTemplate || '');
      const requestBody = requestBodyText(capture?.requestBody) || body?.body || '';
      editorBody = {
        ...(body || {}),
        body: options.body === true ? bodyTemplate : requestBody,
        readOnly: !shouldMergeCaptureList() || options.body !== true
      };
      state.previewRequest = editorBody;
      renderCaptureBodyOriginalPreview(capture, options);
      if (options.body === true) {
        els.editor.value = editorBody.body || '';
        els.editor.disabled = false;
        els.editor.readOnly = Boolean(editorBody.readOnly);
        renderCaptureBodyDeleteEditor(capture, options);
        setBodyTextareaVisible(false);
        updateFormatBodyButton();
        setPreviewMode(state.previewMode);
        syncCurrentPreviewWorkspaceTabState();
        persistPreviewWorkspaceAndSettings();
        return;
      }
      els.bodyHighlight.classList.remove('capture-body-delete-editor');
    } else {
      renderCaptureBodyOriginalPreview(null);
      els.bodyHighlight.classList.remove('capture-body-delete-editor');
    }
    els.editor.value = editorBody?.body || '';
    els.editor.disabled = state.previewMode === 'empty' || isQuery;
    els.editor.readOnly = Boolean(editorBody?.readOnly);
    renderBodyCodePreview(editorBody, tab);
  }
  setPreviewMode(state.previewMode);
  syncCurrentPreviewWorkspaceTabState();
  persistPreviewWorkspaceAndSettings();
}

function setPreviewMode(mode) {
  state.previewMode = mode;
  const isCapture = mode === 'capture';
  const isRule = mode === 'rule';
  const isRemote = mode === 'remote';
  const selectedRemote = isRemote ? selectedRemoteRule() : null;
  const isGlobalRemote = isGlobalRemoteRule(selectedRemote);
  if (!(isRemote && state.previewBodyTab === 'response')) {
    state.selectedAiStepId = '';
    state.selectedDslStepId = '';
  }
  els.requestHeadTab.textContent = t('tabs.requestHead');
  els.responseHeadTab.textContent = t('tabs.responseHead');
  els.responseBodyTab.dataset.i18n = isRemote ? 'tabs.modifyRules' : 'tabs.responseBody';
  els.queryTab.textContent = t('tabs.query');
  els.responseBodyTab.textContent = isRemote ? t('tabs.modifyRules') : t('tabs.responseBody');
  els.requestBodyTab.textContent = t('tabs.requestBody');
  if (isRemote && state.previewBodyTab === 'response') {
    els.bodyHighlight.hidden = true;
    els.bodyHighlight.innerHTML = '';
    els.editor.classList.remove('preview-code-active');
  }
  els.captureQueryEditor.hidden = !(isCapture && state.previewBodyTab === 'query');
  els.captureQueryInput.disabled = !(isCapture && state.previewBodyTab === 'query');
  els.captureBodyMergeEditor.hidden = true;
  els.ruleQueryEditor.hidden = !(isRule || isRemote) || isGlobalRemote || state.previewBodyTab !== 'query';
  els.ruleQueryInput.disabled = !(isRule || isRemote) || isGlobalRemote || state.previewBodyTab !== 'query';
  els.responseBodyToolbar.hidden = !shouldShowResponseBodyToolbar();
  els.remoteRuleEditor.hidden = !(isRemote && state.previewBodyTab === 'response');
  els.remoteRuleToolbar.hidden = !(isRemote && state.previewBodyTab === 'response');
  if (!hasActiveCaptureDiff()) {
    const showEditorStack = !(state.previewBodyTab === 'overview' || state.previewBodyTab === 'query' || (isRemote && state.previewBodyTab === 'response'));
    setBodyEditorStackVisible(showEditorStack);
    if (showEditorStack && els.bodyHighlight.classList.contains('capture-body-delete-editor')) {
      setBodyTextareaVisible(false);
    } else if (showEditorStack && els.editor.classList.contains('preview-code-active')) {
      setBodyTextareaVisible(false);
    } else if (showEditorStack) {
      setBodyTextareaVisible(true);
    }
  }
  updateCaptureMergeEditor();
  updateRuleOptionEditor();
  updateFormatBodyButton();
  refreshPreviewFindForCurrentTab();
  updatePreviewChrome();
  renderRemoteRuleEditorMode();
  renderRemoteDslRows();
}

function updatePreviewChrome() {
  const mode = state.previewMode;
  const isCapture = mode === 'capture';
  const isRule = mode === 'rule';
  const isRemote = mode === 'remote';
  const selectedRemote = isRemote ? selectedRemoteRule() : null;
  const isGlobalRemote = isGlobalRemoteRule(selectedRemote);
  const canCopyCurl = isCapture || isRule || (isRemote && !isGlobalRemote);

  els.previewTitle.textContent = isCapture
    ? t('preview.request')
    : isRule
      ? t('preview.localEdit')
      : isRemote
        ? (isGlobalRemote ? t('preview.globalRemote') : t('preview.remoteEdit'))
        : t('preview.title');

  els.localBtn.hidden = !isCapture;
  els.localBtn.disabled = !isCapture;
  els.localBtn.textContent = t('context.createLocal');
  setInstantTooltip(els.localBtn, t('local.actionTip'));

  els.remoteBtn.hidden = !isCapture;
  els.remoteBtn.disabled = !isCapture;
  const hasRemoteRule = captureHasMatchingRemoteRule();
  els.remoteBtn.textContent = hasRemoteRule ? t('context.updateRemote') : t('context.createRemote');
  setInstantTooltip(els.remoteBtn, hasRemoteRule
    ? t('remote.updateTip')
    : t('remote.actionTip'));

  els.copyCurlBtn.hidden = !canCopyCurl;
  els.copyCurlBtn.disabled = !canCopyCurl;
  setInstantTooltip(els.copyCurlBtn, t('actions.copyCurlTip'));

  els.repeatBtn.hidden = !canCopyCurl;
  els.repeatBtn.disabled = !canCopyCurl;
  setInstantTooltip(els.repeatBtn, t('actions.repeatTip'));

  const canEditNote = Boolean(currentNoteTarget());
  els.noteBtn.hidden = !(isCapture || isRule || isRemote);
  els.noteBtn.disabled = !canEditNote;
  setInstantTooltip(els.noteBtn, (isRule || isRemote)
    ? t('note.ruleTip')
    : t('note.apiTip'));

  els.deleteRuleBtn.hidden = !(isRule || isRemote);
  els.deleteRuleBtn.disabled = !(isRule || isRemote);
  setInstantTooltip(els.deleteRuleBtn, t('actions.deleteRuleTip'));
  renderDetailNoteButton();
  renderAskAiButton();
  refreshEditorTitle();
}

function refreshEditorTitle() {
  if (!els.editorTitle) return;
  els.editorTitle.hidden = false;
  els.editorPath.hidden = false;

  const hasOtherHeaderContent = Boolean(
    textContent(els.editorPath) ||
    (!els.globalRemoteRuleEditor.hidden) ||
    (!els.editorNote.hidden && textContent(els.editorNote)) ||
    (!els.analyzeNoteBtn.hidden) ||
    (!els.askAiBtn.hidden)
  );

  if (hasOtherHeaderContent) {
    els.editorTitle.textContent = '';
    return;
  }

  if (state.previewMode === 'empty') {
    els.editorTitle.textContent = t('preview.emptyTitle');
    return;
  }

  els.editorTitle.textContent = fallbackEditorTitleForMode();
}

function fallbackEditorTitleForMode() {
  if (state.previewMode === 'capture') return t('capture.requestDetail');
  if (state.previewMode === 'rule') return t('preview.localEdit');
  if (state.previewMode === 'remote') {
    const rule = selectedRemoteRule();
    return isGlobalRemoteRule(rule) ? t('preview.globalRemote') : t('preview.remoteEdit');
  }
  return '';
}

function textContent(element) {
  return String(element?.textContent || '').trim();
}

function captureDiffForTab(tab) {
  if (state.previewMode !== 'capture') return null;
  const remoteDiff = state.selectedCaptureDetail?.remoteDiff || {};
  const diff = remoteDiff[tab] || legacyHeadDiff(remoteDiff, tab);
  if (!diff) return null;
  const before = tab === 'query'
    ? formatQueryPreview(diff.before ?? '')
    : String(diff.before ?? '');
  const after = tab === 'query'
    ? formatQueryPreview(diff.after ?? '')
    : String(diff.after ?? '');
  if (!before.trim() && !after.trim()) return null;
  if (before === after) return null;
  return { before, after };
}

function legacyHeadDiff(remoteDiff, tab) {
  if (!remoteDiff?.head) return null;
  if (tab === 'requestHead') return remoteDiff.head;
  return null;
}

function hasActiveCaptureDiff() {
  return Boolean(captureDiffForTab(state.previewBodyTab));
}

function renderCaptureDiff(diff) {
  renderTextDiff(diff, {
    container: els.captureDiffView,
    beforeTitle: t('diff.before'),
    afterTitle: t('diff.after')
  });
}

function renderTextDiff(diff, options = {}) {
  const container = options.container || els.captureDiffView;
  const beforeTitle = options.beforeTitle || t('diff.before');
  const afterTitle = options.afterTitle || t('diff.after');
  const prefix = String(options.prefix || '');
  const before = String(diff.before ?? '');
  const after = String(diff.after ?? '');
  const languageKind = detectDiffLanguageKind(before, after);
  const renderOptions = { container, beforeTitle, afterTitle, prefix, before, after, languageKind };

  try {
    const rows = sideBySideDiffRows(before, after, languageKind);
    renderCaptureDiffRows(rows, renderOptions);
  } catch (error) {
    console.error(error);
    renderCaptureDiffRows(plainChangedDiffRows(before, after), renderOptions);
  }

  bindDiffScrollSync();
}

function plainChangedDiffRows(before, after) {
  return [{
    before: changedDiffCell(truncateDiffCellText(before), 'before'),
    after: changedDiffCell(truncateDiffCellText(after), 'after')
  }];
}

function renderCaptureDiffRows(rows, options = {}) {
  const container = options.container || els.captureDiffView;
  const beforeTitle = options.beforeTitle || t('diff.before');
  const afterTitle = options.afterTitle || t('diff.after');
  const prefix = String(options.prefix || '');
  const diffRowIndexes = changedDiffRowIndexes(rows);
  const hasChanges = diffRowIndexes.length > 0;
  container.tabIndex = 0;
  container.classList.toggle('diff-has-prefix', Boolean(prefix));
  container.innerHTML = `
    ${prefix ? `<div class="diff-prefix">${escapeHtml(prefix)}</div>` : ''}
    <div class="diff-title diff-title-before">
      <span class="diff-toolbar">
        <button class="diff-nav-btn diff-prev-btn" type="button" ${hasChanges ? '' : 'disabled'} aria-label="${escapeHtml(t('diff.prev'))}" title="${escapeHtml(t('diff.prev'))}">↑</button>
        <button class="diff-nav-btn diff-next-btn" type="button" ${hasChanges ? '' : 'disabled'} aria-label="${escapeHtml(t('diff.next'))}" title="${escapeHtml(t('diff.next'))}">↓</button>
        <button class="diff-count" type="button" ${hasChanges ? '' : 'disabled'} aria-label="${escapeHtml(t('diff.current'))}" title="${escapeHtml(t('diff.current'))}">${hasChanges ? `0/${diffRowIndexes.length}` : '0/0'}</button>
      </span>
      <button class="diff-title-copy" type="button" data-diff-copy-side="before">${escapeHtml(beforeTitle)}</button>
    </div>
    <div class="diff-title diff-title-after">
      <button class="diff-title-copy" type="button" data-diff-copy-side="after">${escapeHtml(afterTitle)}</button>
    </div>
    <div class="diff-body">
      ${rows.map((row, index) => `
        <div class="diff-row${isChangedDiffRow(row) ? ' is-diff-row' : ''}"${isChangedDiffRow(row) ? ` data-diff-index="${diffRowIndexes.indexOf(index)}"` : ''}>
          ${diffCellHtml(row.before, 'before', options.languageKind)}
          ${diffCellHtml(row.after, 'after', options.languageKind)}
        </div>
      `).join('')}
    </div>
  `;
  bindDiffOmittedPreview(container, {
    before: options.before ?? '',
    after: options.after ?? '',
    beforeTitle,
    afterTitle,
    prefix
  });
  bindDiffTitleCopy(container, {
    before: options.before ?? '',
    after: options.after ?? '',
    beforeTitle,
    afterTitle
  });
  bindDiffNavigation(container);
}

function bindDiffTitleCopy(container, diff) {
  container.querySelectorAll('[data-diff-copy-side]').forEach((button) => {
    const side = button.dataset.diffCopySide === 'after' ? 'after' : 'before';
    const title = side === 'after' ? diff.afterTitle : diff.beforeTitle;
    const text = String(side === 'after' ? diff.after : diff.before);
    setInstantTooltip(button, t('diff.copyAll', { title }));
    button.addEventListener('click', async () => {
      try {
        await writeClipboard(text);
        flashButton(button, t('ai.copied'));
      } catch (error) {
        console.error(error);
        flashButton(button, t('diff.copyFailed'));
      }
    });
  });
}

function changedDiffRowIndexes(rows) {
  return rows.reduce((indexes, row, index) => {
    if (isChangedDiffRow(row)) indexes.push(index);
    return indexes;
  }, []);
}

function isChangedDiffRow(row) {
  return isChangedDiffCell(row?.before) || isChangedDiffCell(row?.after);
}

function isChangedDiffCell(cell) {
  return cell && cell.type !== 'same' && cell.type !== 'empty' && !cell.omitted;
}

function bindDiffNavigation(container) {
  const body = container.querySelector('.diff-body');
  const rows = [...container.querySelectorAll('.diff-row.is-diff-row')];
  const prevButton = container.querySelector('.diff-prev-btn');
  const nextButton = container.querySelector('.diff-next-btn');
  const count = container.querySelector('.diff-count');
  if (!body || !prevButton || !nextButton || !count) return;
  const updateSingleDiffMode = () => {
    const single = rows.length <= 1;
    prevButton.hidden = single;
    nextButton.hidden = single;
  };

  let activeIndex = rows.length ? 0 : -1;
  const sync = () => {
    updateSingleDiffMode();
    if (!rows.length) {
      prevButton.disabled = true;
      nextButton.disabled = true;
      count.disabled = true;
      count.textContent = '0/0';
      return;
    }
    rows.forEach((row, index) => row.classList.toggle('active-diff-row', index === activeIndex));
    prevButton.disabled = activeIndex <= 0;
    nextButton.disabled = activeIndex >= rows.length - 1;
    count.disabled = false;
    count.textContent = `${activeIndex + 1}/${rows.length}`;
  };
  const scrollToIndex = (index) => {
    if (!rows.length) return;
    activeIndex = Math.max(0, Math.min(rows.length - 1, index));
    sync();
    rows[activeIndex].scrollIntoView({ block: 'center', inline: 'nearest' });
  };

  prevButton.addEventListener('click', () => scrollToIndex(activeIndex - 1));
  nextButton.addEventListener('click', () => scrollToIndex(activeIndex + 1));
  count.addEventListener('click', () => scrollToIndex(activeIndex < 0 ? 0 : activeIndex));
  body.addEventListener('scroll', () => {
    if (!rows.length) return;
    const bodyRect = body.getBoundingClientRect();
    const center = bodyRect.top + bodyRect.height / 2;
    let nearestIndex = activeIndex;
    let nearestDistance = Infinity;
    rows.forEach((row, index) => {
      const rect = row.getBoundingClientRect();
      const rowCenter = rect.top + rect.height / 2;
      const distance = Math.abs(rowCenter - center);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestIndex !== activeIndex) {
      activeIndex = nearestIndex;
      sync();
    }
  }, { passive: true });
  sync();
}

function sideBySideDiffRows(before, after, languageKind = 'text') {
  if (languageKind === 'json') {
    const rows = jsonSemanticDiffRows(before, after);
    if (rows) return rows;
  }
  if (shouldUsePlainChangedDiffRows(before, after)) {
    return coarseLineDiffRows(before, after);
  }
  const changes = diffLines(before, after);
  const rows = [];

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    const next = changes[index + 1];
    if (change.removed && next?.added) {
      rows.push(...pairedDiffRows(change.value, next.value));
      index += 1;
      continue;
    }

    if (change.added) {
      rows.push(...singleSideDiffRows(change.value, 'after'));
      continue;
    }

    if (change.removed) {
      rows.push(...singleSideDiffRows(change.value, 'before'));
      continue;
    }

    for (const line of splitDiffLines(change.value)) {
      rows.push({
        before: { type: 'same', text: line },
        after: { type: 'same', text: line }
      });
    }
  }

  return rows;
}

function jsonSemanticDiffRows(before, after) {
  let beforeValue;
  let afterValue;
  try {
    beforeValue = JSON.parse(before);
    afterValue = JSON.parse(after);
  } catch {
    return null;
  }

  const rows = [];
  const changes = diffJson(beforeValue, afterValue);
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    const next = changes[index + 1];
    if (change.removed && next?.added) {
      rows.push(...pairedDiffRows(change.value, next.value));
      index += 1;
      continue;
    }

    if (change.added) {
      rows.push(...singleSideDiffRows(change.value, 'after'));
      continue;
    }

    if (change.removed) {
      rows.push(...singleSideDiffRows(change.value, 'before'));
      continue;
    }

    for (const line of splitDiffLines(change.value)) {
      rows.push({
        before: { type: 'same', text: line },
        after: { type: 'same', text: line }
      });
    }
  }
  return rows;
}

function shouldUsePlainChangedDiffRows(before, after) {
  if (before.length + after.length > maxDetailedDiffChars) return true;
  return splitDiffLines(before).length + splitDiffLines(after).length > maxDetailedDiffLines;
}

function coarseLineDiffRows(before, after) {
  const beforeLines = splitDiffLines(before);
  const afterLines = splitDiffLines(after);
  let prefixLength = 0;
  while (
    prefixLength < beforeLines.length &&
    prefixLength < afterLines.length &&
    beforeLines[prefixLength] === afterLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let beforeSuffixIndex = beforeLines.length - 1;
  let afterSuffixIndex = afterLines.length - 1;
  while (
    beforeSuffixIndex >= prefixLength &&
    afterSuffixIndex >= prefixLength &&
    beforeLines[beforeSuffixIndex] === afterLines[afterSuffixIndex]
  ) {
    beforeSuffixIndex -= 1;
    afterSuffixIndex -= 1;
  }

  const rows = [];
  const hiddenPrefixCount = Math.max(0, prefixLength - maxCoarseDiffContextLines);
  if (hiddenPrefixCount > 0) {
    rows.push(diffOmittedRows(hiddenPrefixCount));
  }
  for (let index = hiddenPrefixCount; index < prefixLength; index += 1) {
    rows.push({
      before: { type: 'same', text: beforeLines[index] },
      after: { type: 'same', text: afterLines[index] }
    });
  }

  const changedBefore = beforeLines.slice(prefixLength, beforeSuffixIndex + 1);
  const changedAfter = afterLines.slice(prefixLength, afterSuffixIndex + 1);
  const changedLength = Math.max(changedBefore.length, changedAfter.length);
  const visibleChangedLength = Math.min(changedLength, maxCoarseDiffChangedLines);
  for (let index = 0; index < visibleChangedLength; index += 1) {
    const beforeLine = changedBefore[index];
    const afterLine = changedAfter[index];
    rows.push({
      before: beforeLine === undefined
        ? { type: 'empty', text: '' }
        : changedDiffCell(beforeLine, 'before'),
      after: afterLine === undefined
        ? { type: 'empty', text: '' }
        : changedDiffCell(afterLine, 'after')
    });
  }
  const hiddenChangedCount = changedLength - visibleChangedLength;
  if (hiddenChangedCount > 0) {
    rows.push(diffOmittedRows(hiddenChangedCount));
  }

  const suffixStart = beforeSuffixIndex + 1;
  const visibleSuffixEnd = Math.min(beforeLines.length, suffixStart + maxCoarseDiffContextLines);
  for (let index = suffixStart; index < visibleSuffixEnd; index += 1) {
    rows.push({
      before: { type: 'same', text: beforeLines[index] },
      after: { type: 'same', text: afterLines[afterLines.length - (beforeLines.length - index)] }
    });
  }
  const hiddenSuffixCount = beforeLines.length - visibleSuffixEnd;
  if (hiddenSuffixCount > 0) {
    rows.push(diffOmittedRows(hiddenSuffixCount));
  }

  return rows;
}

function diffOmittedRows(count) {
  const text = t('diff.omittedLines', { count });
  return {
    before: { type: 'same', text, omitted: true },
    after: { type: 'same', text, omitted: true }
  };
}

function truncateDiffCellText(value) {
  const text = String(value || '');
  const maxLength = 12000;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n${t('diff.truncated', { count: text.length - maxLength })}`;
}

function pairedDiffRows(beforeText, afterText) {
  const beforeLines = splitDiffLines(beforeText);
  const afterLines = splitDiffLines(afterText);
  const length = Math.max(beforeLines.length, afterLines.length);
  const rows = [];

  for (let index = 0; index < length; index += 1) {
    const before = beforeLines[index];
    const after = afterLines[index];
    if (before === undefined) {
      rows.push({
        before: { type: 'empty', text: '' },
        after: changedDiffCell(after, 'after')
      });
    } else if (after === undefined) {
      rows.push({
        before: changedDiffCell(before, 'before'),
        after: { type: 'empty', text: '' }
      });
    } else if (before === after) {
      rows.push({
        before: { type: 'same', text: before },
        after: { type: 'same', text: after }
      });
    } else {
      rows.push({
        before: { type: 'before', text: before, diffRanges: inlineDiffRanges(before, after, 'before') },
        after: { type: 'after', text: after, diffRanges: inlineDiffRanges(before, after, 'after') }
      });
    }
  }

  return rows;
}

function singleSideDiffRows(text, side) {
  return splitDiffLines(text).map((line) => {
    if (side === 'before') {
      return {
        before: changedDiffCell(line, 'before'),
        after: { type: 'empty', text: '' }
      };
    }
    return {
      before: { type: 'empty', text: '' },
      after: changedDiffCell(line, 'after')
    };
  });
}

function splitDiffLines(value) {
  const lines = String(value || '').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function changedDiffCell(text, type) {
  const value = String(text ?? '');
  return {
    type,
    text: value,
    diffRanges: value ? [{ start: 0, end: value.length }] : []
  };
}

function diffCellHtml(cell, side, languageKind = 'text') {
  const type = cell?.type || 'empty';
  const content = diffCellContentHtml(cell, languageKind);
  const omitted = cell?.omitted ? ' diff-cell-omitted' : '';
  const buttonAttrs = cell?.omitted
    ? ` role="button" tabindex="0" data-diff-full-side="${escapeHtml(side)}" title="${escapeHtml(t('diff.viewFull'))}"`
    : '';
  return `<div class="diff-cell type-${type} side-${side}${omitted}"${buttonAttrs}>${content}</div>`;
}

function diffCellContentHtml(cell, languageKind) {
  if (cell?.html) return cell.html;
  const text = String(cell?.text ?? '');
  return highlightDiffText(text, languageKind, cell?.diffRanges || []);
}

function highlightDiffText(text, languageKind, ranges) {
  const value = String(text ?? '');
  const normalizedRanges = normalizeDiffRanges(ranges, value.length);
  if (!normalizedRanges.length) return highlightInlineCodeHtml(value, languageKind);
  return applyDiffMarksToHighlightedHtml(highlightInlineCodeHtml(value, languageKind), normalizedRanges);
}

function normalizeDiffRanges(ranges, length) {
  if (!Array.isArray(ranges) || !length) return [];
  const normalized = ranges
    .map((range) => ({
      start: Math.max(0, Math.min(length, Number(range.start) || 0)),
      end: Math.max(0, Math.min(length, Number(range.end) || 0))
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function applyDiffMarksToHighlightedHtml(html, ranges) {
  let output = '';
  let textIndex = 0;
  let rangeIndex = 0;
  let markOpen = false;
  for (let index = 0; index < html.length;) {
    if (html[index] === '<') {
      const end = html.indexOf('>', index);
      if (end < 0) break;
      output += html.slice(index, end + 1);
      index = end + 1;
      continue;
    }

    const activeRange = ranges[rangeIndex];
    if (!markOpen && activeRange && textIndex >= activeRange.start && textIndex < activeRange.end) {
      output += '<mark>';
      markOpen = true;
    }
    if (markOpen && activeRange && textIndex >= activeRange.end) {
      output += '</mark>';
      markOpen = false;
      rangeIndex += 1;
      continue;
    }

    if (html[index] === '&') {
      const end = html.indexOf(';', index);
      const entity = end >= 0 ? html.slice(index, end + 1) : html[index];
      output += entity;
      index += entity.length;
    } else {
      output += html[index];
      index += 1;
    }
    textIndex += 1;

    if (markOpen && activeRange && textIndex >= activeRange.end) {
      output += '</mark>';
      markOpen = false;
      rangeIndex += 1;
    }
  }
  if (markOpen) output += '</mark>';
  return output;
}

function bindDiffOmittedPreview(container, diff) {
  container.querySelectorAll('[data-diff-full-side]').forEach((cell) => {
    const open = () => {
      const side = cell.dataset.diffFullSide === 'after' ? 'after' : 'before';
      renderDiffFullPreview(container, diff, side);
    };
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });
}

function renderDiffFullPreview(container, diff, side) {
  const isAfter = side === 'after';
  const text = String(isAfter ? diff.after : diff.before);
  const title = isAfter ? diff.afterTitle : diff.beforeTitle;
  const language = detectPreviewLanguage(text, currentDiffPreviewTab());
  container.tabIndex = 0;
  container.classList.remove('diff-has-prefix');
  container.innerHTML = `
    <div class="diff-full-toolbar">
      <button class="ghost-btn diff-full-back" type="button">${escapeHtml(t('diff.back'))}</button>
      <span class="diff-full-title">${escapeHtml(t('diff.fullTitle', { title }))}</span>
    </div>
    <pre class="diff-full-code code-preview">${highlightCodeHtml(text || ' ', language.kind)}</pre>
  `;
  container.querySelector('.diff-full-back')?.addEventListener('click', () => {
    renderTextDiff({ before: diff.before, after: diff.after }, {
      container,
      beforeTitle: diff.beforeTitle,
      afterTitle: diff.afterTitle,
      prefix: diff.prefix
    });
  });
}

function currentDiffPreviewTab() {
  if (els.remoteExampleDiff && !els.remoteExampleDiff.hidden) return state.remoteExampleTab;
  return state.previewBodyTab;
}

function bindDiffScrollSync() {
  // The row-based diff scrolls as one surface, so no side sync is needed.
}

function inlineDiffRanges(before, after, side) {
  if (before.length + after.length > maxInlineDiffChars) {
    const text = side === 'before' ? before : after;
    return text ? [{ start: 0, end: text.length }] : [];
  }

  const ranges = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  for (const part of diffChars(before, after)) {
    const length = part.value.length;
    if (part.removed) {
      if (side === 'before') ranges.push({ start: beforeIndex, end: beforeIndex + length });
      beforeIndex += length;
      continue;
    }
    if (part.added) {
      if (side === 'after') ranges.push({ start: afterIndex, end: afterIndex + length });
      afterIndex += length;
      continue;
    }
    beforeIndex += length;
    afterIndex += length;
  }
  return ranges;
}

function captureSavedEditorState() {
  state.savedEditorState = currentEditorState();
}

function scheduleRuleAutoSave(options = {}) {
  if (!(state.selectedRuleId || state.selectedRemoteRuleId)) return;
  if (!(state.previewMode === 'rule' || state.previewMode === 'remote')) return;
  if (state.manualRuleSaveRequired && options.manual !== true) {
    updateManualRuleSaveButton();
    return;
  }
  window.clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = window.setTimeout(() => {
    saveCurrentRule({ auto: true }).catch((error) => {
      console.error(error);
    });
  }, options.immediate ? 0 : autoSaveDelayMs);
}

function currentEditorState() {
  if (state.selectedRemoteRuleId) {
    syncSelectedAiStepFromEditor();
    syncSelectedDslStepFromEditor();
    const rule = selectedRemoteRule();
    return {
      mode: 'remote',
      scope: rule?.scope || '',
      host: isGlobalRemoteRule(rule) ? normalizeHostInput(els.globalRemoteHostInput.value) : '',
      enabled: isGlobalRemoteRule(rule) ? Boolean(els.globalRemoteEnabled.checked) : undefined,
      query: normalizeQuery(els.ruleQueryInput.value),
      requestBody: state.previewRequest?.body || '',
      steps: JSON.stringify(serializeRemoteStepsForApi(state.remoteSteps))
    };
  }

  if (state.selectedRuleId) {
    return {
      mode: 'rule',
      enabled: Boolean(els.ruleOptionEnabled.checked),
      queryMode: els.ruleOptionQuery.checked ? 'exact' : 'ignore',
      query: normalizeQuery(els.ruleQueryInput.value),
      requestBodyMode: els.ruleOptionBody.checked ? 'exact' : 'ignore',
      requestBody: state.previewRequest?.body || '',
      responseBody: state.previewResponse?.body || ''
    };
  }

  return null;
}

function editorStateChanged(saved, current) {
  if (!saved || !current || saved.mode !== current.mode) return false;
  return JSON.stringify(saved) !== JSON.stringify(current);
}

function updateActivePreviewBodyFromEditor() {
  if (state.previewBodyTab === 'request') {
    state.previewRequest = {
      ...(state.previewRequest || {}),
      body: els.editor.value
    };
  } else if (state.previewBodyTab === 'response') {
    state.previewResponse = {
      ...(state.previewResponse || {}),
      body: els.editor.value
    };
  }
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw await responseError(response);
  return response.json();
}

async function getJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw await responseError(response);
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(t('capture.detailTimeout'));
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function postJson(url, body) {
  return sendJson(url, 'POST', body);
}

async function putJson(url, body) {
  return sendJson(url, 'PUT', body);
}

async function patchJson(url, body) {
  return sendJson(url, 'PATCH', body);
}

async function sendJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

async function responseError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    const error = new Error(data.error || text || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    return error;
  } catch {
    const error = new Error(text || `HTTP ${response.status}`);
    error.status = response.status;
    return error;
  }
}

function empty(text) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  return div;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatBytesDetailed(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '-';
  return number >= 1024 ? `${formatBytes(number)} (${number.toLocaleString()} bytes)` : `${number.toLocaleString()} bytes`;
}

function formatOptionalBytes(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? formatBytesDetailed(number) : '-';
}

function renderCaptureOverview(data = {}) {
  const capture = data?.capture || {};
  const rows = flattenCaptureOverviewRows(captureOverviewRows(capture, data));
  els.captureOverview.innerHTML = `
    <div class="capture-overview-table">
      ${rows.map((row) => {
        if (row.type === 'section') {
          return `<div class="capture-overview-section${row.collapsed ? ' collapsed' : ' expanded'}" data-overview-section="${escapeHtml(row.id)}" style="--overview-depth:${row.depth || 0}">
            <span class="capture-overview-section-label">
              <button class="capture-overview-caret" type="button" aria-label="${escapeHtml(row.collapsed ? t('tree.expand') : t('tree.collapse'))}">
                <svg viewBox="0 0 16 16" focusable="false">
                  <path d="M6 4L10 8L6 12"/>
                </svg>
              </button>
              <span>${escapeHtml(row.label)}</span>
            </span>
            ${row.value ? `<span class="capture-overview-section-value">${escapeHtml(row.value)}</span>` : ''}
          </div>`;
        }
        return `<div class="capture-overview-row" style="--overview-depth:${row.depth || 0}">
          <div class="capture-overview-key">${escapeHtml(row.label)}</div>
          <div class="capture-overview-value">${escapeHtml(row.value || '-')}</div>
        </div>`;
      }).join('')}
    </div>
  `;
  els.captureOverview.querySelectorAll('.capture-overview-caret').forEach((button) => {
    button.addEventListener('click', () => {
      toggleCaptureOverviewSection(button.closest('[data-overview-section]')?.dataset.overviewSection);
    });
  });
}

function captureOverviewRows(capture = {}, data = {}) {
  if (data.loading) {
    return [
      overviewSection('request', t('overview.request'), [
        { label: t('overview.url'), value: captureOverviewUrl(capture) },
        { label: t('overview.method'), value: capture.method || '-' }
      ]),
      overviewSection('response', t('overview.response'), [
        { label: t('overview.status'), value: t('overview.loading') }
      ])
    ];
  }
  if (data.error) {
    return [
      overviewSection('request', t('overview.request'), [
        { label: t('overview.url'), value: captureOverviewUrl(capture) },
        { label: t('overview.method'), value: capture.method || '-' }
      ]),
      overviewSection('response', t('overview.response'), [
        { label: t('overview.status'), value: t('overview.failed') },
        { label: t('overview.error'), value: data.error }
      ])
    ];
  }
  const requestSize = Number(capture.requestBodySize || 0);
  const responseSize = Number(capture.bodySize || capture.contentLength || 0);
  const totalSize = requestSize + responseSize;
  const requestHeaderSize = overviewNumber(capture.requestHeaderSize, approximateOverviewRequestHeaderBytes(capture));
  const requestQuerySize = overviewNumber(capture.requestQuerySize, encodedByteLength(capture.query || queryFromUrl(capture.url)));
  const requestCookieSize = overviewNumber(capture.requestCookieSize, encodedByteLength(headerValueFromObject(capture.requestHeaders, 'cookie')));
  const requestBodySize = Number(capture.requestBodySize || 0);
  const responseHeaderSize = overviewNumber(capture.responseHeaderSize, approximateOverviewResponseHeaderBytes(capture));
  const responseCookieSize = overviewNumber(capture.responseCookieSize, encodedByteLength(headerValueFromObject(capture.responseHeaders, 'set-cookie')));
  const responseBodySize = Number(capture.bodySize || 0);
  const requestTotal = requestHeaderSize + requestQuerySize + requestCookieSize + requestBodySize;
  const responseTotal = responseHeaderSize + responseCookieSize + responseBodySize;
  return [
    overviewSection('request', t('overview.request'), [
      { label: t('overview.url'), value: captureOverviewUrl(capture) },
      { label: t('overview.method'), value: String(capture.method || '-').toUpperCase() },
      { label: t('overview.protocol'), value: capture.httpVersion || capture.protocolVersion || '-' },
      { label: t('overview.path'), value: capture.path || pathFromUrl(capture.url || '') || '-' },
      { label: t('overview.query'), value: capture.query || queryFromUrl(capture.url) || '-' },
      { label: t('overview.contentType'), value: capture.requestContentType || headerValueFromObject(capture.requestHeaders, 'content-type') || '-' },
      { label: t('overview.bodySize'), value: formatOptionalBytes(requestBodySize) }
    ]),
    overviewSection('response', t('overview.response'), [
      { label: t('overview.status'), value: capture.proxyError ? t('overview.failed') : t('overview.complete') },
      { label: t('overview.responseCode'), value: capture.statusCode ? String(capture.statusCode) : '-' },
      { label: t('overview.responseMessage'), value: capture.statusMessage || '-' },
      { label: t('overview.contentType'), value: capture.contentType || headerValueFromObject(capture.responseHeaders, 'content-type') || '-' },
      { label: t('overview.bodySize'), value: formatOptionalBytes(responseBodySize || responseSize) },
      { label: t('overview.mapping'), value: capture.mapType ? captureMappingText(capture) : '-' }
    ]),
    overviewSection('connection', t('overview.connection'), [
      { label: t('overview.clientAddress'), value: capture.clientAddress || '-' },
      { label: t('overview.remoteAddress'), value: capture.remoteAddress || captureOverviewRemoteAddress(capture) },
      { label: t('overview.keptAlive'), value: capture.keptAlive === true ? t('overview.yes') : capture.keptAlive === false ? t('overview.no') : '-' },
      { label: t('overview.ssl'), value: capture.tlsProtocol ? `${capture.tlsProtocol}${capture.tlsCipher ? ` (${capture.tlsCipher})` : ''}` : capture.protocol === 'https' ? t('overview.yes') : '-' },
      {
        type: 'section',
        id: 'connection.detail',
        label: t('overview.advanced'),
        children: [
          { label: t('overview.clientConnection'), value: capture.clientConnectionId || '-' },
          { label: t('overview.serverConnection'), value: capture.serverConnectionId || '-' },
          { label: t('overview.streamId'), value: capture.streamId || '-' },
          { label: t('overview.clientSettings'), value: capture.clientSettings || '-' },
          { label: t('overview.serverSettings'), value: capture.serverSettings || '-' }
        ]
      }
    ]),
    overviewSection('timing', t('overview.timing'), [
      { label: t('overview.requestStartTime'), value: formatOverviewDate(capture.requestStartedAt || capture.createdAt) },
      { label: t('overview.requestEndTime'), value: formatOverviewDate(capture.requestEndedAt || capture.createdAt) },
      { label: t('overview.responseStartTime'), value: formatOverviewDate(capture.responseStartedAt || capture.createdAt) },
      { label: t('overview.responseEndTime'), value: formatOverviewDate(capture.responseEndedAt || capture.createdAt) },
      { label: t('overview.duration'), value: formatDuration(capture.durationMs) },
      { label: t('overview.dns'), value: formatDuration(capture.dnsMs) },
      { label: t('overview.connect'), value: formatDuration(capture.connectMs) },
      { label: t('overview.tlsHandshake'), value: formatDuration(capture.tlsMs) },
      { label: t('overview.request'), value: formatDuration(capture.requestMs) },
      { label: t('overview.response'), value: formatDuration(capture.responseMs) },
      { label: t('overview.latency'), value: formatDuration(capture.latencyMs) },
      { label: t('overview.speed'), value: formatSpeed(totalSize, capture.durationMs) },
      { label: t('overview.requestSpeed'), value: formatSpeed(requestSize, capture.requestMs) },
      { label: t('overview.responseSpeed'), value: formatSpeed(responseSize, capture.responseMs) }
    ]),
    overviewSection('size', t('overview.size'), [
      {
        type: 'section',
        id: 'size.request',
        label: t('overview.request'),
        value: requestTotal ? formatBytesDetailed(requestTotal) : formatBytes(requestSize),
        children: [
          { label: t('overview.tlsHandshake'), value: formatOptionalBytes(capture.requestTlsHandshakeSize) },
          { label: t('overview.header'), value: formatOptionalBytes(requestHeaderSize) },
          { label: t('overview.queryString'), value: formatOptionalBytes(requestQuerySize) },
          { label: t('overview.cookies'), value: formatOptionalBytes(requestCookieSize) },
          { label: t('overview.body'), value: formatOptionalBytes(requestBodySize) },
          { label: t('overview.uncompressedBody'), value: formatOptionalBytes(capture.requestUncompressedBodySize) },
          { label: t('overview.compression'), value: capture.requestCompression || '-' }
        ]
      },
      {
        type: 'section',
        id: 'size.response',
        label: t('overview.response'),
        value: responseTotal ? formatBytesDetailed(responseTotal) : formatBytes(responseSize),
        children: [
          { label: t('overview.tlsHandshake'), value: formatOptionalBytes(capture.responseTlsHandshakeSize) },
          { label: t('overview.header'), value: formatOptionalBytes(responseHeaderSize) },
          { label: t('overview.cookies'), value: formatOptionalBytes(responseCookieSize) },
          { label: t('overview.body'), value: formatOptionalBytes(responseBodySize) },
          { label: t('overview.uncompressedBody'), value: formatOptionalBytes(capture.responseUncompressedBodySize) },
          { label: t('overview.compression'), value: capture.responseCompression || '-' }
        ]
      },
      { label: t('overview.total'), value: formatBytesDetailed((requestTotal || requestSize) + (responseTotal || responseSize)) }
    ])
  ];
}

function overviewSection(id, label, children = [], value = '') {
  return {
    type: 'section',
    id,
    label,
    value,
    children
  };
}

function overviewNumber(value, fallback = 0) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) && fallbackNumber > 0 ? fallbackNumber : 0;
}

function approximateOverviewRequestHeaderBytes(capture = {}) {
  const method = String(capture.method || 'GET').toUpperCase();
  const path = `${capture.path || pathFromUrl(capture.url || '') || '/'}${capture.query ? `?${capture.query}` : queryFromUrl(capture.url) ? `?${queryFromUrl(capture.url)}` : ''}`;
  return encodedByteLength(`${method} ${path} ${capture.httpVersion || 'HTTP/1.1'}\r\n${formatRawOverviewHeaders(capture.requestHeaders)}\r\n`);
}

function approximateOverviewResponseHeaderBytes(capture = {}) {
  return encodedByteLength(`${capture.httpVersion || 'HTTP/1.1'} ${capture.statusCode || 0}${capture.statusMessage ? ` ${capture.statusMessage}` : ''}\r\n${formatRawOverviewHeaders(capture.responseHeaders)}\r\n`);
}

function formatRawOverviewHeaders(headers = {}) {
  return Object.entries(headers || {})
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join('\r\n');
}

function encodedByteLength(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

function flattenCaptureOverviewRows(rows = [], depth = 0, parentId = '') {
  const result = [];
  for (const row of rows) {
    if (row.type === 'section') {
      const id = row.id || `${parentId}.${row.label}`;
      const collapsed = state.captureOverviewCollapsed?.has(id);
      result.push({
        ...row,
        id,
        depth,
        collapsed
      });
      if (!collapsed) result.push(...flattenCaptureOverviewRows(row.children || [], depth + 1, id));
    } else {
      result.push({ ...row, depth });
    }
  }
  return result;
}

function toggleCaptureOverviewSection(id) {
  if (!id) return;
  if (!state.captureOverviewCollapsed) state.captureOverviewCollapsed = new Set();
  if (state.captureOverviewCollapsed.has(id)) {
    state.captureOverviewCollapsed.delete(id);
  } else {
    state.captureOverviewCollapsed.add(id);
  }
  renderCaptureOverview(state.previewOverview);
}

function captureOverviewUrl(capture = {}) {
  return capture.url || buildUrl(capture, { includeQuery: true }) || '-';
}

function captureOverviewRemoteAddress(capture = {}) {
  const host = capture.host || hostFromUrl(capture.url);
  if (!host) return '-';
  const port = Number(capture.port || defaultPort(capture.protocol || protocolFromUrl(capture.url) || 'https'));
  return `${host}${port ? `:${port}` : ''}`;
}

function formatOverviewDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.max(0, Math.round(number))} ms` : '-';
}

function formatSpeed(bytes, durationMs) {
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration <= 0) return '-';
  const bytesPerSecond = Number(bytes || 0) / (duration / 1000);
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
  return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
}

function headerValueFromObject(headers = {}, name) {
  const target = String(name || '').toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target);
  return entry ? String(entry[1] ?? '') : '';
}

function requestTarget(capture) {
  return capture.path || '/';
}

function ruleTarget(rule) {
  if (isGlobalRemoteRule(rule)) return t('rule.global');
  return rule.path || '/';
}

function matchSummaryHtml(parts) {
  const text = (Array.isArray(parts) ? parts : [])
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ');
  const summary = text ? t('rule.matchSummary', { text }) : '';
  return summary ? `<div class="match-summary" title="${escapeHtml(summary)}">${escapeHtml(summary)}</div>` : '';
}

function requestBodySummaryPart({ bodyText = '', bodyBase64 = '', bodySize = 0 } = {}) {
  let text = String(bodyText || '');
  if (!text && bodyBase64) {
    try {
      text = bodyFromBase64(bodyBase64);
    } catch {
      text = '';
    }
  }
  const compactText = text.replace(/\s+/g, ' ').trim();
  if (compactText && compactText.length < 50 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/.test(compactText)) {
    return `body ${compactText}`;
  }
  const fallbackSize = Number(bodySize || 0);
  const textSize = text ? new TextEncoder().encode(text).length : 0;
  return `body ${formatBytes(Number.isFinite(fallbackSize) && fallbackSize > 0 ? fallbackSize : textSize)}`;
}

function ruleMatchSummaryHtml(rule) {
  if (!rule || isGlobalRemoteRule(rule)) return '';
  const parts = [];
  if (methodHasRequestBody(rule.method) && rule.requestBodyMode !== 'ignore') {
    parts.push(requestBodySummaryPart({
      bodyText: rule.bodyTemplate || '',
      bodyBase64: rule.requestBodyBase64 || '',
      bodySize: Number(rule.requestBodySize || 0)
    }));
  }
  if (rule.queryMode === 'exact') {
    parts.push(`query ${rule.query || t('query.none')}`);
  }
  return matchSummaryHtml(parts);
}

function shouldShowRuleMatchSummary(rule) {
  if (!rule || isGlobalRemoteRule(rule)) return false;
  return rulesWithSamePath(rule).length > 1;
}

function rulesWithSamePath(rule) {
  const key = rulePathKey(rule);
  if (!key) return [];
  return [...(state.rules || []), ...(state.remoteRules || [])]
    .filter((item) => !isGlobalRemoteRule(item) && rulePathKey(item) === key);
}

function rulePathKey(rule = {}) {
  const host = normalizeHostInput(rule.host || '');
  const path = String(rule.path || '/');
  return host && path ? `${host}\u0000${path}` : '';
}

function captureMergeSummaryHtml(capture) {
  const options = captureMergeOptionsForCapture(capture);
  const parts = [];
  if (options.body === true && methodHasRequestBody(capture.method)) {
    const bodyTemplate = String(options.bodyTemplate || '');
    const bodySize = bodyTemplate
      ? new TextEncoder().encode(bodyTemplate).length
      : Number(capture.requestBodySize || 0);
    parts.push(requestBodySummaryPart({
      bodyText: bodyTemplate,
      bodyBase64: bodyTemplate ? '' : (capture.requestBodyBase64 || ''),
      bodySize
    }));
  }
  if (options.query === true) {
    parts.push(`query ${String(options.queryTemplate || '').trim() || t('query.none')}`);
  }
  return matchSummaryHtml(parts);
}

function requestDisplayUrl(item) {
  const protocol = item.protocol || protocolFromUrl(item.url);
  const host = item.host || hostFromUrl(item.url);
  const port = displayPort(item, protocol);
  const path = item.path || pathFromUrl(item.url) || '/';
  if (protocol && host) return `${protocol}://${host}${port}${path}`;
  return item.url ? String(item.url).split('?')[0] : path;
}

function apiNoteKey(item) {
  if (!item) return '';
  const protocol = item.protocol || protocolFromUrl(item.url) || 'https';
  const host = item.host || hostFromUrl(item.url);
  const port = Number(item.port || explicitPortFromUrl(item.url) || defaultPort(protocol));
  const path = item.path || pathFromUrl(item.url) || '/';
  return [
    String(item.method || '').toUpperCase(),
    protocol,
    host,
    port,
    path
  ].join('\u0000');
}

function apiNoteText(item) {
  const key = apiNoteKey(item);
  if (!key) return '';
  return String(state.apiNotes[key] || item?.note || '').trim();
}

function displayNoteText(item) {
  if (!item) return '';
  if (item.id && (state.rules.some((rule) => rule.id === item.id) || state.remoteRules.some((rule) => rule.id === item.id))) {
    return singleLineNote(item.note || '');
  }
  return apiNoteText(item);
}

function singleLineNote(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function listNoteHtml(item) {
  if (state.showListNotes === false) return '';
  const note = displayNoteText(item);
  return note ? `<div class="api-note">${escapeHtml(note)}</div>` : '';
}

function detailNoteTextForKey(key) {
  if (!key) return '';
  return String(state.apiDetails[key] || '').trim();
}

function detailNoteFailureForKey(key) {
  if (!key) return null;
  const failure = state.apiDetailFailures?.[key];
  if (!failure?.message) return null;
  return {
    message: String(failure.message || '').trim(),
    failedAt: String(failure.failedAt || '').trim()
  };
}

function setDetailNoteFailureForKey(key, failure) {
  if (!key || !failure?.message) return;
  state.apiDetailFailures = {
    ...state.apiDetailFailures,
    [key]: {
      message: String(failure.message || '').trim(),
      failedAt: String(failure.failedAt || '').trim()
    }
  };
  renderDetailNoteButton();
}

function clearDetailNoteFailureForKey(key) {
  if (!key || !state.apiDetailFailures?.[key]) return;
  const next = { ...state.apiDetailFailures };
  delete next[key];
  state.apiDetailFailures = next;
  renderDetailNoteButton();
}

function detailNoteFailureDialogText(failure) {
  const message = String(failure?.message || t('note.detailFailed')).trim();
  const failedAt = failure?.failedAt
    ? `\n\n${t('note.detailFailedAt', { time: new Date(failure.failedAt).toLocaleString() })}`
    : '';
  return `## ${t('note.detailFailedTitle')}\n\n${t('note.detailFailedReason', { message })}${failedAt}`;
}

function setDetailNoteForKey(key, detail) {
  if (!key) return;
  const text = String(detail || '').trim();
  if (text) {
    state.apiDetails = {
      ...state.apiDetails,
      [key]: text
    };
    clearDetailNoteFailureForKey(key);
  } else {
    const next = { ...state.apiDetails };
    delete next[key];
    state.apiDetails = next;
  }
  if (state.activeDetailNoteKey === key) {
    state.activeDetailNoteText = text;
  }
  renderDetailNoteButton();
}

function currentDetailNoteKey() {
  const target = currentNoteTarget();
  return apiNoteKey(target);
}

function isCurrentDetailNoteGenerating() {
  const target = currentDetailNoteTarget();
  const key = currentDetailNoteKey();
  const backendCurrentKey = state.codexQueue?.notes?.details?.current?.key || '';
  return Boolean(
    target?.url &&
    key &&
    (
      (state.detailNotePollUrl === target.url && state.detailNotePollKey === key) ||
      backendCurrentKey === key
    )
  );
}

function setDetailNoteGenerating(url, key) {
  state.detailNotePollUrl = url;
  state.detailNotePollKey = key;
  state.detailNotePollToken += 1;
  renderDetailNoteButton();
}

function clearDetailNoteGenerating(url, key) {
  if (state.detailNotePollUrl !== url || state.detailNotePollKey !== key) return;
  state.detailNotePollUrl = '';
  state.detailNotePollKey = '';
  state.detailNotePollToken += 1;
  renderDetailNoteButton();
}

function renderDetailNoteButton() {
  const key = currentDetailNoteKey();
  const hasDetail = Boolean(detailNoteTextForKey(key));
  const generating = isCurrentDetailNoteGenerating();
  const failure = !hasDetail && !generating ? detailNoteFailureForKey(key) : null;
  const canAnalyzeNote = Boolean(currentDetailNoteTarget()) &&
    Boolean(currentProjectPath()) &&
    (!aiProviderDisabled() || hasDetail || generating || failure);
  els.analyzeNoteBtn.hidden = !canAnalyzeNote;
  if (!canAnalyzeNote) {
    els.analyzeNoteBtn.disabled = true;
    els.analyzeNoteBtn.textContent = t('note.generateDetail');
    return;
  }
  els.analyzeNoteBtn.textContent = hasDetail
    ? t('note.detail')
    : failure
      ? t('note.detailFailureButton')
      : (generating ? t('note.generating') : t('note.generateDetail'));
  els.analyzeNoteBtn.disabled = !hasDetail && !failure && !generating && aiProviderDisabled();
  setInstantTooltip(els.analyzeNoteBtn, hasDetail
    ? t('note.viewDetailTip')
    : failure
      ? t('note.viewFailureTip')
    : generating
      ? t('note.generatingTip')
    : t('note.generateTip'));
  if (els.regenerateDetailNoteBtn) {
    els.regenerateDetailNoteBtn.disabled = generating || aiProviderDisabled();
    els.regenerateDetailNoteBtn.textContent = hasDetail ? t('note.regenerate') : t('note.generate');
  }
}

function currentNoteTarget() {
  if (state.previewMode === 'capture' && state.selectedCaptureDetail) return state.selectedCaptureDetail;
  if (state.previewMode === 'rule' && state.selectedRuleId) {
    return state.rules.find((rule) => rule.id === state.selectedRuleId);
  }
  if (state.previewMode === 'remote' && state.selectedRemoteRuleId) {
    const rule = state.remoteRules.find((item) => item.id === state.selectedRemoteRuleId);
    return isGlobalRemoteRule(rule) ? null : rule;
  }
  return null;
}

function setEditorNote(note) {
  const text = String(note || '').trim();
  els.editorNote.textContent = text;
  els.editorNote.hidden = !text;
  renderDetailNoteButton();
  refreshEditorTitle();
}

function refreshPreviewNote() {
  if (state.previewMode === 'capture') {
    const target = state.selectedCaptureDetail || selectedCaptureSummary();
    setEditorNote(apiNoteText(target));
    return;
  }
  if (state.previewMode === 'rule' || state.previewMode === 'remote') {
    setEditorNote(displayNoteText(currentNoteTarget()));
  }
}

function defaultPort(protocol) {
  return protocol === 'http' ? 80 : 443;
}

function displayPort(item, protocol) {
  const explicitPort = explicitPortFromUrl(item.url);
  if (explicitPort) return `:${explicitPort}`;
  const port = Number(item.port || 0);
  if (!port) return '';
  if ((protocol === 'https' && port === 443) || (protocol === 'http' && port === 80)) return '';
  return `:${port}`;
}

function explicitPortFromUrl(url) {
  try {
    return new URL(url).port;
  } catch {
    return '';
  }
}

function protocolFromUrl(url) {
  try {
    return new URL(url).protocol.replace(':', '');
  } catch {
    return '';
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function pathFromUrl(url) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '';
  }
}

function queryFromUrl(url) {
  try {
    return new URL(url).search.replace(/^\?/, '');
  } catch {
    return '';
  }
}

function formatHeadersPreview(headers = {}) {
  if (!headers || !Object.keys(headers).length) return '(empty head)';
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function formatQueryPreview(query = '') {
  const entries = paramsToEntries(query);
  if (!entries.length) return t('query.none');
  return entries
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function currentRuleQuery(rule) {
  if (state.selectedRuleId === rule.id && !els.ruleQueryEditor.hidden) {
    return normalizeQuery(els.ruleQueryInput.value);
  }
  return rule.query || '';
}

function currentRemoteRuleQuery(rule) {
  if (state.selectedRemoteRuleId === rule.id && !els.ruleQueryEditor.hidden) {
    return normalizeQuery(els.ruleQueryInput.value);
  }
  return rule.query || '';
}

function isPythonRule(rule) {
  return Boolean(rule && (rule.scriptType === 'python' || rule.pythonScript));
}

function currentRemoteScriptType(rule) {
  if (selectedAiStep()) return 'python';
  if (state.previewBodyTab !== 'response' && isPythonRule(rule)) return 'python';
  return 'dsl';
}

function normalizeQuery(value) {
  return String(value || '').trim().replace(/^\?/, '');
}

function normalizeHostInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text.includes('://') ? text : `https://${text}`).hostname;
  } catch {
    return text.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].trim();
  }
}

function isGlobalRemoteRule(rule) {
  return rule?.scope === 'global';
}

function isBlankGlobalRemoteRule(rule) {
  return isGlobalRemoteRule(rule) && !String(rule.host || '').trim();
}

function selectedRemoteRule() {
  return state.remoteRules.find((rule) => rule.id === state.selectedRemoteRuleId) || null;
}

function globalRemoteRuleTitle(rule) {
  return rule?.host ? `${rule.host} / ${t('rule.global')}` : t('remote.addGlobalRule');
}

function methodHasRequestBody(method) {
  if (String(method || '') === '*') return false;
  return !['GET', 'HEAD'].includes(String(method || '').toUpperCase());
}

function captureHasQuery(capture = {}) {
  return paramsToEntries(capture.query || '').length > 0;
}

function captureHasRequestBodyContent(capture = {}) {
  if (!methodHasRequestBody(capture.method)) return false;
  if (Number(capture.requestBodySize || 0) > 0) return true;
  if (capture.requestBodyBase64) return true;
  return Boolean(requestBodyText(capture.requestBody).trim());
}

function captureHasMatchingRemoteRule() {
  const capture = selectedCaptureForAction();
  if (!capture) return false;
  return state.remoteRules.some((rule) => !isGlobalRemoteRule(rule) && sameRemoteRuleTarget(rule, captureRuleTarget(capture, 'remote')));
}

function selectedCaptureForAction() {
  if (state.previewMode !== 'capture') return null;
  return state.selectedCaptureDetail || selectedCaptureSummary();
}

function captureRuleTarget(capture, type) {
  const hasRequestBody = Number(capture.requestBodySize || 0) > 0 || Boolean(capture.requestBodyBase64);
  return {
    method: capture.method,
    protocol: capture.protocol,
    host: capture.host,
    port: capture.port,
    path: capture.path,
    queryMode: 'exact',
    query: capture.query || '',
    requestBodyMode: type === 'remote' && methodHasRequestBody(capture.method) && !hasRequestBody
      ? 'ignore'
      : (methodHasRequestBody(capture.method) ? 'exact' : 'ignore'),
    requestBodyHash: capture.requestBodyHash || '',
    requestBodyBase64: capture.requestBodyBase64 || '',
    requestBodySize: Number(capture.requestBodySize || 0)
  };
}

function sameLocalRuleTarget(rule, target) {
  return sameBaseRuleTarget(rule, target) &&
    sameRuleCoverageForTarget(rule, target, shouldMatchLocalRuleBody);
}

function sameRemoteRuleTarget(rule, target) {
  return sameBaseRuleTarget(rule, target) &&
    sameRuleCoverageForTarget(rule, target, shouldMatchRemoteRuleBody);
}

function sameBaseRuleTarget(a, b) {
  return a.method === b.method &&
    a.protocol === b.protocol &&
    a.host === b.host &&
    Number(a.port) === Number(b.port) &&
    a.path === b.path;
}

function sameRuleCoverageForTarget(rule, target, shouldMatchBody) {
  return ruleCoversRuleTarget(rule, target, shouldMatchBody) &&
    ruleCoversRuleTarget(target, rule, shouldMatchBody);
}

function ruleCoversRuleTarget(containerRule, containedRule, shouldMatchBody) {
  if (!ruleQueryCoversForTarget(containerRule, containedRule)) return false;
  if (!ruleBodyCoversForTarget(containerRule, containedRule, shouldMatchBody)) return false;
  return true;
}

function ruleQueryCoversForTarget(containerRule, containedRule) {
  if (containerRule.queryMode === 'ignore') return true;
  if (containedRule.queryMode === 'ignore') return false;
  return queryIncludesRequired(containedRule.query || '', containerRule.query || '');
}

function ruleBodyCoversForTarget(containerRule, containedRule, shouldMatchBody) {
  if (!shouldMatchBody(containerRule)) return true;
  if (!shouldMatchBody(containedRule)) return false;
  return requestBodyIncludesRequired(containedRule, containerRule);
}

function shouldMatchLocalRuleBody(rule) {
  return methodHasRequestBody(rule.method) && rule.requestBodyMode !== 'ignore';
}

function shouldMatchRemoteRuleBody(rule) {
  return methodHasRequestBody(rule.method) &&
    rule.requestBodyMode !== 'ignore' &&
    Boolean(remoteRuleBodyHashKey(rule));
}

function localRuleBodyHashKey(rule) {
  if (rule.requestBodyHash) return rule.requestBodyHash;
  if (!rule.requestBodyBase64 && !Number(rule.requestBodySize || 0)) return emptyBodyHash();
  return '';
}

function remoteRuleBodyHashKey(rule) {
  if (rule.requestBodyHash) return rule.requestBodyHash;
  return '';
}

function queryIncludesRequired(actualQuery = '', requiredQuery = '') {
  const required = paramsToEntries(requiredQuery);
  if (!required.length) return true;
  const actual = paramsToEntries(actualQuery);
  const counts = new Map();
  for (const [key, value] of actual) {
    const entryKey = `${key}\u0000${value}`;
    counts.set(entryKey, (counts.get(entryKey) || 0) + 1);
  }
  for (const [key, value] of required) {
    const entryKey = `${key}\u0000${value}`;
    const count = counts.get(entryKey) || 0;
    if (count <= 0) return false;
    counts.set(entryKey, count - 1);
  }
  return true;
}

function paramsToEntries(query) {
  const params = new URLSearchParams(String(query || '').replace(/^\?/, ''));
  return [...params.entries()];
}

function requestBodyIncludesRequired(actual, required) {
  if (!ruleHasStructuredBody(required)) {
    return localRuleBodyHashKey(actual) === localRuleBodyHashKey(required);
  }
  if (!actual?.requestBodyBase64 && Number(actual?.requestBodySize || 0) > 0) {
    return localRuleBodyHashKey(actual) === localRuleBodyHashKey(required);
  }

  const requiredText = bodyTextFromRule(required);
  const actualText = bodyTextFromRule(actual);
  const contentType = String(actual?.requestContentType || required?.requestContentType || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return queryIncludesRequired(actualText, requiredText);
  }

  const requiredJson = parseJson(requiredText);
  const actualJson = parseJson(actualText);
  if (requiredJson.ok && actualJson.ok) {
    return jsonIncludesRequired(actualJson.value, requiredJson.value);
  }

  return localRuleBodyHashKey(actual) === localRuleBodyHashKey(required);
}

function ruleHasStructuredBody(rule) {
  return Boolean(rule?.requestBodyBase64) || !Number(rule?.requestBodySize || 0);
}

function bodyTextFromRule(rule) {
  return rule?.requestBodyBase64 ? bodyFromBase64(rule.requestBodyBase64) : '';
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(String(text || '')) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function jsonIncludesRequired(actual, required) {
  if (Array.isArray(required)) {
    if (!Array.isArray(actual)) return false;
    const usedIndexes = new Set();
    return required.every((requiredItem) => {
      const actualIndex = actual.findIndex((actualItem, index) => (
        !usedIndexes.has(index) && jsonIncludesRequired(actualItem, requiredItem)
      ));
      if (actualIndex < 0) return false;
      usedIndexes.add(actualIndex);
      return true;
    });
  }

  if (required && typeof required === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(required).every(([key, value]) => (
      Object.prototype.hasOwnProperty.call(actual, key) &&
      jsonIncludesRequired(actual[key], value)
    ));
  }

  return Object.is(actual, required);
}

function emptyBodyHash() {
  return 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
}

function requestBodyText(requestBody) {
  if (!requestBody) return '';
  if (requestBody.editable) return requestBody.body || '';
  return requestBody.note || '';
}

function bodyFromBase64(value) {
  if (!value) return '';
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bodyToBase64(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildCurl({ method, url, headers = {}, body = '' }) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const parts = [`curl ${shellQuote(url)}`];

  if (normalizedMethod !== 'GET') {
    parts.push(`  -X ${normalizedMethod}`);
  }

  for (const [key, value] of Object.entries(headers || {})) {
    const name = String(key).toLowerCase();
    if ([
      'host',
      'content-length',
      'connection',
      'proxy-connection',
      'accept-encoding',
      'content-encoding',
      'transfer-encoding'
    ].includes(name)) {
      continue;
    }
    parts.push(`  -H ${shellQuote(`${key}: ${value}`)}`);
  }

  if (body) {
    parts.push(`  --data-raw ${shellQuote(body)}`);
  }

  return parts.join(' \\\n');
}

function buildUrl(item, options = {}) {
  if (isGlobalRemoteRule(item)) {
    return item.host ? `${item.host} / ${t('rule.global')}` : t('remote.addGlobalRule');
  }
  const protocol = item.protocol || 'https';
  const port = portSegment(protocol, item.port);
  const path = item.path || '/';
  const query = options.includeQuery && item.query ? `?${item.query}` : '';
  return `${protocol}://${item.host}${port}${path}${query}`;
}

function portSegment(protocol, port) {
  const numericPort = Number(port);
  if (!Number.isFinite(numericPort)) return '';
  if (protocol === 'http' && numericPort === 80) return '';
  if (protocol === 'https' && numericPort === 443) return '';
  return `:${numericPort}`;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function writeClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function flashButton(button, text) {
  const originalText = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1200);
}

function renderMarkdown(container, markdown) {
  container.innerHTML = markdownToHtml(markdown);
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let listOpen = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listOpen) return;
    html.push('</ul>');
    listOpen = false;
  };

  for (const line of lines) {
    const text = line.trim();
    if (!text) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = text.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const listItem = text.match(/^[-*]\s+(.+)$/) || text.match(/^\d+\.\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(text);
  }

  flushParagraph();
  closeList();
  return html.join('') || `<p>${escapeHtml(t('note.emptyDetail'))}</p>`;
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
