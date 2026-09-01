import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImportScanner } from '../../src/extractors/github/code-scanners/import-scanner.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';

describe('Local Module Detection — Python Import Scanner', () => {
  it('filters app from Python from-imports', () => {
    const code = `
from app.main import app
from app.api.middlewares.cors import CORSMiddleware
from app.api.middlewares.logging import LoggingMiddleware
from app.core.config import settings
    `;
    const results = ImportScanner.scanImports(code, 'backend/main.py');
    const packages = results.map((r) => r.packageName);
    assert.equal(packages.includes('app'), false);
  });

  it('filters server, core, config, models, tasks, forms from Python imports', () => {
    const code = `
from server import create_app
from core import settings
from config import database
from models import User
from tasks import celery_app
from forms import LoginForm
from parser import parse
from utils import helper
    `;
    const results = ImportScanner.scanImports(code, 'main.py');
    const packages = results.map((r) => r.packageName);
    for (const noise of [
      'server',
      'core',
      'config',
      'models',
      'tasks',
      'forms',
      'parser',
      'utils',
    ]) {
      assert.equal(packages.includes(noise), false, `'${noise}' should be filtered`);
    }
  });

  it('still extracts legitimate Python third-party packages', () => {
    const code = `
from fastapi import FastAPI
from pydantic import BaseModel
import sqlalchemy
import numpy as np
import pandas as pd
import requests
    `;
    const results = ImportScanner.scanImports(code, 'main.py');
    const packages = results.map((r) => r.packageName);
    assert.ok(packages.includes('fastapi'), 'fastapi should be extracted');
    assert.ok(packages.includes('pydantic'), 'pydantic should be extracted');
    assert.ok(packages.includes('sqlalchemy'), 'sqlalchemy should be extracted');
    assert.ok(packages.includes('numpy'), 'numpy should be extracted');
    assert.ok(packages.includes('pandas'), 'pandas should be extracted');
    assert.ok(packages.includes('requests'), 'requests should be extracted');
  });

  it('filters Python stdlib modules', () => {
    const code = `
import os
import sys
import json
import datetime
import pathlib
import typing
import collections
import subprocess
import asyncio
    `;
    const results = ImportScanner.scanImports(code, 'main.py');
    assert.equal(results.length, 0, 'All stdlib modules should be filtered');
  });
});

describe('Local Module Detection — JS/TS Import Scanner', () => {
  it('filters app from JS ESM imports', () => {
    const code = `
import { createApp } from 'app';
import express from 'express';
import cors from 'cors';
    `;
    const results = ImportScanner.scanImports(code, 'index.js');
    const packages = results.map((r) => r.packageName);
    assert.equal(packages.includes('app'), false, "'app' should be filtered from JS imports");
    assert.ok(packages.includes('express'), 'express should be extracted');
    assert.ok(packages.includes('cors'), 'cors should be extracted');
  });

  it('filters server, main, core, config from JS imports', () => {
    const code = `
import { createServer } from 'server';
import { main } from 'main';
import { config } from 'config';
import { core } from 'core';
import fastify from 'fastify';
    `;
    const results = ImportScanner.scanImports(code, 'server.js');
    const packages = results.map((r) => r.packageName);
    for (const noise of ['server', 'main', 'config', 'core']) {
      assert.equal(packages.includes(noise), false, `'${noise}' should be filtered`);
    }
    assert.ok(packages.includes('fastify'), 'fastify should be extracted');
  });

  it('filters app from JS CommonJS require', () => {
    const code = `
const app = require('app');
const express = require('express');
    `;
    const results = ImportScanner.scanImports(code, 'index.js');
    const packages = results.map((r) => r.packageName);
    assert.equal(packages.includes('app'), false, "'app' should be filtered from require");
    assert.ok(packages.includes('express'), 'express should be extracted');
  });

  it('does not filter scoped package scope names', () => {
    const code = `
import { something } from '@fastify/cors';
import { something } from '@nestjs/core';
    `;
    const results = ImportScanner.scanImports(code, 'index.js');
    const packages = results.map((r) => r.packageName);
    assert.ok(packages.includes('@fastify/cors'), '@fastify/cors should be extracted');
    assert.ok(packages.includes('@nestjs/core'), '@nestjs/core should be extracted');
  });

  it('still extracts legitimate JS third-party packages', () => {
    const code = `
import React from 'react';
import Next from 'next';
import Fastify from 'fastify';
import Drizzle from 'drizzle-orm';
import Zod from 'zod';
import Vitest from 'vitest';
    `;
    const results = ImportScanner.scanImports(code, 'app.ts');
    const packages = results.map((r) => r.packageName);
    assert.ok(packages.includes('react'), 'react');
    assert.ok(packages.includes('next'), 'next');
    assert.ok(packages.includes('fastify'), 'fastify');
    assert.ok(packages.includes('drizzle-orm'), 'drizzle-orm');
    assert.ok(packages.includes('zod'), 'zod');
    assert.ok(packages.includes('vitest'), 'vitest');
  });
});

describe('SkillTaxonomyEngine — Noise Rejection', () => {
  it('classifies all local module names as noise', () => {
    // These terms are in GENERIC_NOISE_TERMS and should never become technology skills
    const localModules = [
      'app',
      'server',
      'main',
      'core',
      'config',
      'utils',
      'helpers',
      'models',
      'views',
      'controllers',
      'services',
      'routes',
      'handlers',
      'schemas',
      'constants',
      'tests',
      'common',
      'lib',
      'shared',
      'index',
      'run',
      'cli',
      'db',
      'api',
      'auth',
      'middleware',
      'tasks',
      'forms',
      'parser',
    ];
    for (const term of localModules) {
      const result = SkillTaxonomyEngine.normalizeSkill(term);
      assert.equal(result.isNoise, true, `'${term}' should be classified as noise`);
      assert.equal(result.category, 'NOISE', `'${term}' category should be NOISE`);
    }
  });

  it('does NOT classify legitimate technologies as noise', () => {
    const techs = [
      'fastapi',
      'django',
      'flask',
      'pydantic',
      'numpy',
      'pandas',
      'react',
      'next.js',
      'fastify',
      'express',
      'vue',
      'angular',
      'postgresql',
      'mongodb',
      'redis',
      'docker',
      'kubernetes',
      'typescript',
      'python',
      'go',
      'rust',
    ];
    for (const tech of techs) {
      const result = SkillTaxonomyEngine.normalizeSkill(tech);
      assert.notEqual(result, null, `'${tech}' should not return null`);
      assert.notEqual(result.category, 'NOISE', `'${tech}' should NOT be classified as NOISE`);
    }
  });
});
