# 插件规范（Plugin Specification）

> 状态：**Draft v0.1**（Phase 0 交付物）
> 依据：根 `CLAUDE.md` 第 2、4 节硬约束；路线图 `docs/roadmap.md`；AI 分级 `docs/ai-levels.md`；桌宠状态词表 `docs/character-spec.md`。
> 本文只定义**插件协议本身**（写插件必须遵守的契约），不重复产品定位与学习数据模型。
> 前提：Java 17+ / Spring Boot 3.x / Modular Monolith（`user` `learning` `plugin` `ai` `knowledge` `event` `common`）/ MySQL 8 / 单用户本地优先。

## 1. 定义与设计目标

> **插件 = 一个可被用户使用、可产生学习数据、可被 AI 调用的能力模块。**

三者**缺一不可**：

| 维度 | 要求 | 不满足时 |
|---|---|---|
| 可被用户使用 | 有 UI 契约，用户能独立完成一次闭环操作 | 只是后台逻辑 → 应作为 `learning` 模块的服务 |
| 可产生学习数据 | 至少发布 1 个核心事件 + 拥有自有数据模型 | 无沉淀，进不了画像闭环 → 不算学习能力 |
| 可被 AI 调用 | 至少 1 个 Tool，参数/返回有 Schema | AI 无法编排 → 降级为普通功能页 |

设计目标（按优先级）：① **可插拔**——新增插件不改 `ai`/`learning` 代码，只新增包 + 注册清单；
② **边界清晰**——只依赖 Spring + `plugin-api`，禁止依赖桌面端、依赖其它插件实现、直连他人表；
③ **AI 可发现**——加载后 Tool/事件元数据自动进 Registry，Agent 不硬编码插件名；
④ **可追溯**——每次 Tool 调用与事件发布留痕（`plugin_tool_invocation_log` / `event_outbox`）；
⑤ **不过度设计**——不做进程级隔离、不做沙箱、不实现在线安装（Phase 9 再探索）。

## 2. 工程形态与目录结构

### 2.1 方案对比

| 方案 | 形态 | 优点 | 缺点 |
|---|---|---|---|
| A 独立构建子模块 | `plugins/<id>/` 独立 build 出 jar | 强隔离、未来可热插拔 | 多构建复杂度高，第一版收益为零 |
| **B 主工程内模块（推荐）** | `backend/plugin/plugins/<id>/`，同一构建 | 单一构建、直接断点调试、重构安全 | 隔离靠规范 + CI 约束而非编译器 |

**选 B**：CLAUDE.md 第 2 节第 3、4 条要求 Modular Monolith、不过度设计。用包边界 + ArchUnit 替代物理隔离；Phase 9 若真需在线安装再提为独立构建单元。

### 2.2 目录结构

```text
backend/
├── plugin-api/                        # 唯一被插件依赖的契约模块（无业务实现）
│   └── .../plugin/api/                # Plugin / PluginContext / PluginMetadata / PluginState
│       ├── permission/PluginPermission.java
│       ├── tool/{PluginTool,ToolRequest,ToolResult,ToolErrorCode,ToolSideEffect}.java
│       ├── event/{PluginEvent,EventPublisher,EventSubscriber}.java
│       └── config/{PluginConfig,PluginConfigSpec}.java
├── plugin/                            # 插件运行时
│   └── .../plugin/                    # registry/PluginRegistry  lifecycle/PluginLifecycleManager
│       ├── tool/{ToolRegistry,ToolInvoker}.java        # event/{EventBus,EventOutbox,EventDispatcher}
│       ├── permission/{PermissionGuard,RepositoryAccess}.java
│       └── plugins/                   # ← 一插件一包
│           ├── pomodoro/              #   <X>Plugin.java / tool/ / service/ / repository/
│           └── note/                  #   entity/ / event/ / config/
└── …（user / learning / ai / knowledge / event / common）
```

### 2.3 依赖规则（ArchUnit 强制）

```text
plugins.<id>.* → plugin-api, common, spring, 自己的包          ✅
plugins.<id>.* → plugins.<other>.*                             ❌
plugins.<id>.* → ai.* / desktop.* / 其它模块的 Repository       ❌
ai.*           → plugins.<id>.* 实现类（只能经 ToolRegistry）   ❌
```

## 3. Plugin Metadata 规范

### 3.1 字段表

| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `id` | string | ✅ | `^[a-z][a-z0-9-]{2,31}$`，全局唯一，kebab-case，**发布后不可改**；保留字 `plugin` `system` `core` `admin` `api` `test` 禁用 |
| `name` / `description` | string | ✅ | 展示名 ≤ 24 字符（允许中文）；描述 ≤ 120 字符，写"做什么" |
| `version` / `apiVersion` | string | ✅ | 语法 `MAJOR.MINOR.PATCH`（第 10 节）；`apiVersion` 为规范版本，当前 `"1.0"`，主版本不匹配拒绝加载 |
| `author` | string | ✅ | 作者/组织，本地可填 `local` |
| `capabilities` | string[] | ✅ | 受控词表（3.3），≥ 1 项 |
| `dependencies` | object[] | ✅ | 可为 `[]`；元素 `{pluginId, versionRange, optional}` |
| `permissions` | string[] | ✅ | 六种权限枚举（第 7 节）；无则 `[]`，WRITE 类插件基本必填 |
| `configSchema` | object | ✅ | JSON Schema 子集（第 8 节） |
| `entrypoints` | object | ✅ | `{pluginClass, tools[], events{published[],subscribed[]}, ui{panels[]}}` |
| `autoStart` | boolean | 否 | 默认 `true`；`false` 表示仅注册待手动启用 |
| `minAppVersion` / `icon` | string | 否 | 宿主版本低于 `minAppVersion` 则拒绝加载并提示；`icon` 为相对资源路径 |

### 3.2 JSON 示例（`backend/plugin/src/main/resources/plugins/pomodoro/plugin.json`）

```json
{
  "id": "pomodoro",
  "name": "番茄钟",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "author": "local",
  "description": "番茄工作法计时，记录每次学习会话的时长与科目，产出学习行为数据。",
  "capabilities": ["study.timer", "study.session.track", "study.stats.read"],
  "dependencies": [],
  "permissions": ["READ", "WRITE", "AI"],
  "minAppVersion": "0.1.0", "autoStart": true, "icon": "assets/pomodoro.svg",
  "configSchema": {
    "type": "object",
    "properties": {
      "focusMinutes": { "type": "integer", "minimum": 5, "maximum": 180, "default": 25 },
      "breakMinutes": { "type": "integer", "minimum": 1, "maximum": 60, "default": 5 },
      "roundsBeforeLongBreak": { "type": "integer", "minimum": 2, "maximum": 12, "default": 4 },
      "autoStartBreak": { "type": "boolean", "default": true }
    },
    "required": ["focusMinutes", "breakMinutes"], "additionalProperties": false
  },
  "entrypoints": {
    "pluginClass": "com.dspet.plugin.plugins.pomodoro.PomodoroPlugin",
    "tools": ["getLearningStats", "startStudySession", "finishStudySession", "listRecentSessions"],
    "events": { "published": ["STUDY_SESSION_STARTED", "STUDY_SESSION_FINISHED"],
                "subscribed": ["GOAL_COMPLETED"] },
    "ui": { "panels": [{ "key": "pomodoro.timer", "title": "番茄钟", "width": 320, "height": 420 }] }
  }
}
```

### 3.3 `capabilities` 受控词表

`study.timer`（计时）/ `study.session.track`（产生学习会话数据）/ `study.stats.read`（学习统计读取）/
`knowledge.crud`（知识点增删改查）/ `note.crud`（笔记增删改查）/ `question.practice`（题目练习）/
`question.wrong.track`（错题跟踪）/ `media.ocr`（图像识别，需 FILE）/ `net.fetch`（外部请求，需 NETWORK）。

新增标签必须同步更新本表 + `PluginCapability` 枚举，否则 Registry 校验不通过。

## 4. 生命周期

```text
REGISTERED → VALIDATED → INITIALIZED → RUNNING → STOPPED → UNLOADED
                    ↘___________FAILED___________↗（可重试）
```

| 阶段 | 职责 | 失败处理 |
|---|---|---|
| `register` | 解析 `plugin.json` → `PluginMetadata`，upsert `plugin_registry` | 标 `FAILED` 记原因，**不阻塞其它插件** |
| `validate` | 校验 id 唯一、apiVersion 兼容、依赖可满足、capabilities/permissions 合法、无 `system.` 前缀冲突、事件已在 `published` 声明（只读） | `FAILED`，输出可读拒绝原因给前端 |
| `init` | 建 `PluginContext`，注入配置/`EventPublisher`/`ToolRegistrar`，初始化自身 Bean（可申请资源） | 回滚已申请资源 → `FAILED` |
| `start` | 注册 Tool 与事件订阅，启动定时器 | 已注册 Tool 必须注销 → `FAILED` |
| `stop` | 停止接受新调用，等在飞调用（默认 5s，超时强制），取消订阅，停定时器，落盘 | 记 `WARN`，**仍进 STOPPED**（不阻塞卸载） |
| `unload` | 释放 Context，清缓存，从 Registry 移除 Tool/订阅 | 记 `WARN` |

幂等要求：`register`/`validate` 纯函数语义、按 `id` upsert；`init` 可重复调用且重复时先释放旧资源；
`start` 的 Tool 按 `pluginId + toolName` 去重覆盖、订阅按句柄去重；`stop`/`unload` 已是目标状态时直接成功。

