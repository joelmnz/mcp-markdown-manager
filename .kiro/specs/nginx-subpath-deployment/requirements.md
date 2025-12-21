# Requirements Document

## Introduction

This specification defines the requirements for enabling the MCP Markdown Manager application to work correctly when deployed behind Nginx on a subpath (e.g., `/md`) or subdomain. Currently, the application assumes it runs at the root path (`/`) which causes routing, asset loading, and API calls to fail when deployed on a subpath through a reverse proxy.

## Glossary

- **Base Path**: The URL path prefix where the application is mounted (e.g., `/md` in `https://example.com/md`)
- **Reverse Proxy**: Nginx server that forwards requests to the application server
- **Static Assets**: Frontend JavaScript, CSS, and other files served by the application
- **Client-Side Routing**: Frontend navigation that updates the URL without full page reloads
- **Service Worker**: Browser background script that enables PWA functionality
- **MCP Server**: Model Context Protocol server endpoint for AI agent integration
- **API Endpoints**: REST API routes for article management and health checks

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to deploy the application on a subpath behind Nginx, so that I can host multiple applications on the same domain.

#### Acceptance Criteria

1. WHEN the application is configured with a base path THEN the system SHALL serve all static assets with the correct base path prefix
2. WHEN a user navigates to any route THEN the system SHALL maintain the base path in all URLs
3. WHEN the frontend makes API calls THEN the system SHALL prepend the base path to all API endpoints
4. WHEN the service worker is registered THEN the system SHALL use the correct base path for all cached resources
5. WHEN the MCP server endpoint is accessed THEN the system SHALL respond correctly with the base path prefix

### Requirement 2

**User Story:** As a developer, I want the application to automatically detect its base path, so that I don't need to manually configure it for different deployment scenarios.

#### Acceptance Criteria

1. WHEN the application starts THEN the system SHALL detect the base path from environment variables or request headers
2. WHEN no base path is configured THEN the system SHALL default to root path behavior
3. WHEN the base path is configured THEN the system SHALL validate it follows the correct format
4. WHEN the base path changes THEN the system SHALL update all internal references without requiring code changes
5. WHEN the application serves the HTML template THEN the system SHALL inject the base path into the frontend configuration

### Requirement 3

**User Story:** As a user, I want all application features to work correctly when accessed through a subpath, so that the deployment method doesn't affect functionality.

#### Acceptance Criteria

1. WHEN I access the application through a subpath THEN the system SHALL load all CSS and JavaScript assets correctly
2. WHEN I navigate between pages THEN the system SHALL maintain the subpath in the browser URL
3. WHEN I refresh the page on any route THEN the system SHALL serve the correct content with the subpath
4. WHEN I use browser back/forward buttons THEN the system SHALL navigate correctly within the subpath
5. WHEN I access public article links THEN the system SHALL generate URLs with the correct subpath prefix

### Requirement 4

**User Story:** As an AI agent, I want to access the MCP server through a subpath, so that I can integrate with the application regardless of its deployment configuration.

#### Acceptance Criteria

1. WHEN the MCP endpoint is accessed with a base path THEN the system SHALL respond to requests at the correct subpath location
2. WHEN MCP operations are performed THEN the system SHALL return URLs with the correct base path prefix
3. WHEN the MCP server provides article links THEN the system SHALL include the base path in all generated URLs
4. WHEN authentication is required THEN the system SHALL validate tokens correctly regardless of the base path
5. WHEN error responses are returned THEN the system SHALL maintain consistent URL formatting with the base path

### Requirement 5

**User Story:** As a system administrator, I want to configure the base path through environment variables, so that I can deploy the application in different environments without code changes.

#### Acceptance Criteria

1. WHEN the BASE_PATH environment variable is set THEN the system SHALL use it for all URL generation
2. WHEN the BASE_PATH contains leading or trailing slashes THEN the system SHALL normalize it to the correct format
3. WHEN the BASE_PATH is invalid THEN the system SHALL log a warning and fall back to root path behavior
4. WHEN the application starts THEN the system SHALL log the configured base path for verification
5. WHEN the BASE_PATH is not set THEN the system SHALL operate in root path mode without errors

### Requirement 6

**User Story:** As a DevOps engineer, I want the frontend to support runtime BASE_URL configuration, so that I can deploy the same built frontend assets in different environments without rebuilding.

#### Acceptance Criteria

1. WHEN the frontend is built THEN the system SHALL NOT hardcode any base URL paths into the bundled assets
2. WHEN the HTML template is served THEN the system SHALL inject the BASE_URL configuration from environment variables at runtime
3. WHEN the frontend initializes THEN the system SHALL read the BASE_URL from the injected configuration, not from build-time variables
4. WHEN the application runs in a Docker container THEN the system SHALL use the BASE_URL environment variable set in the container
5. WHEN the same built frontend assets are deployed to different subpaths THEN the system SHALL work correctly without rebuilding
6. WHEN no BASE_URL is configured THEN the system SHALL default to root path (`/`) behavior
7. WHEN the frontend makes API calls THEN the system SHALL dynamically construct URLs using the runtime BASE_URL configuration
8. WHEN the service worker is registered THEN the system SHALL use the runtime BASE_URL for all cached resource paths