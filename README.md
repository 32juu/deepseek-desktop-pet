# 小蓝鲸桌宠（DeepSeek 桌面助手）

基于你提供的插画八形态开发的 **Windows 轻量桌宠**：常驻桌面的蓝鲸女仆，双击即可唤出插件面板，内置翻译、智能对话、今日任务、定时器、笔记总结五大能力。

![八种形象](assets/sprites-preview.png)

---

## 一、功能一览

| 能力 | 说明 |
| --- | --- |
| 八种形象状态 | 待机/互动、思考中、工作中、完成/轻松、休息/睡觉、疑惑/惊讶、鼓励/加油、桌面助手/悬浮 |
| 双击弹出插件面板 | 双击角色弹出插件选择网格（翻译 / 对话 / 任务 / 定时器 / 笔记 / 设置） |
| 中英翻译 | 自动识别中→英、英→中；已配置 Key 走 DeepSeek，否则走免费兜底引擎 |
| 智能对话 | 连接 DeepSeek（`deepseek-chat`/`deepseek-reasoner`），保留最近若干轮上下文的简单问答 |
| 今日任务 | 新建、删除、三种状态（待办 / 进行中 / 已完成）点选勾选，全部完成自动庆祝 |
| 简单定时器 | 5/10/25/45 分钟预设或自定义；计时跑在主进程，**关掉面板也继续**，结束系统通知 |
| 笔记总结 | 调用模型归纳总结并自动分类（工作 / 学习 / 生活 / 灵感 / 其他），可保存、按分类筛选、查看原文 |
| 设置 | 配置 API Key、选择模型、开机自启 |

### 桌宠交互

| 操作 | 效果 |
| --- | --- |
| **双击角色** | 打开 / 关闭插件面板（核心交互） |
| 单击角色 | 随机冒一句气泡台词 + 鼓励形态 |
| 鼠标悬停 | 切换为「桌面助手/悬浮」形象，气泡提示"有什么需要我帮忙的吗？" |
| 按住拖拽 | 拖动桌宠位置（位置自动记忆） |
| 右键角色 | 菜单：打开插件面板 / 退出 |
| 托盘图标 | 单击开面板，右键菜单退出 |
| 5 分钟无操作 | 自动进入「休息/睡觉」形态，点击或悬停唤醒 |

### 状态联动（桌宠会随你的操作变化）

| 场景 | 形象 |
| --- | --- |
| AI 请求进行中 | 思考中 |
| 定时器运行中 | 工作中 |
| 定时结束 / 翻译完成 | 完成（欢呼） |
| 勾选完成一项任务 | 鼓励（比心） |
| 接口报错 / 未配置 Key | 疑惑 |
| 长时间无操作 | 睡觉 |
| 空闲悬停 | 桌面助手/悬浮 |

---

## 二、快速开始（Windows）

