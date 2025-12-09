import { createYoga } from "graphql-yoga";
import { createYogaAdapter } from "@oneiriq/cosmiq-graphql";

const adapter = await createYogaAdapter({
  connectionString:
    "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",
  database: "db1",
  containers: [
    {
      name: "users",
      typeName: "User",
    },
  ],
  retryOptions: {
    maxRetries: 5,
    initialDelayMs: 200,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },
});

const customResolvers = {
  ...adapter.resolvers,
  Query: {
    ...adapter.resolvers.Query,
    users: async (_parent: unknown, args: Record<string, unknown>) => {
      console.log("[RETRY] Querying users with retry protection");

      try {
        const result = await adapter.resolvers.Query?.users(_parent, args);
        console.log(
          `[RETRY] Query successful, RU: ${
            result.pageInfo?.requestCharge ?? "N/A"
          }`,
        );
        return result;
      } catch (error) {
        console.error("[RETRY] Query failed after retries:", error);
        throw error;
      }
    },
  },
  Mutation: {
    ...adapter.resolvers.Mutation,
    createUser: async (
      _parent: unknown,
      args: { input: Record<string, unknown> },
    ) => {
      console.log("[RETRY] Creating user with automatic retries");
      console.log("[RETRY] Retry config: max 5 attempts, exponential backoff");

      try {
        const result = await adapter.resolvers.Mutation?.createUser(
          _parent,
          args,
        );
        console.log(`[RETRY] Create successful, RU: ${result.requestCharge}`);
        return result;
      } catch (error) {
        console.error("[RETRY] Create failed after retries:", error);
        throw error;
      }
    },
    updateUser: async (
      _parent: unknown,
      args: { id: string; input: Record<string, unknown> },
    ) => {
      console.log(`[RETRY] Updating user ${args.id} with retry protection`);

      try {
        const result = await adapter.resolvers.Mutation?.updateUser(
          _parent,
          args,
        );
        console.log(`[RETRY] Update successful, RU: ${result.requestCharge}`);
        return result;
      } catch (error) {
        console.error("[RETRY] Update failed after retries:", error);
        throw error;
      }
    },
  },
};

const yoga = createYoga({
  schema: {
    typeDefs: adapter.sdl,
    resolvers: customResolvers,
  },
  graphiql: true,
});

const server = Deno.serve({ port: 4000 }, yoga.fetch);

console.log("Server with retry configuration at http://localhost:4000/graphql");
console.log("Retry settings:");
console.log("- Max retries: 5");
console.log("- Initial delay: 200ms");
console.log("- Max delay: 10s");
console.log("- Backoff multiplier: 2x");

const shutdown = async () => {
  adapter.dispose();
  await server.shutdown();
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", shutdown);
if (Deno.build.os !== "windows") {
  Deno.addSignalListener("SIGTERM", shutdown);
}
