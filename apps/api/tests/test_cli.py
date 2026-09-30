import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


OLD_GUIDANCE = {
    'ticket_guidance': 'Tickets use the browser print dialog. A printer problem never removes a completed sale; staff can reprint from Sales.',
    'guide_workflow': 'Open a business day with the counted float. Choose an item, its size, serving and toppings. Take payment, then give the customer their numbered ticket. The preparation team moves the order through New, Preparing, Ready and Served.',
    'guide_controls': 'Press / to search the menu. Use Tab and Shift + Tab to move between controls, Enter or Space to select, and Escape to close a dialog. On a phone, use the floating order button to jump to checkout.',
    'guide_offline': 'After signing in, the cached menu stays available. Cash orders can be saved on this device. Keep the device and browser data until every order has synced; the queue shows any rejection that needs attention. Network payments need a connection.',
    'guide_printing': 'Use the browser print dialog with a 58 or 80 mm receipt printer, or a normal printer. Sales stay saved if printing fails. Use your browser’s zoom and system text settings. Order states have text labels as well as colour.',
}

NEW_GUIDANCE = {
    'ticket_guidance': 'Receipts use the browser print dialog. A printer problem never removes a completed sale; staff can reprint from Sales.',
    'guide_workflow': 'Open a business day with the counted float. Choose each item, size, serving and extras, then take payment. Print or close the customer receipt and begin the next sale. Stock and reports update when the sale is accepted.',
    'guide_controls': 'Press / to search the menu. Use Tab and Shift + Tab to move between controls, Enter or Space to select, and Escape to close a dialog. On a phone, use the floating sale button to jump to checkout.',
    'guide_offline': 'After signing in, the cached menu stays available. Cash sales can be saved on this device. Keep the device and browser data until every sale has synced; rejected sales stay in the sync list for manager review. Mobile money and card payments need a connection.',
    'guide_printing': 'Use the browser print dialog with a 58 or 80 mm receipt printer, or a normal printer. Sales stay saved if printing fails, and receipts can be reprinted from Sales. Use your browser’s zoom and system text settings.',
}

MENU_SALES_GUIDANCE = {
    **NEW_GUIDANCE,
    'guide_workflow': 'Open a business day with the counted float. Choose each item and its customer choices, then take payment. Print or close the receipt and begin the next sale. Reports update when the sale is accepted.',
}


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
        assert db.scalar(text('SELECT COUNT(*) FROM users')) == 3
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
        assert db.scalar(text('SELECT version_num FROM alembic_version')) == '0009'
        assert db.scalar(text('SELECT stand_name FROM stand_settings WHERE id = 1')) == 'Lusaka stand'
        assert db.scalar(text('SELECT tax_id FROM stand_settings WHERE id = 1')) == '1002681530'
        assert db.scalar(text('SELECT tax_label FROM stand_settings WHERE id = 1')) == 'TURNOVER TAX (TOT)'
        assert db.scalar(text('SELECT tax_rate_basis_points FROM stand_settings WHERE id = 1')) == 500
        assert db.scalar(text('SELECT receipt_paper_width FROM stand_settings WHERE id = 1')) == '80mm'
        assert not db.scalar(text("SELECT active FROM variants WHERE id = 'untracked-variant'"))
        assert not db.scalar(text("SELECT active FROM modifiers WHERE id = 'untracked-extra'"))
    checks = {constraint['sqltext'] for constraint in inspect(engine).get_check_constraints('orders')}
    assert any("statusIN('NEW','PREPARING','READY','SERVED')" in check.replace(' ', '') for check in checks)
    assert any('total_ngwee>=0' in check.replace(' ', '') for check in checks)
    with pytest.raises(IntegrityError), engine.begin() as db:
        db.execute(text("UPDATE orders SET cashier_name = NULL WHERE id = 'order-id'"))
    engine.dispose()