需要 [Node.js](https://nodejs.org/) ≥ 18（推荐 20）。

```bash
cd deepseek-desktop-pet
npm install
npm start
```

启动后桌宠出现在桌面，双击它即可打开插件面板。

## 三、配置 DeepSeek（想用对话/高质量翻译时）

1. 打开 [platform.deepseek.com](https://platform.deepseek.com) → API Keys → 创建 Key（形如 `sk-...`）。
2. 双击桌宠 → 插件面板 → **设置** → 粘贴 Key → 保存。

Key 与所有数据只保存在本机 `%APPDATA%\小蓝鲸桌宠\config.json`，不上传任何服务器。

**未配置 Key 时**：翻译走免费兜底引擎（MyMemory），笔记总结使用本地规则归纳，智能对话不可用并会提示原因。

## 四、打包成 exe

```bash
npm run dist           # 生成 NSIS 安装包 + 便携版（dist 目录）
npm run dist:portable  # 只生成便携版（无需安装，双击即用）
```

打包产物（**本项目 dist/ 目录已内置构建好的 x64 版本，可直接双击运行，不必再执行 npm install**）：

- `dist\小蓝鲸桌宠 Setup 1.0.0.exe` — 安装版（82MB，可创建桌面快捷方式、可勾选开机自启）
- `dist\小蓝鲸桌宠 1.0.0.exe` — 便携版（81MB，免安装）

> 在 Linux/macOS 上打包 Windows 目标时，electron-builder 需要联网下载 Windows 版 Electron；
> 若下载慢可设置镜像：`export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。

## 五、扩展插件

插件采用注册表机制，**新增插件无需改动任何既有代码**：

1. 在 `renderer/panel/plugins/` 新建 `myplugin.js`：

```js
(() => {
  const { ref } = Vue;
  window.PetPlugins.register({
    id: 'myplugin',
    name: '我的插件',
    desc: '一句话说明',
    icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>',
    component: {
      setup() {
        const text = ref('Hello');
        return { text };
      },
      template: '<div class="plug"><h3>{{ text }}</h3></div>'
    }
  });
})();
```

2. 在 `renderer/panel/index.html` 中引入：`<script src="plugins/myplugin.js"></script>`

即可在插件选择页看到新卡片。可复用能力（`window.petAPI`）：

- `aiChat(messages)` / `aiTranslate(text)` / `aiSummarize(text)` — 调用 DeepSeek
- `storeGet(name)` / `storeSet(name, data)` — 持久化数据（JSON 文件）
- `petCelebrate(text)` / `notify(title, body)` — 让桌宠庆祝 / 弹通知
- `timerStart/Pause/Resume/Reset/Status` — 复用主进程定时器

## 六、技术选型说明

- **前端**：Vue 3（本地化 `assets/vendor/vue.global.prod.js`，无需构建步骤）+ 原生 HTML/CSS，符合你"前端 js/css/html/vue"的偏好。
- **宿主**：Electron（Chromium 透明无边框窗口 + Node），是桌宠这类"透明置顶、托盘常驻"场景最省事的选择。
- **后端**：**没有额外 Java/Python 后端**。DeepSeek 是 HTTP 接口，直接在 Electron 主进程用 `fetch` 调用即可，省去部署后端进程，最符合"轻量"目标。若后续希望多端共用或代理转发，可再加一个 FastAPI/Python 服务，把 `main.js` 里 `DEEPSEEK_URL` 换成自研地址即可。
- 若未来要极致瘦身（体积从 ~100MB 降到 ~5MB），可把窗口层换成 Tauri（Rust + WebView2），渲染层代码可基本复用。

## 七、目录结构

```
deepseek-desktop-pet/
├─ main.js                     主进程：窗口/托盘/定时器/DeepSeek/存储/IPC
├─ preload.js                  安全 IPC 桥接
├─ package.json                依赖与打包配置
├─ assets/
│  ├─ sprites/                 8 个透明 PNG 形象（从插画裁剪）
│  ├─ icon.png / icon.ico / tray.png
│  ├─ vendor/vue.global.prod.js
│  └─ sprites-preview.png
└─ renderer/
   ├─ pet/                     桌宠窗口（状态机 + 气泡 + 双击交互）
   └─ panel/
      ├─ index.html / app.js / panel.css
      └─ plugins/              插件：translate / chat / tasks / timer / notes / settings
```

数据文件位置（`npm start` 或安装版运行后自动生成）：

- Windows：`%APPDATA%\小蓝鲸桌宠\` 下的 `config.json` / `tasks.json` / `notes.json`

## 八、常见问题

**Q：桌宠挡住了操作？** 桌宠窗口置顶且可拖拽，拖到屏幕角落即可。
**Q：开机自启不生效？** 请用 `npm run dist` 打包后的安装版运行，`npm start` 开发模式下注册的是 Electron 可执行文件。
**Q：接口报错"未配置 API Key"？** 面板 → 设置 → 填入 Key 并保存。
**Q：翻译很慢/不通？** 未配置 Key 时走的是免费公共引擎，配额有限；建议配置 DeepSeek Key。

---

MIT License.
