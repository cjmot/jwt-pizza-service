#!/usr/bin/env bash

if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "This script requires jq"
  exit 1
fi

host="${1%/}"
run_id=$(date +%s)
worker_pids=()
shutting_down=0

curl_json() {
  curl -s "$@"
}

random_sleep() {
  local min_seconds="$1"
  local max_seconds="$2"
  local duration

  duration=$(awk -v min="$min_seconds" -v max="$max_seconds" 'BEGIN { srand(); print min + rand() * (max - min) }')
  sleep "$duration"
}

auth_header() {
  local token="$1"
  printf 'Authorization: Bearer %s' "$token"
}

login_user() {
  local email="$1"
  local password="$2"

  curl_json -X PUT "$host/api/auth" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}"
}

extract_token() {
  jq -r '.token // empty'
}

extract_user_id() {
  jq -r '.user.id // empty'
}

register_user() {
  local name="$1"
  local email="$2"
  local password="$3"

  curl_json -X POST "$host/api/auth" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"email\":\"$email\",\"password\":\"$password\"}" >/dev/null
}

build_large_order_items() {
  local items='{"menuId":1,"description":"Veggie","price":0.05}'
  local i

  for ((i = 0; i < 21; i++)); do
    items+=',{"menuId":1,"description":"Veggie","price":0.05}'
  done

  printf '%s' "$items"
}

cleanup() {
  if [ "$shutting_down" -eq 1 ]; then
    exit 0
  fi

  shutting_down=1
  trap - INT TERM

  echo
  echo "Stopping traffic workers..."

  for pid in "${worker_pids[@]}"; do
    kill -TERM "$pid" >/dev/null 2>&1
  done

  wait >/dev/null 2>&1
  exit 0
}

trap cleanup INT TERM

ensure_seed_data() {
  local admin_response
  local admin_token

  admin_response=$(login_user "a@jwt.com" "admin")
  admin_token=$(printf '%s' "$admin_response" | extract_token)

  if [ -z "$admin_token" ]; then
    echo "Unable to authenticate admin user a@jwt.com"
    exit 1
  fi

  register_user "pizza diner" "d@jwt.com" "diner"
  register_user "pizza franchisee" "f@jwt.com" "franchisee"

  curl_json -X PUT "$host/api/order/menu" \
    -H 'Content-Type: application/json' \
    -H "$(auth_header "$admin_token")" \
    -d '{"title":"Veggie","description":"A garden of delight","image":"pizza1.png","price":0.05}' >/dev/null

  curl_json -X PUT "$host/api/order/menu" \
    -H 'Content-Type: application/json' \
    -H "$(auth_header "$admin_token")" \
    -d '{"title":"Pepperoni","description":"Spicy treat","image":"pizza2.png","price":0.06}' >/dev/null

  curl_json -X POST "$host/api/franchise" \
    -H 'Content-Type: application/json' \
    -H "$(auth_header "$admin_token")" \
    -d '{"name":"pizzaPocket","admins":[{"email":"f@jwt.com"}]}' >/dev/null

  curl_json -X POST "$host/api/franchise/1/store" \
    -H 'Content-Type: application/json' \
    -H "$(auth_header "$admin_token")" \
    -d '{"franchiseId":1,"name":"SLC"}' >/dev/null
}

create_test_users() {
  local count="$1"
  local i

  for ((i = 1; i <= count; i++)); do
    register_user "load diner ${i}" "load-diner-${run_id}-${i}@jwt.com" "diner"
  done
}

start_worker() {
  (
    trap 'exit 0' INT TERM
    "$@"
  ) &
  worker_pids+=("$!")
}

anonymous_browse_worker() {
  while true; do
    curl_json "$host/" >/dev/null
    random_sleep 0.2 1.0
    curl_json "$host/api/docs" >/dev/null
    random_sleep 0.2 1.2
    curl_json "$host/api/order/menu" >/dev/null
    random_sleep 0.3 1.5
    curl_json "$host/api/franchise?page=0&limit=10&name=*" >/dev/null
    random_sleep 0.8 2.5
  done
}

