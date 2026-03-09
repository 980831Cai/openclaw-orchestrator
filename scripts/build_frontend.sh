#!/bin/bash
# Build the React frontend and copy to Python backend's static directory
# Usage: bash scripts/build_frontend.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$PROJECT_ROOT/packages/web"
STATIC_DIR="$PROJECT_ROOT/server/openclaw_orchestrator/static"

# ─── 前置检查 ───
if ! command -v node &>/dev/null; then
    echo "❌ 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

if ! command -v pnpm &>/dev/null; then
    echo "📦 安装 pnpm..."
    npm install -g pnpm
fi

# ─── 安装依赖 ───
echo "🔨 Building React frontend..."
cd "$WEB_DIR"

echo "📦 Installing frontend dependencies..."
pnpm install

# ─── 构建 ───
echo "⚡ Running build..."
pnpm build

# ─── 复制到 static ───
echo "📋 Copying build output to Python static directory..."

# 确保 static 目录存在
mkdir -p "$STATIC_DIR"

# Clean old static files (but keep .gitkeep)
find "$STATIC_DIR" -not -name '.gitkeep' -not -name '__init__.py' -not -path "$STATIC_DIR" -delete 2>/dev/null || true

# Copy build output
cp -r "$WEB_DIR/dist/"* "$STATIC_DIR/"

echo "✅ Frontend built and copied to $STATIC_DIR"
echo "   Files: $(find "$STATIC_DIR" -type f | wc -l | tr -d ' ')"
