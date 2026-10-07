# CLAUDE.md

> 本文件是项目的唯一上下文入口（Agent 指令 + 核心约束），**必须保持精简**。
> 详细设计放 `docs/`，不要让本文件膨胀。改动架构必须同步本文件。

## 1. 项目是什么

以 **DeepSeek 蓝色大肥鱼（鱼尾女仆娘）** 为视觉形象的桌面 **个人 AI 学习助手 / Personal Learning OS**。

不是"桌宠"，也不是"聊天客户端"。桌宠只是交互入口与视觉载体，真正的核心是这个长期闭环：

```
用户学习 → 使用学习插件 → 产生学习行为与数据 → 持久化 → 知识沉淀
    → 个人学习画像 → AI 分析/主动辅助 → 更个性化的体验 → 继续学习 ↺
```

核心竞争力不是"能调用哪个大模型"，而是：
> 能否用长期学习数据让 AI 越来越理解用户，并通过插件持续帮助学习。

## 2. 不可违背的约束

1. **桌宠 ≠ AI**：客户端只是表现层，业务逻辑不进桌宠；换掉 UI 不影响核心。
2. **模块边界**：`Plugin` 不得依赖 Desktop UI / DB；Agent 不得直接操作数据库，只能
   `Agent → Tool → Plugin/Service → Repository → DB`。
3. **不过度设计**：第一版只做最小闭环。禁止提前引入微服务、多 Agent、复杂工作流、
   MQ 集群、插件市场、在线安装、复杂权限系统——除非真实需求已产生。
4. **模块化优于微服务化**：早期是 Modular Monolith，先保证边界清晰，将来再拆服务。
5. **不要为了 AI 而 AI**：普通 Java 逻辑能可靠完成（精确计算、权限判断、核心事务、
   数据一致性、DB 约束）就不交给 LLM。LLM 只做：理解语言、总结、分类、推理、生成、
   推荐、知识问答。
6. **数据优先真实**：学习画像 / 掌握度只能来自真实行为 + 插件数据 + 用户主动确认，
   禁止让模型凭空编造用户学习情况。
7. **AI 输出必须可追溯**：结论要能回答"为什么、用了哪些数据、调了哪些工具、引用了哪些知识"。
8. **少打扰，但有用**：主动提醒必须有依据、有价值、可关闭、可调频率；用户可控制主动提醒、
   插件权限、模型 API、数据存储、学习记录。
9. **事件驱动优先**：新能力尽量通过事件扩展（订阅已有事件），而不是改已有插件。
10. **优先级顺序**：产品闭环 > 数据闭环 > 插件体系 > AI 能力 > Agent > RAG > 生态。

## 3. 架构

```
Desktop Client  (大肥鱼 / 对话 / 学习状态 / 通知 / UI)
        │ HTTP + WebSocket
Learning Assistant Runtime  (用户 / 学习 / AI / Agent / 插件)
        ├── Plugin      → 学习能力（可被用户使用、可产生数据、可被 AI 调用）
        ├── AI Runtime  → LLM / RAG
        ├── Event Bus   → 学习事件
        ↓
Data Layer  (MySQL + Redis [+ 后续 Vector DB])
```

技术方向：后端 **Java + Spring Boot + Spring AI + MySQL + Redis**；桌面端 **Tauri / Electron**
（可依实际体验调整）；桌面技术不得限制后端架构。Vector DB 到 RAG 阶段再选
（Milvus / pgvector / Chroma 之一），不为了"技术栈丰富"而加。

MySQL 存：用户、插件、学习记录/任务、错题、知识点、笔记、用户画像、Agent 会话。
Redis 存：Session、缓存、临时状态、桌宠在线状态、短期上下文、限流、分布式锁。

## 4. 插件

插件 = **可被用户使用、可产生学习数据、可被 AI 调用的能力模块**，不是普通功能页面。

