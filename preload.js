/**
 * 预加载脚本：以安全方式向渲染层暴露 IPC 接口
 */
const { contextBridge, ipcRenderer } = require('electron');

// 订阅主进程事件，返回取消订阅函数
function on(channel, cb) {
  const handler = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('petAPI', {
  // ---- 通用 ----
  storeGet: (name) => ipcRenderer.invoke('store:get', name),
  storeSet: (name, data) => ipcRenderer.invoke('store:set', name, data),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),

  // ---- 桌宠窗口 ----
  requestPanelToggle: () => ipcRenderer.invoke('pet:request-panel'),
  dragMove: (dx, dy) => ipcRenderer.send('pet:drag-move', dx, dy),
  onBaseState: (cb) => on('pet:base-state', cb),
  onFlash: (cb) => on('pet:flash', cb),
  onBubble: (cb) => on('pet:bubble', cb),

  // ---- 插件面板窗口 ----
  panelReady: () => ipcRenderer.invoke('panel:ready'),
  panelClose: () => ipcRenderer.invoke('panel:close'),
  onTimerTick: (cb) => on('timer:tick', cb),
  onTimerDone: (cb) => on('timer:done', cb),
  timerStart: (minutes, label) => ipcRenderer.invoke('timer:start', minutes, label),
  timerPause: () => ipcRenderer.invoke('timer:pause'),
  timerResume: () => ipcRenderer.invoke('timer:resume'),
  timerReset: () => ipcRenderer.invoke('timer:reset'),
  timerStatus: () => ipcRenderer.invoke('timer:status'),

  // ---- AI 能力 ----
  aiChat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  aiTranslate: (text) => ipcRenderer.invoke('ai:translate', text),
  aiSummarize: (text) => ipcRenderer.invoke('ai:summarize', text),
  petCelebrate: (text) => ipcRenderer.invoke('pet:celebrate', text),

  // ---- 设置 ----
  configGet: () => ipcRenderer.invoke('config:get'),
  configSet: (patch) => ipcRenderer.invoke('config:set', patch),
  setAutostart: (on) => ipcRenderer.invoke('app:set-autostart', on)
});
