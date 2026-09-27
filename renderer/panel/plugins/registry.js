/**
 * 插件注册表
 * 扩展方式：在 plugins/ 下新建文件并调用 PetPlugins.register({...})，
 * 然后在 renderer/panel/index.html 中引入即可，无需改动其他代码。
 */
window.PetPlugins = {
  list: [],
  register(plugin) {
    if (!plugin || !plugin.id) {
      console.error('插件注册失败：缺少 id');
      return;
    }
    if (this.list.some(p => p.id === plugin.id)) return; // 去重
    this.list.push(plugin);
  }
};
