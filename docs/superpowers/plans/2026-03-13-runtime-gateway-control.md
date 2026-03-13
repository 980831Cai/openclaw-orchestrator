# Runtime Gateway Control Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `openclaw-orchestrator` 补齐可用的 OpenClaw Gateway 启停与状态探测闭环，支持从面板直接查看、启动、停止与重启本机 Gateway。

**Architecture:** 保留现有 FastAPI `runtime_routes` 接口层，把 `clawpanel` 中稳定且直接相关的运行时控制逻辑本地化到 `runtime_service.py`。配置优先采用环境变量，其次读取 `~/.openclaw/openclaw.json`，统一写日志到 `~/.openclaw/logs/`，并通过 TCP 探测校验实际运行状态。

**Tech Stack:** Python 3.11、FastAPI、unittest/pytest、subprocess、socket、Pathlib。

---

## Chunk 1: Runtime service behavior

### Task 1: 为 runtime_service 补失败测试与配置解析测试

**Files:**
- Modify: `server/tests/test_app_static.py`
- Create: `server/tests/test_runtime_service.py`
- Modify: `server/openclaw_orchestrator/services/runtime_service.py`

- [ ] **Step 1: 写失败测试覆盖配置优先级与可管理性判断**
- [ ] **Step 2: 运行 `python -m pytest server/tests/test_runtime_service.py -q` 确认失败**
- [ ] **Step 3: 实现最小代码让测试通过**
- [ ] **Step 4: 重新运行 `python -m pytest server/tests/test_runtime_service.py -q`**

### Task 2: 为启动/停止/重启补闭环测试

**Files:**
- Create: `server/tests/test_runtime_service.py`
- Modify: `server/openclaw_orchestrator/services/runtime_service.py`

- [ ] **Step 1: 写失败测试覆盖 start/stop/restart 的成功与超时路径**
- [ ] **Step 2: 运行 `python -m pytest server/tests/test_runtime_service.py -q` 确认失败**
- [ ] **Step 3: 实现最小代码通过测试**
- [ ] **Step 4: 再跑同一测试确认通过**

## Chunk 2: 路由与集成验证

### Task 3: 校验 runtime 路由与健康检查输出一致

**Files:**
- Modify: `server/openclaw_orchestrator/routes/runtime_routes.py`
- Modify: `server/openclaw_orchestrator/app.py`
- Create: `server/tests/test_runtime_routes.py`

- [ ] **Step 1: 写失败测试覆盖 `/api/runtime/gateway` 与启动/停止错误映射**
- [ ] **Step 2: 运行 `python -m pytest server/tests/test_runtime_routes.py -q` 确认失败**
- [ ] **Step 3: 调整实现并保持错误结构一致**
- [ ] **Step 4: 运行 `python -m pytest server/tests/test_runtime_routes.py -q`**

### Task 4: 做最小集成回归

**Files:**
- Modify: `server/tests/test_app_static.py`
- Modify: `server/tests/test_runtime_service.py`
- Modify: `server/tests/test_runtime_routes.py`

- [ ] **Step 1: 运行 `python -m pytest server/tests/test_runtime_service.py server/tests/test_runtime_routes.py server/tests/test_app_static.py -q`**
- [ ] **Step 2: 若失败，按最小修改修复**
- [ ] **Step 3: 记录日志路径、环境变量优先级与后续待办**