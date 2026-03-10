<p align="center">
  <img src="docs/logo.svg" width="80" height="80" alt="OpenClaw Orchestrator Logo" />
</p>

<h1 align="center">OpenClaw Orchestrator</h1>

<p align="center">
  <strong>多 Agent 可视化编排平台</strong><br/>
  工作流编排 · 团队协作 · 会议系统 · 排班调度 · 实时监控 · 卡通办公室
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-≥3.10-blue?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
</p>

---

## 这个项目是什么

OpenClaw Orchestrator 是一个**多 AI Agent 可视化编排平台**，为多个 Agent 的协作场景提供完整的工作流设计、团队管理、会议系统、排班调度和实时监控能力。

它解决的核心问题是：**当你有多个 AI Agent 需要协同工作时——谁先做？谁后做？A 的输出怎么自动传给 B？多个 Agent 怎么"开会讨论"？它们的工作状态我怎么实时看到？**

> 不局限于 SDLC 场景。数据分析、内容创作、自动化运维、翻译流水线——任何需要多个 AI Agent 分工协作的场景均可编排。

---

## ✨ 功能特性

### 🔄 工作流引擎

基于 DAG 有向图的工作流执行引擎，支持复杂编排拓扑：

- **可视化工作流设计** — React Flow 画布上拖拽设计工作流，所见即所得
- **多节点类型** — Task（任务执行）、Condition（条件分支）、Parallel（并行执行）、Approval（人工审批）
- **产物链自动传递** — 上游 Agent 的输出自动注入下游 Agent 的 prompt，无需手动搬运
- **条件分支与回跳** — 支持 contains / regex / json 三种匹配模式，分支目标可指向上游节点实现循环与回溯
- **并行汇合策略** — AND（全部完成）/ OR（任一完成）/ XOR（恰好一个完成）三种汇合模式
- **人工审批卡点** — ApprovalNode 自动暂停执行，等待人工审批通过后断点续跑
- **失败自动重试** — `maxRetries` + `retryDelayMs` 按策略自动重试
- **防无限循环** — `maxIterations` 全局迭代次数守卫
- **上下文持久化** — 执行状态序列化到数据库，支持服务重启后无缝恢复

### 👥 Agent 管理

- **Agent 全生命周期管理** — 创建、身份配置（名字/emoji）、灵魂设定（人格/风格）、行为规则、技能挂载
- **AI 模型选择** — 支持为每个 Agent 独立配置 AI 模型和 API Key
- **实时对话** — 直接在 Chat 页面与 Agent 对话交互
- **会话历史** — 完整保留所有会话记录

### 👨‍👩‍👧‍👦 团队管理

- **团队组建** — 自由组合 Agent 组成团队，设定团队目标和协作规则
- **Team Lead 机制** — 指定 Lead 角色，会议结束后由 Lead 阅读全部记录撰写结论
- **团队记忆自动积累** — `team.md` 是活的协作契约，每次任务完成后自动追加总结，成为 Agent 可直接读取的"团队公共记忆"
- **团队目录结构** — 自动创建 `active/`（进行中任务）、`archive/`（归档）、`knowledge/`（知识库）、`meetings/`（会议记录）
- **A2A 通信配置自动化** — 添加团队成员时自动注册 Agent 间通信权限

### 🗣️ 会议系统

支持 7 种会议类型，让 Agent 们"坐下来"讨论：

| 类型 | 场景 | 特点 |
|------|------|------|
| standup | 每日站会 | 昨天完成 / 今天计划 / 遇到的阻碍 |
| kickoff | 项目启动会 | 理解职责 / 问题建议 |
| review | 评审会 | 参考前人观点，追加评审意见 |
| brainstorm | 头脑风暴 | 创意发散 |
| decision | 决策会 | 立场 + 论据 |
| retro | 回顾会 | 做得好 / 做得差 / 改进项 |
| debate | 辩论 | 2 人对抗 + 共识检测自动终止 |

**共享文档模式执行**：创建 `meeting_<id>.md`，Agent 轮流读取文件、追加发言。Token 成本线性增长 O(N×L)，而传统消息队列模式是平方级 O(N²×L)。

会议结束后由 Lead 撰写结论，结论自动追加到 `team.md`。

### 📅 排班调度

四种排班模式，灵活匹配不同调度需求：

| 模式 | 说明 |
|------|------|
| round-robin | 轮转分配 — 维护 turn 指针，按顺序分配任务 |
| priority | 优先级分配 — 分配给最高优先级的空闲 Agent |
| time-based | 时间段排班 — 转换为 cron 表达式定时执行 |
| custom | 自定义 — 直接写入自定义 cron 规则 |

### 📊 实时监控

