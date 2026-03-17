from __future__ import annotations

import os
import re
from typing import Any

from openclaw_orchestrator.services.file_manager import file_manager

SKILL_CATALOG_PATH = "orchestrator/skill_catalog.json"
PLUGIN_MANIFEST_CANDIDATES = ("openclaw.plugin.json", "moltbot.plugin.json")
PLUGIN_SOURCE_CANDIDATES = (
    "index.ts",
    "index.js",
    "src/index.ts",
    "src/index.js",
    "src/tools.ts",
    "src/tools.js",
    "tools.ts",
    "tools.js",
)

BUILTIN_SKILLS = [
    {"id": "web-search", "name": "Web Search", "description": "搜索互联网获取实时信息"},
    {"id": "code-review", "name": "Code Review", "description": "审查代码质量和安全性"},
    {"id": "file-editor", "name": "File Editor", "description": "读写和编辑文件"},
    {"id": "terminal", "name": "Terminal", "description": "执行终端命令"},
    {"id": "image-gen", "name": "Image Gen", "description": "生成和编辑图像"},
    {"id": "data-analysis", "name": "Data Analysis", "description": "分析和可视化数据"},
    {"id": "api-caller", "name": "API Caller", "description": "调用外部 API 接口"},
    {"id": "doc-writer", "name": "Doc Writer", "description": "生成文档和报告"},
]


