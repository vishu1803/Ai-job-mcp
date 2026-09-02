/**
 * @file Browser entry point for MCP Apps client.
 *
 * Exposes App and PostMessageTransport as window globals for use in
 * sandboxed iframe apps that cannot resolve npm imports at runtime.
 *
 * Bundle with esbuild:
 *   esbuild src/mcp/apps/mcp-app-client-entry.js \
 *     --bundle --format=iife --platform=browser --global-name=__McpApps \
 *     --outfile=src/mcp/apps/mcp-app-client.bundle.js
 */

import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-with-deps';

// Expose as globals for inline scripts in HTML resources
window.McpApp = App;
window.McpPostMessageTransport = PostMessageTransport;
