# create-scaffold-app CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI tool that lets users run `npx create-scaffold-app my-assistant` and get a working Scaffold project in seconds.

**Architecture:** Interactive prompts collect app name, description, and template choice. Templates map to 3 storage patterns from existing example apps. File generation uses template literals to write standalone projects.

**Tech Stack:** Node.js, `prompts` for CLI interaction, Vitest for testing, TypeScript with ESM.

**Worktree:** `/home/neil/dev/scaffold/.worktrees/phase-1-mvp`

---

## Context

The 3 example apps already exist and serve as source of truth for templates:

| Template Choice | Example Source | Storage Pattern |
|-----------------|----------------|-----------------|
| Generic CRUD (recommended) | `examples/notes-app/` | `{userId}/notes/{noteId}` |
| User-Owned Entities | `examples/travel-planner/` | `{userId}/trips/{tripId}/stops/{stopId}` |
| Shared + Personal Data | `examples/local-guide/` | `places/geohash/{hash}` + `{userId}/favorites/{placeId}` |

---

## Task 1: Scaffold the CLI package

**Files:**
- Create: `packages/create-scaffold-app/package.json`
- Create: `packages/create-scaffold-app/tsconfig.json`
- Create: `packages/create-scaffold-app/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "create-scaffold-app",
  "version": "0.0.1",
  "description": "CLI to create new Scaffold MCP server projects",
  "type": "module",
  "bin": {
    "create-scaffold-app": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "prompts": "^2.4.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/prompts": "^2.4.9",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create minimal src/index.ts**

```typescript
#!/usr/bin/env node

console.log('create-scaffold-app - coming soon');
```

**Step 4: Install and verify**

```bash
cd packages/create-scaffold-app
npm install
npm run build
node dist/index.js
```

Expected: Prints "create-scaffold-app - coming soon"

**Step 5: Commit**

```bash
git add packages/create-scaffold-app/
git commit -m "feat: scaffold create-scaffold-app CLI package"
```

---

## Task 2: Implement interactive prompts

**Files:**
- Modify: `packages/create-scaffold-app/src/index.ts`
- Create: `packages/create-scaffold-app/src/prompts.ts`

**Step 1: Create prompts.ts with validation**

```typescript
import prompts from 'prompts';

export interface UserChoices {
  appName: string;
  description: string;
  template: 'crud' | 'hierarchy' | 'shared';
}

const APP_NAME_REGEX = /^[a-z0-9-]+$/;

export function validateAppName(name: string): boolean | string {
  if (!name) return 'App name is required';
  if (!APP_NAME_REGEX.test(name)) {
    return 'App name must be lowercase letters, numbers, and hyphens only';
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    return 'App name cannot start or end with a hyphen';
  }
  return true;
}

export async function collectChoices(initialName?: string): Promise<UserChoices | null> {
  const response = await prompts([
    {
      type: 'text',
      name: 'appName',
      message: 'What is your app name?',
      initial: initialName,
      validate: validateAppName,
    },
    {
      type: 'text',
      name: 'description',
      message: 'Description (optional):',
      initial: 'A Scaffold MCP server',
    },
    {
      type: 'select',
      name: 'template',
      message: 'Choose a template:',
      choices: [
        {
          title: 'Generic CRUD (recommended)',
          description: 'Simple per-user data storage. Best for most apps.',
          value: 'crud',
        },
        {
          title: 'User-Owned Entities',
          description: 'Nested hierarchies like trips with stops, projects with tasks.',
          value: 'hierarchy',
        },
        {
          title: 'Shared + Personal Data',
          description: 'Shared catalog (e.g. places) with per-user favorites/state.',
          value: 'shared',
        },
      ],
      initial: 0,
    },
  ]);

  // User cancelled (Ctrl+C)
  if (!response.appName || !response.template) {
    return null;
  }

  return response as UserChoices;
}
```

**Step 2: Update index.ts to use prompts**

```typescript
#!/usr/bin/env node

import { collectChoices } from './prompts.js';

