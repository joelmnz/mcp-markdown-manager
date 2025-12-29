# OAuth 2.0 Implementation Plan for MCP Markdown Manager

## Overview

This document outlines the implementation plan for adding OAuth 2.0 support to the MCP Markdown Manager, enabling integration with Claude Web as a custom connector.

## Requirements

Based on Claude's custom connector documentation, the implementation requires:

1. **OAuth 2.0 with PKCE** (Proof Key for Code Exchange - RFC 7636)
2. **Dynamic Client Registration (DCR)** (RFC 7591)
3. **Required Endpoints:**
   - `/oauth/register` - Dynamic client registration
   - `/oauth/authorize` - Authorization endpoint
   - `/oauth/token` - Token exchange endpoint
   - `/oauth/revoke` - Token revocation (optional but recommended)

## Implementation Status

### ✅ Phase 1: Database Schema (COMPLETED)

**Files Modified:**
- `src/backend/services/schema.ts`

**Changes:**
- Added OAuth table creation methods:
  - `oauth_clients` - Stores registered OAuth clients
  - `oauth_authorization_codes` - Temporary authorization codes with PKCE
  - `oauth_access_tokens` - Access tokens with expiration and revocation
  - `oauth_refresh_tokens` - Refresh tokens for token rotation
- Created indexes for performance optimization
- Updated schema verification and cleanup methods
- OAuth tables are created conditionally based on `OAUTH_ENABLED` environment variable

**Database Tables:**
```sql
oauth_clients (
  client_id PRIMARY KEY,
  client_secret_hash,
  client_name,
  redirect_uris[],
  grant_types[],
  response_types[],
  token_endpoint_auth_method,
  scope,
  created_at,
  updated_at
)

oauth_authorization_codes (
  code PRIMARY KEY,
  client_id REFERENCES oauth_clients,
  user_id,
  code_challenge,
  code_challenge_method ('S256' | 'plain'),
  redirect_uri,
  scope,
  expires_at,
  created_at,
  used_at
)

oauth_access_tokens (
  token_hash PRIMARY KEY,
  client_id REFERENCES oauth_clients,
  user_id,
  scope,
  expires_at,
  created_at,
  revoked_at
)

oauth_refresh_tokens (
  token_hash PRIMARY KEY,
  access_token_hash,
  client_id REFERENCES oauth_clients,
  user_id,
  scope,
  expires_at,
  created_at,
  revoked_at
)
```

### ✅ Phase 2: OAuth Storage Service (COMPLETED)

**Files Created:**
- `src/backend/oauth/storage.ts`

**Features:**
- Complete CRUD operations for OAuth clients, codes, and tokens
- Token hashing for security (never store plaintext tokens)
- Automatic cleanup of expired tokens and codes
- Type-safe interfaces for all OAuth entities
- Singleton service pattern

**Key Methods:**
- `createClient()`, `getClient()`, `verifyClientSecret()`, `deleteClient()`
- `createAuthorizationCode()`, `consumeAuthorizationCode()`
- `createAccessToken()`, `getAccessToken()`, `revokeAccessToken()`
- `createRefreshToken()`, `getRefreshToken()`, `revokeRefreshToken()`
- `cleanupExpired()` - Cleanup expired tokens and codes

### ✅ Phase 3: PKCE Implementation (COMPLETED)

**Files Created:**
- `src/backend/oauth/pkce.ts`

**Features:**
- Full RFC 7636 compliance
- Support for both S256 and plain methods (S256 recommended)
- Code challenge generation and verification
- Comprehensive validation with detailed error messages
- Format validation for code verifiers and challenges

**Key Functions:**
- `generateCodeChallenge()` - Generate challenge from verifier
- `verifyCodeChallenge()` - Verify verifier matches challenge
- `validatePKCE()` - Comprehensive validation with error details
- `isValidCodeVerifier()` - RFC-compliant format validation

### ✅ Phase 4: Token Service (COMPLETED)

**Files Created:**
- `src/backend/oauth/tokens.ts`

