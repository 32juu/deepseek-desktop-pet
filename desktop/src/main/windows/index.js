/**
 * 窗口管理器：持有 petWin / panelWin / tray 引用，并对外提供桌宠状态推送能力
 *
 * 说明：窗口引用天然是可变状态，这里收敛在唯一一处，其他模块只通过 getter 访问。
 */
const { screen } = require('electron');
const { createPetWindow, PET_SIZE } = require('./petWindow');
const { createPanelWindow, PANEL_SIZE } = require('./panelWindow');
const { createTray } = require('./tray');

function createWindowManager({ config, onPetMoved }) {
  let petWin = null;
  let panelWin = null;
  let tray = null;

  function togglePanel() {
    if (!panelWin) return;
    if (panelWin.isVisible()) {
      panelWin.hide();
      return;
    }
    const pb = petWin ? petWin.getBounds() : { x: 100, y: 100, ...PET_SIZE };
    const wa = screen.getPrimaryDisplay().workArea;
    let x = pb.x + pb.width + 12;
    let y = pb.y - 120;
    x = Math.min(Math.max(wa.x, x), wa.x + wa.width - PANEL_SIZE.width - 8);
    y = Math.min(Math.max(wa.y, y), wa.y + wa.height - PANEL_SIZE.height - 8);
    panelWin.setPosition(x, y);
    panelWin.show();
    panelWin.focus();
  }

  /** 仅面板可见时推送（定时器 tick / done 用，避免给隐藏窗口发消息） */
  function sendToPanel(channel, payload) {
    if (panelWin && panelWin.isVisible()) panelWin.webContents.send(channel, payload);
  }

  /** 只要面板存在就推送（panel:ready 回放当前定时器状态用） */
  function postToPanel(channel, payload) {
    if (panelWin) panelWin.webContents.send(channel, payload);
  }

  // ---- 桌宠状态推送（对应 pet:base-state / pet:flash / pet:bubble）----
  function setPetBase(state) {
    if (petWin) petWin.webContents.send('pet:base-state', state);
  }
  function petFlash(state, ms) {
    if (petWin) petWin.webContents.send('pet:flash', state, ms);
  }
  function bubble(text, ms) {
    if (petWin) petWin.webContents.send('pet:bubble', text, ms);
  }

  function create() {
    petWin = createPetWindow({
      config,
      onTogglePanel: () => togglePanel(),
      onMoved: (pos) => onPetMoved(pos)
    });
    panelWin = createPanelWindow();
    tray = createTray({ onTogglePanel: () => togglePanel() });
    return { petWin, panelWin, tray };
  }

  return {
    create,
    togglePanel,
    sendToPanel,
    postToPanel,
    setPetBase,
    petFlash,
    bubble,
    getPetWin: () => petWin,
    getPanelWin: () => panelWin,
    getTray: () => tray
  };
}

module.exports = { createWindowManager };
