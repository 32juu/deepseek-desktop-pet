/**
 * 插件：今日任务
 * 支持新建、删除、三种状态（待办 / 进行中 / 已完成）勾选
 */
(() => {
  const { ref, computed, watch, onMounted } = Vue;

  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8.2 12.4l2.6 2.6 5-5.6"/></svg>';

  const STATUS = { todo: '待办', doing: '进行中', done: '已完成' };
  const FILTERS = ['全部', '待办', '进行中', '已完成'];

  window.PetPlugins.register({
    id: 'tasks',
    name: '今日任务',
    desc: '新建 · 状态勾选 · 删除',
    icon,
    component: {
      setup() {
        const tasks = ref([]);
        const input = ref('');
        const filter = ref('全部');

        onMounted(async () => {
          tasks.value = (await window.petAPI.storeGet('tasks')) || [];
        });
        watch(tasks, (v) => window.petAPI.storeSet('tasks', v), { deep: true });

        const filtered = computed(() => {
          if (filter.value === '全部') return tasks.value;
          return tasks.value.filter(t => STATUS[t.status] === filter.value);
        });
        const stats = computed(() => ({
          total: tasks.value.length,
          done: tasks.value.filter(t => t.status === 'done').length
        }));

        // 全部完成 -> 桌宠庆祝 + 系统通知
        watch(() => tasks.value.map(t => t.status).join(','), (nv, ov) => {
          if (!tasks.value.length) return;
          const allDone = tasks.value.every(t => t.status === 'done');
          if (allDone && ov && ov.split(',').some(s => s !== 'done')) {
            window.petAPI.petCelebrate('哇！今日任务全部完成！你最棒啦~');
            window.petAPI.notify('今日任务', '全部完成，给自己点个赞！');
          }
        });

        function add() {
          const text = input.value.trim();
          if (!text) return;
          tasks.value.unshift({ id: Date.now(), text, status: 'todo', createdAt: Date.now() });
          input.value = '';
        }

        function celebrate(t) {
          window.petAPI.petCelebrate('太棒了！完成「' + t.text.slice(0, 12) + '」~');
        }

        function cycleStatus(t) {
          t.status = t.status === 'todo' ? 'doing' : (t.status === 'doing' ? 'done' : 'todo');
          if (t.status === 'done') celebrate(t);
        }

        function toggleDone(t) {
          t.status = t.status === 'done' ? 'todo' : 'done';
          if (t.status === 'done') celebrate(t);
        }

        function remove(id) {
          tasks.value = tasks.value.filter(t => t.id !== id);
        }

        function clearDone() {
          tasks.value = tasks.value.filter(t => t.status !== 'done');
        }

        return { tasks, input, filter, filtered, stats, STATUS, FILTERS, add, cycleStatus, toggleDone, remove, clearDone };
      },
      template: `
        <div class="plug tasks">
          <div class="row">
            <input v-model="input" placeholder="今天要做什么？回车添加" @keydown.enter="add" />
            <button class="primary" @click="add">添加</button>
          </div>

          <div class="chips">
            <button v-for="f in FILTERS" :key="f" class="chip" :class="{ on: filter === f }" @click="filter = f">{{ f }}</button>
          </div>

          <div class="list">
            <div v-if="!filtered.length" class="empty">这里还空空的，先添加一条任务吧~</div>
            <div v-for="t in filtered" :key="t.id" class="task" :class="{ finished: t.status === 'done' }">
              <span class="chk" :class="{ on: t.status === 'done' }" @click="toggleDone(t)">✓</span>
              <span class="text">{{ t.text }}</span>
              <button class="status" :class="t.status" @click="cycleStatus(t)">{{ STATUS[t.status] }}</button>
              <button class="del" @click="remove(t.id)">✕</button>
            </div>
          </div>

          <div class="row footer">
            <span class="engine">已完成 {{ stats.done }} / {{ stats.total }}</span>
            <span class="spacer"></span>
            <button class="ghost" @click="clearDone">清除已完成</button>
          </div>
        </div>
      `
    }
  });
})();
