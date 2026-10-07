# 系统架构设计

> 本文是 Phase 0 的架构基线。约束以 `CLAUDE.md` 为准，本文只回答"怎么落地"。
> 涉及技术栈决策的变更必须同步 `CLAUDE.md` 第 3 节。

## 1. 技术栈定案

| 层 | 选型 | 定案理由 |
|---|---|---|
| 桌面端 | **Tauri 2.x**（Rust + Web 前端） | 桌面常驻对内存敏感（Electron 空载 80~150MB，Tauri 用系统 WebView 约 15~40MB）；无边框、置顶、点击穿透、多显示器定位等桌面窗口能力是 Tauri 原生强项；序列帧/Live2D 渲染由 WebView 承担，无短板 |
| 前端 | TypeScript + Vite，UI 框架待定（倾向轻量方案） | 桌宠窗口体积小、状态机驱动，不需要重型框架 |
| 后端 | **Java 17 + Spring Boot 3.x** | 见 `CLAUDE.md`；本地运行需本机 JDK 17+ |
| AI | **Spring AI** + OpenAI 兼容协议 | DeepSeek 等主流国产模型均提供 OpenAI 兼容接口，一套 `ChatClient` 可切模型 |
| 数据库 | **MySQL 8.0** + **Redis 7** | 用户熟悉 MySQL，数据可直接连库查看；Redis 用于会话短期上下文、限流、锁 |
| 迁移 | Flyway | 与 Spring Boot 原生集成（详见 `docs/database.md`） |
| 构建 | Maven（后端）+ pnpm（前端）+ Cargo（Tauri 壳） | 待确认本机工具链后固定 |

**前端不做业务计算**：所有统计、掌握度、streak 等数值一律由后端算好返回，前端只渲染。这是"桌宠 ≠ AI"在实现层的具体含义。

## 2. 进程与部署形态

桌面端与后端是**两个进程**，通过 `127.0.0.1` 上的 HTTP/SSE/WebSocket 通信：

```
┌─────────────────────── Tauri 进程 ───────────────────────┐
│  WebView(桌宠窗口)   WebView(对话/设置/插件窗口)           │
│  Rust 侧: 窗口管理 / 托盘 / 开机自启 / 全局快捷键 / 后端守护 │
└───────────────────────────┬──────────────────────────────┘
                            │ REST + SSE + WebSocket
┌───────────────────────────▼──────────────────────────────┐
│                Spring Boot 进程 (Java 17+)                │
│  user │ learning │ plugin │ ai │ knowledge │ event │ common│
└───────────────────────────┬──────────────────────────────┘
                            │ JDBC / Lettuce
                    ┌───────▼────────┐
                    │ MySQL 8 + Redis│
                    └────────────────┘
```

### 后端如何启动（分阶段，避免过度设计）

| 阶段 | 方式 | 说明 |
|---|---|---|
| MVP | **手动启动** `mvn spring-boot:run`，桌面端连接固定端口 | 最简单，便于看日志调试；桌宠检测到连不上时进入"离线态"并给出提示 |
| Phase 2+ | Tauri **sidecar** 托管 Java 进程：随机端口启动 → 写端口到握手文件 → 桌面端读取 | 避免端口冲突与"用户忘了开后端" |
| 将来若服务化 | 后端独立部署，桌面端走配置的远端地址 | 桌面技术不限制后端架构，此路径不需要改桌面端代码结构 |

**握手协议（预留）**：后端启动后把 `{port, token, pid}` 写入用户数据目录（如 `%APPDATA%\deepseek-pet\runtime.json`）；桌面端读取该文件。本地服务必须校验一次性 token，避免同机其他程序随意调用。

## 3. 后端模块边界

