# 重构指导提示词 — 蓝色大肥鱼桌宠（工程化 + 后端化）

> 用途：把本文件整体（或第 0 节的「精简启动指令」+ 需要执行的里程碑）交给 AI 编码助手，让它按既定方案重构本项目。
> 本文件是**提示词**，不修改任何代码。
> 基线文档：项目根目录 `CLAUDE.md`（务必先读）。

---

## 0. 怎么用这份提示词

### 0.1 精简启动指令（直接粘贴）

```
请先完整阅读仓库根目录 CLAUDE.md，建立对现有 Electron 桌宠项目的技术认知，然后阅读 docs/REFACTOR_PROMPT.md。
按 REFACTOR_PROMPT.md 的方案执行「里程碑 M1」。要求：
1) 动手前先给出本里程碑的文件变更计划（新增/修改/删除清单 + 目的），等我确认；
2) 小步提交，每一步都要能跑通现有冒烟测试（PET_SMOKE=1 输出 SMOKE_OK）；
3) 不得改动 renderer/pet 的就地输入框坐标逻辑、assistant.png 已擦除区域、桌宠窗口尺寸与状态机优先级；
4) 完成后按第 8 节的「交付格式」汇报：变更文件清单、关键代码、验证命令与真实输出、风险与回滚方案。
```

### 0.2 完整提示词

把第 1 节起的全部内容 + 你指定要执行的里程碑编号一起给出即可。执行者应当在每一轮只推进一个里程碑，并把验证结果贴回来。

---

## 1. 你的角色与总目标

你是一名负责把「可用的桌面小工具」升级为「可长期演进的产品」的技术负责人，兼具后端架构、桌面客户端与 DevOps 视角。

总目标（按优先级）：

1. **工程化**：把单文件主进程 + 无构建渲染层的原型，整理成职责清晰、可测试、可协作的工程结构（配置分层、日志、错误码、测试、CI、容器化）。
2. **易扩展**：新增一个「插件」或「一个业务实体」应只需改少量文件、遵循既有模式即可完成，不需要理解全局。
3. **后端化**：新增独立 Python 后端服务，MySQL 做持久化、Redis 做缓存与限流；客户端数据与 AI 能力逐步迁移到后端。
4. **不牺牲体验**：桌宠的既有交互（长按拖拽、就地输入框、立绘状态机、托盘、定时器、通知）必须**行为等价**，任何一步都不能让用户感知到回退。

**硬性约束：全量迁移业务数据（任务/笔记/设置/对话）到 MySQL，Redis 承担缓存与限流；同时必须保留「无后端时可用」的本地 JSON 降级模式。**
**后端技术栈：Python 3.12 + FastAPI（已确定）。**
**连接形态：本机与远程都要支持，配置项含 host + port，默认 127.0.0.1。**

---

## 2. 现状基线（重构前的事实，逐条核对，不要凭猜测）

### 2.1 技术栈与产物

- Electron 33 + 原生 HTML/CSS/JS（无 webpack/vite），面板用本地 `assets/vendor/vue.global.prod.js`（Vue 3 全局构建）
- electron-builder 打包：nsis 安装版 + portable 便携版，`productName = 蓝色大肥鱼桌宠`
- 平台：Windows 优先（`setLoginItemSettings`、托盘、系统通知）
- 零后端：AI 直连 `https://api.deepseek.com/chat/completions`，数据存 `%APPDATA%\蓝色大肥鱼桌宠\*.json`

### 2.2 进程与窗口

| 窗口 | 尺寸 | 关键属性 |
| --- | --- | --- |
| `petWin` | 320×360 | transparent、frame:false、alwaysOnTop(screen-saver)、skipTaskbar |
| `panelWin` | 420×640 | 同上，默认隐藏，由桌宠双击 / 托盘切换 |

- 单实例锁；`window-all-closed` 不退出；托盘左键切面板、右键菜单退出
- 桌宠位置 `config.petPos` 持久化，`moved` 事件写盘；启动恢复并夹紧到工作区

