# OpenClaw Orchestrator 架构设计文档

> **版本**：v3.0.0 | **最后更新**：2026-03-10

---

## 1. 为什么需要这个项目

### 1.1 OpenClaw 解决了什么

OpenClaw 是一个文件系统驱动的多 Agent 运行时。它的核心哲学是**文件即 API**：

- Agent 的身份是 `IDENTITY.md`
- Agent 的性格是 `SOUL.md`
- Agent 的行为规则是 `AGENTS.md`
- Agent 的对话是 `sessions/*.jsonl`
- Agent 的配置是 `openclaw.json`

这是一套优雅的设计。但 OpenClaw 自己只管"怎么运行一个 Agent"，不管"怎么让多个 Agent 协作"。

### 1.2 OpenClaw 缺什么

| 缺口 | 现状 | 实际影响 |
|------|------|---------|
| 多 Agent 编排 | 需手动管理执行顺序 | 10 个 Agent 的依赖关系全靠人脑记 |
| 产物传递 | 无"上游输出→下游输入"机制 | Agent A 写了分析报告，Agent B 看不到 |
| 团队协作 | 需手动编辑 openclaw.json | 每加一个团队成员要写 N 条 A2A 配置 |
| 实时监控 | 看文件系统日志 | 不知道哪个 Agent 在忙、哪个出错了 |
| 会议讨论 | 不存在 | 5 个 Agent 无法坐下来讨论同一个问题 |

### 1.3 Orchestrator 的定位

**不替代 OpenClaw，寄生于其上。**

Orchestrator 是 OpenClaw 文件系统的 UI 操作界面和编排决策层。Agent 的执行仍由 OpenClaw 完成，Orchestrator 只决定"什么时候、让哪个 Agent、做什么任务、把谁的产出传给谁"。

即使 Orchestrator 停机，正在运行的 Agent 不受影响——因为 Agent 的一切状态都在文件系统中，不在 Orchestrator 的内存或数据库里。

---

## 2. 核心设计决策：寄生式架构

### 2.1 为什么不自建一套

很多多 Agent 框架（CrewAI、AutoGen、LangGraph）都自建了 Agent 定义、消息传递、状态管理的全套基础设施。这带来一个问题：**你的 Agent 被锁死在这个框架里。**

OpenClaw 已经有了一套完整的 Agent 运行时，并且用了文件系统这个最朴素、最通用的接口。Orchestrator 的选择是：**直接读写 OpenClaw 的文件，不维护任何 Agent 配置的独立副本。**

```
用户在 Orchestrator UI 修改 Agent 名称 "code-reviewer" → "代码审查员"
    ↓
agent_service.update_agent({identity: {name: "代码审查员"}})
    ↓
markdown_parser.generate_identity_md() → 生成带 YAML frontmatter 的 Markdown
    ↓
file_manager.write_file("agents/code-reviewer/IDENTITY.md", content)
    ↓
OpenClaw 运行时下次读同一个文件 → Agent 名称更新
```

### 2.2 这意味着什么

- **零配置同步**：Orchestrator 和 OpenClaw 不需要任何同步机制，因为它们读写同一份文件
- **命令行兼容**：用户用 `openclaw` CLI 修改 Agent，UI 上立即可见
- **Orchestrator 可拔除**：停掉 Orchestrator，OpenClaw 一切照常。Agent 文件还在那里
- **无锁定**：不需要"导出/导入"Agent 到其他系统

### 2.3 三层架构全景

