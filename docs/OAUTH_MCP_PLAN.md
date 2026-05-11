# OAuth and ChatGPT MCP Support Plan

## Confidence and decision

Confidence is now about 95% that the right target is **optional OAuth/OIDC resource-server support for the existing `/mcp` endpoint**, backed by your self-hosted VoidAuth instance, while keeping the current local token system for scripts and non-ChatGPT clients.

The app should **not** become an OAuth provider. VoidAuth should remain the identity provider, Cloudflare Tunnel should remain the HTTPS exposure layer, and MCP Markdown Manager should validate bearer tokens and enforce app-local article permissions.

## Confirmed requirements

- Deployment is a single-user homelab app exposed over HTTPS through Cloudflare Tunnel.
- The primary OAuth use case is ChatGPT Pro developer-mode MCP access to `https://md.jknet.dev/mcp`.
- VoidAuth is already hosted at a sibling subdomain such as `https://vauth.jknet.dev`.
- Cloudflare Access is not currently blocking requests before they reach the app.
- Public article routes must remain anonymously accessible.
- The app-side target is to support ChatGPT read and write access, but only to article folder paths matching a configured regular expression such as `projects/.*-ai`. As of the latest OpenAI Help Center guidance reviewed for this plan, ChatGPT Pro custom MCP access is read/fetch-only while full MCP write/modify actions are limited to Business and Enterprise/Edu; this is an external product-plan constraint, not an app implementation constraint.
- Audit attribution should use the simplest available identity: VoidAuth username/email for OAuth users, or token/client name for local tokens.
- Existing scoped local tokens should remain available and should gain optional folder-regex restrictions.

## VoidAuth findings that affect the plan

VoidAuth mounts its OIDC issuer under `/oidc`, not at the domain root. Therefore the discovery URL should be:

```text
https://vauth.jknet.dev/oidc/.well-known/openid-configuration
```

not:

```text
https://vauth.jknet.dev/.well-known/openid-configuration
```

The VoidAuth source defines the provider issuer as `${APP_URL}/oidc`, and its own UI displays the well-known endpoint as `currentHost + '/oidc/.well-known/openid-configuration'`.

VoidAuth client defaults include:

- scopes: `openid offline_access profile email groups`
- grant types: `authorization_code` and `refresh_token`
- response type: `code`

VoidAuth's admin UI supports these token endpoint auth methods:

- `client_secret_basic`
- `client_secret_post`
- `client_secret_jwt`
- `none` for public clients

For ChatGPT MCP, the safest first configuration to try is a static VoidAuth OIDC app with:

```text
Issuer: https://vauth.jknet.dev/oidc
Discovery: https://vauth.jknet.dev/oidc/.well-known/openid-configuration
Scopes: openid profile email groups offline_access
Grant types: authorization_code, refresh_token
Response types: code
Auth method: client_secret_basic or client_secret_post, depending on what ChatGPT accepts during connector setup
```

## Current codebase constraints

The current REST auth middleware has a narrow `AuthContext` with `scope`, `tokenId`, and `tokenName`. It validates DB access tokens first, then falls back to `AUTH_TOKEN` and treats it as write scope.

The current local token service only supports two scopes, `read-only` and `write`, and stores generated `sk-md-...` token strings in the database.

The MCP server currently has its own bearer parsing and validates only local DB access tokens for MCP sessions. It filters tool visibility by `read-only` versus `write` scope, where write scope exposes all tools and read-only hides write tools.

These constraints mean OAuth should be added through a shared auth service rather than separately in REST and MCP.

## Readiness status

The plan is ready to implement for the app-side foundation: shared auth, OAuth/OIDC token validation, local-token hardening, folder-regex authorization, and MCP/REST enforcement.

The only remaining blocking product decision is external to this repository: whether ChatGPT write access is required from the first live rollout. Current OpenAI guidance says ChatGPT Pro users can connect MCP servers with read/fetch permissions, while full MCP write/modify actions are currently available only to Business and Enterprise/Edu. Therefore:

