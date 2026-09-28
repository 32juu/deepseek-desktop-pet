/**
 * 定时器通道（timer:start / pause / resume / reset / status）
 */
const { ipcMain } = require('electron');

function registerTimerIpc({ timer }) {
  ipcMain.handle('timer:start', (_e, minutes, label) => timer.start(minutes, label));
  ipcMain.handle('timer:pause', () => timer.pause());
  ipcMain.handle('timer:resume', () => timer.resume());
  ipcMain.handle('timer:reset', () => timer.reset());
  ipcMain.handle('timer:status', () => timer.status());
}

module.exports = { registerTimerIpc };
