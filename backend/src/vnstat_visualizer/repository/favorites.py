from sqlalchemy import bindparam, delete, func, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from vnstat_visualizer.db import get_engine
from vnstat_visualizer.repository.models import Favorite


def list_favorites() -> list[dict[str, str]]:
    stmt = select(Favorite.hostname, Favorite.interface).order_by(Favorite.position, Favorite.id)
    with get_engine().connect() as conn:
        return [{"hostname": r.hostname, "interface": r.interface} for r in conn.execute(stmt)]


def add_favorite(hostname: str, interface: str) -> None:
    """Append to the end; starring an existing favorite is a no-op."""
    next_position = select(func.coalesce(func.max(Favorite.position), -1) + 1).scalar_subquery()
    stmt = (
        sqlite_insert(Favorite)
        .values(hostname=hostname, interface=interface, position=next_position)
        .on_conflict_do_nothing(index_elements=["hostname", "interface"])
    )
    with get_engine().begin() as conn:
        conn.execute(stmt)


def remove_favorite(hostname: str, interface: str) -> None:
    stmt = delete(Favorite).where(Favorite.hostname == hostname, Favorite.interface == interface)
    with get_engine().begin() as conn:
        conn.execute(stmt)


def set_order(keys: list[tuple[str, str]]) -> None:
    """Order the listed favorites first; unknown keys are ignored and unlisted ones keep their order."""
    with get_engine().begin() as conn:
        rows = conn.execute(
            select(Favorite.id, Favorite.hostname, Favorite.interface).order_by(
                Favorite.position, Favorite.id
            )
        ).all()
        id_by_key = {(r.hostname, r.interface): r.id for r in rows}

        ordered: list[int] = []
        for key in keys:
            fav_id = id_by_key.get(key)
            if fav_id is not None and fav_id not in ordered:
                ordered.append(fav_id)
        ordered.extend(r.id for r in rows if r.id not in ordered)

        if ordered:
            conn.execute(
                update(Favorite)
                .where(Favorite.id == bindparam("b_id"))
                .values(position=bindparam("b_position")),
                [{"b_id": fav_id, "b_position": i} for i, fav_id in enumerate(ordered)],
            )
