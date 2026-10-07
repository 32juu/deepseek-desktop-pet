# 开发日志与偏差记录

> 用途：记录与 CLAUDE.md 的偏差、架构决策（ADR 摘要）、美术/文档不一致。
> 规则：任何偏离 CLAUDE.md 的决定都必须在此登记原因；本文件不替代 CLAUDE.md。

## 待办 / 已知偏差

| # | 事项 | 状态 | 说明 |
|---|---|---|---|
| 1 | 美术目录 `assert/` → `assets/` | ✅ 已完成 | 已在建 Tauri 工程前改名，避免以后多处引用再返工。已同步 `CLAUDE.md` 第 9 节、`docs/character-spec.md` 第 1 行、`docs/product.md` Q9。 |
| 2 | Phase 0 文档 | ✅ 已完成 | `product.md`(350) / `architecture.md` / `plugin-spec.md`(551) / `database.md`(1478) / `roadmap.md` / `ai-levels.md` / `character-spec.md` 全部就位。 |
| 3 | 技术栈 | ✅ 已定案 | 见 D6（版本已冻结）。 |
| 4 | `plugin-spec.md` 遗留 4 项 | 待处理 | ① 宿主侧 6 张表 DDL 归 `docs/database.md`（Phase 4 补齐）；② 桌面端插件 UI 渲染契约建议另立 `docs/plugin-ui.md`（Phase 4）；③ 插件间 Tool 授权粒度（Phase 6）；④ 在线安装/签名（Phase 9）。 |
| 5 | `database.md` 与迁移脚本的真源关系 | 待落实 | 按 D5，`db/migration/*.sql` 为唯一可执行真源，`database.md` 同步跟进；Phase 7 的 `vector_*` 单独放 `V7__vector.sql`。 |
| 6 | V7 向量表已随 MVP 建出 | 已接受 | 见 D10：Flyway 会执行 `classpath:db/migration` 下**所有** `V*.sql`，包括 V7。空表无成本，不为此引入自定义 Flyway 配置。 |
| 7 | 项目此前不是 git 仓库 | ✅ 已解决 | 已 `git init -b main` 并首次提交；`application-local.yml` 经 `git check-ignore` 确认未被跟踪。 |
| 8 | dsh 的本地仓库路径 | 已确认 | Maven 本地仓库在 `D:\repo`（由 `D:\Maven\...\conf\settings.xml` 指定），非默认 `~/.m2/repository`。排查依赖问题时要看这里。 |

## 决策记录

> 编号按登记顺序（D0→D6→D1），不代表逻辑先后。新增决策顺延编号。

### D0：开发环境实测（2026-02）

| 组件 | 实测结果 | 影响 |
|---|---|---|
| JDK | `D:\jdk\jdk17\jdk-17.0.12` (17.0.12) | 满足 Spring Boot 3.x |
| Maven | `D:\Maven\apache-maven-3.8.2` | 可用（3.8.x 对 Spring Boot 3 足够） |
| Node / npm | v20.19.6 / 10.8.2 | 满足 Tauri 2 前端构建 |
| MySQL | **8.1.0**，服务 `MySQL81` 正在运行 | 已连通：库 `pet_assistant` + 专用账号 `pet_app`（最小权限），Flyway 建表 26 张 ✅ |
| Git | `D:\ruanjian\Git\cmd\git.exe` | 可用 |
| MSVC | Visual Studio Community 2022 17.11.4（含 C++ 生成工具） | 满足 Tauri Rust 编译前置 |
| WebView2 | 154.0.4258.62（已装） | 满足 Tauri 运行时前置 |
| Rust / Cargo | 原缺失 → 已装 rustup + stable-msvc（**rustc/cargo 1.99.0**），`%USERPROFILE%\.cargo\bin` 已写入用户 PATH | Tauri 壳可编译 |
| Redis | 未安装 | 见 D2 |
| Docker Desktop | 已安装但守护进程未运行 | 本期不用；将来做 Testcontainers 时需启动 |
| pnpm | 未安装（仅 npm） | 用 npm 即可，或按需 `npm i -g pnpm` |

### D2：MVP 不引入 Redis

- 背景：CLAUDE.md 第 10 节规划 MySQL + Redis；但本项目 MVP 为**单用户本地运行**，
  Redis 承担的 Session / 缓存 / 在线状态 / 限流 / 短期上下文在单用户场景下没有实际收益。
- 决策：MVP 只跑 **MySQL 单库**；后端**保留** `spring-boot-starter-data-redis` 依赖与
  profile 切换开关，默认走内存实现（Spring Cache `ConcurrentMapCacheManager`）。
