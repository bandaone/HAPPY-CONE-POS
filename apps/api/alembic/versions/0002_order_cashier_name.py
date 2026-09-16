"""Snapshot the cashier display name on completed orders."""

import sqlalchemy as sa

from alembic import op

revision = '0002_order_cashier_name'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {column['name'] for column in sa.inspect(bind).get_columns('orders')}
    if 'cashier_name' not in columns:
        op.add_column('orders', sa.Column('cashier_name', sa.String(length=120), nullable=True))
    op.execute(sa.text(
        'UPDATE orders SET cashier_name = '
        '(SELECT users.name FROM users WHERE users.id = orders.actor_id) '
        'WHERE cashier_name IS NULL'
    ))
    if bind.dialect.name == 'sqlite':
        # Rebuilding a populated SQLite table fails while payments and order lines
        # reference it. Triggers preserve the same non-null invariant without
        # replacing permanent sale history.
        op.execute(sa.text('''
            CREATE TRIGGER IF NOT EXISTS orders_cashier_name_required_insert
            BEFORE INSERT ON orders
            FOR EACH ROW WHEN NEW.cashier_name IS NULL
            BEGIN
                SELECT RAISE(ABORT, 'orders.cashier_name may not be null');
            END
        '''))
        op.execute(sa.text('''
            CREATE TRIGGER IF NOT EXISTS orders_cashier_name_required_update
            BEFORE UPDATE OF cashier_name ON orders
            FOR EACH ROW WHEN NEW.cashier_name IS NULL
            BEGIN
                SELECT RAISE(ABORT, 'orders.cashier_name may not be null');
            END
        '''))
    else:
        op.alter_column(
            'orders',
            'cashier_name',
            existing_type=sa.String(length=120),
            nullable=False,
        )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        op.execute(sa.text('DROP TRIGGER IF EXISTS orders_cashier_name_required_insert'))
        op.execute(sa.text('DROP TRIGGER IF EXISTS orders_cashier_name_required_update'))
    op.drop_column('orders', 'cashier_name')
