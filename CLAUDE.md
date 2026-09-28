# CLAUDE.md — 蓝色大肥鱼桌宠（DeepSeek 桌面助手）

> 面向 AI/新人的项目速查文档。改动代码前请先读本文件。
> 产品名已从「小蓝鲸」改为「蓝色大肥鱼」（2026-09-28），代码与资源中仍有历史注释，以本文档为准。

## 1. 项目定位

Windows 桌面宠物 + 轻量插件面板（Electron）。桌宠常驻桌面右下，悬浮/长按/双击即可交互；
插件面板提供：智能对话、中英翻译、今日任务、定时器、笔记总结、设置。AI 能力走 DeepSeek 官方接口。

- 运行平台：Windows（Electron 33，electron-builder 打包 nsis + portable）
- 无前端构建工具：渲染层是原生 HTML/CSS/JS，面板用 CDN-free 的本地 `vue.global.prod.js`
- 数据全部存本机，不上传服务器

## 2. 目录结构

> M1（仓库工程化）后，Electron 端整体位于 `desktop/`；根目录只保留文档与脚本。

```
scripts/                   smoke.sh（无头冒烟，判定含加载失败）/ dev.sh（开发启动）
docs/REFACTOR_PROMPT.md    重构里程碑方案（M1 已完成，M2 起做后端）
desktop/
  package.json             productName = 蓝色大肥鱼桌宠；scripts: start / lint / format / smoke / dist
  src/main/
    index.js               装配层：单实例锁、生命周期、初始化顺序、SMOKE
    core/                  paths.js / logger.js / notify.js / config.js
    stores/localStore.js   本机 JSON 读写（userData 下，一个 key 一个文件）
    services/              aiService.js（DeepSeek 直连 + 降级）/ timerService.js（主进程计时）
    windows/               petWindow.js / panelWindow.js / tray.js / index.js（窗口管理器）
    ipc/                   index.js + store / config / timer / ai / system 五个域
  src/preload/index.js     contextBridge 暴露 petAPI（contextIsolation: true，nodeIntegration: false）
  renderer/
    pet/                   桌宠窗口（320×360 透明无边框）
      index.html / pet.js / pet.css
    panel/                 插件面板窗口（420×640 透明无边框）
      index.html / app.js / panel.css
      plugins/             registry.js + chat/translate/tasks/timer/notes/settings.js
  assets/
    sprites/               八种形象 PNG（idle/thinking/working/done/sleeping/confused/encourage/assistant）
    vendor/vue.global.prod.js
    icon.png / icon.ico / tray.png
```

主进程分层约定：`api(ipc) → services → stores/core`，反向依赖禁止；
每个模块导出 `createXxx(deps)` 工厂（依赖注入，便于单测），窗口引用只在 `windows/index.js` 一处持有。

## 3. 进程与窗口

| 窗口 | 尺寸 | 说明 |
| --- | --- | --- |
| petWin | 320×360 | transparent / frame:false / alwaysOnTop(screen-saver) / skipTaskbar |
| panelWin | 420×640 | 同上，默认隐藏，由桌宠双击或托盘菜单切换 |

- 单实例锁 `requestSingleInstanceLock`；`window-all-closed` 不退出（桌宠常驻）
- 托盘：左键点击 = 切换面板；右键菜单 = 打开面板 / 退出
- 桌宠位置存 `config.petPos`，启动时恢复并夹紧到工作区；`moved` 事件自动写盘
- 开机自启用 `app.setLoginItemSettings`

## 4. 状态机（renderer/pet/pet.js）

- **基础态 base**：`idle` / `thinking` / `working` / `sleeping`
- **闪现态 flash**：`done` / `encourage` / `confused`，N 秒后回基础态
- **悬停态**：base 为 idle 且 hover 时 → `assistant`
- 优先级：`flash > assistant(hover/inline) > base`
- 5 分钟无操作 → `sleeping`；悬停或点击唤醒

## 5. IPC / API 契约

