"""create vnstat_daily_traffic

Revision ID: 0001
Revises:
Create Date: 2026-10-12
"""
import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vnstat_daily_traffic",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("hostname", sa.String(253), nullable=False),
        sa.Column("source_ip", sa.String(45), nullable=False),
        sa.Column("interface", sa.String(64), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("rx_bytes", sa.BigInteger(), nullable=False),
        sa.Column("tx_bytes", sa.BigInteger(), nullable=False),
        sa.Column("total_bytes", sa.BigInteger(), nullable=False),
        sa.Column("avg_rate_bps", sa.BigInteger(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("hostname", "interface", "day", name="uq_vnstat_daily_traffic_key"),
    )
    op.create_index("ix_vnstat_daily_traffic_day", "vnstat_daily_traffic", ["day"])


def downgrade() -> None:
    op.drop_index("ix_vnstat_daily_traffic_day", table_name="vnstat_daily_traffic")
    op.drop_table("vnstat_daily_traffic")
