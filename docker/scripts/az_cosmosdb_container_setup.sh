#!/bin/sh

ENDPOINT="https://$COSMOS_SERVICE_NAME:8081"

check_install() {
  if ! command -v "$1" > /dev/null 2>&1; then
    echo "Error: $1 is required but not installed."
    exit 1
  fi
}

echo "Checking for dependencies..."
check_install jq
check_install openssl

create_cosmos_rest_token() {
    ISSUE_DATE=$1
    ISSUE_DATE_LOWER=$(echo -n "$ISSUE_DATE" | tr '[:upper:]' '[:lower:]')
    MASTER_KEY_BASE64=$2
    RESOURCE_TYPE=${3:-dbs}
    RESOURCE_LINK=$4
    VERB=$5
    KEY=$(echo -n "$MASTER_KEY_BASE64" | base64 -d)
    SIG=$(printf "%s\n%s\n%s\n%s\n\n" "$VERB" "$RESOURCE_TYPE" "$RESOURCE_LINK" "$ISSUE_DATE_LOWER" | openssl sha256 -hmac "$KEY" -binary | base64)
    printf %s "type=master&ver=1.0&sig=$SIG"|jq -sRr @uri
}

create_database() {
  ISSUE_DATE=$(TZ=GMT date '+%a, %d %b %Y %T %Z')
  CREATE_DB_TOKEN=$(create_cosmos_rest_token "$ISSUE_DATE" "$COSMOS_EMULATOR_KEY" "dbs" "" "post")
  echo "Generating database: $DATABASE_NAME..."

  response=$(curl -s -w "\nHTTP_CODE:%{http_code}" --data "{\"id\":\"$DATABASE_NAME\"}" \
    -H "Content-Type: application/json" \
    -H "x-ms-date: $ISSUE_DATE" \
    -H "Authorization: $CREATE_DB_TOKEN" \
    -H "x-ms-version: 2015-08-06" \
    -k "$ENDPOINT/dbs")

  echo "$response" | grep -q "HTTP_CODE:201" || { echo "❌ Failed to create database $DATABASE_NAME"; exit 1; }

  echo "Database $DATABASE_NAME created successfully."
}

create_container() {
  ISSUE_DATE=$(TZ=GMT date '+%a, %d %b %Y %T %Z')
  CREATE_CT_TOKEN=$(create_cosmos_rest_token "$ISSUE_DATE" "$COSMOS_EMULATOR_KEY" "colls" "dbs/$DATABASE_NAME" "post")

  echo "Creating container: $CONTAINER_NAME in database: $DATABASE_NAME..."
  curl -s -o /dev/null -w "%{http_code}" --data '{"id":"'"$CONTAINER_NAME"'", "partitionKey":{"paths":["/partition"], "kind":"Hash", "Version":2}}' \
    -H "Content-Type: application/json" \
    -H "x-ms-date: $ISSUE_DATE" \
    -H "Authorization: $CREATE_CT_TOKEN" \
    -H "x-ms-version: 2015-08-06" \
    -k "$ENDPOINT/dbs/$DATABASE_NAME/colls" | grep -q 201 || { echo "❌ Failed to create container $CONTAINER_NAME"; exit 1; }

  echo "Container $CONTAINER_NAME created successfully."
}

echo "Wait until the Cosmos Emulator API responds.."
until [ $(curl -k -s -o /dev/null -w "%{http_code}" $ENDPOINT) -eq "401" ]; do
    sleep 2;
done;

create_database
create_container

cat << EOF

Cosmos DB emulator setup complete

To start the test environment, run:
  docker start $SERVICE_NAME

To stop the test environment, run:
  docker stop $SERVICE_NAME

Access Cosmos DB emulator at (HTTPS ONLY):
  $ENDPOINT/_explorer/index.html
EOF
