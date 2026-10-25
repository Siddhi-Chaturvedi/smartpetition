#!/usr/bin/env bash
# Smoke test for the docker-compose stack (used by CI after `docker compose up`).
# Verifies: frontend serving, backend health via nginx proxy, and a full
# register -> submit -> track round trip through the public port.
set -u
BASE="${1:-http://localhost:8080}"
FAIL=0

check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "  ok    $name"; else echo "  FAIL  $name"; FAIL=1; fi
}

wait_for() {
  local url="$1" tries="${2:-30}" i=0
  while [ $i -lt "$tries" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    i=$((i+1)); sleep 2
  done
  return 1
}

echo "Smoke-testing stack at $BASE"

check "backend comes up" wait_for "$BASE/api/v1/health" 45
check "frontend served"  bash -c "curl -fsS '$BASE/' | grep -qi 'smartpetition'"
check "health is ok"     bash -c "curl -fsS '$BASE/api/v1/health' | grep -q '\"status\":\"ok\"'"

# Round trip: register a citizen, submit a grievance, fetch it back.
EMAIL="smoke-$RANDOM@example.com"
REG=$(curl -fsS -X POST "$BASE/api/v1/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Smoke#Test123\",\"full_name\":\"Smoke Tester\"}" || echo "")
TOKEN=$(echo "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then echo "  ok    citizen registration"; else echo "  FAIL  citizen registration"; FAIL=1; fi

SUB=$(curl -fsS -X POST "$BASE/api/v1/grievances" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Smoke test - no water supply","description":"No water supply in our street for four consecutive days despite repeated requests to the local office.","selected_category":"water supply","location":"Test Street"}' || echo "")
TID=$(echo "$SUB" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("tracking_id",""))' 2>/dev/null || echo "")
if [ -n "$TID" ]; then echo "  ok    grievance submitted ($TID)"; else echo "  FAIL  grievance submission"; FAIL=1; fi

if [ -n "$TID" ]; then
  GET=$(curl -fsS "$BASE/api/v1/grievances/by-tracking/$TID" -H "Authorization: Bearer $TOKEN" || echo "")
  if echo "$GET" | grep -q "$TID"; then echo "  ok    grievance retrievable"; else echo "  FAIL  grievance retrieval"; FAIL=1; fi
else
  echo "  FAIL  grievance retrieval (skipped: no tracking id)"; FAIL=1
fi

if [ $FAIL -eq 0 ]; then echo "SMOKE TEST PASSED"; else echo "SMOKE TEST FAILED"; fi
exit $FAIL