```
com.dspet
├── common      工具、统一响应、异常体系、错误码、日志与 TraceId
├── user        用户、偏好设置、模型 API 配置（加密存储）
├── learning    学习会话、任务/目标、统计聚合
├── knowledge   知识点、掌握度、笔记、错题、题目
├── plugin      插件注册表/生命周期/配置/权限、能力（Capability）抽象
├── event       领域事件、事件总线、outbox、幂等去重
├── ai          对话、Prompt 组装、模型路由、Token 统计、Agent Trace
└── agent       (Phase 6) Tool Calling 编排，本期只留扩展点
```

**允许的依赖方向**（单向，禁止回环）：

```
common ← 所有模块
event  ← 所有模块（只能发布/订阅，不反向调用业务模块）
plugin → knowledge, learning (通过接口)
ai     → plugin(只经 Tool 层), knowledge
agent  → ai, plugin(Tool)
learning/knowledge → common, event
```

**硬约束**：

- `plugin` 与 `ai` 模块**不得直接注入**彼此的 Service，只能经 `Tool` 接口与 `Event` 交互。
- `Repository` 只被本模块 `Service` 调用，任何跨模块访问必须走对方的 `Service` 接口。
- Controller 禁止承载业务逻辑；每个 Controller 只做参数校验 + 调用 Service + 组装响应。

## 4. 插件能力落点

插件 = 后端能力模块 + 桌面端 UI 包。后端侧提供三类出口，全部面向"可被 AI 调用"设计：

```java
public interface Plugin {
    PluginMetadata metadata();
    List<ToolDefinition> tools();        // 供 Agent Tool Calling
    List<DomainEventHandler> handlers(); // 订阅事件
    void onLifecycle(LifecycleEvent e);
}
```

- **ToolDefinition**：名称、描述、参数 JSON Schema、权限需求、幂等性标注（readonly/destructive）。
- 契约细节见 `docs/plugin-spec.md`；插件不得依赖桌面 UI，桌面端只按 UI 契约渲染。

## 5. 关键时序

### 5.1 一次 AI 对话（Level 0/1）

```
桌宠UI → POST /api/ai/chat (message, sessionId)
  → ai 模块: 加载会话上下文(Redis 短期 + MySQL 长期) + 组装 Prompt
  → Spring AI ChatClient → LLM (SSE 流式)
  → 边推流边落库(assistant 消息) → 统计 Token
  → 结束时发布 AI_MESSAGE_COMPLETED
  → 桌宠状态机: talking → idle
```

流式通过 `text/event-stream` 返回；前端断流后按 `messageId` 调 `GET /api/ai/messages/{id}` 补齐，避免内容丢失。

### 5.2 番茄钟结束 → 数据沉淀（MVP 核心闭环的骨架）

```
桌宠UI → POST /api/learning/sessions/start (pluginId=pomodoro, planMinutes=25)
  → learning 写 study_session(status=RUNNING)
  → event: STUDY_SESSION_STARTED
  → 桌宠状态机: learning (计时气泡)
... (前端本地倒计时，后端存 started_at，不依赖前端计时正确性)
桌宠UI → POST /api/learning/sessions/{id}/finish (实际时长由后端按 started_at 计算)
  → learning 事务内: 更新 session(status=FINISHED, duration) + 累加每日统计
  → 事务提交后 outbox 发布 STUDY_SESSION_FINISHED
  → 订阅者: 统计模块、成就、AI 分析(异步)
  → 桌宠状态机: success → idle
```

**要点**：时长以服务端时间为准；事件在**事务提交后**发布（outbox），避免"事件发出去了但数据回滚"。详见 `docs/database.md` 第 6 节。

### 5.3 AI 读取学习数据生成总结（闭环收尾）

```
用户: "总结一下我最近的学习"
  → agent(Phase 6) / ai(本期): 意图判断
  → Tool: getLearningStats(userId, range) → learning 模块
  → Tool 结果注入 Prompt（原始数据，不让 LLM 算数）
  → LLM 生成总结
  → 落库 Agent Trace: 用了哪些工具、参数、返回摘要、Token
```

