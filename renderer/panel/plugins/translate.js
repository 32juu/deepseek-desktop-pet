/**
 * 插件：中英翻译（自动识别方向）
 * 已配置 DeepSeek Key 时走模型翻译，否则使用免费兜底引擎
 */
(() => {
  const { ref, computed } = Vue;

  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h9"/><path d="M8.5 3v2.2c0 4.4-2.6 7.6-6 8.8"/><path d="M6 8.5c1.7 3.3 4.4 5.8 8 7"/><path d="M13.5 21l4.2-9.6L21.8 21"/><path d="M14.9 17.4h5.5"/></svg>';

  window.PetPlugins.register({
    id: 'translate',
    name: '中英翻译',
    desc: '中英互译 · 自动识别方向',
    icon,
    component: {
      setup() {
        const src = ref('');
        const out = ref('');
        const loading = ref(false);
        const engine = ref('');
        const error = ref('');

        const dir = computed(() => {
          const t = src.value.trim();
          if (!t) return '自动识别';
          return /[\u4e00-\u9fff]/.test(t) ? '中 → 英' : '英 → 中';
        });

        async function go() {
          const text = src.value.trim();
          if (!text || loading.value) return;
          loading.value = true;
          error.value = '';
          out.value = '';
          const r = await window.petAPI.aiTranslate(text);
          loading.value = false;
          if (r && r.ok) {
            out.value = r.text;
            engine.value = r.engine || '';
          } else {
            error.value = (r && r.error) || '翻译失败';
          }
        }

        async function copy() {
          if (!out.value) return;
          try {
            await navigator.clipboard.writeText(out.value);
            error.value = '';
          } catch (e) {
            error.value = '复制失败，请手动选中复制';
          }
        }

        return { src, out, loading, engine, error, dir, go, copy };
      },
      template: `
        <div class="plug">
          <textarea v-model="src" rows="4" placeholder="输入中文或英文，Ctrl+Enter 翻译"></textarea>
          <div class="row">
            <span class="tag">{{ dir }}</span>
            <span class="spacer"></span>
            <button class="primary" :disabled="loading" @click="go">{{ loading ? '翻译中…' : '翻 译' }}</button>
          </div>
          <div v-if="error" class="error">{{ error }}</div>
          <div v-if="out" class="result">
            <div class="text">{{ out }}</div>
            <div class="row">
              <span class="engine">{{ engine }}</span>
              <span class="spacer"></span>
              <button class="ghost" @click="copy">复制结果</button>
            </div>
          </div>
          <p class="tip">提示：在「设置」中配置 DeepSeek API Key，翻译质量会明显更好。</p>
        </div>
      `
    }
  });
})();