### 2.3 IPC / API 契约（**必须保持向后兼容**）

- `invoke`：`store:get` `store:set` `notify` `pet:request-panel` `panel:ready` `panel:close`
  `timer:start|pause|resume|reset|status` `ai:chat` `ai:translate` `ai:summarize` `pet:celebrate`
  `config:get` `config:set` `app:set-autostart`
- `send`：`pet:drag-move`（高频，长按拖拽位移增量）
- `on`（主进程 → 渲染层）：`pet:base-state` `pet:flash` `pet:bubble` `timer:tick` `timer:done`
- 渲染层**只能**通过 `preload.js` 暴露的 `window.petAPI` 访问能力（contextIsolation: true，nodeIntegration: false）

### 2.4 桌宠状态机（`renderer/pet/pet.js`）

- 基础态 `idle / thinking / working / sleeping`；闪现态 `done / encourage / confused`；悬停态 `assistant`
- 优先级：`flash > assistant(hover||inline) > base`；5 分钟无操作入睡
- 定时器在主进程计时（关面板不中断），结束发系统通知 + `petFlash('done')` + 气泡

### 2.5 ⚠️ 不可触碰的既有实现（回归红线）

1. **就地输入框坐标**：`renderer/pet/pet.js` 中
   `NATIVE = {w:399,h:336}`、`STRIP = {x0:96,x1:300,y0:261,y1:291}`，
   `placeInline()` 必须由 `getComputedStyle(IMG).maxWidth/maxHeight` + 原图尺寸反推，
   **禁止改用 `getBoundingClientRect()`**（各形象宽高比不同 + `bob` 漂浮动画会带位移）。
   当前正确结果：`left 83.2px / width 151.3px / 中心 Y 315.5px`。
2. **`assets/sprites/assistant.png` 已被像素级擦除**那行中文（原图备份 `assets/sprites/assistant-orig.png`）。
   禁止重新引入任何「覆盖式气泡/卡片弹窗」；禁止改动该区域像素。
3. 输入框显示期间的 `.still` 类（暂停漂浮动画）必须保留。
4. 桌宠窗口尺寸、状态机优先级、`pet:drag-move` 的 send 语义不得改动。

### 2.6 现状的工程问题（重构要解决的）

- `main.js` 单文件承担窗口/托盘/IPC/定时器/AI/存储/工具函数（约 450 行且会持续膨胀）
- 无后端：API Key 明文存客户端 JSON；AI 无缓存、无限流、无重试与可观测性
- 存储是「整文件读写 JSON」，无并发控制、无迁移、无查询能力
- 无测试、无 lint/format、无 CI；渲染层日志转发在 Electron 33 下失效（调试靠临时落盘）
- 已知环境坑：本机注入 `ELECTRON_RUN_AS_NODE=1`，必须 `env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe .`

---

## 3. 目标架构

### 3.1 形态选择

保留 Electron 桌面端（用户体验与服务端解耦），**新增独立后端服务**，形成「桌面客户端 + 后端服务 + 持久化设施」三层。桌面端在**后端不可用时自动降级**为纯本地模式，功能不减（AI 走直连、数据走 JSON）。

### 3.2 目标目录（monorepo，推荐）

