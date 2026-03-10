<p align="center">
  <img src="docs/logo.svg" width="80" height="80" alt="OpenClaw Orchestrator Logo" />
</p>

<h1 align="center">OpenClaw Orchestrator</h1>

<p align="center">
  <strong>给 OpenClaw 多 Agent 运行时加上大脑</strong><br/>
  一个寄生于 <a href="https://github.com/openclaw">OpenClaw</a> 文件系统之上的可视化编排层<br/>
  让 AI Agent 们知道「什么时候、做什么、把结果给谁」
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-≥3.10-blue?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
</p>

---

## 这个项目是什么？

**OpenClaw** 是一个文件系统驱动的多 Agent 运行时——每个 Agent 是一组 Markdown 文件，会话是 JSONL，配置是 JSON。它优雅地解决了"怎么运行一个 Agent"的问题。

但当你有 5 个、10 个 Agent 需要协作时，问题变了：

- 谁先做？谁后做？谁的输出传给谁？
- A 做完了，怎么自动把结果喂给 B？
- 5 个 Agent 开会讨论，怎么组织？谁来总结？
- 这些 Agent 的工作状态，我怎么实时看到？

**OpenClaw Orchestrator 就是来回答这些问题的。**

它不是另一个 Agent 框架。它不替代 OpenClaw，而是**寄生在 OpenClaw 的文件系统之上**，用它自己的语言（Markdown、JSONL、JSON）与之对话，为多 Agent 场景加上编排决策和可视化能力。

```
你在 UI 上把两个 Agent 拖进一个团队
    ↓
Orchestrator 自动在 ~/.openclaw/teams/ 创建协作目录
    ↓
自动在 openclaw.json 中注册 A2A 通信权限
    ↓
自动生成 team.md 协作契约
    ↓
你设计一个工作流：分析 → 条件判断 → 编码 → 审批
    ↓
Orchestrator 通过 Gateway/Webhook/JSONL 三层降级触发 Agent
    ↓
上游 Agent 的输出自动注入下游 Agent 的 prompt
    ↓
整个过程你在卡通办公室场景中实时观看
```

> 不局限于 SDLC 场景。数据分析、内容创作、自动化运维、翻译流水线——任何需要多个 AI Agent 分工协作的场景均可编排。

---

## 与 OpenClaw 的结合方式

核心设计原则是**寄生式架构**——不在 OpenClaw 旁边建新城，而是长在它身上。

### 共享文件系统，不复制数据

Orchestrator 所有对 Agent 的操作都直接读写 `~/.openclaw/` 目录：

| 你在 UI 上做的事 | Orchestrator 背后做的事 | 落到 OpenClaw 文件系统 |
|-----------------|----------------------|---------------------|
| 修改 Agent 名字/emoji | `generate_identity_md()` | 写 `agents/<id>/IDENTITY.md` |
| 编辑 Agent 灵魂 | `generate_soul_md()` | 写 `agents/<id>/SOUL.md` |
| 选择 AI 模型 | `_set_agent_model()` | 写 `openclaw.json → agents.list[].model.primary` |
| 配置 API Key | `provider_keys_service` | 写 `openclaw.json → models.providers.<name>.apiKey` |
| 创建团队 | `create_team()` | 建 `teams/<id>/` 目录 + `team.md` |
| 添加团队成员 | `_update_agent_to_agent_config()` | 写 `openclaw.json → agentToAgent.allow[]` |
| 向 Agent 发消息 | `invoke_agent()` 三层降级 | 追加 `agents/<id>/sessions/*.jsonl` |

**Orchestrator 没有自己的 Agent 配置数据库。** OpenClaw 的文件就是唯一数据源。这意味着你用命令行修改 Agent 的 Markdown，UI 上立即可见；你在 UI 上改配置，OpenClaw 运行时下次加载就生效。

### 三通道通信，自动降级

向 Agent 发送指令时，不走单一通道，而是三层自动降级：

```
① Gateway RPC (sessions.spawn)     ← WebSocket 直连，毫秒级
         ↓ 失败
② Webhook HTTP (POST /hooks/agent)  ← HTTP 触发，秒级
         ↓ 失败
③ JSONL 文件直写                     ← 直接 append 到会话文件，最慢但永远可用
```

