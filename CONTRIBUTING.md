# 贡献指南 | Contributing Guide

感谢你对 OpenClaw Orchestrator 的关注！🐾

本文档说明如何参与项目开发。请在提交贡献前仔细阅读。

---

## 📋 开始之前

1. **查看已有 Issue** — 在创建新 Issue 或 PR 之前，请先搜索是否已有相关讨论
2. **先开 Issue 讨论** — 对于较大的功能改动，建议先开 Issue 讨论方案，避免做了大量工作后方向不一致
3. **一个 PR 做一件事** — 请保持 PR 聚焦，不要在一个 PR 中混合多个不相关的改动

## 🔄 贡献流程

### 1. Fork & Clone

```bash
# Fork 本仓库（点击 GitHub 页面上的 Fork 按钮）
git clone https://github.com/<your-username>/openclaw-orchestrator.git
cd openclaw-orchestrator
git remote add upstream https://github.com/980831Cai/openclaw-orchestrator.git
```

### 2. 创建分支

```bash
# 从最新的 main 分支创建你的工作分支
git fetch upstream
git checkout -b feat/your-feature upstream/main
```

**分支命名规范**：
| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat/` | 新功能 | `feat/workflow-join-nodes` |
| `fix/` | Bug 修复 | `fix/parallel-execution-timeout` |
| `docs/` | 文档修改 | `docs/api-endpoints` |
| `refactor/` | 代码重构 | `refactor/workflow-engine` |

### 3. 本地开发

```bash
# 安装后端依赖
cd server && pip install -e ".[dev]" && cd ..

# 安装前端依赖
cd packages/web && pnpm install && cd ..

# 启动开发环境
bash scripts/dev.sh
```

### 4. 提交代码

```bash
git add .
git commit -m "feat: add join node with and/or/xor merge modes"
```

**Commit 消息规范**（推荐 [Conventional Commits](https://www.conventionalcommits.org/)）：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

类型：`feat` / `fix` / `docs` / `refactor` / `style` / `perf` / `test` / `chore`

### 5. 提交 PR

```bash
git push origin feat/your-feature
```

然后在 GitHub 上创建 Pull Request，填写 PR 模板。

---

## 🏗️ 项目架构

```
openclaw-orchestrator/
├── server/                    # Python/FastAPI 后端
│   └── openclaw_orchestrator/
│       ├── services/          # 核心业务逻辑（⚠️ 改动需谨慎）
│       ├── routes/            # API 路由
│       └── websocket/         # WebSocket 事件
├── packages/web/              # React 前端
│   └── src/
│       ├── pages/             # 页面组件
│       ├── components/        # UI 组件
│       ├── types/             # TypeScript 类型定义
│       └── stores/            # 状态管理
└── scripts/                   # 构建/部署脚本
```

### 核心模块说明

| 模块 | 路径 | 改动风险 |
|------|------|----------|
| 工作流引擎 | `services/workflow_engine.py` | 🔴 高 — 影响所有工作流执行 |
| OpenClaw 桥接 | `services/openclaw_bridge.py` | 🔴 高 — 影响 Agent 通信 |
| Gateway 连接 | `services/gateway_connector.py` | 🟡 中 — 影响实时通信 |
| 前端类型 | `types/workflow.ts` | 🟡 中 — 影响前后端契约 |
| UI 组件 | `components/` | 🟢 低 — 局部影响 |

---

## ✅ Review 标准

PR 会从以下方面进行 Review：

1. **功能正确性** — 改动是否达成了预期效果
2. **代码质量** — 是否清晰可读、是否有冗余代码
3. **类型安全** — TypeScript 类型是否完整，Python type hints 是否准确
4. **向后兼容** — 是否会 break 现有功能
5. **性能** — 是否引入了性能问题（如 N+1 查询、大文件 blocking 等）
6. **安全** — 是否存在注入风险、密钥泄露等

---

## ⚠️ 注意事项

- **不要直接 push 到 `main` 分支** — 所有改动必须通过 PR
- **不要提交 API Key 或密钥** — 使用环境变量
- **数据库 Schema 变更** — 需要在 PR 中说明迁移方案
- **大规模重构** — 请先开 Issue 讨论，获得 maintainer 认可后再动手
- **前后端类型不一致** — 修改 `types/` 下的类型定义时，请同步检查后端数据结构

---

## 🐛 报告 Bug

请使用 GitHub Issues，并包含以下信息：

1. 复现步骤
2. 期望行为 vs 实际行为
3. 环境信息（OS、Python 版本、Node 版本、浏览器）
4. 错误日志/截图（如有）

---

## 💬 交流

- **GitHub Issues** — Bug 报告和功能讨论
- **GitHub Discussions** — 一般性讨论（如已启用）
- **PR Comments** — 代码相关讨论

---

感谢你的贡献！每一个 PR 都在让 OpenClaw Orchestrator 变得更好 🐾
