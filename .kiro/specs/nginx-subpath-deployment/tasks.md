# Implementation Plan

- [x] 1. Create base path configuration service
  - Implement base path parsing and validation from environment variables (BASE_PATH/BASE_URL)
  - Create utilities for URL manipulation with base path support
  - Add path normalization logic (handle leading/trailing slashes)
  - Add client configuration generation for runtime injection
  - _Requirements: 2.1, 2.3, 5.1, 5.2, 5.3, 6.4_

- [ ]* 1.1 Write property test for base path validation and normalization
  - **Property 7: Base path validation and normalization**
  - **Validates: Requirements 2.3, 5.2**

- [ ]* 1.2 Write property test for base path detection and usage from environment
  - **Property 6: Base path detection and usage from environment**
  - **Validates: Requirements 2.1, 5.1, 6.4**

- [ ]* 1.3 Write property test for invalid base path fallback
  - **Property 13: Invalid base path fallback**
  - **Validates: Requirements 5.3**

- [x] 2. Update server routing and static asset serving
  - Modify server.ts to handle routes with base path prefixes
  - Update static file serving to work with base path
  - Implement runtime base path injection into HTML template per request
  - Update API and MCP endpoint routing
  - _Requirements: 1.1, 1.5, 2.5, 3.1, 3.3, 4.1, 6.2_

- [ ]* 2.1 Write property test for static asset serving with base path
  - **Property 1: Static asset serving with base path**
  - **Validates: Requirements 1.1, 3.1**

- [ ]* 2.2 Write property test for MCP endpoint functionality with base path
  - **Property 5: MCP endpoint functionality with base path**
  - **Validates: Requirements 1.5, 4.1, 4.4**

- [ ]* 2.3 Write property test for runtime HTML template injection
  - **Property 9: Runtime HTML template injection**
  - **Validates: Requirements 2.5, 6.2**

- [ ]* 2.4 Write property test for page refresh handling
  - **Property 10: Page refresh handling**
  - **Validates: Requirements 3.3**

- [x] 3. Update build system for runtime configuration support
  - Modify build-html.ts to remove hardcoded base paths from assets
  - Ensure built assets use relative paths and runtime configuration
  - Update build process to support runtime base path injection
  - Prepare template for runtime configuration injection
  - _Requirements: 6.1, 6.2, 6.5_

- [ ]* 3.1 Write property test for build-time base path independence
  - **Property 14: Build-time base path independence**
  - **Validates: Requirements 6.1**

- [ ]* 3.2 Write property test for deployment flexibility
  - **Property 16: Deployment flexibility**
  - **Validates: Requirements 6.5**

- [x] 4. Create frontend runtime configuration utilities
  - Implement useBasePath hook that reads runtime configuration
  - Create API client utility with runtime base path support
  - Add URL building utilities for navigation and links using runtime config
  - Implement runtime configuration initialization and validation
  - _Requirements: 1.2, 1.3, 3.2, 3.5, 6.3, 6.7_

- [ ]* 4.1 Write property test for runtime API and MCP URL generation
  - **Property 3: Runtime API and MCP URL generation includes base path**
  - **Validates: Requirements 1.3, 4.2, 4.3, 6.7**

- [ ]* 4.2 Write property test for public article URL generation
  - **Property 11: Public article URL generation**
  - **Validates: Requirements 3.5**

- [ ]* 4.3 Write property test for runtime configuration initialization
  - **Property 15: Runtime configuration initialization**
  - **Validates: Requirements 6.3**

- [x] 5. Update frontend routing system for runtime configuration
  - Modify App.tsx to initialize runtime configuration and parse routes with base path awareness
  - Update navigation functions to maintain base path using runtime config
  - Implement browser history management with runtime base path
  - Add fallback behavior when runtime configuration is unavailable
  - _Requirements: 1.2, 3.2, 3.4, 6.3, 6.6_

- [ ]* 5.1 Write property test for navigation maintains base path
  - **Property 2: Navigation maintains base path**
  - **Validates: Requirements 1.2, 3.2, 3.4**

- [ ]* 5.2 Write property test for configuration change adaptation
  - **Property 8: Configuration change adaptation**
  - **Validates: Requirements 2.4**

- [x] 6. Update service worker for runtime base path support
  - Modify service worker registration to use runtime base path configuration
  - Update cached resource URLs to include base path from runtime config
  - Ensure PWA functionality works with subpaths using runtime configuration
  - _Requirements: 1.4, 6.8_

- [ ]* 6.1 Write property test for service worker runtime base path usage
  - **Property 4: Service worker uses runtime base path**
  - **Validates: Requirements 1.4, 6.8**

- [x] 7. Update all API calls throughout the application for runtime configuration
  - Replace direct fetch calls with runtime base path-aware API client
  - Update all components to use new API utilities with runtime configuration
  - Ensure error responses maintain base path consistency
  - _Requirements: 1.3, 4.2, 4.5, 6.7_

- [ ]* 7.1 Write property test for error response URL consistency
  - **Property 12: Error response URL consistency**
  - **Validates: Requirements 4.5**

- [x] 8. Add environment variable configuration for runtime support
  - Update .env.example with BASE_PATH/BASE_URL documentation
  - Add startup logging for base path configuration
  - Implement validation and fallback behavior for both variables
  - Support Docker container environment variable configuration
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.4, 6.6_

- [ ]* 8.1 Write unit tests for environment variable handling
  - Test default behavior when BASE_PATH/BASE_URL is not set
  - Test startup logging for base path verification
  - Test various BASE_PATH/BASE_URL format scenarios
  - Test Docker container environment variable scenarios
  - _Requirements: 5.4, 5.5, 6.6_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update documentation and deployment examples
  - Add nginx configuration examples for subpath deployment
  - Update README with BASE_PATH/BASE_URL configuration instructions
  - Create docker-compose examples with runtime base path setup
  - Document runtime configuration approach and deployment flexibility
  - _Requirements: All requirements for deployment guidance_