from typing import Any

from bottle import Bottle

from vnstat_visualizer.api.errors import error_envelope
from vnstat_visualizer.config import settings
from vnstat_visualizer.domain.charts import ChartsConfigError, load_charts


def register_chart_routes(app: Bottle) -> None:
    @app.get("/charts")
    def get_charts() -> dict[str, Any] | str:
        # Read per request so edits to the file apply without a restart.
        try:
            items = load_charts(settings.charts_config_path)
        except ChartsConfigError as exc:
            return error_envelope(500, "invalid_charts_config", "Invalid charts config", str(exc))
        return {
            "status": "ok",
            "configured": items is not None,
            "items": items or [],
            "total": len(items or []),
        }