- **Agent 状态追踪** — 实时展示每个 Agent 的在线状态与当前活动
- **通信事件流** — 实时展示 Agent 之间的消息交互日志
- **工作流执行历史** — 记录每次工作流执行的完整节点轨迹与耗时

### 🔔 通知系统

- **WebSocket 实时推送** — 工作流状态变更、审批请求等事件即时送达
- **浏览器原生通知** — 通过 Notification API 在桌面弹出提醒
- **通知中心面板** — 未读 badge + Popover 下拉列表，集中查阅所有通知
- **快捷审批操作** — 直接在通知面板内完成审批通过/驳回

### 🏢 卡通办公室可视化

Agent 不是抽象的 ID，而是有面孔的"同事"：

- **SVG 卡通角色** — 基于 emoji 哈希生成 80 种确定性面孔，每个 Agent 都有独特形象
- **办公室工作室场景** — Agent 坐在有显示器、咖啡杯、绿植的办公桌前，实时展示工作状态
- **状态光环** — 🟢 工作中（绿色脉冲）/ 🔵 空闲（蓝色静态）/ 🔴 异常（红色警告）/ ⚪ 离线（灰色）
- **通信连线可视化** — Agent 间通信以数据驱动的 SVG 连线呈现，线宽反映通信频率
- **会议桌、任务白板、排班日历、书架** — 完整的办公场景组件

### 📚 知识库

- Agent 级别和 Team 级别的知识库管理
- 知识条目的增删改查和搜索
- 知识统计

---

## 🏗️ 系统架构

```
                    ┌──────────────────────────────────────────────────┐
                    │                 用户 / 浏览器                      │
                    │          http://localhost:3721                    │
                    └──────────────────┬───────────────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────────────┐
                    │         OpenClaw Orchestrator（本项目）             │
                    │                                                   │
                    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
                    │  │ 工作流   │ │  团队    │ │  会议    │ │  排班  │ │
                    │  │  引擎   │ │  管理    │ │  系统    │ │  调度  │ │
                    │  └────┬────┘ └────┬────┘ └────┬────┘ └───┬────┘ │
                    │       │          │           │          │       │
                    │  ┌────▼──────────▼───────────▼──────────▼────┐  │
                    │  │         OpenClaw Bridge 桥接层              │  │
                    │  │  三层降级：Gateway → Webhook → JSONL 直写   │  │
                    │  └──────────┬──────────────────┬──────────────┘  │
                    │             │                  │                 │
                    └─────────────┼──────────────────┼─────────────────┘
                                  │                  │
                   ┌──────────────▼──────┐    ┌──────▼─────────────────┐
                   │   OpenClaw Gateway   │    │  ~/.openclaw/ 文件系统  │
                   │   ws://localhost:     │    │                        │
                   │        18789         │    │  agents/*/IDENTITY.md   │
                   │                      │    │  agents/*/SOUL.md       │
                   │  WebSocket 控制面     │    │  agents/*/sessions/*.   │
                   │  JSON-RPC 2.0        │    │            jsonl        │
                   │  实时事件推送         │    │  teams/*/team.md        │
                   └──────────┬───────────┘    │  openclaw.json          │
                              │                └──────────┬──────────────┘
                              │                           │
                   ┌──────────▼───────────────────────────▼──────────────┐
                   │              OpenClaw Agent 运行时                    │
                   │                                                      │
                   │   文件驱动执行 · JSONL 会话 · A2A 通信 · 工具调用     │
                   └──────────────────────────────────────────────────────┘
```

**单端口部署**：API + WebSocket + 前端 UI 全部通过同一端口（默认 3721），`pip install` 即完整可用。

---

## 🔗 与 OpenClaw 的结合

