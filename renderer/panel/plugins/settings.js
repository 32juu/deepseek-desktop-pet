/**
 * 插件：设置
 * 配置 DeepSeek API Key / 模型 / 开机自启
 */
(() => {
  const { ref, onMounted } = Vue;

  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';

  window.PetPlugins.register({
    id: 'settings',
    name: '设置',
    desc: 'API Key · 模型 · 开机自启',
    icon,
    component: {
      setup() {
        const apiKey = ref('');
        const model = ref('deepseek-chat');
        const autostart = ref(false);
        const showKey = ref(false);
        const savedMsg = ref('');

        onMounted(async () => {
          const cfg = await window.petAPI.configGet();
          apiKey.value = cfg.apiKey || '';
          model.value = cfg.model || 'deepseek-chat';
          autostart.value = !!cfg.autostart;
        });

        async function save() {
          await window.petAPI.configSet({ apiKey: apiKey.value, model: model.value });
          savedMsg.value = '✓ 已保存';
          setTimeout(() => { savedMsg.value = ''; }, 2000);
        }

        async function toggleAutostart() {
          autostart.value = !autostart.value;
          autostart.value = await window.petAPI.setAutostart(autostart.value);
        }

        return { apiKey, model, autostart, showKey, savedMsg, save, toggleAutostart };
      },
      template: `
        <div class="plug settings">
          <label class="field">
            <span>DeepSeek API Key</span>
            <div class="row">
              <input :type="showKey ? 'text' : 'password'" v-model="apiKey" placeholder="sk-..." />
              <button class="ghost" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
            </div>
          </label>

          <label class="field">
            <span>模型</span>
            <select v-model="model">
              <option value="deepseek-chat">deepseek-chat（通用对话，推荐）</option>
              <option value="deepseek-reasoner">deepseek-reasoner（深度推理）</option>
            </select>
          </label>

          <label class="field row inline">
            <input type="checkbox" :checked="autostart" @change="toggleAutostart" />
            <span>开机自动启动</span>
          </label>

          <div class="row">
            <button class="primary" @click="save">保存设置</button>
            <span v-if="savedMsg" class="ok">{{ savedMsg }}</span>
          </div>

          <p class="tip">
            API Key 在 platform.deepseek.com → API Keys 申请，仅保存在本机配置文件中。<br />
            未配置时：翻译走免费兜底引擎，笔记总结使用本地归纳，智能对话不可用。
          </p>
        </div>
      `
    }
  });
})();
