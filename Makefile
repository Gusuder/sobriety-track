.PHONY: up down reset logs smoke

up:
	docker compose up --build

down:
	docker compose down

reset:
	docker compose down -v

logs:
	docker compose logs -f api postgres

smoke:
	powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1