```
deepseek-desktop-pet/
├─ CLAUDE.md                    项目速查（本方案落地后需同步更新）
├─ docs/
│  ├─ REFACTOR_PROMPT.md        本文件（指导提示词）
│  ├─ architecture.md           目标架构 + 时序图（重构后补）
│  ├─ api.md                    后端 API 契约（与 OpenAPI 一致）
│  ├─ data-model.md             表结构 / 索引 / Redis key 规范
│  └─ ops.md                    部署、备份、升级、排障
├─ desktop/                     迁移现有 Electron 端（原根目录文件全部移入）
│  ├─ package.json              （原 package.json 迁移至此，scripts 统一）
│  ├─ src/main/                 主进程按职责拆分（见 5.1）
│  ├─ src/preload/              preload（保持 petAPI 兼容，新增 backend 域）
│  ├─ renderer/pet/             桌宠窗口（**只允许最小侵入式改动**）
│  ├─ renderer/panel/           面板 + plugins
│  └─ assets/                   现有资源（含 assistant-orig.png）
├─ server/                      Python 后端
│  ├─ pyproject.toml            ruff / mypy / pytest 配置
│  ├─ app/
│  │  ├─ main.py                应用装配（lifespan、中间件、路由挂载）
│  │  ├─ core/                  config.py / db.py / redis.py / logging.py / errors.py / security.py
│  │  ├─ api/v1/                routers: health, system, settings, tasks, notes, ai, chat
│  │  ├─ services/              业务逻辑（无 SQL、无 HTTP 细节）
│  │  ├─ repositories/          数据访问（SQLAlchemy 2.0 async）
│  │  ├─ models/                ORM 模型
│  │  ├─ schemas/               Pydantic v2 请求/响应模型
│  │  └─ migrations/            Alembic
│  └─ tests/                    unit / integration（testcontainers 或 docker-compose）
├─ deploy/
│  ├─ docker-compose.yml        mysql:8 / redis:7 / server
│  ├─ docker-compose.dev.yml    仅 MySQL+Redis（开发用）
│  ├─ .env.example
│  └─ initdb/                   初始化 SQL（字符集 utf8mb4、时区、只读账号）
├─ shared/                      可选：契约单一来源（OpenAPI 导出的 TS/JSON 类型）
├─ scripts/                     dev.sh / db_up.sh / db_down.sh / migrate.sh / smoke.sh
└─ .github/workflows/ci.yml     lint + test + build
```

> 迁移现有代码时，`desktop/package.json` 的 `productName`、`appId`、`assets` 路径与 electron-builder 配置必须保持等价，保证安装包名与 userData 路径不变（`%APPDATA%\蓝色大肥鱼桌宠\`）。

### 3.3 数据流

```
桌宠窗口 / 面板(插件)
        │  window.petAPI（不变）
        ▼
preload.js ──► 主进程 IPC 路由
                 ├─ localStore（JSON，始终可用，降级兜底）
                 ├─ backendClient（HTTP → FastAPI，超时/重试/熔断）
                 └─ aiDirect（DeepSeek 直连，仅降级模式）
                        ▼
               FastAPI ─┬─ MySQL（业务数据，全量）
                        ├─ Redis（缓存 / 限流 / 会话上下文 / 幂等锁）
                        └─ DeepSeek API（Key 由后端托管）