```
┌─────────────────────────────────────────────────────────────┐
│              OpenClaw Orchestrator（本项目）                  │
│   可视化编排 · 团队管理 · 会议系统 · 实时监控 · 排班调度     │
│                                                              │
│   ↕ 直接读写 ~/.openclaw/ 下的文件                           │
│   ↕ 不维护 Agent 配置的独立副本                              │
│   ↕ 唯一自有数据：工作流定义、执行上下文、审批记录（SQLite）  │
├─────────────────────────────────────────────────────────────┤
│                     三通道接入层                              │
│                                                              │
│   Gateway ws://18789   Webhook :3578   文件系统 ~/.openclaw/ │
│   （实时事件流）        （任务触发）      （读写 Agent 文件）  │
├─────────────────────────────────────────────────────────────┤
│                  OpenClaw Agent 运行时                        │
│   文件驱动执行 · JSONL 会话 · A2A 乒乓通信 · Cron 调度       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 与 OpenClaw 的集成设计

这是本项目最核心的架构设计——如何深度利用 OpenClaw 的文件系统，而不是在其旁边另建一套。

### 3.1 Markdown-as-Configuration：Agent 文件操作

OpenClaw 中的 Agent 是一个目录：

```
~/.openclaw/agents/<agent-id>/
├── IDENTITY.md      ← 身份：名称、emoji、主题色、问候语（YAML frontmatter）
├── SOUL.md          ← 灵魂：核心信念、边界、氛围（## Section 格式）
├── AGENTS.md        ← 规则：启动流程、记忆、安全、工具协议
├── HEARTBEAT.md     ← 心跳：存活清单，守护进程定期检查
├── skills.json      ← 技能列表
└── sessions/
    └── *.jsonl      ← 会话记录（JSON Lines 格式）
```

Orchestrator 用 `python-frontmatter` 双向解析这些 Markdown 文件。IDENTITY.md 用 YAML frontmatter + body 格式；SOUL.md 和 AGENTS.md 按 `## Section` 标题拆分。

**Agent 的性格是可编辑的 Markdown。** 用户在 UI 上修改灵魂的任何字段，最终都落笔为文件系统中的一段 Markdown 文字。OpenClaw 不需要知道 Orchestrator 的存在——它只管读文件执行。

### 3.2 openclaw.json：共享配置中枢

`~/.openclaw/openclaw.json` 是两者唯一共享的 JSON 配置文件：

| Orchestrator 做的事 | 读写 openclaw.json 的位置 |
|---------------------|--------------------------|
| 选择 Agent 模型 | `agents.list[].model.primary`（`provider/model-id` 格式）|
| 注册/注销 Agent | `agents.list[]` 数组 |
| 配置团队 A2A 通信 | `agentToAgent.allow[]`（自动生成双向通信对）|
| 管理 API Key | `models.providers.<name>.apiKey`（三种格式兼容）|
| 读取 Gateway Token | 搜索 `gateway.auth.token` 等三个可能路径 |

最典型的例子：用户在 UI 上把 Agent B 拖进团队 → `team_service` 自动在 `agentToAgent.allow` 中注册所有新的双向通信对 → OpenClaw 运行时立即允许这些 Agent 的乒乓通信。**用户只做拖拽，底层配置完全自动化。**

### 3.3 三层触发降级：向 Agent 发送指令

这是 Orchestrator 与 OpenClaw 通信的核心通道设计。

```
invoke_agent("code-reviewer", "请审查这段代码...")
  │
  ├→ ① Gateway RPC: sessions.spawn ── 成功 → 轮询 JSONL 等待响应
  │   通过 WebSocket 直连 Gateway，JSON-RPC 2.0 协议
  │   创建会话 + 发首条消息 → Agent 被触发执行
  │                                     失败 ↓
  ├→ ② Webhook HTTP: POST /hooks/agent ── 成功 → 轮询 JSONL 等待响应  
  │                                     失败 ↓
  └→ ③ JSONL 文件直写: append to sessions/*.jsonl
      OpenClaw 文件监控自动拾取 → Agent 被触发
```

**关键认知**：Gateway 是通信总线，不是执行引擎。它不支持 `agent.invoke`。正确的方法是 `sessions.spawn`（创建会话触发 Agent）和 `sessions.send`（向已有会话发消息）。Agent 响应不通过 Gateway 返回，而是写入 JSONL 文件——所以三层都需要后续轮询 JSONL。

**文件直写是终极兜底**。当 Gateway 断连、Webhook 服务不可用时，直接向 JSONL 文件追加一行 JSON，OpenClaw 运行时的文件监控机制会自动拾取。这是最慢但**永远可用**的方式——因为文件系统总是在的。

### 3.4 双源事件采集与去重

Orchestrator 同时从两个源头收集 Agent 事件：

```
Gateway 实时推送（低延迟）         JSONL 文件变更监控（高可靠）
         │                              │
    gateway_connector              session_watcher
         │                              │
         │  mark_seen(msg_id)           │  if msg_id in seen → skip
         └──────────┬───────────────────┘
                    ▼
          合并后广播到前端 WebSocket
```

