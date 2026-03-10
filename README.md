<p align="center">
  <img src="docs/logo.svg" width="80" height="80" alt="OpenClaw Logo" />
</p>

<h1 align="center">OpenClaw Orchestrator</h1>

<p align="center">
  <strong>多 Agent 可视化编排管理平台</strong><br/>
  基于 <a href="https://github.com/openclaw">OpenClaw</a> 生态构建，为多 Agent 协作场景提供<br/>工作流设计 · 实时调度 · 通信监控 · 全链路可视化
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-≥3.10-blue?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
</p>

> 不局限于 SDLC 场景。数据分析、内容创作、自动化运维、翻译流水线——任何需要多个 AI Agent 分工协作的场景均可编排。

---

## 🎯 平台定位

OpenClaw Orchestrator 是 OpenClaw 生态中的**上层编排管理层**。OpenClaw 提供了 Agent 运行时、Gateway 网关和会话管理，而 Orchestrator 在此之上构建可视化编排与团队协作能力：

```
┌─────────────────────────────────────────────────────┐
│            OpenClaw Orchestrator（本项目）             │
│    可视化编排 · 团队管理 · 实时监控 · 排班调度          │
├─────────────────────────────────────────────────────┤
│               OpenClaw Gateway 网关                   │
│    WebSocket 控制面 · JSON-RPC 2.0 · 事件广播         │
├─────────────────────────────────────────────────────┤
│             OpenClaw Agent 运行时                     │
│    Agent 执行 · 会话管理 · 工具调用 · A2A 通信         │
└─────────────────────────────────────────────────────┘
```

---

## ✨ 核心能力

### 🔌 深度接入 OpenClaw 生态

**Gateway 实时通道**
- 通过 WebSocket 直连 OpenClaw Gateway（`ws://localhost:18789`），使用 JSON-RPC 2.0 协议实现毫秒级双向通信
- 支持 Gateway 认证：自动从 `openclaw.json` 读取 Token，或通过 `OPENCLAW_GATEWAY_TOKEN` 环境变量配置。本地连接（127.0.0.1）自动放行无需 Token
- 实时订阅 Agent 消息、状态变化、Agent-to-Agent 通信、工具调用等 7 类事件
- 支持通过 Gateway RPC 主动查询 Agent 状态、会话列表，以及远程中断 Agent 执行
- 自动重连（指数退避 2s→30s），认证失败时 60s 长间隔重试，Gateway 不可用时无缝降级到文件监控

**统一配置共享**
- 直接读写 OpenClaw 的 `~/.openclaw/openclaw.json`，与运行时共享模型配置和 API Key
- 支持 OpenClaw 三种 API Key 格式：明文字符串、`${ENV_VAR}` 环境变量引用、SecretRef 安全对象
- Agent 模型选择使用 OpenClaw 标准的 `provider/model-id` 格式（如 `anthropic/claude-sonnet-4-5`）

**三层触发降级**
- 发送指令到 Agent 时自动选择通道：Gateway RPC → Webhook HTTP → JSONL 文件直写
- 每一层有独立的失败检测和降级逻辑，确保在任何环境下指令都能送达

**双源事件去重**
- Gateway 实时推送 + 文件系统 JSONL 监控双通道并行，消息通过 ID 去重，既保证低延迟又保证不丢消息

### 🔄 可视化工作流引擎

- **有向图执行模型** — 基于节点指针在工作流 DAG 上逐节点推进，天然支持分支、汇合、回跳
- **四种节点类型** — Task（任务执行）、Condition（条件分支）、Parallel（并行执行）、Approval（人工审批）
- **条件表达式引擎** — 支持 `contains`/`regex`/`json` 三种匹配 + `||`/`&&` 组合 + 回跳上游节点
- **人工审批卡点** — 执行到审批节点自动暂停，审批通过后从断点继续
- **上下文穿透** — 上游节点产物自动注入下游 Task 的 prompt，Agent 间形成信息传递链
- **断点续跑** — 执行上下文持久化到数据库，服务重启后可无缝恢复暂停中的工作流

### 📡 Agent 实时通信

- **实时消息流** — 选中 Agent 后自动接收 Gateway 推送的新消息，无需手动刷新
- **A2A 通信检测** — 自动识别 OpenClaw 乒乓模式下的跨 Agent 消息
- **通信连线可视化** — 工作室场景中 Agent 间的通信以数据驱动的 SVG 连线呈现，线宽反映通信频率
- **工位一键导航** — 点击工作室中任意 Agent 工位直接跳转到通信频道

### 👥 团队与排班

- **Team 组建** — 灵活的成员角色分配，支持多 Agent 组成协作团队
- **四种排班模式** — 轮询 / 优先级 / 时间段 / 自定义规则
- **排班同步** — 配置直接写入 OpenClaw Cron 系统（`~/.openclaw/cron/jobs.json`），由运行时执行
- **心跳感知** — 读取 Agent `HEARTBEAT.md`，结合排班和活动时间综合判断在线状态

### 🤖 Agent 独立模型配置

- 每个 Agent 可独立选择 AI 模型，内置 Claude/GPT/Gemini/DeepSeek 等 14+ 预定义模型
- API Key 在平台内配置，自动写入 `openclaw.json`，无需手动编辑配置文件

### 🔔 通知与审批

- WebSocket 实时推送 + 浏览器桌面通知
- 通知中心面板支持在通知内直接完成审批操作

---

## 🎨 界面设计

OpenClaw Orchestrator 采用**卡通办公室**视觉风格，以温暖的深色主题为基调，融合 Linear/Vercel/Raycast 等优秀产品的交互模式：

