import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImportScanner } from '../../src/extractors/github/code-scanners/import-scanner.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';

describe('Python Skill Noise Filter & ImportScanner', () => {
  it('filters out Python stdlib and local generic imports', () => {
    const pythonCode = `
from server import app
from app import create_app
from time import sleep
from random import choice
from tasks import run
from forms import Form
from parser import parse
from core import config
import os
import sys
import json
import pathlib
import typing
import fastapi
import sqlalchemy
from pydantic import BaseModel
    `;

    const results = ImportScanner.scanImports(pythonCode, 'app.py');
    const importedPackages = results.map((r) => r.packageName);

    // Noise tokens must NOT be extracted
    assert.equal(importedPackages.includes('server'), false);
    assert.equal(importedPackages.includes('app'), false);
    assert.equal(importedPackages.includes('time'), false);
    assert.equal(importedPackages.includes('random'), false);
    assert.equal(importedPackages.includes('tasks'), false);
    assert.equal(importedPackages.includes('forms'), false);
    assert.equal(importedPackages.includes('parser'), false);
    assert.equal(importedPackages.includes('core'), false);
    assert.equal(importedPackages.includes('os'), false);
    assert.equal(importedPackages.includes('sys'), false);
    assert.equal(importedPackages.includes('json'), false);
    assert.equal(importedPackages.includes('pathlib'), false);
    assert.equal(importedPackages.includes('typing'), false);

    // Legitimate third-party packages MUST be extracted
    assert.equal(importedPackages.includes('fastapi'), true);
    assert.equal(importedPackages.includes('sqlalchemy'), true);
    assert.equal(importedPackages.includes('pydantic'), true);
  });

  it('SkillTaxonomyEngine rejects generic noise tokens from becoming skills', () => {
    const noiseTerms = [
      'app',
      'core',
      'server',
      'time',
      'tasks',
      'forms',
      'parser',
      'random',
      'utils',
      'helpers',
    ];
    for (const term of noiseTerms) {
      const norm = SkillTaxonomyEngine.normalizeSkill(term);
      assert.equal(norm.isNoise, true, `Expected term '${term}' to have isNoise === true`);
      assert.equal(norm.category, 'NOISE');
      assert.equal(
        SkillTaxonomyEngine.classify(term),
        null,
        `Expected classify('${term}') to be null`
      );
    }

    // Legitimate skills still normalize properly
    const fastApiNorm = SkillTaxonomyEngine.normalizeSkill('fastapi');
    assert.notEqual(fastApiNorm, null);
    assert.equal(fastApiNorm.canonicalSlug, 'fastapi');

    const customTool = SkillTaxonomyEngine.normalizeSkill('custom-telemetry-tool-v2');
    assert.notEqual(customTool, null);
    assert.equal(customTool.canonicalSlug, 'custom-telemetry-tool-v2');
  });
});
