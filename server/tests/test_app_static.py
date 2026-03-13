import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator import app as app_module


class FrontendStaticResolutionTests(unittest.TestCase):
    def test_resolve_frontend_dir_falls_back_to_web_dist(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            package_dir = root / 'server' / 'openclaw_orchestrator'
            package_dir.mkdir(parents=True)

            dist_dir = root / 'packages' / 'web' / 'dist'
            dist_dir.mkdir(parents=True)
            (dist_dir / 'index.html').write_text('<!doctype html><title>ok</title>', encoding='utf-8')

            resolved = app_module.resolve_frontend_dir(package_dir)

            self.assertEqual(resolved, dist_dir)

    def test_mount_frontend_serves_index_for_spa_routes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            frontend_dir = Path(temp_dir)
            (frontend_dir / 'index.html').write_text('<!doctype html><title>ok</title>', encoding='utf-8')
            (frontend_dir / 'assets').mkdir()
            (frontend_dir / 'assets' / 'app.js').write_text('console.log("ok")', encoding='utf-8')

            app = FastAPI()
            app_module.mount_frontend(app, frontend_dir)
            client = TestClient(app)

            spa_response = client.get('/workflows')
            self.assertEqual(spa_response.status_code, 200)
            self.assertIn('<title>ok</title>', spa_response.text)

            asset_response = client.get('/assets/app.js')
            self.assertEqual(asset_response.status_code, 200)
            self.assertIn('console.log("ok")', asset_response.text)


if __name__ == '__main__':
    unittest.main()