```

**存储模式**：客户端配置 `storageMode = auto | local | remote`
- `auto`：启动健康检查 + 每次操作的短超时探测，健康走 remote，异常自动切 local 并在设置页显示状态徽标
- `remote` 连续失败 N 次（推荐 3 次）自动降级并记录日志；恢复后可选自动回切（默认需要手动点「重连」）

---

## 4. 后端规格（Python 3.12 + FastAPI）

### 4.1 依赖基线（`server/pyproject.toml`）

```
fastapi, uvicorn[standard], pydantic>=2, pydantic-settings,
sqlalchemy[asyncio]>=2.0, asyncmy (或 aiomysql), alembic,
redis>=5 (async), httpx, python-dotenv,
tenacity（重试）, structlog 或 loguru（结构化日志）,
pytest, pytest-asyncio, anyio, httpx（测试客户端）, ruff, mypy, types-redis
```

### 4.2 API 契约（版本化 `/api/v1`）

统一响应包（成功与失败同构，便于客户端统一处理）：

```json
{ "code": 0, "message": "ok", "data": {}, "traceId": "01H..." }
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/health` | 存活：`{status, version, uptime}` |
| GET | `/api/v1/health/ready` | 就绪：逐项报告 `mysql / redis / deepseek` 连通性与耗时 |
| GET/PUT | `/api/v1/system/storage/config` | 读取/写入 MySQL、Redis 连接配置（host/port/user/password/db/pool） |
| POST | `/api/v1/system/storage/test` | 传入配置**不落库**直接试连，返回分项结果与错误摘要 |
| POST | `/api/v1/system/storage/reload` | 运行时热重载连接池（校验通过才切换，失败保持旧连接） |
| GET | `/api/v1/system/stats` | 连接池/缓存命中率/请求量等基础指标 |
| CRUD | `/api/v1/tasks` | 任务：分页、状态过滤、批量状态更新、排序 |
| CRUD | `/api/v1/notes` | 笔记：分类过滤、关键词检索、分页 |
| GET/PUT | `/api/v1/settings` | 键值设置（含 `deepseek.apiKey` 等，敏感值写入需返回脱敏） |
| POST | `/api/v1/ai/chat` | 对话（支持 `stream=true` 走 SSE） |
| POST | `/api/v1/ai/translate` | 翻译（默认缓存） |
| POST | `/api/v1/ai/summarize` | 笔记总结（结构化 JSON 输出） |
| — | `/docs`, `/openapi.json` | 仅 dev 环境放开 |

错误码规范（`code` 非 0 即失败，`message` 面向用户可读中文，细节进 `data.detail`）：

```
0 成功
1xxx 参数/校验      1001 参数缺失 1002 参数非法 1003 资源不存在
2xxx 业务          2001 任务状态非法 2002 笔记超长
3xxx 外部依赖      3001 DeepSeek 超时 3002 DeepSeek 报错 3003 Redis 不可用 3004 MySQL 不可用
4xxx 限流/配额     4001 请求过于频繁 4002 月度配额超限
5xxx 服务内部      5000 未捕获异常
```

### 4.3 配置体系（连接参数必须可视化、可热改）

优先级：`环境变量 > .env > 数据库 settings 表 > 代码默认值`

`server/app/core/config.py` 用 `pydantic-settings` 定义，**MySQL / Redis 的 host 与 port 必须是独立、可覆盖的字段**（端口不是硬编码）：

```python
class MySQLSettings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 3306            # 手动可配
    user: str = "pet_app"
    password: str = ""
    database: str = "pet"
    pool_size: int = 10
    pool_recycle: int = 3600
    connect_timeout: int = 5    # 秒

class RedisSettings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 6379            # 手动可配
    db: int = 0
    password: str = ""
    socket_timeout: int = 3
    key_prefix: str = "pet:"
```

- 连接串由字段拼装（`mysql+asyncmy://user:pwd@host:port/db?charset=utf8mb4`），禁止把完整 URL 写死
- 密码只从环境变量或数据库加密字段读取；日志与接口响应一律脱敏（`****`）
- 运行时可热重载：写入库 → 重建 engine/连接池 → 探针通过则切换，失败回滚并返回 3004 + 原因

### 4.4 数据模型（Alembic 管理，utf8mb4 / utf8mb4_0900_ai_ci）

```sql
-- 任务
task(id BIGINT PK AUTO_INCREMENT, owner_key VARCHAR(64) NOT NULL, text VARCHAR(500) NOT NULL,
     status ENUM('todo','doing','done') NOT NULL DEFAULT 'todo', sort_order INT DEFAULT 0,
     created_at DATETIME(3), updated_at DATETIME(3), deleted_at DATETIME(3) NULL,
     INDEX idx_owner_status(owner_key, status), INDEX idx_owner_created(owner_key, created_at))

-- 笔记
note(id BIGINT PK, owner_key VARCHAR(64), title VARCHAR(200), content MEDIUMTEXT,
     summary VARCHAR(500), category VARCHAR(32), keywords JSON,
     created_at, updated_at, deleted_at NULL,
     INDEX idx_owner_cat(owner_key, category), FULLTEXT idx_ft(title, content) /* 可选 */

-- 键值设置（含 DeepSeek Key（加密）、前端偏好）
app_setting(namespace VARCHAR(64), k VARCHAR(128), v JSON, updated_at, PRIMARY KEY(namespace,k))

-- 对话会话与消息
chat_session(id CHAR(26) PK, owner_key VARCHAR(64), title VARCHAR(200), created_at, updated_at)
chat_message(id BIGINT PK, session_id CHAR(26), role ENUM('system','user','assistant'), content TEXT,
             tokens INT NULL, created_at, INDEX idx_session_created(session_id, created_at))

-- 存储连接配置（密码加密存储）
storage_config(id TINYINT PK DEFAULT 1, mysql_host VARCHAR(255), mysql_port INT,
               mysql_user VARCHAR(64), mysql_password VARBINARY(512), mysql_database VARCHAR(64),
               redis_host VARCHAR(255), redis_port INT, redis_db INT, redis_password VARBINARY(512),
               updated_at)
```