Gateway 是 OpenClaw 的 WebSocket 通信总线。Orchestrator 通过 JSON-RPC 2.0 协议直连 `ws://localhost:18789`，实时收发事件。本地连接自动放行无需认证，远程连接支持 Token 认证。

同时，JSONL 文件监控 + Gateway 事件推送双源并行、ID 去重，既保证低延迟又不丢消息。

### 共享配置，一份源头

`openclaw.json` 是 OpenClaw 和 Orchestrator 的**唯一共享配置**。模型选择、API Key、A2A 通信权限、Gateway Token——全部在同一个文件中。Orchestrator 支持 OpenClaw 的三种 API Key 格式：明文字符串、`${ENV_VAR}` 环境变量引用、SecretRef 安全对象。

---

## 独特创新

### 1. 文件驱动的团队协作模型

**不走 HTTP API，走文件系统。**

传统多 Agent 框架用消息队列或 API 调用来协调 Agent。但 OpenClaw 的 Agent 天然理解文件——它们读 Markdown 理解任务，写 JSONL 记录对话。Orchestrator 顺势而为：

```
~/.openclaw/teams/<team-id>/
├── team.md          ← 活的协作契约（持续演化的团队记忆）
├── meetings/        ← 会议记录（meeting_<id>.md）
├── active/          ← 进行中的任务
│   └── task-<id>/
│       ├── task.md          ← 五段式协作文档
│       └── artifacts/       ← Agent 产出的文件
│           ├── manifest.json
│           └── *.md / *.py / *.json ...
├── archive/         ← 已完成的任务归档
└── knowledge/       ← 团队知识库
```

**team.md 不是写完就不管的静态文档**——每次任务完成后，系统自动将总结追加到"历史教训与最佳实践"段落。随着团队运行，这份文档越来越厚，成为团队的"公共记忆"。下次有类似任务，Agent 读取 team.md 就能获得历史经验。

**task.md 是 Agent 之间的"异步聊天板"**——信息交换区供 Agent 写入进度、问题、决策；产物引用区自动追加 `📦` 指针。整个任务文档既是 Agent 可读的输入，也是人类可读的协作记录。

### 2. 工作流产物链传递

**上游 Agent 的输出自动成为下游 Agent 的输入。**

这是 Orchestrator 最核心的编排能力。工作流不是简单地"先运行 A 再运行 B"，而是把 A 的思考结果编织进 B 的 prompt：

```
分析 Agent 完成 → 输出 "发现3个安全漏洞：XSS、CSRF、SQL注入..."
    ↓ 产物自动收集
编码 Agent 收到的 prompt:
    ## 任务: 修复安全漏洞
    根据分析报告修复所有问题
    
    ### 上游节点产出：
    **security-analyst** 的输出:
    发现3个安全漏洞：XSS、CSRF、SQL注入...
```

产物沿工作流 DAG 的边传递，支持条件分支（Agent 输出包含 error → 回跳重做）、并行汇合、暂停审批后从断点继续。

### 3. 共享文档会议系统

**7 种会议类型，Agent 们"坐下来"开会讨论。**

站会、启动会、评审会、头脑风暴、决策会、回顾会、辩论——每种会议类型有专属的 prompt 模板和发言格式。

会议执行模型很独特：不是消息队列来回传，而是**共享文档模式**。创建 `meeting_<id>.md`，Agent 轮流读取文件、追加发言、读取他人观点再回应。最终由 Lead 阅读全部记录写结论，结论自动追加到 team.md。

Debate 是特殊子类型：固定 2 人、交替多轮对抗，内置共识检测——如果双方开始同意对方观点就自动终止。

**Token 成本**：共享文档模式 Token 线性增长（N 人 × 文档长度），而消息队列模式是平方级增长（每人看所有人的所有消息）。

### 4. Team Lead 自主编排

**团队有主心骨，不只是一群平等的 Agent。**

Team Lead 不只是标签——它有实际的编排职责：
- 任务分配时优先分析并拆解子任务
- 会议中最后发言、撰写结论
- 结论和总结自动追加到团队记忆

### 5. 卡通办公室可视化

**Agent 不再是抽象的 ID，而是有面孔的"同事"。**