所有渲染层能力都经 `desktop/src/preload/index.js` 的 `window.petAPI`（invoke = 请求/响应，on = 主进程推送）。

**invoke**：`store:get` `store:set` `notify` `pet:request-panel` `panel:ready` `panel:close`
`timer:start/pause/resume/reset/status` `ai:chat` `ai:translate` `ai:summarize` `pet:celebrate`
`config:get` `config:set` `app:set-autostart`
**send**：`pet:drag-move`（长按拖拽位移增量，高频，不用 invoke）
**on**：`pet:base-state` `pet:flash` `pet:bubble` `timer:tick` `timer:done`

约定：新增能力 = `desktop/src/main/ipc/<域>.js` 里 `ipcMain.handle('xxx', ...)` + preload 暴露 + 渲染层调用，不要直接在渲染层用 ipcRenderer（preload 是唯一入口）。

## 6. 主进程要点

模块拆分后的落点（改功能前先定位文件）：

| 关注点 | 文件 |
| --- | --- |
| 路径常量（desktop 根推导） | `core/paths.js` |
| 日志 / 渲染层日志转发 | `core/logger.js` |
| 系统通知 | `core/notify.js` |
| 配置项与默认值 | `core/config.js` |
| DeepSeek 直连与降级 | `services/aiService.js` |
| 定时器状态机 | `services/timerService.js` |
| 窗口与托盘 | `windows/*` |
| IPC 通道（按域） | `ipc/*` |

- **DeepSeek**：`https://api.deepseek.com/chat/completions`，超时 60s（`AbortController`）。
  `deepseek-reasoner` 不支持 temperature/response_format，已分支处理。
- **降级策略**：翻译未配 Key → MyMemory 免费接口；笔记总结未配 Key → 本地 `localSummary()`（分句 + 关键词词频 + 关键词分类）。
- **定时器**：在主进程用 `setInterval` 计时，关面板也不中断；结束发系统通知 + `petFlash('done')` + 气泡。
- **日志**：`hookConsole()` 转发渲染层日志（注意 Electron 33 的 `console-message` 签名变化，见第 10 节）。

## 7. 桌宠交互（当前实现）

1. **长按拖拽**：在角色图片上按住 350ms 进入拖拽态，`mousemove` 计算屏幕坐标增量 → `pet:drag-move` → 主进程 `petWin.setPosition`；拖拽结束吞掉本次 click，避免误触发。窗口透明空白处本身也可直接拖（CSS `-webkit-app-region: drag`）。
2. **双击** → 打开插件面板；**单击** → 随机卖萌语气泡；**右键** → 菜单。
3. **悬浮就地输入框**（核心特性，见下节）。

## 8. 悬浮就地输入框（重要，改动前必读）

产品要求：保留原插画版面与交互，**不新增任何弹窗**，把气泡里那行文案变成可编辑输入框。

实现方式：
- `desktop/assets/sprites/assistant.png`（399×336）中第二行中文「x≈104~275、y≈269~283，墨色 #081a40」已被**像素级擦除**（只把比该列背景暗 >8 亮度的像素替换成该列背景色，不破坏渐变）。
  原图备份：`desktop/assets/sprites/assistant-orig.png`。
- 渲染层用透明 `#pet-input`（输入）+ `#pet-inline`（只读回复行）覆盖该位置，**背景/边框全透明**，因此视觉上就是插画自己的那一行。
- 坐标换算 `placeInline()`：**不要用 `getBoundingClientRect()`**——各形象宽高比不同，且 `bob` 漂浮动画会带位移。正确做法是用 `getComputedStyle(IMG).maxWidth/maxHeight`（296/318）与 assistant 原始尺寸反推缩放比，再按 `STRIP = {x0:96,x1:300,y0:261,y1:291}` 换算。实测：left 83.2px / width 151.3px / 中心 Y 315.5px。
- 输入框显示时给 `#pet` 加 `.still` 暂停漂浮动画，保证对齐。
- 流程：hover → assistant + 预填「有什么需要我帮忙的吗？」→ 聚焦自动全选便于改写 → 回车发送 → 同行显示「思考中…」→ AI 回复 → 6s 后恢复可输入；ESC 收起。
- 对话进行中会挂起主进程的 base 切换（`pendingBase`），防止立绘切换导致输入框浮空。

