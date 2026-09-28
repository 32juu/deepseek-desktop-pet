/**
 * 定时器服务：在主进程计时（关掉面板也不中断）
 *
 * 依赖全部注入，便于单测；对外只暴露操作与状态查询。
 */
const { showNotification } = require('../core/notify');

function createTimerService({ setBase, flash, bubble, sendToPanel }) {
  const timer = { total: 0, left: 0, running: false, label: '' };
  let timerInterval = null;

  function payload() {
    return { total: timer.total, left: timer.left, running: timer.running, label: timer.label };
  }

  function finish() {
    clearInterval(timerInterval);
    timer.running = false;
    timer.left = 0;
    sendToPanel('timer:done', payload());
    showNotification('时间到啦~', '「' + timer.label + '」已完成，休息一下吧！');
    flash('done', 6000);
    bubble('叮！时间到啦，休息一下吧~', 6000);
    setBase('idle');
  }

  function tick() {
    if (!timer.running) return;
    timer.left -= 1;
    sendToPanel('timer:tick', payload());
    if (timer.left <= 0) finish();
  }

  function start(minutes, label) {
    clearInterval(timerInterval);
    const m = Math.max(0.1, Number(minutes) || 0);
    timer.total = timer.left = Math.round(m * 60);
    timer.running = true;
    timer.label = label || m + ' 分钟定时';
    timerInterval = setInterval(tick, 1000);
    setBase('working');
    bubble('开始「' + timer.label + '」，加油哦~', 4000);
    return payload();
  }

  function pause() {
    timer.running = false;
    clearInterval(timerInterval);
    if (timer.left > 0) setBase('idle');
    return payload();
  }

  function resume() {
    if (timer.left > 0 && !timer.running) {
      timer.running = true;
      clearInterval(timerInterval);
      timerInterval = setInterval(tick, 1000);
      setBase('working');
    }
    return payload();
  }

  function reset() {
    clearInterval(timerInterval);
    timer.total = 0;
    timer.left = 0;
    timer.running = false;
    timer.label = '';
    setBase('idle');
    return payload();
  }

  return {
    start,
    pause,
    resume,
    reset,
    status: payload,
    isRunning: () => timer.running
  };
}

module.exports = { createTimerService };
