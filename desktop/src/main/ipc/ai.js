/**
 * AI 通道（ai:chat / ai:translate / ai:summarize）与庆祝动作（pet:celebrate）
 *
 * 约定：进入 AI 请求前置 thinking，结束后回到 working（定时器运行中）或 idle。
 */
const { ipcMain } = require('electron');

function registerAiIpc({ ai, timer, windows }) {
  function afterAi() {
    windows.setPetBase(timer.isRunning() ? 'working' : 'idle');
  }

  ipcMain.handle('ai:chat', async (_e, messages) => {
    windows.setPetBase('thinking');
    try {
      const list = (Array.isArray(messages) ? messages : [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
        .slice(-10)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
      const content = await ai.chat([{ role: 'system', content: ai.CHAT_SYSTEM_PROMPT }, ...list]);
      return { ok: true, content };
    } catch (err) {
      windows.petFlash('confused', 3000);
      windows.bubble('咦？出了点小问题…', 3000);
      return { ok: false, error: err.message };
    } finally {
      afterAi();
    }
  });

  ipcMain.handle('ai:translate', async (_e, text) => {
    windows.setPetBase('thinking');
    try {
      const r = await ai.translate(String(text || '').trim());
      windows.petFlash('done', 2000);
      return Object.assign({ ok: true }, r);
    } catch (err) {
      windows.petFlash('confused', 3000);
      return { ok: false, error: err.message };
    } finally {
      afterAi();
    }
  });

  ipcMain.handle('ai:summarize', async (_e, text) => {
    windows.setPetBase('thinking');
    try {
      const r = await ai.summarize(String(text || ''));
      windows.petFlash('done', 2000);
      return Object.assign({ ok: true }, r);
    } catch (err) {
      windows.petFlash('confused', 3000);
      return { ok: false, error: err.message };
    } finally {
      afterAi();
    }
  });

  ipcMain.handle('pet:celebrate', (_e, text) => {
    windows.petFlash('encourage', 4000);
    if (text) windows.bubble(String(text), 4000);
    return true;
  });
}

module.exports = { registerAiIpc };
