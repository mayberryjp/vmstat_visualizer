# vnstat-visualizer backend

Receives one `vnstat --oneline` snapshot per machine per day over UDP, stores it in SQLite and
serves it over a Bottle API. See the top-level README for the full runbook.
