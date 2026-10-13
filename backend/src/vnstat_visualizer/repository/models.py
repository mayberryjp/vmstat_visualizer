from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from vnstat_visualizer.db import Base


class DailyTraffic(Base):
    __tablename__ = "vnstat_daily_traffic"
    __table_args__ = (
        UniqueConstraint("hostname", "interface", "day", name="uq_vnstat_daily_traffic_key"),
        Index("ix_vnstat_daily_traffic_day", "day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    hostname: Mapped[str] = mapped_column(String(253))
    source_ip: Mapped[str] = mapped_column(String(45))
    interface: Mapped[str] = mapped_column(String(64))
    day: Mapped[date] = mapped_column(Date)
    rx_bytes: Mapped[int] = mapped_column(BigInteger)
    tx_bytes: Mapped[int] = mapped_column(BigInteger)
    total_bytes: Mapped[int] = mapped_column(BigInteger)
    avg_rate_bps: Mapped[int] = mapped_column(BigInteger)
    received_at: Mapped[datetime] = mapped_column(DateTime)


class Favorite(Base):
    __tablename__ = "vnstat_favorites"
    __table_args__ = (UniqueConstraint("hostname", "interface", name="uq_vnstat_favorites_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    hostname: Mapped[str] = mapped_column(String(253))
    interface: Mapped[str] = mapped_column(String(64))
    position: Mapped[int] = mapped_column()