**可追溯性落地**：每次工具调用写 `agent_trace` 表（工具名、入参、结果摘要、耗时、是否失败）。这是 `CLAUDE.md` 第 2.7 条的实现载体。

## 6. API 约定

- 前缀 `/api`，资源名词复数：`/api/learning/sessions`、`/api/knowledge/points`。
- 统一响应信封：

```json
{ "code": "OK", "message": "", "data": { }, "traceId": "..." }
```

- 错误码：`OK` / `PARAM_INVALID` / `NOT_FOUND` / `CONFLICT` / `PERMISSION_DENIED` / `PLUGIN_ERROR` / `AI_UNAVAILABLE` / `RATE_LIMITED` / `INTERNAL_ERROR`。禁止把异常堆栈返回前端。
- 分页统一 `page`(从 1) / `size`(默认 20，上限 100)，返回 `{items, total, page, size}`。
- 时间统一 ISO-8601 带时区字符串；服务端存储用 UTC + 时区换算（见 `docs/database.md`）。
- 变更类接口需支持 `Idempotency-Key` 头（番茄钟 start/finish、答题提交必须支持）。

## 7. 配置与密钥

- 分层配置：`application.yml`（默认）→ `application-local.yml`（本地，进 `.gitignore`）→ 环境变量。
- **LLM API Key 不落明文配置**：优先环境变量，其次由用户在设置页录入并**加密后存 MySQL**（AES-GCM，密钥来自用户级密钥或系统密钥库）。日志与接口响应中必须脱敏（只回显尾 4 位）。
- 端口、模型名、超时、重试次数、主动提醒开关全部可配置；`CLAUDE.md` 第 2.8 条要求用户可控。

## 8. 可观测性

- 日志：Logback，JSON 结构化；每条日志带 `traceId`（MDC 注入），前端请求头可携带以便串联。
- 关键埋点：LLM 调用耗时/Token/失败率、工具调用成功失败、事件发布与消费延迟。
- 本地开发阶段：`/actuator/health`、`/actuator/metrics` 够用即可，不引入 Prometheus/Grafana（过度设计）。

## 9. 测试策略

| 层 | 手段 | 重点 |
|---|---|---|
| 单元 | JUnit 5 + Mockito | Service 业务规则、时长计算、掌握度算法 |
| 数据 | Testcontainers(MySQL) 或 H2 不推荐 | 迁移脚本、DDL、索引是否命中 |
| 接口 | MockMvc / RestAssured | 契约、错误码、幂等 |
| 事件 | 内存 EventBus 测试替身 | 发布顺序、幂等去重、事务边界 |
| AI | 假 LLM（录制-回放） | Prompt 组装与 Tool 编排，不打真实 API |
| 端到端 | 手动脚本 | MVP 闭环九步走通 |

**AI 相关测试不得依赖真实 LLM**，否则测试不稳定且烧钱。

## 10. 演进路线（架构视角）

```
MVP: 双进程本地 + 单用户 + 手动启动后端
  → Phase 2: sidecar 托管后端 + SSE 流式对话
  → Phase 4: 插件注册表/生命周期/权限校验落地
  → Phase 6: agent 模块启用 Tool Calling + Trace
  → Phase 7: 引入向量存储（届时评估 pgvector/Milvus/Chroma，见 docs/database.md 第 8 节）
  → 将来: 若需多用户/服务化，仅替换 user 模块与鉴权，桌面端不变
```

## 11. 未决问题

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| 1 | 本机 JDK / Maven / Node / Rust 工具链是否具备 | 决定 MVP 何时能编译 | 需确认（当前 shell 被沙箱阻断，待权限修复后核实） |
| 2 | 前端 UI 框架与动画方案（序列帧 vs Live2D） | 影响角色表现力与资源工作量 | Phase 1 前定；先按序列帧 + CSS/Canvas 实现状态机 |
| 3 | 用户系统是否需要 | 影响鉴权与表结构 | 本期不做登录，但所有表保留 `user_id`，默认写入本地默认用户 |
