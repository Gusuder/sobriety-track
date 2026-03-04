# Observability and Alerts

## Metrics endpoint
- `GET /metrics`

Example fields:
- `requests.total`
- `requests.byStatusClass.5xx`
- `errors.authFailures`
- `errors.authFailuresByEndpointStatus` (e.g. `login:401`, `register:429`, `google:401`)
- `errors.serverErrors`
- `latencyMs.avg`
- `latencyMs.p95`

## Minimal alert thresholds
- `5xx` errors: alert if `requests.byStatusClass.5xx > 0` for 5+ minutes
- Auth failures: alert if `errors.authFailures` increases rapidly (possible brute force)
- Auth endpoint anomalies: alert if a specific `errors.authFailuresByEndpointStatus` key spikes unexpectedly
- Latency: alert if `latencyMs.p95 > 1000` for 10+ minutes
- Readiness: alert on non-200 from `GET /ready`

## Quick check commands
```bash
curl http://localhost:4000/health
curl http://localhost:4000/ready
curl http://localhost:4000/metrics
```
