# ═══════════════════════════════════════════════════════════════
# OpenClaw Orchestrator — Multi-stage Dockerfile
# ═══════════════════════════════════════════════════════════════

# ─── Stage 1: 构建前端 ───
FROM node:18-alpine AS frontend

WORKDIR /build

# 安装 pnpm
RUN npm install -g pnpm

# 先复制依赖声明，利用 Docker 缓存
COPY packages/web/package.json packages/web/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# 复制前端源码并构建
COPY packages/web/ ./
RUN pnpm build


# ─── Stage 2: Python 后端 ───
FROM python:3.12-slim

LABEL maintainer="980831Cai"
LABEL description="OpenClaw Orchestrator - Multi-Agent Visual Orchestration"
LABEL org.opencontainers.image.source="https://github.com/980831Cai/openclaw-orchestrator"

WORKDIR /app

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制后端代码
COPY server/ ./server/

# 复制前端构建产物到 static 目录
COPY --from=frontend /build/dist/ ./server/openclaw_orchestrator/static/

# 安装 Python 依赖
RUN cd server && pip install --no-cache-dir .

# 数据卷（SQLite 数据库 + Agent 配置）
VOLUME ["/root/.openclaw"]

# 暴露端口
EXPOSE 3721

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3721/api/health')" || exit 1

# 启动服务
CMD ["openclaw-orchestrator", "serve", "--host", "0.0.0.0", "--port", "3721"]
