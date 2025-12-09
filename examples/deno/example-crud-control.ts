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
      operations: {
        create: { enabled: true },
        read: { enabled: true },
        update: { enabled: true },
        delete: { enabled: true },
        list: { enabled: true },
      },
    },
    {
      name: "files",
      typeName: "File",
      operations: {
        create: { enabled: false },
        read: { enabled: true },
        update: { enabled: false },
        delete: { enabled: false },
        list: { enabled: true },
      },
    },
  ],
});

const customResolvers = {
  ...adapter.resolvers,
  Mutation: {
    ...adapter.resolvers.Mutation,
    createUser: async (
      _parent: unknown,
      args: { input: Record<string, unknown> },
    ) => {
      console.log("[CRUD] Creating user with validation");

      if (!args.input.email) {
        throw new Error("Email is required");
      }

      const result = await adapter.resolvers.Mutation?.createUser(
        _parent,
        args,
      );
      console.log(`[CRUD] User created: ${result.data.id}`);
      console.log(`[CRUD] RU consumed: ${result.requestCharge}`);

      return result;
    },
    updateUser: async (
      _parent: unknown,
      args: { id: string; input: Record<string, unknown> },
    ) => {
      console.log(`[CRUD] Updating user: ${args.id}`);

      const result = await adapter.resolvers.Mutation?.updateUser(
        _parent,
        args,
      );
      console.log(`[CRUD] Update RU: ${result.requestCharge}`);

      return result;
    },
    deleteUser: async (
      _parent: unknown,
      args: { id: string; partitionKey: string },
    ) => {
      console.log(`[CRUD] Deleting user: ${args.id}`);

      const result = await adapter.resolvers.Mutation?.deleteUser(
        _parent,
        args,
      );
      console.log(`[CRUD] Delete successful`);

      return result;
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

console.log("Full CRUD control server at http://localhost:4000/graphql");
console.log("Operations:");
console.log("- users: CREATE, READ, UPDATE, DELETE, LIST enabled");
console.log("- files: READ, LIST only (create/update/delete disabled)");

const shutdown = async () => {
  adapter.dispose();
  await server.shutdown();
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", shutdown);
if (Deno.build.os !== "windows") {
  Deno.addSignalListener("SIGTERM", shutdown);
}
