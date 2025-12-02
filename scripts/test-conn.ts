import { CosmosClient } from "@azure/cosmos"

const client = new CosmosClient({
  endpoint: "https://localhost:8081",
  key: "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
})

const { resources } = await client.databases.readAll().fetchAll()

console.log("Databases:", resources.map((r) => r.id))
