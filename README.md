# 🐾 OpenClaw Orchestrator

**通用多 Agent 可视化编排插件** — 为 [OpenClaw](https://github.com/openclaw) 平台提供工作流可视化设计、执行与监控能力。

> 不局限于 SDLC 场景，支持数据分析、内容创作、自动化运维、翻译流水线等任意多 Agent 协作工作流。

![Python](https://img.shields.io/badge/Python-≥3.10-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi)
![React](https://img.shields.io/badge/React-18-blue?logo=react)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ 功能特性

### 🔄 工作流引擎

- **有向图执行模型** — 基于 `current_node_id` 指针在工作流 DAG 上逐节点推进，天然支持分支、汇合、回跳等复杂拓扑
- **丰富的节点类型** — Task（任务执行）、Condition（条件分支）、Parallel（并行执行）、Approval（人工审批）
- **条件分支与回跳** — ConditionNode 根据运行时表达式动态选择下游分支，分支目标可指向上游节点，实现循环与回溯流程
- **人工审批卡点** — ApprovalNode 在执行到达时自动暂停，等待人工审批通过后继续推进后续节点
- **失败自动重试** — 任务节点支持配置 `maxRetries` 和 `retryDelayMs`，执行失败时按策略自动重试
- **迭代次数守卫** — 通过 `maxIterations` 限制全局遍历次数，防止回跳分支导致的无限循环
- **执行上下文持久化** — 将节点产出和运行状态序列化为 `context_json` 写入数据库，支持服务重启后无缝恢复暂停中的工作流

### 👥 Agent 与 Team 管理

- **Agent 全生命周期管理** — 身份配置、灵魂设定（人格/风格）、行为规则、技能挂载
- **Team 组建与协作** — 灵活的成员角色分配、排班调度、团队共享知识库
- **Task 分配与制品管理** — 任务创建/分配/状态跟踪、制品附件的上传与版本管理

### 🔔 通知系统

- **WebSocket 实时推送** — 工作流状态变更、审批请求等事件即时送达前端
- **浏览器原生通知** — 通过 Notification API 在桌面弹出提醒，确保关键事件不遗漏
- **通知中心面板** — 铃铛图标 + 未读 badge + Popover 下拉列表，集中查阅所有通知
- **快捷审批操作** — 直接在通知面板内完成审批通过/驳回，无需跳转页面

### 📊 监控面板

- **Agent 实时状态** — 追踪每个 Agent 的在线状态与当前活动
- **通信事件流** — 实时展示 Agent 之间的消息交互日志
- **工作流执行历史** — 记录每次工作流执行的完整节点轨迹与耗时

---

## 🏗️ 架构

```
openclaw-orchestrator/
├── server/                          # Python 后端
│   ├── pyproject.toml               # 包配置（hatchling）
│   └── openclaw_orchestrator/
│       ├── app.py                   # FastAPI 入口（API + WebSocket + 静态前端）
│       ├── cli.py                   # CLI：openclaw-orchestrator serve
│       ├── config.py                # Pydantic Settings 配置
│       ├── database/
│       │   ├── db.py                # SQLite 连接（WAL 模式）
│       │   └── init_db.py           # 建表 + 迁移
│       ├── services/
│       │   ├── workflow_engine.py   # 工作流图遍历引擎
│       │   ├── notification_service.py
│       │   ├── agent_service.py
│       │   ├── team_service.py
│       │   ├── task_service.py
│       │   ├── chat_service.py
│       │   ├── knowledge_service.py
│       │   ├── session_watcher.py
│       │   └── file_manager.py
│       ├── routes/                  # FastAPI 路由
│       │   ├── agent_routes.py
│       │   ├── team_routes.py
│       │   ├── task_routes.py
│       │   ├── workflow_routes.py
│       │   ├── approval_routes.py
│       │   ├── notification_routes.py
│       │   ├── chat_routes.py
│       │   └── knowledge_routes.py
│       ├── websocket/
│       │   └── ws_handler.py        # WebSocket 连接管理 + broadcast
│       ├── utils/
│       │   ├── markdown_parser.py
│       │   └── path_validator.py
│       └── static/                  # 前端构建输出（生产模式）
│
├── packages/web/                    # React 前端
│   ├── src/
│   │   ├── pages/                   # 页面组件
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── TeamListPage.tsx
│   │   │   ├── AgentListPage.tsx
│   │   │   ├── ChatPage.tsx
│   │   │   ├── MonitorPage.tsx
│   │   │   └── WorkflowEditorPage.tsx
│   │   ├── components/
│   │   │   ├── workflow/            # 工作流节点组件
│   │   │   │   ├── TaskNode.tsx
│   │   │   │   ├── ConditionNode.tsx
│   │   │   │   └── ApprovalNode.tsx
│   │   │   ├── notification/
│   │   │   │   └── NotificationCenter.tsx
│   │   │   ├── agent/               # Agent 配置表单
│   │   │   ├── team/                # Team 管理组件
│   │   │   ├── scene/               # 3D 场景组件
│   │   │   ├── layout/              # 布局（Sidebar 等）
│   │   │   └── ui/                  # shadcn/ui 基础组件
│   │   ├── stores/                  # Zustand 状态管理
│   │   ├── hooks/                   # 自定义 Hooks
│   │   ├── types/                   # TypeScript 类型定义
│   │   └── lib/                     # 工具函数
│   └── package.json
│
├── scripts/
│   ├── build_frontend.sh            # 构建前端 → 复制到 static/
│   ├── build_and_publish.sh         # 构建 wheel + 发布 PyPI
│   ├── deploy.sh                    # 服务器一键部署
│   └── dev.sh                       # 开发模式启动脚本
│
├── Dockerfile                       # 多阶段构建镜像
├── docker-compose.yml               # Docker Compose 一键启动
└── package.json                     # 根配置（开发脚本）
```

### 单端口部署

生产模式下，前端构建产物托管在 FastAPI 的 `static/` 目录，**API + WebSocket + 前端 UI 全部通过同一个端口（默认 3721）提供服务**，无需 Nginx 反代。

---

## 🚀 快速开始

### 方式一：pip 安装（推荐）

```bash
pip install openclaw-orchestrator
openclaw-orchestrator serve
```

访问 **http://localhost:3721** 即可使用。

### 方式二：Docker

```bash
docker run -d \
  --name openclaw-orchestrator \
  -p 3721:3721 \
  -v ~/.openclaw:/root/.openclaw \
  980831cai/openclaw-orchestrator
```

### 方式三：Docker Compose

```bash
git clone https://github.com/980831Cai/openclaw-orchestrator.git
cd openclaw-orchestrator
docker compose up -d
```

### 方式四：源码安装

```bash
git clone https://github.com/980831Cai/openclaw-orchestrator.git
cd openclaw-orchestrator

# 构建前端（需要 Node.js 18+ 和 pnpm）
bash scripts/build_frontend.sh

# 安装后端
cd server && pip install -e . && cd ..

# 启动
openclaw-orchestrator serve
```

### 服务器一键部署

在 Linux 服务器上（如腾讯云轻量、CVM）：

```bash
git clone https://github.com/980831Cai/openclaw-orchestrator.git
cd openclaw-orchestrator
sudo bash scripts/deploy.sh
```

脚本自动完成：环境检测 → 依赖安装 → 前端构建 → systemd 服务注册 → 开机自启

> ⚠️ 外网访问请确保云服务器安全组放行 **TCP 3721** 端口

---

## 🛠️ 开发

### 方式一：使用脚本（推荐）

```bash
bash scripts/dev.sh
```

自动启动：
- 🐍 Python 后端：`http://localhost:3721`（热重载）
- ⚡ Vite 前端：`http://localhost:5173`（HMR）

### 方式二：使用 pnpm

```bash
# 安装前端依赖
pnpm install

# 安装后端依赖
cd server && pip install -e ".[dev]" && cd ..

# 同时启动前后端
pnpm dev
```

### 方式三：分别启动

```bash
# 终端 1 — 后端
cd server
python -m openclaw_orchestrator serve --reload

# 终端 2 — 前端
cd packages/web
pnpm dev
```

---

## ⚙️ 配置

通过环境变量或 CLI 参数配置：

| 环境变量 | CLI 参数 | 默认值 | 说明 |
|---------|---------|--------|------|
| `PORT` | `--port` | `3721` | 服务端口 |
| `OPENCLAW_HOME` | `--openclaw-home` | `~/.openclaw` | OpenClaw 主目录 |
| `CORS_ORIGIN` | — | `http://localhost:5173` | CORS 允许的源 |
| `DB_PATH` | — | `$OPENCLAW_HOME/orchestrator.sqlite` | 数据库路径 |

```bash
# 示例：自定义端口和数据目录
openclaw-orchestrator serve --port 8080 --openclaw-home /data/openclaw
```

---

## 📡 API 参考

所有 API 端点均以 `/api` 为前缀。

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 服务健康状态 |

### Agent 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/agents` | 获取 Agent 列表 |
| `POST` | `/api/agents` | 创建 Agent |
| `GET` | `/api/agents/:id` | 获取 Agent 详情 |
| `PUT` | `/api/agents/:id` | 更新 Agent |
| `DELETE` | `/api/agents/:id` | 删除 Agent |
| `GET` | `/api/agents/:id/skills` | 获取 Agent 技能 |
| `PUT` | `/api/agents/:id/skills` | 更新 Agent 技能 |

### Team 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/teams` | 获取 Team 列表 |
| `POST` | `/api/teams` | 创建 Team |
| `GET` | `/api/teams/:id` | 获取 Team 详情 |
| `PUT` | `/api/teams/:id` | 更新 Team |
| `DELETE` | `/api/teams/:id` | 删除 Team |
| `POST` | `/api/teams/:id/members` | 添加团队成员 |

### Task 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/teams/:teamId/tasks` | 创建任务 |
| `GET` | `/api/teams/:teamId/tasks` | 获取团队任务列表 |
| `GET` | `/api/tasks/:id` | 获取任务详情 |
| `PUT` | `/api/tasks/:id/status` | 更新任务状态 |
| `GET` | `/api/tasks/:id/content` | 获取任务内容 |
| `POST` | `/api/tasks/:id/artifacts` | 创建制品 |
| `GET` | `/api/tasks/:id/artifacts` | 获取制品列表 |
| `GET` | `/api/tasks/:id/artifacts/:filename/content` | 获取制品内容 |
| `DELETE` | `/api/tasks/:id/artifacts/:filename` | 删除制品 |

### 工作流

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/workflows` | 获取工作流列表 |
| `POST` | `/api/workflows` | 创建工作流 |
| `GET` | `/api/workflows/:id` | 获取工作流详情 |
| `PUT` | `/api/workflows/:id` | 更新工作流 |
| `DELETE` | `/api/workflows/:id` | 删除工作流 |
| `POST` | `/api/workflows/:id/execute` | 执行工作流 |
| `POST` | `/api/workflows/:id/stop` | 停止执行 |
| `GET` | `/api/workflows/:id/executions` | 获取执行历史 |
| `GET` | `/api/executions/:id` | 获取执行详情 |

### 审批

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/approvals` | 获取审批列表 |
| `GET` | `/api/approvals/pending` | 获取待处理审批 |
| `POST` | `/api/approvals/:id/approve` | 通过审批 |
| `POST` | `/api/approvals/:id/reject` | 驳回审批 |

### 通知

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/notifications` | 获取通知列表 |
| `GET` | `/api/notifications/unread-count` | 获取未读数量 |
| `PUT` | `/api/notifications/:id/read` | 标记单条已读 |
| `PUT` | `/api/notifications/read-all` | 标记全部已读 |

### 知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/agents/:id/knowledge` | 获取 Agent 知识条目 |
| `POST` | `/api/agents/:id/knowledge` | 添加 Agent 知识 |
| `DELETE` | `/api/agents/:id/knowledge/:entryId` | 删除 Agent 知识 |
| `POST` | `/api/agents/:id/knowledge/search` | 搜索 Agent 知识 |
| `GET` | `/api/agents/:id/knowledge/stats` | Agent 知识统计 |
| `GET` | `/api/teams/:id/knowledge` | 获取 Team 知识条目 |
| `POST` | `/api/teams/:id/knowledge` | 添加 Team 知识 |
| `DELETE` | `/api/teams/:id/knowledge/:entryId` | 删除 Team 知识 |
| `POST` | `/api/teams/:id/knowledge/search` | 搜索 Team 知识 |
| `GET` | `/api/teams/:id/knowledge/stats` | Team 知识统计 |

### Chat / 监控

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/agents/:id/sessions` | 获取会话列表 |
| `GET` | `/api/agents/:id/sessions/:sid/messages` | 获取会话消息 |
| `POST` | `/api/agents/:id/sessions/:sid/send` | 发送消息 |
| `GET` | `/api/monitor/statuses` | 获取 Agent 状态 |

### WebSocket

```
ws://localhost:3721/ws
```

事件类型：
- `agent_status` — Agent 状态变更
- `communication` — Agent 间通信事件
- `workflow_update` — 工作流执行状态更新
- `notification` — 新通知推送
- `approval_update` — 审批状态变更

---

## 🗃️ 数据库

使用 SQLite（WAL 模式），数据表包括：

| 表名 | 说明 |
|------|------|
| `teams` | 团队信息 |
| `team_members` | 团队成员关系 |
| `tasks` | 任务 |
| `workflows` | 工作流定义 |
| `workflow_executions` | 工作流执行记录 |
| `knowledge_entries` | 知识库条目 |
| `approvals` | 审批记录 |
| `notifications` | 通知 |

数据库文件默认位于 `~/.openclaw/orchestrator.sqlite`。

---

## 🧰 技术栈

### 后端

| 技术 | 用途 |
|------|------|
| [FastAPI](https://fastapi.tiangolo.com/) | Web 框架 |
| [Uvicorn](https://www.uvicorn.org/) | ASGI 服务器 |
| [Pydantic](https://docs.pydantic.dev/) | 数据验证 + Settings |
| SQLite (stdlib) | 嵌入式数据库 |
| WebSocket | 实时推送 |
| [watchfiles](https://github.com/samuelcolvin/watchfiles) | 文件监听 |
| [python-frontmatter](https://github.com/eyeseast/python-frontmatter) | Markdown 解析 |

### 前端

| 技术 | 用途 |
|------|------|
| [React 18](https://react.dev/) | UI 框架 |
| [Vite](https://vitejs.dev/) | 构建工具 |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全 |
| [Tailwind CSS](https://tailwindcss.com/) | 样式 |
| [shadcn/ui](https://ui.shadcn.com/) | 组件库 |
| [React Flow](https://reactflow.dev/) | 工作流画布 |
| [Zustand](https://github.com/pmndrs/zustand) | 状态管理 |
| [Recharts](https://recharts.org/) | 图表 |
| [Lucide](https://lucide.dev/) | 图标 |

---

## 📄 License

[MIT](LICENSE)
