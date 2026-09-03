/**
 * @file Canonical Parent-Skill Evidence Mappings (P14-005AE / Taxonomy Boundary)
 *
 * Defines deterministic mapping from implementation packages, helper libraries,
 * and ecosystem dependencies to their true canonical parent skills.
 *
 * Rules:
 * 1. Child packages MUST NOT become independent candidate skills.
 * 2. Child packages provide supporting evidence for their canonical parent skill(s).
 * 3. Never fabricate parent skills; all parent slugs must correspond to canonical taxonomy entries.
 */

/**
 * Deterministic mapping registry for child package identifiers.
 * Key: normalized package name (lowercase, unversioned)
 * Value: array of canonical parent skill slugs and confidence weights.
 */
export const PARENT_SKILL_MAPPINGS = Object.freeze({
  // --- Tailwind CSS Ecosystem ---
  'tailwind-merge': [{ parentSlug: 'tailwindcss', confidence: 0.85 }],
  'tailwind-animate': [{ parentSlug: 'tailwindcss', confidence: 0.8 }],
  'prettier-plugin-tailwindcss': [{ parentSlug: 'tailwindcss', confidence: 0.7 }],
  '@tailwindcss/typography': [{ parentSlug: 'tailwindcss', confidence: 0.85 }],
  '@tailwindcss/forms': [{ parentSlug: 'tailwindcss', confidence: 0.85 }],
  '@tailwindcss/aspect-ratio': [{ parentSlug: 'tailwindcss', confidence: 0.8 }],
  autoprefixer: [{ parentSlug: 'tailwindcss', confidence: 0.7 }],

  // --- React UI & Component Ecosystem ---
  'react-icons': [{ parentSlug: 'react', confidence: 0.8 }],
  'react-dialog': [{ parentSlug: 'react', confidence: 0.8 }],
  'react-avatar': [{ parentSlug: 'react', confidence: 0.8 }],
  'react-slot': [{ parentSlug: 'react', confidence: 0.8 }],
  'react-select': [{ parentSlug: 'react', confidence: 0.8 }],
  'react-table': [{ parentSlug: 'react', confidence: 0.85 }],
  'react-query': [{ parentSlug: 'react', confidence: 0.9 }],
  '@tanstack/react-query': [{ parentSlug: 'react', confidence: 0.9 }],
  'react-hook-form': [{ parentSlug: 'react', confidence: 0.85 }],
  'lucide-react': [{ parentSlug: 'react', confidence: 0.8 }],
  'framer-motion': [{ parentSlug: 'react', confidence: 0.85 }],
  '@radix-ui/react-dialog': [{ parentSlug: 'react', confidence: 0.85 }],
  '@radix-ui/react-dropdown-menu': [{ parentSlug: 'react', confidence: 0.85 }],
  '@radix-ui/react-slot': [{ parentSlug: 'react', confidence: 0.8 }],
  '@radix-ui/react-avatar': [{ parentSlug: 'react', confidence: 0.8 }],
  '@radix-ui/react-select': [{ parentSlug: 'react', confidence: 0.85 }],
  '@radix-ui/react-tooltip': [{ parentSlug: 'react', confidence: 0.8 }],
  '@headlessui/react': [{ parentSlug: 'react', confidence: 0.8 }],
  '@heroicons/react': [{ parentSlug: 'react', confidence: 0.8 }],
  cmdk: [{ parentSlug: 'react', confidence: 0.8 }],
  'next-themes': [
    { parentSlug: 'next-js', confidence: 0.85 },
    { parentSlug: 'react', confidence: 0.8 },
  ],

  // --- Next.js Ecosystem ---
  'next-auth': [{ parentSlug: 'next-js', confidence: 0.9 }],
  '@next/font': [{ parentSlug: 'next-js', confidence: 0.85 }],
  'eslint-config-next': [
    { parentSlug: 'next-js', confidence: 0.8 },
    { parentSlug: 'eslint', confidence: 0.75 },
  ],

  // --- Drizzle ORM & Database Ecosystem ---
  'drizzle-orm-node-postgres': [
    { parentSlug: 'drizzle-orm', confidence: 0.95 },
    { parentSlug: 'postgresql', confidence: 0.9 },
  ],
  'drizzle-kit': [{ parentSlug: 'drizzle-orm', confidence: 0.9 }],
  pg: [{ parentSlug: 'postgresql', confidence: 0.9 }],
  'pg-pool': [{ parentSlug: 'postgresql', confidence: 0.85 }],
  'node-postgres': [{ parentSlug: 'postgresql', confidence: 0.9 }],
  '@prisma/client': [{ parentSlug: 'prisma', confidence: 0.95 }],
  ioredis: [{ parentSlug: 'redis', confidence: 0.9 }],
  mongoose: [{ parentSlug: 'mongodb', confidence: 0.9 }],

  // --- Socket.IO & Realtime ---
  'socket-io-client': [{ parentSlug: 'socket-io', confidence: 0.95 }],
  'socket.io-client': [{ parentSlug: 'socket-io', confidence: 0.95 }],
  'socket.io': [{ parentSlug: 'socket-io', confidence: 0.95 }],

  // --- Python / FastAPI / Data Ecosystem ---
  uvicorn: [
    { parentSlug: 'python', confidence: 0.85 },
    { parentSlug: 'fastapi', confidence: 0.85 },
  ],
  pydantic: [
    { parentSlug: 'python', confidence: 0.85 },
    { parentSlug: 'fastapi', confidence: 0.8 },
  ],
  httpx: [{ parentSlug: 'python', confidence: 0.8 }],
  pytest: [{ parentSlug: 'python', confidence: 0.85 }],
  alembic: [
    { parentSlug: 'python', confidence: 0.85 },
    { parentSlug: 'postgresql', confidence: 0.8 },
  ],
});

/**
 * Resolves canonical parent skill mappings for a given package identifier.
 *
 * @param {string} rawPackage - Raw package or dependency name.
 * @returns {Array<{ parentSlug: string, confidence: number }>|null} Array of parent mappings, or null.
 */
export function resolveParentSkills(rawPackage) {
  if (!rawPackage || typeof rawPackage !== 'string') return null;
  const normalized = rawPackage.toLowerCase().trim();

  if (Object.prototype.hasOwnProperty.call(PARENT_SKILL_MAPPINGS, normalized)) {
    return PARENT_SKILL_MAPPINGS[normalized];
  }

  // Handle scoped packages like @radix-ui/react-dialog
  if (normalized.startsWith('@radix-ui/')) {
    return [{ parentSlug: 'react', confidence: 0.85 }];
  }

  // Handle @tailwindcss/*
  if (normalized.startsWith('@tailwindcss/')) {
    return [{ parentSlug: 'tailwindcss', confidence: 0.85 }];
  }

  // Handle @tanstack/react-*
  if (normalized.startsWith('@tanstack/react-')) {
    return [{ parentSlug: 'react', confidence: 0.9 }];
  }

  return null;
}
