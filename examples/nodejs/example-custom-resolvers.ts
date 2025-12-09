import { createYoga } from 'graphql-yoga';
import { createYogaAdapter } from '@oneiriq/cosmiq-graphql';

const adapter = await createYogaAdapter({
  connectionString:
    'AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
  database: 'db1',
  containers: [
    { name: 'users', typeName: 'User' },
    { name: 'files', typeName: 'File' },
  ],
});

const extendedSchema = `
  ${adapter.sdl}

  type Analytics {
    totalUsers: Int!
    totalFiles: Int!
    filesPerUser: Float!
  }

  type UserActivity {
    user: User!
    fileCount: Int!
    lastActivity: String
  }

  extend type Query {
    analytics: Analytics!
    topUsers(limit: Int = 10): [UserActivity!]!
    searchFiles(query: String!, userId: String): [File!]!
  }

  extend type User {
    files: [File!]!
    fileCount: Int!
  }
`;

const customResolvers = {
  Query: {
    ...adapter.resolvers.Query,

    analytics: async () => {
      console.log('[ANALYTICS] Computing platform analytics');

      const usersContainer = adapter.context.containers.get('User');
      const filesContainer = adapter.context.containers.get('File');

      const [usersResult, filesResult] = await Promise.all([
        usersContainer?.items.query('SELECT COUNT(1) as count FROM c')
          .fetchAll(),
        filesContainer?.items.query('SELECT COUNT(1) as count FROM c')
          .fetchAll(),
      ]);

      const totalUsers = usersResult?.resources[0]?.count ?? 0;
      const totalFiles = filesResult?.resources[0]?.count ?? 0;

      return {
        totalUsers,
        totalFiles,
        filesPerUser: totalUsers > 0 ? totalFiles / totalUsers : 0,
      };
    },

    topUsers: async (_parent: unknown, args: { limit: number }) => {
      console.log(`[TOP_USERS] Finding top ${args.limit} users by file count`);

      const filesContainer = adapter.context.containers.get('File');

      const querySpec = {
        query: `
          SELECT c.userId, COUNT(1) as fileCount, MAX(c._ts) as lastActivity
          FROM c
          WHERE IS_DEFINED(c.userId)
          GROUP BY c.userId
          ORDER BY COUNT(1) DESC
          OFFSET 0 LIMIT @limit
        `,
        parameters: [{ name: '@limit', value: args.limit }],
      };

      const { resources } =
        await filesContainer?.items.query(querySpec).fetchAll() ??
          { resources: [] };

      const usersContainer = adapter.context.containers.get('User');

      return await Promise.all(
        resources.map(
          async (
            item: { userId: string; fileCount: number; lastActivity: number },
          ) => {
            const { resource: user } =
              await usersContainer?.item(item.userId, item.userId).read() ?? {};
            return {
              user: user ?? { id: item.userId },
              fileCount: item.fileCount,
              lastActivity: new Date(item.lastActivity * 1000).toISOString(),
            };
          },
        ),
      );
    },

    searchFiles: async (
      _parent: unknown,
      args: { query: string; userId?: string },
    ) => {
      console.log(`[SEARCH] Searching files: "${args.query}"`);

      const filesContainer = adapter.context.containers.get('File');

      const querySpec = {
        query: args.userId
          ? 'SELECT * FROM c WHERE CONTAINS(LOWER(c.name), @query) AND c.userId = @userId'
          : 'SELECT * FROM c WHERE CONTAINS(LOWER(c.name), @query)',
        parameters: [
          { name: '@query', value: args.query.toLowerCase() },
          ...(args.userId ? [{ name: '@userId', value: args.userId }] : []),
        ],
      };

      const { resources } =
        await filesContainer?.items.query(querySpec).fetchAll() ??
          { resources: [] };
      console.log(`[SEARCH] Found ${resources.length} files`);

      return resources;
    },
  },

  User: {
    ...adapter.resolvers.User,

    files: async (parent: { id: string; pk: string }) => {
      const filesContainer = adapter.context.containers.get('File');

      const querySpec = {
        query: 'SELECT * FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: parent.id }],
      };

      const { resources } =
        await filesContainer?.items.query(querySpec).fetchAll() ??
          { resources: [] };

      return resources;
    },

    fileCount: async (parent: { id: string }) => {
      const filesContainer = adapter.context.containers.get('File');

      const querySpec = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: parent.id }],
      };

      const { resources } =
        await filesContainer?.items.query(querySpec).fetchAll() ??
          { resources: [] };

      return resources[0] ?? 0;
    },
  },

  Analytics: {
    totalUsers: (parent: { totalUsers: number }) => parent.totalUsers,
    totalFiles: (parent: { totalFiles: number }) => parent.totalFiles,
    filesPerUser: (parent: { filesPerUser: number }) =>
      Math.round(parent.filesPerUser * 100) / 100,
  },

  UserActivity: {
    user: (parent: { user: unknown }) => parent.user,
    fileCount: (parent: { fileCount: number }) => parent.fileCount,
    lastActivity: (parent: { lastActivity: string | null }) =>
      parent.lastActivity,
  },

  Mutation: adapter.resolvers.Mutation,
};

const yoga = createYoga({
  schema: {
    typeDefs: extendedSchema,
    resolvers: customResolvers,
  },
  graphiql: true,
});

console.log(
  'Advanced custom resolvers server at http://localhost:4000/graphql',
);
console.log('Custom features:');
console.log('- analytics: Platform-wide analytics');
console.log('- topUsers: Leaderboard by file count');
console.log('- searchFiles: Full-text file search');
console.log('- User.files: User-specific file listing');