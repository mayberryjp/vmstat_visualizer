from waitress import serve

from vnstat_visualizer.api.app import app
from vnstat_visualizer.config import settings
from vnstat_visualizer.logging import configure_logging, get_logger


def main() -> None:
    configure_logging(settings.log_level)
    get_logger("api").info("listening on %s:%s", settings.api_listen_address, settings.api_port)
    serve(app, host=settings.api_listen_address, port=settings.api_port)


if __name__ == "__main__":
    main()
