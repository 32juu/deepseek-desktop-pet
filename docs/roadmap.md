# 开发路线图

> 由 CLAUDE.md 拆出。CLAUDE.md 只保留当前阶段，细节在此维护。

## Phase 0：项目设计

目标：明确产品定位、技术栈、目录结构、模块边界、数据模型、插件协议。

输出（`docs/`）：

```
product.md       产品需求
architecture.md  系统架构
plugin-spec.md   插件规范
database.md      数据库设计
roadmap.md       本文件
```

## Phase 1：桌宠基础能力

桌宠窗口、大肥鱼形象、拖动、显示/隐藏、基础动画、状态切换、右键菜单、设置页面。
动画与状态定义见 `character-spec.md`。

## Phase 2：AI 对话

LLM API 配置、多模型支持、对话窗口、Streaming、会话保存、基础上下文、Token 使用统计。

## Phase 3：学习系统

学习目标、学习任务、学习记录、学习时长、学习统计、学习历史。

## Phase 4：插件系统

Plugin Metadata、Registry、Lifecycle、Tool、Event、Configuration，建立真正的插件规范。

## Phase 5：学习数据沉淀

错题、知识点、笔记、标签、学习行为、用户学习画像。

## Phase 6：Agent

Tool Calling、Plugin Tools、Agent Memory、Planning、Learning Agent。

## Phase 7：RAG

```
知识文档 → 文本切分 → Embedding → Vector DB → Retrieval → LLM
```

实现个人知识库。

## Phase 8：主动学习助手

薄弱知识点检测、学习提醒、自动复习、个性化计划、学习趋势分析、主动推荐插件。

## Phase 9：插件生态

Plugin Marketplace：搜索 → 安装 → 启用 → 授权 → AI 发现插件能力。

## 阶段自检

每完成一个阶段都要回答：当前设计是否仍服务于"学习数据沉淀 → AI 理解 → 个性化学习"的核心闭环？
不服务则降低优先级或删除。
