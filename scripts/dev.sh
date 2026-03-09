#!/bin/bash
# Development mode: run Python backend + Vite frontend concurrently
# Usage: bash scripts/dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Starting OpenClaw Orchestrator in development mode..."

# Start Python backend
echo "🐍 Starting Python backend on :3721..."
cd "$PROJECT_ROOT/server"
python -m openclaw_orchestrator serve --port 3721 --reload &
BACKEND_PID=$!

# Start Vite frontend dev server
echo "⚡ Starting Vite frontend on :5173..."
cd "$PROJECT_ROOT/packages/web"
pnpm dev &
FRONTEND_PID=$!

# Trap to kill both on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "👋 Done"
}
trap cleanup EXIT INT TERM

echo ""
echo "✅ Development servers running:"
echo "   Backend API:  http://localhost:3721"
echo "   Frontend UI:  http://localhost:5173"
echo "   WebSocket:    ws://localhost:3721/ws"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait for either to exit
wait
