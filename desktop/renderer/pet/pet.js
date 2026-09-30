/**
 * 桌宠渲染层：八种形象状态机 + 气泡 + 交互
 *
 * 状态说明（对应插画八形态）：
 *  - 基础态(base)：idle(待机，直接用「桌面助手/悬浮」形象) / thinking(AI思考) / working(定时器运行) / sleeping(长时间无操作)
 *  - 闪现态(flash)：done(完成) / encourage(鼓励) / confused(疑惑)，显示数秒后自动回到基础态
 *  - 已取消独立的 idle 形象：待机就显示桌面助手那一版插画
 *
 * 交互说明：
 *  - 长按（350ms）角色图片后拖动 -> 移动窗口（通过 IPC 让主进程移动）
 *  - 双击 -> 打开插件面板；单击 -> 随机卖萌语
 *  - 待机时气泡里那一行显示占位文字（与原插画观感一致），悬浮/点击后切换为就地输入框回车提问
 *    （插画上的原文案已像素级擦除，因此版面、UI 与原版完全一致，不额外增加弹窗）
 */
const SPRITES = {
  idle: 'assistant.png',      // 待机形象：直接用「桌面助手/悬浮」插画，气泡里那一行是可输入的就地输入框
  thinking: 'thinking.png',   // 思考中
  working: 'working.png',     // 工作中
  done: 'done.png',           // 完成/轻松
  sleeping: 'sleeping.png',   // 休息/睡觉
  confused: 'confused.png',   // 疑惑/惊讶
  encourage: 'encourage.png', // 鼓励/加油
  assistant: 'assistant.png'  // 助手形象本体（与 idle 同图，供状态名兼容）
};

// 助手形象的图片文件名：用于判断当前是否显示「带对话气泡」的那一版插画
const ASSISTANT_IMG = 'assistant.png';

const IMG = document.getElementById('pet');
const BUBBLE = document.getElementById('bubble');
const BUBBLE_TEXT = document.getElementById('bubble-text');
const PET_INPUT = document.getElementById('pet-input');
const PET_INLINE = document.getElementById('pet-inline');

let base = 'idle';
let flashState = null;
let hover = false;
let flashTimer = null;
let bubbleTimer = null;
let sleepTimer = null;
const IDLE_SLEEP_MS = 5 * 60 * 1000; // 5 分钟无操作进入睡觉

// 就地输入框状态（需要在 render/setBase 之前声明）
let inlineVisible = false;
let inlineBusy = false;
let inlineTimer = null;
let pendingBase = null;

function render() {
  const s = flashState || base;
  IMG.src = '../../assets/sprites/' + SPRITES[s];
  // 换成不带气泡的形象（思考/工作/睡觉/闪现）就收起那一行
  if (SPRITES[s] !== ASSISTANT_IMG && inlineVisible) hideInline();
}

function setBase(s) {
  if (!SPRITES[s]) return;
  if (inlineBusy) { pendingBase = s; return; }            // 对话期间保持悬浮形象
  base = s;
  resetSleep();
  render();
  syncIdleLine();
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
    syncIdleLine();
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
    if (base === 'idle' && !flashState && !inlineVisible) {
      base = 'sleeping';
      render();
      showBubble('晚安~ 明天继续哦', 3500);
    }
  }, IDLE_SLEEP_MS);
}

// ---------- 长按拖拽 ----------
const LONG_PRESS_MS = 350;
let pressTimer = null;
let dragging = false;
let suppressClick = false;
let lastX = 0, lastY = 0;

IMG.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  lastX = e.screenX; lastY = e.screenY;
  pressTimer = setTimeout(() => {
    dragging = true;
    suppressClick = true;   // 拖拽结束后吞掉这次点击
    document.body.classList.add('dragging');
  }, LONG_PRESS_MS);
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  lastX = e.screenX; lastY = e.screenY;
  if (dx || dy) window.petAPI.dragMove(dx, dy);
});

window.addEventListener('mouseup', () => {
  clearTimeout(pressTimer);
  if (dragging) {
    dragging = false;
    document.body.classList.remove('dragging');
  }
});

// ---------- 交互 ----------
const CLICK_PHRASES = [
  '加油！你可以的！',
  '今天也要元气满满哦~',
  '双击我可以打开插件面板',
  '记得多喝水、休息眼睛~',
  '有我在，放心干活吧！',
  '嘿嘿，需要帮忙就叫我~'
];

// ---------- 就地输入框（插画气泡内那一行） ----------
const NATIVE = { w: 399, h: 336 };                     // assistant.png 原始像素尺寸
const STRIP = { x0: 96, x1: 300, y0: 261, y1: 291 };   // 被擦除那一行的原始像素坐标
const DEFAULT_TEXT = '有什么需要我帮忙的吗？';
const chatLog = [];

// 由 CSS 尺寸上限 + 图片原始尺寸反推那一行相对插画左上角的偏移
// （不读取 getBoundingClientRect：各形象宽高比不同，且漂浮动画会带来位移）
// 图片与这一行同在 #pet-stage 内，因此按相对偏移定位即可一起漂浮且不错位
function placeInline() {
  const cs = getComputedStyle(IMG);
  const maxW = parseFloat(cs.maxWidth) || 296;
  const maxH = parseFloat(cs.maxHeight) || 318;
  const s = Math.min(maxW / NATIVE.w, maxH / NATIVE.h);   // 助手形象的实际缩放比
  const css = {
    left: (STRIP.x0 * s) + 'px',
    top: (STRIP.y0 * s) + 'px',
    width: ((STRIP.x1 - STRIP.x0) * s) + 'px',
    height: ((STRIP.y1 - STRIP.y0) * s) + 'px',
    lineHeight: ((STRIP.y1 - STRIP.y0) * s) + 'px',
    fontSize: Math.round(16 * s) + 'px'
  };
  [PET_INPUT, PET_INLINE].forEach(el => Object.assign(el.style, css));
}