async function main() {
  const args = process.argv.slice(2);
  const initialName = args[0];

  console.log('\n🏗️  Create Scaffold App\n');

  const choices = await collectChoices(initialName);

  if (!choices) {
    console.log('\nCancelled.');
    process.exit(0);
  }

  console.log('\nYou chose:');
  console.log(`  Name: ${choices.appName}`);
  console.log(`  Description: ${choices.description}`);
  console.log(`  Template: ${choices.template}`);
  console.log('\n(Generation coming next...)');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

**Step 3: Build and test interactively**

```bash
npm run build
node dist/index.js my-app
```

Expected: Prompts appear, name pre-filled with "my-app"

**Step 4: Commit**

```bash
git add packages/create-scaffold-app/src/
git commit -m "feat: add interactive prompts for app creation"
```

---

## Task 3: Add tests for prompts validation

**Files:**
- Create: `packages/create-scaffold-app/src/__tests__/prompts.test.ts`

**Step 1: Write validation tests**

```typescript
import { describe, it, expect } from 'vitest';
import { validateAppName } from '../prompts.js';

describe('validateAppName', () => {
  it('accepts valid lowercase names', () => {
    expect(validateAppName('my-app')).toBe(true);
    expect(validateAppName('app123')).toBe(true);
    expect(validateAppName('my-cool-app')).toBe(true);
  });

  it('rejects empty names', () => {
    expect(validateAppName('')).toBe('App name is required');
  });

  it('rejects uppercase letters', () => {
    expect(validateAppName('MyApp')).toContain('lowercase');
  });

  it('rejects spaces', () => {
    expect(validateAppName('my app')).toContain('lowercase');
  });

  it('rejects special characters', () => {
    expect(validateAppName('my_app')).toContain('lowercase');
    expect(validateAppName('my.app')).toContain('lowercase');
  });

  it('rejects leading/trailing hyphens', () => {
    expect(validateAppName('-my-app')).toContain('hyphen');
    expect(validateAppName('my-app-')).toContain('hyphen');
  });
});
```

**Step 2: Run tests**

```bash
npm test
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/create-scaffold-app/src/__tests__/
git commit -m "test: add validation tests for app name"
```

---

## Task 4: Create template generators

**Files:**
- Create: `packages/create-scaffold-app/src/templates/shared.ts` (shared template pieces)
- Create: `packages/create-scaffold-app/src/templates/crud.ts`
- Create: `packages/create-scaffold-app/src/templates/hierarchy.ts`
- Create: `packages/create-scaffold-app/src/templates/shared-data.ts`

**Step 1: Create shared.ts with common templates**

Read `examples/notes-app/` files for exact patterns, then create:

```typescript
export function generatePackageJson(appName: string, description: string): string {
  return JSON.stringify({
    name: appName,
    version: "0.0.1",
    description,
    type: "module",
    scripts: {
      build: "tsc",
      dev: "wrangler dev",
      deploy: "wrangler deploy",
      test: "vitest run",
      "test:watch": "vitest"
    },
    dependencies: {
      "@scaffold/core": "*"
    },
    devDependencies: {
      "@cloudflare/workers-types": "^4.20240208.0",
      typescript: "^5.0.0",
      vitest: "^1.0.0",
      wrangler: "^3.0.0"
    }
  }, null, 2);
}

export function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2022"],
      types: ["@cloudflare/workers-types"],
      strict: true,
      skipLibCheck: true,
      noEmit: true
    },
    include: ["src/**/*"]
  }, null, 2);
}

export function generateWranglerToml(appName: string): string {
  return `name = "${appName}"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "STORAGE"
id = "<YOUR_KV_NAMESPACE_ID>"
preview_id = "<YOUR_PREVIEW_KV_NAMESPACE_ID>"
`;
}

export function generateIndexTs(): string {
  return `import { ScaffoldServer, CloudflareKVAdapter } from '@scaffold/core';
import { tools } from './tools.js';

export interface Env {
  STORAGE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const server = new ScaffoldServer({
      tools,
      storage: new CloudflareKVAdapter(env.STORAGE),
    });
    return server.handle(request);
  },
};
`;
}
```

**Step 2: Create crud.ts**

Read `examples/notes-app/src/tools.ts` and `examples/notes-app/src/__tests__/tools.test.ts` for exact code, then create template that generates those files.

```typescript
export function generateCrudTools(): string {
  // Copy exact content from examples/notes-app/src/tools.ts
  return `import { ScaffoldTool } from '@scaffold/core';

// ... (copy full tools.ts content from notes-app)
`;
}

export function generateCrudTests(): string {
  // Copy exact content from examples/notes-app/src/__tests__/tools.test.ts
  return `import { describe, it, expect, beforeEach } from 'vitest';