- 影响：将来需要 Redis 时，改配置 + 启动服务即可，不需要改业务代码。
- 依据：CLAUDE.md 第 2.3 条"不过度设计"。

### D3：主键策略确定为有符号 BIGINT

- 决策：所有表主键 `BIGINT NOT NULL AUTO_INCREMENT`（**不用** `UNSIGNED`）。
- 理由：`UNSIGNED` 经 JDBC/JPA 会映射为 `BigInteger`，与 Java `Long` 互转易踩坑；
  有符号上限 9.2×10^18 对本项目规模远远够用。
- 详见 `docs/database.md` 第 1.2 节。

### D4：学习目标做最小实现，主动提醒默认关闭

- 学习目标（`study_goals`）：MVP **只做最小实现**——建目标、关联学习会话、显示进度。
  不做目标拆解、不做 AI 自动定计划（那是 Phase 8）。
- 主动提醒：**默认关闭**，用户设置里显式开启后才能触发，且频率可调、可静音。
  依据：CLAUDE.md 第 2.8 条"少打扰，但有用"。
- 影响：`pet_settings` 需要 `proactive_reminder_enabled`（默认 0）与频率字段。

### D8：跨端 Schema 契约

- 决策：把三端共享的常量集中定义在 `docs/database.md` 第 1.8 节，代码中必须引用常量，
  禁止散落字面量。含：本地用户 `id=1L`、软删除哨兵 `'1970-01-01 00:00:00.000'`、
  会话时区 `UTC`、无物理外键、主键有符号 `BIGINT`、字符集 `utf8mb4_0900_ai_ci`，
  以及 API Key 只存 AES-256-GCM 密文、禁止进日志/事件/Trace。
- 影响：Java 侧需提供 `LocalUser.ID` 与 `SoftDelete.NOT_DELETED` 常量类；前端不做用户切换。

### D9：DDL 生成与验证工具链

- 决策：`db/migration/*.sql` 由 `tools/extract-ddl.ps1` 从 `docs/database.md` 机械抽取生成，
  避免手抄漂移；`tools/verify-migration.ps1` 在临时库上真实执行验证后自动清理。
- 已知坑（务必保留注释）：
  1. `docs/database.md` 中一个代码块可能含多张表（`notes`/`note_tags`/`note_tag_rel`），
     抽取脚本**必须按 CREATE TABLE 语句边界切分**，否则重复建表（首版脚本踩过）。
  2. `tools/*.ps1` 必须存为**带 BOM 的 UTF-8**：本机 shell 是 Windows PowerShell 5.1，
     无 BOM 会按 GBK 解析导致中文乱码并报语法错。
  3. 本机**没有 `pwsh`**（PowerShell 7），只有 5.1；脚本中不可用 `??`、三引号 here-string、
     `-Parallel` 等 7.x 特性。

### D10：V7 向量表随 MVP 一并建出（接受偏差）

- 事实：Flyway 的 `locations` 是 `classpath:db/migration`，会执行该目录下**所有** `V*.sql`，
  包括 `V7__vector.sql`。实际验证时 V7 已执行并建出 2 张空表（`vector_collections` /
  `vector_chunks`），`flyway_schema_history` 中 version=7 success=1。
- 决策：**接受**。理由：两张空表无空间与性能成本；若为此引入自定义 Flyway 配置
  （忽略 `V7*` 的 `ignoreMigrationPatterns` 或搬迁目录），反而是为一个不产生价值的问题
  增加复杂度，违反 CLAUDE.md 第 2.3 条。
- 与 D5 的差异：D5 原写"V7 本期不执行"，**实际是已执行**。此处更正 D5 的表述：
  "V7 的表结构在 RAG 阶段前不写入任何数据，也不被任何代码引用"。
- 将来 RAG 阶段无需新迁移，直接开始写数据即可。

### D11：LLM 配置必须允许"无 Key 启动"

- 背景：`spring-ai-starter-model-openai` 会注册 chat/embedding/image/audio/moderation
  **全部**自动配置，且其 `@ConditionalOnProperty` 为 `matchIfMissing=true`（默认全开）。
  未配置 API Key 时，`OpenAiAudioSpeechModel` 构造抛
  `OpenAI API key must be set`，导致**整个应用上下文启动失败**。
- 决策：
  1. 用 **`spring.ai.model.<模态>=none`**（1.1.x 官方开关）关闭 embedding / image /
     moderation / audio.speech / audio.transcription，只保留 chat。
     **注意：`spring.ai.openai.audio.speech.enabled` 在 1.1.8 不存在，写了无效**——
     这是本次踩坑点，已写入 `application.yml` 注释。
  2. `api-key` 给占位默认值 `not-configured`，保证应用可启动；真正调用 LLM 时若仍是
     占位值，应由 `ai` 模块**显式报错并降级**，而不是让启动失败。