@pytest.mark.parametrize('customized', [False, True])
def test_cashier_only_guidance_migration_updates_only_supplied_defaults(tmp_path, customized):
    env = {**os.environ, 'DATABASE_URL': f'sqlite:///{tmp_path}/guidance.db'}
    cwd = Path(__file__).resolve().parents[1]

    def alembic(*arguments):
        return subprocess.run(
            [sys.executable, '-m', 'alembic', *arguments], env=env, cwd=cwd,
            capture_output=True, text=True, timeout=20,
        )

    initial = alembic('upgrade', '0006')
    assert initial.returncode == 0, initial.stderr
    engine = create_engine(env['DATABASE_URL'])
    expected = MENU_SALES_GUIDANCE
    if customized:
        expected = {name: f'Owner wording for {name}' for name in OLD_GUIDANCE}
        with engine.begin() as db:
            db.execute(text(
                'UPDATE stand_settings SET ' + ', '.join(f'{name} = :{name}' for name in expected)
                + ' WHERE id = 1'
            ), expected)

    upgraded = alembic('upgrade', 'head')
    assert upgraded.returncode == 0, upgraded.stderr
    with engine.connect() as db:
        assert db.scalar(text('SELECT version_num FROM alembic_version')) == '0009'
        row = db.execute(text(
            'SELECT ' + ', '.join(OLD_GUIDANCE) + ' FROM stand_settings WHERE id = 1'
        )).mappings().one()
        assert dict(row) == expected
        assert db.scalar(text('SELECT receipt_paper_width FROM stand_settings WHERE id = 1')) == '80mm'
    engine.dispose()


@pytest.mark.parametrize('customized', [False, True])
def test_0009_menu_sales_guidance_preserves_owner_wording(tmp_path, customized):
    env = {**os.environ, 'DATABASE_URL': f'sqlite:///{tmp_path}/menu-guidance.db'}
    cwd = Path(__file__).resolve().parents[1]

    def alembic(*arguments):
        return subprocess.run(
            [sys.executable, '-m', 'alembic', *arguments], env=env, cwd=cwd,
            capture_output=True, text=True, timeout=20,
        )

    initial = alembic('upgrade', '0008')
    assert initial.returncode == 0, initial.stderr
    engine = create_engine(env['DATABASE_URL'])
    previous = {
        'payment_guidance': 'Cash change is calculated at checkout. Staff must confirm mobile money and card payments and record the provider reference before completing a sale.',
        'activity_guidance': 'Review the recorded actions behind sales, payments, stock changes, account administration and cash reconciliation.',
        'guide_workflow': NEW_GUIDANCE['guide_workflow'],
    }
    expected = {
        'payment_guidance': 'Cash change is calculated at checkout. For mobile money or card, select the confirmed payment method to complete the sale.',
        'activity_guidance': 'Review the recorded actions behind sales, payments, account administration and cash reconciliation.',
        'guide_workflow': MENU_SALES_GUIDANCE['guide_workflow'],
    }
    if customized:
        expected = {name: f'Owner wording for {name}' for name in previous}
        with engine.begin() as db:
            db.execute(text(
                'UPDATE stand_settings SET ' + ', '.join(f'{name} = :{name}' for name in expected)
                + ' WHERE id = 1'
            ), expected)

    upgraded = alembic('upgrade', 'head')
    assert upgraded.returncode == 0, upgraded.stderr
    with engine.connect() as db:
        row = db.execute(text(
            'SELECT ' + ', '.join(previous) + ' FROM stand_settings WHERE id = 1'
        )).mappings().one()
        assert dict(row) == expected
    engine.dispose()


