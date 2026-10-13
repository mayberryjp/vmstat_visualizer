from pathlib import Path

from alembic.config import Config
from pytest import MonkeyPatch
from sqlalchemy import create_engine, inspect

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