**迁移规则**：`deleted_at` 软删除；`owner_key` 预留多设备/多用户（单用户阶段固定为 `default` 或设备指纹）；所有时间用 UTC 存储、客户端展示本地时间。

### 4.5 Redis 用法与 key 规范

| 用途 | Key | TTL |
| --- | --- | --- |
| 翻译/AI 结果缓存 | `pet:cache:ai:{sha1(model+prompt)}` | 1h（翻译）/ 10m（对话） |
| 限流（令牌桶） | `pet:rate:{owner}:{route}` | 窗口长度 |
| 对话上下文 | `pet:ctx:{sessionId}` (LIST, 末 N 条) | 1h |
| 迁移幂等锁 | `pet:lock:migrate:{source}` | 10m |
| 健康探针结果 | `pet:health:{component}` | 10s |

限流建议：普通接口 120 req/min；`/ai/*` 10 req/min；超限返回 4001。Redis 不可用时**不阻断**主流程（降级为直连 MySQL + 无缓存，并记录 3003 警告）。

### 4.6 历史数据迁移（全量迁移）

- 独立命令 `python -m app.cli migrate-json --dir "%APPDATA%\蓝色大肥鱼桌宠"`，同时提供 `POST /api/v1/system/migrate/json` 供客户端触发
- 幂等：以 `(owner_key, 旧 id/created_at)` 作为唯一凭据，用 Redis 锁防并发；重复执行不产生重复数据
- 校验：迁移前后条数比对 + 抽样字段校验，输出迁移报告（成功/跳过/失败条数、耗时）
- 迁移完成后本地 JSON **不删除**，改名为 `*.bak` 保留一个版本
- 客户端首次成功连接后端时提示「检测到本地数据，是否导入？」并提供「稍后」按钮

### 4.7 缓存与 AI 代理策略

- API Key 支持两种模式并由设置项决定：`serverKey`（推荐，Key 存后端加密字段）与 `clientKey`（沿用现状透传）；`auto` 决策点写进配置
- 对话：支持非流式与 `stream=true` SSE（客户端逐字上屏，落后端 200ms 批量刷）
- 重试：对 DeepSeek 的 5xx/超时用 `tenacity` 重试 2 次（指数退避 + 抖动），最终失败返回 3001/3002
- 提示词与降级逻辑（MyMemory、`localSummary`）**保留在客户端**作为 offline 兜底；后端实现同名能力，输出结构保持一致

---

## 5. 客户端改造点（Electron，行为等价优先）

### 5.1 主进程工程化拆分（`desktop/src/main/`）

```
main/
├─ index.js            应用装配：单实例锁、生命周期、模块初始化顺序
├─ windows/petWindow.js        创建/恢复位置/右键菜单
├─ windows/panelWindow.js      创建/切换/定位
├─ tray.js                     托盘菜单
├─ ipc/index.js                统一注册，按域拆文件：store.js / timer.js / ai.js / config.js / system.js / backend.js
├─ services/timerService.js    主进程计时器（保持现状语义）
├─ services/aiService.js       DeepSeek 直连 + 后端代理二选一
├─ services/backendClient.js   HTTP 客户端：超时、重试、熔断、降级判定、健康缓存
├─ services/storageAdapter.js  本地 JSON 与后端 REST 的统一读写接口（含 auto 模式切换）
├─ stores/localStore.js        JSON 读写（现 storeGet/storeSet 语义不变）
├─ core/config.js              客户端配置：合并默认值 + 迁移 + 校验
└─ core/logger.js              结构化日志 + traceId（解决 33 版日志转发失效问题）
```

