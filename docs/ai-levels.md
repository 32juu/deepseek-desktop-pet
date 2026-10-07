# AI 能力演进（Level 0~5）

> 由 CLAUDE.md 拆出。【现状】标记当前实现进度，未标记 = 未实现。
> 原则：不要跳级，不要一开始就构建复杂 Agent。

## Level 0：普通聊天

```
User → LLM → Answer
```
【现状】未实现。

## Level 1：上下文记忆

```
User → Conversation → Memory → LLM
```

## Level 2：Tool Calling

```
User → Agent → Tool → Plugin → Result → LLM
```

## Level 3：RAG

```
User → Agent → Knowledge Retrieval → Vector DB → Relevant Knowledge → LLM
```

## Level 4：学习 Agent

```
分析学习记录 → 发现薄弱点 → 制定学习计划 → 调用插件
    → 跟踪完成情况 → 分析效果 → 调整计划
```

## Level 5：主动学习助手

最终目标：

```
用户不主动询问
    → 系统发现"用户最近 MySQL 索引连续出错"
    → AI 判断 → 桌宠主动提醒 → 推荐复习
    → 调用题库插件 → 完成学习 → 记录结果
```

前置条件：主动能力必须建立在真实学习数据之上；必须满足"有依据 + 有价值 + 可关闭 + 可调频率"。
