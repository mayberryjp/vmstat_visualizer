import json
from pathlib import Path
from typing import Any


class ChartsConfigError(ValueError):
    pass


def load_charts(path: str) -> list[dict[str, str]] | None:
    """Return the ordered chart list, or None when no config file exists (show everything)."""
    file = Path(path)
    if not file.is_file():
        return None
    try:
        raw: Any = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ChartsConfigError("charts config is not readable JSON") from exc

    entries = raw.get("charts") if isinstance(raw, dict) else None
    if not isinstance(entries, list):
        raise ChartsConfigError("'charts' must be a list")

    items: list[dict[str, str]] = []
    for i, entry in enumerate(entries):
        hostname = entry.get("hostname") if isinstance(entry, dict) else None
        if not isinstance(hostname, str) or not hostname:
            raise ChartsConfigError(f"charts[{i}] needs a 'hostname' string")
        item = {"hostname": hostname}
        for key in ("interface", "title"):
            value = entry.get(key)
            if value is None:
                continue
            if not isinstance(value, str):
                raise ChartsConfigError(f"charts[{i}].{key} must be a string")
            item[key] = value
        items.append(item)
    return items
