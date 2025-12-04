#!/usr/bin/env -S deno run -A

import { build, emptyDir } from 'jsr:@deno/dnt@0.41.3'

await emptyDir('./npm')

await build({
  entryPoints: ['./mod.ts'],
  outDir: './npm',
  shims: {
    deno: true,
  },
  mappings: {
    'npm:graphql@^16.12.0': {
      name: 'graphql',
      version: '^16.0.0',
      peerDependency: true,
    },
  },
  package: {
    name: '@oneiriq/cosmiq',
    version: Deno.args[0] || '0.3.0',
    description: 'A data-first schema SDL generator and validator for Azure Cosmos DB and GraphQL.',
    license: 'MIT',
    author: {
      name: 'Shon Thomas <shon@oneiriq.com> (https://oneiriq.com)',
    },
    publishConfig: {
      access: 'public',
    },
    repository: {
      type: 'git',
      url: 'git+https://github.com/albedosehen/cosmiq.git',
    },
    bugs: {
      url: 'https://github.com/albedosehen/cosmiq/issues',
    },
    homepage: 'https://github.com/albedosehen/cosmiq#readme',
    keywords: [
      'cosmosdb',
      'sdl',
      'schema',
      'graphql',
      'data-validation',
      'deno',
      'typescript',
      'graphql-mesh',
      'data-first',
      'codegen',
    ],
    exports: {
      '.': {
        import: './esm/mod.js',
        require: './script/mod.js',
      },
      './yoga': {
        import: './esm/src/adapters/yoga.js',
        require: './script/src/adapters/yoga.js',
      },
      './apollo': {
        import: './esm/src/adapters/apollo.js',
        require: './script/src/adapters/apollo.js',
      },
      './generic': {
        import: './esm/src/adapters/generic.js',
        require: './script/src/adapters/generic.js',
      },
      './mesh': {
        import: './esm/src/adapters/mesh.js',
        require: './script/src/adapters/mesh.js',
      },
      './hive': {
        import: './esm/src/adapters/hive.js',
        require: './script/src/adapters/hive.js',
      },
      './adapters': {
        import: './esm/src/adapters/mod.js',
        require: './script/src/adapters/mod.js',
      },
      './errors': {
        import: './esm/src/errors/mod.js',
        require: './script/src/errors/mod.js',
      },
      './handler': {
        import: './esm/src/handler/mod.js',
        require: './script/src/handler/mod.js',
      },
      './infer': {
        import: './esm/src/infer/mod.js',
        require: './script/src/infer/mod.js',
      },
      './schema': {
        import: './esm/src/schema/mod.js',
        require: './script/src/schema/mod.js',
      },
      './types': {
        import: './esm/src/types/mod.js',
        require: './script/src/types/mod.js',
      },
      './utils': {
        import: './esm/src/utils/mod.js',
        require: './script/src/utils/mod.js',
      },
    },
    engines: {
      node: '>=18.0.0',
    },
    dependencies: {
      '@azure/cosmos': '^4.9.0',
    },
    peerDependencies: {
      'graphql': '^16.0.0',
      '@graphql-tools/schema': '^10.0.30',
      '@graphql-tools/utils': '^10.11.0',
      '@graphql-tools/executor': '^1.5.0',
      'graphql-yoga': '^5.17.1',
      '@apollo/server': '^5.2.0',
    },
    devDependencies: {
      'graphql': '^16.12.0',
      '@graphql-tools/schema': '^10.0.30',
      '@graphql-tools/utils': '^10.11.0',
      '@graphql-tools/executor': '^1.5.0',
    },
    peerDependenciesMeta: {
      'graphql-yoga': {
        optional: true,
      },
      '@apollo/server': {
        optional: true,
      },
    },
  },
  async postBuild() {
    Deno.copyFileSync('LICENSE', 'npm/LICENSE')
    Deno.copyFileSync('README.md', 'npm/README.md')
    Deno.copyFileSync('CHANGELOG.md', 'npm/CHANGELOG.md')

    const pkgPath = 'npm/package.json'
    const pkgRaw = await Deno.readTextFile(pkgPath)
    const pkg = JSON.parse(pkgRaw)

    // remove graphql and @graphql-tools packages from dependencies if dnt added them
    const packagesToRemove = ['graphql', '@graphql-tools/schema', '@graphql-tools/utils', '@graphql-tools/executor']
    if (pkg.dependencies) {
      for (const pkgName of packagesToRemove) {
        if (pkg.dependencies[pkgName]) {
          delete pkg.dependencies[pkgName]
          console.log(`Removed ${pkgName} from dependencies`)
        }
      }
    }

    if (!pkg.peerDependencies) pkg.peerDependencies = {}
    pkg.peerDependencies.graphql = '^16.12.0'
    pkg.peerDependencies['@graphql-tools/schema'] = '^10.0.30'
    pkg.peerDependencies['@graphql-tools/utils'] = '^10.11.0'
    pkg.peerDependencies['@graphql-tools/executor'] = '^1.5.0'

    await Deno.writeTextFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log('Normalized graphql and @graphql-tools peerDependencies in package.json')

    try {
      await Deno.remove('npm/package-lock.json')
      console.log('Removed npm/package-lock.json from build output')
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    }
  },
  importMap: './deno.json',
  test: false,
  typeCheck: 'both',
  declaration: 'separate',
  scriptModule: 'cjs',
  filterDiagnostic(_diagnostic) {
    return true
  },
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022'],
  },
})

console.log('\nNPM package build completed.\n')