// ... (copy full test content from notes-app)
`;
}
```

**Step 3: Create hierarchy.ts**

Same approach - read from `examples/travel-planner/src/tools.ts`.

**Step 4: Create shared-data.ts**

Same approach - read from `examples/local-guide/src/tools.ts` and include geohash.ts.

**Step 5: Commit**

```bash
git add packages/create-scaffold-app/src/templates/
git commit -m "feat: add template generators for all 3 patterns"
```

---

## Task 5: Implement file generation

**Files:**
- Create: `packages/create-scaffold-app/src/generator.ts`
- Modify: `packages/create-scaffold-app/src/index.ts`

**Step 1: Create generator.ts**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UserChoices } from './prompts.js';
import * as shared from './templates/shared.js';
import * as crud from './templates/crud.js';
import * as hierarchy from './templates/hierarchy.js';
import * as sharedData from './templates/shared-data.js';

export interface GeneratorResult {
  success: boolean;
  targetDir: string;
  error?: string;
}

export async function generateProject(choices: UserChoices): Promise<GeneratorResult> {
  const targetDir = path.resolve(process.cwd(), choices.appName);

  // Check if directory exists
  if (fs.existsSync(targetDir)) {
    return { success: false, targetDir, error: `Directory ${choices.appName} already exists` };
  }

  // Create directory structure
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'src', '__tests__'), { recursive: true });

  // Write common files
  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    shared.generatePackageJson(choices.appName, choices.description)
  );
  fs.writeFileSync(
    path.join(targetDir, 'tsconfig.json'),
    shared.generateTsConfig()
  );
  fs.writeFileSync(
    path.join(targetDir, 'wrangler.toml'),
    shared.generateWranglerToml(choices.appName)
  );
  fs.writeFileSync(
    path.join(targetDir, 'src', 'index.ts'),
    shared.generateIndexTs()
  );

  // Write template-specific files
  switch (choices.template) {
    case 'crud':
      fs.writeFileSync(path.join(targetDir, 'src', 'tools.ts'), crud.generateCrudTools());
      fs.writeFileSync(path.join(targetDir, 'src', '__tests__', 'tools.test.ts'), crud.generateCrudTests());
      break;
    case 'hierarchy':
      fs.writeFileSync(path.join(targetDir, 'src', 'tools.ts'), hierarchy.generateHierarchyTools());
      fs.writeFileSync(path.join(targetDir, 'src', '__tests__', 'tools.test.ts'), hierarchy.generateHierarchyTests());
      break;
    case 'shared':
      fs.writeFileSync(path.join(targetDir, 'src', 'tools.ts'), sharedData.generateSharedTools());
      fs.writeFileSync(path.join(targetDir, 'src', 'geohash.ts'), sharedData.generateGeohash());
      fs.writeFileSync(path.join(targetDir, 'src', '__tests__', 'tools.test.ts'), sharedData.generateSharedTests());
      break;
  }

  return { success: true, targetDir };
}
```

**Step 2: Update index.ts to call generator**

```typescript
#!/usr/bin/env node

import { collectChoices } from './prompts.js';
import { generateProject } from './generator.js';
import { printNextSteps } from './output.js';

