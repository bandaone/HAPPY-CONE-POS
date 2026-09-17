"""Correct receipt tax defaults to Turnover Tax."""
import sqlalchemy as sa

from alembic import op

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text(
        "UPDATE stand_settings "
        "SET tax_label = 'TURNOVER TAX (TOT)', tax_rate_basis_points = 500 "
        "WHERE tax_label = 'STANDARD RATED (A)' AND tax_rate_basis_points = 1600"
    ))


def downgrade():
    op.execute(sa.text(
        "UPDATE stand_settings "
        "SET tax_label = 'STANDARD RATED (A)', tax_rate_basis_points = 1600 "
        "WHERE tax_label = 'TURNOVER TAX (TOT)' AND tax_rate_basis_points = 500"
    ))
