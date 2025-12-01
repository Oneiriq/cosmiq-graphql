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
    name: '@albedosehen/cosmosdb-schemagen',
    version: Deno.args[0] || '0.1.0',
    description: 'A data-first schema SDL generator and validator for Azure Cosmos DB and GraphQL.',
    license: 'MIT',
    author: {
      name: 'albedosehen'
    },
    publishConfig: {
      access: 'public'
    },
    repository: {
      type: 'git',
      url: 'git+https://github.com/albedosehen/cosmosdb-schemagen.git'
    },
    bugs: {
      url: 'https://github.com/albedosehen/cosmosdb-schemagen/issues'
    },
    homepage: 'https://github.com/albedosehen/cosmosdb-schemagen#readme',
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
      'codegen'
    ],
    engines: {
      node: '>=18.0.0'
    },
    dependencies: { },
  },
  postBuild() {
    // Copy important files to npm directory
    Deno.copyFileSync('LICENSE', 'npm/LICENSE')
    Deno.copyFileSync('README.md', 'npm/README.md')
    Deno.copyFileSync('CHANGELOG.md', 'npm/CHANGELOG.md')
  },

  importMap: './deno.json',
  test: false,
  typeCheck: 'both',
  declaration: 'separate',
  scriptModule: 'cjs',
  filterDiagnostic(diagnostic) {
    return true
  },
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022'],
  },
})

console.log('\nNPM package build completed.\n')