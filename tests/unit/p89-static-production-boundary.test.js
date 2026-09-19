/**
 * @file Static Architectural Boundary Test (P89)
 *
 * Statically analyzes the codebase to enforce hard architectural boundaries:
 * 1. Production domain services (src/services/**) must never instantiate GoogleGenAI or import @google/genai.
 * 2. Production domain services must never directly make HTTP requests to generativelanguage.googleapis.com.
 * 3. SDK instantiation is exclusively confined to approved infrastructure adapters:
 *    - src/clients/vertex/vertex-adapter.js
 *    - src/clients/gemini/gemini-adapter.js
 * 4. Frontend views (src/views/**) must never receive or render AI provider secrets/keys.
 * 5. Web routes (src/routes/**) must never leak provider credentials in responses.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function findFilesRecursive(dir, extensions = ['.js']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results.push(...findFilesRecursive(fullPath, extensions));
      }
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('P89 Static Production Boundary Test', () => {
  const rootDir = path.resolve(import.meta.dirname, '../../');
  const servicesDir = path.join(rootDir, 'src', 'services');
  const routesDir = path.join(rootDir, 'src', 'routes');
  const viewsDir = path.join(rootDir, 'src', 'views');
  const clientsDir = path.join(rootDir, 'src', 'clients');

  it('1. Production domain services never instantiate new GoogleGenAI(', () => {
    const serviceFiles = findFilesRecursive(servicesDir);
    assert.ok(serviceFiles.length > 0, 'Must inspect domain services');

    const violatingFiles = [];
    for (const file of serviceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('new GoogleGenAI(') || content.includes('new GoogleGenAI (')) {
        violatingFiles.push(path.relative(rootDir, file));
      }
    }

    assert.deepStrictEqual(
      violatingFiles,
      [],
      `Domain services must not instantiate GoogleGenAI directly. Found in: ${violatingFiles.join(', ')}`
    );
  });

  it('2. Production domain services never import @google/genai directly', () => {
    const serviceFiles = findFilesRecursive(servicesDir);
    const violatingFiles = [];

    for (const file of serviceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes("from '@google/genai'") || content.includes('from "@google/genai"')) {
        violatingFiles.push(path.relative(rootDir, file));
      }
    }

    assert.deepStrictEqual(
      violatingFiles,
      [],
      `Domain services must not import @google/genai directly. Found in: ${violatingFiles.join(', ')}`
    );
  });

  it('3. Production domain services never reference generativelanguage.googleapis.com', () => {
    const serviceFiles = findFilesRecursive(servicesDir);
    const violatingFiles = [];

    for (const file of serviceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('generativelanguage.googleapis.com')) {
        violatingFiles.push(path.relative(rootDir, file));
      }
    }

    assert.deepStrictEqual(
      violatingFiles,
      [],
      `Domain services must not call generativelanguage.googleapis.com directly. Found in: ${violatingFiles.join(', ')}`
    );
  });

  it('4. SDK instantiation is strictly confined to approved infrastructure provider adapters', () => {
    const allSrcFiles = findFilesRecursive(path.join(rootDir, 'src'));
    const approvedAdapterFiles = [
      path.normalize('src/clients/vertex/vertex-adapter.js'),
      path.normalize('src/clients/gemini/gemini-adapter.js'),
    ];

    const filesWithGenAiInstantiation = [];
    for (const file of allSrcFiles) {
      const relPath = path.normalize(path.relative(rootDir, file));
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('new GoogleGenAI(') || content.includes('new GoogleGenAI (')) {
        filesWithGenAiInstantiation.push(relPath);
      }
    }

    for (const file of filesWithGenAiInstantiation) {
      assert.ok(
        approvedAdapterFiles.some((approved) => file.endsWith(approved)),
        `Unauthorized GoogleGenAI instantiation found in ${file}`
      );
    }
  });

  it('5. Frontend views never expose raw AI API keys or Cloud service account credentials', () => {
    const viewFiles = findFilesRecursive(viewsDir);
    assert.ok(viewFiles.length > 0, 'Must inspect views');

    const forbiddenPatterns = [
      'process.env.GEMINI_API_KEY',
      'process.env.GOOGLE_API_KEY',
      'process.env.GOOGLE_APPLICATION_CREDENTIALS',
    ];

    const violations = [];
    for (const file of viewFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pat of forbiddenPatterns) {
        if (content.includes(pat)) {
          violations.push({ file: path.relative(rootDir, file), pattern: pat });
        }
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `Frontend views must never reference credentials: ${JSON.stringify(violations)}`
    );
  });

  it('6. Web routes never leak GEMINI_API_KEY or GOOGLE_APPLICATION_CREDENTIALS in response bodies', () => {
    const routeFiles = findFilesRecursive(routesDir);
    const forbiddenPatterns = [
      'process.env.GEMINI_API_KEY',
      'process.env.GOOGLE_APPLICATION_CREDENTIALS',
    ];

    const violations = [];
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pat of forbiddenPatterns) {
        // Exclude comments or config passing to server initialization
        if (content.includes(`send({ ${pat}`) || content.includes(`reply.send(${pat}`)) {
          violations.push({ file: path.relative(rootDir, file), pattern: pat });
        }
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `Web routes must never leak credentials: ${JSON.stringify(violations)}`
    );
  });
});