- Gateway 推送消息后，调用 `mark_seen_from_gateway(msg_id)` 标记已处理
- SessionWatcher 发现相同 ID 的消息时自动跳过
- Gateway 断连后 SessionWatcher 无缝接管
- 双源互补而非互斥：Gateway 给低延迟，JSONL 给高可靠

---

## 4. 创新一：文件驱动的团队协作模型

### 4.1 设计理念

传统多 Agent 框架的协作模型是消息队列：Agent A 发消息给 Agent B，Agent B 回复。这有两个问题：

1. **Token 成本**：N 人会议中，每人都要看所有人的所有消息 → Token 平方级增长
2. **状态管理**：需要额外的消息中间件来保证送达和排序
3. **历史回溯**：对话散落在不同的消息通道中，难以回溯

Orchestrator 的选择：**用文件系统做协作载体。** OpenClaw 的 Agent 天然理解文件（它们读 Markdown 理解任务，写 JSONL 记录对话），那就让文件成为协作的媒介。

### 4.2 团队目录结构

```
~/.openclaw/teams/<team-id>/
├── team.md          ← 团队的"公共记忆"
├── meetings/        ← 会议记录
│   └── meeting_<id>.md
├── active/          ← 进行中的任务
│   └── task-<id>/
│       ├── task.md          ← 五段式协作文档
│       └── artifacts/       ← Agent 产出的文件 + manifest.json 索引
├── archive/         ← 已完成的任务（从 active/ 整体搬迁）
└── knowledge/       ← 团队知识库
```

### 4.3 team.md：活的协作契约

team.md 是四段式模板，但它**不是静态文档**：

```markdown
# 产品开发组

## 团队目标
构建高质量的产品功能

## 成员特长总结
<!-- 任务完成后自动追加 -->

## 协作规则
<!-- 在实践中逐渐沉淀 -->

## 历史教训与最佳实践
<!-- 每次任务完成后自动提炼追加 -->
```

每次任务完成，`_append_to_team_md()` 自动将总结追加到"历史教训"段落：

```markdown
### [2026-03-10] 任务「重构登录模块」总结
发现旧系统使用明文存储 session token，已改为 JWT + HttpOnly Cookie。
关键经验：安全审计应在编码前进行。
```

**价值**：team.md 随团队运行越来越厚，成为**文件驱动的团队记忆积累机制**。Agent 不需要 RAG 管道——直接读 team.md 就能获得历史经验。

### 4.4 task.md：Agent 间的异步协作载体

每个任务是一套目录结构，核心是 task.md 五段式协作文档：

1. **任务描述** — 人类写的任务说明
2. **参与成员** — 哪些 Agent 参与
3. **状态** — 进行中/已完成
4. **信息交换区** — Agent 们在此写进度、问题、决策（异步聊天板）
5. **产物引用区** — Agent 产出文件后自动追加 `📦` 指针

产物管理通过 `manifest.json` 索引 + 实体文件：Agent 调用 `add_artifact()` → 写文件 → 更新 manifest → 追加 task.md 引用 → WebSocket 广播。支持 30+ 文件类型自动推断、路径遍历防护、`.bak` 备份。

**意义**：整个任务文档既是 Agent 可读的输入（OpenClaw 可以让 Agent 读取了解上下文），也是人类可读的协作记录，也是可归档的历史资产。

---

## 5. 创新二：工作流产物链传递

### 5.1 不只是"先运行 A 再运行 B"

多数编排框架的工作流是线性队列。Orchestrator 的工作流是 **DAG 图遍历（while + current_node_id 指针）**，核心创新是**产物链传递**：上游 Agent 的输出自动编织进下游 Agent 的 prompt。

```
Agent A（分析）执行完毕
    ↓ 记录产物：node_artifacts["nodeA"] = [{content: "分析报告...", agentId: "analyst"}]
    
Agent B（编码）开始执行
    ↓ _collect_upstream_artifacts("nodeB") → 沿 DAG 入边收集上游产物
    ↓ _build_task_prompt() 构造 prompt：
    ↓   "## 任务: 编写代码
    ↓    根据分析报告修复问题
    ↓    ### 上游节点产出：
    ↓    **analyst** 的输出: 发现3个漏洞..."
    ↓ invoke_agent() 发给编码 Agent
```

