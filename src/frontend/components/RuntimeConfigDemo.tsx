import React from 'react';
import { useBasePath } from '../hooks/useBasePath';
import { 
  buildRouteUrl, 
  buildApiUrl, 
  buildPublicArticleUrl, 
  buildAssetUrl,
  isRuntimeConfigAvailable,
  getBasePath 
} from '../utils/urlBuilder';
import { getRuntimeConfig, logConfigStatus } from '../utils/runtimeConfig';

/**
 * Demo component showcasing runtime configuration utilities
 * This component demonstrates how all the runtime configuration utilities work together
 */
export function RuntimeConfigDemo() {
  const { basePath, navigate, buildUrl, buildApiUrl: hookBuildApiUrl, isConfigured, config } = useBasePath();

  const handleTestNavigation = () => {
    navigate('/test-route');
  };

  const handleLogConfig = () => {
    logConfigStatus();
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '20px', borderRadius: '8px' }}>
      <h3>Runtime Configuration Demo</h3>
      
      <div style={{ marginBottom: '15px' }}>
        <h4>Configuration Status</h4>
        <p><strong>Is Configured:</strong> {isConfigured ? 'Yes' : 'No'}</p>
        <p><strong>Runtime Config Available:</strong> {isRuntimeConfigAvailable() ? 'Yes' : 'No'}</p>
        <p><strong>Base Path:</strong> "{getBasePath()}" {!getBasePath() && '(root deployment)'}</p>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4>Current Configuration</h4>
        <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
          {JSON.stringify(config || getRuntimeConfig(), null, 2)}
        </pre>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4>URL Building Examples</h4>
        <ul>
          <li><strong>Home Route:</strong> {buildRouteUrl('/')}</li>
          <li><strong>Article Route:</strong> {buildRouteUrl('/article/example.md')}</li>
          <li><strong>Public Article:</strong> {buildPublicArticleUrl('example-slug')}</li>
          <li><strong>API Endpoint:</strong> {buildApiUrl('/api/articles')}</li>
          <li><strong>Asset URL:</strong> {buildAssetUrl('/icon-192.png')}</li>
        </ul>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4>Hook-based URL Building</h4>
        <ul>
          <li><strong>Hook buildUrl:</strong> {buildUrl('/hook-test')}</li>
          <li><strong>Hook buildApiUrl:</strong> {hookBuildApiUrl('/api/hook-test')}</li>
        </ul>
      </div>

      <div>
        <h4>Actions</h4>
        <button onClick={handleTestNavigation} style={{ marginRight: '10px' }}>
          Test Navigation
        </button>
        <button onClick={handleLogConfig}>
          Log Config to Console
        </button>
      </div>
    </div>
  );
}