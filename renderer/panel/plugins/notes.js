/**
 * 插件：笔记总结
 * 调用模型归纳总结并自动分类（工作 / 学习 / 生活 / 灵感 / 其他）
 * 未配置 Key 时使用本地简单归纳兜底
 */
(() => {
  const { ref, computed, watch, onMounted } = Vue;

  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>';

  const CATEGORIES = ['工作', '学习', '生活', '灵感', '其他'];

  window.PetPlugins.register({
    id: 'notes',
    name: '笔记总结',
    desc: 'AI 归纳 · 自动分类',
    icon,
    component: {
      setup() {
        const title = ref('');
        const content = ref('');
        const loading = ref(false);
        const result = ref(null);
        const error = ref('');
        const notes = ref([]);
        const catFilter = ref('全部');
        const expanded = ref(null);

        onMounted(async () => {
          notes.value = (await window.petAPI.storeGet('notes')) || [];
        });
        watch(notes, (v) => window.petAPI.storeSet('notes', v), { deep: true });

        const filtered = computed(() => {
          if (catFilter.value === '全部') return notes.value;
          return notes.value.filter(n => n.category === catFilter.value);
        });

        async function summarize() {
          const text = content.value.trim();
          if (!text || loading.value) return;
          loading.value = true;
          error.value = '';
          result.value = null;
          const r = await window.petAPI.aiSummarize(text);
          loading.value = false;
          if (r && r.ok) {
            result.value = r;
          } else {
            error.value = (r && r.error) || '总结失败';
          }
        }

        function saveNote() {
          if (!result.value) return;
          notes.value.unshift({
            id: Date.now(),
            title: title.value.trim() || result.value.summary.slice(0, 14),
            content: content.value.slice(0, 3000),
            summary: result.value.summary,
            category: result.value.category,
            keywords: result.value.keywords || [],
            createdAt: Date.now()
          });
          title.value = '';
          content.value = '';
          result.value = null;
        }

        function remove(id) {
          notes.value = notes.value.filter(n => n.id !== id);
        }

        function fmtDate(ts) {
          const d = new Date(ts);
          const p = (n) => String(n).padStart(2, '0');
          return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        }

        return {
          title, content, loading, result, error, notes, catFilter, expanded,
          filtered, CATEGORIES, summarize, saveNote, remove, fmtDate
        };
      },
      template: `
        <div class="plug notes">
          <input v-model="title" placeholder="标题（可留空，自动取总结前 14 字）" />
          <textarea v-model="content" rows="4" placeholder="粘贴一段笔记，点击「AI 总结」"></textarea>
          <div class="row">
            <span class="spacer"></span>
            <button class="primary" :disabled="loading" @click="summarize">{{ loading ? '归纳中…' : 'AI 总结' }}</button>
          </div>
          <div v-if="error" class="error">{{ error }}</div>

          <div v-if="result" class="result">
            <div class="text">{{ result.summary }}</div>
            <div class="row">
              <span class="tag cat">{{ result.category }}</span>
              <span v-for="k in result.keywords" :key="k" class="kw">{{ k }}</span>
              <span class="spacer"></span>
              <button class="ghost" @click="saveNote">保存笔记</button>
            </div>
          </div>

          <div class="chips">
            <button class="chip" :class="{ on: catFilter === '全部' }" @click="catFilter = '全部'">全部</button>
            <button v-for="c in CATEGORIES" :key="c" class="chip" :class="{ on: catFilter === c }" @click="catFilter = c">{{ c }}</button>
          </div>

          <div class="list">
            <div v-if="!filtered.length" class="empty">还没有笔记，去上面写一条试试吧~</div>
            <div v-for="n in filtered" :key="n.id" class="note">
              <div class="row">
                <span class="tag cat">{{ n.category }}</span>
                <span class="ntitle">{{ n.title }}</span>
                <span class="spacer"></span>
                <span class="time">{{ fmtDate(n.createdAt) }}</span>
                <button class="del" @click="remove(n.id)">✕</button>
              </div>
              <div class="summary">{{ n.summary }}</div>
              <div class="row">
                <span v-for="k in n.keywords" :key="k" class="kw">{{ k }}</span>
                <span class="spacer"></span>
                <button class="link" @click="expanded = expanded === n.id ? null : n.id">
                  {{ expanded === n.id ? '收起原文' : '查看原文' }}
                </button>
              </div>
              <pre v-if="expanded === n.id" class="raw">{{ n.content }}</pre>
            </div>
          </div>
        </div>
      `
    }
  });
})();
