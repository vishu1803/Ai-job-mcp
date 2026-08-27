/**
 * @file MCP Apps Registry & Server Binding (SEP-1865 / io.modelcontextprotocol/ui).
 *
 * Exposes registered interactive UI App resources and helper function for
 * McpServerWrapper registration.
 */

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
 * Registers all supported MCP Apps UI resources onto an McpServerWrapper instance.
 *
 * @param {import('../server.js').McpServerWrapper} mcpServer - Server wrapper instance.
 * @param {object} [_deps={}] - Optional dependencies.
 */
export function registerCareerMcpApps(mcpServer, _deps = {}) {
  // 1. Register Job Fit Radar UI App
  mcpServer.registerResource(JOB_FIT_RADAR_APP_RESOURCE, async (_context, _uri) => {
    const html = renderJobFitRadarAppHtml();
    return {
      contents: [
        {
          uri: JOB_FIT_RADAR_URI,
          mimeType: JOB_FIT_RADAR_APP_RESOURCE.mimeType,
          text: html,
        },
      ],
    };
  });
}
