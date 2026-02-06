# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a security issue, please use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab
2. Click **Report a vulnerability**
3. Provide details about the vulnerability

This is the preferred and only supported method for reporting security vulnerabilities.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity, typically 1-4 weeks

## Security Considerations

This project is currently in **alpha**. Before using in production, understand these known limitations:

### Documented Limitations

1. **CSP uses `unsafe-inline`** - The admin dashboard uses inline scripts/styles. Admin access requires authentication, limiting exposure.

2. **Rate limiting is per-isolate** - Fallback auth scan rate limiting is not distributed. In production, use Cloudflare's native rate limiting or Durable Objects.

3. **KV optimistic locking is not atomic** - Cloudflare KV does not support transactions. For critical data requiring strong consistency, consider Durable Objects.

4. **Plugin trust model** - Plugins run with full access like npm dependencies. Only install plugins you trust.

See [docs/ISSUES-REVIEW-2026-02-05.md](docs/ISSUES-REVIEW-2026-02-05.md) for the complete list of reviewed issues.

### Security Requirements

- **Auth keys must be cryptographically random** - Use `crypto.randomUUID()` or 32+ random characters. Do NOT use user-chosen passwords as auth keys.
- **Keep `ADMIN_KEY` secret** - This grants full admin access.
- **Review plugin code** before installation.

## Security Features

- SHA-256 hashed auth key storage (no plaintext)
- Multi-layer authentication with rate limiting
- XSS prevention with output escaping
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- HttpOnly, Secure, SameSite=Strict session cookies

Note: Constant-time string comparison is implemented but has known limitations (see issue #14 in the issues review).

## Past Security Fixes

See the git history and [docs/ISSUES-REVIEW-2026-02-05.md](docs/ISSUES-REVIEW-2026-02-05.md) for details on past security reviews and fixes.
