/**
 * 本地 JSON 存储（userData 目录下，一个 key 一个文件）
 *
 * 语义与重构前完全一致：读取失败返回默认值，写入前自动建目录。
 */
const fs = require('fs');
const path = require('path');

function createLocalStore(userDataDir) {
  function filePath(name) {
    return path.join(userDataDir, name + '.json');
  }

  function get(name, def) {
    try {
      return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
    } catch {
      return def;
    }
  }

  function set(name, data) {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
  }

  return { dir: userDataDir, get, set };
}

module.exports = { createLocalStore };