OpenClaw Orchestrator 不替代 [OpenClaw](https://github.com/openclaw)，而是**寄生在 OpenClaw 的文件系统之上**，用 Markdown / JSONL / JSON 这些 OpenClaw 的原生语言与之对话。

### 核心原则：共享文件系统，不复制数据

Orchestrator **没有自己的 Agent 配置数据库**，OpenClaw 的文件就是唯一数据源：

| 你在 UI 上做的事 | 落到 OpenClaw 文件系统 |
|-----------------|---------------------|
| 修改 Agent 名字/emoji | 写 `agents/<id>/IDENTITY.md` |
| 编辑 Agent 灵魂 | 写 `agents/<id>/SOUL.md` |
| 选择 AI 模型 | 写 `openclaw.json → agents.list[].model` |
| 配置 API Key | 写 `openclaw.json → models.providers` |
| 创建团队 | 建 `teams/<id>/` 目录 + `team.md` |
| 添加团队成员 | 写 `openclaw.json → agentToAgent.allow[]` |
| 向 Agent 发消息 | 追加 `agents/<id>/sessions/*.jsonl` |

这意味着：你用命令行改 Agent 的 Markdown，UI 上立即可见；你在 UI 上改配置，OpenClaw 运行时下次加载就生效。即使 Orchestrator 停机，Agent 照常运行。

### 三通道通信，自动降级

```
① Gateway RPC (sessions.spawn)     ← WebSocket 直连，毫秒级
         ↓ 失败
② Webhook HTTP (POST /hooks/agent)  ← HTTP 触发，秒级
         ↓ 失败
③ JSONL 文件直写                     ← 直接 append 到会话文件，最慢但永远可用
```

### 双源事件采集

同时从 Gateway 实时推送和 JSONL 文件变更监控两个源头收集 Agent 事件，消息 ID 去重。Gateway 给低延迟，文件系统给高可靠。Gateway 断连时文件监控无缝接管。

---

## 🚀 快速开始

### pip 安装（推荐）

```bash
pip install openclaw-orchestrator
openclaw-orchestrator serve
```

访问 **http://localhost:3721**。

### Docker

```bash
docker run -d --name openclaw-orchestrator \
  -p 3721:3721 -v ~/.openclaw:/root/.openclaw \
  openclaw-orchestrator
```

### Docker Compose

```bash
git clone https://github.com/lurkacai0831/openclaw-orchestrator.git
cd openclaw-orchestrator && docker compose up -d
```

### 源码安装

```bash
git clone https://github.com/lurkacai0831/openclaw-orchestrator.git
cd openclaw-orchestrator
bash scripts/build_frontend.sh          # 构建前端（需要 Node.js 18+ / pnpm）
cd server && pip install -e . && cd ..  # 安装后端
openclaw-orchestrator serve             # 启动
```

### 服务器一键部署

```bash
sudo bash scripts/deploy.sh
# 自动完成：环境检测 → 依赖安装 → 前端构建 → systemd 注册 → 开机自启
```

> ⚠️ 外网访问请确保安全组放行 **TCP 3721** 端口

---

## 📁 项目结构

```
openclaw-orchestrator/
├── server/                          # Python/FastAPI 后端
│   └── openclaw_orchestrator/
│       ├── app.py                   # 入口（API + WebSocket + 静态前端）
│       ├── services/
│       │   ├── workflow_engine.py   # 工作流 DAG 遍历引擎（产物链传递）
│       │   ├── meeting_service.py   # 会议/辩论执行引擎（7 种类型）
│       │   ├── team_service.py      # 团队管理（team.md / A2A 配置自动化）
│       │   ├── schedule_executor.py # 排班调度器（4 种模式）
│       │   ├── gateway_connector.py # Gateway WebSocket 连接器（JSON-RPC 2.0）
│       │   ├── openclaw_bridge.py   # OpenClaw 桥接层（三层降级触发）
│       │   ├── session_watcher.py   # JSONL 文件监控（双源之一）
│       │   └── ...                  # agent/task/chat/knowledge/notification 等
│       ├── routes/                  # RESTful API
│       └── websocket/               # WebSocket 事件广播
│
├── packages/web/                    # React 前端
│   └── src/
│       ├── pages/                   # Dashboard / Chat / Workflow / Monitor ...
│       ├── components/scene/        # 卡通办公室（工作室/会议桌/白板/书架/日历）
│       ├── components/avatar/       # SVG 卡通角色系统（80 种面孔）
│       └── stores/                  # Zustand 状态管理
│
├── docs/architecture.md             # 技术架构设计文档
├── Dockerfile                       # 多阶段构建
└── docker-compose.yml               # 一键启动
```

---

## ⚙️ 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | `3721` | 服务端口 |
| `OPENCLAW_HOME` | `~/.openclaw` | OpenClaw 主目录 |
| `OPENCLAW_GATEWAY_URL` | `ws://localhost:18789` | Gateway WebSocket 地址 |
| `OPENCLAW_GATEWAY_TOKEN` | *(空)* | Gateway 认证 Token |
| `OPENCLAW_WEBHOOK_URL` | `http://localhost:3578` | Webhook HTTP 地址 |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS 允许源 |
| `DB_PATH` | `$OPENCLAW_HOME/orchestrator.sqlite` | 数据库路径 |

---

## 🛠️ 开发

```bash
bash scripts/dev.sh
# 🐍 Python 后端：http://localhost:3721（热重载）
# ⚡ Vite 前端：http://localhost:5173（HMR）
```

---

## 🧰 技术栈

| 层 | 技术 |
|----|------|
| 后端 | FastAPI · Uvicorn · Pydantic · SQLite(WAL) · websockets · watchfiles · httpx |
| 前端 | React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui · React Flow · Zustand |
| UI 设计 | SVG 卡通角色系统 · 14 自定义动画 · cartoon-card 设计语言 · Lucide 图标 |
| 部署 | Docker · systemd · hatch wheel（pip install 一键安装） |

---

## 📄 License

[MIT](LICENSE)