```java
public interface Plugin {
    PluginMetadata metadata();
    default void onInit(PluginContext ctx) {}
    default void onStart(PluginContext ctx) {}
    default void onStop(PluginContext ctx) {}
    default void onUnload(PluginContext ctx) {}
    default void onConfigChanged(PluginConfig cfg) {}
    default boolean healthy() { return true; }   // 探活失败仅告警，不自动停用
}
```

## 5. Tool 协议（Agent Tool Calling）

### 5.1 命名规则

| 规则 | 说明 |
|---|---|
| 对外名 | `{pluginId}.{toolName}`，如 `pomodoro.startStudySession` |
| 方法名 | camelCase，`^[a-z][a-zA-Z0-9]{1,39}$` |
| 保留前缀 | `system.` 归宿主，插件不得占用 |
| 唯一性 | 全局唯一；重复注册 → `validate` 失败 |
| 面向 LLM | `description` ≤ 200 字符，必须写清"何时该调用"；参数 `description` 必填 |

### 5.2 接口

```java
public interface PluginTool<I, O> {
    String name();                    // 不含 pluginId 前缀
    String description();             // 供 LLM 判断"何时调用"
    Class<I> inputType();
    JsonSchema inputSchema();         // 生成 LLM function-calling 定义
    ToolSideEffect sideEffect();      // READONLY / WRITE / DESTRUCTIVE
    Duration timeout();               // 默认 10s
    boolean idempotent();
    ToolResult<O> invoke(ToolRequest<I> req, PluginContext ctx);
}
public record ToolRequest<I>(String requestId, String pluginId, String toolName,
                             I input, String userId, String traceId, Instant deadline) {}
public record ToolError(ToolErrorCode code, String message, String field, boolean retryable) {}
public record ToolResult<O>(Status status, O data, List<ToolWarning> warnings,
                            ToolError error, long elapsedMs, String traceId) {
    public enum Status { SUCCESS, PARTIAL, FAILED }
}
```

| `status` | 含义 | Agent 侧处理 |
|---|---|---|
| `SUCCESS` | 目标全部达成 | 直接用 `data` |
| `PARTIAL` | 部分成功，`data` 可空，`warnings` 说明缺失 | 可用则用，并把 warning 作为事实告知用户 |
| `FAILED` | 未产生有效数据，`data` 必须为 `null` | 按 5.4 降级 |

### 5.3 错误码（`ToolErrorCode` 枚举，禁止魔法字符串）

| 错误码 | 含义 | 可重试 | 错误码 | 含义 | 可重试 |
|---|---|---|---|---|---|
| `PLUGIN_NOT_FOUND` | 未注册/已卸载 | 否 | `CONFLICT` | 状态冲突（如已有进行中会话） | 否 |
| `PLUGIN_NOT_RUNNING` | 未处于 RUNNING | 是 | `RATE_LIMITED` | 触发限流 | 是（退避） |
| `TOOL_NOT_FOUND` | Tool 未声明/已注销 | 否 | `TIMEOUT` | 超出 `timeout()` | 仅 `idempotent` |
| `INVALID_ARGUMENT` | Schema 或业务参数非法 | 否 | `DEPENDENCY_MISSING` / `STORAGE_ERROR` | 依赖插件未运行 / DB 写入失败 | 是 |
| `PERMISSION_DENIED` | 缺权限或用户未授权 | 否（需授权） | `RESOURCE_NOT_FOUND` / `INTERNAL_ERROR` | 目标实体不存在 / 未预期异常（须记堆栈） | 否 / 谨慎 |

### 5.4 调用约定

- **校验顺序**：Schema → 权限 → 生命周期 → 业务。校验失败必须早于任何副作用。
- **超时**：`ToolInvoker` 用独立线程池，超时中断返回 `TIMEOUT`；`WRITE`/`DESTRUCTIVE` 超时**不自动重试**；`READONLY` 可并行，`WRITE` 串行化到插件级单线程执行器，`DESTRUCTIVE` 必须用户确认（前端弹框，确认 Token 由 `PermissionGuard` 签发）。
- **可追溯**：写 `plugin_tool_invocation_log`（`request_id` `plugin_id` `tool_name` `trace_id` `status` `error_code` `elapsed_ms` `input_digest`）；`input_digest` = 参数规范化后 SHA-256 前 16 位，**不存原文**（隐私 + 防膨胀）。

### 5.5 示例一：`pomodoro.getLearningStats`（READONLY / 幂等 / 10s）

```json
{
  "name": "pomodoro.getLearningStats",
  "description": "读取某时间范围内的学习统计（总时长、会话数、科目分布、按天趋势）。当用户问“我最近学得怎么样/学了多少”时调用。",
  "sideEffect": "READONLY", "idempotent": true, "timeoutMs": 10000,
  "inputSchema": {
    "type": "object",
    "properties": {
      "from": { "type": "string", "format": "date", "description": "起始日期（含），ISO-8601" },
      "to": { "type": "string", "format": "date", "description": "结束日期（含），ISO-8601" },
      "subject": { "type": ["string", "null"], "description": "科目过滤，null 为全部" },
      "granularity": { "type": "string", "enum": ["day", "week", "month"], "default": "day" }
    },
    "required": ["from", "to"], "additionalProperties": false
  }
}
```

