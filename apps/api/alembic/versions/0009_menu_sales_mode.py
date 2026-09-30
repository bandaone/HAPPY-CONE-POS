"""Add menu-and-sales mode and product-specific choice assignments."""

import sqlalchemy as sa
from alembic import op

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


GUIDANCE = {
    'payment_guidance': (
        'Cash change is calculated at checkout. Staff must confirm mobile money and card payments and record the provider reference before completing a sale.',
        'Cash change is calculated at checkout. For mobile money or card, select the confirmed payment method to complete the sale.',
    ),
    'activity_guidance': (
        'Review the recorded actions behind sales, payments, stock changes, account administration and cash reconciliation.',
        'Review the recorded actions behind sales, payments, account administration and cash reconciliation.',
    ),
    'guide_workflow': (
        'Open a business day with the counted float. Choose each item, size, serving and extras, then take payment. Print or close the customer receipt and begin the next sale. Stock and reports update when the sale is accepted.',
        'Open a business day with the counted float. Choose each item and its customer choices, then take payment. Print or close the receipt and begin the next sale. Reports update when the sale is accepted.',
    ),
}


def _replace_supplied_guidance(source_index, target_index):
    for column, values in GUIDANCE.items():
        op.execute(sa.text(
            f'UPDATE stand_settings SET {column} = :replacement WHERE {column} = :existing'
        ).bindparams(existing=values[source_index], replacement=values[target_index]))


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
    _replace_supplied_guidance(0, 1)


def downgrade():
    raise RuntimeError(
        'Destructive downgrade is disabled. Restore a verified backup instead.'
    )
