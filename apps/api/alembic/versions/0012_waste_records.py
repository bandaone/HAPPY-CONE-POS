"""Add immutable waste records with selling-price value."""

import sqlalchemy as sa

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "waste_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_day_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("label", sa.String(length=180), nullable=False),
        sa.Column("variant_id", sa.String(length=60), nullable=True),
        sa.Column("modifier_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("item_id", sa.String(length=60), nullable=True),
        sa.Column("quantity", sa.Numeric(16, 3), nullable=False),
        sa.Column("reason", sa.String(length=30), nullable=False),
        sa.Column("comment", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("value_ngwee", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('PREPARED','INGREDIENT')"),
        sa.CheckConstraint("quantity > 0"),
        sa.CheckConstraint("value_ngwee >= 0"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["business_day_id"], ["business_days.id"]),
        sa.ForeignKeyConstraint(["item_id"], ["inventory_items.id"]),
        sa.ForeignKeyConstraint(["variant_id"], ["variants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_waste_records_business_day_id", "waste_records", ["business_day_id"]
    )


def downgrade():
    raise RuntimeError(
        "Destructive downgrade is disabled. Restore a verified backup instead."
    )
