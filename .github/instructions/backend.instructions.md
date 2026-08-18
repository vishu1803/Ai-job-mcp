# Backend Engineering Guidelines

**Scope**: Fastify HTTP server, domain services, MCP gateway, and background workers.  
**Governing Standard**: Fastify + Zod + Modular Domain Architecture.

---

## 1. Architectural Layering & Separation of Concerns

The backend strictly enforces a 3-layer architecture:

```
[Transport / Controller Layer]  <─── Fastify Routes & MCP Tool Handlers
              │
              ▼
[Domain / Service Layer]        <─── CareerEngine, CandidateService, ConnectorRegistry
              │
              ▼
[Persistence / Data Layer]      <─── Drizzle ORM Models, PostgreSQL, Redis Cache
```

### Inviolable Rule: No Business Logic in Route Handlers
* **Controllers / Route Handlers**: Responsible **only** for parsing HTTP/JSON-RPC requests, executing Zod validation, extracting authenticated tenant context (`req.tenantId`), delegating to the appropriate Domain Service, and returning structured HTTP responses.
* **Domain Services**: Encapsulate all business logic, evidence linking, career scoring, and two-phase action workflows. Services are decoupled from Fastify `req`/`reply` objects.
* **Data Access**: Services interact with the database via Drizzle ORM query builders and repository abstractions.

---

## 2. Fastify Plugin & Routing Conventions

* **Plugin Encapsulation**: Group related routes into Fastify plugins (`src/modules/auth/auth.routes.js`, `src/modules/candidate/candidate.routes.js`, `src/modules/mcp/mcp.routes.js`).
* **Route Schemas**: Attach Zod validation schemas using Fastify schema compilers for `body`, `querystring`, `params`, and `headers`.
* **Standard Response Envelope**: Return consistent JSON structures:
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null
  }
  ```

---

## 3. Authentication & Authorization Boundaries

* **Context Injection**: Authentication plugins (`preHandler` hook) verify sessions or Bearer tokens and attach an immutable `UserContext` to `request.userContext`:
  ```javascript
  // request.userContext = { tenantId: "...", userId: "...", role: "OWNER" }
  ```
* **Tenant Isolation Enforcement**: Never accept `tenantId` from client body or query params. Always use `request.userContext.tenantId`.
* **Operation Classification**: Distinguish between read operations and consequential write actions (which require an unexpired `ApprovalTicketId`).

---

## 4. Resource Connector Abstraction

* All third-party providers (GitHub, GitLab, Google Drive) MUST implement the standard `ResourceConnector` interface.
* Services interact strictly with `connectorRegistry.getConnector(connectionId)`, never directly with provider SDKs (`@octokit/rest`) inside core career intelligence modules.

---

## 5. Logging and Observability

* Use structured logging via **Pino** (`fastify.log` / module logger).
* Always include `tenantId`, `userId`, and `requestId` in log context.
* Never log raw credentials, authorization headers, or sensitive candidate personal data.
