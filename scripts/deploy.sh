#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# OpenClaw Orchestrator — 服务器一键部署脚本
#
# 使用方法:
#   git clone https://github.com/980831Cai/openclaw-orchestrator.git
#   cd openclaw-orchestrator && bash scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════

set -e

# ─── 颜色 ───
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[ OK ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# ─── 配置 ───
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="openclaw-orchestrator"
PORT=3721
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🐾 OpenClaw Orchestrator — 一键部署"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  安装目录:  $INSTALL_DIR"
echo "  数据目录:  $OPENCLAW_HOME"
echo "  服务端口:  $PORT"
echo ""

# ─── Step 1: 检查 Python ───
info "检查 Python..."
if command -v python3 &>/dev/null; then
    PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
    [ "$PY_MINOR" -ge 10 ] && ok "Python $PY_VER" || err "需要 Python >= 3.10，当前: $PY_VER"
else
    err "未找到 python3，请先安装 Python 3.10+"
fi

# ─── Step 2: 检查 Node.js + pnpm ───
info "检查 Node.js..."
if ! command -v node &>/dev/null; then
    warn "未找到 Node.js，尝试安装 18.x..."
    if command -v yum &>/dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash - && yum install -y nodejs
    elif command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs
    else
        err "无法自动安装 Node.js，请手动安装"
    fi
fi
ok "Node.js $(node -v)"

if ! command -v pnpm &>/dev/null; then
    info "安装 pnpm..."
    npm install -g pnpm
fi
ok "pnpm $(pnpm -v)"

# ─── Step 3: 创建虚拟环境 + 安装后端 ───
info "安装 Python 后端..."
cd "$INSTALL_DIR/server"

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install --upgrade pip -q
pip install -e . -q
ok "Python 依赖已安装"

# ─── Step 4: 构建前端 ───
info "构建前端..."
cd "$INSTALL_DIR"
bash scripts/build_frontend.sh
ok "前端构建完成"

# ─── Step 5: 创建数据目录 ───
mkdir -p "$OPENCLAW_HOME"

# ─── Step 6: 创建 systemd 服务 ───
info "配置 systemd 服务..."

VENV_BIN="$INSTALL_DIR/server/.venv/bin"

cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=OpenClaw Orchestrator - Multi-Agent Visual Orchestration
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$INSTALL_DIR/server
Environment=OPENCLAW_HOME=$OPENCLAW_HOME
Environment=PORT=$PORT
Environment=PATH=$VENV_BIN:/usr/local/bin:/usr/bin:/bin
ExecStart=$VENV_BIN/openclaw-orchestrator serve --host 0.0.0.0 --port $PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME} --now

sleep 2

if systemctl is-active --quiet ${SERVICE_NAME}; then
    ok "服务已启动"
else
    err "服务启动失败，运行 journalctl -u ${SERVICE_NAME} -n 30 查看日志"
fi

# ─── Step 7: 防火墙 ───
if command -v firewall-cmd &>/dev/null; then
    if ! firewall-cmd --query-port=${PORT}/tcp --quiet 2>/dev/null; then
        firewall-cmd --permanent --add-port=${PORT}/tcp && firewall-cmd --reload
        ok "防火墙端口 ${PORT} 已开放"
    fi
fi

# ─── 完成 ───
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")

echo ""
echo "═══════════════════════════════════════════════════"
echo -e "  ${GREEN}🎉 部署完成！${NC}"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  📍 访问:  http://${SERVER_IP}:${PORT}"
echo ""
echo "  🔧 管理命令:"
echo "     systemctl status  ${SERVICE_NAME}"
echo "     systemctl restart ${SERVICE_NAME}"
echo "     journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "  ⚠️  外网访问请确保云服务器安全组放行 TCP ${PORT}"
echo ""