每个 Agent 是一个 SVG 绘制的卡通人物（基于 emoji 哈希确定性生成 80 种面孔），坐在办公桌前，有显示器、咖啡杯、绿植。Agent 之间的通信以数据驱动的 SVG 连线呈现。忙碌的 Agent 有绿色脉冲光环，出错的有红色警告，离线的变灰。

```
工作室场景实时展示：
  🟢 code-reviewer — 执行中 "分析 PR #42..."
  🔵 tech-writer — 空闲
  🔴 data-analyst — 异常
  ⚪ devops — 离线
```

---

## 快速开始

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
  980831cai/openclaw-orchestrator
```

### Docker Compose

```bash
git clone https://github.com/980831Cai/openclaw-orchestrator.git
cd openclaw-orchestrator && docker compose up -d
```

### 源码安装

```bash
git clone https://github.com/980831Cai/openclaw-orchestrator.git
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

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│              OpenClaw Orchestrator（本项目）                  │
│   可视化编排 · 团队管理 · 会议系统 · 实时监控 · 排班调度     │
│   ↕ 读写 Markdown / JSONL / openclaw.json                    │
├─────────────────────────────────────────────────────────────┤
│               OpenClaw Gateway 网关                          │
│    WebSocket 控制面 · JSON-RPC 2.0 · 事件广播                │
├─────────────────────────────────────────────────────────────┤
│             OpenClaw Agent 运行时                             │
│    Agent 执行 · 会话管理 · 工具调用 · A2A 通信               │
└─────────────────────────────────────────────────────────────┘
```

**单端口部署**：API + WebSocket + 前端 UI 全部通过同一端口（默认 3721）。

```
openclaw-orchestrator/
├── server/                          # Python/FastAPI 后端
│   └── openclaw_orchestrator/
│       ├── app.py                   # 入口（API + WebSocket + 静态前端）
│       ├── services/
│       │   ├── gateway_connector.py # Gateway WebSocket 连接器
│       │   ├── openclaw_bridge.py   # OpenClaw 桥接层（三层降级）
│       │   ├── meeting_service.py   # 会议/辩论执行引擎
│       │   ├── workflow_engine.py   # 工作流 DAG 遍历引擎
│       │   ├── schedule_executor.py # 排班调度器
│       │   ├── session_watcher.py   # JSONL 文件监控（双源之一）
│       │   └── ...                  # agent/team/task/chat/knowledge 等服务
│       ├── routes/                  # RESTful API
│       └── websocket/               # WebSocket 事件广播
│
├── packages/web/                    # React 前端
│   └── src/
│       ├── pages/                   # 页面：Dashboard/Chat/Monitor/Workflow...
│       ├── components/scene/        # 卡通办公室工作室场景
│       └── stores/                  # Zustand 状态管理
│
├── docs/architecture.md             # 技术架构设计文档
├── Dockerfile                       # 多阶段构建
└── docker-compose.yml               # 一键启动
```

---

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | `3721` | 服务端口 |
| `OPENCLAW_HOME` | `~/.openclaw` | OpenClaw 主目录 |
| `OPENCLAW_GATEWAY_URL` | `ws://localhost:18789` | Gateway WebSocket 地址 |
| `OPENCLAW_GATEWAY_TOKEN` | *(空)* | Gateway 认证 Token（本地连接可留空） |
| `OPENCLAW_WEBHOOK_URL` | `http://localhost:3578` | Webhook HTTP 地址 |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS 允许源 |
| `DB_PATH` | `$OPENCLAW_HOME/orchestrator.sqlite` | 数据库路径 |

---

## 开发

```bash
bash scripts/dev.sh
# 🐍 Python 后端：http://localhost:3721（热重载）
# ⚡ Vite 前端：http://localhost:5173（HMR）
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | FastAPI · Uvicorn · Pydantic · SQLite(WAL) · websockets · watchfiles · httpx |
| 前端 | React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui · React Flow · Zustand |
| UI 设计 | SVG 卡通角色系统 · 14 自定义动画 · cartoon-card 设计语言 · Lucide 图标 |
| 部署 | Docker · systemd · hatch wheel（pip install 一键安装） |

---

## License

[MIT](LICENSE)