**为什么注入 prompt 而非 API 传参？** 因为 Agent 只理解自然语言。把上游产出嵌入 prompt 文本，是让 Agent 获取上下文的最自然方式——不需要 Agent 有任何"接收参数"的能力。

### 5.2 条件分支与回跳

条件节点评估上游 Agent 的输出文本，支持：

| 匹配模式 | 示例 | 行为 |
|---------|------|------|
| 子串包含 | `contains:error` | 不区分大小写搜索 |
| 正则匹配 | `regex:^SUCCESS` | 正则搜索 |
| JSON 字段 | `json:status=success` | 从混合文本中提取 JSON 再匹配 |
| 组合逻辑 | `expr1 \|\| expr2` | OR/AND 组合 |

条件分支可以**回跳到上游节点**——比如代码质量不达标就回跳到分析节点重做。回跳时自动清除已执行节点的旧产物，`max_iterations` 防无限循环。

### 5.3 暂停与恢复

审批节点暂停时，`node_artifacts` 全量序列化为 JSON 存入数据库。审批通过后反序列化，从断点继续遍历。即使服务重启，只要数据库中有 `context_json` 就能恢复。

---

## 6. 创新三：共享文档会议系统

### 6.1 为什么不用消息队列

5 个 Agent 开会讨论一个问题。如果用消息队列：

- Agent 1 发言 → Agent 2/3/4/5 各收到一条 → Token × 4
- Agent 2 发言 → Agent 1/3/4/5 各收到两条 → Token × 8
- ...
- **Token 成本：O(N²×L)**，N 是人数，L 是发言长度

共享文档模式：

- 创建 `meeting_<id>.md`
- Agent 1 读文件（1份）→ 追加发言
- Agent 2 读文件（1份，含 Agent 1 发言）→ 追加发言
- ...
- **Token 成本：O(N×L)**，线性增长

### 6.2 七种会议类型

每种会议类型有专属的 prompt 模板：

| 类型 | 场景 | 发言格式要求 |
|------|------|------------|
| standup | 每日站会 | 昨天完成/今天计划/阻碍 |
| kickoff | 项目启动 | 理解的职责/问题建议 |
| review | 评审会 | 评审意见（参考前人观点）|
| brainstorm | 头脑风暴 | 创意提案 |
| decision | 决策会 | 立场+论据 |
| retro | 回顾会 | 做得好/做得差/改进 |
| debate | 辩论 | 正反方交替论证 |

### 6.3 Debate：交替对抗 + 共识检测

Debate 是特殊子类型：
- 固定 2 人，交替多轮（≤ maxRounds）
- 每轮双方各发言一次
- **共识检测**：如果双方开始同意对方观点（检测"同意"/"认可"等关键词），自动终止
- Lead 作为裁判撰写最终总结
- 结论自动追加到 team.md

### 6.4 会议生命周期

```
创建 meeting_<id>.md（模板+议题+参与者）     ← preparing
    ↓
顺序调用每个参与者 Agent                      ← in_progress
    → Agent 读 meeting.md → 追加发言 → 回复
    → 如果 Agent 没写文件，Orchestrator 代写兜底
    ↓
所有人发言完毕 → Lead 读完整记录 → 写结论    ← concluded
    ↓
结论追加到 team.md "历史教训"段落             ← 团队记忆积累
```

---

## 7. 创新四：管理者 Agent 自动创建体系

### 7.1 设计理念：协调者不执行

Orchestrator 引入**管理者 Agent**的概念，核心原则是：

> **管理者只负责协调和决策，不执行具体任务。**

这避免了"球员兼裁判"的问题：
- 传统设计中，团队 Lead 既是协调者又是执行者，角色冲突
- 管理者 Agent 专职协调，其他 Agent 专职执行，职责清晰
- 类似现实中的项目经理 vs 开发工程师

### 7.2 自动创建机制

创建团队时，系统自动创建管理者 Agent：

```python
# 创建团队时自动创建管理者 Agent
manager_agent = agent_service.create_manager_agent(team_id, team_name)
# ID: {team_id}-manager（确定性 ID）
# 名称: 团队管理员-{team_name}
# Emoji: 👑
# SOUL: 预定义的管理者角色模板
```

