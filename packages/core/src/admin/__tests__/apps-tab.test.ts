import { describe, it, expect } from 'vitest';
import { createAppsTab } from '../tabs/apps.js';
import { InMemoryAdapter } from '../../storage/in-memory.js';
import type { ScaffoldConfig, AdminContext } from '../../types/public-api.js';

function createTestConfig(overrides?: Partial<ScaffoldConfig>): ScaffoldConfig {
  return {
    app: {
      name: 'Test App',
      description: 'A test application',
      version: '1.0.0',
    },
    mcp: {
      serverName: 'test-server',
      protocolVersion: '2024-11-05',
    },
    auth: {
      adminKey: 'admin-key',
      validKeys: ['user-key'],
      enableKeyIndex: false,
      enableFallbackScan: false,
      fallbackScanRateLimit: 5,
      fallbackScanBudget: 100,
    },
    admin: {
      path: '/admin',
    },
    ...overrides,
  };
}

function createTestContext(): AdminContext {
  return {
    isAdmin: true,
    storage: new InMemoryAdapter(),
    env: {},
    requestId: 'test-request-id',
  };
}

describe('Apps tab', () => {
  it('renders app card with name, description, and version from config', async () => {
    const config = createTestConfig({
      app: {
        name: 'My Cool App',
        description: 'Does cool things',
        version: '2.3.1',
      },
    });
    const tab = createAppsTab(config);
    const ctx = createTestContext();

    const content = await tab.render(ctx);

    expect(content.html).toContain('My Cool App');
    expect(content.html).toContain('Does cool things');
    expect(content.html).toContain('v2.3.1');
  });

  it('renders icon and worker URL from appMeta', async () => {
    const config = createTestConfig({
      appMeta: {
        icon: '\u{1F680}',
        workerUrl: 'https://my-app.workers.dev',
      },
    });
    const tab = createAppsTab(config);
    const ctx = createTestContext();

    const content = await tab.render(ctx);

    expect(content.html).toContain('\u{1F680}');
    expect(content.html).toContain('https://my-app.workers.dev');
    expect(content.html).toContain('href="https://my-app.workers.dev"');
  });

  it('handles missing appMeta gracefully with defaults', async () => {
    const config = createTestConfig();
    // No appMeta set
    const tab = createAppsTab(config);
    const ctx = createTestContext();

    const content = await tab.render(ctx);

    // Should use the default package icon
    expect(content.html).toContain('\u{1F4E6}');
    // Worker URL should show "Not configured"
    expect(content.html).toContain('Not configured');
    // Should still show app name/description/version
    expect(content.html).toContain('Test App');
    expect(content.html).toContain('A test application');
    expect(content.html).toContain('v1.0.0');
  });

  it('prefers appMeta.description over app.description when present', async () => {
    const config = createTestConfig({
      app: {
        name: 'My App',
        description: 'Full description for MCP',
        version: '1.0.0',
      },
      appMeta: {
        description: 'Short catalog blurb',
      },
    });
    const tab = createAppsTab(config);
    const ctx = createTestContext();

    const content = await tab.render(ctx);

    expect(content.html).toContain('Short catalog blurb');
    expect(content.html).not.toContain('Full description for MCP');
  });

  it('has correct tab metadata', () => {
    const config = createTestConfig();
    const tab = createAppsTab(config);

    expect(tab.id).toBe('apps');
    expect(tab.label).toBe('Apps');
    expect(tab.order).toBe(3);
    expect(tab.icon).toBe('\u{1F4E6}');
  });
});
