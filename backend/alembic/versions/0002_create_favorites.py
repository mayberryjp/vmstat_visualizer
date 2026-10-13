"""create vnstat_favorites

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-13
"""
import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vnstat_favorites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("hostname", sa.String(253), nullable=False),
        sa.Column("interface", sa.String(64), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("hostname", "interface", name="uq_vnstat_favorites_key"),
    )


def downgrade() -> None:
    op.drop_table("vnstat_favorites")
