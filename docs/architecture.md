# OpenClaw Orchestrator 技术架构设计文档

> **版本**：v1.0.0 | **最后更新**：2026-03-10

---

## 1. 设计背景与目标

### 1.1 为什么需要 Orchestrator

OpenClaw 是一个开源的多 Agent 运行时平台，提供 Agent 执行环境、Gateway 实时网关（WebSocket + JSON-RPC 2.0）、JSONL 会话系统、Agent-to-Agent 乒乓通信以及 Cron/Heartbeat 调度。

但 OpenClaw 本身是**运行时引擎**，缺少上层编排管理能力：

| 缺口 | 痛点 |
|------|------|
| 无可视化编排 | 多 Agent 任务依赖、分支逻辑只能手动管理 |
| 无团队管理 | Agent 分组、排班、轮值没有统一抽象 |
| 无实时监控 | Agent 状态、通信链路缺乏统一视图 |
| 无人机协同 | 需人类审批的场景没有卡点机制 |
| 配置分散 | 模型选择、API Key 需直接编辑配置文件 |

**定位：在 OpenClaw 运行时之上，构建可视化的编排管理层。**

### 1.2 设计原则

| 原则 | 含义 |
|------|------|
| **寄生式架构** | 不替代 OpenClaw，附着其上。Agent 执行仍由 OpenClaw 完成，Orchestrator 只做编排决策 |
| **零配置可用** | 安装即用，自动发现本机 OpenClaw 环境 |
| **优雅降级** | OpenClaw 任何组件不可用时系统仍工作，功能减少但不宕机 |
| **单端口部署** | 前端 + API + WebSocket 统一端口，无需反向代理 |
| **配置共享** | 直接读写 OpenClaw 的 `openclaw.json`，不维护独立副本 |

---

## 2. 系统架构总览

### 2.1 三层架构定位

```
┌─────────────────────────────────────────────────────────────┐
│              OpenClaw Orchestrator（本项目）                  │
│   可视化编排 · 团队排班 · 实时监控 · 通知审批 · 模型管理     │
├─────────────────────────────────────────────────────────────┤
│                   OpenClaw 集成适配层                         │
│   Gateway 连接 · Webhook 调用 · 文件系统读写 · 配置共享      │
├──────────────┬─────────────────┬────────────────────────────┤
│  Gateway     │   Webhook       │    ~/.openclaw/ 文件系统    │
│  ws://18789  │   :3578         │    JSONL · Cron · Heartbeat │
├──────────────┴─────────────────┴────────────────────────────┤
│                  OpenClaw Agent 运行时                        │
│          Agent 执行 · 会话管理 · 工具调用 · A2A 通信         │
└─────────────────────────────────────────────────────────────┘
```

Orchestrator 不直接管理 Agent 执行过程，只负责"什么时候、让哪个 Agent、做什么任务"。即使 Orchestrator 停机，正在运行的 Agent 不受影响。

### 2.2 前后端分层

```
浏览器 ───────────────────────────────────────────────────
  工作流编辑器 · 实时监控 · 工作室场景 · 通知中心
  状态管理：Agent / Team / Workflow / Monitor 四个 Store
  REST API ↕ WebSocket 双向事件 · 统一端口 :3721

后端 ─────────────────────────────────────────────────────
  API 路由层 → 业务服务层 ─┬→ OpenClaw 集成层（三通道）
                          └→ 本地数据层（SQLite WAL）
```

---

## 3. 与 OpenClaw 的集成设计

这是整个架构最核心的部分——如何"寄生"在 OpenClaw 之上工作。

### 3.1 三通道接入

```
                        Orchestrator
                  ┌─────────┼─────────┐
             ① Gateway   ② Webhook  ③ 文件系统
             (实时双向)   (任务触发)  (兜底+持久化)
                  └─────────┼─────────┘
                     OpenClaw 运行时
```

| 通道 | 协议 | 能力 | 适用场景 |
|------|------|------|---------|
| Gateway | WebSocket + JSON-RPC 2.0 | 事件订阅、RPC 查询、指令下发 | 实时监控、状态查询 |
| Webhook | HTTP POST | 向 Agent 发送任务/消息 | 工作流任务触发 |
| 文件系统 | 直接文件 I/O | JSONL 会话、Cron 排班、Heartbeat、配置 | 兜底通信、排班同步、配置共享 |

### 3.2 三层触发降级

向 Agent 发送指令时，自动选择最佳通道并逐层降级：

```
发送指令
  │
  ├→ Gateway RPC ── 成功 → 直接获得响应（最快，毫秒级）
  │                  失败 ↓
  ├→ Webhook HTTP ── 成功 → 轮询 JSONL 等待响应
  │                  失败 ↓
  └→ JSONL 文件直写 ─ 等待 Agent 运行时自动拾取（最慢但最可靠）
```

**设计考量**：文件系统总是可用的，确保在任何部署环境下指令都能送达。

### 3.3 双源事件采集与去重

同时从两个来源采集 Agent 事件，互补而非互斥：

