/**
 * 蓝色大肥鱼桌宠 - Electron 主进程装配层
 *
 * 本文件只负责：初始化顺序、生命周期、单实例锁。
 * 具体能力与 IPC 通道分布在 core/ stores/ services/ windows/ ipc/ 下。
 */
const { app } = require('electron');
const { createLocalStore } = require('./stores/localStore');
const { createConfig } = require('./core/config');
const { createWindowManager } = require('./windows');
const { createTimerService } = require('./services/timerService');
const { createAiService } = require('./services/aiService');
const { showNotification } = require('./core/notify');
const { registerIpc } = require('./ipc');
const { log } = require('./core/logger');

const SMOKE_EXIT_DELAY_MS = 6000;

let windows = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const petWin = windows && windows.getPetWin();
    if (petWin) petWin.show();
    const panelWin = windows && windows.getPanelWin();
    if (!panelWin || !panelWin.isVisible()) windows.togglePanel();
  });

  app.whenReady().then(() => {
    // 1) 存储与配置
    const localStore = createLocalStore(app.getPath('userData'));
    const config = createConfig(localStore);
    config.load();
    app.setAppUserModelId('com.deepseek.desktoppet');

    // 2) 窗口（持有引用，并提供桌宠状态推送能力）
    windows = createWindowManager({ config, onPetMoved: (pos) => config.setPos(pos) });

    // 3) 服务
    const timer = createTimerService({
      setBase: (s) => windows.setPetBase(s),
      flash: (s, ms) => windows.petFlash(s, ms),
      bubble: (text, ms) => windows.bubble(text, ms),
      sendToPanel: (channel, payload) => windows.sendToPanel(channel, payload)
    });
    const ai = createAiService({ getConfig: () => config.get() });

    // 4) IPC（窗口创建前注册，避免渲染层抢先调用）
    registerIpc({ localStore, config, windows, timer, ai, showNotification });

    // 5) 创建窗口与托盘
    windows.create();


    // 冒烟测试模式（CI/无头环境验证启动链路）
    if (process.env.PET_SMOKE) {
      setTimeout(() => {
        console.log('SMOKE_OK');
        app.quit();
      }, SMOKE_EXIT_DELAY_MS);
    }
  });

  app.on('window-all-closed', () => {
    /* 桌宠常驻，不随窗口关闭退出 */
  });

  process.on('uncaughtException', (err) => {
    log('main', 'uncaught:', err && err.message);
  });
}
