import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

let ttsEnabled = true;
if (!(globalThis as any).window) {
  (globalThis as any).window = {};
}

const mockGet = mock();
const mockPost = mock();

mock.module('../../../src/frontend/components/MarkdownView', () => ({
  MarkdownView: ({ content }: { content: string }) => <div>{content}</div>
}));

mock.module('../../../src/frontend/hooks/useFullscreen', () => ({
  useFullscreen: () => ({
    toggleFullscreen: () => {},
    wakeLockActive: false
  })
}));

mock.module('../../../src/frontend/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => {}
}));

mock.module('../../../src/frontend/utils/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    baseUrl: '',
    apiBaseUrl: '',
    mcpBaseUrl: '',
    ttsEnabled
  })
}));

mock.module('../../../src/frontend/utils/apiClient', () => ({
  apiClient: {
    get: mockGet,
    post: mockPost
  }
}));

const { ArticleView } = await import('../../../src/frontend/pages/ArticleView');

describe('ArticleView TTS controls', () => {
  beforeEach(() => {
    ttsEnabled = true;
    mockGet.mockReset();
    mockPost.mockReset();

    mockGet.mockImplementation((url: string) => {
      if (url.endsWith('/versions')) {
        return Promise.resolve(new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      return Promise.resolve(new Response(JSON.stringify({
        filename: 'test-article.md',
        title: 'Test Article',
        content: '## Heading',
        created: '2026-03-18T00:00:00.000Z',
        isPublic: false
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    });
  });

  test('shows Read and Copy for TTS buttons when TTS is enabled', async () => {
    const { getByText, getByRole } = render(
      <ArticleView filename="test-article" token="token" onNavigate={() => {}} />
    );

    await waitFor(() => expect(getByText('Test Article')).toBeTruthy());

    expect(getByRole('button', { name: 'Read' })).toBeTruthy();
    expect(getByRole('button', { name: 'Copy for TTS' })).toBeTruthy();
  });

  test('hides TTS controls when TTS is disabled', async () => {
    ttsEnabled = false;

    const { getByText, queryByRole } = render(
      <ArticleView filename="test-article" token="token" onNavigate={() => {}} />
    );

    await waitFor(() => expect(getByText('Test Article')).toBeTruthy());

    expect(queryByRole('button', { name: 'Read' })).toBeNull();
    expect(queryByRole('button', { name: 'Copy for TTS' })).toBeNull();
  });
});
