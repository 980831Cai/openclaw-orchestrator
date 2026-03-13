import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.config import settings
from openclaw_orchestrator.services.team_service import TeamService


class TeamServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_openclaw_home = settings.openclaw_home

    def tearDown(self) -> None:
        settings.openclaw_home = self._original_openclaw_home

    def test_update_agent_to_agent_config_writes_tools_namespace(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            config_path = Path(temp_dir) / "openclaw.json"
            config_path.write_text(json.dumps({"tools": {"profile": "full"}}), encoding="utf-8")
            service = TeamService()

            with patch.object(
                service,
                "_get_team_members",
                return_value=[
                    {"agentId": "alpha"},
                    {"agentId": "beta"},
                    {"agentId": "gamma"},
                ],
            ):
                service._update_agent_to_agent_config("team-1")

            updated = json.loads(config_path.read_text(encoding="utf-8"))

        self.assertNotIn("agentToAgent", updated)
        self.assertEqual(
            sorted(updated["tools"]["agentToAgent"]["allow"]),
            sorted(
                [
                    "alpha:beta",
                    "alpha:gamma",
                    "beta:alpha",
                    "beta:gamma",
                    "gamma:alpha",
                    "gamma:beta",
                ]
            ),
        )


if __name__ == "__main__":
    unittest.main()
