/**
 * 路径常量：统一从 desktop 根目录推导，避免各模块重复拼接 __dirname
 *
 * 目录关系：desktop/src/main/core/paths.js -> 上三级即 desktop/
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'assets');

module.exports = {
  ROOT,
  SRC,
  ASSETS,
  PRELOAD: path.join(SRC, 'preload', 'index.js'),
  PET_HTML: path.join(ROOT, 'renderer', 'pet', 'index.html'),
  PANEL_HTML: path.join(ROOT, 'renderer', 'panel', 'index.html'),
  ICON: path.join(ASSETS, 'icon.png'),
  TRAY_ICON: path.join(ASSETS, 'tray.png')
};
