import socket
from datetime import datetime

from vnstat_visualizer.config import settings
from vnstat_visualizer.domain.parser import ParseError, parse_datagram
from vnstat_visualizer.logging import configure_logging, get_logger
from vnstat_visualizer.repository.traffic import upsert_snapshot

log = get_logger("worker.udp_listener")

MAX_DATAGRAM_BYTES = 4096


def handle_datagram(data: bytes, source_ip: str) -> bool:
    """Parse one datagram and store it; an existing (host, interface, day) row is replaced."""
    try:
        snapshot = parse_datagram(data)
    except ParseError as exc:
        log.warning("rejected datagram from %s: %r", source_ip, str(exc))
        return False
    # Naive local time on purpose: the container TZ is the single source of truth.
    upsert_snapshot(snapshot, source_ip, datetime.now())  # noqa: DTZ005
    log.info(
        "stored host=%s interface=%s day=%s source_ip=%s",
        snapshot.hostname,
        snapshot.interface,
        snapshot.day,
        source_ip,
    )
    return True


def main() -> None:
    configure_logging(settings.log_level)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.bind((settings.udp_listen_address, settings.udp_port))
        log.info("listening on udp %s:%s", settings.udp_listen_address, settings.udp_port)
        while True:
            data, (source_ip, _port) = sock.recvfrom(MAX_DATAGRAM_BYTES)
            try:
                handle_datagram(data, source_ip)
            except Exception:
                log.exception("failed to handle datagram from %s", source_ip)


if __name__ == "__main__":
    main()
