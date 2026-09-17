import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


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


@pytest.mark.parametrize('partial_upgrade', [False, True])
def test_cashier_name_migration_backfills_populated_database_and_retries(tmp_path, partial_upgrade):
    env = {**os.environ, 'DATABASE_URL': f'sqlite:///{tmp_path}/upgrade.db'}
    cwd = Path(__file__).resolve().parents[1]

    def alembic(*arguments):
        return subprocess.run(
            [sys.executable, '-m', 'alembic', *arguments],
            env=env,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=20,
        )

    initial = alembic('upgrade', '0001')
    assert initial.returncode == 0, initial.stderr
    engine = create_engine(env['DATABASE_URL'])
    with engine.begin() as db:
        db.execute(text(
            "INSERT INTO users (id, username, name, password_hash, role, active) "
            "VALUES ('cashier-id', 'cashier', 'Original Cashier', 'unused', 'CASHIER', 1)"
        ))
        db.execute(text(
            "INSERT INTO business_days "
            "(id, status, opened_by, opened_at, opening_float_ngwee, next_order_number) "
            "VALUES ('day-id', 'OPEN', 'cashier-id', '2026-09-17 08:00:00', 0, 2)"
        ))
        db.execute(text(
            "INSERT INTO orders "
            "(id, number, business_day_id, actor_id, status, total_ngwee, idempotency_key, "
            "payload_hash, offline, created_at) VALUES "
            "('order-id', 'A001', 'day-id', 'cashier-id', 'NEW', 2800, 'legacy-key', "
            "'legacy-hash', 0, '2026-09-17 08:30:00')"
        ))
        db.execute(text(
            "INSERT INTO payments "
            "(id, order_id, method, status, amount_ngwee, tendered_ngwee, change_ngwee, "
            "confirmed_by, created_at) VALUES "
            "('payment-id', 'order-id', 'CASH', 'CONFIRMED', 2800, 3000, 200, "
            "'cashier-id', '2026-09-17 08:30:00')"
        ))
        db.execute(text("INSERT INTO categories (id, name) VALUES ('test', 'Test')"))
        db.execute(text(
            "INSERT INTO products (id, category_id, name, description, color, active) "
            "VALUES ('untracked-product', 'test', 'Untracked', '', '#FFFFFF', 1)"
        ))
        db.execute(text(
            "INSERT INTO variants (id, product_id, name, price_ngwee, active) "
            "VALUES ('untracked-variant', 'untracked-product', 'Untracked size', 1000, 1)"
        ))
        db.execute(text(
            "INSERT INTO modifier_groups (id, name, minimum, maximum) "
            "VALUES ('test-options', 'Test options', 0, 1)"
        ))
        db.execute(text(
            "INSERT INTO modifiers (id, group_id, name, price_ngwee, active) "
            "VALUES ('untracked-extra', 'test-options', 'Untracked extra', 100, 1)"
        ))
        if partial_upgrade:
            db.execute(text('ALTER TABLE orders ADD COLUMN cashier_name VARCHAR(120)'))
            db.execute(text(
                "UPDATE orders SET cashier_name = "
                "(SELECT users.name FROM users WHERE users.id = orders.actor_id)"
            ))
    upgraded = alembic('upgrade', 'head')
    assert upgraded.returncode == 0, upgraded.stderr
    with engine.connect() as db:
        assert db.scalar(text("SELECT cashier_name FROM orders WHERE id = 'order-id'")) == 'Original Cashier'
        assert db.scalar(text('SELECT version_num FROM alembic_version')) == '0006'
        assert db.scalar(text('SELECT stand_name FROM stand_settings WHERE id = 1')) == 'Lusaka stand'
        assert db.scalar(text('SELECT tax_id FROM stand_settings WHERE id = 1')) == '1002681530'
        assert db.scalar(text('SELECT tax_label FROM stand_settings WHERE id = 1')) == 'TURNOVER TAX (TOT)'
        assert db.scalar(text('SELECT tax_rate_basis_points FROM stand_settings WHERE id = 1')) == 500
        assert not db.scalar(text("SELECT active FROM variants WHERE id = 'untracked-variant'"))
        assert not db.scalar(text("SELECT active FROM modifiers WHERE id = 'untracked-extra'"))
    checks = {constraint['sqltext'] for constraint in inspect(engine).get_check_constraints('orders')}
    assert any("statusIN('NEW','PREPARING','READY','SERVED')" in check.replace(' ', '') for check in checks)
    assert any('total_ngwee>=0' in check.replace(' ', '') for check in checks)
    with pytest.raises(IntegrityError), engine.begin() as db:
        db.execute(text("UPDATE orders SET cashier_name = NULL WHERE id = 'order-id'"))
    engine.dispose()
