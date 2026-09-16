"""Disposable API for browser tests. Never connects to the configured business DB."""
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'api'))
import uvicorn
from app.core.config import Settings
from app.core.integrity import install_integrity_guards
from app.main import create_app
from app.models.base import Base, BranchLock
from app.seed import seed_demo

with tempfile.TemporaryDirectory(prefix='happy-cone-browser-test-') as directory:
    api = create_app(Settings(database_url=f'sqlite:///{directory}/browser.db'), initialize=True)
    with api.state.session_factory() as database:
        seed_demo(database, 'browser-test-password')
        database.commit()

    @api.post('/__test/reset')
    def reset_browser_database():
        """Reset only the temporary database owned by this browser-test process."""
        Base.metadata.drop_all(api.state.engine)
        Base.metadata.create_all(api.state.engine)
        with api.state.engine.begin() as connection:
            install_integrity_guards(connection)
        with api.state.session_factory() as database:
            database.add(BranchLock(id=1, revision=0))
            seed_demo(database, 'browser-test-password')
            database.commit()
        return {'status': 'reset'}

    try:
        uvicorn.run(api, host='127.0.0.1', port=8001)
    finally:
        api.state.engine.dispose()