```jsonc
// 成功
{ "status": "SUCCESS", "traceId": "tr_01HZX8Q2Y6", "elapsedMs": 37, "warnings": [],
  "data": { "range": { "from": "2026-02-01", "to": "2026-02-07" },
            "totalMinutes": 615, "sessionCount": 23, "completedSessionCount": 21,
            "abandonedSessionCount": 2, "avgMinutesPerSession": 26.7,
            "bySubject": [ { "subject": "Redis", "minutes": 300, "sessionCount": 11 } ],
            "byDay": [ { "date": "2026-02-01", "minutes": 100, "sessionCount": 4 } ] } }
// 参数非法
{ "status": "FAILED", "traceId": "tr_01HZX9A1B2", "elapsedMs": 2, "data": null, "error":
  { "code": "INVALID_ARGUMENT", "message": "from 必须早于或等于 to", "field": "from", "retryable": false } }
```

### 5.6 示例二：`pomodoro.startStudySession`（WRITE / 非幂等 / 5s）

```json
{
  "name": "pomodoro.startStudySession",
  "description": "开始一次学习会话（番茄钟计时）。当用户说“我要开始学习/帮我计时 25 分钟”时调用。同一用户同时只能有一个进行中的会话。",
  "sideEffect": "WRITE", "idempotent": false, "timeoutMs": 5000,
  "inputSchema": {
    "type": "object",
    "properties": {
      "subject": { "type": ["string", "null"], "maxLength": 64, "description": "学习科目，如 Redis" },
      "plannedMinutes": { "type": "integer", "minimum": 5, "maximum": 180,
                          "description": "计划时长；不传则用插件配置 focusMinutes" },
      "knowledgePointIds": { "type": "array", "items": { "type": "integer" }, "maxItems": 20 },
      "note": { "type": ["string", "null"], "maxLength": 500 }
    },
    "required": [], "additionalProperties": false
  }
}
```

```jsonc
// 成功
{ "status": "SUCCESS", "traceId": "tr_01HZXA7C33", "elapsedMs": 24, "warnings": [],
  "data": { "sessionId": 1025, "subject": "Redis", "plannedMinutes": 25,
            "startedAt": "2026-02-07T20:14:03+08:00", "expectedEndAt": "2026-02-07T20:39:03+08:00",
            "state": "RUNNING", "uiHint": { "panel": "pomodoro.timer", "petState": "learning" } } }
// 已有进行中会话 → CONFLICT
{ "status": "FAILED", "data": null, "error":
  { "code": "CONFLICT", "message": "已存在进行中的学习会话 sessionId=1024", "field": null, "retryable": false } }
```

> `uiHint.petState` 必须取自 `docs/character-spec.md` 状态词表（`learning`/`loading`/`success`/`celebration` 等），禁止自造状态名。

## 6. Event 协议

事件名 `SCREAMING_SNAKE_CASE`，`^[A-Z][A-Z0-9_]{2,47}$`；核心事件见 CLAUDE.md 第 6 节；插件自定义事件须以插件 id 大写为前缀（如 `POMODORO_BREAK_STARTED`）。插件只能发布 `published` 声明的事件、订阅 `subscribed` 声明的事件。

### 6.1 载荷信封

| 信封字段 | 类型 | 说明 |
|---|---|---|
| `eventId` | uuid | 幂等去重键（UUIDv7） |
| `eventName` / `schemaVersion` | string / int | 事件名；载荷版本从 1 开始 |
| `occurredAt` | datetime | **业务发生时间**，非写入时间 |
| `userId` / `sourcePluginId` | string | 单用户本地填 `local`；后者为发布者 |
| `traceId` | string | 与触发它的 Tool 调用同 `traceId`，保证可追溯 |
| `payload` | object | 各事件专属字段（6.3） |

### 6.2 发布/订阅 API 与事务边界

```java
public interface EventPublisher {            // 注入给插件，只能发已声明事件
    void publish(PluginEvent event);         // 事务内写 outbox，提交后投递
}
public interface EventSubscriber {
    String eventName();
    int minSchemaVersion();
    void handle(PluginEvent event);          // 同一 eventId 必须可重复执行
    default boolean async() { return true; }
    default Duration timeout() { return Duration.ofSeconds(10); }
}
```

