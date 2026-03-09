#!/bin/bash
# Build the React frontend and copy to Python backend's static directory
# Usage: bash scripts/build_frontend.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$PROJECT_ROOT/packages/web"
STATIC_DIR="$PROJECT_ROOT/server/openclaw_orchestrator/static"

echo "🔨 Building React frontend..."
cd "$WEB_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    pnpm install
fi

# Build
pnpm build

echo "📋 Copying build output to Python static directory..."

# Clean old static files (but keep .gitkeep)
find "$STATIC_DIR" -not -name '.gitkeep' -not -name '__init__.py' -not -path "$STATIC_DIR" -delete 2>/dev/null || true

# Copy build output
cp -r "$WEB_DIR/dist/"* "$STATIC_DIR/"

echo "✅ Frontend built and copied to $STATIC_DIR"
echo "   Files: $(find "$STATIC_DIR" -type f | wc -l | tr -d ' ')"
