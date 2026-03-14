if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi
host=$1

# Function to cleanly exit
cleanup() {
  echo "Terminating background processes..."
  kill $pid1 $pid2 $pid3 $pid4 $pid5 >/dev/null 2>&1
  exit 0
}

# Trap SIGINT (Ctrl+C) to execute the cleanup function
trap cleanup SIGINT

# Hit menu every 3 seconds
while true; do
  curl -s "$host/api/order/menu" > /dev/null
  sleep 3
done &
pid1=$!

# Invalid login every 25 seconds
while true; do
  curl -s -X PUT "$host/api/auth" -d '{"email":"unknown@jwt.com", "password":"bad"}' -H 'Content-Type: application/json' > /dev/null
  sleep 25
done &
pid2=$!

# login and logout after 2 minutes
while true; do
  response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"f@jwt.com", "password":"franchisee"}' -H 'Content-Type: application/json' 2>/dev/null)
  token=$(echo "$response" | jq -r '.token' 2>/dev/null)
  sleep 110
  curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" >/dev/null 2>&1
  sleep 10
done &
pid3=$!

# login, wait 20 seconds, place order, wait 30 seconds, logout
while true; do
  response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json' 2>/dev/null)
  token=$(echo "$response" | jq -r '.token' 2>/dev/null)
  curl -s -X POST "$host/api/order" -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H "Authorization: Bearer $token" >/dev/null 2>&1
  sleep 20
  curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" >/dev/null 2>&1
  sleep 30
done &
pid4=$!

# Login, buy "too many pizzas" to cause an order to fail, wait 5 seconds, logout, wait 295 seconds
while true; do
  response=$(curl -s -X PUT "$host/api/auth" -d '{"email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json' 2>/dev/null)
  token=$(echo "$response" | jq -r '.token' 2>/dev/null)
  echo "Login hungry diner..."

  items='{ "menuId": 1, "description": "Veggie", "price": 0.05 }'
  for (( i=0; i < 21; i++ ))
  do items+=', { "menuId": 1, "description": "Veggie", "price": 0.05 }'
  done

  curl -s -X POST "$host/api/order" -H 'Content-Type: application/json' -d "{\"franchiseId\": 1, \"storeId\":1, \"items\":[$items]}"  -H "Authorization: Bearer $token" >/dev/null 2>&1
  echo "Bought too many pizzas..."
  sleep 5
  curl -s -X DELETE "$host/api/auth" -H "Authorization: Bearer $token" >/dev/null 2>&1
  echo "Logging out hungry diner..."
  sleep 295
done &
pid5=$!

# Wait for background processes to finish (they won't, but this keeps the script running)
wait $pid1 $pid2 $pid3 $pid4 $pid5

