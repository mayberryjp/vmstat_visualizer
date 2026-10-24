from pathlib import Path

from alembic.config import Config
from pytest import MonkeyPatch
from sqlalchemy import create_engine, inspect, text

from alembic import command
from vnstat_visualizer.config import settings


def test_migrations_upgrade_and_downgrade(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    url = f"sqlite:///{(tmp_path / 'migrate.db').as_posix()}"
    monkeypatch.setattr(settings, "database_url", url)
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))

    command.upgrade(cfg, "head")
    assert "vnstat_daily_traffic" in inspect(create_engine(url)).get_table_names()
    command.downgrade(cfg, "base")
    assert "vnstat_daily_traffic" not in inspect(create_engine(url)).get_table_names()


def test_cleanup_replaces_anomalies_once_and_drops_rows_without_donors(
    tmp_path: Path, monkeypatch: MonkeyPatch,
) -> None:
    url = f"sqlite:///{(tmp_path / 'cleanup.db').as_posix()}"
    monkeypatch.setattr(settings, "database_url", url)
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "0002")
    engine = create_engine(url)
    payloads = [
        ("fw01", "eth0", 10, 5, 15, 100),
        ("fw01", "eth0", 30, 15, 45, 300),
        ("fw01", "eth0", 4 * 1000**3, 5, 4 * 1000**3 + 5, 9999),
        ("fw01", "eth0", 5, 8 * 1024**3, 8 * 1024**3 + 5, 9999),
        ("fw01", "eth0", 5, 5, 12 * 1000**3, 9999),
        ("other", "eth0", 999, 5, 1004, 1000),
        ("fw01", "other", 777, 5, 782, 1000),
        ("orphan", "eth0", 4 * 1024**3, 5, 4 * 1024**3 + 5, 9999),
    ]
    with engine.begin() as connection:
        connection.execute(
            text("""
                INSERT INTO vnstat_daily_traffic
                    (hostname, source_ip, interface, day, rx_bytes, tx_bytes,
                     total_bytes, avg_rate_bps, received_at)
                VALUES (:host, '10.0.0.1', :iface, :day, :rx, :tx, :total, :rate,
                        '2026-10-12 23:59:00')
            """),
            [
                 {"host": host, "iface": iface, "day": f"2026-10-{index:02}",
                  "rx": rx, "tx": tx, "total": total, "rate": rate}
                for index, (host, iface, rx, tx, total, rate) in enumerate(payloads, 1)
            ],
        )
    command.upgrade(cfg, "head")
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT * FROM vnstat_daily_traffic ORDER BY id"))
        cleaned = [dict(row) for row in rows.mappings()]
    assert len(cleaned) == 7
    assert [row["is_estimated"] for row in cleaned] == [0, 0, 1, 1, 1, 0, 0]
    for row in cleaned[2:5]:
        assert (row["rx_bytes"], row["tx_bytes"], row["total_bytes"]) == (20, 10, 30)
        assert row["avg_rate_bps"] == 200
        assert row["received_at"] == "2026-10-12 23:59:00"
    assert cleaned[0]["rx_bytes"] == 10
    assert cleaned[1]["rx_bytes"] == 30
    assert cleaned[5]["rx_bytes"] == 999
    assert cleaned[6]["rx_bytes"] == 777
    command.upgrade(cfg, "head")
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT * FROM vnstat_daily_traffic ORDER BY id"))
        assert [dict(row) for row in rows.mappings()] == cleaned
    command.downgrade(cfg, "0002")
    assert "is_estimated" not in {
        column["name"] for column in inspect(engine).get_columns("vnstat_daily_traffic")
    }
    engine.dispose()