要求：每个模块导出纯函数式接口（`createXxx(deps)` 依赖注入），便于单测；禁止新增全局可变状态。

### 5.2 IPC 契约扩展（保持向后兼容）

- **不改动**既有通道签名（`store:get/set`、`ai:*`、`timer:*`、`config:get/set`、`pet:*`）——内部实现可切到后端
- **新增**通道：
  - `backend:status` → `{mode, healthy, latencyMs, mysql, redis, lastError}`
  - `backend:get-config` / `backend:set-config` → host/port/user/password/db（密码返回脱敏，写入时留空表示不变）
  - `backend:test` → 试连并返回分项结果（含耗时与错误码）
  - `backend:reconnect` → 重新探测并切换模式
  - `migrate:json-to-server` → 触发历史数据导入，返回迁移报告
- preload 新增 `petAPI.backend.*` 命名空间，旧字段一个不删

### 5.3 设置面板：新增「存储与后端」区块（本次功能重点）

在 `renderer/panel/plugins/settings.js` 内**新增一个分组**（复用现有 `.plug .field .row .chips .primary .ghost .tip` 样式，不引入新 UI 依赖）：

1. **模式**：`自动（推荐）/ 仅本地 / 仅远程` 单选
2. **MySQL**：host（默认 `127.0.0.1`）、port（number，默认 `3306`，范围 1–65535）、user、password（`type=password` + 显示/隐藏按钮，与现有 API Key 交互一致）、database、连接池大小（可选高级项，折叠）
3. **Redis**：host（默认 `127.0.0.1`）、port（number，默认 `6379`）、db（0–15）、password（脱敏）
4. **后端服务**：baseUrl（如 `http://127.0.0.1:8000`）、apiToken（远程部署用，可留空）、超时（默认 5s）
5. **操作**：`测试连接`（分别显示 MySQL / Redis / 后端 三项结果与耗时）、`保存`、`重新连接`、`导入本地历史数据`（含二次确认与进度）
6. **状态徽标**：右上角常驻，`● 已连接 MySQL+Redis / ● 仅本地模式 / ● 连接异常`，异常时展示 `lastError` 摘要与「查看详情」

交互与安全要求：
- 端口必须用 `number` 输入并做前后端双重校验（1–65535 整数），非法值就地报错、不提交
- 密码框默认掩码，只提示「留空表示不修改」；任何日志/响应不得回显明文
- 测试连接不得阻塞 UI（异步 + loading 状态），并在设置页持久显示上次测试结果与时间
- 修改连接参数若指向不同库，需提示「不会自动迁移数据」，并提供迁移入口
- 配置写入位置：优先写入客户端本地 `config.json` 的 `backend` 段（保证后端不可用时也能改配置），保存成功后可选同步到后端 `storage_config` 表

### 5.4 桌宠窗口（`renderer/pet/`）

原则上**只允许**以下改动：
- 输入框请求失败时的文案与重试入口（若后端接管 AI）
- 无其他视觉/布局/坐标改动；第 2.5 节红线逐条遵守

---

## 6. 工程化交付标准（Definition of Done）

**通用**
- 分层单向依赖：`api → services → repositories → models`；service 不直接写 SQL，router 不含业务逻辑
- 全量类型注解，`mypy` 无 error（可对第三方库 ignore-missing-imports）
- `ruff check` + `ruff format` 通过；JS 侧使用 Prettier + ESLint（保持 2 空格、单引号，与现状一致）
- 统一异常处理器：任何未捕获异常 → 5000 + traceId，日志含入参摘要（敏感字段脱敏）
- 结构化 JSON 日志，字段含 `traceId / route / costMs / code`；请求头 `X-Trace-Id` 可透传
- 优雅退出：关闭连接池、等待在途请求 5s

