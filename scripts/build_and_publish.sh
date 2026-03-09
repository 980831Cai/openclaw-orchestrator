#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# OpenClaw Orchestrator — 构建 & 发布脚本
#
# 用法:
#   bash scripts/build_and_publish.sh          # 仅构建 wheel
#   bash scripts/build_and_publish.sh --publish # 构建 + 上传 PyPI
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
WEB_DIR="$PROJECT_ROOT/packages/web"
STATIC_DIR="$SERVER_DIR/openclaw_orchestrator/static"

PUBLISH=false
if [ "$1" = "--publish" ]; then
    PUBLISH=true
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🐾 OpenClaw Orchestrator — Build & Publish"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── Step 1: 构建前端 ───
echo "📦 Step 1/3: 构建前端..."
cd "$WEB_DIR"

if [ ! -d "node_modules" ]; then
    echo "  → 安装前端依赖..."
    pnpm install
fi

pnpm build
echo "  ✅ 前端构建完成"

# ─── Step 2: 复制前端到 static ───
echo ""
echo "📋 Step 2/3: 复制前端构建产物到 Python 包..."

# 清理旧文件
find "$STATIC_DIR" -not -name '.gitkeep' -not -path "$STATIC_DIR" -delete 2>/dev/null || true

# 复制构建产物
cp -r "$WEB_DIR/dist/"* "$STATIC_DIR/"
FILE_COUNT=$(find "$STATIC_DIR" -type f | wc -l | tr -d ' ')
echo "  ✅ 已复制 $FILE_COUNT 个文件到 static/"

# ─── Step 3: 构建 Python wheel ───
echo ""
echo "🔧 Step 3/3: 构建 Python wheel..."
cd "$SERVER_DIR"

# 清理旧构建
rm -rf dist/ build/ *.egg-info

# 构建
python -m build

echo ""
echo "  ✅ 构建产物:"
ls -lh dist/
echo ""

# ─── 可选: 发布到 PyPI ───
if [ "$PUBLISH" = true ]; then
    echo "🚀 上传到 PyPI..."
    python -m twine upload dist/*
    echo "  ✅ 已上传到 PyPI"
    echo ""
    echo "  用户现在可以运行:"
    echo "    pip install openclaw-orchestrator"
    echo "    openclaw-orchestrator serve"
else
    echo "💡 如需上传到 PyPI，运行:"
    echo "   bash scripts/build_and_publish.sh --publish"
    echo ""
    echo "💡 本地测试安装:"
    echo "   pip install dist/openclaw_orchestrator-*.whl"
    echo "   openclaw-orchestrator serve"
fi

echo ""
