#!/usr/bin/env -S deno run -A

import { build, emptyDir } from 'jsr:@deno/dnt@0.41.3'

await emptyDir('./npm')

await build({
  entryPoints: ['./mod.ts'],
  outDir: './npm',
  shims: {
    deno: true,
  },
  package: {
    name: '@oneiriq/cosmiq-graphql',
    version: Deno.args[0] || '0.3.0',
    description: 'Data-first GraphQL for Azure CosmosDB',
    license: 'MIT',
    author: 'Shon Thomas <shon@oneiriq.com> (https://oneiriq.com)',
    publishConfig: {
      access: 'public',
    },
    repository: {
      type: 'git',
      url: 'git+https://github.com/albedosehen/cosmiq-graphql.git',
    },
    bugs: {
      url: 'https://github.com/albedosehen/cosmiq-graphql/issues',
    },
    homepage: 'https://github.com/albedosehen/cosmiq-graphql#readme',
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
      'graphql': '^14.0.0 || ^15.0.0 || ^16.0.0 || ^17.0.0',
      '@graphql-tools/schema': '^10.0.30',
      '@graphql-tools/utils': '^10.11.0',
      '@graphql-tools/executor': '^1.5.0'
    },
    devDependencies: {
      '@graphql-tools/schema': '^10.0.30',
      '@graphql-tools/utils': '^10.11.0',
      '@graphql-tools/executor': '^1.5.0',
    },
    peerDependenciesMeta: {
      graphql: {
        optional: true
      }
      // 'graphql-yoga': {
      //   optional: true,
      // },
      // '@apollo/server': {
      //   optional: true,
      // },
    },
  },
  async postBuild() {
    Deno.copyFileSync('LICENSE', 'npm/LICENSE')
    Deno.copyFileSync('README.md', 'npm/README.md')
    Deno.copyFileSync('CHANGELOG.md', 'npm/CHANGELOG.md')

    const pkgPath = 'npm/package.json'
    const pkgRaw = await Deno.readTextFile(pkgPath)
    const pkg = JSON.parse(pkgRaw)

    // remove @graphql-tools packages from dependencies if dnt added them
    const packagesToRemove = ['@graphql-tools/schema', '@graphql-tools/utils', '@graphql-tools/executor']
    if (pkg.dependencies) {
      for (const pkgName of packagesToRemove) {
        if (pkg.dependencies[pkgName]) {
          delete pkg.dependencies[pkgName]
          console.log(`Removed ${pkgName} from dependencies`)
        }
      }
    }

    // Remove devDependencies entirely - they're only needed during build for type checking
    if (pkg.devDependencies) {
      delete pkg.devDependencies
      console.log('Removed devDependencies from package.json')
    }

    if (!pkg.peerDependencies) pkg.peerDependencies = {}
    pkg.peerDependencies['graphql'] = '^14.0.0 || ^15.0.0 || ^16.0.0 || ^17.0.0'
    pkg.peerDependencies['@graphql-tools/schema'] = '^10.0.30'
    pkg.peerDependencies['@graphql-tools/utils'] = '^10.11.0'
    pkg.peerDependencies['@graphql-tools/executor'] = '^1.5.0'

    await Deno.writeTextFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log('Normalized @graphql-tools peerDependencies in package.json')

    try {
      await Deno.remove('npm/package-lock.json')
      console.log('Removed npm/package-lock.json from build output')
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    }

    try {
      await Deno.remove('npm/node_modules', { recursive: true })
      console.log('Removed npm/node_modules from build output')
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error
    }

    // Pack the npm directory into a tarball for local installation
    console.log('Creating tarball for local installation...')
    const packCommand = new Deno.Command('npm', {
      args: ['pack'],
      cwd: 'npm',
      stdout: 'piped',
      stderr: 'piped',
    })
    const packResult = await packCommand.output()
    if (!packResult.success) {
      const error = new TextDecoder().decode(packResult.stderr)
      throw new Error(`Failed to pack npm directory: ${error}`)
    }
    const tarballName = new TextDecoder().decode(packResult.stdout).trim()
    console.log(`Created tarball: npm/${tarballName}`)
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
