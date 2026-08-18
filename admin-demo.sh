#!/usr/bin/env bash
# Demonstrates the admin feature set (B1+B2) end to end:
#   - GET /api/bookings/admin
#   - property create / edit / deactivate
#   - room-type + room CRUD
#   - ownership enforcement (vendor A vs B) and role guard (tenant)
#   - delete protection (409 conflict) + deactivate flow
# Usage: ./admin-demo.sh   (server must be running on :3001)

set -e

API="http://localhost:3001"
PASS=0
FAIL=0

json_get() { node -pe "JSON.parse(require('fs').readFileSync(0))$1"; }

login() {
  curl -s -X POST "$API/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | json_get ".accessToken"
}

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (got HTTP $actual, expected $expected)"
    FAIL=$((FAIL + 1))
  fi
}

echo "== Logging in =="
TOKEN_A=$(login "vendor@nestboard.dev" "password123")
TOKEN_B=$(login "vendorb@nestboard.dev" "password123")
TOKEN_T=$(login "tenant1@nestboard.dev" "password123")

echo "== Create test property, room type, room (vendor A) =="
PID=$(curl -s -X POST "$API/api/properties" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"title":"Demo Property","description":"Created by the admin demo script to prove the B1+B2 endpoints end to end.","address":"99 Demo Rd","city":"Colombo","type":"APARTMENT","amenities":["AC","WiFi"],"latitude":6.9271,"longitude":79.8612,"imageUrl":"https://example.com/pic.jpg","minStay":"1 month"}' \
  | json_get ".id")
echo "  → property $PID"

RTID=$(curl -s -X POST "$API/api/properties/$PID/room-types" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"name":"Demo Room Type","pricePerMonth":25000,"hasAC":true}' \
  | json_get ".id")
echo "  → room type $RTID"

ROOM_ID=$(curl -s -X POST "$API/api/properties/$PID/room-types/$RTID/rooms" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"roomLabel":"Demo Room 1","seatCapacity":2}' \
  | json_get ".id")
echo "  → room $ROOM_ID"

echo "== Tenant books the room =="
curl -s -X POST "$API/api/bookings" \
  -H "Authorization: Bearer $TOKEN_T" -H "Content-Type: application/json" \
  -d "{\"roomId\":\"$ROOM_ID\",\"seatNumber\":1,\"startMonth\":\"2026-09\",\"durationMonths\":3}" \
  | json_get ".bookingStatus"
echo "  → booking created"

echo "== B1: GET /api/bookings/admin (vendor A) =="
COUNT=$(curl -s "$API/api/bookings/admin" -H "Authorization: Bearer $TOKEN_A" | json_get ".length")
echo "  → $COUNT booking(s) visible"
if [ "$COUNT" -ge 1 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

echo "== B2: edit property, room type, room (owner) =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/api/properties/$PID" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"minStay":"2 months"}')
check "PATCH /properties/:id" "$CODE" "200"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/api/properties/$PID/room-types/$RTID" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"pricePerMonth":26000}')
check "PATCH room-type" "$CODE" "200"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/api/properties/$PID/room-types/$RTID/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"isAvailable":false}')
check "PATCH room" "$CODE" "200"

echo "== Ownership: vendor B cannot touch vendor A's property =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/api/properties/$PID" \
  -H "Authorization: Bearer $TOKEN_B" -H "Content-Type: application/json" \
  -d '{"title":"Stolen"}')
check "vendor B PATCH (expect 403)" "$CODE" "403"

echo "== Role: tenant cannot use admin endpoints =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/bookings/admin" \
  -H "Authorization: Bearer $TOKEN_T")
check "tenant GET /bookings/admin (expect 403)" "$CODE" "403"

echo "== Delete protection =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/api/properties/$PID" \
  -H "Authorization: Bearer $TOKEN_A")
check "DELETE property with rooms (expect 409)" "$CODE" "409"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/api/properties/$PID/room-types/$RTID/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $TOKEN_A")
check "DELETE room with booking (expect 409)" "$CODE" "409"

echo "== Deactivate instead =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/api/properties/$PID" \
  -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d '{"isActive":false}')
check "PATCH isActive:false" "$CODE" "200"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]