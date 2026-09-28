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

```
main.js                   主进程：窗口/托盘/IPC/定时器/DeepSeek API/本地存储
preload.js                contextBridge 暴露 petAPI（contextIsolation: true，nodeIntegration: false）
package.json              productName = 蓝色大肥鱼桌宠；scripts: start / dist / dist:portable
renderer/
  pet/                    桌宠窗口（320×360 透明无边框）
    index.html / pet.js / pet.css
  panel/                  插件面板窗口（420×640 透明无边框）
    index.html / app.js / panel.css
    plugins/              registry.js + chat/translate/tasks/timer/notes/settings.js
assets/
  sprites/                八种形象 PNG（idle/thinking/working/done/sleeping/confused/encourage/assistant）
  vendor/vue.global.prod.js
  icon.png / icon.ico / tray.png
```

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

所有渲染层能力都经 `preload.js` 的 `window.petAPI`（invoke = 请求/响应，on = 主进程推送）。

**invoke**：`store:get` `store:set` `notify` `pet:request-panel` `panel:ready` `panel:close`
`timer:start/pause/resume/reset/status` `ai:chat` `ai:translate` `ai:summarize` `pet:celebrate`
`config:get` `config:set` `app:set-autostart`
**send**：`pet:drag-move`（长按拖拽位移增量，高频，不用 invoke）
**on**：`pet:base-state` `pet:flash` `pet:bubble` `timer:tick` `timer:done`

约定：新增能力 = `main.js` 里 `ipcMain.handle('xxx', ...)` + `preload.js` 暴露 + 渲染层调用，不要直接在渲染层用 ipcRenderer（preload 是唯一入口）。

## 6. 主进程要点

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
- `assets/sprites/assistant.png`（399×336）中第二行中文「x≈104~275、y≈269~283，墨色 #081a40」已被**像素级擦除**（只把比该列背景暗 >8 亮度的像素替换成该列背景色，不破坏渐变）。
  原图备份：`assets/sprites/assistant-orig.png`。
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
npm start                 # 启动（开发模式）
npm run dist              # 打包 nsis 安装版
npm run dist:portable     # 打包便携版
```

- **冒烟测试**：`PET_SMOKE=1` 启动后 6s 自动退出并打印 `SMOKE_OK`，用于无头验证启动链路。
- **坑 1**：本机环境被注入了 `ELECTRON_RUN_AS_NODE=1`，直接 `npx electron .` 会用 Node 跑 main.js 而报 `app is undefined`。正确姿势：
  `env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe .`
- **坑 2**：Electron 33 的 `console-message` 事件签名与旧版不同，`hookConsole` 可能拿不到渲染层日志。调试渲染层数据可临时用 `petAPI.storeSet('probe', data)` 写到 userData 再读文件。
- **userData 目录**：随 `productName` 变化，当前为 `%APPDATA%\蓝色大肥鱼桌宠\`（config.json / tasks.json / notes.json）。
- 打包 `files` 含 `assets/**/*`，`assistant-orig.png` 会被一起打进安装包，如介意体积可删。

## 11. 代码约定

- 注释与 UI 文案用中文；字符串拼接用空格连接的 `+`（现有风格），字符串字面量一律 ASCII 直引号。
- 渲染层不直接访问 Node/Electron；所有能力走 `petAPI`。
- 状态图、交互改动集中在 `renderer/pet/pet.js`；窗口/系统能力集中在 `main.js`。
- 资源图片改像素前先备份原图，并在本文档记录被改动的坐标区间。