**Features:**
- JWT-based access tokens with HS256 signing
- Custom JWT implementation (no external dependencies)
- Access token creation and validation
- Refresh token creation and rotation
- Token revocation support
- Database-backed token storage for revocation

**Token Structure:**
```typescript
AccessTokenPayload {
  iss: string;          // Issuer
  sub: string;          // Subject (user_id)
  aud: string;          // Audience (client_id)
  exp: number;          // Expiration (Unix timestamp)
  iat: number;          // Issued at (Unix timestamp)
  scope: string;        // Scopes
  jti: string;          // JWT ID (unique identifier)
}
```

**Key Methods:**
- `createAccessToken()` - Generate JWT access token
- `validateAccessToken()` - Verify JWT signature and check database
- `createRefreshToken()` - Generate opaque refresh token
- `refreshAccessToken()` - Token rotation (revoke old, issue new)
- `revokeAccessToken()`, `revokeRefreshToken()`

### ✅ Phase 5: Environment Configuration (COMPLETED)

**Files Modified:**
- `.env.example`

**New Environment Variables:**
```bash
# OAuth 2.0 Configuration
OAUTH_ENABLED=false
OAUTH_ISSUER=https://your-domain.com
OAUTH_ACCESS_TOKEN_TTL=3600              # 1 hour
OAUTH_REFRESH_TOKEN_TTL=2592000          # 30 days
OAUTH_AUTHORIZATION_CODE_TTL=600         # 10 minutes
OAUTH_JWT_SECRET=your-secure-jwt-secret  # Required!
OAUTH_LEGACY_TOKEN_ENABLED=true          # Backward compatibility
```

## Architecture Decisions

### 1. Backward Compatibility
- Existing `AUTH_TOKEN` authentication continues to work
- Both auth methods can coexist
- Gradual migration path for existing users
- `OAUTH_LEGACY_TOKEN_ENABLED` flag controls this behavior

### 2. Security Features
- **Token Hashing:** All tokens stored as SHA-256 hashes
- **PKCE Mandatory:** Authorization code flow requires PKCE
- **Token Rotation:** Refresh tokens are rotated on use
- **Expiration:** All tokens and codes have TTLs
- **Revocation:** Tokens can be revoked before expiration
- **JWT Signatures:** Access tokens are signed and verified

### 3. Single-User Simplification
Since this is currently a single-user system:
- `user_id` can be optional or use a default value
- Authorization consent can be simplified
- Future enhancement: add multi-user support

### 4. Database-Backed Tokens
- Access tokens stored in database despite being JWTs
- Enables token revocation
- Enables usage tracking
- Small performance trade-off for security

## Remaining Implementation Tasks

### 🔄 Phase 6: Dynamic Client Registration (DCR)
**Status:** Pending

**Files to Create:**
- `src/backend/oauth/dcr.ts` - DCR endpoint handler
- `src/backend/routes/oauth.ts` - OAuth route handlers

**Requirements:**
- Implement RFC 7591 Dynamic Client Registration
- POST `/oauth/register` endpoint
- Return `client_id`, `client_secret`, `registration_access_token`
- Support client metadata fields

### 🔄 Phase 7: Authorization Flow
**Status:** Pending

**Files to Create:**
- `src/backend/oauth/authorization.ts` - Authorization logic
- `src/frontend/OAuthConsent.tsx` - Consent UI page

**Requirements:**
- GET `/oauth/authorize` endpoint
- Consent screen UI
- Code generation with PKCE validation
- Redirect with authorization code

### 🔄 Phase 8: Token Endpoint
**Status:** Pending

**Files to Create/Modify:**
- `src/backend/oauth/token-endpoint.ts` - Token exchange

**Requirements:**
- POST `/oauth/token` endpoint
- Support `authorization_code` grant
- Support `refresh_token` grant
- PKCE verification
- Return access_token, refresh_token, expires_in

### 🔄 Phase 9: Authentication Middleware Updates
**Status:** Pending

