"""Add editable receipt identity and tax details."""
import sqlalchemy as sa

from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stand_settings', sa.Column(
        'tax_id', sa.String(length=40), nullable=False, server_default='1002681530'))
    op.add_column('stand_settings', sa.Column(
        'contact_number', sa.String(length=40), nullable=False, server_default='0771450074'))
    op.add_column('stand_settings', sa.Column(
        'tax_label', sa.String(length=80), nullable=False, server_default='STANDARD RATED (A)'))
    op.add_column('stand_settings', sa.Column(
        'tax_rate_basis_points', sa.Integer(), nullable=False, server_default='1600'))
    op.execute(sa.text(
        "UPDATE stand_settings SET business_name = 'CREAMY HEAVEN LIMITED' "
        "WHERE business_name = 'Happy Cone Ice Cream'"
    ))


def downgrade():
    op.drop_column('stand_settings', 'tax_rate_basis_points')
    op.drop_column('stand_settings', 'tax_label')
    op.drop_column('stand_settings', 'contact_number')
    op.drop_column('stand_settings', 'tax_id')