| 项 | 规则 |
|---|---|
| 投递模型 | **事务性 outbox + 异步投递**（`event_outbox` → `EventDispatcher`） |
| 何时发 | 业务事务**提交前**写 outbox（同事务），**提交后**才投递 ⇒ 数据落库 ⟺ 事件最终发出 |
| 失败回滚 | 写 outbox 失败 → **整个业务事务回滚**（事件属于数据）；投递失败不回滚业务，指数退避重试 ≤ 5 次，之后 `DEAD_LETTER` + 告警 |
| 同步事件 | 仅宿主内部关键链路可用；插件**不得**依赖同步语义，不得假设订阅者已执行完 |
| 消费隔离 | 单订阅者失败不影响其它订阅者，失败记 `event_delivery_log` |
| 顺序 | 仅保证**同一聚合根 + 同一事件类型**按 `occurredAt` 有序；不保证跨聚合有序 |

### 6.3 前 8 个核心事件的 payload 字段表

| 事件 | ver | payload |
|---|---|---|
| `STUDY_SESSION_STARTED` | 1 | `sessionId:long` `subject:String?` `plannedMinutes:int` `knowledgePointIds:long[]` `source:String(manual\|ai\|auto)` |
| `STUDY_SESSION_FINISHED` | 1 | `sessionId:long` `subject:String?` `actualMinutes:int` `plannedMinutes:int` `completed:boolean` `abandonReason:String?` `knowledgePointIds:long[]` `endedAt:datetime` |
| `QUESTION_COMPLETED` | 1 | `questionId:long` `quizId:long?` `correct:boolean` `durationMs:long` `knowledgePointIds:long[]` `difficulty:String?` |
| `QUESTION_WRONG` | 1 | `questionId:long` `quizId:long?` `userAnswer:String` `correctAnswer:String` `errorType:String?` `knowledgePointIds:long[]` |
| `KNOWLEDGE_CREATED` | 1 | `knowledgePointId:long` `name:String` `parentId:long?` `subject:String?` `source:String(manual\|ai\|extract)` |
| `KNOWLEDGE_MASTERED` | 1 | `knowledgePointId:long` `previousLevel:int(0-5)` `currentLevel:int(0-5)` `basis:String(quiz\|self\|ai)` |
| `NOTE_CREATED` | 1 | `noteId:long` `title:String` `knowledgePointIds:long[]` `tagIds:long[]` `source:String(manual\|ai\|import)` |
| `GOAL_COMPLETED` | 1 | `goalId:long` `goalType:String(daily\|weekly\|custom)` `targetValue:decimal` `actualValue:decimal` `periodStart:date` `periodEnd:date` |

### 6.4 `STUDY_SESSION_FINISHED` 完整示例

```json
{
  "eventId": "0192f3a1-7c4e-7a2b-9d31-5f0c8b6e1a44",
  "eventName": "STUDY_SESSION_FINISHED",
  "schemaVersion": 1,
  "occurredAt": "2026-02-07T20:39:05+08:00",
  "userId": "local",
  "sourcePluginId": "pomodoro",
  "traceId": "tr_01HZXA7C33",
  "payload": {
    "sessionId": 1025, "subject": "Redis", "actualMinutes": 25, "plannedMinutes": 25,
    "completed": true, "abandonReason": null, "knowledgePointIds": [12, 18],
    "endedAt": "2026-02-07T20:39:03+08:00"
  }
}
```

典型订阅链：`learning`（累计统计）→ `knowledge`（更新学习次数/最近学习时间）→ `ai`（画像输入）→ 桌面端（`success` 动画）。

### 6.5 幂等与去重

- 消费方以 `(eventId, subscriberPluginId)` 唯一键写 `event_delivery_log`；已存在则跳过并记 `SKIPPED_DUPLICATE`。
- 事件必须**可重放**：`EventDispatcher` 支持按 `eventName + 时间范围` 重投以修复下游数据。
- `event_outbox` / `event_delivery_log` 保留 90 天后归档。

## 7. 权限模型落地

### 7.1 六种权限的判定点

| 权限 | 判定点 | 典型插件 |
|---|---|---|
| `READ` | 本插件 Repository 读方法、发布 `READONLY` Tool | 全部 |
| `WRITE` | 本期前缀表 INSERT/UPDATE/DELETE、`WRITE`/`DESTRUCTIVE` Tool | pomodoro、note |
| `NETWORK` | 经 `ctx.httpClient()` 的任何出站请求（禁止自建 HttpClient） | translation |
| `FILE` | `ctx.fileAccess()` 读写，细分 `FILE.READ` / `FILE.WRITE` | ocr、import |
| `SYSTEM` | 外部进程、全局快捷键、开机自启 | 暂无 |
| `AI` | 调用 `ai` 模块 LLM/Embedding（禁止插件直连模型 API） | pomodoro、note |

### 7.2 声明与运行时校验

```json
"permissions": ["READ", "WRITE", "AI"]
```

```java
public interface PluginContext {          // 敏感能力只能从这里取，禁止自行 new
    String pluginId();
    PluginConfig config();
    EventPublisher events();
    ToolRegistrar tools();
    RepositoryAccess repositories();      // 自动加表前缀 + 归属校验
    HttpClient httpClient();              // 仅 NETWORK 可用，否则 PERMISSION_DENIED
    FileAccess fileAccess();              // 仅 FILE.* 可用
    AiGateway ai();                       // 仅 AI 可用
}
```

