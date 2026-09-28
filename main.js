/**
 * 蓝色大肥鱼桌宠 - Electron 主进程
 * 职责：桌宠窗口 / 插件面板窗口 / 托盘 / 定时器 / DeepSeek API / 本地存储 / IPC 路由
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const ASSETS = path.join(ROOT, 'assets');
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const PANEL_SIZE = { width: 420, height: 640 };

let petWin = null;
let panelWin = null;
let tray = null;

// ---------------- 本地存储（userData 下 JSON 文件） ----------------
let userDataDir = '';
function storePath(name) { return path.join(userDataDir, name + '.json'); }
function storeGet(name, def) {
  try { return JSON.parse(fs.readFileSync(storePath(name), 'utf8')); }
  catch { return def; }
}
function storeSet(name, data) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(storePath(name), JSON.stringify(data, null, 2), 'utf8');
}
let config = { apiKey: '', model: 'deepseek-chat', petPos: null };
function loadConfig() {
  config = Object.assign({ apiKey: '', model: 'deepseek-chat', petPos: null }, storeGet('config', {}));
}
function saveConfig() { storeSet('config', config); }

// ---------------- 桌宠窗口 ----------------
function createPetWindow() {
  petWin = new BrowserWindow({
    width: 320,
    height: 360,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  petWin.setMenuBarVisibility(false);

  // 恢复上次位置（并夹紧到工作区）
  if (config.petPos) {
    const wa = screen.getPrimaryDisplay().workArea;
    const x = Math.min(Math.max(wa.x, config.petPos.x), wa.x + wa.width - 320);
    const y = Math.min(Math.max(wa.y, config.petPos.y), wa.y + wa.height - 360);
    petWin.setPosition(x, y);
  }

  petWin.loadFile(path.join(ROOT, 'renderer', 'pet', 'index.html'));
  petWin.once('ready-to-show', () => {
    petWin.show();
    petWin.setAlwaysOnTop(true, 'screen-saver');
  });
  petWin.on('moved', () => {
    if (!petWin) return;
    const [x, y] = petWin.getPosition();
    config.petPos = { x, y };
    saveConfig();
  });
  hookConsole(petWin.webContents, 'pet');

  // 右键菜单（角色图片区域）
  petWin.webContents.on('context-menu', (_event, params) => {
    Menu.buildFromTemplate([
      { label: '打开插件面板（双击也行）', click: () => togglePanel() },
      { label: '我是蓝色大肥鱼，很高兴见到你~', enabled: false },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]).popup({ window: petWin, x: Math.round(params.x), y: Math.round(params.y) });
  });
}

// ---------------- 插件面板窗口 ----------------
function createPanelWindow() {
  panelWin = new BrowserWindow({
    width: PANEL_SIZE.width,
    height: PANEL_SIZE.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  panelWin.setMenuBarVisibility(false);
  panelWin.loadFile(path.join(ROOT, 'renderer', 'panel', 'index.html'));
  hookConsole(panelWin.webContents, 'panel');
}

function togglePanel() {
  if (!panelWin) return;
  if (panelWin.isVisible()) { panelWin.hide(); return; }
  const pb = petWin ? petWin.getBounds() : { x: 100, y: 100, width: 320, height: 360 };
  const wa = screen.getPrimaryDisplay().workArea;
  let x = pb.x + pb.width + 12;
  let y = pb.y - 120;
  x = Math.min(Math.max(wa.x, x), wa.x + wa.width - PANEL_SIZE.width - 8);
  y = Math.min(Math.max(wa.y, y), wa.y + wa.height - PANEL_SIZE.height - 8);
  panelWin.setPosition(x, y);
  panelWin.show();
  panelWin.focus();
}

// ---------------- 托盘 ----------------
function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
    tray.setToolTip('蓝色大肥鱼桌宠');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开插件面板', click: () => togglePanel() },
      { label: '双击桌宠也可以打开哦', enabled: false },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]));
    tray.on('click', () => togglePanel());
  } catch (err) {
    console.log('[tray] 托盘不可用:', err.message);
  }
}

// ---------------- 桌宠状态控制 ----------------
function setPetBase(state) { if (petWin) petWin.webContents.send('pet:base-state', state); }
function petFlash(state, ms) { if (petWin) petWin.webContents.send('pet:flash', state, ms); }
function bubble(text, ms) { if (petWin) petWin.webContents.send('pet:bubble', text, ms); }

// ---------------- 定时器（主进程计时，关面板也不中断） ----------------
const timer = { total: 0, left: 0, running: false, label: '' };
let timerInterval = null;
function timerPayload() { return { total: timer.total, left: timer.left, running: timer.running, label: timer.label }; }
function startTimer(minutes, label) {
  clearInterval(timerInterval);
  const m = Math.max(0.1, Number(minutes) || 0);
  timer.total = timer.left = Math.round(m * 60);
  timer.running = true;
  timer.label = label || (m + ' 分钟定时');
  timerInterval = setInterval(timerTick, 1000);
  setPetBase('working');
  bubble('开始「' + timer.label + '」，加油哦~', 4000);
}
function timerTick() {
  if (!timer.running) return;
  timer.left -= 1;
  if (panelWin && panelWin.isVisible()) panelWin.webContents.send('timer:tick', timerPayload());
  if (timer.left <= 0) finishTimer();
}
function finishTimer() {
  clearInterval(timerInterval);
  timer.running = false;
  timer.left = 0;
  if (panelWin && panelWin.isVisible()) panelWin.webContents.send('timer:done', timerPayload());
  if (Notification.isSupported()) {
    new Notification({
      title: '时间到啦~',
      body: '「' + timer.label + '」已完成，休息一下吧！',
      icon: path.join(ASSETS, 'icon.png')
    }).show();
  }
  petFlash('done', 6000);
  bubble('叮！时间到啦，休息一下吧~', 6000);
  setPetBase('idle');
}

// ---------------- DeepSeek API ----------------
const CHAT_SYSTEM_PROMPT =
  '你是桌宠"蓝色大肥鱼"，一只热爱帮助主人的蓝色大肥鱼女仆。' +
  '回答要简洁、可爱、口语化，一般不超过 120 字，可以适当使用颜文字或 emoji。';

function requireApiKey() {
  if (!config.apiKey) throw new Error('未配置 DeepSeek API Key，请打开插件面板 ->「设置」填写');
}

async function deepseekChat(messages, opts = {}) {
  requireApiKey();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60000);
  const body = {
    model: config.model || 'deepseek-chat',
    messages,
    max_tokens: opts.maxTokens || 1024
  };
  if (config.model === 'deepseek-reasoner') {
    // reasoner 不支持 temperature / response_format
  } else {
    body.temperature = opts.temperature != null ? opts.temperature : 1.3;
    if (opts.json) body.response_format = { type: 'json_object' };
  }
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error('DeepSeek 接口错误 ' + res.status + ': ' + txt.slice(0, 160));
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    return (content || '').trim();
  } finally {
    clearTimeout(t);
  }
}

function isZh(text) { return /[\u4e00-\u9fff]/.test(text); }

async function translateText(text) {
  if (config.apiKey) {
    const out = await deepseekChat([
      { role: 'system', content: '你是中英翻译引擎。中文译成英文，英文译成中文；保持原文语气，只输出译文，不要任何解释或前缀。' },
      { role: 'user', content: text.slice(0, 4000) }
    ], { temperature: 1.3 });
    return { text: out, engine: 'DeepSeek' };
  }
  // 未配置 Key 时的免费兜底引擎
  const pair = isZh(text) ? 'zh-CN|en-US' : 'en-US|zh-CN';
  const res = await fetch('https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text.slice(0, 480)) + '&langpair=' + pair);
  if (!res.ok) throw new Error('翻译服务暂时不可用 (' + res.status + ')');
  const data = await res.json();
  const out = data && data.responseData && data.responseData.translatedText;
  if (!out) throw new Error('翻译失败，请稍后再试');
  return { text: out, engine: 'MyMemory(免费兜底)' };
}

function localSummary(text) {
  const sentences = text.replace(/\s+/g, ' ')
    .split(/(?<=[。！？!?；;])/).map(s => s.trim()).filter(Boolean);
  let summary = sentences.slice(0, 2).join('');
  if (summary.length > 80) summary = summary.slice(0, 77) + '...';
  const cats = {
    '工作': ['会议', '项目', '需求', '上线', 'bug', '排期', '客户', '汇报', '周报', '评审'],
    '学习': ['考试', '复习', '课程', '作业', '论文', '单词', '看书', '笔记', '网课'],
    '生活': ['买菜', '快递', '运动', '做饭', '家务', '理发', '看病', '聚会'],
    '灵感': ['想法', '点子', '创意', '灵感', '设计', '方案']
  };
  let category = '其他';
  for (const [c, kws] of Object.entries(cats)) {
    if (kws.some(k => text.includes(k))) { category = c; break; }
  }
  const stop = new Set(['我们', '你们', '他们', '这个', '那个', '一个', '已经', '所以', '但是', '可以', '就是', '还有', '现在', '时候', '因为', '如果']);
  const freq = {};
  (text.match(/[\u4e00-\u9fff]{2,4}/g) || []).forEach(w => {
    if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1;
  });
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
  return { summary: summary || text.slice(0, 50), category, keywords };
}

async function summarizeNote(text) {
  if (config.apiKey) {
    const out = await deepseekChat([
      { role: 'system', content: '你是笔记整理助手。对用户给出的笔记做总结并分类。只输出 JSON，格式：{"summary":"80字以内的总结","category":"工作|学习|生活|灵感 之一","keywords":["关键词1","关键词2","关键词3"]}' },
      { role: 'user', content: text.slice(0, 6000) }
    ], { temperature: 1.3, json: true });
    let obj = null;
    try { obj = JSON.parse(out); }
    catch { const m = out.match(/\{[\s\S]*\}/); if (m) obj = JSON.parse(m[0]); }
    if (!obj || !obj.summary) throw new Error('AI 返回格式异常，请重试');
    const category = ['工作', '学习', '生活', '灵感'].includes(obj.category) ? obj.category : '其他';
    return { summary: String(obj.summary), category, keywords: (obj.keywords || []).slice(0, 3).map(String) };
  }
  return Object.assign({ engine: '本地(未配置Key)' }, localSummary(text));
}

// ---------------- IPC ----------------
function afterAi() {
  if (timer.running) setPetBase('working'); else setPetBase('idle');
}
function registerIpc() {
  ipcMain.handle('pet:request-panel', () => togglePanel());

  // 长按拖拽：渲染层在角色图片上长按后，把鼠标位移增量发过来移动窗口
  ipcMain.on('pet:drag-move', (_e, dx, dy) => {
    if (!petWin) return;
    const [x, y] = petWin.getPosition();
    petWin.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.handle('panel:close', () => { if (panelWin) panelWin.hide(); });
  ipcMain.handle('panel:ready', () => {
    if (panelWin) panelWin.webContents.send('timer:tick', timerPayload());
    return true;
  });

  ipcMain.handle('store:get', (_e, name) => storeGet(String(name), null));
  ipcMain.handle('store:set', (_e, name, data) => { storeSet(String(name), data); return true; });

  ipcMain.handle('config:get', () => ({
    apiKey: config.apiKey,
    model: config.model,
    autostart: !!app.getLoginItemSettings().openAtLogin
  }));
  ipcMain.handle('config:set', (_e, patch) => {
    patch = patch || {};
    if (typeof patch.apiKey === 'string') config.apiKey = patch.apiKey.trim();
    if (typeof patch.model === 'string') config.model = patch.model;
    saveConfig();
    return { apiKey: config.apiKey, model: config.model };
  });
  ipcMain.handle('app:set-autostart', (_e, on) => {
    try { app.setLoginItemSettings({ openAtLogin: !!on }); } catch (err) { console.log(err.message); }
    return !!app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('timer:start', (_e, minutes, label) => { startTimer(minutes, label); return timerPayload(); });
  ipcMain.handle('timer:pause', () => {
    timer.running = false;
    clearInterval(timerInterval);
    if (timer.left > 0) setPetBase('idle');
    return timerPayload();
  });
  ipcMain.handle('timer:resume', () => {
    if (timer.left > 0 && !timer.running) {
      timer.running = true;
      clearInterval(timerInterval);
      timerInterval = setInterval(timerTick, 1000);
      setPetBase('working');
    }
    return timerPayload();
  });
  ipcMain.handle('timer:reset', () => {
    clearInterval(timerInterval);
    timer.total = 0; timer.left = 0; timer.running = false; timer.label = '';
    setPetBase('idle');
    return timerPayload();
  });
  ipcMain.handle('timer:status', () => timerPayload());

  ipcMain.handle('ai:chat', async (_e, messages) => {
    setPetBase('thinking');
    try {
      const list = (Array.isArray(messages) ? messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
        .slice(-10)
        .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
      const content = await deepseekChat([{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...list]);
      return { ok: true, content };
    } catch (err) {
      petFlash('confused', 3000);
      bubble('咦？出了点小问题…', 3000);
      return { ok: false, error: err.message };
    } finally {
      afterAi();
    }
  });

  ipcMain.handle('ai:translate', async (_e, text) => {
    setPetBase('thinking');
    try {
      const r = await translateText(String(text || '').trim());
      petFlash('done', 2000);
      return Object.assign({ ok: true }, r);
    } catch (err) {
      petFlash('confused', 3000);
      return { ok: false, error: err.message };
    } finally {
      afterAi();
    }
  });

  ipcMain.handle('ai:summarize', async (_e, text) => {
    setPetBase('thinking');
    try {
      const r = await summarizeNote(String(text || ''));
      petFlash('done', 2000);
      return Object.assign({ ok: true }, r);
    } catch (err) {
      petFlash('confused', 3000);
      return { ok: false, error: err.message };
    } finally {
      afterAi();
    }
  });

  ipcMain.handle('pet:celebrate', (_e, text) => {
    petFlash('encourage', 4000);
    if (text) bubble(String(text), 4000);
    return true;
  });

  ipcMain.handle('notify', (_e, title, body) => {
    if (Notification.isSupported()) {
      new Notification({ title: String(title || '提示'), body: String(body || ''), icon: path.join(ASSETS, 'icon.png') }).show();
    }
    return true;
  });

  ipcMain.handle('app:quit', () => app.quit());
}

// ---------------- 渲染层日志转发（便于排查问题） ----------------
function hookConsole(wc, tag) {
  wc.on('console-message', (e, a, b) => {
    // Electron < 35: (event, level, message)；>= 35: (event, details)
    const msg = typeof a === 'string' ? a : (b && b.message) || (a && a.message) || '';
    if (msg) console.log('[' + tag + ']', msg);
  });
  wc.on('did-fail-load', (_e, code, desc, url) => {
    console.log('[' + tag + '] 加载失败', code, desc, url);
  });
}

// ---------------- 应用生命周期 ----------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWin) petWin.show();
    if (!panelWin || !panelWin.isVisible()) togglePanel();
  });

  app.whenReady().then(() => {
    userDataDir = app.getPath('userData');
    loadConfig();
    app.setAppUserModelId('com.deepseek.desktoppet');
    registerIpc();
    createPetWindow();
    createPanelWindow();
    createTray();

    // 冒烟测试模式（CI/无头环境验证启动）
    if (process.env.PET_SMOKE) {
      setTimeout(() => { console.log('SMOKE_OK'); app.quit(); }, 6000);
    }
  });

  app.on('window-all-closed', () => { /* 桌宠常驻，不随窗口关闭退出 */ });

  process.on('uncaughtException', (err) => {
    console.log('[main] uncaught:', err && err.message);
  });
}
