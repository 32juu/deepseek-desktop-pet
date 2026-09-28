/**
 * IPC 统一注册入口：按业务域拆分文件，新增能力只改对应域 + 在本文件挂载
 */
const { registerStoreIpc } = require('./store');
const { registerConfigIpc } = require('./config');
const { registerTimerIpc } = require('./timer');
const { registerAiIpc } = require('./ai');
const { registerSystemIpc } = require('./system');

function registerIpc(deps) {
  registerStoreIpc(deps);
  registerConfigIpc(deps);
  registerTimerIpc(deps);
  registerAiIpc(deps);
  registerSystemIpc(deps);
}

module.exports = { registerIpc };