- if you stay on ChatGPT Pro, implement the same secure foundation but validate the first ChatGPT rollout as read/fetch-only;
- if write access from ChatGPT is mandatory immediately, plan for a Business or Enterprise/Edu workspace before treating end-to-end ChatGPT write support as complete;
- either way, still implement server-side write authorization and folder-regex enforcement now, so the app is ready when the client/workspace supports write actions.


## Target architecture

```text
ChatGPT Pro custom MCP connector
  -> OAuth authorization with VoidAuth at https://vauth.jknet.dev/oidc
  -> ChatGPT receives access token and refresh token if offline_access is granted
  -> ChatGPT calls https://md.jknet.dev/mcp with Authorization: Bearer <access_token>
  -> MCP Markdown Manager validates the token via VoidAuth discovery/JWKS or introspection
  -> App maps claims/groups/client metadata to editor role plus folder regex restrictions
  -> MCP tool handlers enforce tool scope and folder permissions before article operations
```

## Implementation phases

### Phase 1: Shared auth model and local-token hardening

1. Add a shared backend auth service used by both REST and MCP.
2. Replace duplicate bearer parsing with one strict parser that only accepts `Authorization: Bearer <token>`.
3. Expand auth context to include:
   - `authType: 'local-token' | 'oauth' | 'auth-token'`
   - `principalId`
   - `principalName`
   - `role: 'admin' | 'editor' | 'reader'`
   - `scope: 'read-only' | 'write'`
   - `folderRegex?: string`
   - `tokenId?: number`
   - `tokenName?: string`
   - `groups?: string[]`
4. Hash newly-created local access tokens at rest using HMAC-SHA-256 or SHA-256 with a server-side pepper.
5. Keep existing plaintext tokens working during a migration window, but mark token hashing as the new storage format.

### Phase 2: Folder-regex permission support for local tokens

1. Add an optional `folder_regex` column to local access tokens.
2. Extend token creation/editing to accept a folder regex.
3. Validate regex syntax before saving.
4. Treat missing `folder_regex` as unrestricted for backward compatibility.
5. Enforce folder regex for all article read and write operations:
   - article list/search results should hide articles outside the allowed folder pattern;
   - read/update/delete should return forbidden or not found for disallowed folders;
   - create should require the target folder to match the regex.

The initial ChatGPT token-equivalent policy should be:

```text
role: editor
scope: write
folderRegex: ^projects/.*-ai(?:/.*)?$
```

This anchors the pattern so `old-projects/foo-ai` does not accidentally match when the intended root is `projects/`.

### Phase 3: Optional OAuth/OIDC validation

Add env-controlled OAuth validation without changing default deployments:

```env
OAUTH_ENABLED=false
OAUTH_ISSUER_URL=https://vauth.jknet.dev/oidc
OAUTH_AUDIENCE=mcp-markdown-manager
OAUTH_CLIENT_ID=mcp-markdown-manager
OAUTH_CLIENT_SECRET=
OAUTH_REQUIRED_SCOPES=openid profile email offline_access
OAUTH_USERNAME_CLAIM=preferred_username
OAUTH_EMAIL_CLAIM=email
OAUTH_GROUPS_CLAIM=groups
OAUTH_DEFAULT_ROLE=editor
OAUTH_DEFAULT_FOLDER_REGEX=^projects/.*-ai(?:/.*)?$
```

Validation order:

1. Load discovery metadata from `OAUTH_ISSUER_URL/.well-known/openid-configuration`.
2. Prefer JWT access-token validation with JWKS when tokens are JWTs.
3. Fall back to token introspection only if VoidAuth issues opaque access tokens and advertises/supports introspection.
4. Validate issuer, expiry, signature, and audience/client binding where available.
5. Map `preferred_username`, `email`, `client_id`, or `sub` into `principalName` for audit attribution.

### Phase 4: MCP integration for ChatGPT

For ChatGPT Pro, verify read/fetch behavior first. Keep write-capable tools implemented and protected server-side, but do not consider ChatGPT write/modify fully verified unless the connector is tested from a plan/workspace that OpenAI currently allows to use full MCP write actions.

