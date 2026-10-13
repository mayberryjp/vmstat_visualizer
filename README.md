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
| `GET /charts` | the contents of the charts config file (see below) |

## Tabs and favorites

The dashboard opens on a **Favorites** tab, followed by one tab per source host showing all of that
host's interfaces (one chart per row). Favorites are the charts listed in the file at
`CHARTS_CONFIG_PATH` (with compose: `/docker/vnstat_data/charts.json` on the host). The file is
re-read on every page load, so no restart is needed. Without the file, Favorites is empty.

```json
{
  "charts": [
    { "hostname": "fw01", "interface": "vtnet0", "title": "Firewall WAN" },
    { "hostname": "fw02" }
  ]
}
```

- Favorites appear in the listed order, one per row; host tabs are unaffected by the file.
- `interface` is optional: omit it to show every interface of that host.
- `title` is optional and only applies when `interface` is set.
- A listed interface with no data in the range still shows a card saying so, which helps catch typos.

## Configuration (environment variables)

| Variable | Default |
| --- | --- |
| `DATABASE_URL` | `sqlite:///./vnstat.db` (compose uses `sqlite:////data/vnstat.db`) |
| `API_LISTEN_ADDRESS` / `API_PORT` | `0.0.0.0` / `8000` |
| `UDP_LISTEN_ADDRESS` / `UDP_PORT` | `0.0.0.0` / `9999` |
| `CHARTS_CONFIG_PATH` | `charts.json` (compose uses `/data/charts.json`) |
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