- 校验位置：**宿主侧** `PermissionGuard`，在 `init`/`start` 按声明注册能力句柄；未声明的句柄返回**拒绝代理**（调用即抛 `PERMISSION_DENIED`）而非 `null`（避免 NPE 掩盖越权）。
- 双保险：`ToolInvoker` 在 Tool 层按 `sideEffect` 再校验一次。
- CI 静态扫描：`plugins/**` 禁止 import `java.net.http.*` `java.io.File` `ProcessBuilder` `RestTemplate` `WebClient`，违规即构建失败。

### 7.3 用户授权流程与持久化

```text
插件声明 permissions
  → 首次加载：含 NETWORK / FILE.* / SYSTEM / DESTRUCTIVE 时
       → 前端弹授权面板（逐项说明“为什么需要”）→ 用户同意 → 写 plugin_permission_grant
  → 仅 READ / WRITE / AI：告知式授权（记录，无需弹窗），理由：本机数据、可随时撤回
```

表 `plugin_permission_grant`：`plugin_id` `permission` `granted` `granted_at` `scope(json，如目录白名单)` `revoked_at`。

### 7.4 拒绝时的降级

| 缺失权限 | 降级行为 |
|---|---|
| `READ` / `WRITE` | 插件 `FAILED` 不加载（核心权限无法降级） |
| `AI` | 降级模式运行：Tool 返回 `PARTIAL` + `warning: AI_UNAVAILABLE`，UI 隐藏 AI 生成入口 |
| `NETWORK` | 相关 Tool 返回 `PERMISSION_DENIED`，其余功能正常 |
| `FILE.*` | 仅隐藏/禁用导入导出入口 |
| `SYSTEM` | 相关 Tool 不注册 |

降级必须在插件 UI 显著提示，**禁止静默吞掉**；所有降级写日志并可在"插件详情"查看。

## 8. 插件配置

| 项 | 规则 |
|---|---|
| Schema | `plugin.json#configSchema`，JSON Schema Draft 2020-12 **子集**：`type` `properties` `required` `enum` `default` `minimum` `maximum` `minLength` `maxLength` `pattern` `items` `additionalProperties:false`；**不支持** `$ref` / `oneOf` / `allOf`（第一版刻意收窄） |
| 默认值 | 每个可配置项**必须**有 `default`，保证零配置可运行 |
| 用户覆盖 | 表 `plugin_config`：`plugin_id` `config_key` `value_json` `updated_at`；运行时值 = default ⊕ 用户覆盖（顶层键浅合并） |
| 校验时机 | ① 加载时校验 schema 自身合法；② 用户保存时校验值（失败**整体拒绝**，不做部分保存）；③ `init` 前再校验合并结果，失败 → `FAILED` |
| 热更新 | **支持，仅限 `reloadable: true` 的键**（数值类如 `focusMinutes` 可热更；`dataPath`/`storage` 需重启）。`PluginConfig` 为不可变快照，变更时发布宿主内置事件 `PLUGIN_CONFIG_CHANGED` 并替换引用，插件在 `onConfigChanged` 决定是否应用 |
| 敏感项 | 标 `"x-secret": true`，加密存储，日志与 Tool 返回脱敏为 `***` |

```java
public interface PluginConfig {
    <T> T get(String key, Class<T> type);        // 已合并 default + 用户覆盖
    <T> T getOrDefault(String key, T fallback);
    boolean isReloadable(String key);
}
```

## 9. 插件数据隔离

| 规则 | 说明 |
|---|---|
| 表名 | `{plugin_id_snake}_{entity}`，如 `pomodoro_study_session`（`-` 转 `_`） |
| 必备字段 | `id BIGINT PK AUTO_INCREMENT` `user_id VARCHAR(64)` `created_at DATETIME(3)` `updated_at DATETIME(3)` `deleted TINYINT DEFAULT 0`（逻辑删除） |
| 禁止 | 读写宿主表（`user_*` `learning_*` `knowledge_*` `ai_*`）；需宿主数据一律走 Tool/事件 |
| 外键 / 访问 | 不使用 DB 外键（本地单机、迁移友好），完整性由 Service 保证；只能经 `ctx.repositories()` 访问，宿主动态拼前缀并校验归属 |
| 迁移 | 脚本置于 `backend/plugin/src/main/resources/db/migration/plugin/<plugin-id>/`，命名 `V1__create_pomodoro_tables.sql`；Flyway 多 location：`classpath:db/migration/core` + `classpath:db/migration/plugin/*` |
| 迁移边界 | 插件迁移**只能新增自己的表/索引**；改宿主表结构一律在 `core` 下由宿主维护 |
| 卸载 | **默认不删表**（数据是用户资产）；仅用户显式勾选"同时删除数据"才执行 `V*__drop_*.sql` |

