import { createYoga } from "graphql-yoga";
import { createYogaAdapter } from "@oneiriq/cosmiq-graphql";

const adapter = await createYogaAdapter({
  connectionString:
    "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",
  database: "db1",
  containers: [
    { name: "users", typeName: "User" },
    { name: "files", typeName: "Document" },
  ],
});

const extendedSchema = `
  ${adapter.sdl}

  type FileMetadata {
    uploadedBy: User
    size: Int!
    mimeType: String
  }

  extend type Document {
    metadata: FileMetadata
  }
`;

const customResolvers = {
  Query: adapter.resolvers.Query,
  Mutation: adapter.resolvers.Mutation,
  Document: {
    ...adapter.resolvers.Document,
    metadata: (
      parent: { size?: number; mimeType?: string; userId?: string },
    ) => ({
      size: parent.size ?? 0,
      mimeType: parent.mimeType ?? "application/octet-stream",
      uploadedBy: parent.userId ? { id: parent.userId } : null,
    }),
  },
  FileMetadata: {
    uploadedBy: async (parent: { uploadedBy: { id: string } | null }) => {
      if (!parent.uploadedBy) return null;
      const container = adapter.context.containers.get("User");
      const { resource } =
        await container?.item(parent.uploadedBy.id, parent.uploadedBy.id)
          .read() ?? {};
      return resource;
    },
    size: (parent: { size: number }) => parent.size,
    mimeType: (parent: { mimeType: string }) => parent.mimeType,
  },
};

const yoga = createYoga({
  schema: {
    typeDefs: extendedSchema,
    resolvers: customResolvers,
  },
  graphiql: true,
});

console.log("Server with custom types at http://localhost:4000/graphql");

Deno.serve({ port: 4000 }, yoga.fetch);
