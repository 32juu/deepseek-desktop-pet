/**
 * 本地键值存储通道（store:get / store:set）
 */
const { ipcMain } = require('electron');

function registerStoreIpc({ localStore }) {
  ipcMain.handle('store:get', (_e, name) => localStore.get(String(name), null));
  ipcMain.handle('store:set', (_e, name, data) => {
    localStore.set(String(name), data);
    return true;
  });
}

module.exports = { registerStoreIpc };