跨插件数据访问：

| 场景 | 允许 | 禁止 |
|---|---|---|
| A 需要 B 的数据 | ① 订阅 B 的事件自建投影；② 调 B 的 `READONLY` Tool（需在 `dependencies` 声明且已授权） | 直接 SELECT B 的表；import B 的 Repository/Entity |
| A 需要 B 做事 | 发布事件由 B 订阅 | A 调 B 的 Service 实现类 |
| A 需要宿主数据 | 调宿主内置 Tool，如 `system.getKnowledgePoints` | 直接查 `knowledge_point` |

## 10. 版本兼容与废弃策略

| 变更 | 版本位 | 兼容要求 |
|---|---|---|
| 修 bug、改文案 | `PATCH` | 无 |
| 新增可选 Tool 参数、新增 Tool、新增事件、事件新增可空字段 | `MINOR` | 向后兼容：消费方必须忽略未知字段 |
| Tool 语义变更、字段删/改名或改类型、权限收紧、`id` 变更 | `MAJOR` | 不兼容，需迁移 |
| `apiVersion` 主版本不匹配 | — | Registry 拒绝加载并提示升级插件 |

| 规则 | 说明 |
|---|---|
| 事件版本 | 同 `eventName` 可有多个 `schemaVersion`；发布方只发最新版，消费方声明 `minSchemaVersion()`，总线对低版本消费方按需补齐/降级；跨 MAJOR 走**新事件名 + 旧名双发一个 MINOR 周期** |
| Tool 废弃 | 标 `@Deprecated(since, forRemoval)` + `plugin.json#deprecated`；仍注册但对 LLM 隐藏；至少保留 2 个 MINOR 版本后移除 |
| `id` 稳定 | id 永不复用；废弃插件保留元数据（`plugin_registry.status = RETIRED`），旧数据仍可查 |
| 配置废弃 | 移除键需保留一个 MINOR 周期，期间读取打 `WARN` 并忽略旧值 |

## 11. 参考实现规格

### 11.1 番茄钟插件 `pomodoro`（完整草案）

Metadata 见 3.2；权限 `READ` `WRITE` `AI`。**Tools**（输入必填加 `*`；`WRITE` 超时 5s，`READONLY` 10s）：

| 对外名 | 副作用 | 幂等 | 输入 | 输出要点 |
|---|---|---|---|---|
| `pomodoro.startStudySession` | WRITE | 否 | `subject?` `plannedMinutes?` `knowledgePointIds?` `note?` | `sessionId` `startedAt` `expectedEndAt` `state` `uiHint` |
| `pomodoro.finishStudySession` | WRITE | 是 | `sessionId*` `completed?` `abandonReason?` | `actualMinutes` `completed` `eventPublished` |
| `pomodoro.pauseStudySession` | WRITE | 是 | `sessionId*` | `state` `pausedAt` `accumulatedMinutes` |
| `pomodoro.resumeStudySession` | WRITE | 是 | `sessionId*` | `state` `expectedEndAt` |
| `pomodoro.getLearningStats` | READONLY | 是 | `from*` `to*` `subject?` `granularity?` | 见 5.5 |
| `pomodoro.listRecentSessions` | READONLY | 是 | `limit?`(默认 20，≤100) `subject?` | `sessions[]` `total` |
| `pomodoro.updateTimerConfig` | WRITE | 是 | `focusMinutes?` `breakMinutes?` `roundsBeforeLongBreak?` | `appliedConfig`（走第 8 节热更新） |

**Events**：发布 `STUDY_SESSION_STARTED` `STUDY_SESSION_FINISHED`（payload 见 6.3）、自定义 `POMODORO_BREAK_STARTED`（`sessionId` `breakMinutes` `roundIndex`）；订阅 `GOAL_COMPLETED` → 触发 `celebration` 提示，`KNOWLEDGE_MASTERED` → 面板推荐下一知识点（仅 UI 提示，不改数据）。

**数据表**：`pomodoro_study_session`（`id` `user_id` `subject` `planned_minutes` `actual_minutes` `state(RUNNING/PAUSED/FINISHED/ABANDONED)` `started_at` `ended_at` `completed` `abandon_reason` `note` `config_snapshot_json` `created_at` `updated_at` `deleted`；索引 `(user_id, started_at)`、`(user_id, subject, started_at)`）；`pomodoro_session_knowledge_ref`（`id` `session_id` `knowledge_point_id`）；`pomodoro_daily_stat`（`id` `user_id` `stat_date` `total_minutes` `session_count` `completed_count`，唯一键 `(user_id, stat_date)`，由 `STUDY_SESSION_FINISHED` 消费者更新的读优化投影）。

**UI 契约**（桌面端只渲染，无业务逻辑）

