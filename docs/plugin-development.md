# Plugin Development

Plugins extend Scaffold with reusable functionality. This guide covers creating, publishing, and using plugins.

## Plugin Structure

A plugin is an object implementing the `ScaffoldPlugin` interface:

```typescript
interface ScaffoldPlugin {
  name: string;           // npm package name
  version: string;        // semver
  description?: string;

  // Lifecycle hooks
  onRegister?: (server: ScaffoldServerInterface) => Promise<void>;
  onInitialize?: (ctx: ToolContext) => Promise<void>;
  onShutdown?: () => Promise<void>;

  // Contributions
  tools?: ScaffoldTool[];
  resources?: ScaffoldResource[];
  prompts?: ScaffoldPrompt[];
  routes?: RouteGroup;
  adminTabs?: AdminTab[];
}
```

## Creating a Basic Plugin

### Minimal Example

```typescript
import type { ScaffoldPlugin } from '@scaffold/core';

export const helloPlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-hello',
  version: '1.0.0',
  description: 'A simple greeting plugin',

  tools: [
    {
      name: 'hello:greet',
      description: 'Say hello to someone',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
      handler: async (input) => ({
        content: [{ type: 'text', text: `Hello, ${input.name}!` }],
      }),
    },
  ],
};
```

### Using the Plugin

```typescript
import { ScaffoldServer } from '@scaffold/core';
import { helloPlugin } from '@myorg/scaffold-plugin-hello';

const server = new ScaffoldServer({
  config,
  storage,
  plugins: [helloPlugin],
});
```

## Lifecycle Hooks

### onRegister

Called once when the plugin is registered. Use for setup that requires server access.

```typescript
const analyticsPlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-analytics',
  version: '1.0.0',

  onRegister: async (server) => {
    // Access server configuration
    const config = server.getConfig();
    console.log(`Analytics plugin registered for ${config.app.name}`);

    // Register additional tools dynamically
    server.registerTool({
      name: 'analytics:custom_event',
      description: 'Track a custom analytics event',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({
        content: [{ type: 'text', text: 'Event tracked' }],
      }),
    });
  },
};
```

### onInitialize

Called on each request. Use for per-request setup.

```typescript
const loggingPlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-logging',
  version: '1.0.0',

  onInitialize: async (ctx) => {
    console.log(`Request ${ctx.requestId} from user ${ctx.userId}`);
  },
};
```

### onShutdown

Called when the server shuts down. Use for cleanup.

```typescript
const connectionPlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-db',
  version: '1.0.0',

  onShutdown: async () => {
    await dbConnection.close();
    console.log('Database connection closed');
  },
};
```

## Adding Tools

Tools are the primary way plugins extend Scaffold functionality.

```typescript
import type { ScaffoldPlugin, ScaffoldTool, errors } from '@scaffold/core';

const weatherTool: ScaffoldTool = {
  name: 'weather:current',
  description: 'Get current weather for a location',
  inputSchema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius',
      },
    },
    required: ['city'],
  },
  handler: async (input, ctx) => {
    // Access environment variables (API keys, etc.)
    const apiKey = ctx.env.WEATHER_API_KEY as string;

    if (!apiKey) {
      return errors.createToolError({
        code: 'INTERNAL_ERROR',
        message: 'Weather API not configured',
        retryable: false,
      });
    }

    // Fetch weather data
    const response = await fetch(
      `https://api.weather.example/current?city=${input.city}&key=${apiKey}`
    );
    const data = await response.json();

    return {
      content: [{
        type: 'text',
        text: `Weather in ${input.city}: ${data.temperature}° ${input.units}`,
      }],
    };
  },
};

export const weatherPlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-weather',
  version: '1.0.0',
  tools: [weatherTool],
};
```

## Adding Resources

Resources expose data that Claude can read.

```typescript
const userProfileResource: ScaffoldResource = {
  uri: 'scaffold://myapp/user-profile',
  name: 'User Profile',
  description: 'Current user profile data',
  mimeType: 'application/json',
  handler: async (ctx) => {
    const profile = await ctx.storage.get(`user:${ctx.userId}:profile`);

    return {
      uri: 'scaffold://myapp/user-profile',
      mimeType: 'application/json',
      text: JSON.stringify(profile ?? { userId: ctx.userId }),
    };
  },
};

