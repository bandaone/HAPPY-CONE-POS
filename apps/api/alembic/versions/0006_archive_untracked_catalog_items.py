"""Archive sellable catalog items that have no stock recipe."""
import sqlalchemy as sa

from alembic import op

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text(
        "UPDATE variants SET active = false "
        "WHERE active = true AND NOT EXISTS ("
        "SELECT 1 FROM recipe_components WHERE recipe_components.variant_id = variants.id)"
    ))
    op.execute(sa.text(
        "UPDATE modifiers SET active = false "
        "WHERE active = true AND NOT EXISTS ("
        "SELECT 1 FROM recipe_components WHERE recipe_components.modifier_id = modifiers.id)"
    ))


def downgrade():
    # Earlier availability cannot be reconstructed safely after the data correction.
    pass
