/**
 * 客户端配置：默认值 + 合并 + 持久化
 *
 * 目前字段：apiKey / model / petPos（后续里程碑会加 backend 段）
 */
const DEFAULTS = { apiKey: '', model: 'deepseek-chat', petPos: null };

function createConfig(localStore) {
  let config = Object.assign({}, DEFAULTS);

  function load() {
    config = Object.assign({}, DEFAULTS, localStore.get('config', {}));
    return config;
  }

  function get() {
    return config;
  }

  function save() {
    localStore.set('config', config);
  }

  /** 合并配置项并落盘，返回对外可见字段 */
  function patch(next) {
    const p = next || {};
    if (typeof p.apiKey === 'string') config.apiKey = p.apiKey.trim();
    if (typeof p.model === 'string') config.model = p.model;
    save();
    return { apiKey: config.apiKey, model: config.model };
  }

  /** 桌宠窗口位置，moved 事件调用 */
  function setPos(pos) {
    config.petPos = pos;
    save();
  }

  return { load, get, save, patch, setPos };
}

module.exports = { createConfig, CONFIG_DEFAULTS: DEFAULTS };