async function main() {
  const args = process.argv.slice(2);
  const initialName = args[0];

  console.log('\n🏗️  Create Scaffold App\n');

  const choices = await collectChoices(initialName);

  if (!choices) {
    console.log('\nCancelled.');
    process.exit(0);
  }

  console.log(`\nCreating ${choices.appName}...`);

  const result = await generateProject(choices);

  if (!result.success) {
    console.error(`\nError: ${result.error}`);
    process.exit(1);
  }

  printNextSteps(choices, result.targetDir);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

**Step 3: Commit**

```bash
git add packages/create-scaffold-app/src/
git commit -m "feat: implement project file generation"
```

---

## Task 6: Add post-generation output

**Files:**
- Create: `packages/create-scaffold-app/src/output.ts`

**Step 1: Create output.ts**

```typescript
import type { UserChoices } from './prompts.js';

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  crud: `Your app uses the Generic CRUD pattern.
Storage keys: {userId}/notes/{noteId}
Each user has their own isolated data. Simple and flexible.
Customize: Edit src/tools.ts to change the entity name and fields.`,

  hierarchy: `Your app uses the User-Owned Entities pattern.
Storage keys: {userId}/trips/{tripId} and {userId}/trips/{tripId}/stops/{stopId}
Users own top-level entities that contain nested children.
Customize: Edit src/tools.ts to change entity names and hierarchy.`,

  shared: `Your app uses the Shared + Personal Data pattern.
Storage keys: places/geohash/{hash} (shared) and {userId}/favorites/{placeId} (per-user)
A shared catalog visible to all, with per-user overlays for favorites/state.
Customize: Edit src/tools.ts to change the shared entity and user overlay.`,
};

export function printNextSteps(choices: UserChoices, targetDir: string): void {
  console.log(`
✅ Created ${choices.appName}!

Next steps:

  cd ${choices.appName}
  npm install
  npm test          # Run tests (should pass!)
  npm run dev       # Start local dev server

Before deploying, set up Cloudflare KV:

  wrangler kv namespace create STORAGE
  # Copy the ID into wrangler.toml

Then deploy:

  npm run deploy

---

${TEMPLATE_DESCRIPTIONS[choices.template]}

Docs: https://github.com/iamneilroberts/scaffold
`);
}
```

**Step 2: Commit**

```bash
git add packages/create-scaffold-app/src/output.ts
git commit -m "feat: add post-generation next steps output"
```

---

## Task 7: Add generator tests

**Files:**
- Create: `packages/create-scaffold-app/src/__tests__/generator.test.ts`

**Step 1: Write generator tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateProject } from '../generator.js';

describe('generateProject', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir('/');
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates crud template with correct files', async () => {
    const result = await generateProject({
      appName: 'test-app',
      description: 'Test description',
      template: 'crud',
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test-app', 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test-app', 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test-app', 'wrangler.toml'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test-app', 'src', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test-app', 'src', 'tools.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test-app', 'src', '__tests__', 'tools.test.ts'))).toBe(true);
  });

  it('generates hierarchy template with correct files', async () => {
    const result = await generateProject({
      appName: 'test-app',
      description: 'Test',
      template: 'hierarchy',
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test-app', 'src', 'tools.ts'))).toBe(true);
  });

  it('generates shared template with geohash.ts', async () => {
    const result = await generateProject({
      appName: 'test-app',
      description: 'Test',
      template: 'shared',
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'test-app', 'src', 'geohash.ts'))).toBe(true);
  });

  it('fails if directory already exists', async () => {
    fs.mkdirSync(path.join(tempDir, 'existing-app'));

    const result = await generateProject({
      appName: 'existing-app',
      description: 'Test',
      template: 'crud',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('generates valid package.json with app name', async () => {
    await generateProject({
      appName: 'my-cool-app',
      description: 'My cool app',
      template: 'crud',
    });

    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'my-cool-app', 'package.json'), 'utf-8')
    );

    expect(pkgJson.name).toBe('my-cool-app');
    expect(pkgJson.description).toBe('My cool app');
    expect(pkgJson.dependencies['@scaffold/core']).toBe('*');
  });
});
```

**Step 2: Run tests**

```bash
npm test
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/create-scaffold-app/src/__tests__/generator.test.ts
git commit -m "test: add generator tests for all templates"
```

---

## Task 8: End-to-end verification

**Step 1: Build the CLI**

```bash
cd packages/create-scaffold-app
npm run build
```

**Step 2: Test generation in temp directory**

```bash
cd /tmp
node /path/to/packages/create-scaffold-app/dist/index.js my-test-app
# Select "Generic CRUD"
cd my-test-app
npm install
npm test
```

Expected: All generated tests pass

**Step 3: Test each template**

Repeat for hierarchy and shared templates.

**Step 4: Clean up and final commit**

```bash
git add -A
git commit -m "feat: complete create-scaffold-app CLI"
```

---

## Important Notes

1. **Read example apps first:** Before writing template generators (Task 4), read the actual files in `examples/notes-app/`, `examples/travel-planner/`, and `examples/local-guide/`. Copy exact code, don't paraphrase.

2. **Workspace dependency:** Use `"*"` for `@scaffold/core` dependency, NOT `"workspace:*"`.

3. **Import pattern:** Import from `@scaffold/core` directly, not subpaths.

4. **Generated projects are standalone:** They should work outside the monorepo when users create them.

5. **Keep geohash.ts:** The shared template needs `src/geohash.ts` copied from `examples/local-guide/src/geohash.ts`.
