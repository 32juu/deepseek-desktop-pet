/**
 * 系统 / 窗口类通道：面板开关、长按拖拽、通知、退出
 */
const { app, ipcMain } = require('electron');

function registerSystemIpc({ windows, timer, showNotification }) {
  ipcMain.handle('pet:request-panel', () => windows.togglePanel());

  // 长按拖拽：渲染层在角色图片上长按后，把鼠标位移增量发过来移动窗口（高频，用 send 不用 invoke）
  ipcMain.on('pet:drag-move', (_e, dx, dy) => {
    const win = windows.getPetWin();
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });

  ipcMain.handle('panel:close', () => {
    const panel = windows.getPanelWin();
    if (panel) panel.hide();
  });

  ipcMain.handle('panel:ready', () => {
    windows.postToPanel('timer:tick', timer.status());
    return true;
  });

  ipcMain.handle('notify', (_e, title, body) => showNotification(title, body));

  ipcMain.handle('app:quit', () => app.quit());
}

module.exports = { registerSystemIpc };
