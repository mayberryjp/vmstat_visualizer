import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="vnstat_tests_")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP, 'test.db').as_posix()}"

from vnstat_visualizer.db import Base, get_engine
from vnstat_visualizer.repository import models  # noqa: F401


@pytest.fixture()
def db() -> Iterator[None]:
    engine = get_engine()
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)
