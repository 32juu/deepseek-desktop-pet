/**
 * 配置通道（config:get / config:set）与开机自启（app:set-autostart）
 */
const { app, ipcMain } = require('electron');
const { log } = require('../core/logger');

function registerConfigIpc({ config }) {
  ipcMain.handle('config:get', () => {
    const c = config.get();
    return {
      apiKey: c.apiKey,
      model: c.model,
      autostart: !!app.getLoginItemSettings().openAtLogin
    };
  });

  ipcMain.handle('config:set', (_e, patch) => config.patch(patch));

  ipcMain.handle('app:set-autostart', (_e, on) => {
    try {
      app.setLoginItemSettings({ openAtLogin: !!on });
    } catch (err) {
      log('main', err.message);
    }
    return !!app.getLoginItemSettings().openAtLogin;
  });
}

module.exports = { registerConfigIpc };