failed_auth_worker() {
  while true; do
    if [ $((RANDOM % 2)) -eq 0 ]; then
      curl_json -X PUT "$host/api/auth" \
        -H 'Content-Type: application/json' \
        -d '{"email":"unknown@jwt.com","password":"bad"}' >/dev/null
    else
      curl_json -X PUT "$host/api/auth" \
        -H 'Content-Type: application/json' \
        -d '{"email":"","password":""}' >/dev/null
    fi

    random_sleep 18 35
  done
}

authenticated_session_worker() {
  local email="$1"
  local password="$2"

  while true; do
    local login_response
    local token
    local user_id

    login_response=$(login_user "$email" "$password")
    token=$(printf '%s' "$login_response" | extract_token)
    user_id=$(printf '%s' "$login_response" | extract_user_id)

    if [ -n "$token" ]; then
      curl_json "$host/api/user/me" -H "$(auth_header "$token")" >/dev/null
      random_sleep 0.2 1.2
      curl_json "$host/api/order" -H "$(auth_header "$token")" >/dev/null
      random_sleep 0.2 1.2
      if [ -n "$user_id" ]; then
        curl_json "$host/api/franchise/$user_id" -H "$(auth_header "$token")" >/dev/null
      fi
      random_sleep 0.5 2.5
      curl_json -X DELETE "$host/api/auth" -H "$(auth_header "$token")" >/dev/null
    fi

    random_sleep 3 10
  done
}

ordering_session_worker() {
  local email="$1"
  local password="$2"
  local mode="$3"
  local large_items

  large_items=$(build_large_order_items)

  while true; do
    local login_response
    local token

    login_response=$(login_user "$email" "$password")
    token=$(printf '%s' "$login_response" | extract_token)

    if [ -n "$token" ]; then
      curl_json "$host/api/user/me" -H "$(auth_header "$token")" >/dev/null
      random_sleep 0.3 1.4
      curl_json "$host/api/order/menu" -H "$(auth_header "$token")" >/dev/null
      random_sleep 0.3 1.4

      if [ "$mode" = "success" ]; then
        curl_json -X POST "$host/api/order" \
          -H 'Content-Type: application/json' \
          -H "$(auth_header "$token")" \
          -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.05}]}' >/dev/null
      else
        curl_json -X POST "$host/api/order" \
          -H 'Content-Type: application/json' \
          -H "$(auth_header "$token")" \
          -d "{\"franchiseId\":1,\"storeId\":1,\"items\":[${large_items}]}" >/dev/null
      fi

      random_sleep 0.5 2.0
      curl_json "$host/api/order" -H "$(auth_header "$token")" >/dev/null
      random_sleep 0.3 1.8
      curl_json -X DELETE "$host/api/auth" -H "$(auth_header "$token")" >/dev/null
    fi

    if [ "$mode" = "success" ]; then
      random_sleep 2 6
    else
      random_sleep 8 18
    fi
  done
}

echo "Bootstrapping traffic users and seed data against $host ..."
ensure_seed_data
create_test_users 10

echo "Starting traffic workers..."
start_worker anonymous_browse_worker
start_worker anonymous_browse_worker
start_worker failed_auth_worker
start_worker authenticated_session_worker "d@jwt.com" "diner"
start_worker authenticated_session_worker "f@jwt.com" "franchisee"
start_worker authenticated_session_worker "load-diner-${run_id}-1@jwt.com" "diner"
start_worker authenticated_session_worker "load-diner-${run_id}-2@jwt.com" "diner"
start_worker authenticated_session_worker "load-diner-${run_id}-3@jwt.com" "diner"
start_worker ordering_session_worker "load-diner-${run_id}-4@jwt.com" "diner" "success"
start_worker ordering_session_worker "load-diner-${run_id}-5@jwt.com" "diner" "success"
start_worker ordering_session_worker "load-diner-${run_id}-6@jwt.com" "diner" "success"
start_worker ordering_session_worker "load-diner-${run_id}-7@jwt.com" "diner" "success"
start_worker ordering_session_worker "load-diner-${run_id}-8@jwt.com" "diner" "failure"
start_worker ordering_session_worker "load-diner-${run_id}-9@jwt.com" "diner" "failure"
start_worker ordering_session_worker "load-diner-${run_id}-10@jwt.com" "diner" "failure"

echo "Traffic generation is running. Press Ctrl+C to stop."
wait