def test_0009_preserves_financial_catalog_and_inventory_data(tmp_path):
    env = {**os.environ, 'DATABASE_URL': f'sqlite:///{tmp_path}/menu-sales-upgrade.db'}
    cwd = Path(__file__).resolve().parents[1]

    def alembic(*arguments):
        return subprocess.run(
            [sys.executable, '-m', 'alembic', *arguments], env=env, cwd=cwd,
            capture_output=True, text=True, timeout=20,
        )

    initial = alembic('upgrade', '0008')
    assert initial.returncode == 0, initial.stderr
    engine = create_engine(env['DATABASE_URL'])
    with engine.begin() as db:
        db.execute(text(
            "INSERT INTO users (id, username, name, password_hash, role, active) "
            "VALUES ('owner-id', 'owner', 'Owner', 'unused', 'OWNER_ADMIN', 1)"
        ))
        db.execute(text(
            "INSERT INTO business_days "
            "(id, status, opened_by, opened_at, opening_float_ngwee, next_order_number) "
            "VALUES ('day-id', 'OPEN', 'owner-id', '2026-09-30 08:00:00', 0, 2)"
        ))
        db.execute(text("INSERT INTO categories (id, name) VALUES ('scoops', 'Scooped ice cream')"))
        db.execute(text(
            "INSERT INTO products (id, category_id, name, description, color, active) "
            "VALUES ('single-scoop', 'scoops', 'Single Scoop', '', '#FFFFFF', 1)"
        ))
        db.execute(text(
            "INSERT INTO variants (id, product_id, name, price_ngwee, active) "
            "VALUES ('single-scoop-standard', 'single-scoop', 'Standard', 2500, 1)"
        ))
        db.execute(text(
            "INSERT INTO modifier_groups (id, name, minimum, maximum) "
            "VALUES ('flavour', 'Flavour', 1, 1)"
        ))
        db.execute(text(
            "INSERT INTO modifiers (id, group_id, name, price_ngwee, active) "
            "VALUES ('vanilla', 'flavour', 'Vanilla', 0, 1)"
        ))
        db.execute(text(
            "INSERT INTO inventory_items (id, name, unit, low_stock_threshold) "
            "VALUES ('legacy-stock', 'Legacy stock', 'piece', 2)"
        ))
        db.execute(text(
            "INSERT INTO stock_movements "
            "(id, item_id, type, quantity, reason, actor_id, created_at) "
            "VALUES ('movement-id', 'legacy-stock', 'RECEIPT', 10, 'Opening', 'owner-id', '2026-09-30 08:00:00')"
        ))
        db.execute(text(
            "INSERT INTO orders "
            "(id, number, business_day_id, actor_id, cashier_name, status, total_ngwee, "
            "idempotency_key, payload_hash, offline, created_at) VALUES "
            "('order-id', 'A001', 'day-id', 'owner-id', 'Owner', 'SERVED', 2500, "
            "'existing-sale', 'existing-hash', 0, '2026-09-30 08:30:00')"
        ))
        db.execute(text(
            "INSERT INTO payments "
            "(id, order_id, method, status, amount_ngwee, change_ngwee, provider, reference, "
            "confirmed_by, created_at) VALUES "
            "('payment-id', 'order-id', 'MOBILE_MONEY_MANUAL', 'CONFIRMED', 2500, 0, "
            "'MTN', 'MM-EXISTING', 'owner-id', '2026-09-30 08:30:00')"
        ))
        db.execute(text(
            "INSERT INTO audit_events "
            "(id, actor_id, action, entity, entity_id, details, correlation_id, created_at) "
            "VALUES ('audit-id', 'owner-id', 'ORDER_CREATED', 'order', 'order-id', "
            "'{\"total_ngwee\": 2500}', 'correlation-id', '2026-09-30 08:30:00')"
        ))
        before = {
            table: db.scalar(text(f'SELECT COUNT(*) FROM {table}'))
            for table in ('users', 'orders', 'payments', 'products', 'variants', 'modifiers',
                          'inventory_items', 'stock_movements', 'audit_events')
        }

    upgraded = alembic('upgrade', 'head')
    assert upgraded.returncode == 0, upgraded.stderr
    inspector = inspect(engine)
    with engine.connect() as db:
        assert db.scalar(text('SELECT version_num FROM alembic_version')) == '0009'
        assert db.scalar(text(
            'SELECT inventory_tracking_enabled FROM stand_settings WHERE id = 1'
        )) in (False, 0)
        assert db.execute(text(
            "SELECT minimum, maximum, position FROM product_modifier_groups "
            "WHERE product_id = 'single-scoop' AND group_id = 'flavour'"
        )).one() == (1, 1, 0)
        assert db.execute(text(
            "SELECT provider, reference FROM payments WHERE id = 'payment-id'"
        )).one() == ('MTN', 'MM-EXISTING')
        after = {
            table: db.scalar(text(f'SELECT COUNT(*) FROM {table}'))
            for table in before
        }
        assert after == before
    assert 'unique_external_payment_reference' not in {
        constraint['name'] for constraint in inspector.get_unique_constraints('payments')
    }
    engine.dispose()
