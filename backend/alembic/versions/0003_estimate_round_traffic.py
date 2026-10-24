"""Flag estimated traffic and clean exact 4 GB/GiB multiples.

Revision ID: 0003
Revises: 0002
"""
from collections import defaultdict
from statistics import median
from typing import Any

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _suspicious(row: sa.RowMapping) -> bool:
    return any(
        row[field] >= unit and row[field] % unit == 0
        for field in ("rx_bytes", "tx_bytes", "total_bytes")
        for unit in (4 * 1000**3, 4 * 1024**3)
    )


def upgrade() -> None:
    op.add_column(
        "vnstat_daily_traffic",
        sa.Column("is_estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    traffic = sa.table(
        "vnstat_daily_traffic",
        sa.column("id", sa.Integer()),
        sa.column("hostname", sa.String()),
        sa.column("interface", sa.String()),
        sa.column("rx_bytes", sa.BigInteger()),
        sa.column("tx_bytes", sa.BigInteger()),
        sa.column("total_bytes", sa.BigInteger()),
        sa.column("avg_rate_bps", sa.BigInteger()),
        sa.column("is_estimated", sa.Boolean()),
    )
    connection = op.get_bind()
    donors: dict[tuple[str, str], list[sa.RowMapping]] = defaultdict(list)
    anomalies = []
    for row in connection.execute(sa.select(traffic)).mappings():
        if _suspicious(row):
            anomalies.append(row)
        else:
            donors[(row["hostname"], row["interface"])].append(row)

    estimates: dict[tuple[str, str], dict[str, Any]] = {}
    for key, rows in donors.items():
        rx_bytes = round(median(row["rx_bytes"] for row in rows))
        tx_bytes = round(median(row["tx_bytes"] for row in rows))
        estimates[key] = {
            "rx_bytes": rx_bytes,
            "tx_bytes": tx_bytes,
            "total_bytes": rx_bytes + tx_bytes,
            "avg_rate_bps": round(median(row["avg_rate_bps"] for row in rows)),
            "is_estimated": True,
        }

    replacements = []
    dropped = []
    for row in anomalies:
        estimate = estimates.get((row["hostname"], row["interface"]))
        if estimate is None:
            dropped.append({"_row_id": row["id"]})
        else:
            replacements.append({"_row_id": row["id"], **estimate})
    if replacements:
        connection.execute(
            traffic.update().where(traffic.c.id == sa.bindparam("_row_id")).values(
                **{field: sa.bindparam(field) for field in (
                    "rx_bytes", "tx_bytes", "total_bytes", "avg_rate_bps", "is_estimated",
                )}
            ),
            replacements,
        )
    if dropped:
        connection.execute(
            traffic.delete().where(traffic.c.id == sa.bindparam("_row_id")), dropped,
        )


def downgrade() -> None:
    op.drop_column("vnstat_daily_traffic", "is_estimated")