**管理者 Agent 的属性：**

| 属性 | 值 | 说明 |
|------|----|----|
| ID | `{team_id}-manager` | 确定性，可预测 |
| 名称 | `团队管理员-{team_name}` | 清晰表明身份 |
| Emoji | 👑 | 皇冠标识，视觉突出 |
| 模型 | OpenClaw 默认模型 | 无需特殊配置 |
| SOUL | 预定义模板 | 明确职责边界 |

**SOUL 模板片段：**

```markdown
## Core Truths
我是 {team_name} 团队的管理者。
我的职责是协调团队成员、分配任务、做出决策。
我不直接执行具体任务，而是将任务分配给合适的团队成员。

## Boundaries
- 我只负责协调和决策，不执行编程、分析等具体任务
- 我根据成员的能力和排班情况分配任务
- 我主持团队会议并总结结论
```

### 7.3 权限体系：Lead 是永久的

**设计决策：Lead 一旦创建就是永久的，不可更改。**

理由：
1. 管理者 Agent 是团队的核心协调者，稳定性至关重要
2. 避免"争夺领导权"的复杂场景
3. 如果需要新的管理方式，应该创建新团队

**实现的权限控制：**

| 操作 | 权限 | 说明 |
|------|------|------|
| 创建任务 | 用户可以，Lead Agent 可以 | 普通成员 Agent 不能分配任务 |
| 分配任务给成员 | 仅 Lead Agent | 防止成员随意派活 |
| 更改 Lead | 不支持 | Lead 是永久的 |
| 删除管理者 Agent | 不支持 | 管理者是团队基础设施 |

### 7.4 前端特殊处理

UI 中对管理者 Agent 有特殊展示：

- **置顶显示**：管理者 Agent 始终在成员列表第一位
- **角色禁选**：角色选择器显示"负责人"但不可更改
- **不可删除**：删除按钮对管理者 Agent 隐藏
- **标签标识**：显示"管理者"标签 + Lead 标签 + 👑 图标

### 7.5 team.md 增强

团队文档模板增加了新段落：

```markdown
# {name}

## 团队目标
{goal}

## 团队规范
<!-- Lead 可以定义和更新团队的工作规范 -->

## 工作流定义
<!-- 定义团队常用的工作流程 -->

## 成员能力总结
<!-- 任务完成后自动积累 -->

## 历史经验与教训
<!-- 任务完成后自动追加 -->
```

新增的"团队规范"和"工作流定义"段落由管理者 Agent 维护，形成团队的协作公约。

### 7.6 与会议系统的关系

管理者 Agent 在会议中的角色：

- **会议主持**：会议结束后由 Lead 阅读全部记录、撰写结论
- **结论权威**：Lead 的结论是最终决策，自动追加到 team.md
- **触发决策**：当普通 Agent 遇到需要团队决策的问题时，向 Lead 发起会议建议

---

## 8. 排班调度与 Cron 同步

### 8.1 四种排班模式

| 模式 | Orchestrator 行为 | 写入 OpenClaw 文件 |
|------|------------------|-------------------|
| 轮询 | 内存 round-robin 指针 | HEARTBEAT.md |
| 优先级 | 按 priority 排序 | HEARTBEAT.md |
| 时间段 | HH:MM → cron 表达式 | cron/jobs.json + HEARTBEAT.md |
| 自定义 | 解析自然语言规则 | cron/jobs.json + HEARTBEAT.md |

排班配置直接写入 OpenClaw 的 `cron/jobs.json`，由 OpenClaw 运行时的 Cron 守护进程执行。Orchestrator 不自己实现定时器。

自定义规则支持三种格式：cron 表达式（`"*/30 * * * *"`）、英文自然语言（`"every 30 minutes"`）、中文自然语言（`"每天 14:30"`）。

### 8.2 Agent 状态综合判断

结合四个信号源判断 Agent 实时状态：

```
Gateway 实时状态推送 ─┐
JSONL 会话活跃度 ────┤→ 综合判断 → busy / idle / scheduled / offline / error
Heartbeat.md 时间戳 ──┤
排班窗口匹配 ────────┘
```

