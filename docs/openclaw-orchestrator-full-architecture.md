# OpenClaw Orchestrator 完整架构分析报告

> **生成日期**: 2026-03-17  
> **分析范围**: 前端 · 后端 · 扩展模块 · 部署 · 数据存储  
> **项目定位**: OpenClaw Agent 运行时的可视化编排与团队协作平台

---

## 目录

1. [项目概览与核心理念](#一项目概览与核心理念)
2. [整体架构设计](#二整体架构设计)
3. [后端架构](#三后端架构)
4. [前端架构](#四前端架构)
5. [Extension 扩展模块](#五extension-扩展模块)
6. [数据存储策略](#六数据存储策略)
7. [实时通信体系](#七实时通信体系)
8. [部署架构](#八部署架构)
9. [构建与发布流程](#九构建与发布流程)
10. [技术栈总结](#十技术栈总结)
11. [关键架构亮点与设计决策](#十一关键架构亮点与设计决策)

---

## 一、项目概览与核心理念

### 1.1 项目定位

OpenClaw Orchestrator 是 OpenClaw Agent 运行时的**可视化编排层**，提供以下核心能力：

- **DAG 工作流编排** — 可视化拖拽设计多 Agent 协作工作流
- **团队管理** — Agent 组队、角色分配、Lead 治理
- **会议系统** — 7 种会议类型支持多 Agent 协同决策
- **实时监控** — Agent 状态、事件流、工作流执行追踪
- **排班调度** — Cron 驱动的周期性工作流执行
- **审批流程** — 人机协作的审批节点
- **知识库管理** — Agent/Team 级别的知识条目管理

### 1.2 核心设计理念 — "寄生式架构"

Orchestrator **不替代 OpenClaw**，而是"寄生"于其上：

- **直接读写** `~/.openclaw/` 目录下的 Markdown/JSON/JSONL 文件
- **不维护** Agent 配置的独立副本
- 即使 Orchestrator 停机，**Agent 不受影响**
- 所有操作最终**落到文件系统**

这种设计确保了 Orchestrator 是一个"可拆卸的增强层"，OpenClaw 保持完全独立。

---

## 二、整体架构设计

### 2.1 三层架构总览

```
┌──────────────────────────────────────────────────────────┐
│             OpenClaw Orchestrator（本项目）                │
│   可视化编排 · 团队管理 · 会议系统 · 实时监控 · 排班       │
│                                                           │
│   ↕ 直接读写 ~/.openclaw/ 下的文件                        │
│   ↕ 唯一自有数据：工作流/执行上下文/审批（SQLite WAL）     │
├──────────────────────────────────────────────────────────┤
│                    三通道接入层                             │
│   Gateway ws://18789   Webhook :3578   文件系统 ~/.openclaw│
├──────────────────────────────────────────────────────────┤
│                OpenClaw Agent 运行时                       │
│   文件驱动执行 · JSONL 会话 · A2A 通信 · Cron 调度        │
└──────────────────────────────────────────────────────────┘
```

### 2.2 三层触发降级机制

向 Agent 发送指令时，系统采用三层自动降级策略：

| 优先级 | 通道 | 协议 | 延迟 | 说明 |
|--------|------|------|------|------|
| 1️⃣ | **Gateway RPC** | WebSocket JSON-RPC 2.0 | ~ms | `sessions.spawn` / `sessions.send` |
| 2️⃣ | **Webhook HTTP** | POST HTTP | ~100ms | OpenClaw Webhook 端点 |
| 3️⃣ | **JSONL 文件直写** | 文件系统 | ~1s | 追加到 `sessions/*.jsonl`，OpenClaw 文件监控拾取 |

文件系统是终极兜底，确保指令**必达**。

### 2.3 双源事件采集

- **Gateway 实时推送**（低延迟）→ `gateway_connector` 服务
- **JSONL 文件变更监控**（高可靠）→ `session_watcher` 服务
- 通过 `mark_seen(msg_id)` 去重机制互补

### 2.4 单端口部署模型

API + WebSocket + 前端 UI 全部通过端口 **3721** 对外：

| 路径 | 服务 |
|------|------|
| `/api/*` | FastAPI REST 路由 |
| `/ws` | WebSocket 实时事件 |
| `/*` | React SPA（静态文件 + SPA fallback） |

---

## 三、后端架构

### 3.1 技术栈

| 技术 | 版本 | 选型理由 |
|------|------|---------|
| **Python** | ≥3.10 | OpenClaw 是 Python 生态，可直接 pip install |
| **FastAPI** | ≥0.115 | 高性能异步框架，原生 WebSocket + OpenAPI 文档 |
| **Uvicorn** | ≥0.32 | ASGI 服务器，支持热重载 |
| **SQLite WAL** | 内置 | 本地单用户服务，零运维，通过 aiosqlite 异步操作 |
| **Pydantic** | ≥2.9 | 数据验证 + 配置管理 |
| **python-frontmatter** | ≥1.1 | 双向解析 Markdown YAML frontmatter |
| **watchfiles** | ≥0.24 | 高效文件系统监控（Rust 内核） |
| **websockets** | ≥13.0 | Gateway WebSocket 客户端 |
| **httpx** | ≥0.27 | 异步 HTTP 客户端（调用 Webhook） |
| **croniter** | ≥2.0 | Cron 表达式解析 |
| **Hatchling** | - | Python 包构建（支持 force-include 打包前端） |

### 3.2 目录结构

```
server/openclaw_orchestrator/
├── __init__.py              # 版本号定义
├── __main__.py              # python -m 入口
├── app.py                   # FastAPI 应用工厂 + 生命周期管理
├── cli.py                   # CLI 命令（serve/version/init）
├── config.py                # 配置管理（环境变量 + 默认值）
├── database/
│   ├── db.py                # 数据库连接管理（aiosqlite 单例）
│   └── init_db.py           # Schema 初始化 + 迁移（16+ 张表）
├── middleware/
│   └── auth.py              # Bearer Token 认证中间件
├── routes/                  # 12 个 API 路由模块
│   ├── agent_routes.py      # Agent CRUD（7 端点）
│   ├── approval_routes.py   # 审批管理（4 端点）
│   ├── chat_routes.py       # 聊天会话（5 端点）
│   ├── collaboration_routes.py # 协作（会议请求）
│   ├── knowledge_routes.py  # 知识库（10 端点：Agent + Team 对称）
│   ├── meeting_routes.py    # 会议管理（7 端点）
│   ├── notification_routes.py # 通知管理
│   ├── runtime_routes.py    # Gateway 运行时管理（4 端点）
│   ├── settings_routes.py   # 系统设置
│   ├── task_routes.py       # 任务管理
│   ├── team_routes.py       # 团队管理
│   └── workflow_routes.py   # 工作流管理
├── services/                # 22 个业务服务
│   ├── agent_service.py     # Agent 文件读写
│   ├── chat_service.py      # 双数据源聊天服务
│   ├── collaboration_service.py # 协作审批
│   ├── gateway_connector.py # Gateway WebSocket 连接器
│   ├── knowledge_service.py # 知识库管理
│   ├── lead_governance_service.py # Lead 治理
│   ├── live_feed_service.py # 实时事件流
│   ├── meeting_service.py   # 会议系统（7 种类型）
│   ├── notification_service.py # 通知 + WebSocket 广播
│   ├── openclaw_bridge.py   # OpenClaw Webhook 桥接
│   ├── runtime_service.py   # Gateway 进程管理
│   ├── schedule_executor.py # 排班调度执行器
│   ├── session_watcher.py   # JSONL 文件变更监控
│   ├── task_service.py      # 团队任务管理
│   ├── team_dispatch_service.py # 团队调度
│   ├── team_service.py      # 团队管理
│   ├── workflow_engine.py   # DAG 工作流引擎（核心，3000+ 行）
│   └── workflow_scheduler.py # 工作流 Cron 调度
└── websocket/
    └── ws_handler.py        # WebSocket 连接管理 + 广播
```

### 3.3 应用生命周期（app.py）

```python
# 启动顺序（lifespan context manager）
1. 创建 OPENCLAW_HOME 目录（~/.openclaw）
2. 初始化 SQLite 数据库（init_db）
3. 启动 session_watcher（JSONL 文件监控）
4. 启动 schedule_executor（排班执行）
5. 启动 workflow_scheduler（工作流调度）
6. 初始化 openclaw_bridge（Webhook 连接检查）
7. 启动 gateway_connector（Gateway WebSocket 连接）

# 关闭顺序
反向停止所有服务 → 关闭数据库
```

**路由注册**：12 个 `APIRouter` 通过 `/api` 前缀统一挂载。

**CORS 配置**：允许所有来源（`allow_origins=["*"]`），适合本地开发和桌面部署场景。

**静态文件**：前端构建产物挂载到根路径，配合 SPA fallback 中间件。

### 3.4 配置管理（config.py）

```python
class OrchestratorConfig:
    OPENCLAW_HOME     = ~/.openclaw          # 数据根目录
    DATABASE_PATH     = data/orchestrator.db  # SQLite 路径
    GATEWAY_WS_URL    = ws://127.0.0.1:18789  # Gateway 地址
    WEBHOOK_URL       = http://127.0.0.1:3578 # Webhook 地址
    AUTH_TOKEN         = None                  # 可选认证令牌
    GATEWAY_BINARY     = openclaw              # Gateway 可执行文件
    DEFAULT_PROVIDER   = None                  # 默认 LLM Provider
    DEFAULT_MODEL      = None                  # 默认模型
    API_KEYS           = {}                    # Provider API Keys
```

所有配置项支持**环境变量覆盖**（`ORCHESTRATOR_*` 前缀）。

### 3.5 数据库 Schema（init_db.py）

SQLite WAL 模式，16+ 张表：

| 表名 | 用途 |
|------|------|
| `workflows` | 工作流定义（name, description, nodes_json, edges_json, team_id） |
| `workflow_executions` | 执行实例（workflow_id, status, started_at, context_json） |
| `workflow_node_state` | 节点执行状态（execution_id, node_id, status, result, attempts） |
| `workflow_state` | 通用键值状态存储（execution_id, key, value_json） |
| `workflow_schedules` | Cron 调度配置（workflow_id, cron_expression, enabled） |
| `approvals` | 审批记录（execution_id, node_id, status, decided_by） |
| `teams` | 团队定义（name, description, lead_agent_id） |
| `team_members` | 团队成员关系（team_id, agent_id, role） |
| `tasks` | 团队任务（team_id, title, assigned_agent_id, status, priority） |
| `meetings` | 会议记录（team_id, type, topic, status, participants_json） |
| `knowledge_entries` | 知识条目（owner_type, owner_id, title, source_type） |
| `notifications` | 通知（type, title, message, read） |
| `audit_log` | 审计日志（actor, action, resource_type, resource_id, outcome） |
| `schedule_slots` | 排班槽位 |
| `schedule_overrides` | 排班覆盖 |
| `provider_keys` | API Key 管理 |

**迁移策略**：通过 `_MIGRATIONS` 列表顺序执行 `ALTER TABLE` 语句，使用 `user_version` PRAGMA 追踪版本号。

### 3.6 核心服务详解

#### 3.6.1 工作流引擎（workflow_engine.py，3000+ 行）

这是整个项目最核心的模块，实现了完整的 DAG 工作流执行引擎。

**工作流定义**：
- 节点类型：`task`（Agent 任务）、`condition`（条件分支）、`approval`（人工审批）、`join`（并行汇合）、`meeting`（Agent 会议）、`debate`（辩论）
- 边（Edge）：支持条件表达式的有向边

**执行生命周期**：

```
created → running → completed/failed/cancelled
                     ↑
              节点状态推进
```

**核心执行流程**：

1. `execute_workflow(workflow_id, context)` — 创建执行实例
2. `_execute_workflow_async(execution_id)` — 异步执行循环
3. `_find_ready_nodes(execution_id)` — 拓扑排序找到可执行节点
4. `_execute_node(execution_id, node)` — 按类型分派执行
5. `_advance_execution(execution_id)` — 推进至下一批节点

**节点执行策略**：

| 节点类型 | 执行方式 |
|----------|---------|
| `task` | 通过 OpenClaw Bridge 发送指令给 Agent，轮询等待响应 |
| `condition` | 评估条件表达式，选择输出边 |
| `approval` | 创建审批记录，暂停执行等待人工决策 |
| `join` | 等待所有上游节点完成后汇合 |
| `meeting` | 调用 meeting_service 创建并启动会议 |
| `debate` | 多 Agent 辩论，支持多轮次 |

**产物链传递**：上游节点的输出（`result`）自动注入下游节点的 prompt 上下文，实现 Agent 间的信息链式传递。

**容错机制**：
- 节点级重试（`max_retries`，默认 3 次）
- 执行超时控制
- 异常捕获 + 节点标记 `failed` + 整体执行标记 `failed`

#### 3.6.2 Gateway 连接器（gateway_connector.py）

管理与 OpenClaw Gateway 的 WebSocket 长连接：

- **自动重连**：指数退避（1s → 2s → 4s → ... → 30s 上限）
- **心跳维护**：周期性 ping 检测连接存活
- **JSON-RPC 2.0**：标准协议通信，支持请求-响应对和服务端推送
- **事件转发**：Gateway 推送的 Agent 状态变更事件转发到 WebSocket 广播

**关键方法**：
- `send_rpc(method, params)` — 发送 JSON-RPC 请求并等待响应
- `spawn_session(agent_id, session_id, message)` — 通过 Gateway 创建 Agent 会话
- `send_to_session(agent_id, session_id, message)` — 向已有会话发送消息

#### 3.6.3 Session Watcher（session_watcher.py）

监控 `~/.openclaw/sessions/` 目录下的 JSONL 文件变更：

- 使用 **watchfiles**（Rust 内核）高效监控文件变更
- 增量读取：记录每个文件的 `offset`，只读取新增行
- 解析 JSONL 条目，提取 Agent 状态和消息
- 通过 `mark_seen(msg_id)` 与 Gateway 事件去重
- 状态聚合到 `agent_statuses` 字典，供 Monitor 接口消费

#### 3.6.4 OpenClaw Bridge（openclaw_bridge.py，1164 行）

与 OpenClaw 运行时交互的核心桥接层：

- **Webhook 探测**：启动时探测 OpenClaw Webhook 端点是否可用
- **消息发送**：三层降级 — Gateway RPC → Webhook HTTP → JSONL 文件直写
- **Agent 配置读写**：读取/修改 `~/.openclaw/agents/*.md` Markdown 文件
- **团队文件管理**：读取/修改 `~/.openclaw/teams/*.md` 团队配置
- **A2A 配置**：管理 Agent-to-Agent 通信路由配置

#### 3.6.5 会议服务（meeting_service.py）

支持 **7 种会议类型**：

| 类型 | 说明 |
|------|------|
| `brainstorm` | 头脑风暴 |
| `review` | 评审 |
| `planning` | 规划 |
| `standup` | 站会 |
| `retrospective` | 回顾 |
| `decision` | 决策 |
| `debate` | 辩论 |

**会议流程**：

```
preparing → in_progress → concluded/cancelled
```

- 通过 `asyncio.ensure_future()` 后台异步运行
- Lead Agent 主持会议，逐轮收集参与者发言
- 会议内容写入 `~/.openclaw/teams/{team_id}/meetings/{meeting_id}.md`
- 结束时自动生成摘要

#### 3.6.6 任务服务（task_service.py，1128 行）

团队任务管理，支持完整生命周期：

- **任务创建**：指定负责人、优先级、截止时间
- **状态机**：`todo` → `in_progress` → `done`/`cancelled`
- **优先级队列**：按优先级排序的任务分配
- **Agent 派发**：将任务指令发送给指定 Agent

#### 3.6.7 调度系统

**workflow_scheduler.py** — Cron 驱动的工作流定时执行：
- 使用 `croniter` 解析 Cron 表达式
- 每分钟检查一次到期的调度任务
- 调度执行记录持久化到 `workflow_schedules` 表

**schedule_executor.py** — 排班调度执行器：
- 管理排班槽位和覆盖规则
- 支持 Agent 值班轮换

### 3.7 API 路由汇总

| 路由模块 | 前缀 | 端点数 | 说明 |
|----------|------|--------|------|
| `agent_routes` | `/agents` | 7 | Agent CRUD + 技能管理 |
| `team_routes` | `/teams` | 多 | 团队 CRUD + 成员管理 + A2A 配置 |
| `workflow_routes` | `/workflows` | 多 | 工作流 CRUD + 执行 + 调度 |
| `approval_routes` | `/approvals` | 4 | 审批管理（批准/驳回/列表/待处理） |
| `chat_routes` | `/agents/{id}/sessions` | 5 | 会话列表 + 消息 + 发送 + 监控 |
| `meeting_routes` | `/teams/{id}/meetings` | 7 | 会议 CRUD + 启动/结束/取消 |
| `knowledge_routes` | `/agents|teams/{id}/knowledge` | 10 | Agent/Team 对称知识库 API |
| `runtime_routes` | `/runtime/gateway` | 4 | Gateway 启停/重启/状态 |
| `notification_routes` | `/notifications` | 多 | 通知 CRUD + 已读标记 |
| `task_routes` | `/tasks` | 多 | 任务管理 |
| `settings_routes` | `/settings` | 多 | 系统配置 |
| `collaboration_routes` | `/collaboration` | 多 | 协作请求 |

### 3.8 认证与安全

- **Bearer Token 中间件**（`middleware/auth.py`）：可选的 API 认证
- **审计日志**：审批操作和运行时操作记录到 `audit_log` 表
- **参数化 SQL**：所有数据库查询使用 `?` 占位符，防止 SQL 注入
- **操作者追踪**：通过 `X-Actor-Id` / `X-API-Key` 请求头识别操作者

### 3.9 关键设计模式

| 模式 | 说明 |
|------|------|
| **单例服务** | 所有 Service 类在模块底部实例化全局单例 |
| **参数化 SQL** | 100% 使用 `?` 占位符，无 SQL 注入风险 |
| **camelCase 输出** | `_row_to_dict()` 将 snake_case 转为前端友好的 camelCase |
| **延迟导入** | 服务间通过方法内 import 避免循环依赖 |
| **双数据源回退** | ChatService 优先 Gateway → 回退 JSONL 文件 |
| **写时广播** | NotificationService 创建通知时同步 WebSocket 推送 |
| **异步后台任务** | 会议用 `asyncio.ensure_future()`，阻塞操作用 `run_in_threadpool()` |

---

## 四、前端架构

### 4.1 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| **React** | 18 | SPA 前端框架 |
| **TypeScript** | 5.6 | 类型安全 |
| **Vite** | 5 | 构建工具（手动 chunks 分离 react-vendor 和 reactflow） |
| **React Router DOM** | 7 | 客户端路由 |
| **Zustand** | 5 | 轻量状态管理 |
| **TailwindCSS** | 3.4 | 原子 CSS + tailwindcss-animate |
| **shadcn/ui** | - | Radix UI 基础的 14 个组件 |
| **React Flow** | 11 | 工作流 DAG 可视化编辑 |
| **PixiJS** | 8 | 2D 等距像素办公室场景 |
| **Recharts** | - | 图表库 |
| **Lucide React** | - | 图标库 |

### 4.2 目录结构

```
packages/web/src/
├── components/          # 85 个组件文件
│   ├── agent/          # Agent 管理组件（6 个）
│   ├── avatar/         # 头像组件
│   ├── brand/          # 品牌组件
│   ├── empire-dashboard/ # 仪表盘组件（4 个）
│   ├── empire-office/  # PixiJS 2D 办公室（25 个）
│   ├── layout/         # 布局组件（4 个）
│   ├── notification/   # 通知组件
│   ├── scene/          # 场景组件（6 个）
│   ├── team/           # 团队组件（8 个）
│   ├── ui/             # shadcn/ui 原子组件（14 个）
│   └── workflow/       # 工作流组件（13 个）
├── pages/              # 9 个页面 + workflow-editor 子模块（11 个）
├── stores/             # 4 个 Zustand Store
├── hooks/              # 8 个自定义 Hooks
├── lib/                # 13 个工具/API 文件
└── types/              # 8 个类型定义文件
```

### 4.3 路由架构

扁平路由 + MainLayout 包裹，全部在 `App.tsx` 声明：

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | DashboardPage | 总部大厅 — 系统总览 |
| `/agents` | AgentListPage | 人员档案 — Agent 列表 |
| `/agents/:id` | AgentConfigPage | Agent 配置（多标签表单） |
| `/teams` | TeamListPage | 工作室 — 团队列表 |
| `/teams/:id` | TeamDetailPage | 工作室详情 |
| `/workflows` | WorkflowEditorPage | 战术桌 — DAG 编辑器 |
| `/monitor` | EmpireMonitorPage | 指挥中心 — 实时监控 |
| `/chat`, `/chat/:agentId` | ChatPage | 通信频道 |

**全局能力**：`useWebSocket()` 顶层连接 + `ErrorBoundary` + `CommandPalette`（⌘K 全局搜索）

### 4.4 设计系统

**赛博朋克风格**：
- 深色背景 `#0F0F23`
- 霓虹色彩系统
- 20+ 自定义 keyframe 动画
- 像素风与现代 UI 融合

### 4.5 核心页面与组件

#### 4.5.1 工作流编辑器（核心，~2000 行）

- 基于 **React Flow**，6 种自定义节点：`task` / `condition` / `approval` / `join` / `meeting` / `debate`
- **自动保存**：800ms debounce
- **执行追踪**：2.5s 轮询，动态装饰节点状态（running=amber, failed=red, success=green）
- **审批流程**：内嵌审批操作
- **Cron 调度**：可视化配置定时执行
- workflow-editor/ 下 **11 个纯逻辑子模块**处理 graph/schedule/approval 等

**数据流转**：
```
后端 WorkflowDefinition
    ↔ toFlowNodes/toFlowEdges（反序列化）
    ↔ React Flow 交互
    ↔ serializeNodes/serializeEdges（序列化）
    ↔ API 保存
```

#### 4.5.2 帝国办公室（PixiJS 2D 场景，25 个文件）

- **PixiJS 8** 构建 2D 等距像素办公室
- CEO 可移动角色，Agent 在工位有状态动画（idle/working/break/meeting 等）
- 跨部门文件传递动画、会议室实时参与同步
- 全部通过 **ref 传递**避免 React 重渲染
- 支持触控虚拟摇杆

#### 4.5.3 通信频道

- Agent 列表 + 多会话切换 + 实时消息合并
- **乐观更新** + **分级轮询**（150→500→1200→2500→4000ms 递增）

#### 4.5.4 监控仪表盘

- **DashboardPage**：系统总览 + Agent 广场 + 工作流状态 + 实时流
- **EmpireMonitorPage**：HUD 统计 + 团队网格 + Agent 排行 + 动态流

### 4.6 状态管理

4 个 **Zustand Store**：

| Store | 职责 |
|-------|------|
| `useAgentStore` | Agent 列表、选中状态、状态更新 |
| `useTeamStore` | 团队列表、选中状态 |
| `useWorkflowStore` | 工作流列表/选中/执行 |
| **`useMonitorStore`** | **核心实时枢纽**：agentStatuses(Map), events, connected, gatewayConnected/Runtime, notifications, realtimeMessages, workflowSignals(Map), scheduledWorkflows |

**数据流**：`WebSocket/REST → useWebSocket() → useMonitorStore → 各页面`

**MonitorStore 设计亮点**：
- Map 结构高效增量更新
- `mergeByKey` 通用去重排序
- `workflowSignals` 自动裁剪（6h/200 条上限）

### 4.7 API 通信层

**REST API**：简洁 fetch 封装（`lib/api.ts`），`BASE_URL=/api`，通过 Vite proxy 转发到 localhost:3721

**WebSocket**：
- 单例 `WebSocketClient`
- 指数退避重连（1s → 30s）
- 引用计数管理生命周期

**监听事件**：`agent_status`, `communication`, `new_message`, `gateway_status`, `gateway_event`, `gateway_chat`, `workflow_update`, `notification`, `approval_update`

**补充轮询**（降级保护）：

| 数据 | 间隔 |
|------|------|
| 健康检查 | 10s |
| Agent 状态 | 5s |
| LiveFeed | 5s |
| 活跃执行 | 2.5s |

---

## 五、Extension 扩展模块

### 5.1 定位

Extension 是一个 **OpenClaw/Moltbot 原生插件**（非 VS Code 扩展），作为 Agent 运行时内部的**桥接层**，让 OpenClaw Agent 能够通过工具调用直接操作 Orchestrator 服务。

**核心设计理念**：Extension 不包含任何 Orchestrator 业务逻辑，它只是一个 **HTTP 桥接层**。

```
Agent 调用工具 → 工具发 HTTP 请求到 Orchestrator 后端 → 返回结果给 Agent
```

### 5.2 目录结构

```
extensions/openclaw-orchestrator/
├── src/
│   ├── client.ts           # HTTP 客户端封装（fetch + 超时 + 错误处理）
│   ├── plugin-sdk-compat.ts # 插件 SDK 类型兼容层
│   └── tools.ts            # 25 个桥接工具定义
├── tests/
│   └── tools.test.ts       # 工具测试
├── index.ts                # 插件入口，注册工具 + 服务
├── openclaw.plugin.json    # OpenClaw 插件清单
├── moltbot.plugin.json     # Moltbot 插件清单（双平台兼容）
├── package.json            # @moltbot/openclaw-orchestrator
└── README.md               # 使用文档
```

### 5.3 技术实现

| 技术 | 说明 |
|------|------|
| TypeScript | ES Module 格式 |
| @sinclair/typebox | JSON Schema 类型定义，与 Agent 工具调用协议兼容 |
| 原生 fetch | HTTP 客户端（零依赖） |

### 5.4 25 个桥接工具

| 分类 | 工具名 | 功能 |
|------|--------|------|
| **状态** | `orchestrator_status` | 检查连接状态和插件配置 |
| **运行时** | `orchestrator_gateway_status/start/stop/restart` | 管理 Gateway 运行时 |
| **监控** | `orchestrator_monitor_statuses`, `orchestrator_live_feed_snapshot` | Agent 状态和实时事件 |
| **Agent** | `orchestrator_list_agents`, `orchestrator_get_agent` | 查询 Agent 信息 |
| **团队** | `orchestrator_list/get/create_team`, `orchestrator_add_team_member` | 团队 CRUD |
| **工作流** | `orchestrator_list/get/create/update/execute_workflow` + 4 个执行管理 | 工作流全生命周期（9 个工具） |
| **审批** | `orchestrator_list_pending_approvals`, `orchestrator_resolve_approval` | 审批节点管理 |
| **聊天** | `orchestrator_list_sessions`, `orchestrator_send_agent_message` | Agent 会话消息 |
| **知识库** | `orchestrator_list/add/search_knowledge` | 知识库 CRUD + 搜索 |

### 5.5 配置优先级

```
环境变量（ORCHESTRATOR_BASE_URL 等）
    → 插件配置文件（openclaw.plugin.json）
        → 默认值（http://127.0.0.1:3721）
```

### 5.6 安装机制

通过 `scripts/install-openclaw-plugin.mjs`：
1. 复制 `extensions/openclaw-orchestrator/` 到 `~/.openclaw/extensions/`
2. 过滤 `node_modules`
3. 安装后需手动 `npm install --omit=dev`

---

## 六、数据存储策略

### 6.1 双存储架构

| 存储位置 | 内容 | 技术 |
|---------|------|------|
| **SQLite WAL** | Orchestrator 自有编排数据 | aiosqlite 异步操作 |
| **~/.openclaw/ 文件系统** | Agent 配置、会话、团队文件 | python-frontmatter + watchfiles |

### 6.2 SQLite 详情

- **模式**：WAL（Write-Ahead Logging），支持并发读
- **连接管理**：aiosqlite 异步单例连接
- **迁移策略**：基于 `user_version` PRAGMA 的顺序迁移
- **表数量**：16+ 张表
- **安全**：100% 参数化查询

### 6.3 文件系统详情

```
~/.openclaw/
├── agents/                     # Agent 配置（Markdown + YAML frontmatter）
│   └── {agent_name}.md
├── sessions/                   # 会话数据（JSONL 格式）
│   └── {session_key}.jsonl
├── teams/                      # 团队配置和数据
│   └── {team_name}/
│       ├── team.md             # 团队积累记忆
│       ├── task.md             # 异步协作任务
│       ├── meetings/           # 会议记录
│       └── knowledge/          # 团队知识库
├── openclaw.json               # 全局配置
└── extensions/                 # 插件目录
    └── openclaw-orchestrator/
```

---

## 七、实时通信体系

### 7.1 WebSocket 服务端（ws_handler.py）

```python
# 连接管理
- 连接时推送 connected + gateway_status 消息
- 30s 间隔 ping/pong 心跳机制
- 90s 超时自动断开
- broadcast() 线程安全广播函数
```

**广播事件类型**：

| 事件 | 来源 | 说明 |
|------|------|------|
| `agent_status` | session_watcher / gateway | Agent 状态变更 |
| `communication` | session_watcher | Agent 间通信事件 |
| `new_message` | chat_service | 新消息 |
| `gateway_status` | gateway_connector | Gateway 连接状态 |
| `gateway_event` | gateway_connector | Gateway 推送事件 |
| `workflow_update` | workflow_engine | 工作流执行状态变更 |
| `notification` | notification_service | 新通知 |
| `approval_update` | workflow_engine | 审批状态变更 |

### 7.2 WebSocket 客户端（前端）

- **单例** `WebSocketClient`
- **指数退避重连**：1s → 2s → 4s → ... → 30s 上限
- **引用计数**：多组件共享连接，最后一个组件卸载时断开
- **降级轮询**：WebSocket 断开时自动切换到 REST 轮询

### 7.3 前后端事件流

```
后端事件源                    WebSocket                前端消费者
─────────────────            ────────                  ──────────
session_watcher    ──┐
gateway_connector  ──┤── broadcast() ──→ /ws ──→ useWebSocket()
workflow_engine    ──┤                              │
notification_svc   ──┘                     useMonitorStore
                                               │
                                    各页面组件消费状态
```

---

## 八、部署架构

### 8.1 Docker 多阶段构建

```dockerfile
# Stage 1: 前端构建
FROM node:18-alpine
RUN pnpm install && pnpm build → /build/dist/

# Stage 2: Python 后端
FROM python:3.12-slim
COPY server/ → Python 后端代码
COPY --from=stage1 dist/ → server/openclaw_orchestrator/static/
RUN pip install .
EXPOSE 3721
CMD: openclaw-orchestrator serve --host 0.0.0.0 --port 3721
```

### 8.2 Docker Compose

- 单服务 `orchestrator`，端口 3721
- 挂载 `openclaw-data` 卷到 `/root/.openclaw`
- 通过 `host.docker.internal` 连接宿主机 Gateway
- 30s 间隔健康检查（`/api/health`）

### 8.3 部署方式一览

| 方式 | 说明 |
|------|------|
| **pip install** | `pip install openclaw-orchestrator` → 包含完整 UI |
| **Docker** | `docker-compose up -d` |
| **一键部署** | `bash scripts/deploy.sh` → 检查依赖 → 构建 → systemd 服务 |
| **开发模式** | `bash scripts/dev.sh` → Python :3721 + Vite :5173 并行 |

---

## 九、构建与发布流程

### 9.1 脚本列表

| 脚本 | 功能 |
|------|------|
| `dev.sh` | 开发模式：Python 后端 + Vite 前端并行启动 |
| `build_frontend.sh` | 构建 React 前端 → 复制到 Python 包 static/ |
| `build_and_publish.sh` | 前端构建 + Python wheel 打包 + 可选 PyPI 上传 |
| `deploy.sh` | 服务器一键部署：环境检查 → 构建 → systemd 服务 |
| `install-openclaw-plugin.mjs` | 安装 OpenClaw 插件到 ~/.openclaw/extensions/ |
| `install_openclaw_plugin.ps1` | Windows 版插件安装 |
| `_inspect_workflow_db.py` | 调试：检查工作流数据库 |

### 9.2 构建流水线

```
pnpm install → pnpm build → dist/
        ↓ 复制
dist/* → server/openclaw_orchestrator/static/
        ↓ 打包
python -m build → dist/openclaw_orchestrator-*.whl
        ↓ 可选
twine upload dist/*  →  PyPI
```

---

## 十、技术栈总结

### 10.1 全景视图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (packages/web)                   │
│  React 18 · TypeScript 5.6 · Vite 5 · TailwindCSS 3.4      │
│  Zustand 5 · React Flow 11 · PixiJS 8 · shadcn/ui          │
├─────────────────────────────────────────────────────────────┤
│                        后端 (server/)                        │
│  Python 3.10+ · FastAPI 0.115+ · Uvicorn · aiosqlite       │
│  Pydantic 2.9+ · watchfiles · httpx · websockets · croniter │
├─────────────────────────────────────────────────────────────┤
│                   Extension (extensions/)                     │
│  TypeScript ES Module · @sinclair/typebox · 原生 fetch       │
├─────────────────────────────────────────────────────────────┤
│                     基础设施                                  │
│  Docker (node:18-alpine + python:3.12-slim) · systemd       │
│  pnpm workspace · Hatchling · SQLite WAL                     │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 代码规模估算

| 模块 | 文件数 | 核心代码行数 | 说明 |
|------|--------|-------------|------|
| 后端 services/ | 18+ | ~12,000 | workflow_engine 独占 3000+ 行 |
| 后端 routes/ | 12 | ~2,000 | REST API 层 |
| 后端 其他 | 5+ | ~1,500 | 配置/数据库/中间件/WebSocket |
| 前端 components/ | 85 | ~8,000 | empire-office 和 workflow 最大 |
| 前端 pages/ | 20 | ~4,000 | workflow-editor 最复杂 |
| 前端 其他 | 33 | ~2,500 | stores/hooks/lib/types |
| Extension | 5 | ~1,500 | 25 个工具定义 |
| **总计** | **~180** | **~31,500** | |

---

## 十一、关键架构亮点与设计决策

### 11.1 架构亮点

1. **寄生式架构** — 不自建 Agent 运行时，深度集成 OpenClaw 文件系统，零侵入增强
2. **单端口部署** — API + WS + UI = 一个端口，`pip install` 即用
3. **三层触发降级** — Gateway → Webhook → 文件直写，保证指令必达
4. **双源事件采集** — Gateway 低延迟 + JSONL 高可靠，互补去重
5. **文件即协作** — team.md 积累团队记忆、task.md 承载异步协作、meeting.md 记录会议
6. **产物链传递** — 上游 Agent 输出自动编织进下游 prompt
7. **Extension 桥接** — 25 个工具让 Agent 自主操作 Orchestrator，实现 Agent 自治
8. **赛博朋克 UI** — PixiJS 2D 像素办公室 + 霓虹色彩系统，差异化体验

### 11.2 设计权衡

| 决策 | 选择 | 权衡 |
|------|------|------|
| 数据库 | SQLite WAL | 零运维 vs 不支持多实例部署 |
| 前端状态 | Zustand | 轻量 vs 缺乏 DevTools 生态 |
| 文件监控 | watchfiles (Rust) | 高性能 vs 额外原生依赖 |
| 工作流引擎 | 自研 | 完全可控 vs 开发维护成本 |
| 会议系统 | Markdown 文件 | 人类可读 vs 结构化查询困难 |
| 认证 | 可选 Bearer Token | 简单 vs 缺乏细粒度权限 |
| CORS | 允许所有来源 | 开发便利 vs 生产环境需收紧 |

### 11.3 潜在改进方向

1. **知识库搜索**：当前为简单关键词匹配，注释提到向量搜索占位，可集成 embedding
2. **协作审批**：当前为自动批准，可添加人工审批流程
3. **数据库迁移**：当前为线性 ALTER TABLE 迁移，可引入 Alembic 等工具
4. **多实例部署**：SQLite 限制，如需扩展可迁移至 PostgreSQL
5. **权限体系**：当前仅有 Bearer Token，可添加 RBAC
6. **测试覆盖**：Extension 有测试，后端和前端测试覆盖率可提升

---

> **总结**：OpenClaw Orchestrator 是一个设计精巧的"增强层"，通过寄生式架构无侵入地为 OpenClaw Agent 运行时增加了可视化编排、团队协作、会议系统和实时监控能力。其三层降级、双源采集、产物链传递等设计体现了对分布式 Agent 系统的深刻理解，而赛博朋克风格的 PixiJS 办公室则展现了独特的产品审美。
