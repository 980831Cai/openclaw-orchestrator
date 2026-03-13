import sys
import unittest
from datetime import timedelta, timezone
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.utils.time import utc_now, utc_now_iso


class TimeUtilsTests(unittest.TestCase):
    def test_utc_now_returns_timezone_aware_datetime(self) -> None:
        now = utc_now()

        self.assertIsNotNone(now.tzinfo)
        self.assertEqual(now.utcoffset(), timedelta(0))
        self.assertEqual(now.tzinfo, timezone.utc)

    def test_utc_now_iso_uses_z_suffix(self) -> None:
        timestamp = utc_now_iso()

        self.assertTrue(timestamp.endswith("Z"))
        self.assertNotIn("+00:00", timestamp)
