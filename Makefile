install:
	pip install -e "backend[dev]"
	cd frontend && npm ci

lint:
	cd backend && ruff check .
	cd frontend && npm run lint

typecheck:
	cd backend && mypy src
	cd frontend && npm run typecheck

test:
	cd backend && pytest -q
	cd frontend && npm run test:unit

security:
	cd backend && bandit -r src

migrate:
	cd backend && alembic upgrade head

docker-build:
	docker build -t mayberry4477/vnstat_visualizer_backend:latest backend
	docker build -t mayberry4477/vnstat_visualizer_frontend:latest frontend

docker-run:
	docker compose up
