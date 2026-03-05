.PHONY: up down reset logs smoke api-test web-e2e ci-local preflight-prod postdeploy-linux

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

api-test:
	cd apps/api && npm test

web-e2e:
	cd e2e && npm test

ci-local: api-test smoke web-e2e

preflight-prod:
	bash ./scripts/preflight-prod.sh

postdeploy-linux:
	bash ./scripts/post-deploy-check.sh
