"""Add the offline-safe reporting outbox and stable store identity."""

from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "sync_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("store_id"),
    )
    op.bulk_insert(
        sa.table(
            "sync_state",
            sa.column("id", sa.Integer()),
            sa.column("store_id", sa.String()),
            sa.column("updated_at", sa.DateTime(timezone=True)),
        ),
        [
            {
                "id": 1,
                "store_id": str(uuid4()),
                "updated_at": datetime.now(timezone.utc),
            }
        ],
    )
    op.create_table(
        "reporting_outbox",
        sa.Column("sequence", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("store_id", sa.String(length=36), nullable=False),
        sa.Column("aggregate_type", sa.String(length=40), nullable=False),
        sa.Column("aggregate_id", sa.String(length=80), nullable=False),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("sequence"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index("ix_reporting_outbox_store_id", "reporting_outbox", ["store_id"])
    op.create_index(
        "ix_reporting_outbox_pending",
        "reporting_outbox",
        ["delivered_at", "available_at", "sequence"],
    )


def downgrade():
    raise RuntimeError(
        "Destructive downgrade is disabled. Restore a verified backup instead."
    )
