"""Snapshot the cashier display name on completed orders."""

from alembic import op
import sqlalchemy as sa


revision = '0002_order_cashier_name'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('orders', sa.Column('cashier_name', sa.String(length=120), nullable=True))
    op.execute(sa.text(
        'UPDATE orders SET cashier_name = '
        '(SELECT users.name FROM users WHERE users.id = orders.actor_id)'
    ))
    with op.batch_alter_table('orders') as batch:
        batch.alter_column('cashier_name', existing_type=sa.String(length=120), nullable=False)


def downgrade():
    with op.batch_alter_table('orders') as batch:
        batch.drop_column('cashier_name')