```
  Gateway 实时推送              文件 JSONL 变更监控
  （低延迟，依赖连接）           （高可靠，依赖文件IO）
        │                            │
        ▼                            ▼
   事件分发器 ───按消息ID去重──── 文件监控器
        │                            │
        └────────────┬───────────────┘
                     ▼
               合并后广播到前端
```

- Gateway 正常时事件来自 Gateway（低延迟），推送的 ID 标记为"已见"
- 文件监控发现同 ID 消息时自动跳过
- Gateway 断连后文件监控自动接管，无缝切换

### 3.4 配置共享

直接读写 `~/.openclaw/openclaw.json`，不维护独立配置：

```
用户在 UI 修改模型 / API Key
        ↓
  写入 openclaw.json (models.providers / agents.list)
        ↓
  OpenClaw 运行时读取同一文件 → Agent 使用新配置
```

- 支持 OpenClaw 三种 API Key 格式：明文、`${ENV_VAR}`、SecretRef
- 模型 ID 使用 `provider/model-id` 格式（如 `anthropic/claude-sonnet-4-5`）

### 3.5 Gateway 认证

```
启动 → 解析 Token（环境变量 → openclaw.json → 无）
     → WebSocket 连接 + Authorization: Bearer <token>
     → JSON-RPC connect 握手 { params.auth.token }
     → 本地连接(localhost) Gateway 自动放行，无需 Token
     → 认证失败(1008) → 60s 长间隔重试，不轰炸 Gateway
```

---

## 4. 工作流引擎设计

### 4.1 有向图执行模型

工作流不是线性队列，而是 DAG 图遍历——天然支持分支、汇合、回跳：

```
  ┌──────┐     ┌──────────┐     ┌──────┐     ┌──────┐
  │ 分析  │───→│ 条件判断  │───→│ 编码  │───→│ 审批  │
  │ Agent │    │ 质量达标? │    │ Agent │    │(暂停) │
  └──────┘    └────┬─────┘    └──────┘    └──────┘
                   │ 不达标
                   └──────→ 回跳到"分析"节点重新执行
```

### 4.2 四种节点类型

| 节点 | 行为 | 与 OpenClaw 的交互 |
|------|------|-------------------|
| **Task** | 向指定 Agent 发送任务，等待响应 | 通过集成层三层降级调用 Agent |
| **Condition** | 根据上游 Agent 输出评估分支 | 解析 Agent 响应内容做匹配 |
| **Parallel** | 并行调用多个 Agent，汇合结果 | 并发通过集成层调用 |
| **Approval** | 暂停执行，等待人工审批 | 不与 OpenClaw 交互，纯 Orchestrator 内部 |

### 4.3 上下文穿透

上游节点的 Agent 产物自动注入下游 Task 的 prompt，形成信息传递链：

```
Task A (分析 Agent) → 产出分析报告
        ↓ 自动注入
Task B (编码 Agent) → prompt 包含"上游分析报告"全文
        ↓ 自动注入
Task C (测试 Agent) → prompt 包含"编码结果"
```

### 4.4 暂停与恢复

审批节点暂停时，完整执行上下文（已执行节点的产物、当前位置）序列化到数据库。审批通过后从断点继续图遍历。服务重启后也能恢复。

### 4.5 条件表达式引擎

评估上游 Agent 输出，决定分支走向：

| 匹配模式 | 示例 | 说明 |
|---------|------|------|
| 子串包含 | `contains:error` | Agent 输出含 "error" |
| 正则匹配 | `regex:^SUCCESS \d+` | 正则搜索 |
| JSON 字段 | `json:status=success` | 解析 JSON 比较字段值 |
| 组合逻辑 | `expr1 \|\| expr2` / `expr1 && expr2` | 与或组合 |

---

## 5. 团队与排班设计

### 5.1 团队模型

```
Team ──────────── 1:N ──────────── Agent（成员）
  │                                  │
  ├── 工作室场景（可视化协作空间）      ├── 角色分配
  ├── 排班配置                        ├── 独立模型配置
  ├── 工作流（战术桌）                 └── 心跳状态
  └── 共享知识库
```

### 5.2 四种排班模式

| 模式 | 调度逻辑 | 与 OpenClaw 同步方式 |
|------|---------|---------------------|
| 轮询 | 按顺序轮流分配任务 | Webhook 触发 |
| 优先级 | 优先分配给高优先级 Agent | Webhook 触发 |
| 时间段 | 按时间表排班值班 | 写入 OpenClaw Cron `jobs.json` |
| 自定义 | 用户自定义 Cron 表达式 | 写入 OpenClaw Cron `jobs.json` |

### 5.3 Agent 状态感知

综合三个信号源判断 Agent 在线状态：

```
Gateway 实时状态推送 ─┐
                     ├→ 综合判断 → idle / working / offline / error
JSONL 会话活动 ──────┤
                     │
Heartbeat.md 心跳 ───┘
```

---

## 6. 实时通信设计

### 6.1 事件体系

后端到前端通过 WebSocket 推送 9 种事件：

