#!/bin/bash

DOCKER_COMPOSE_PATH="../docker-compose.yml"

refresh_cosmos_emulator() {
  echo "Refreshing Cosmos DB Emulator..."
  docker pull mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:latest

  if docker ps -q -f name=fs-cosmos-emulator > /dev/null; then
    docker stop cosmos-emulator
    docker rm cosmos-emulator
    echo "Stopped and removed existing Cosmos Emulator container."
  else
    echo "No running Cosmos Emulator container found."
  fi

  # Start a new cosmos-emulator container using docker-compose
  docker-compose -f "$DOCKER_COMPOSE_PATH" up -d cosmos-emulator
  echo "Cosmos Emulator container started with the latest image."
}

refresh_cosmos_emulator

echo "Cosmos DB Emulator image refreshed!"
