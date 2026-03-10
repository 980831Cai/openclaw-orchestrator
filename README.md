<p align="center">
  <img src="docs/logo.svg" width="80" height="80" alt="OpenClaw Orchestrator Logo" />
</p>

<h1 align="center">OpenClaw Orchestrator</h1>

<p align="center">
  <strong>多 Agent 协作编排平台</strong><br/>
  寄生于 <a href="https://github.com/openclaw">OpenClaw</a> 文件系统之上，为多 Agent 场景提供可视化编排、团队协作与实时监控
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-≥3.10-blue?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
</p>

---

## 项目定位

**OpenClaw** 是一个文件系统驱动的 Agent 运行时——每个 Agent 是一组 Markdown 文件，会话是 JSONL，配置是 JSON。它解决了"怎么运行一个 Agent"的问题。

**但当你有 5 个、10 个 Agent 需要协作时，新的问题出现了**：谁先做？谁后做？A 的输出怎么自动传给 B？多个 Agent 怎么"开会讨论"？它们的工作状态我怎么实时看到？

**OpenClaw Orchestrator 就是来回答这些问题的。**

它不替代 OpenClaw，而是**直接长在 OpenClaw 的文件系统上**——用 Markdown、JSONL、JSON 这些 OpenClaw 的原生语言与之对话，为多 Agent 场景加上编排决策、团队协作和可视化能力。

> 不局限于 SDLC 场景。数据分析、内容创作、自动化运维、翻译流水线——任何需要多个 AI Agent 分工协作的场景均可编排。

---

## 系统架构

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

**核心设计原则：寄生式架构**——Orchestrator 没有自己的 Agent 配置数据库，OpenClaw 的文件就是唯一数据源。你用命令行改 Agent 的 Markdown，UI 上立即可见；你在 UI 上改配置，OpenClaw 运行时下次加载就生效。即使 Orchestrator 停机，Agent 照常运行。

---

## 与 OpenClaw 的结合方式

### 共享文件系统，不复制数据

Orchestrator 所有对 Agent 的操作都直接读写 `~/.openclaw/` 目录：

| 你在 UI 上做的事 | Orchestrator 背后做的事 | 落到 OpenClaw 文件系统 |
|-----------------|----------------------|---------------------|
| 修改 Agent 名字/emoji | `generate_identity_md()` | 写 `agents/<id>/IDENTITY.md` |
| 编辑 Agent 灵魂 | `generate_soul_md()` | 写 `agents/<id>/SOUL.md` |
| 选择 AI 模型 | `_set_agent_model()` | 写 `openclaw.json → agents.list[].model` |
| 配置 API Key | `provider_keys_service` | 写 `openclaw.json → models.providers` |
| 创建团队 | `create_team()` | 建 `teams/<id>/` 目录 + `team.md` |
| 添加团队成员 | `_update_agent_to_agent_config()` | 写 `openclaw.json → agentToAgent.allow[]` |
| 向 Agent 发消息 | `invoke_agent()` 三层降级 | 追加 `agents/<id>/sessions/*.jsonl` |

### 三通道通信，自动降级

向 Agent 发送指令时，不走单一通道，而是三层自动降级：

```
① Gateway RPC (sessions.spawn)     ← WebSocket 直连，毫秒级
         ↓ 失败
② Webhook HTTP (POST /hooks/agent)  ← HTTP 触发，秒级
         ↓ 失败
③ JSONL 文件直写                     ← 直接 append 到会话文件，最慢但永远可用
```

**文件系统是最后的堡垒**——当一切网络通道都不可用时，直接向 JSONL 文件追加一行 JSON，OpenClaw 的文件监控自动拾取并触发 Agent。

### 双源事件采集

同时从 Gateway 实时推送和 JSONL 文件变更监控两个源头收集 Agent 事件，消息 ID 去重。Gateway 给低延迟，文件系统给高可靠。Gateway 断连时文件监控无缝接管。

---

## 五项核心创新

### 1. 文件驱动的团队协作模型

**不走消息队列，走文件系统。**

OpenClaw 的 Agent 天然理解文件——读 Markdown 理解任务，写 JSONL 记录对话。Orchestrator 顺势而为，用文件作为协作载体：

```
~/.openclaw/teams/<team-id>/
├── team.md          ← 活的协作契约（持续演化的团队记忆）
├── meetings/        ← 会议记录
├── active/          ← 进行中的任务
│   └── task-<id>/
│       ├── task.md          ← Agent 间的"异步聊天板"
│       └── artifacts/       ← Agent 产出的文件
├── archive/         ← 已完成的任务归档
└── knowledge/       ← 团队知识库
```

**team.md 不是静态文档**——每次任务完成后，系统自动将总结追加到"历史教训与最佳实践"段落。团队运转越久，这份文档越厚，成为 Agent 可直接读取的"团队公共记忆"。不需要 RAG 管道。

### 2. 工作流产物链传递

**上游 Agent 的输出自动成为下游 Agent 的输入。**

工作流不是简单的"先 A 后 B"，而是 DAG 图遍历 + 产物自动编织：