| 事件 | 触发场景 | 数据来源 |
|------|---------|---------|
| `new_message` | Agent 产生新消息 | Gateway + 文件监控 |
| `agent_status` | Agent 状态变化 | Gateway + 文件监控 |
| `communication` | Agent-to-Agent 通信 | Gateway + 文件监控 |
| `tool_call` | Agent 工具调用 | Gateway |
| `gateway_status` | Gateway 连接/断开/认证失败 | 连接器 |
| `workflow_update` | 工作流执行状态变更 | 工作流引擎 |
| `notification` | 新通知 | 通知服务 |
| `approval_update` | 审批状态变更 | 审批路由 |

### 6.2 工作室可视化

团队详情页中的"工作室"是数据驱动的协作可视化场景：

```
┌─────────────────────────────────────────────┐
│              团队工作室                       │
│                                              │
│   🧑‍💻 Agent A ←──通信连线──→ 🧑‍💻 Agent B     │
│     (working)     │           (idle)         │
│                   │                          │
│   🧑‍💻 Agent C    ←┘                          │
│     (offline)          ┌──────────────┐      │
│                        │ 任务白板      │      │
│   ＋ 空工位(点击邀请)   │ · 进行中 3   │      │
│                        │ · 已完成 12  │      │
│                        └──────────────┘      │
└─────────────────────────────────────────────┘
```

- Agent 间通信以 SVG 连线呈现，线宽 = 近 60s 通信频率
- 工位点击跳转到 Agent 通信频道
- 任务白板实时反映团队任务状态

---

## 7. 数据架构设计

### 7.1 存储策略

采用**双存储**设计——Orchestrator 自有数据存 SQLite，OpenClaw 相关数据直接读写文件系统：

```
Orchestrator 数据（SQLite）          OpenClaw 数据（文件系统）
  teams / team_members                 openclaw.json（配置共享）
  workflows / executions               agents/*/sessions/*.jsonl
  tasks / approvals                    agents/*/HEARTBEAT.md
  notifications / knowledge            cron/jobs.json
  schedule_jobs                        teams/*/shared/*
```

**设计考量**：Orchestrator 不复制 OpenClaw 的数据，直接原地读写。SQLite 选择 WAL 模式确保读写不阻塞。

### 7.2 核心数据关系

```
Team ──1:N──→ TeamMember (agent_id + role)
  │
  ├──1:N──→ Task (assigned_agent_id)
  │
  └──1:N──→ Workflow ──1:N──→ Execution ──1:N──→ Approval
                                  │
                                  └── context_json（暂停恢复上下文）
                                  └── logs（执行日志流）
```

独立实体：`Notification`（全局通知）、`KnowledgeEntry`（Agent/Team 知识库）、`ScheduleJob`（排班任务）

---

## 8. 部署架构设计

### 8.1 单端口模型

```
:3721 ──→ /api/*      → FastAPI REST 路由
       ──→ /ws        → WebSocket 事件通道
       ──→ /*         → 前端静态文件（React SPA）
```

前端构建产物通过 hatch `force-include` 打包进 Python wheel，由后端直接托管。

### 8.2 四种部署方式

| 方式 | 命令 | 适用场景 |
|------|------|---------|
| pip install | `pip install openclaw-orchestrator && openclaw-orchestrator serve` | 最简单，本地开发 |
| Docker | `docker run -p 3721:3721 -v ~/.openclaw:/root/.openclaw ...` | 隔离性好 |
| Docker Compose | `docker compose up -d` | 可编排扩展 |
| systemd | `deploy.sh` 一键部署 | 生产服务器 |

### 8.3 与 OpenClaw 的部署关系

```
场景 A：同机部署（推荐）
  OpenClaw + Orchestrator 在同一台机器
  → Gateway 本地连接自动放行，无需认证
  → 文件系统直接共享 ~/.openclaw/
  → 零配置即可工作

场景 B：分离部署
  OpenClaw 在机器 A，Orchestrator 在机器 B
  → 需配置 OPENCLAW_GATEWAY_URL 指向远程 Gateway
  → 需配置 OPENCLAW_GATEWAY_TOKEN 认证
  → 需共享或挂载 ~/.openclaw/ 目录
  → Webhook URL 需配置为可达地址
```

---

## 9. 关键设计决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 后端语言 | Python（非 Node.js） | OpenClaw 是 Python 生态，可 `pip install` 一键安装，未来可直接 `import openclaw` |
| 数据库 | SQLite（非 PostgreSQL） | 本地单用户服务，零运维，跟随 OpenClaw 目录无需额外部署 |
| Agent 执行 | 委托给 OpenClaw（非自己实现） | 寄生式架构，不重复造轮子，利用 OpenClaw 完整的 Agent 能力 |
| 前端打包 | 嵌入 Python wheel（非独立部署） | 单端口 = 用户体验最简，`pip install` 即包含完整 UI |
| 事件采集 | Gateway + 文件双源（非单一） | 互补而非互斥，既要低延迟又要高可靠 |
| 配置存储 | 共享 openclaw.json（非独立配置） | 一份配置源，避免同步问题 |
| 工作流模型 | DAG 图遍历（非线性队列） | 支持条件分支、回跳、并行、暂停恢复 |