**测试与质量**
- 单测覆盖 services 与 repositories 关键路径；`pytest --cov=app` 行覆盖 ≥ 70%
- 集成测试用 docker-compose 的 MySQL/Redis（或用 testcontainers），覆盖：健康检查、CRUD、限流 4001、MySQL 断开 → 3004、迁移幂等
- 客户端：`desktop` 至少为 `storageAdapter` / `backendClient` 写单测（可用 vitest 或 node:test，不引入重型框架）
- 每个里程碑结束跑：`scripts/smoke.sh`（`PET_SMOKE=1` 输出 `SMOKE_OK`）+ 后端 `pytest`

**DevOps**
- `docker-compose.yml`：`mysql:8`（utf8mb4、健康检查、命名卷、初始化账号非 root）+ `redis:7`（appendonly yes、最大内存策略）+ `server`（多阶段 Dockerfile、非 root 用户、healthcheck）
- `.env.example` 列出全部可配项（含 `MYSQL_PORT` / `REDIS_PORT`），密钥用占位符
- CI：`lint → test → build desktop（electron-builder 校验可打包）→ build server image`
- 备份与恢复文档：`mysqldump` 命令、恢复步骤、版本升级与 Alembic 回滚流程（写入 `docs/ops.md`）

**文档**
- `docs/architecture.md`（含关键时序：启动健康探测、auto 模式切换、AI 请求链路）
- `docs/api.md` 与 OpenAPI 一致；`docs/data-model.md` 含表结构、索引、Redis key 规范
- 更新 `CLAUDE.md`：新增后端章节、目录变更、新增 IPC 通道、设置项说明、环境坑（沿用 `ELECTRON_RUN_AS_NODE` / Electron 33 日志 / userData 路径三条）

---

## 7. 里程碑计划（按序执行，每步可独立验收）

### M1 仓库工程化（不动行为）
- 建立 monorepo 目录，把现有 Electron 代码平移到 `desktop/`，保持安装包与 userData 路径不变
- 拆分 `main.js` 为 5.1 节结构（纯搬迁，不改逻辑）；统一 lint/format 配置；补 `scripts/smoke.sh`
- **验收**：`npm start` 行为与重构前完全一致；`PET_SMOKE=1` 输出 `SMOKE_OK`；就地输入框坐标仍为 83.2/151.3/315.5

### M2 后端骨架 + 基础设施
- FastAPI 应用、配置体系、结构化日志、traceId、统一响应/异常、健康检查
- docker-compose（MySQL/Redis/server）、Alembic 初始迁移、`.env.example`、Dockerfile
- **验收**：`docker compose up -d` 后 `GET /api/v1/health/ready` 报告 mysql/redis 均 ok；`pytest` 全绿；`/docs` 可访问（dev）

### M3 数据域迁移（全量）
- tasks/notes/settings REST + 仓储层；`storageAdapter` 在客户端接管读写；auto 降级；JSON→MySQL 幂等迁移 CLI/接口
- **验收**：旧 `tasks.json`/`notes.json` 导入后条目数一致（报告可查）；关掉后端后客户端仍可增删改查（local 模式）；重启后端数据仍一致

### M4 设置页存储配置 UI
- 5.3 节「存储与后端」区块：host/port/密码/模式/测试连接/状态徽标/导入入口
- 后端 `system/storage/*` 接口 + 运行时热重载
- **验收**：改端口保存后热重载生效（日志可见新端口）；错误端口测试连接返回 3004 且不破坏现有连接；密码永不明文回显

### M5 AI 域后端化
- `ai/chat|translate|summarize` 落后端（Key 托管可切换）、Redis 缓存与限流、SSE 流式、重试与错误码对齐
- 客户端 `aiService` 双通道切换 + 失败自动回退直连；桌宠就地输入框回车链路回归
- **验收**：限流触发返回 4001 且客户端有友好提示；断网时桌宠输入框仍能直连作答；命中缓存的请求耗时显著下降（给出前后数据）