**Files to Modify:**
- `src/backend/middleware/auth.ts`
- `src/backend/mcp/server.ts`

**Requirements:**
- Support both Bearer token types (legacy + OAuth)
- Validate OAuth access tokens
- Extract user/client info from tokens
- Maintain backward compatibility

### 🔄 Phase 10: Testing & Documentation
**Status:** Pending

**Files to Create:**
- `scripts/test-oauth-flow.ts` - End-to-end OAuth flow test
- `scripts/test-oauth-dcr.ts` - DCR test
- `scripts/test-oauth-pkce.ts` - PKCE validation test
- `docs/OAUTH_SETUP.md` - Setup instructions

## Deployment Requirements

### Prerequisites
1. **HTTPS Required:** OAuth requires HTTPS in production
2. **Public Domain:** Must have a publicly accessible URL
3. **Environment Variables:** Configure OAuth settings
4. **Database Migration:** Run with `OAUTH_ENABLED=true` to create tables

### SSL/TLS Options
- Use nginx or Caddy as reverse proxy with SSL termination
- Use Cloudflare for SSL/TLS
- Use Let's Encrypt certificates
- Cloud providers (Heroku, Railway, etc.) provide HTTPS

### Initial Setup Steps
```bash
# 1. Generate JWT secret
openssl rand -hex 32

# 2. Update .env
OAUTH_ENABLED=true
OAUTH_ISSUER=https://your-domain.com
OAUTH_JWT_SECRET=<generated-secret>

# 3. Restart server to create OAuth tables
bun run start

# 4. Verify tables created
bun scripts/database.ts info
```

## Integration with Claude Web

Once fully implemented, users will:

1. **Navigate to Claude Web** → Custom Connectors
2. **Add New Connector:**
   - Server URL: `https://your-domain.com/mcp`
   - (OAuth credentials auto-registered via DCR)
3. **Click "Connect":**
   - Redirected to authorization page
   - View consent screen
   - Approve access
4. **Connected:**
   - Claude can use MCP tools
   - Access token used for authentication
   - Refresh token handles expiration

## Security Considerations

### Implemented
- ✅ Token hashing (SHA-256)
- ✅ PKCE validation
- ✅ Token expiration
- ✅ Token revocation
- ✅ JWT signature verification
- ✅ Secure random token generation

### To Implement
- ⏳ Rate limiting on OAuth endpoints
- ⏳ CORS configuration for OAuth endpoints
- ⏳ Client secret rotation
- ⏳ Audit logging for OAuth events
- ⏳ HTTPS enforcement in production

## Testing Strategy

### Unit Tests
- PKCE challenge/verifier validation
- JWT generation and verification
- Token storage and retrieval
- Code expiration and cleanup

### Integration Tests
- Full authorization code flow
- Dynamic client registration
- Token refresh flow
- Token revocation
- Error handling

### End-to-End Tests
- Claude Web connector integration
- MCP tool calls with OAuth tokens
- Token expiration and refresh
- Multiple concurrent clients

## References

- [RFC 6749: OAuth 2.0](https://tools.ietf.org/html/rfc6749)
- [RFC 7636: PKCE](https://tools.ietf.org/html/rfc7636)
- [RFC 7591: Dynamic Client Registration](https://tools.ietf.org/html/rfc7591)
- [Claude Custom Connectors Guide](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)

## Timeline Summary

**Completed (Phase 1-5):**
- ✅ Database schema and migrations
- ✅ OAuth storage service
- ✅ PKCE utilities
- ✅ Token generation and validation
- ✅ Environment configuration

**Remaining (Phase 6-10):**
- ⏳ Dynamic Client Registration endpoint
- ⏳ Authorization endpoint and consent UI
- ⏳ Token exchange endpoint
- ⏳ Authentication middleware updates
- ⏳ MCP server OAuth integration
- ⏳ Testing and documentation

**Estimated Remaining Work:**
Implementation of endpoints, UI, and integration (~60% complete)