/** 待机态：气泡里那一行显示占位文字，看起来与原插画完全一致（此时不可编辑） */
function showIdleLine() {
  if (base !== 'idle' || flashState || inlineBusy) return;
  clearTimeout(inlineTimer);
  inlineVisible = true;
  PET_INPUT.classList.remove('show');
  PET_INPUT.value = DEFAULT_TEXT;
  PET_INLINE.textContent = DEFAULT_TEXT;
  PET_INLINE.title = '';
  render();
  placeInline();
  PET_INLINE.classList.add('show');
  resetSleep();
}

/** 基础态回到待机时，把那一行恢复成占位文字 */
function syncIdleLine() {
  if (base === 'idle' && !flashState && !inlineBusy) showIdleLine();
}

function showInput() {
  if (base !== 'idle' || flashState || inlineBusy) return;
  clearTimeout(inlineTimer);
  inlineVisible = true;
  PET_INLINE.classList.remove('show');
  if (!PET_INPUT.value) PET_INPUT.value = DEFAULT_TEXT;
  render();
  placeInline();
  PET_INPUT.classList.add('show');
  resetSleep();
}

function showInlineText(text) {
  clearTimeout(inlineTimer);
  inlineVisible = true;
  PET_INPUT.classList.remove('show');
  PET_INLINE.textContent = text;
  PET_INLINE.title = text;
  render();
  placeInline();
  PET_INLINE.classList.add('show');
  resetSleep();
}

function hideInline() {
  clearTimeout(inlineTimer);
  inlineVisible = false;
  PET_INPUT.classList.remove('show');
  PET_INLINE.classList.remove('show');
  PET_INPUT.blur();
  PET_INLINE.textContent = '';
  if (!hover) render();
}

function scheduleHideInline() {
  clearTimeout(inlineTimer);
  inlineTimer = setTimeout(() => {
    if (inlineBusy || document.activeElement === PET_INPUT) return;
    // 用户已经改写了内容就不要悄悄清掉，保持输入框让他继续编辑
    if (PET_INPUT.value && PET_INPUT.value !== DEFAULT_TEXT) return;
    syncIdleLine();      // 回到占位文字（非待机态时 syncIdleLine 内部会直接返回）
  }, 400);
}

async function sendInline() {
  const text = PET_INPUT.value.trim();
  if (!text || inlineBusy) return;
  inlineBusy = true;
  PET_INPUT.blur();
  showInlineText('思考中…');
  chatLog.push({ role: 'user', content: text });
  const r = await window.petAPI.aiChat(chatLog.slice(-6));
  if (r && r.ok) {
    chatLog.push({ role: 'assistant', content: r.content });
    showInlineText(String(r.content).replace(/\s+/g, ' '));
  } else {
    chatLog.pop();                       // 失败则不保留这条上下文
    showInlineText('咦？出了点小问题…');
  }
  inlineBusy = false;
  if (pendingBase) { base = pendingBase; pendingBase = null; }
  render();
  clearTimeout(inlineTimer);
  inlineTimer = setTimeout(() => {
    if (document.activeElement !== PET_INPUT) syncIdleLine();   // 看几秒后回到待机占位文字
  }, 6000);
}

IMG.addEventListener('mouseenter', () => {
  hover = true;
  if (base === 'sleeping') {        // 悬停唤醒
    base = 'idle';
    showBubble('早上好呀~', 2200);
  }
  render();
  if (base === 'idle' && !flashState) showInput();   // 悬浮 -> 占位文字切换为可编辑输入框
});

IMG.addEventListener('mouseleave', () => {
  hover = false;
  render();
  scheduleHideInline();
});

IMG.addEventListener('click', () => {
  if (suppressClick) { suppressClick = false; return; }
  if (base === 'sleeping') {        // 点击唤醒
    base = 'idle';
    render();
    showBubble('唔…我醒啦~', 2200);
    syncIdleLine();
    return;
  }
  showBubble(CLICK_PHRASES[Math.floor(Math.random() * CLICK_PHRASES.length)], 2500);
});

IMG.addEventListener('dblclick', () => {
  if (suppressClick) return;
  window.petAPI.requestPanelToggle();
});

// 输入框本身：悬停其上时保持显示，回车发送，ESC 收起
PET_INPUT.addEventListener('mouseenter', () => clearTimeout(inlineTimer));
PET_INPUT.addEventListener('mouseleave', () => { hover = false; scheduleHideInline(); });

PET_INPUT.addEventListener('focus', () => {
  if (PET_INPUT.value === DEFAULT_TEXT) PET_INPUT.select();   // 聚焦即选中，方便直接改写
});
PET_INPUT.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendInline(); }
  if (e.key === 'Escape') { PET_INPUT.value = DEFAULT_TEXT; PET_INPUT.blur(); syncIdleLine(); }
});

PET_INLINE.addEventListener('mouseenter', () => clearTimeout(inlineTimer));
PET_INLINE.addEventListener('mouseleave', () => { hover = false; scheduleHideInline(); });
PET_INLINE.addEventListener('click', () => { if (!inlineBusy) showInput(); });

window.addEventListener('resize', () => { if (inlineVisible) placeInline(); });

// ---------- 主进程事件 ----------
window.petAPI.onBaseState(setBase);
window.petAPI.onFlash(flash);
window.petAPI.onBubble(showBubble);

render();
syncIdleLine();      // 初始就是待机形象，气泡里那一行显示占位文字
resetSleep();
