"""Add simple stock item setup and inventory activation boundary."""

import sqlalchemy as sa

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    # Plain ADD COLUMN keeps SQLite from recreating inventory_items while
    # stock_movements still references it. Input validation enforces positive
    # pack sizes in every supported database.
    op.add_column(
        "inventory_items", sa.Column("pack_name", sa.String(length=40), nullable=True)
    )
    op.add_column(
        "inventory_items",
        sa.Column(
            "units_per_pack", sa.Numeric(16, 3), nullable=False, server_default="1"
        ),
    )
    op.add_column(
        "inventory_items",
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "stand_settings",
        sa.Column(
            "inventory_tracking_started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        )
    )


def downgrade():
    raise RuntimeError(
        "Destructive downgrade is disabled. Restore a verified backup instead."
    )