- 理由：桌宠、番茄钟、学习记录、统计都不依赖 LLM，用户应能在设置页后补 Key。
  这是 CLAUDE.md 第 2.8 条"用户可控制模型 API"的实现前提。

### D12：迁移脚本的 classpath 供给方式

- 问题：迁移脚本真源在仓库根 `db/migration/`，不在后端 classpath 上，Flyway 启动时
  报 `No migrations found`（首次启动实际踩到，历史表已建但 0 条迁移）。
- 决策：由 `backend/pom.xml` 的 `maven-resources-plugin` 在 `process-resources` 阶段
  把 `../db/migration/*.sql` 复制到 `${project.build.outputDirectory}/db/migration`。
- 为什么不在 `backend/src/main/resources` 放副本：**迁移脚本必须只有一份真源**，
  且需与 `docs/database.md`、`tools/` 同级维护，复制只发生在构建期，仓库内无副本。

### D5：迁移脚本按 Phase 切分，Phase 7 表不进 MVP- 决策：`db/migration/` 下按 Phase 切分；MVP 只执行 `V1__init_user_plugin.sql`、
  `V2__init_learning.sql`、`V3__init_knowledge_ai_event.sql`。
  `docs/database.md` 第 8 节的 `vector_collections` / `vector_chunks` 放到
  `V7__vector.sql`，**RAG 阶段才执行**。
- 理由：MVP 不该背着 Phase 7 的表结构跑；且 DDL 文档与迁移脚本要保持一份真源，
  脚本为准、文档同步。

### D6：技术栈与版本冻结

| 项 | 定案 | 说明 |
|---|---|---|
| 桌面端 | **Tauri 2.x** | 见 `docs/architecture.md` 第 1 节：常驻内存 ~40MB（Electron 80~150MB）+ 原生无边框/置顶/穿透窗口能力 |
| JDK | **17**（本机 17.0.12） | 与 Spring Boot 3.5 基线一致 |
| 后端 | **Spring Boot 3.5.16**（不用 4.x） | 4.x 依赖 Framework 7，MyBatis-Plus 等国内生态适配未成熟，MVP 不冒险 |
| AI | **Spring AI 1.1.8**（不用 2.0.x） | 2.0 面向 Boot 4；1.1.8 是 Boot 3.5 配套稳定线 |
| ORM | **MyBatis-Plus 3.5.9**（不用 JPA） | 表结构已在 `database.md` 落地，走 SQL 优先、字段可见可调的路线，契合"直接连库查看"的使用习惯 |
| 迁移 | **Flyway**（core + mysql） | DDL 真源放 `db/migration/` |
| 数据库 | **MySQL 8.1**（本机已运行） | 见 D2：MVP 单库，不引入 Redis |
| 构建 | Maven（后端）/ npm（前端）/ Cargo（Tauri 壳） | pnpm 未安装，前端先用 npm |

- 依据：CLAUDE.md 第 12.1 条"不过度设计"——版本选择偏稳定线，不追最新。

### D7：沙箱与权限策略

- 背景：开发初期 DSH 工作目录因 ACL 缺少 `WRITE_DAC`，导致沙箱初始化失败
  （`SetNamedSecurityInfoW failed (Win32 5): grantWrite(...)`），当时连 `echo hi` 都跑不了。
  这是**环境故障**，不是策略拦截，已修复。
- 决策（分阶段）：
  1. **构建期（现在 ~ MVP 闭环跑通）**：保持 `danger-full-access`。理由：`mvn` 写
     `~/.m2`、`cargo` 写 `.cargo/.rustup`、`npm` 写 `%APPDATA%\npm-cache`，均在
     工作目录之外；而审批策略为 `never` 时无法临时升级，收紧会直接中断开发。
  2. **稳定期**：切回 `workspace-write`（日常改代码/文档/`mvn -o compile` 足够）。
  3. 若长期用 `workspace-write`，**审批策略应设回 `ask`**，为越界请求留兜底通道。
- 依据：CLAUDE.md 第 2.3 条"不过度设计"的反面——安全配置应取"够用且可回收"，
  不长期保持最大权限。

### D1：CLAUDE.md 压缩策略

- 背景：原 CLAUDE.md 1154 行，作为每次会话上下文成本过高，且含大量重复表述。
- 决策：根 `CLAUDE.md` 只保留"Agent 指令 + 核心约束 + 当前阶段"，约 150 行；
  路线图、AI 能力分级、角色规范拆到 `docs/`，以 `## 9. 参考文档` 链接。
- 影响：修改架构必须同步 CLAUDE.md；详细内容改动只动 `docs/`。
