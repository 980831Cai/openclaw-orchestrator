#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# OpenClaw Orchestrator - 服务器部署脚本
# 
# 使用方法（在服务器上执行）:
#   curl -sSL <raw_url>/scripts/deploy.sh | bash
#   或：
#   git clone https://git.woa.com/lurkacai/openclaw-orchestrator.git
#   cd openclaw-orchestrator && bash scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════

set -e

# ─── 颜色输出 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── 配置变量 ───
REPO_URL="https://git.woa.com/lurkacai/openclaw-orchestrator.git"
INSTALL_DIR="/opt/openclaw-orchestrator"
SERVICE_NAME="openclaw-orchestrator"
PORT=3721
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🐾 OpenClaw Orchestrator 部署脚本"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── Step 1: 检查 Python 版本 ───
info "检查 Python 版本..."
if command -v python3 &>/dev/null; then
    PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
        ok "Python $PY_VERSION ✓"
    else
        err "需要 Python >= 3.10，当前版本: $PY_VERSION"
    fi
else
    err "未找到 python3，请先安装 Python 3.10+"
fi

# ─── Step 2: 检查 Node.js 和 pnpm（构建前端需要）───
info "检查 Node.js 和 pnpm..."
HAS_NODE=false
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v)
    ok "Node.js $NODE_VERSION ✓"
    HAS_NODE=true
else
    warn "未找到 Node.js，将尝试安装..."
fi

if [ "$HAS_NODE" = false ]; then
    info "安装 Node.js 18.x..."
    if command -v yum &>/dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        yum install -y nodejs
    elif command -v apt-get &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    else
        err "无法自动安装 Node.js，请手动安装后重试"
    fi
    ok "Node.js $(node -v) 已安装"
fi

if ! command -v pnpm &>/dev/null; then
    info "安装 pnpm..."
    npm install -g pnpm
    ok "pnpm $(pnpm -v) 已安装"
else
    ok "pnpm $(pnpm -v) ✓"
fi

# ─── Step 3: 克隆或更新项目代码 ───
info "准备项目代码..."
if [ -d "$INSTALL_DIR/.git" ]; then
    info "项目已存在，拉取最新代码..."
    cd "$INSTALL_DIR"
    git pull origin master
    ok "代码已更新"
else
    info "克隆项目到 $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    ok "代码已克隆"
fi

# ─── Step 4: 安装 Python 后端依赖 ───
info "安装 Python 后端..."
cd "$INSTALL_DIR/server"

# 创建虚拟环境（如果不存在）
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    ok "虚拟环境已创建"
fi

source .venv/bin/activate
pip install --upgrade pip -q
pip install -e . -q
ok "Python 依赖已安装"

# 验证安装
if python -c "import openclaw_orchestrator" 2>/dev/null; then
    ok "openclaw_orchestrator 模块验证通过"
else
    err "模块安装验证失败"
fi

# ─── Step 5: 构建前端 ───
info "构建前端..."
cd "$INSTALL_DIR"
bash scripts/build_frontend.sh
ok "前端构建完成"

# ─── Step 6: 创建 systemd 服务 ───
info "配置 systemd 服务..."

VENV_PYTHON="$INSTALL_DIR/server/.venv/bin/python"

cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=OpenClaw Orchestrator - Multi-Agent Visual Orchestration
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$INSTALL_DIR/server
Environment=OPENCLAW_HOME=$OPENCLAW_HOME
Environment=PORT=$PORT
ExecStart=$VENV_PYTHON -m openclaw_orchestrator serve --host 0.0.0.0 --port $PORT
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# 安全加固
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$OPENCLAW_HOME $INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF

# 重载 systemd 并启动服务
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}

# 如果已在运行，先停止
if systemctl is-active --quiet ${SERVICE_NAME}; then
    info "停止旧服务..."
    systemctl stop ${SERVICE_NAME}
fi

systemctl start ${SERVICE_NAME}
sleep 2

# ─── Step 7: 验证服务状态 ───
if systemctl is-active --quiet ${SERVICE_NAME}; then
    ok "服务已启动并运行"
else
    err "服务启动失败，请运行 journalctl -u ${SERVICE_NAME} -n 50 查看日志"
fi

# ─── Step 8: 配置防火墙（如需要）───
if command -v firewall-cmd &>/dev/null; then
    if ! firewall-cmd --query-port=${PORT}/tcp --quiet 2>/dev/null; then
        info "开放防火墙端口 ${PORT}..."
        firewall-cmd --permanent --add-port=${PORT}/tcp
        firewall-cmd --reload
        ok "防火墙端口 ${PORT} 已开放"
    fi
fi

# ─── 获取服务器 IP ───
SERVER_IP=$(hostname -I | awk '{print $1}')

# ─── 完成 ───
echo ""
echo "═══════════════════════════════════════════════════"
echo -e "  ${GREEN}🎉 部署完成！${NC}"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  📍 访问地址:"
echo "     本地:   http://localhost:${PORT}"
echo "     外网:   http://${SERVER_IP}:${PORT}"
echo ""
echo "  📂 安装目录:  $INSTALL_DIR"
echo "  📂 数据目录:  $OPENCLAW_HOME"
echo "  📂 数据库:    $OPENCLAW_HOME/orchestrator.sqlite"
echo ""
echo "  🔧 常用命令:"
echo "     查看状态:  systemctl status ${SERVICE_NAME}"
echo "     查看日志:  journalctl -u ${SERVICE_NAME} -f"
echo "     重启服务:  systemctl restart ${SERVICE_NAME}"
echo "     停止服务:  systemctl stop ${SERVICE_NAME}"
echo ""
echo "  ⚠️  提示: 如果从外网访问，请确保腾讯云安全组"
echo "     已放行端口 ${PORT}（TCP）"
echo ""