优先级：error > busy（10s 后自动降级）> scheduled > idle > offline（60s 无活动）

---

## 9. 数据架构：双存储策略

```
Orchestrator 自有数据（SQLite WAL）         OpenClaw 数据（文件系统）
─────────────────────────                  ──────────────────────
teams / team_members                        agents/*/IDENTITY.md, SOUL.md, AGENTS.md
workflows / executions                      agents/*/sessions/*.jsonl
tasks / approvals                           agents/*/HEARTBEAT.md, skills.json
notifications / knowledge                   openclaw.json（配置中枢）
meetings / meeting_participants             teams/*/team.md, active/, archive/
schedule_jobs                               cron/jobs.json
```

**设计原则**：Orchestrator 不复制 OpenClaw 的数据，直接原地读写。SQLite 存的是 Orchestrator 独有的编排状态（工作流定义、执行上下文、审批记录）。

---

## 10. 部署设计

### 10.1 单端口模型

API + WebSocket + 前端 UI 全部通过同一端口（默认 3721）。前端构建产物通过 hatch `force-include` 打进 Python wheel，`pip install` 即包含完整 UI。

### 10.2 与 OpenClaw 的部署关系

```
场景 A：同机部署（推荐，零配置）
  OpenClaw + Orchestrator 在同一台机器
  → Gateway 本地连接自动放行，无需 Token
  → 直接共享 ~/.openclaw/ 文件系统
  → 安装即用

场景 B：分离部署
  → 需配置 OPENCLAW_GATEWAY_URL 和 TOKEN
  → 需共享或挂载 ~/.openclaw/ 目录
```

---

## 11. 关键设计决策汇总

| 决策 | 选择 | 为什么 |
|------|------|--------|
| 与 OpenClaw 的关系 | 寄生式，不自建 | 复用已有基础设施，不锁定用户 |
| Agent 配置存储 | 直接读写 Markdown 文件 | 遵循文件即 API，零同步成本 |
| 协作模型 | 共享文件目录 | Agent 天然理解文件，天然支持异步协作和归档 |
| 团队记忆 | 自动追加 team.md | 文件驱动的经验积累，无需 RAG 管道 |
| 产物传递 | 注入到 prompt 文本 | Agent 只理解自然语言，最自然的方式 |
| 会议模型 | 共享文档（非消息队列）| Token 线性增长，天然持久化 |
| A2A 配置 | 自动写入 openclaw.json | 用户拖拽成员，底层完全自动化 |
| 通信基质 | JSONL 文件 | 与 OpenClaw 共享同一套会话系统 |
| 事件采集 | Gateway + 文件双源 | 互补：低延迟 + 高可靠 |
| 降级策略 | 三层自动降级 | 文件系统永远可用，保证指令必达 |
| 后端语言 | Python | OpenClaw 是 Python 生态，可 pip install |
| 数据库 | SQLite WAL | 本地单用户服务，零运维 |
| 前端打包 | 嵌入 Python wheel | 单端口 = 最简用户体验 |
| 工作流模型 | DAG 图遍历 | 支持分支/回跳/并行/暂停恢复 |
| UI 风格 | 卡通办公室 | Agent 是"同事"不是"工具"，降低距离感 |

---

## 12. 价值总结

OpenClaw Orchestrator 的核心价值不在于"我们又做了一个多 Agent 框架"——市面上已经太多了。

它的价值在于**对 OpenClaw 文件系统驱动模型的深度理解和创新利用**：

1. **不自建基础设施，寄生于已有平台** — 所有操作落到 Markdown/JSONL/JSON 文件，与 OpenClaw 零摩擦对接
2. **文件是最好的协作载体** — team.md 积累团队记忆、task.md 承载异步协作、meeting.md 记录会议讨论，Agent 天然能读
3. **产物链传递解决了"Agent 们各干各的"问题** — 上游输出自动编织进下游 prompt，信息不断流
4. **共享文档模式降低会议 Token 成本** — 从 O(N²) 到 O(N)
5. **三层降级保证指令必达** — 文件系统是最后的堡垒

Orchestrator 为 OpenClaw 补全了从"运行单个 Agent"到"编排多 Agent 协作"的完整链路——而且是用 OpenClaw 自己的语言（文件）来做的。
