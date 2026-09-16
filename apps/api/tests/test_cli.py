import os
import subprocess
import sys
from pathlib import Path
from sqlalchemy import create_engine, inspect, text


def test_migrate_is_repeatable_and_seed_explicit(tmp_path):
    env = {**os.environ, 'DATABASE_URL':f'sqlite:///{tmp_path}/cli.db', 'SEED_PASSWORD':'safe-test-password'}
    cwd = Path(__file__).resolve().parents[1]
    def cli(*arguments, command_env=None):
        return subprocess.run([sys.executable,'-m','app.cli',*arguments],env=command_env or env,cwd=cwd,capture_output=True,text=True,timeout=20)
    migrated = cli('migrate')
    assert migrated.returncode == 0, migrated.stderr
    assert cli('migrate').returncode == 0
    engine = create_engine(env['DATABASE_URL'])
    with engine.connect() as db:
        assert db.scalar(text('SELECT COUNT(*) FROM users')) == 0
        assert db.scalar(text('SELECT COUNT(*) FROM branch_lock')) == 1
    assert cli('seed').returncode != 0
    assert cli('seed','--password-env','SEED_PASSWORD').returncode == 0
    assert cli('seed','--password-env','SEED_PASSWORD').returncode == 0
    with engine.connect() as db:
        assert db.scalar(text('SELECT COUNT(*) FROM users')) == 4
        assert db.scalar(text('SELECT COUNT(*) FROM stock_movements')) == 9
        assert db.scalar(text('SELECT COUNT(*) FROM business_days')) == 0
        assert 'alembic_version' in inspect(db).get_table_names()
    engine.dispose()


def test_create_user_does_not_seed_demo_inventory(tmp_path):
    env = {**os.environ,'DATABASE_URL':f'sqlite:///{tmp_path}/bootstrap.db','ADMIN_PASSWORD':'safe-admin-password','APP_ENV':'test'}
    cwd = Path(__file__).resolve().parents[1]
    def cli(*arguments, command_env=None):
        return subprocess.run([sys.executable,'-m','app.cli',*arguments],env=command_env or env,cwd=cwd,capture_output=True,text=True,timeout=20)
    assert cli('migrate').returncode == 0
    arguments = ('create-user','--username','operator','--name','Stand Owner','--role','OWNER_ADMIN','--password-env','ADMIN_PASSWORD')
    result = cli(*arguments)
    assert result.returncode == 0, result.stderr
    assert cli(*arguments).returncode != 0
    production_env = {
        **env,
        'APP_ENV': 'production',
        'DATABASE_URL': 'postgresql+psycopg://user:pass@db/happycone',
        'ALLOWED_HOSTS': '["pos.happycone.example"]',
        'CORS_ORIGINS': '[]',
    }
    assert cli('seed','--password-env','ADMIN_PASSWORD',command_env=production_env).returncode != 0
    engine = create_engine(env['DATABASE_URL'])
    with engine.connect() as db:
        assert db.scalar(text('SELECT COUNT(*) FROM users')) == 1
        assert db.scalar(text('SELECT COUNT(*) FROM stock_movements')) == 0
        assert db.scalar(text('SELECT COUNT(*) FROM products')) == 0
        assert db.scalar(text("SELECT COUNT(*) FROM audit_events WHERE action = 'USER_CREATED'")) == 1
    engine.dispose()