```
分析 Agent 完成 → 输出 "发现 3 个安全漏洞：XSS、CSRF、SQL 注入..."
    ↓ 产物沿 DAG 边自动收集
编码 Agent 收到的 prompt:
    ## 任务: 修复安全漏洞
    ### 上游节点产出：
    **analyst** 的输出: 发现 3 个安全漏洞...
```

支持条件分支（contains/regex/json 匹配 + 回跳重做）、并行汇合（AND/OR/XOR 三种模式）、暂停审批后断点续跑。

### 3. 共享文档会议系统

**7 种会议类型，Agent 们"坐下来"讨论。**

| 类型 | 场景 | 特点 |
|------|------|------|
| standup | 每日站会 | 昨天/今天/阻碍 |
| kickoff | 项目启动 | 职责/问题建议 |
| review | 评审会 | 参考前人观点 |
| brainstorm | 头脑风暴 | 创意发散 |
| decision | 决策会 | 立场+论据 |
| retro | 回顾会 | 好/差/改 |
| debate | 辩论 | 2 人对抗+共识检测 |

会议执行模型很独特：**共享文档模式**而非消息队列。创建 `meeting_<id>.md`，Agent 轮流读取文件、追加发言。Token 成本线性增长 O(N×L)，而消息队列模式是平方级 O(N²×L)。

Debate 是特殊子类型：固定 2 人交替多轮对抗，内置共识检测——双方开始同意对方就自动终止。结论由 Lead 撰写，自动追加到 team.md。

### 4. Team Lead 自主编排

团队有 Lead 角色，不只是标签——会议结束后由 Lead 阅读全部记录撰写结论，结论作为最终决策自动追加到团队记忆。Lead 工位头顶有皇冠标识，在工作室场景中视觉突出。

### 5. 卡通办公室可视化

Agent 不再是抽象的 ID，而是有面孔的"同事"。每个 Agent 是 SVG 绘制的卡通人物（基于 emoji 哈希生成 80 种确定性面孔），坐在有显示器、咖啡杯、绿植的办公桌前。

```
工作室实时展示：
  🟢 code-reviewer — 工作中 "分析 PR #42..."    ← 绿色脉冲光环
  🔵 tech-writer — 空闲                          ← 蓝色静态标识
  🔴 data-analyst — 异常                         ← 红色警告
  ⚪ devops — 离线                               ← 灰色
```

Agent 间通信以数据驱动的 SVG 连线呈现，线宽反映通信频率。

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

## 项目结构

```
openclaw-orchestrator/
├── server/                          # Python/FastAPI 后端
│   └── openclaw_orchestrator/
│       ├── app.py                   # 入口（API + WebSocket + 静态前端）
│       ├── services/
│       │   ├── gateway_connector.py # Gateway WebSocket 连接器（JSON-RPC 2.0）
│       │   ├── openclaw_bridge.py   # OpenClaw 桥接层（三层降级触发）
│       │   ├── meeting_service.py   # 会议/辩论执行引擎（共享文档模式）
│       │   ├── workflow_engine.py   # 工作流 DAG 遍历引擎（产物链传递）
│       │   ├── team_service.py      # 团队管理（team.md / A2A 配置自动化）
│       │   ├── schedule_executor.py # 排班调度器
│       │   ├── session_watcher.py   # JSONL 文件监控（双源之一）
│       │   └── ...                  # agent/task/chat/knowledge 等服务
│       ├── routes/                  # RESTful API
│       └── websocket/               # WebSocket 事件广播
│
├── packages/web/                    # React 前端
│   └── src/
│       ├── pages/                   # Dashboard / Chat / Workflow / Monitor ...
│       ├── components/scene/        # 卡通办公室工作室场景
│       ├── components/avatar/       # SVG 卡通角色系统（80 种面孔）
│       └── stores/                  # Zustand 状态管理
│
├── docs/architecture.md             # 技术架构设计文档
├── Dockerfile                       # 多阶段构建
└── docker-compose.yml               # 一键启动
```

**单端口部署**：API + WebSocket + 前端 UI 全部通过同一端口（默认 3721）。前端构建产物通过 hatch `force-include` 打进 Python wheel，`pip install` 即完整可用。

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

## 为什么不直接用 CrewAI / AutoGen / LangGraph？

| 维度 | 传统多 Agent 框架 | OpenClaw Orchestrator |
|------|------------------|----------------------|
| Agent 定义 | 框架自有格式，锁定 | 直接读写 OpenClaw Markdown，无锁定 |
| 数据存储 | 框架内部数据库 | OpenClaw 文件系统是唯一源头 |
| 可拔除性 | Agent 依赖框架运行 | 停掉 Orchestrator，Agent 照常运行 |
| 协作模型 | 消息队列 / API 调用 | 文件系统（Agent 天然理解文件） |
| 团队记忆 | 需要 RAG 管道 | team.md 自动积累，Agent 直接读取 |
| 会议 Token | O(N²×L) 平方级 | O(N×L) 线性（共享文档模式） |
| 运行时耦合 | 强耦合 | 寄生式，零配置同步 |

---

## License

[MIT](LICENSE)
