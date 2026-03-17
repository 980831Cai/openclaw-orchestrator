import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.routes.agent_routes import router
from openclaw_orchestrator.services.file_manager import file_manager


class AgentRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._original_openclaw_home = settings.openclaw_home
        settings.openclaw_home = self._temp_dir.name
        self.addCleanup(self._restore_home)

        app = FastAPI()
        app.include_router(router, prefix="/api")
        self.client = TestClient(app)

    def _restore_home(self) -> None:
        settings.openclaw_home = self._original_openclaw_home

    def test_skills_catalog_merges_platform_and_agent_config(self) -> None:
        file_manager.ensure_dir("agents/alpha")
        file_manager.write_json(
            "agents/alpha/skills.json",
            {"skills": ["custom-skill", "web-search"]},
        )
        file_manager.write_json(
            "orchestrator/skill_catalog.json",
            {
                "items": [
                    {
                        "id": "custom-skill",
                        "name": "Custom Skill",
                        "description": "平台新增的技能定义",
                    }
                ]
            },
        )

        response = self.client.get("/api/skills/catalog")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        custom_skill = next(item for item in payload if item["id"] == "custom-skill")
        self.assertEqual(custom_skill["configuredCount"], 1)
        self.assertIn("platform", custom_skill["sources"])
        self.assertIn("agent-config", custom_skill["sources"])
        self.assertEqual(custom_skill["configuredAgents"], ["alpha"])

    def test_plugin_routes_read_and_update_openclaw_config(self) -> None:
        file_manager.ensure_dir("extensions/skillhub")
        file_manager.write_json(
            "extensions/skillhub/openclaw.plugin.json",
            {
                "id": "skillhub",
                "name": "Skillhub Plugin",
                "description": "Plugin for Skillhub",
                "configSchema": {
                    "type": "object",
                    "properties": {
                        "primaryCli": {"type": "string", "description": "primary cli"}
                    },
                },
                "uiHints": {
                    "primaryCli": {"label": "Primary CLI", "help": "Preferred cli"}
                },
            },
        )
        file_manager.write_file(
            "extensions/skillhub/index.ts",
            "export default function register(api) { api.registerTool?.(() => ({}), { names: ['skillhub_search'] }) }",
        )
        file_manager.write_json(
            "openclaw.json",
            {
                "plugins": {
                    "enabled": True,
                    "entries": {
                        "skillhub": {
                            "enabled": False,
                            "config": {"primaryCli": "legacy-skillhub"},
                        }
                    },
                }
            },
        )

        response = self.client.get("/api/openclaw/plugins")
        self.assertEqual(response.status_code, 200)
        plugin = next(item for item in response.json() if item["id"] == "skillhub")
        self.assertEqual(plugin["kind"], "tool")
        self.assertFalse(plugin["enabled"])
        self.assertEqual(plugin["config"]["primaryCli"], "legacy-skillhub")
        self.assertEqual(plugin["fields"][0]["label"], "Primary CLI")

        update_response = self.client.put(
            "/api/openclaw/plugins/skillhub",
            json={"enabled": True, "config": {"primaryCli": "skillhub"}},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertTrue(update_response.json()["enabled"])
        self.assertEqual(update_response.json()["config"]["primaryCli"], "skillhub")

        openclaw_config = file_manager.read_json("openclaw.json")
        self.assertTrue(openclaw_config["plugins"]["entries"]["skillhub"]["enabled"])
        self.assertEqual(
            openclaw_config["plugins"]["entries"]["skillhub"]["config"]["primaryCli"],
            "skillhub",
        )


if __name__ == "__main__":
    unittest.main()
