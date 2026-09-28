/**
 * 系统通知封装（定时器结束、插件主动通知都走这里）
 */
const { Notification } = require('electron');
const { ICON } = require('./paths');

function showNotification(title, body) {
  if (!Notification.isSupported()) return false;
  new Notification({
    title: String(title || '提示'),
    body: String(body || ''),
    icon: ICON
  }).show();
  return true;
}

module.exports = { showNotification };