### 品牌吉祥物 — 小爪子 🐾

Logo 是一只带有数字电路纹理的机械猫爪（SVG 纯代码绘制，无外部图片依赖），顶部天线表示在线状态，面部表情随 Gateway 连接状态动态变化：

| 心情 | 场景 | 表现 |
|------|------|------|
| 😊 开心 | Gateway 已连接 | 弯弯笑眼 + 呼吸缩放 |
| 💼 专注 | 后台处理中 | 横线眼 + 上下微动 |
| 😟 担忧 | Gateway 断连 | 圆眼 + 波浪嘴 |
| 👋 打招呼 | Dashboard 欢迎 | 星星眼 + 大嘴笑 + 摆手 |

### 核心 UI 特性

- **卡通办公室工作室** — Agent 以 SVG 绘制的卡通人物形象入座办公桌，基于 emoji 哈希生成确定性面部特征（4 眼 × 4 嘴 × 5 配饰 = 80 种组合）
- **Command Palette** — `⌘K` 全局搜索面板，跨 Agent / 工作室 / 页面快速导航，键盘驱动
- **统一空状态系统** — 10 种场景预配置（无 Agent / 无工作室 / 加载中 / 断连...），Logo 吉祥物陪伴用户
- **通信频道** — 消息气泡滑入动画，三点跳动打字指示器，Agent 卡通头像伴随对话
- **指挥中心** — Agent 状态呼吸灯光环，通信环旋转装饰，数据驱动的 SVG 通信连线
- **页面过渡** — 全局 fade-in 动画，卡片交错入场，hover 上浮微交互
- **导航指示条** — 侧边栏每个菜单项有独立配色的左侧活跃指示条

### 设计系统

```
样式基础：Tailwind CSS + 自定义 CSS utility 类
组件库：  shadcn/ui（定制深色主题）
动画系统：14 个自定义 keyframes（cartoon-bob/wave/sparkle/sway/msg-slide/dot-pulse/status-breathe...）
色彩：    cyber-purple/violet/lavender/green/red/amber/blue/cyan 8 色调色盘
卡片风格：cartoon-card — 渐变背景 + 内发光 + hover 上浮 + 紫色边框高亮
图标：    Lucide React 统一图标库
```

---

## 🏗️ 架构

```
openclaw-orchestrator/
├── server/                          # Python/FastAPI 后端
│   └── openclaw_orchestrator/
│       ├── app.py                   # 入口（API + WebSocket + 静态前端）
│       ├── services/
│       │   ├── gateway_connector.py # Gateway WebSocket 连接器
│       │   ├── openclaw_bridge.py   # OpenClaw 桥接层（Webhook/Cron/Heartbeat/JSONL）
│       │   ├── workflow_engine.py   # 工作流图遍历引擎
│       │   ├── schedule_executor.py # 排班调度器
│       │   ├── session_watcher.py   # JSONL 文件监控（双源之一）
│       │   └── ...                  # agent/team/task/chat/knowledge 等服务
│       ├── routes/                  # RESTful API
│       └── websocket/               # WebSocket 事件广播
│
├── packages/web/                    # React 前端
│   └── src/
│       ├── pages/                   # 页面：Dashboard/Chat/Monitor/Workflow...
│       ├── components/scene/        # 工作室可视化场景
│       └── stores/                  # Zustand 状态管理
│
├── scripts/                         # 构建/部署脚本
├── Dockerfile                       # 多阶段构建
└── docker-compose.yml               # 一键启动
```

**单端口部署**：API + WebSocket + 前端 UI 全部通过同一端口（默认 3721），无需 Nginx 反代。

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

## ⚙️ 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | `3721` | 服务端口 |
| `OPENCLAW_HOME` | `~/.openclaw` | OpenClaw 主目录 |
| `OPENCLAW_GATEWAY_URL` | `ws://localhost:18789` | Gateway WebSocket 地址 |
| `OPENCLAW_GATEWAY_TOKEN` | *(空)* | Gateway 认证 Token（本地连接可留空，远程连接必填） |
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

或分别启动：

```bash
# 终端 1 — 后端
cd server && pip install -e ".[dev]" && python -m openclaw_orchestrator serve --reload

# 终端 2 — 前端
cd packages/web && pnpm install && pnpm dev
```

---

## 📡 API

所有端点以 `/api` 为前缀。WebSocket 端点：`ws://localhost:3721/ws`

| 模块 | 端点示例 | 说明 |
|------|---------|------|
| 健康检查 | `GET /api/health` | 返回 Gateway 连接状态、活跃 Agent 数等 |
| Agent | `GET/POST/PUT/DELETE /api/agents/:id` | Agent CRUD + 技能管理 |
| Team | `GET/POST/PUT/DELETE /api/teams/:id` | Team CRUD + 成员管理 |
| Task | `POST /api/teams/:tid/tasks` | 任务创建/分配/制品管理 |
| 工作流 | `POST /api/workflows/:id/execute` | 工作流 CRUD + 执行/停止 |
| 审批 | `POST /api/approvals/:id/approve` | 审批通过/驳回 |
| 通知 | `GET /api/notifications` | 通知列表/未读数/标记已读 |
| Chat | `POST /api/agents/:id/sessions/:sid/send` | 发送消息/获取会话 |
| 知识库 | `POST /api/agents/:id/knowledge/search` | Agent/Team 知识 CRUD + 搜索 |
| 设置 | `GET/PUT /api/settings/providers` | AI 模型 Provider API Key 管理 |

WebSocket 事件：`agent_status` · `communication` · `new_message` · `gateway_status` · `tool_call` · `notification` · `approval_update` · `workflow_update`

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
