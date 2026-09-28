/**
 * 插件面板窗口：420×640 透明无边框，默认隐藏（由桌宠双击或托盘切换）
 */
const { BrowserWindow } = require('electron');
const { PANEL_HTML, PRELOAD, ICON } = require('../core/paths');
const { hookConsole } = require('../core/logger');

const PANEL_SIZE = { width: 420, height: 640 };

function createPanelWindow() {
  const win = new BrowserWindow({
    width: PANEL_SIZE.width,
    height: PANEL_SIZE.height,
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
  win.loadFile(PANEL_HTML);
  hookConsole(win.webContents, 'panel');
  return win;
}

module.exports = { createPanelWindow, PANEL_SIZE };
