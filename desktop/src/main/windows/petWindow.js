/**
 * 桌宠窗口：320×360 透明无边框常驻
 *
 * 尺寸属于「不可触碰」的既有行为，改动前请看 CLAUDE.md 第 8 节与 docs/REFACTOR_PROMPT.md 2.5。
 */
const { app, BrowserWindow, Menu, screen } = require('electron');
const { PET_HTML, PRELOAD, ICON } = require('../core/paths');
const { hookConsole } = require('../core/logger');

const PET_SIZE = { width: 320, height: 360 };

function createPetWindow({ config, onTogglePanel, onMoved }) {
  const win = new BrowserWindow({
    width: PET_SIZE.width,
    height: PET_SIZE.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);

  // 恢复上次位置（并夹紧到工作区）
  const saved = config.get().petPos;
  if (saved) {
    const wa = screen.getPrimaryDisplay().workArea;
    const x = Math.min(Math.max(wa.x, saved.x), wa.x + wa.width - PET_SIZE.width);
    const y = Math.min(Math.max(wa.y, saved.y), wa.y + wa.height - PET_SIZE.height);
    win.setPosition(x, y);
  }

  win.loadFile(PET_HTML);
  win.once('ready-to-show', () => {
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
  });
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    onMoved({ x, y });
  });
  hookConsole(win.webContents, 'pet');

  // 右键菜单（角色图片区域）
  win.webContents.on('context-menu', (_event, params) => {
    Menu.buildFromTemplate([
      { label: '打开插件面板（双击也行）', click: () => onTogglePanel() },
      { label: '我是蓝色大肥鱼，很高兴见到你~', enabled: false },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]).popup({ window: win, x: Math.round(params.x), y: Math.round(params.y) });
  });

  return win;
}

module.exports = { createPetWindow, PET_SIZE };
