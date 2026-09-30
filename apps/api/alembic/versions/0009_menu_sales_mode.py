"""Add menu-and-sales mode and product-specific choice assignments."""

import sqlalchemy as sa
from alembic import op

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'stand_settings',
        sa.Column('inventory_tracking_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        'product_modifier_groups',
        sa.Column('product_id', sa.String(length=60), nullable=False),
        sa.Column('group_id', sa.String(length=60), nullable=False),
        sa.Column('minimum', sa.Integer(), nullable=False),
        sa.Column('maximum', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.CheckConstraint('minimum >= 0'),
        sa.CheckConstraint('maximum >= minimum'),
        sa.CheckConstraint('maximum <= 20'),
        sa.CheckConstraint('position >= 0'),
        sa.ForeignKeyConstraint(['group_id'], ['modifier_groups.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('product_id', 'group_id'),
    )
    op.execute(sa.text(
        'INSERT INTO product_modifier_groups '
        '(product_id, group_id, minimum, maximum, position) '
        'SELECT products.id, modifier_groups.id, modifier_groups.minimum, '
        'modifier_groups.maximum, 0 FROM products CROSS JOIN modifier_groups'
    ))
    with op.batch_alter_table('payments') as batch_op:
        batch_op.drop_constraint('unique_external_payment_reference', type_='unique')


def downgrade():
    raise RuntimeError(
        'Destructive downgrade is disabled. Restore a verified backup instead.'
    )
