# JavaScript Coding Guidelines

**Scope**: All JavaScript source code and tests in this repository.  
**Governing Standard**: Node.js ESM + Modern ECMAScript (2024+) + JSDoc + Zod.

---

## 1. Core Principles

1. **JavaScript by Default**: Adhere to ADR-001/ADR-002. Use standard JavaScript with native ECMAScript Modules (`"type": "module"` in `package.json`). Do not introduce TypeScript compilation layers unless an approved ADR dictates a transition.
2. **JSDoc Type Annotations**: Document all exported functions, classes, interfaces, and complex objects using standard JSDoc tags (`@typedef`, `@param`, `@returns`, `@throws`). This enables full IDE intellisense without build tooling.
3. **Runtime Schema Validation via Zod**: External inputs (HTTP bodies, query params, MCP tool arguments, environment variables) MUST be validated with Zod schemas. Do not rely on loose manual validation.
4. **Async / Await Standard**: Use native `async` / `await` for all asynchronous operations. Avoid callback pyramids and unhandled Promise rejections.

---

## 2. Module & File Conventions

* **Extensions**: Use standard `.js` extensions for ESM modules.
* **Imports**: Use explicit relative import paths with `.js` extensions:
  ```javascript
  import { candidateService } from '../services/candidate.service.js';
  import { z } from 'zod';
  ```
* **Single Responsibility**: Keep files focused. Each service, controller, utility, or schema should reside in its own module.
* **No Side Effects on Import**: Importing a module must not trigger database connections, network requests, or top-level blocking operations. Encapsulate startup logic in factory or lifecycle functions.

---

## 3. Error Handling Rules

* **Explicit Custom Error Classes**: Define domain-specific error classes extending `Error` (e.g., `NotFoundError`, `UnauthorizedError`, `ValidationError`, `ConsequentialActionForbiddenError`).
* **Always Provide Error Context**: Include relevant identifiers (e.g., `tenantId`, `entityId`) in error messages, while ensuring secrets and passwords are never included.
* **No Swallowed Exceptions**: Never catch an error with an empty catch block. Always log, wrap, or re-throw:
  ```javascript
  try {
    return await connector.fetchTree(repoId);
  } catch (err) {
    logger.error({ err, repoId }, 'Failed to fetch repository tree');
    throw new ConnectorFetchError(`Failed to fetch tree for repo: ${repoId}`, { cause: err });
  }
  ```

---

## 4. Code Style & Simplicity

* **Favor Pure Functions & Composition**: Avoid deep class inheritance hierarchies. Use modular functions, factory objects, and clear interface objects.
* **Immutability & Safety**: Use `const` by default; use `let` only when reassignment is strictly required. Never use `var`.
* **Zero Magic Numbers/Strings**: Declare named constants or Enums (via `Object.freeze`) for magic strings, status values, and numerical thresholds.