class OpenClawCatalogService:
    def list_skill_catalog(self) -> list[dict[str, Any]]:
        catalog: dict[str, dict[str, Any]] = {}

        for item in BUILTIN_SKILLS:
            self._merge_skill_entry(catalog, item, source="builtin")

        for item in self._read_skill_catalog_store():
            self._merge_skill_entry(catalog, item, source="platform")

        for agent_id in file_manager.list_agent_dirs():
            for skill_id in self._read_agent_skills(agent_id):
                entry = self._merge_skill_entry(
                    catalog,
                    {
                        "id": skill_id,
                        "name": self._humanize_identifier(skill_id),
                        "description": "已在 OpenClaw Agent 配置中发现",
                    },
                    source="agent-config",
                )
                configured_agents = entry.setdefault("configuredAgents", [])
                if agent_id not in configured_agents:
                    configured_agents.append(agent_id)
                entry["configuredCount"] = len(configured_agents)

        return sorted(
            catalog.values(),
            key=lambda item: (-item["configuredCount"], item["name"].lower(), item["id"]),
        )

    def upsert_skill_catalog_item(self, item: dict[str, Any]) -> dict[str, Any]:
        skill_id = self._normalize_identifier(item.get("id"))
        if not skill_id:
            raise ValueError("Skill id is required")

        skill_name = str(item.get("name") or "").strip() or self._humanize_identifier(skill_id)
        skill_description = str(item.get("description") or "").strip()

        stored_items = self._read_skill_catalog_store()
        next_items: list[dict[str, str]] = []
        found = False
        for existing in stored_items:
            if self._normalize_identifier(existing.get("id")) == skill_id:
                next_items.append(
                    {
                        "id": skill_id,
                        "name": skill_name,
                        "description": skill_description,
                    }
                )
                found = True
            else:
                next_items.append(existing)

        if not found:
            next_items.append(
                {
                    "id": skill_id,
                    "name": skill_name,
                    "description": skill_description,
                }
            )

        file_manager.write_json(SKILL_CATALOG_PATH, {"items": next_items})
        return {
            "id": skill_id,
            "name": skill_name,
            "description": skill_description,
            "configuredCount": 0,
            "configuredAgents": [],
            "sources": ["platform"],
        }

    def list_plugins(self) -> list[dict[str, Any]]:
        openclaw_config = self._read_openclaw_config()
        plugins_root = openclaw_config.get("plugins", {}) if isinstance(openclaw_config.get("plugins"), dict) else {}
        plugin_entries = plugins_root.get("entries", {}) if isinstance(plugins_root.get("entries"), dict) else {}
        discovered: dict[str, dict[str, Any]] = {}

        for extension_dir in self._list_extension_dirs():
            manifest_path = self._find_plugin_manifest(extension_dir)
            manifest = file_manager.read_json(manifest_path) if manifest_path else {}
            plugin_id = str(manifest.get("id") or extension_dir).strip()
            configured = plugin_entries.get(plugin_id, {}) if isinstance(plugin_entries.get(plugin_id), dict) else {}
            discovered[plugin_id] = {
                "id": plugin_id,
                "name": str(manifest.get("name") or plugin_id),
                "description": str(manifest.get("description") or "").strip(),
                "kind": self._guess_plugin_kind(extension_dir, manifest),
                "installed": True,
                "enabled": bool(configured.get("enabled", plugins_root.get("enabled", True))),
                "manifestPath": manifest_path,
                "config": configured.get("config", {}) if isinstance(configured.get("config"), dict) else {},
                "fields": self._build_plugin_fields(manifest),
                "restartRequired": True,
            }

        for plugin_id, configured in plugin_entries.items():
            if plugin_id in discovered or not isinstance(configured, dict):
                continue
            discovered[plugin_id] = {
                "id": plugin_id,
                "name": plugin_id,
                "description": "已在 openclaw.json 中配置，但当前未发现插件清单。",
                "kind": "plugin",
                "installed": False,
                "enabled": bool(configured.get("enabled", plugins_root.get("enabled", True))),
                "manifestPath": None,
                "config": configured.get("config", {}) if isinstance(configured.get("config"), dict) else {},
                "fields": [],
                "restartRequired": True,
            }

        return sorted(discovered.values(), key=lambda item: (item["kind"], item["name"].lower(), item["id"]))

    def update_plugin(self, plugin_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        normalized_plugin_id = str(plugin_id or "").strip()
        if not normalized_plugin_id:
            raise ValueError("Plugin id is required")

        openclaw_config = self._read_openclaw_config()
        plugins_root = openclaw_config.setdefault("plugins", {})
        if not isinstance(plugins_root, dict):
            plugins_root = {}
            openclaw_config["plugins"] = plugins_root

        plugins_root.setdefault("enabled", True)
        plugin_entries = plugins_root.setdefault("entries", {})
        if not isinstance(plugin_entries, dict):
            plugin_entries = {}
            plugins_root["entries"] = plugin_entries

        plugin_entry = plugin_entries.setdefault(normalized_plugin_id, {})
        if not isinstance(plugin_entry, dict):
            plugin_entry = {}
            plugin_entries[normalized_plugin_id] = plugin_entry

        if "enabled" in updates and updates["enabled"] is not None:
            plugin_entry["enabled"] = bool(updates["enabled"])

        if "config" in updates and updates["config"] is not None:
            if not isinstance(updates["config"], dict):
                raise ValueError("Plugin config must be an object")
            plugin_entry["config"] = updates["config"]

        file_manager.write_json("openclaw.json", openclaw_config)
        plugin = next((item for item in self.list_plugins() if item["id"] == normalized_plugin_id), None)
        if plugin is None:
            raise ValueError(f"Plugin not found: {normalized_plugin_id}")
        return plugin

    def _merge_skill_entry(
        self,
        catalog: dict[str, dict[str, Any]],
        item: dict[str, Any],
        *,
        source: str,
    ) -> dict[str, Any]:
        skill_id = self._normalize_identifier(item.get("id"))
        if not skill_id:
            raise ValueError("Skill id is required")

        existing = catalog.setdefault(
            skill_id,
            {
                "id": skill_id,
                "name": str(item.get("name") or self._humanize_identifier(skill_id)),
                "description": str(item.get("description") or "").strip(),
                "configuredCount": 0,
                "configuredAgents": [],
                "sources": [],
            },
        )
        if not existing.get("name") and item.get("name"):
            existing["name"] = str(item["name"])
        if (not existing.get("description")) and item.get("description"):
            existing["description"] = str(item["description"])
        if source not in existing["sources"]:
            existing["sources"].append(source)
        return existing

    def _read_skill_catalog_store(self) -> list[dict[str, str]]:
        if not file_manager.file_exists(SKILL_CATALOG_PATH):
            return []
        payload = file_manager.read_json(SKILL_CATALOG_PATH)
        items = payload.get("items", []) if isinstance(payload, dict) else []
        return [item for item in items if isinstance(item, dict)]

    def _read_agent_skills(self, agent_id: str) -> list[str]:
        skill_path = os.path.join("agents", agent_id, "skills.json")
        if not file_manager.file_exists(skill_path):
            return []
        payload = file_manager.read_json(skill_path)
        skills = payload.get("skills", []) if isinstance(payload, dict) else []
        return [str(skill).strip() for skill in skills if str(skill).strip()]

    def _list_extension_dirs(self) -> list[str]:
        return [
            entry
            for entry in file_manager.list_dir("extensions")
            if file_manager.is_directory(os.path.join("extensions", entry))
        ]

    def _find_plugin_manifest(self, extension_dir: str) -> str | None:
        for candidate in PLUGIN_MANIFEST_CANDIDATES:
            relative_path = os.path.join("extensions", extension_dir, candidate)
            if file_manager.file_exists(relative_path):
                return relative_path
        return None

    def _build_plugin_fields(self, manifest: dict[str, Any]) -> list[dict[str, Any]]:
        config_schema = manifest.get("configSchema", {}) if isinstance(manifest, dict) else {}
        properties = config_schema.get("properties", {}) if isinstance(config_schema, dict) else {}
        required_fields = config_schema.get("required", []) if isinstance(config_schema, dict) else []
        ui_hints = manifest.get("uiHints", {}) if isinstance(manifest.get("uiHints"), dict) else {}
        fields: list[dict[str, Any]] = []

        for key, schema in properties.items():
            if not isinstance(schema, dict):
                continue
            hint = ui_hints.get(key, {}) if isinstance(ui_hints.get(key), dict) else {}
            fields.append(
                {
                    "key": key,
                    "type": str(schema.get("type") or "string"),
                    "label": str(hint.get("label") or key),
                    "description": str(hint.get("help") or schema.get("description") or "").strip(),
                    "required": key in required_fields,
                }
            )
        return fields

    def _guess_plugin_kind(self, extension_dir: str, manifest: dict[str, Any]) -> str:
        text = " ".join(
            [
                str(manifest.get("id") or ""),
                str(manifest.get("name") or ""),
                str(manifest.get("description") or ""),
            ]
        ).lower()
        if "mcp" in text:
            return "mcp"
        if "tool" in text:
            return "tool"
        if self._plugin_registers_tools(extension_dir):
            return "tool"
        return "plugin"

    def _plugin_registers_tools(self, extension_dir: str) -> bool:
        for candidate in PLUGIN_SOURCE_CANDIDATES:
            relative_path = os.path.join("extensions", extension_dir, candidate)
            if not file_manager.file_exists(relative_path):
                continue
            content = file_manager.read_file(relative_path)
            if "registerTool" in content:
                return True
        return False

    def _read_openclaw_config(self) -> dict[str, Any]:
        if not file_manager.file_exists("openclaw.json"):
            return {}
        payload = file_manager.read_json("openclaw.json")
        return payload if isinstance(payload, dict) else {}

    def _normalize_identifier(self, value: Any) -> str:
        return re.sub(r"\s+", "-", str(value or "").strip()).strip("-")

    def _humanize_identifier(self, value: str) -> str:
        parts = [segment for segment in re.split(r"[-_]+", value.strip()) if segment]
        return " ".join(part.capitalize() for part in parts) or value


openclaw_catalog_service = OpenClawCatalogService()
