/**
 * @file MCP Apps Registry & Server Binding (Official MCP Apps Protocol).
 *
 * Exposes registered interactive UI App resources and helper function for
 * McpServerWrapper registration.
 *
 * Uses the official MCP Apps MIME type: text/html;profile=mcp-app
 * Tool registration normalizes _meta.ui.resourceUri for host discovery.
 */

import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from '@modelcontextprotocol/ext-apps/server';
import {
  JOB_FIT_RADAR_URI,
  JOB_FIT_RADAR_APP_RESOURCE,
  renderJobFitRadarAppHtml,
} from './job-fit-radar.app.js';

export { JOB_FIT_RADAR_URI, JOB_FIT_RADAR_APP_RESOURCE, renderJobFitRadarAppHtml };

/**
 * Catalog of all supported MCP Apps.
 */
export const CAREER_MCP_APPS_CATALOG = Object.freeze({
  [JOB_FIT_RADAR_URI]: {
    resource: JOB_FIT_RADAR_APP_RESOURCE,
    render: renderJobFitRadarAppHtml,
  },
});

/**
 * Normalizes _meta to include both legacy (ui/resourceUri) and modern (ui.resourceUri)
 * formats for maximum host compatibility.
 *
 * @param {object} meta Tool metadata object
 * @returns {object} Normalized metadata with both key formats
 */
function normalizeUiMeta(meta) {
  const resourceUri = meta?.ui?.resourceUri || meta?.[RESOURCE_URI_META_KEY];
  if (!resourceUri) return meta;
  return {
    ...meta,
    ui: { ...(meta.ui || {}), resourceUri },
    [RESOURCE_URI_META_KEY]: resourceUri,
  };
}

/**
 * Wraps a tool definition to include MCP App UI metadata.
 *
 * @param {object} toolDef Tool definition with _meta.ui.resourceUri
 * @returns {object} Tool definition with normalized UI metadata
 */
export function withAppUiMeta(toolDef) {
  return {
    ...toolDef,
    _meta: normalizeUiMeta(toolDef._meta),
  };
}

/**
 * Registers all supported MCP Apps UI resources onto an McpServerWrapper instance.
 *
 * @param {import('../server.js').McpServerWrapper} mcpServer - Server wrapper instance.
 * @param {object} [_deps={}] - Optional dependencies.
 */
export function registerCareerMcpApps(mcpServer, _deps = {}) {
  // 1. Register Job Fit Radar UI App resource
  mcpServer.registerResource(JOB_FIT_RADAR_APP_RESOURCE, async (_context, _uri) => {
    const html = renderJobFitRadarAppHtml();
    return {
      contents: [
        {
          uri: JOB_FIT_RADAR_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
        },
      ],
    };
  });
}