1. Make `/mcp` use the shared auth service.
2. Accept both local `sk-md-...` tokens and OAuth bearer tokens.
3. Store the resulting auth context on the MCP session.
4. Keep session token binding, but compare a stable auth fingerprint instead of storing raw bearer tokens long term.
5. Continue exposing write tools only for editor/admin contexts.
6. Enforce folder regex inside each tool handler, not just at tool listing time.
7. Add or preserve obvious ChatGPT-friendly read tools such as list, search, and read/fetch.

### Phase 5: REST API consistency

1. Reuse the same auth service for REST API routes.
2. Keep anonymous public article routes unchanged.
3. Apply folder-regex restrictions consistently to REST list/search/read/create/update/delete operations.
4. Make `AUTH_TOKEN` fallback configurable:

```env
AUTH_TOKEN_API_FALLBACK=true
```

Keep the current behavior initially, but document that disabling fallback is recommended after OAuth and local tokens are configured.

### Phase 6: VoidAuth and ChatGPT setup notes

In VoidAuth, create an OIDC app for ChatGPT/MCP Markdown Manager.

Recommended starting settings:

```text
Client display name: MCP Markdown Manager
Client ID: mcp-markdown-manager
Scopes: openid profile email groups offline_access
Response types: code
Grant types: authorization_code, refresh_token
Auth method: client_secret_basic first; if ChatGPT setup rejects it, try client_secret_post
Groups: optional, e.g. mcp-markdown-chatgpt
Skip consent: optional for your single-user homelab setup
MFA required: your preference
```

In ChatGPT developer mode, configure the custom MCP connector with:

```text
MCP URL: https://md.jknet.dev/mcp
OAuth issuer/discovery: https://vauth.jknet.dev/oidc/.well-known/openid-configuration
Scopes: openid profile email groups offline_access
```

If ChatGPT has a callback URL to paste into VoidAuth, add that exact redirect URI to the VoidAuth OIDC app.

## Key risks and mitigations

- **Wrong discovery URL:** Use `/oidc/.well-known/openid-configuration`, because VoidAuth does not serve discovery at the domain root.
- **Refresh-token loss:** Ensure `offline_access` is advertised and requested so ChatGPT can keep the connector authorized without frequent reauthentication.
- **Over-broad write access:** Do not rely only on hiding tools. Enforce folder regex in article services and MCP handlers.
- **ChatGPT plan limitation:** ChatGPT Pro currently supports custom MCP read/fetch access, but OpenAI's current guidance places full MCP write/modify support on Business and Enterprise/Edu; treat end-to-end Pro write support as unverified unless OpenAI changes this.
- **Prompt-injection write risk:** Start with a narrow folder regex such as `^projects/.*-ai(?:/.*)?$`, and consider adding confirmation or separate high-risk tools later.
- **Plaintext token leakage:** Hash local token secrets at rest before expanding auth surface area.
- **Cloudflare Access interference:** Since the tunnel currently exposes the app without Access login, ChatGPT can reach `/mcp`. If Cloudflare Access is enabled later, exempt `/mcp` or ensure ChatGPT can complete that auth layer.

## Out of scope for the first implementation

- Building an OAuth/OIDC provider into MCP Markdown Manager.
- Full multi-user web login.
- Cookie sessions and CSRF changes for the frontend.
- Per-folder permission management UI.
- Dynamic Client Registration unless ChatGPT requires it and VoidAuth supports it sufficiently.
- Replacing all local tokens with OAuth.

## Open implementation questions

These do not block implementation of the app-side foundation, but they do affect final rollout/verification:

1. For the first live ChatGPT rollout, should the acceptance criteria be read/fetch-only on Pro, or should write support wait until a Business or Enterprise/Edu workspace is available?
2. Does ChatGPT's connector setup accept VoidAuth's static client credentials flow with `client_secret_basic` or `client_secret_post` for an individual Pro custom connector?
3. Are VoidAuth access tokens JWTs in your deployed version, or opaque tokens requiring introspection?
4. What exact redirect URI does ChatGPT provide for the OAuth connector setup?
5. Should folder-regex mismatches return `403 Forbidden` or be hidden as `404 Not Found` for article read/update/delete?
