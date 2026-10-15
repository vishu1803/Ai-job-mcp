/** Explicit disposable Studio runner only. Prevent base .env loading in the main checkout. */
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
assert.equal(process.env.NODE_ENV, 'test');
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55447');
assert.equal(target.pathname, '/product_audit_resume_studio');
dotenv.config = () => ({ parsed: {} });
