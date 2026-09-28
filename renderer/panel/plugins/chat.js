/**
 * 插件：智能对话（DeepSeek）
 * 简单问答实现：保留最近若干条上下文，不做复杂会话管理
 */
(() => {
  const { ref, nextTick, onMounted } = Vue;

  const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5z"/></svg>';

  window.PetPlugins.register({
    id: 'chat',
    name: '智能对话',
    desc: '连接 DeepSeek · 简单问答',
    icon,
    component: {
      setup() {
        const msgs = ref([]);
        const input = ref('');
        const loading = ref(false);

        function scroll() {
          nextTick(() => {
            const el = document.querySelector('.chat-list');
            if (el) el.scrollTop = el.scrollHeight;
          });
        }

        async function send() {
          const text = input.value.trim();
          if (!text || loading.value) return;
          msgs.value.push({ role: 'user', content: text });
          input.value = '';
          loading.value = true;
          scroll();

          const history = msgs.value
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-10)
            .map(m => ({ role: m.role, content: m.content }));

          const r = await window.petAPI.aiChat(history);
          loading.value = false;
          if (r && r.ok) {
            msgs.value.push({ role: 'assistant', content: r.content });
          } else {
            msgs.value.push({ role: 'error', content: (r && r.error) || '请求失败' });
          }
          scroll();
        }

        function clear() { msgs.value = []; }

        onMounted(scroll);

        return { msgs, input, loading, send, clear };
      },
      template: `
        <div class="plug chat">
          <div class="chat-list">
            <div v-if="!msgs.length" class="empty">
              你好呀～我是蓝色大肥鱼，有什么想问的尽管问我哦~<br />
              记得先去「设置」里配置 DeepSeek API Key
            </div>
            <div v-for="(m, i) in msgs" :key="i" class="msg" :class="m.role">
              <div class="avatar">{{ m.role === 'user' ? '我' : (m.role === 'error' ? '!' : '鲸') }}</div>
              <div class="content">{{ m.content }}</div>
            </div>
            <div v-if="loading" class="msg assistant">
              <div class="avatar">鲸</div>
              <div class="content typing">正在思考…</div>
            </div>
          </div>
          <div class="chat-input">
            <input v-model="input" placeholder="输入问题，回车发送" @keydown.enter="send" />
            <button class="primary" :disabled="loading" @click="send">发送</button>
            <button class="ghost" @click="clear">清空</button>
          </div>
        </div>
      `
    }
  });
})();
