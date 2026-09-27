/**
 * 插件面板主应用（Vue 3）
 * 首页为"插件选择"网格，点击后进入对应插件视图
 */
const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const view = ref('home');      // 'home' | 'plugin'
    const current = ref(null);     // 当前插件
    const plugins = window.PetPlugins.list;

    function openPlugin(p) {
      current.value = p;
      view.value = 'plugin';
    }
    function back() {
      view.value = 'home';
      current.value = null;
    }
    function close() {
      window.petAPI.panelClose();
    }

    onMounted(() => {
      window.petAPI.panelReady();
    });

    return { view, current, plugins, openPlugin, back, close };
  },
  template: [
    '<div class="panel">',
    '  <header class="topbar">',
    '    <img v-if="view===\'home\'" class="logo" src="../../assets/icon.png" alt="logo" />',
    '    <button v-else class="back" @click="back">‹ 返回</button>',
    '    <div class="title">{{ view===\'home\' ? \'小蓝鲸 · 插件面板\' : current.name }}</div>',
    '    <button class="close" @click="close" title="关闭">✕</button>',
    '  </header>',
    '  <main v-if="view===\'home\'" class="grid">',
    '    <button v-for="p in plugins" :key="p.id" class="card" @click="openPlugin(p)">',
    '      <span class="icon" v-html="p.icon"></span>',
    '      <span class="name">{{ p.name }}</span>',
    '      <span class="desc">{{ p.desc }}</span>',
    '    </button>',
    '  </main>',
    '  <main v-else class="plugin-view">',
    '    <component :is="current.component" />',
    '  </main>',
    '</div>'
  ].join('')
}).mount('#app');