export const profilePlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-profile',
  version: '1.0.0',
  resources: [userProfileResource],
};
```

## Adding Prompts

Prompts provide reusable message templates.

```typescript
const summarizePrompt: ScaffoldPrompt = {
  name: 'summarize',
  description: 'Summarize content with a specific style',
  arguments: [
    { name: 'style', description: 'Summary style (brief, detailed, bullet)', required: true },
    { name: 'audience', description: 'Target audience', required: false },
  ],
  handler: async (args, ctx) => {
    const audienceNote = args.audience
      ? ` The audience is ${args.audience}.`
      : '';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please summarize the following content in a ${args.style} style.${audienceNote}`,
        },
      },
    ];
  },
};

export const promptsPlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-prompts',
  version: '1.0.0',
  prompts: [summarizePrompt],
};
```

## Adding HTTP Routes

Plugins can add custom HTTP endpoints.

```typescript
const webhookRoutes: RouteGroup = {
  prefix: '/webhooks',
  routes: [
    {
      method: 'POST',
      path: '/stripe',
      description: 'Handle Stripe webhook events',
      handler: async (request, env) => {
        const signature = request.headers.get('Stripe-Signature');
        const body = await request.text();

        // Verify and process webhook
        // ...

        return new Response('OK', { status: 200 });
      },
    },
    {
      method: 'POST',
      path: '/github',
      description: 'Handle GitHub webhook events',
      handler: async (request, env) => {
        // Process GitHub event
        return new Response('OK', { status: 200 });
      },
    },
  ],
};

export const webhooksPlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-webhooks',
  version: '1.0.0',
  routes: webhookRoutes,
};
```

## Adding Admin Tabs

See [Admin Dashboard Guide](./admin-dashboard.md) for detailed admin tab development.

```typescript
import { escapeHtml } from '@scaffold/core/admin';

const statsTab: AdminTab = {
  id: 'stats',
  label: 'Statistics',
  icon: '📊',
  order: 50,

  render: async (ctx) => {
    const userCount = (await ctx.storage.list('user:')).keys.length;

    return {
      html: `
        <div class="stats-panel">
          <h2>Application Statistics</h2>
          <div class="stat">
            <span class="label">Total Users:</span>
            <span class="value">${escapeHtml(String(userCount))}</span>
          </div>
        </div>
      `,
      styles: `
        .stats-panel { padding: 1rem; }
        .stat { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
        .label { font-weight: bold; }
      `,
    };
  },

  getBadge: async (ctx) => {
    // Show badge if there are issues
    const errors = await ctx.storage.get('shared:error_count');
    if (errors && errors > 0) {
      return { text: String(errors), type: 'error' };
    }
    return null;
  },
};

export const statsPlugin: ScaffoldPlugin = {
  name: '@myorg/scaffold-plugin-stats',
  version: '1.0.0',
  adminTabs: [statsTab],
};
```

## Plugin Configuration

Plugins can accept configuration through factory functions:

```typescript
interface TelemetryConfig {
  endpoint: string;
  sampleRate?: number;
  debug?: boolean;
}

export function createTelemetryPlugin(config: TelemetryConfig): ScaffoldPlugin {
  const { endpoint, sampleRate = 1.0, debug = false } = config;

  return {
    name: '@myorg/scaffold-plugin-telemetry',
    version: '1.0.0',

    tools: [
      {
        name: 'telemetry:track',
        description: 'Track an event',
        inputSchema: {
          type: 'object',
          properties: {
            event: { type: 'string' },
            properties: { type: 'object' },
          },
          required: ['event'],
        },
        handler: async (input, ctx) => {
          // Sample based on rate
          if (Math.random() > sampleRate) {
            return { content: [{ type: 'text', text: 'Sampled out' }] };
          }

          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: input.event,
              properties: input.properties,
              userId: ctx.userId,
              timestamp: Date.now(),
            }),
          });

          if (debug) {
            console.log(`Tracked: ${input.event}`);
          }

          return { content: [{ type: 'text', text: 'Event tracked' }] };
        },
      },
    ],
  };
}

// Usage
const telemetryPlugin = createTelemetryPlugin({
  endpoint: 'https://analytics.example.com/events',
  sampleRate: 0.1, // 10% sampling
  debug: true,
});
```

## Publishing Plugins

### Package Structure

```
scaffold-plugin-myfeature/
├── src/
│   ├── index.ts          # Main export
│   ├── tools/            # Tool implementations
│   ├── resources/        # Resource implementations
│   └── admin/            # Admin tab implementations
├── package.json
├── tsconfig.json
└── README.md
```

### package.json

```json
{
  "name": "@myorg/scaffold-plugin-myfeature",
  "version": "1.0.0",
  "description": "My feature plugin for Scaffold",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "keywords": ["scaffold", "mcp", "plugin"],
  "peerDependencies": {
    "@scaffold/core": "^0.1.0"
  },
  "devDependencies": {
    "@scaffold/core": "^0.1.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  }
}
```

### Export Pattern

```typescript
// src/index.ts
export { myPlugin } from './plugin';
export { createMyPlugin } from './plugin';
export type { MyPluginConfig } from './types';

// Re-export types users might need
export type { MyCustomTool, MyCustomResource } from './types';
```

## Testing Plugins

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core/storage';
import { myPlugin } from './plugin';

describe('myPlugin', () => {
  it('should have correct metadata', () => {
    expect(myPlugin.name).toBe('@myorg/scaffold-plugin-myfeature');
    expect(myPlugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should register tools', () => {
    expect(myPlugin.tools).toHaveLength(2);
    expect(myPlugin.tools?.[0].name).toBe('myfeature:action');
  });

  it('should execute tool correctly', async () => {
    const tool = myPlugin.tools?.[0];
    const ctx = {
      userId: 'test-user',
      authKey: 'test-key',
      isAdmin: false,
      storage: new InMemoryAdapter(),
      env: {},
      debugMode: false,
      requestId: 'test-request',
    };

    const result = await tool?.handler({ input: 'test' }, ctx);
    expect(result?.isError).toBeFalsy();
  });
});
```

## Best Practices

1. **Namespace your tools** - Use `pluginname:action` format
2. **Handle missing config gracefully** - Check for required env vars
3. **Use TypeScript** - Export types for better DX
4. **Document required setup** - ENV vars, KV namespaces, etc.
5. **Version your plugin** - Follow semver strictly
6. **Test thoroughly** - Unit test tools, resources, and hooks
7. **Keep dependencies minimal** - Avoid bloating bundle size
8. **Use peer dependencies** - For @scaffold/core
