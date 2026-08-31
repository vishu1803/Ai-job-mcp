/**
 * @file MCP Registry Contract Test Suite.
 *
 * Validates 100% bidirectional parity between:
 * 1. Live MCP Server Registrations (createCareerMcpServer)
 * 2. Documented Public MCP Registry Catalog (src/views/mcp-docs.page.js)
 * 3. Scope and Role Authorizations
 * 4. Human-in-the-Loop Write Safety Enforcements
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import {
  TOOLS_CATALOG,
  RESOURCES_CATALOG,
  PROMPTS_CATALOG,
} from '../../src/views/mcp-docs.page.js';

describe('MCP Registry Contract & Documentation Reconciliation Suite', () => {
  const server = createCareerMcpServer();
  const liveTools = server.getRegisteredTools();
  const liveResources = server.getRegisteredResources();
  const livePrompts = server.getRegisteredPrompts();

  // 1. Tool Counts & Parity
  test('1. Tool Inventory Parity: Live server and Documentation have identical counts (26 tools)', () => {
    assert.equal(
      liveTools.length,
      26,
      `Live registered tools count should be 26, got ${liveTools.length}`
    );
    assert.equal(
      TOOLS_CATALOG.length,
      26,
      `Documented tools count should be 26, got ${TOOLS_CATALOG.length}`
    );
  });

  test('2. Tool Name Exact Match: Every live registered tool is documented without mismatch or renaming', () => {
    const liveToolNames = new Set(liveTools.map((t) => t.name));
    const docToolNames = new Set(TOOLS_CATALOG.map((t) => t.name));

    assert.equal(liveToolNames.size, 26, 'No duplicate tool names in live server');
    assert.equal(docToolNames.size, 26, 'No duplicate tool names in documentation catalog');

    for (const toolName of liveToolNames) {
      assert.ok(
        docToolNames.has(toolName),
        `Live registered tool "${toolName}" is missing from public documentation catalog`
      );
    }

    for (const docName of docToolNames) {
      assert.ok(
        liveToolNames.has(docName),
        `Documented tool "${docName}" is not registered on live MCP server`
      );
    }
  });

  test('3. Tool Authorization Scopes & Roles: Live tools match documented scopes and roles', () => {
    const docMap = new Map(TOOLS_CATALOG.map((t) => [t.name, t]));

    for (const liveTool of liveTools) {
      const doc = docMap.get(liveTool.name);
      assert.ok(doc, `Documentation missing for tool ${liveTool.name}`);

      // Check required scopes
      const primaryScope = liveTool.requiredScopes[0];
      assert.equal(
        doc.scope,
        primaryScope,
        `Scope mismatch for tool ${liveTool.name}: live=${primaryScope}, doc=${doc.scope}`
      );

      // Check required role
      assert.equal(
        doc.role,
        liveTool.requiredRole,
        `Role mismatch for tool ${liveTool.name}: live=${liveTool.requiredRole}, doc=${doc.role}`
      );
    }
  });

  test('4. Tool Required Parameters: Documentation accurately lists parameters without hallucinations', () => {
    const docMap = new Map(TOOLS_CATALOG.map((t) => [t.name, t]));

    for (const liveTool of liveTools) {
      const doc = docMap.get(liveTool.name);
      assert.ok(doc, `Tool ${liveTool.name} must be documented`);
      assert.ok(Array.isArray(doc.parameters), `Tool ${liveTool.name} parameters must be an array`);

      // If live tool has inputSchema
      if (liveTool.inputSchema && liveTool.inputSchema.shape) {
        const schemaShape = liveTool.inputSchema.shape;
        const schemaKeys = new Set(Object.keys(schemaShape));

        // 1. Verify that no documented parameters are hallucinated
        for (const docParam of doc.parameters) {
          assert.ok(
            schemaKeys.has(docParam.name),
            `Documented parameter "${docParam.name}" for tool "${liveTool.name}" does not exist in live schema`
          );
        }

        // 2. Verify that all mandatory schema fields are documented as required
        for (const [key, zodType] of Object.entries(schemaShape)) {
          const isOptional =
            (typeof zodType.isOptional === 'function' && zodType.isOptional()) ||
            (typeof zodType.isNullable === 'function' && zodType.isNullable()) ||
            zodType._def?.typeName === 'ZodOptional' ||
            zodType._def?.typeName === 'ZodDefault';

          if (!isOptional) {
            const docParam = doc.parameters.find((p) => p.name === key);
            assert.ok(
              docParam,
              `Mandatory schema parameter "${key}" for tool "${liveTool.name}" must be documented`
            );
            assert.equal(
              docParam.required,
              true,
              `Mandatory schema parameter "${key}" for tool "${liveTool.name}" must be marked required in documentation`
            );
          }
        }
      }
    }
  });

  // 2. Resource Counts & Parity
  test('5. Resource Inventory Parity: Live server and Documentation have identical counts (8 resources)', () => {
    assert.equal(
      liveResources.length,
      8,
      `Live registered resources count should be 8, got ${liveResources.length}`
    );
    assert.equal(
      RESOURCES_CATALOG.length,
      8,
      `Documented resources count should be 8, got ${RESOURCES_CATALOG.length}`
    );
  });

  test('6. Resource URI & MIME Exact Match: Every live resource is documented with matching URI and MIME', () => {
    const liveResourceUris = new Set(liveResources.map((r) => r.uri));
    const docResourceUris = new Set(RESOURCES_CATALOG.map((r) => r.uri));

    assert.equal(liveResourceUris.size, 8, 'No duplicate resource URIs in live server');
    assert.equal(docResourceUris.size, 8, 'No duplicate resource URIs in documentation');

    for (const uri of liveResourceUris) {
      assert.ok(
        docResourceUris.has(uri),
        `Live resource URI "${uri}" is missing from documentation catalog`
      );
    }

    const docMap = new Map(RESOURCES_CATALOG.map((r) => [r.uri, r]));
    for (const liveRes of liveResources) {
      const doc = docMap.get(liveRes.uri);
      assert.ok(doc);
      assert.equal(
        doc.mimeType,
        liveRes.mimeType,
        `MIME mismatch for resource ${liveRes.uri}: live=${liveRes.mimeType}, doc=${doc.mimeType}`
      );
    }
  });

  // 3. Prompt Counts & Parity
  test('7. Prompt Inventory Parity: Live server and Documentation have identical counts (4 prompts)', () => {
    assert.equal(
      livePrompts.length,
      4,
      `Live registered prompts count should be 4, got ${livePrompts.length}`
    );
    assert.equal(
      PROMPTS_CATALOG.length,
      4,
      `Documented prompts count should be 4, got ${PROMPTS_CATALOG.length}`
    );
  });

  test('8. Prompt Name Exact Match: Every live prompt is documented with matching name and arguments', () => {
    const livePromptNames = new Set(livePrompts.map((p) => p.name));
    const docPromptNames = new Set(PROMPTS_CATALOG.map((p) => p.name));

    assert.equal(livePromptNames.size, 4, 'No duplicate prompt names in live server');
    assert.equal(docPromptNames.size, 4, 'No duplicate prompt names in documentation');

    for (const promptName of livePromptNames) {
      assert.ok(
        docPromptNames.has(promptName),
        `Live prompt "${promptName}" is missing from documentation catalog`
      );
    }
  });

  // 4. Critical Write Safety Boundaries
  test('9. Write Safety Contracts: High-risk write tools require explicit human approval and MEMBER role', () => {
    const prTool = liveTools.find((t) => t.name === 'confirm_and_create_pr');
    assert.ok(prTool, 'confirm_and_create_pr must be registered');
    assert.equal(prTool.requiredRole, 'MEMBER');
    assert.deepEqual(prTool.requiredScopes, ['career:write']);

    const submitTool = liveTools.find((t) => t.name === 'submit_job_application');
    assert.ok(submitTool, 'submit_job_application must be registered');
    assert.equal(submitTool.requiredRole, 'MEMBER');
    assert.deepEqual(submitTool.requiredScopes, ['career:write']);

    const docPr = TOOLS_CATALOG.find((t) => t.name === 'confirm_and_create_pr');
    assert.match(docPr.safetyNotes, /Approval Ticket/i);

    const docSubmit = TOOLS_CATALOG.find((t) => t.name === 'submit_job_application');
    assert.match(docSubmit.safetyNotes, /human authorization/i);
  });
});
