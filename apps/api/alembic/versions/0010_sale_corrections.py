"""Add append-only sale correction links."""

import sqlalchemy as sa

from alembic import op

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('order_lines') as batch_op:
        batch_op.add_column(sa.Column('modifier_ids', sa.JSON(), nullable=False, server_default='[]'))
    with op.batch_alter_table('refunds') as batch_op:
        batch_op.add_column(sa.Column('kind', sa.String(length=20), nullable=False,
                                      server_default='REFUND'))
        batch_op.create_check_constraint('refund_kind', "kind IN ('REFUND','CORRECTION')")
    op.create_table(
        'sale_corrections',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('original_order_id', sa.String(length=36), nullable=False),
        sa.Column('replacement_order_id', sa.String(length=36), nullable=True),
        sa.Column('business_day_id', sa.String(length=36), nullable=False),
        sa.Column('reason', sa.String(length=300), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('actor_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('PENDING','COMPLETED','LOCKED')"),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id']),
        sa.ForeignKeyConstraint(['business_day_id'], ['business_days.id']),
        sa.ForeignKeyConstraint(['original_order_id'], ['orders.id']),
        sa.ForeignKeyConstraint(['replacement_order_id'], ['orders.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('original_order_id'),
        sa.UniqueConstraint('replacement_order_id'),
    )
    op.create_index('ix_sale_corrections_business_day_id', 'sale_corrections', ['business_day_id'])
    op.create_index('ix_sale_corrections_original_order_id', 'sale_corrections', ['original_order_id'])
    op.create_index('ix_sale_corrections_replacement_order_id', 'sale_corrections', ['replacement_order_id'])


def downgrade():
    raise RuntimeError('Destructive downgrade is disabled. Restore a verified backup instead.')
