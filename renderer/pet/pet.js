/**
 * 桌宠渲染层：八种形象状态机 + 气泡 + 交互
 *
 * 状态说明（对应插画八形态）：
 *  - 基础态(base)：idle(待机) / thinking(AI思考) / working(定时器运行) / sleeping(长时间无操作)
 *  - 闪现态(flash)：done(完成) / encourage(鼓励) / confused(疑惑)，显示数秒后自动回到基础态
 *  - 悬停态：idle 基础态下鼠标悬停 -> assistant(桌面助手/悬浮)
 */
const SPRITES = {
  idle: 'idle.png',           // 待机/互动
  thinking: 'thinking.png',   // 思考中
  working: 'working.png',     // 工作中
  done: 'done.png',           // 完成/轻松
  sleeping: 'sleeping.png',   // 休息/睡觉
  confused: 'confused.png',   // 疑惑/惊讶
  encourage: 'encourage.png', // 鼓励/加油
  assistant: 'assistant.png'  // 桌面助手/悬浮
};

const IMG = document.getElementById('pet');
const BUBBLE = document.getElementById('bubble');
const BUBBLE_TEXT = document.getElementById('bubble-text');

let base = 'idle';
let flashState = null;
let hover = false;
let flashTimer = null;
let bubbleTimer = null;
let sleepTimer = null;
const IDLE_SLEEP_MS = 5 * 60 * 1000; // 5 分钟无操作进入睡觉

function render() {
  const s = flashState || (hover && base === 'idle' ? 'assistant' : base);
  IMG.src = '../../assets/sprites/' + SPRITES[s];
}

function setBase(s) {
  if (!SPRITES[s]) return;
  base = s;
  resetSleep();
  render();
}

function flash(s, ms) {
  if (!SPRITES[s]) return;
  flashState = s;
  clearTimeout(flashTimer);
  render();
  IMG.classList.remove('flash');
  void IMG.offsetWidth; // 重新触发动画
  IMG.classList.add('flash');
  flashTimer = setTimeout(() => {
    flashState = null;
    render();
  }, ms || 3000);
  resetSleep();
}

function showBubble(text, ms) {
  if (!text) return;
  BUBBLE_TEXT.textContent = text;
  BUBBLE.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => BUBBLE.classList.add('hidden'), ms || 3000);
  resetSleep();
}

function resetSleep() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (base === 'idle' && !flashState) {
      base = 'sleeping';
      render();
      showBubble('晚安~ 明天继续哦', 3500);
    }
  }, IDLE_SLEEP_MS);
}

// ---------- 交互 ----------
const CLICK_PHRASES = [
  '加油！你可以的！',
  '今天也要元气满满哦~',
  '双击我可以打开插件面板',
  '记得多喝水、休息眼睛~',
  '有我在，放心干活吧！',
  '嘿嘿，需要帮忙就叫我~'
];

IMG.addEventListener('mouseenter', () => {
  hover = true;
  if (base === 'sleeping') {        // 悬停唤醒
    base = 'idle';
    showBubble('早上好呀~', 2200);
  }
  render();
  if (base === 'idle' && !flashState) showBubble('有什么需要我帮忙的吗？', 2200);
});

IMG.addEventListener('mouseleave', () => {
  hover = false;
  render();
});

IMG.addEventListener('click', () => {
  if (base === 'sleeping') {        // 点击唤醒
    base = 'idle';
    render();
    showBubble('唔…我醒啦~', 2200);
    return;
  }
  showBubble(CLICK_PHRASES[Math.floor(Math.random() * CLICK_PHRASES.length)], 2500);
});

IMG.addEventListener('dblclick', () => {
  window.petAPI.requestPanelToggle();
});

// ---------- 主进程事件 ----------
window.petAPI.onBaseState(setBase);
window.petAPI.onFlash(flash);
window.petAPI.onBubble(showBubble);

render();
resetSleep();