| 项 | 值 |
|---|---|
| panel key | `pomodoro.timer` |
| 展示数据 | `GET /api/plugins/pomodoro/panels/timer` → `{state, subject, plannedMinutes, elapsedSeconds, remainingSeconds, roundIndex, todayMinutes}` |
| 操作 | `POST /api/plugins/pomodoro/actions/{start\|pause\|resume\|finish}`（body 与同名 Tool 输入一致） |
| 实时更新 | WS 频道 `plugin.pomodoro.timer`，消息 `{type: TICK\|STATE_CHANGED\|SESSION_FINISHED, payload}`；`TICK` 每秒，其余事件驱动；断线重连后先拉一次 REST 全量再订阅，避免丢状态 |
| 桌宠状态映射 | 会话中 → `learning`；结束 → `success`；AI 生成总结中 → `loading`；连续 4 轮 → `celebration`（词表见 `docs/character-spec.md`） |

### 11.2 笔记插件 `note`（简要规格）

| 项 | 内容 |
|---|---|
| 权限 | `READ` `WRITE` `AI` |
| Tools | `note.createNote`(WRITE)、`note.updateNote`(WRITE)、`note.searchNotes`(READONLY；`query` `knowledgePointIds?` `tags?` `limit?` `offset?`)、`note.summarizeNote`(READONLY+AI，生成摘要但不落库) |
| Events | 发布 `NOTE_CREATED`（见 6.3）、自定义 `NOTE_UPDATED`(`noteId` `changedFields` `schemaVersion`)；订阅 `KNOWLEDGE_CREATED` 用于联想标签 |
| 数据表 | `note`(`id` `user_id` `title` `content_md` `source` `created_at` `updated_at` `deleted`，索引 `(user_id, updated_at)`)；`note_knowledge_ref`(`note_id` `knowledge_point_id`)；`note_tag`(`note_id` `tag`)；全文检索 Phase 7 再接 |
| UI / 依赖 | panel `note.list` + `note.editor`，操作走 REST；无插件依赖，与 `knowledge` 只通过事件与宿主内置 Tool 协作 |

## 12. 插件开发检查清单（Review 用）

**定义与边界**
- [ ] 满足三条定义（可用 + 产数据 + AI 可调），缺一已说明理由
- [ ] 未 import 其它插件实现类、`ai.*`、桌面端模块；无自建 `HttpClient`/`File`/`ProcessBuilder`

**Metadata**
- [ ] `id` 合规未占用；`version` 语义化；`apiVersion` = 当前规范版本
- [ ] `capabilities` 全在受控词表；`permissions` 为最小必要集合
- [ ] `configSchema` 每项有 `default`，无 `$ref`/组合关键字
- [ ] `entrypoints.tools` 与 `published`/`subscribed` 事件和实现**完全一致**

**生命周期**
- [ ] `onInit`/`onStart`/`onStop`/`onUnload` 均幂等，重复调用无副作用
- [ ] `onStart` 失败路径能注销已注册 Tool 与订阅；`onStop` 处理在飞调用不阻塞卸载

**Tool**
- [ ] 命名 `{pluginId}.{toolName}`，无保留前缀冲突；`WRITE` 未假称幂等
- [ ] 声明了 `sideEffect`/`idempotent`/`timeout`，并已记入 `plugin_tool_invocation_log`（含 `trace_id`）
- [ ] 用枚举错误码；`FAILED` 时 `data` 为 `null`；错误信息含字段名与原因；参数校验早于副作用

**Event 与权限**
- [ ] 只发已声明事件；payload 与 6.3 一致（自定义事件已登记本文档）
- [ ] 消费端按 `eventId` 幂等，重试不产生重复数据；事件在业务事务内写 outbox
- [ ] 敏感能力全部经 `PluginContext` 获取；缺权限降级已实现并在 UI 提示；需授权项能触发授权面板

**数据 / 配置 / 质量**
- [ ] 表名带前缀；含 `user_id`/`created_at`/`updated_at`/`deleted`；卸载默认保留数据
- [ ] 迁移在 `db/migration/plugin/<plugin-id>/`，只新增自己的对象
- [ ] 热更新键标 `reloadable` 且实现 `onConfigChanged`；敏感项标 `x-secret` 并脱敏
- [ ] 单测覆盖参数校验失败、幂等、权限拒绝降级、事件消费幂等；单类 ≤ 300 行；日志含 `pluginId` 与 `traceId`；`description` 说明"何时调用"而非实现细节

## 附：待补充项

| # | 事项 | 阶段 |
|---|---|---|
| 1 | `plugin_registry`/`plugin_config`/`plugin_permission_grant`/`plugin_tool_invocation_log`/`event_outbox`/`event_delivery_log` 完整 DDL → `docs/database.md`；桌面端插件 UI 通用渲染契约 → `docs/plugin-ui.md` | Phase 4 |
| 2 | 插件间 Tool 调用的授权粒度（是否逐次确认） | Phase 6 |
| 3 | 在线安装 / 插件市场 / 签名校验 | Phase 9 |
