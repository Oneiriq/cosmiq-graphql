/**
 * Custom Resolver Example
 * Demonstrates extending auto-generated resolvers with custom logic
 *
 * Run with:
 * deno task example:custom-resolvers
 */

import { createYoga } from "graphql-yoga";
import { createYogaAdapter } from "../../src/adapters/yoga.ts";

const COSMOS_URI = "https://localhost:8081";
const COSMOS_PRIMARY_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
const CONNECTION_STRING =
  `AccountEndpoint=${COSMOS_URI}/;AccountKey=${COSMOS_PRIMARY_KEY}`;
const DATABASE = "db1";
const PORT = 4000;

async function startServer() {
  try {
    console.log("Initializing server with custom resolvers...");

    const adapter = await createYogaAdapter({
      connectionString: CONNECTION_STRING,
      database: DATABASE,
      containers: [
        { name: "users", typeName: "User" },
        { name: "files", typeName: "File" },
      ],
    });

    // Access base resolvers
    const baseResolvers = adapter.resolvers;

    // Extended schema with custom types
    const extendedSDL = `
      ${adapter.sdl}

      type UserStats {
        totalFiles: Int!
        lastActivity: String
      }

      extend type User {
        stats: UserStats
        displayName: String!
        isActive: Boolean!
      }

      extend type Query {
        searchUsers(query: String!): [User!]!
        activeUsers: [User!]!
      }
    `;

    // Custom resolvers merging with base resolvers
    const customResolvers = {
      Query: {
        ...baseResolvers.Query,

        // Custom search resolver
        searchUsers: async (_parent: unknown, args: { query: string }) => {
          console.log(`[CUSTOM] Searching users with query: "${args.query}"`);

          const container = adapter.context.containers.get("User");
          if (!container) return [];

          const querySpec = {
            query: "SELECT * FROM c WHERE CONTAINS(LOWER(c.name), @searchTerm)",
            parameters: [{
              name: "@searchTerm",
              value: args.query.toLowerCase(),
            }],
          };

          const { resources } = await container.items.query(querySpec)
            .fetchAll();
          console.log(`[CUSTOM] Found ${resources.length} users`);
          return resources;
        },

        // Custom active users resolver
        activeUsers: async () => {
          console.log("[CUSTOM] Fetching active users");

          const container = adapter.context.containers.get("User");
          if (!container) return [];

          const querySpec = {
            query:
              "SELECT * FROM c WHERE c._deleted != true AND c.lastLoginAt > @threshold",
            parameters: [{
              name: "@threshold",
              value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                .toISOString(),
            }],
          };

          const { resources } = await container.items.query(querySpec)
            .fetchAll();
          return resources;
        },
      },

      Mutation: {
        ...baseResolvers.Mutation,

        // Wrap base createUser with logging
        createUser: async (_parent: unknown, args: { input: unknown }) => {
          console.log("[CUSTOM] Before create - validating user input");

          const result = await baseResolvers.Mutation?.createUser(
            _parent,
            args,
          );

          // Custom post-creation logic
          console.log(`[CUSTOM] User created with ID: ${result.data.id}`);
          console.log(`[CUSTOM] RU consumed: ${result.requestCharge}`);

          // Could trigger events, send notifications, etc.
          await sendWelcomeEmail(result.data);

          return result;
        },
      },

      User: {
        ...baseResolvers.User,

        // Custom computed field
        displayName: (parent: { name: string; email: string }) => {
          return parent.name || parent.email?.split("@")[0] || "Unknown";
        },

        // Custom boolean field
        isActive: (parent: { lastLoginAt?: string }) => {
          if (!parent.lastLoginAt) return false;
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          return new Date(parent.lastLoginAt).getTime() > thirtyDaysAgo;
        },

        // Custom nested object resolver
        stats: async (parent: { id: string; pk: string }) => {
          const filesContainer = adapter.context.containers.get("File");
          if (!filesContainer) {
            return { totalFiles: 0, lastActivity: null };
          }

          const querySpec = {
            query:
              "SELECT COUNT(1) as count, MAX(c._updatedAt) as lastUpdate FROM c WHERE c.userId = @userId",
            parameters: [{ name: "@userId", value: parent.id }],
          };

          const { resources } = await filesContainer.items.query(querySpec)
            .fetchAll();
          const stats = resources[0] || { count: 0, lastUpdate: null };

          return {
            totalFiles: stats.count,
            lastActivity: stats.lastUpdate,
          };
        },
      },

      UserStats: {
        totalFiles: (parent: { totalFiles: number }) => parent.totalFiles,
        lastActivity: (parent: { lastActivity: string | null }) =>
          parent.lastActivity,
      },
    };

    const yoga = createYoga({
      schema: {
        typeDefs: extendedSDL,
        resolvers: customResolvers,
      },
      graphiql: true,
      landingPage: false,
    });

    const server = Deno.serve({
      port: PORT,
      onListen: ({ hostname, port }) => {
        console.log(
          `Server with custom resolvers at http://${hostname}:${port}`,
        );
        console.log(`GraphiQL available at http://${hostname}:${port}/graphql`);
      },
    }, yoga.fetch);

    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down...`);
      adapter.dispose();
      await server.shutdown();
      Deno.exit(0);
    };

    if (Deno.build.os !== "windows") {
      Deno.addSignalListener("SIGTERM", () => shutdown("SIGTERM"));
    }
    Deno.addSignalListener("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start server:", error);
    Deno.exit(1);
  }
}

// Mock email service
async function sendWelcomeEmail(
  user: { id: string; email?: string; name?: string },
) {
  console.log(`[EMAIL] Sending welcome email to ${user.email || user.name}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(`[EMAIL] Welcome email sent for user ${user.id}`);
}

startServer();
