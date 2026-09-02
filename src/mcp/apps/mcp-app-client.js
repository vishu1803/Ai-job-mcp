/**
 * @file Browser entry point for MCP Apps client.
 *
 * Re-exports the official App and PostMessageTransport from
 * @modelcontextprotocol/ext-apps for use in sandboxed iframe apps
 * that cannot resolve npm imports at runtime.
 *
 * Bundle with esbuild:
 *   esbuild src/mcp/apps/mcp-app-client.js \
 *     --bundle --format=iife --platform=browser \
 *     --outfile=src/mcp/apps/mcp-app-client.bundle.js
 */

import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-with-deps';

export { App, PostMessageTransport };
