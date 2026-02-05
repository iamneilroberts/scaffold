# Deployment Guide

This guide covers deploying Scaffold applications to Cloudflare Workers, from local development to production.

## Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

## Project Structure

```
my-scaffold-app/
├── src/
│   └── index.ts           # Worker entry point
├── .dev.vars              # Local secrets (gitignored)
├── .env.staging           # Staging secrets (gitignored)
├── .env.production        # Production secrets (gitignored)
├── wrangler.toml          # Wrangler configuration
├── package.json
└── tsconfig.json
```

## Local Development

### Configure Local Secrets

Create `.dev.vars` for local development secrets:

```bash
# .dev.vars (gitignored)
ADMIN_KEY=dev-admin-key-change-in-prod
AUTH_KEYS=test-user-1,test-user-2
```

### Configure wrangler.toml

```toml
name = "my-scaffold-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[dev]
port = 8787

# Local KV namespace (automatically created by wrangler dev)
[[kv_namespaces]]
binding = "DATA"
id = "local-dev-id"
preview_id = "local-preview-id"
```

### Run Development Server

```bash
# Start local development server with Miniflare
npx wrangler dev

# With local persistence (data survives restarts)
npx wrangler dev --persist
```

Your server runs at `http://localhost:8787`.

### Test Locally

```bash
# Health check
curl http://localhost:8787/health

# MCP tools/list
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Admin dashboard
open http://localhost:8787/admin
```

## Staging Environment

### Create Staging KV Namespace

```bash
npx wrangler kv:namespace create DATA --env staging
# Note the ID returned, add to wrangler.toml
```

### Configure wrangler.toml

```toml
name = "my-scaffold-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Production KV
[[kv_namespaces]]
binding = "DATA"
id = "your-production-kv-id"

# Staging environment
[env.staging]
name = "my-scaffold-app-staging"

[[env.staging.kv_namespaces]]
binding = "DATA"
id = "your-staging-kv-id"
```

### Set Staging Secrets

```bash
# Set secrets for staging environment
npx wrangler secret put ADMIN_KEY --env staging
npx wrangler secret put AUTH_KEYS --env staging

# Or use bulk upload
npx wrangler secret:bulk .env.staging --env staging
```

### Deploy to Staging

```bash
npx wrangler deploy --env staging
```

Your staging server runs at `my-scaffold-app-staging.your-subdomain.workers.dev`.

## Production Environment

### Create Production KV Namespace

```bash
npx wrangler kv:namespace create DATA
# Note the ID returned, add to wrangler.toml
```

### Set Production Secrets

```bash
# Set secrets for production
npx wrangler secret put ADMIN_KEY
npx wrangler secret put AUTH_KEYS

# List configured secrets
npx wrangler secret list
```

### Deploy to Production

```bash
npx wrangler deploy
```

Your production server runs at `my-scaffold-app.your-subdomain.workers.dev`.

### Custom Domain

Add a custom domain in the Cloudflare dashboard:
1. Go to Workers & Pages → your worker
2. Click "Triggers" tab
3. Add custom domain under "Custom Domains"

Or via wrangler.toml:

```toml
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

## Environment-Specific Configuration

### Using Environment Variables

```typescript
// src/index.ts
interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
  AUTH_KEYS: string;
  ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const config: ScaffoldConfig = {
      app: {
        name: 'my-app',
        description: 'My MCP application',
        version: '1.0.0',
      },
      mcp: {
        serverName: 'my-app',
        protocolVersion: '2024-11-05',
      },
      auth: {
        adminKey: env.ADMIN_KEY,
        validKeys: env.AUTH_KEYS?.split(',').filter(Boolean),
        enableKeyIndex: true,
        enableFallbackScan: true,
        fallbackScanRateLimit: 5,
        fallbackScanBudget: 100,
      },
      admin: {
        path: '/admin',
      },
    };

    const server = new ScaffoldServer({
      config,
      storage: new CloudflareKVAdapter(env.DATA),
    });

    return server.fetch(request, env, ctx);
  },
};
```

### Vars in wrangler.toml

Non-secret configuration can go in wrangler.toml:

```toml
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

[env.staging.vars]
ENVIRONMENT = "staging"
LOG_LEVEL = "debug"
```

## CI/CD with GitHub Actions

### Basic Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run type-check
      - run: npm test

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npx wrangler deploy --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Setting Up Cloudflare API Token

1. Go to Cloudflare dashboard → My Profile → API Tokens
2. Create token with "Edit Cloudflare Workers" template
3. Add token to GitHub repository secrets as `CLOUDFLARE_API_TOKEN`

### Protected Production Deployments

Use GitHub environments for production protection:

1. Go to repository Settings → Environments
2. Create "production" environment
3. Add required reviewers
4. Optionally restrict to specific branches

## Monitoring and Logging

### Cloudflare Analytics

View analytics in the Cloudflare dashboard:
- Request counts
- Error rates
- CPU time
- Response times

### Logging

Use `console.log` for logging (visible in Wrangler tail):

```typescript
// In your tool handler
handler: async (input, ctx) => {
  console.log(`[${ctx.requestId}] Processing request for user ${ctx.userId}`);
  // ...
}
```

### Tail Logs

```bash
# View live logs from production
npx wrangler tail

# View logs from staging
npx wrangler tail --env staging

# Filter by status
npx wrangler tail --status error
```

## Rollback

### Quick Rollback

```bash
# List recent deployments
npx wrangler deployments list

# Rollback to previous version
npx wrangler rollback
```

### Version Pinning

Pin to a specific deployment:

```bash
npx wrangler deployments list
# Copy deployment ID

npx wrangler rollback --version <deployment-id>
```

## Troubleshooting

### Common Issues

**"KV namespace not found"**
- Ensure KV ID in wrangler.toml matches created namespace
- Check you're using correct environment flag

**"Secret not found"**
- Secrets are environment-specific
- Use `--env staging` when setting staging secrets

**"Worker exceeded CPU time limit"**
- Optimize slow operations
- Use `ctx.waitUntil()` for background work
- Consider caching expensive computations

### Debug Mode

Enable debug mode for verbose logging:

```typescript
auth: {
  adminKey: env.ADMIN_KEY,
  // ... other config
},
// Enable debug for specific users
```

### Health Check Endpoint

Use the built-in `/health` endpoint for monitoring:

```bash
curl https://my-app.workers.dev/health
# {"status":"ok","version":"1.0.0","timestamp":"..."}
```

## Security Checklist

Before going to production:

- [ ] Admin key is set via `wrangler secret put`
- [ ] Auth keys are not hardcoded
- [ ] CORS origins are restricted (if applicable)
- [ ] Rate limiting is configured
- [ ] CSP headers are appropriate
- [ ] Sensitive data is not logged
- [ ] KV namespace IDs are correct per environment