```
Plugin = Metadata + UI + Tools + Event Handlers + Data Model + Configuration
Metadata ≥ 名称 / 版本 / 作者 / 描述 / 能力 / 依赖 / 权限 / 配置
```

权限模型：`READ / WRITE / NETWORK / FILE / SYSTEM / AI`（如 OCR 需 `FILE.READ`，
浏览器需 `NETWORK`）。涉及文件、浏览器、Shell、系统命令必须用户明确授权。

规划中的插件：`pomodoro(计时)`、`note(笔记)`、`wrong-question(错题)`、`knowledge(知识库)`、
`quiz(题库)`、`vocabulary`、`ocr`、`translation`、`code-review`。

## 5. 学习数据三层

| 层 | 内容 |
|---|---|
| 行为数据 | 学习时间/时长、使用插件、完成题目、错题、看知识、建笔记、AI 对话、复习 |
| 知识数据 | 知识点树 + 每个点的掌握程度、错误次数、学习次数、最近学习/复习时间、关联笔记/题目、AI 总结 |
| 用户画像 | 学习目标/方向、掌握程度、薄弱点、习惯、时间、频率、历史、近期与长期目标 |

## 6. 事件

`QUESTION_COMPLETED` `QUESTION_WRONG` `STUDY_SESSION_STARTED` `STUDY_SESSION_FINISHED`
`KNOWLEDGE_CREATED` `KNOWLEDGE_MASTERED` `NOTE_CREATED` `GOAL_COMPLETED`

```
QuizPlugin → QUESTION_COMPLETED → EventBus → {统计, 错题, 知识图谱, 成就, AI 分析}
```

## 7. 当前阶段与优先级

当前：**设计阶段收尾 → MVP 开发**。路线与阶段目标见 `docs/roadmap.md`。

首期只做：**桌宠 + AI 聊天 + 学习记录 + 基础插件 + 数据持久化**。

MVP 必须跑通：

```
启动桌宠 → AI 聊天 → 开始学习 → 启动学习插件 → 产生学习记录 → 存 MySQL
        → 统计学习数据 → AI 读取数据 → 生成学习总结
```

这个闭环没跑通之前，禁止开发复杂 Agent。

每个阶段结束都自检：**当前设计是否仍服务于"数据沉淀 → AI 理解 → 个性化学习"？**
不服务就降优先级或删掉。

## 8. 执行规则（每个任务）

1. **先理解再改**：读相关代码 → 理解架构 → 找到真实调用链 → 判断影响面 → 再动手。
   禁止未读代码就重构。
2. **最小修改**：能局部解决就不大重构，不顺手改无关代码。
3. **架构变更（或存在多个合理方案）先出方案**：列出方案 A / 方案 B / 推荐方案 + 推荐原因，
   不要默认选最复杂的。
4. **流程**：理解 → 读代码 → 判断架构 → 最小方案 → 改代码 → 编译 → 测试 → 查副作用 → 总结。
5. **代码质量**：可读、模块化、单一职责、异常处理、日志、参数校验、数据一致性、并发安全、
   API 设计、可测试。禁止巨型 Controller/Service、重复代码、魔法字符串、无意义抽象、
   为了设计模式而设计模式。

### Agent 开发要求

每个 Agent 必须写清 `Goal / Tool / Input / Output / Memory / Context / Failure / Fallback`。
例：`LearningAgent` goal=分析学习状态，tools=`getLearningStats/getWrongQuestions/getWeakKnowledgePoints`，
input=userId，output=LearningAnalysis，failure=Tool 失败则降级为普通回答。

## 9. 参考文档

- `docs/roadmap.md` — Phase 0~9 路线图与各阶段目标
- `docs/character-spec.md` — 大肥鱼状态机、微动效、表情、触发场景（视觉实现依据）
- `docs/ai-levels.md` — AI 能力 Level 0~5 演进定义
- `assets/` — 美术资源与角色素材
