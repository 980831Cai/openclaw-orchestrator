from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from openclaw_orchestrator.config import settings

_WINDOWS_CREATE_NO_WINDOW = 0x08000000
_WINDOWS_DETACHED_PROCESS = 0x00000008
_LOCAL_GATEWAY_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0"}
_DEFAULT_RUNTIME_GATEWAY_HOST = "127.0.0.1"
_DEFAULT_GATEWAY_PORT = 18789
_RUNTIME_GATEWAY_PROTOCOL_VERSION = 3
_DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://localhost:3721",
    "http://127.0.0.1:3721",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]


class RuntimeServiceError(RuntimeError):
    pass


class RuntimeService:
    def __init__(self) -> None:
        self._openclaw_home = Path(settings.openclaw_home)

    def get_gateway_status(self) -> dict[str, Any]:
        config = self._ensure_runtime_config()
        host, port, runtime_gateway_url = self._runtime_gateway_target(config)
        rpc_gateway_url = settings.gateway_url
        rpc_host = urlparse(rpc_gateway_url).hostname
        manageable = self._is_manageable_target(host)
        cli_path = self._detect_openclaw_cli() if manageable else None
        cli_installed = self._is_cli_installed() if manageable else False
        if cli_installed and cli_path is None:
            cli_path = "openclaw"
        process = self._check_gateway_process(host, port) if manageable else {
            "running": False,
            "pid": None,
            "source": "unmanaged",
        }
        responsive = self._probe_gateway(host, port) if manageable else False
        running = bool(process["running"] or responsive)
        log_path = self._gateway_log_dir() / "gateway.log"
        error_log_path = self._gateway_log_dir() / "gateway.err.log"
        should_surface_logs = not running or not responsive
        log_tail = self._read_log_tail(log_path) if should_surface_logs else ""
        error_log_tail = self._read_log_tail(error_log_path) if should_surface_logs else ""

        return {
            "platform": os.name,
            "gatewayUrl": runtime_gateway_url,
            "rpcGatewayUrl": rpc_gateway_url,
            "host": host,
            "port": port,
            "manageable": manageable,
            "cliInstalled": cli_installed,
            "cliPath": cli_path,
            "running": running,
            "responsive": responsive,
            "pid": process.get("pid"),
            "detectionSource": process.get("source"),
            "logFile": str(log_path),
            "logTail": log_tail or None,
            "errorLogFile": str(error_log_path),
            "errorLogTail": error_log_tail or None,
            "message": self._build_status_message(
                manageable=manageable,
                host=host,
                rpc_host=rpc_host,
                rpc_gateway_url=rpc_gateway_url,
                running=running,
                responsive=responsive,
            ),
        }

    def start_gateway(self) -> dict[str, Any]:
        status = self.get_gateway_status()
        self._ensure_manageable(status)
        cli_path = status.get("cliPath")
        if not status["cliInstalled"] or not cli_path:
            raise RuntimeServiceError("未找到 openclaw CLI，请先确认命令行可以执行 `openclaw`。")
        if status["running"] and status.get("responsive", False):
            return {**status, "message": "Gateway 已在运行"}

        if status["running"]:
            raise RuntimeServiceError(
                self._format_gateway_failure(
                    "检测到 Gateway 进程已占用端口，但 RPC 握手未通过。请先停止或重启后再试。",
                    status=status,
                )
            )

        log_dir = self._gateway_log_dir()
        log_dir.mkdir(parents=True, exist_ok=True)
        stdout_handle = open(log_dir / "gateway.log", "a", encoding="utf-8")
        stderr_handle = open(log_dir / "gateway.err.log", "a", encoding="utf-8")
        try:
            try:
                self._spawn_gateway(cli_path, stdout_handle, stderr_handle)
            except OSError as exc:
                raise RuntimeServiceError(
                    self._format_gateway_failure(
                        f"Gateway 启动失败: {exc}",
                        status=status,
                    )
                ) from exc
        finally:
            stdout_handle.close()
            stderr_handle.close()

        host = str(status["host"])
        port = int(status["port"])
        deadline = time.time() + 12.0
        while time.time() < deadline:
            process = self._check_gateway_process(host, port)
            if process["running"] and self._probe_gateway(host, port):
                return {**self.get_gateway_status(), "message": "Gateway 已启动"}
            time.sleep(0.25)

        raise RuntimeServiceError(
            self._format_gateway_failure(
                "Gateway 启动超时，请查看错误日志。",
                status=status,
            )
        )

    def stop_gateway(self) -> dict[str, Any]:
        status = self.get_gateway_status()
        self._ensure_manageable(status)
        if not status["running"]:
            return {**status, "message": "Gateway 当前未运行"}

        errors: list[str] = []
        cli_path = status.get("cliPath")
        if status["cliInstalled"] and cli_path:
            try:
                result = self._run_openclaw_command(
                    "gateway",
                    "stop",
                    capture_output=True,
                    cli_path=cli_path,
                )
                if result.returncode != 0:
                    stderr = (result.stderr or "").strip()
                    errors.append(stderr or "执行 `openclaw gateway stop` 失败")
            except OSError as exc:
                errors.append(str(exc))

        host = str(status["host"])
        port = int(status["port"])
        process = self._check_gateway_process(host, port)
        if process["running"]:
            self._terminate_gateway_process(process.get("pid"), errors)

        deadline = time.time() + 8.0
        while time.time() < deadline:
            if not self._check_gateway_process(host, port)["running"]:
                return {**self.get_gateway_status(), "message": "Gateway 已停止"}
            time.sleep(0.25)

        detail = "；".join(part for part in errors if part).strip()
        raise RuntimeServiceError(
            self._format_gateway_failure(
                detail or "Gateway 停止超时，请稍后重试或手动检查。",
                status=status,
            )
        )

    def restart_gateway(self) -> dict[str, Any]:
        status = self.get_gateway_status()
        self._ensure_manageable(status)
        if status["running"]:
            self.stop_gateway()
        return self.start_gateway()

    def _runtime_gateway_target(self, config: dict[str, Any]) -> tuple[str, int, str]:
        host = self._runtime_gateway_host()
        port = self._gateway_port_from_config(config)
        runtime_gateway_url = f"ws://{host}:{port}"
        return host, port, runtime_gateway_url

    def _runtime_gateway_host(self) -> str:
        host = (
            os.environ.get("OPENCLAW_RUNTIME_GATEWAY_HOST")
            or os.environ.get("OPENCLAW_GATEWAY_HOST")
            or _DEFAULT_RUNTIME_GATEWAY_HOST
        )
        normalized_host = host.strip() if isinstance(host, str) and host.strip() else _DEFAULT_RUNTIME_GATEWAY_HOST
        if normalized_host in {"0.0.0.0", "::", "::1", "localhost"}:
            return _DEFAULT_RUNTIME_GATEWAY_HOST
        return normalized_host

    def _gateway_port_from_config(self, config: dict[str, Any]) -> int:
        env_value = os.environ.get("OPENCLAW_GATEWAY_PORT") or os.environ.get("CLAWDBOT_GATEWAY_PORT")
        if env_value:
            try:
                return int(env_value)
            except ValueError:
                pass
        gateway = config.get("gateway", {})
        if isinstance(gateway, dict):
            port = gateway.get("port")
            if isinstance(port, int) and port > 0:
                return port
        return _DEFAULT_GATEWAY_PORT

    def _is_manageable_target(self, host: str) -> bool:
        return host in _LOCAL_GATEWAY_HOSTS

    def _ensure_manageable(self, status: dict[str, Any]) -> None:
        if not status.get("manageable"):
            raise RuntimeServiceError(str(status.get("message") or "当前 Gateway 不是本机目标，无法直接管理。"))

    def _build_status_message(
        self,
        *,
        manageable: bool,
        host: str,
        rpc_host: str | None,
        rpc_gateway_url: str,
        running: bool,
        responsive: bool,
    ) -> str | None:
        if not manageable:
            return f"当前运行时 Gateway 目标是 {host}，不是本机地址，面板不能直接启动或停止它。"
        if rpc_host and rpc_host not in _LOCAL_GATEWAY_HOSTS:
            return f"当前 RPC 连接目标是 {rpc_gateway_url}，但运行时管理仍指向本机 Gateway。"
        if running and not responsive:
            return "Gateway 进程存在，但 RPC 探测未通过，可能仍在启动或鉴权配置不匹配。"
        return None

    def _ensure_runtime_config(self) -> dict[str, Any]:
        config_path = self._openclaw_home / "openclaw.json"
        self._openclaw_home.mkdir(parents=True, exist_ok=True)

        if not config_path.exists():
            config = self._default_openclaw_config()
            self._write_runtime_config(config)
            return config

        config = self._read_runtime_config(config_path)
        if config is None:
            backup = self._read_runtime_config(config_path.with_suffix(".json.bak"))
            config = backup if backup is not None else self._default_openclaw_config()
            self._write_runtime_config(config)

        healed, changed = self._heal_runtime_config(config)
        if changed:
            self._write_runtime_config(healed)
        return healed

    def _read_runtime_config(self, path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(loaded, dict):
            return None
        return loaded

    def _write_runtime_config(self, config: dict[str, Any]) -> None:
        config_path = self._openclaw_home / "openclaw.json"
        if config_path.exists():
            shutil.copy2(config_path, config_path.with_suffix(".json.bak"))
        config_path.write_text(
            json.dumps(config, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    def _default_openclaw_config(self) -> dict[str, Any]:
        return {
            "$schema": "https://openclaw.ai/schema/config.json",
            "meta": {"lastTouchedVersion": "2026.1.1"},
            "models": {"providers": {}},
            "gateway": {
                "mode": "local",
                "port": _DEFAULT_GATEWAY_PORT,
                "controlUi": {
                    "allowInsecureAuth": True,
                    "allowedOrigins": list(_DEFAULT_ALLOWED_ORIGINS),
                },
            },
            "tools": {
                "profile": "full",
                "sessions": {"visibility": "all"},
            },
        }

    def _heal_runtime_config(self, config: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        next_config = json.loads(json.dumps(config))
        changed = False

        gateway = next_config.get("gateway")
        if not isinstance(gateway, dict):
            gateway = {}
            next_config["gateway"] = gateway
            changed = True

        legacy_mode = next_config.pop("mode", None)
        if isinstance(legacy_mode, str) and legacy_mode.strip():
            if not isinstance(gateway.get("mode"), str) or not gateway.get("mode"):
                gateway["mode"] = legacy_mode.strip()
                changed = True
            else:
                changed = True

        if not isinstance(gateway.get("mode"), str) or not gateway.get("mode"):
            gateway["mode"] = "local"
            changed = True

        port = gateway.get("port")
        if not isinstance(port, int) or port <= 0:
            gateway["port"] = _DEFAULT_GATEWAY_PORT
            changed = True

        control_ui = gateway.get("controlUi")
        if not isinstance(control_ui, dict):
            control_ui = {}
            gateway["controlUi"] = control_ui
            changed = True

        if control_ui.get("allowInsecureAuth") is not True:
            control_ui["allowInsecureAuth"] = True
            changed = True

        merged_origins = self._merge_allowed_origins(control_ui.get("allowedOrigins"))
        if merged_origins != control_ui.get("allowedOrigins"):
            control_ui["allowedOrigins"] = merged_origins
            changed = True

        legacy_gateway_token = gateway.pop("token", None)
        if isinstance(legacy_gateway_token, str) and legacy_gateway_token.strip():
            auth = gateway.get("auth")
            if not isinstance(auth, dict):
                auth = {}
                gateway["auth"] = auth
            if not isinstance(auth.get("token"), str) or not auth.get("token"):
                auth["token"] = legacy_gateway_token.strip()
            changed = True

        legacy_agent_to_agent = next_config.pop("agentToAgent", None)
        if legacy_agent_to_agent is not None:
            tools = next_config.get("tools")
            if not isinstance(tools, dict):
                tools = {}
                next_config["tools"] = tools
            tools["agentToAgent"] = self._merge_agent_to_agent(
                tools.get("agentToAgent"),
                legacy_agent_to_agent,
            )
            changed = True

        tools = next_config.get("tools")
        if not isinstance(tools, dict):
            tools = {}
            next_config["tools"] = tools
            changed = True

        if not isinstance(tools.get("profile"), str) or not tools.get("profile"):
            tools["profile"] = "full"
            changed = True

        sessions = tools.get("sessions")
        if not isinstance(sessions, dict):
            sessions = {}
            tools["sessions"] = sessions
            changed = True
        if not isinstance(sessions.get("visibility"), str) or not sessions.get("visibility"):
            sessions["visibility"] = "all"
            changed = True

        return next_config, changed

    def _merge_allowed_origins(self, existing: Any) -> list[str]:
        merged: list[str] = []
        if isinstance(existing, list):
            for item in existing:
                if isinstance(item, str) and item not in merged:
                    merged.append(item)
        for origin in _DEFAULT_ALLOWED_ORIGINS:
            if origin not in merged:
                merged.append(origin)
        return merged

    def _merge_agent_to_agent(self, current: Any, legacy: Any) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if isinstance(current, dict):
            result.update(current)
        legacy_dict = legacy if isinstance(legacy, dict) else {}

        allow: list[str] = []
        for source in (legacy_dict.get("allow"), result.get("allow")):
            if isinstance(source, list):
                for item in source:
                    if isinstance(item, str) and item not in allow:
                        allow.append(item)
        if allow:
            result["allow"] = allow

        if "enabled" not in result and isinstance(legacy_dict.get("enabled"), bool):
            result["enabled"] = legacy_dict["enabled"]

        return result

    def _probe_gateway(self, host: str, port: int) -> bool:
        if not self._probe_tcp_port(host, port):
            return False
        return self._probe_gateway_health(host, port)

    def _probe_tcp_port(self, host: str, port: int) -> bool:
        try:
            with socket.create_connection((host, port), timeout=0.35):
                return True
        except OSError:
            return False

    def _probe_gateway_health(self, host: str, port: int) -> bool:
        try:
            from websockets.sync.client import connect
        except ImportError:
            return False

        gateway_url = f"ws://{host}:{port}"
        connect_timeout = 0.6

        try:
            with connect(
                gateway_url,
                open_timeout=connect_timeout,
                close_timeout=connect_timeout,
                max_size=2 * 1024 * 1024,
            ) as websocket:
                connect_id = self._gateway_request_id()
                websocket.send(
                    json.dumps(
                        {
                            "type": "req",
                            "id": connect_id,
                            "method": "connect",
                            "params": self._gateway_connect_params(),
                        },
                        ensure_ascii=False,
                    )
                )
                connect_frame = self._read_gateway_response(
                    websocket,
                    request_id=connect_id,
                    timeout=connect_timeout,
                )
                if connect_frame.get("ok") is not True:
                    return False

                health_id = self._gateway_request_id()
                websocket.send(
                    json.dumps(
                        {
                            "type": "req",
                            "id": health_id,
                            "method": "health",
                            "params": {"probe": True},
                        },
                        ensure_ascii=False,
                    )
                )
                health_frame = self._read_gateway_response(
                    websocket,
                    request_id=health_id,
                    timeout=connect_timeout,
                )
                return health_frame.get("ok") is True
        except Exception:
            return False

    def _gateway_connect_params(self) -> dict[str, Any]:
        params: dict[str, Any] = {
            "minProtocol": _RUNTIME_GATEWAY_PROTOCOL_VERSION,
            "maxProtocol": _RUNTIME_GATEWAY_PROTOCOL_VERSION,
            "client": {
                "id": "openclaw-orchestrator-runtime",
                "displayName": "openclaw-orchestrator-runtime",
                "version": "1.0.0",
                "platform": f"python/{os.name}",
                "mode": "backend",
                "instanceId": self._gateway_request_id(),
            },
            "caps": [],
            "role": "operator",
            "scopes": [
                "operator.admin",
                "operator.approvals",
                "operator.pairing",
            ],
            "userAgent": "openclaw-orchestrator-runtime",
            "locale": "zh-CN",
        }
        auth_token = self._resolve_gateway_auth_token()
        if auth_token:
            params["auth"] = {"token": auth_token}
        return params

    def _resolve_gateway_auth_token(self) -> str | None:
        env_token = os.environ.get("OPENCLAW_GATEWAY_TOKEN") or os.environ.get("GATEWAY_TOKEN")
        if isinstance(env_token, str) and env_token.strip():
            return env_token.strip()

        config = self._ensure_runtime_config()
        gateway_config = config.get("gateway", {})
        if isinstance(gateway_config, dict):
            auth = gateway_config.get("auth", {})
            if isinstance(auth, dict):
                token = auth.get("token")
                if isinstance(token, str) and token.strip():
                    return token.strip()

        connect_config = config.get("connect", {})
        if isinstance(connect_config, dict):
            params = connect_config.get("params", {})
            if isinstance(params, dict):
                auth = params.get("auth", {})
                if isinstance(auth, dict):
                    token = auth.get("token")
                    if isinstance(token, str) and token.strip():
                        return token.strip()

        auth = config.get("auth", {})
        if isinstance(auth, dict):
            token = auth.get("token")
            if isinstance(token, str) and token.strip():
                return token.strip()

        return None

    def _read_gateway_response(self, websocket: Any, *, request_id: str, timeout: float) -> dict[str, Any]:
        deadline = time.time() + timeout
        while time.time() < deadline:
            remaining = max(0.05, deadline - time.time())
            raw = websocket.recv(timeout=remaining)
            frame = self._decode_gateway_frame(raw)
            if frame.get("type") != "res":
                continue
            if str(frame.get("id") or "") != request_id:
                continue
            return frame
        raise TimeoutError(f"Gateway request timed out: {request_id}")

    def _decode_gateway_frame(self, raw: Any) -> dict[str, Any]:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        frame = json.loads(raw)
        if not isinstance(frame, dict):
            raise RuntimeServiceError("Gateway frame is not an object")
        return frame

    def _gateway_request_id(self) -> str:
        return str(uuid.uuid4())

    def _gateway_log_dir(self) -> Path:
        return self._openclaw_home / "logs"

    def _format_gateway_failure(
        self,
        message: str,
        *,
        status: dict[str, Any] | None = None,
    ) -> str:
        parts = [message.strip()]
        log_path = (
            Path(str(status["logFile"]))
            if status and status.get("logFile")
            else self._gateway_log_dir() / "gateway.log"
        )
        error_log_path = (
            Path(str(status["errorLogFile"]))
            if status and status.get("errorLogFile")
            else self._gateway_log_dir() / "gateway.err.log"
        )
        std_log_tail = (status or {}).get("logTail") or self._read_log_tail(log_path)
        log_tail = (status or {}).get("errorLogTail") or self._read_log_tail(error_log_path)
        if std_log_tail:
            parts.append(f"运行日志尾部（{log_path}）\n{std_log_tail}")
        if log_tail:
            parts.append(f"错误日志尾部（{error_log_path}）:\n{log_tail}")
        return "\n\n".join(part for part in parts if part)

    def _read_log_tail(self, path: Path, *, max_lines: int = 20, max_chars: int = 2000) -> str:
        try:
            content = path.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            return ""
        if not content:
            return ""
        lines = content.splitlines()
        tail = "\n".join(lines[-max_lines:]).strip()
        if len(tail) > max_chars:
            tail = tail[-max_chars:].lstrip()
        return tail

    def _detect_openclaw_cli(self) -> str | None:
        env = self._build_env()
        search_path = env.get("PATH")
        if os.name == "nt":
            appdata = os.environ.get("APPDATA")
            if appdata:
                cmd_path = Path(appdata) / "npm" / "openclaw.cmd"
                if cmd_path.exists():
                    return str(cmd_path)
            for name in ("openclaw.cmd", "openclaw"):
                resolved = shutil.which(name, path=search_path)
                if resolved:
                    return resolved
            return None

        resolved = shutil.which("openclaw", path=search_path)
        if resolved:
            return resolved

        for candidate in self._non_windows_cli_candidates():
            if candidate.exists():
                return str(candidate)
        return None

    def _is_cli_installed(self) -> bool:
        if self._detect_openclaw_cli():
            return True
        try:
            result = self._run_openclaw_command("--version", capture_output=True, cli_path="openclaw")
            return result.returncode == 0
        except OSError:
            return False

    def _non_windows_cli_candidates(self) -> list[Path]:
        home = Path.home()
        candidates = [
            Path("/usr/local/bin/openclaw"),
            Path("/usr/bin/openclaw"),
            Path("/snap/bin/openclaw"),
            home / ".local" / "bin" / "openclaw",
            home / ".volta" / "bin" / "openclaw",
            home / ".nodenv" / "shims" / "openclaw",
        ]

        nvm_root = Path(os.environ.get("NVM_DIR") or home / ".nvm")
        nvm_versions = nvm_root / "versions" / "node"
        if nvm_versions.exists():
            candidates.extend(sorted(nvm_versions.glob("*/bin/openclaw")))

        fnm_root = Path(os.environ.get("FNM_DIR") or home / ".local" / "share" / "fnm")
        fnm_versions = fnm_root / "node-versions"
        if fnm_versions.exists():
            candidates.extend(sorted(fnm_versions.glob("*/installation/bin/openclaw")))

        nodejs_lib = Path("/usr/local/lib/nodejs")
        if nodejs_lib.exists():
            candidates.extend(sorted(nodejs_lib.glob("*/bin/openclaw")))

        return candidates

    def _check_gateway_process(self, host: str, port: int) -> dict[str, Any]:
        if not self._is_manageable_target(host):
            return {"running": False, "pid": None, "source": "unmanaged"}
        if os.name == "nt":
            return self._check_windows_gateway_process(host, port)
        if os.uname().sysname.lower() == "linux":
            return self._check_linux_gateway_process(port)
        return self._check_posix_gateway_process(port)

    def _check_windows_gateway_process(self, host: str, port: int) -> dict[str, Any]:
        try:
            result = subprocess.run(
                ["netstat", "-ano", "-p", "tcp"],
                capture_output=True,
                text=True,
                check=False,
                creationflags=_WINDOWS_CREATE_NO_WINDOW,
            )
            output = (result.stdout or "").splitlines()
            local_suffixes = {f":{port}"}
            if host in {"127.0.0.1", "localhost"}:
                local_suffixes.update({f"127.0.0.1:{port}", f"[::1]:{port}"})

            for line in output:
                normalized = line.strip()
                if "LISTENING" not in normalized.upper():
                    continue
                if not any(suffix in normalized for suffix in local_suffixes):
                    continue
                match = re.search(r"LISTENING\s+(\d+)$", normalized, flags=re.IGNORECASE)
                pid = int(match.group(1)) if match else None
                return {"running": True, "pid": pid, "source": "netstat"}
        except OSError:
            pass

        return {
            "running": self._probe_tcp_port(host, port),
            "pid": None,
            "source": "tcp",
        }

    def _check_linux_gateway_process(self, port: int) -> dict[str, Any]:
        try:
            result = subprocess.run(
                ["ss", "-tlnp", f"sport = :{port}"],
                capture_output=True,
                text=True,
                check=False,
            )
            output = (result.stdout or "").strip()
            pid = None
            if output:
                import re

                match = re.search(r"pid=(\d+)", output)
                if match:
                    pid = int(match.group(1))
                if f":{port}" in output:
                    return {"running": True, "pid": pid, "source": "ss"}
        except OSError:
            pass

        try:
            result = subprocess.run(
                ["lsof", "-i", f":{port}", "-t"],
                capture_output=True,
                text=True,
                check=False,
            )
            output = (result.stdout or "").strip()
            if output:
                pid = int(output.splitlines()[0])
                return {"running": True, "pid": pid, "source": "lsof"}
        except (OSError, ValueError):
            pass

        try:
            hex_port = f"{port:04X}"
            tcp = Path("/proc/net/tcp").read_text(encoding="utf-8")
            if f":{hex_port}" in tcp:
                return {"running": True, "pid": None, "source": "proc"}
        except OSError:
            pass

        return {"running": False, "pid": None, "source": "linux"}

    def _check_posix_gateway_process(self, port: int) -> dict[str, Any]:
        try:
            result = subprocess.run(
                ["lsof", "-nP", "-iTCP", f":{port}", "-sTCP:LISTEN", "-t"],
                capture_output=True,
                text=True,
                check=False,
            )
            output = (result.stdout or "").strip()
            if output:
                return {"running": True, "pid": int(output.splitlines()[0]), "source": "lsof"}
        except (OSError, ValueError):
            pass

        try:
            result = subprocess.run(
                ["pgrep", "-f", "openclaw.*gateway"],
                capture_output=True,
                text=True,
                check=False,
            )
            output = (result.stdout or "").strip()
            if output:
                return {"running": True, "pid": int(output.splitlines()[0]), "source": "pgrep"}
        except (OSError, ValueError):
            pass

        return {"running": False, "pid": None, "source": "posix"}

    def _spawn_gateway(self, cli_path: str, stdout_handle: Any, stderr_handle: Any) -> None:
        env = self._build_env()
        command = self._compose_openclaw_command(cli_path, "gateway")
        kwargs: dict[str, Any] = {
            "stdin": subprocess.DEVNULL,
            "stdout": stdout_handle,
            "stderr": stderr_handle,
            "env": env,
            "cwd": str(self._openclaw_home),
        }
        if os.name == "nt":
            kwargs["creationflags"] = _WINDOWS_CREATE_NO_WINDOW | _WINDOWS_DETACHED_PROCESS
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen(command, **kwargs)

    def _run_openclaw_command(
        self,
        *args: str,
        capture_output: bool = False,
        cli_path: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        env = self._build_env()
        resolved_cli = cli_path or self._detect_openclaw_cli() or "openclaw"
        command = self._compose_openclaw_command(resolved_cli, *args)
        kwargs: dict[str, Any] = {
            "env": env,
            "capture_output": capture_output,
            "text": True,
            "check": False,
            "cwd": str(self._openclaw_home),
        }
        if os.name == "nt":
            kwargs["creationflags"] = _WINDOWS_CREATE_NO_WINDOW
        return subprocess.run(command, **kwargs)

    def _compose_openclaw_command(self, cli_path: str, *args: str) -> list[str]:
        if os.name == "nt":
            return ["cmd.exe", "/c", cli_path, *args]
        return [cli_path, *args]

    def _terminate_gateway_process(self, pid: int | None, errors: list[str]) -> None:
        if pid is None:
            return
        try:
            if os.name == "nt":
                result = subprocess.run(
                    ["taskkill", "/F", "/PID", str(pid)],
                    capture_output=True,
                    text=True,
                    check=False,
                    creationflags=_WINDOWS_CREATE_NO_WINDOW,
                )
                if result.returncode != 0:
                    stderr = (result.stderr or result.stdout or "").strip()
                    if stderr:
                        errors.append(stderr)
                return
            os.kill(pid, 15)
        except OSError as exc:
            errors.append(str(exc))

    def _build_env(self) -> dict[str, str]:
        env = os.environ.copy()
        path_entries = [entry for entry in env.get("PATH", "").split(os.pathsep) if entry]

        if os.name == "nt":
            extra_entries = []
            appdata = env.get("APPDATA")
            localappdata = env.get("LOCALAPPDATA")
            if appdata:
                extra_entries.append(str(Path(appdata) / "npm"))
            if localappdata:
                extra_entries.append(str(Path(localappdata) / "Programs" / "nodejs"))
            for entry in reversed(extra_entries):
                if entry and entry not in path_entries:
                    path_entries.insert(0, entry)

        env["PATH"] = os.pathsep.join(path_entries)
        env["OPENCLAW_HOME"] = str(self._openclaw_home)
        return env


runtime_service = RuntimeService()
