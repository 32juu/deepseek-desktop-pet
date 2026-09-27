/**
 * 插件：简单定时器
 * 计时逻辑运行在主进程，关闭面板也会继续计时，结束时系统通知 + 桌宠提示
 */
(() => {
  const { ref, computed, onMounted, onUnmounted } = Vue;

  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/></svg>';

  const PRESETS = [
    { m: 5, label: '5 分钟 · 小休息' },
    { m: 10, label: '10 分钟 · 放松' },
    { m: 25, label: '25 分钟 · 番茄钟' },
    { m: 45, label: '45 分钟 · 专注' }
  ];

  window.PetPlugins.register({
    id: 'timer',
    name: '简单定时器',
    desc: '倒计时 · 关闭面板也继续',
    icon,
    component: {
      setup() {
        const st = ref({ total: 0, left: 0, running: false, label: '' });
        const custom = ref(25);
        const finished = ref(false);
        let unTick = null, unDone = null;

        const mmss = computed(() => {
          const s = Math.max(0, st.value.left);
          return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        });
        const progress = computed(() => {
          if (!st.value.total) return 0;
          return Math.round((1 - st.value.left / st.value.total) * 100);
        });
        const statusText = computed(() => {
          if (finished.value) return '时间到啦！';
          if (st.value.running) return '进行中 · ' + st.value.label;
          if (st.value.left > 0) return '已暂停 · ' + st.value.label;
          return '空闲中';
        });

        onMounted(async () => {
          st.value = await window.petAPI.timerStatus();
          unTick = window.petAPI.onTimerTick((s) => { st.value = s; });
          unDone = window.petAPI.onTimerDone(() => { finished.value = true; st.value = { total: st.value.total, left: 0, running: false, label: st.value.label }; });
        });
        onUnmounted(() => {
          if (unTick) unTick();
          if (unDone) unDone();
        });

        async function start(m, label) {
          finished.value = false;
          st.value = await window.petAPI.timerStart(m, label);
        }
        async function pause() { st.value = await window.petAPI.timerPause(); }
        async function resume() { finished.value = false; st.value = await window.petAPI.timerResume(); }
        async function reset() { finished.value = false; st.value = await window.petAPI.timerReset(); }

        return { st, custom, finished, mmss, progress, statusText, PRESETS, start, pause, resume, reset };
      },
      template: `
        <div class="plug timer">
          <div class="clock" :class="{ done: finished }">{{ mmss }}</div>
          <div class="bar"><i :style="{ width: progress + '%' }"></i></div>
          <div class="status">{{ statusText }}</div>

          <div class="chips">
            <button v-for="p in PRESETS" :key="p.m" class="chip" @click="start(p.m, p.label)">{{ p.m }} 分钟</button>
          </div>

          <div class="row">
            <input class="num" type="number" min="1" max="600" v-model.number="custom" />
            <span class="tag">分钟</span>
            <span class="spacer"></span>
            <button class="primary" @click="start(custom, custom + ' 分钟定时')">开始</button>
          </div>

          <div class="row">
            <button class="ghost" v-if="st.running" @click="pause">暂停</button>
            <button class="ghost" v-else-if="st.left > 0" @click="resume">继续</button>
            <button class="ghost" v-if="st.left > 0" @click="reset">重置</button>
          </div>

          <p class="tip">运行时桌宠会切换为「工作中」形象，结束时弹出通知并欢呼~</p>
        </div>
      `
    }
  });
})();
