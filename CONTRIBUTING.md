# Contributing to Scaffold

Thanks for your interest in contributing to Scaffold! This document outlines how to get started.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/iamneilroberts/scaffold.git
   cd scaffold
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests (from repo root):
   ```bash
   npm test
   ```

4. Other useful commands:
   ```bash
   npm run build      # Build all packages
   npm run lint       # Run linter
   npm run typecheck  # Type checking
   ```

## Pull Request Process

1. **Fork the repo** and create your branch from `master`
2. **Write tests** for any new functionality
3. **Run the test suite** and ensure all tests pass
4. **Update documentation** if you're changing APIs or behavior
5. **Open a PR** with a clear description of what you've changed and why

## Code Style

- TypeScript throughout
- Use the existing code style (run `npm run lint` to check)
- Write clear, descriptive commit messages
- Keep PRs focused - one feature or fix per PR

## Security Contributions

If you discover a security vulnerability, **do not open a public issue**. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

For security-related improvements (hardening, new security features):
- Clearly document the threat model
- Include tests that verify the security property
- Update `docs/security-guide.md` if relevant

## What We're Looking For

- Bug fixes with regression tests
- Documentation improvements
- Performance optimizations (with benchmarks)
- New features that align with the project goals
- Security hardening

## Questions?

Open a discussion or issue if you're unsure about something before investing significant time.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
