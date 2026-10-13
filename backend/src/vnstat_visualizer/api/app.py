import time

from bottle import Bottle, HTTPError, HTTPResponse, request, response

from vnstat_visualizer.api.errors import error_envelope
from vnstat_visualizer.api.routes.favorites import register_favorite_routes
from vnstat_visualizer.api.routes.health import SERVICE_NAME, register_health_routes
from vnstat_visualizer.api.routes.traffic import register_traffic_routes
from vnstat_visualizer.logging import get_logger

log = get_logger("api")


def create_app() -> Bottle:
    app = Bottle()
    app.title = SERVICE_NAME

    register_health_routes(app)
    register_traffic_routes(app)
    register_favorite_routes(app)

    @app.hook("before_request")
    def start_timer() -> None:
        request.environ["vnstat.start"] = time.monotonic()
        # Answering preflight here (instead of an OPTIONS route) keeps unknown paths a 404.
        if request.method == "OPTIONS":
            raise HTTPResponse("", 200)

    @app.hook("after_request")
    def enable_cors() -> None:
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"

    @app.hook("after_request")
    def log_request() -> None:
        start = request.environ.get("vnstat.start", time.monotonic())
        log.info(
            "method=%s path=%s status_code=%s duration_ms=%.1f",
            request.method,
            request.path,
            response.status_code,
            (time.monotonic() - start) * 1000,
        )

    @app.error(404)
    def not_found(_err: HTTPError) -> str:
        return error_envelope(404, "not_found", "not found")

    @app.error(405)
    def method_not_allowed(_err: HTTPError) -> str:
        return error_envelope(405, "method_not_allowed", "method not allowed")

    @app.error(500)
    def internal_error(_err: HTTPError) -> str:
        return error_envelope(500, "internal_error", "internal error")

    return app


app = create_app()
