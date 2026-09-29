"""Add the configured thermal receipt paper width."""
import sqlalchemy as sa

from alembic import op

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'stand_settings',
        sa.Column('receipt_paper_width', sa.String(length=4), nullable=False, server_default='80mm'),
    )


def downgrade():
    op.drop_column('stand_settings', 'receipt_paper_width')
