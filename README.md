# vnstat visualizer

Collects one `vnstat --oneline` snapshot per machine per day over UDP, stores it in SQLite (keyed by
hostname, source IP, interface and day) and charts daily traffic per device and interface with
ApexCharts.

```text
machines --UDP 9999--> backend (udp worker -> SQLite <- Bottle API :8000) <--/api-- frontend (:3030)
```

## Sending data

Run [scripts/vnstat_report.sh](scripts/vnstat_report.sh) daily at 23:59 on each machine (set
`TARGET_IP` first). It sends one datagram per interface; the payload is
`HOSTNAME|<vnstat --oneline output>`, e.g. `fw01|1;vtnet0;2026-10-12;33.49 MiB;...`.

- The source IP is taken from the UDP packet; the hostname and interface come from the payload.
- A repeat for the same hostname + interface + day replaces the earlier row.
- Malformed datagrams are logged and dropped. UDP is unauthenticated, so restrict port 9999 with a
  firewall to your machines.

## API

| Route | Description |
| --- | --- |
| `GET /health`, `GET /ready` | liveness / DB readiness |
| `GET /devices` | one row per hostname + interface with latest source IP |
| `GET /traffic` | daily rows; filters `hostname`, `interface`, `start`, `end` (`YYYY-MM-DD`); opt-in `limit`/`offset` |
| `GET /traffic/summary` | per hostname + interface sums (`rx_bytes`, `tx_bytes`, `total_bytes`) and day count; same `hostname`, `interface`, `start`, `end` filters |
| `GET /favorites` | starred charts in display order |
| `PUT /favorites/<hostname>/<interface>` | star a chart (idempotent, appended to the end) |
| `DELETE /favorites/<hostname>/<interface>` | unstar a chart |
| `PUT /favorites/order` | body `{"items": [{"hostname": ..., "interface": ...}]}` sets the order |

The favorites endpoints return the full updated list and, like the rest of the API, are unauthenticated.

## Tabs and favorites

Use the header's **Host / Favorites**, **Interface** (when a host is selected), and **Range**
dropdowns to choose which traffic to display. The dashboard opens on **Favorites**.
On screens at least 960px wide, **Chart layout** defaults to **Fit all graphs on one page**, an adaptive grid sized to the available
window without page scrolling. Choose **One graph per row** for larger, vertically scrolling charts.
Smaller screens always use one graph per row and hide the layout selector. Your large-screen
layout preference is saved in your browser, restored when the screen is wide enough again,
and applies to both favorites and host views.
Click the star on any chart to add or remove it from Favorites,
and drag a Favorites card by its handle to reorder it. Favorites are stored in the SQLite database.
A favorite with no data in the selected range still shows a card so it can be unstarred.

## Configuration (environment variables)

| Variable | Default |
| --- | --- |
| `DATABASE_URL` | `sqlite:///./vnstat.db` (compose uses `sqlite:////data/vnstat.db`) |
| `API_LISTEN_ADDRESS` / `API_PORT` | `0.0.0.0` / `8000` |
| `UDP_LISTEN_ADDRESS` / `UDP_PORT` | `0.0.0.0` / `9999` |
| `VNSTAT_LOG_LEVEL` | `INFO` |
| `TZ` | set to `America/New_York` in compose; timestamps are stored in container local time |

Frontend: `VITE_API_BASE_URL` (empty = same origin, `/api` is proxied), `VITE_APP_NAME`, `VITE_APP_ENV`
(see `frontend/.env.example`).

## Local runbook

```sh
make install                      # pip install -e backend[dev]; npm ci in frontend
cd backend && alembic upgrade head
python -m vnstat_visualizer.api_main              # API on :8000
python -m vnstat_visualizer.workers.udp_listener  # UDP listener on :9999
cd frontend && npm run dev                        # UI on :3030, proxies /api to :8000
```

Checks: `make lint typecheck test security`.

## Docker

```sh
make docker-build
docker compose up        # UI on :3030, API on :8000, UDP on :9999, data in the vnstat_data volume
```

The backend container runs migrations, the API and the UDP listener under supervisord. The frontend's
nginx proxies `/api/` to `http://backend:8000/`.

## Notes on standards

- SQLite replaces Postgres per the requirements, so there is no schema or `search_path`; tables use
  the `vnstat_` prefix and Alembic uses `alembic_version_vnstat_visualizer`.
- Backend and frontend share one repo and one `docker-compose.yml`; CI is the single
  `docker-publish.yml` (no `ci.yml`, per the backend standard).
- Playwright e2e scaffolding is not included yet.
