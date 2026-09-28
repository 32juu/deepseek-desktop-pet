/**
 * 托盘图标：左键切换面板，右键菜单打开面板 / 退出
 */
const { Tray, Menu, nativeImage, app } = require('electron');
const { TRAY_ICON } = require('../core/paths');
const { log } = require('../core/logger');

function createTray({ onTogglePanel }) {
  try {
    const tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
    tray.setToolTip('蓝色大肥鱼桌宠');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开插件面板', click: () => onTogglePanel() },
        { label: '双击桌宠也可以打开哦', enabled: false },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
      ])
    );
    tray.on('click', () => onTogglePanel());
    return tray;
  } catch (err) {
    log('tray', '托盘不可用:', err.message);
    return null;
  }
}

module.exports = { createTray };