### M6 质量收口与发布
- 覆盖率达标、集成测试补齐、性能基线（P95 目标：本地 CRUD < 50ms，AI 首字节 < 1.5s）
- 文档补全 + `CLAUDE.md` 更新 + 安装包回归（安装/便携/开机自启/托盘/定时器/通知）
- **验收**：CI 全绿；安装包在干净环境可跑通全部功能；`docs/ops.md` 可支撑他人独立部署

---

## 8. 交付格式（每个里程碑必须按此汇报）

1. **变更计划**（动手前先给）：新增/修改/删除文件清单 + 每个文件的目的 + 风险点
2. **变更清单**（动手后）：文件名 + 关键改动摘要（不改的文件不要列）
3. **关键代码**：核心片段（配置、仓储、路由、降级判定、设置页表单）
4. **验证证据**：真实执行的命令 + 真实输出（冒烟 `SMOKE_OK`、`pytest` 结果、`curl` 响应、UI 操作步骤与预期）
5. **回归确认**：逐条勾选第 2.5 节红线 + 桌宠交互（长按拖拽/就地输入/双击面板/托盘/定时器/通知）
6. **风险与回滚**：可能的破坏面 + 一行命令级别的回滚方式
7. **遗留问题**：未完成项、需要我决策的点

---

## 9. 禁止事项

- ❌ 改动第 2.5 节的四类红线（就地输入框坐标、assistant.png 已擦除区域、`.still` 动画暂停、窗口尺寸与状态机优先级）
- ❌ 引入「覆盖式弹窗/卡片」来替代插画自带的那一行（历史决策已否决）
- ❌ 删除本地 JSON 降级链路；❌ 把 Redis 当唯一数据源或用 Redis 存业务主数据
- ❌ 硬编码端口/凭据；❌ 用 root 账号连 MySQL；❌ 在日志、接口响应、错误信息中回显密码或 API Key
- ❌ 为迁移数据删除用户原有文件（只允许重命名为 `.bak`）
- ❌ 一次性把所有里程碑改完再汇报；❌ 跳过冒烟测试直接提交
- ❌ 在渲染层引入新 UI 框架或构建工具链（Vue 全局构建 + 原生 CSS 的现状保持）
- ❌ 擅自做多用户/登录体系（单用户即可，`owner_key` 仅作预留）；远程部署鉴权用 `apiToken` 中间件即可，如需 OAuth 必须先问

---

## 10. 已决策项与待确认项

**已决策（不要再问）**
- 后端：Python 3.12 + FastAPI + SQLAlchemy 2.0(async) + Alembic + redis.asyncio
- 持久化：任务/笔记/设置/对话**全量迁移**到 MySQL；Redis 负责缓存/限流/上下文；本地 JSON 仅作降级与迁移来源
- 连接形态：本机与远程均支持，配置含 host + port；默认 `127.0.0.1` + `3306` / `6379`
- 数据保留客户端存放 API Key 的能力（`clientKey` 模式）以支持离线

**待执行者先问用户确认的开放项**
- 是否需要 SSE 流式上屏（影响 M5 工作量与客户端输入框交互细节）
- MySQL 全文检索用 FULLTEXT 还是后续接 Meilisearch/Elasticsearch
- 是否为便携版客户端提供「一键启动本地后端 + Docker Desktop 检测」
- 打包是否新增 `docker`/`python` 运行时依赖（默认不打包，由用户自行安装或提供安装引导）

---

## 11. 提示词使用示例（第二轮怎么继续）

```
继续执行 REFACTOR_PROMPT.md 的「里程碑 M3」，上一轮 M2 的验收输出如下：<粘贴真实输出>
本轮要求：先给变更计划，等我确认后再改；M3 结束时必须给出：迁移报告样例、
关停后端后的降级验证步骤与结果、以及 docs/data-model.md 的最终表结构。
```
