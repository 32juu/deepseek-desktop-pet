/**
 * 日志：主进程统一出口
 *
 * 前缀沿用重构前的 [pet] / [panel] / [main]，便于对照历史日志排查问题。
 */
function log(tag, ...args) {
  console.log('[' + tag + ']', ...args);
}

/**
 * 转发渲染层日志到主进程控制台
 * 注意：Electron 33 的 console-message 事件签名与旧版不同，这里做兼容处理
 */
function hookConsole(webContents, tag) {
  webContents.on('console-message', (_event, a, b) => {
    // Electron < 35: (event, level, message)；>= 35: (event, details)
    const msg = typeof a === 'string' ? a : (b && b.message) || (a && a.message) || '';
    if (msg) log(tag, msg);
  });
  webContents.on('did-fail-load', (_event, code, desc, url) => {
    log(tag, '加载失败', code, desc, url);
  });
}

module.exports = { log, hookConsole };
