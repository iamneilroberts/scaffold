/**
 * @voygent/scaffold-core/node
 *
 * Node.js-only exports. These use `node:fs` and `node:http` which are not
 * available in Cloudflare Workers. Import from this subpath for local
 * development and migration utilities.
 *
 * @example
 * ```typescript
 * import { FileStorageAdapter, startLocalServer, loadEnvFile } from '@voygent/scaffold-core/node';
 * ```
 *
 * @packageDocumentation
 */

export { FileStorageAdapter, type FileStorageOptions } from './storage/file-storage.js';
export { startLocalServer, loadEnvFile, type LocalServerOptions, type LocalServerHandle } from './server/local-server.js';
export { exportToKVBulk } from './storage/migration.js';
