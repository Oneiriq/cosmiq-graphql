import { createYoga } from "graphql-yoga";
import { createYogaAdapter } from "@oneiriq/cosmiq-graphql";

const adapter = await createYogaAdapter({
  connectionString:
    "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",
  database: "db1",
  containers: [
    { name: "users", typeName: "User" },
    { name: "files", typeName: "File" },
    { name: "listings", typeName: "Listing" },
  ],
});

console.log(`Containers: ${adapter.context.containerNames.join(", ")}`);

const yoga = createYoga({
  schema: adapter.schema,
  context: adapter.context,
  graphiql: true,
});

const server = Deno.serve({ port: 4000 }, yoga.fetch);

console.log("Multi-container GraphQL server at http://localhost:4000/graphql");

const shutdown = async () => {
  adapter.dispose();
  await server.shutdown();
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", shutdown);
if (Deno.build.os !== "windows") {
  Deno.addSignalListener("SIGTERM", shutdown);
}