## 9. 插件面板

- Vue 3（本地 vendor），`app.js` 管理 `home / plugin` 两级视图。
- 新增插件：在 `plugins/` 写文件 → `window.PetPlugins.register({ id, name, desc, icon, component })` → 在 `renderer/panel/index.html` 引入。无需改动其他代码。
- 现有插件：chat、translate、tasks、timer、notes、settings。

## 10. 开发/调试

```bash
# 仓库根目录
bash scripts/smoke.sh     # 无头冒烟（推荐，判定比只看 SMOKE_OK 更严格）
bash scripts/dev.sh       # 开发启动（等价 cd desktop && npm start）

cd desktop
npm start                 # 启动（开发模式）
npm run lint              # eslint src
npm run format            # prettier --write src
npm run dist              # 打包 nsis 安装版
npm run dist:portable     # 打包便携版
```

- **冒烟测试**：`PET_SMOKE=1` 启动后 6s 自动退出并打印 `SMOKE_OK`。
  `scripts/smoke.sh` 在此基础上额外拦截「加载失败 / ERR_FILE_NOT_FOUND / uncaught」——
  因为路径搬错时 `SMOKE_OK` 照样会打印，只看它会漏判（已做负向验证：移走 `pet/index.html` 时退出码 1）。
- **lint/format 范围**：仅 `desktop/src/**`（`renderer/pet` 属红线区，已在 `.prettierignore` 中排除；
  `renderer/panel` 沿用原手写风格，M6 质量收口时再纳入）。
- **坑 1**：本机环境被注入了 `ELECTRON_RUN_AS_NODE=1`，直接 `npx electron .` 会用 Node 跑主进程入口而报 `app is undefined`。正确姿势（在 `desktop/` 下）：
  `env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe .`，或直接用 `scripts/*.sh`（已内置 unset）。
- **坑 2**：Electron 33 的 `console-message` 事件签名与旧版不同，`hookConsole` 可能拿不到渲染层日志。调试渲染层数据可临时用 `petAPI.storeSet('probe', data)` 写到 userData 再读文件。
- **userData 目录**：随 `productName` 变化，当前为 `%APPDATA%\蓝色大肥鱼桌宠\`（config.json / tasks.json / notes.json）。
- 打包 `files` 为 `package.json / src/**/* / renderer/**/* / assets/**/*`，`assistant-orig.png` 会被一起打进安装包，如介意体积可删。打包产物输出在 `desktop/dist/`。

## 11. 代码约定

- 注释与 UI 文案用中文；字符串拼接用空格连接的 `+`（现有风格），字符串字面量一律 ASCII 直引号。
- 渲染层不直接访问 Node/Electron；所有能力走 `petAPI`。
- 状态图、交互改动集中在 `renderer/pet/pet.js`；窗口/系统能力集中在 `desktop/src/main/` 对应模块。
- 新增能力 = `ipc/<域>.js` 里 `ipcMain.handle(...)` + `src/preload/index.js` 暴露 + 渲染层调用；不要直接在渲染层用 ipcRenderer。
- 资源图片改像素前先备份原图，并在本文档记录被改动的坐标区间。

## 12. 重构里程碑

长期重构方案见 `docs/REFACTOR_PROMPT.md`（M1 仓库工程化 / M2 后端骨架 / M3 数据域迁移 /
M4 设置页存储配置 / M5 AI 后端化 / M6 质量收口）。

**M1 已完成**：代码平移到 `desktop/`、主进程按 core/stores/services/windows/ipc 拆分、
`scripts/smoke.sh` 与 lint/format 落地。行为与重构前等价（IPC 契约、窗口尺寸、状态机优先级均未变）。
后续里程碑新增能力时，请同步更新本文档与 `docs/` 下的对应文档。
