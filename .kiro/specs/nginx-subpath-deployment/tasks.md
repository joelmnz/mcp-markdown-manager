# Implementation Plan

- [x] 1. Create base path configuration service





  - Implement base path parsing and validation from environment variables
  - Create utilities for URL manipulation with base path support
  - Add path normalization logic (handle leading/trailing slashes)
  - _Requirements: 2.1, 2.3, 5.1, 5.2, 5.3_

- [ ]* 1.1 Write property test for base path validation and normalization
  - **Property 7: Base path validation and normalization**
  - **Validates: Requirements 2.3, 5.2**

- [ ]* 1.2 Write property test for base path detection and usage
  - **Property 6: Base path detection and usage**
  - **Validates: Requirements 2.1, 5.1**

- [ ]* 1.3 Write property test for invalid base path fallback
  - **Property 13: Invalid base path fallback**
  - **Validates: Requirements 5.3**

- [x] 2. Update server routing and static asset serving





  - Modify server.ts to handle routes with base path prefixes
  - Update static file serving to work with base path
  - Implement base path injection into HTML template
  - Update API and MCP endpoint routing
  - _Requirements: 1.1, 1.5, 2.5, 3.1, 3.3, 4.1_

- [ ]* 2.1 Write property test for static asset serving with base path
  - **Property 1: Static asset serving with base path**
  - **Validates: Requirements 1.1, 3.1**

- [ ]* 2.2 Write property test for MCP endpoint functionality with base path
  - **Property 5: MCP endpoint functionality with base path**
  - **Validates: Requirements 1.5, 4.1, 4.4**

- [ ]* 2.3 Write property test for HTML template injection
  - **Property 9: HTML template injection**
  - **Validates: Requirements 2.5**

- [ ]* 2.4 Write property test for page refresh handling
  - **Property 10: Page refresh handling**
  - **Validates: Requirements 3.3**

- [ ] 3. Update HTML build script for base path support




  - Modify build-html.cjs to inject base path configuration
  - Update asset references to use base path
  - Ensure manifest.json and service worker paths are correct
  - _Requirements: 1.1, 1.4, 2.5_

- [ ] 4. Create frontend base path utilities
  - Implement useBasePath hook for React components
  - Create API client utility with base path support
  - Add URL building utilities for navigation and links
  - _Requirements: 1.2, 1.3, 3.2, 3.5_

- [ ]* 4.1 Write property test for API and MCP URL generation
  - **Property 3: API and MCP URL generation includes base path**
  - **Validates: Requirements 1.3, 4.2, 4.3**

- [ ]* 4.2 Write property test for public article URL generation
  - **Property 11: Public article URL generation**
  - **Validates: Requirements 3.5**

- [ ] 5. Update frontend routing system
  - Modify App.tsx to parse routes with base path awareness
  - Update navigation functions to maintain base path
  - Implement browser history management with base path
  - _Requirements: 1.2, 3.2, 3.4_

- [ ]* 5.1 Write property test for navigation maintains base path
  - **Property 2: Navigation maintains base path**
  - **Validates: Requirements 1.2, 3.2, 3.4**

- [ ]* 5.2 Write property test for configuration change adaptation
  - **Property 8: Configuration change adaptation**
  - **Validates: Requirements 2.4**

- [ ] 6. Update service worker for base path support
  - Modify service worker registration to use base path
  - Update cached resource URLs to include base path
  - Ensure PWA functionality works with subpaths
  - _Requirements: 1.4_

- [ ]* 6.1 Write property test for service worker base path usage
  - **Property 4: Service worker uses base path**
  - **Validates: Requirements 1.4**

- [ ] 7. Update all API calls throughout the application
  - Replace direct fetch calls with base path-aware API client
  - Update all components to use new API utilities
  - Ensure error responses maintain base path consistency
  - _Requirements: 1.3, 4.2, 4.5_

- [ ]* 7.1 Write property test for error response URL consistency
  - **Property 12: Error response URL consistency**
  - **Validates: Requirements 4.5**

- [ ] 8. Add environment variable configuration
  - Update .env.example with BASE_PATH documentation
  - Add startup logging for base path configuration
  - Implement validation and fallback behavior
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 8.1 Write unit tests for environment variable handling
  - Test default behavior when BASE_PATH is not set
  - Test startup logging for base path verification
  - Test various BASE_PATH format scenarios
  - _Requirements: 5.4, 5.5_

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Update documentation and deployment examples
  - Add nginx configuration examples for subpath deployment
  - Update README with base path configuration instructions
  - Create docker-compose examples with base path setup
  - _Requirements: All requirements for deployment guidance_