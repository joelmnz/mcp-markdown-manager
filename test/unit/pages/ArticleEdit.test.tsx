import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom";
import { ArticleEdit } from "../../../src/frontend/pages/ArticleEdit";

// Mock the API client
const mockGet = mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
const mockPost = mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
const mockPut = mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

mock.module("../../../src/frontend/utils/apiClient", () => ({
  apiClient: {
    get: mockGet,
    post: mockPost,
    put: mockPut
  }
}));

// Mock MarkdownView since it might be heavy or complex
mock.module("../../../src/frontend/components/MarkdownView", () => ({
  MarkdownView: () => <div data-testid="markdown-view-mock" />
}));

// Mock RenameSlugModal
mock.module("../../../src/frontend/components/RenameSlugModal", () => ({
  RenameSlugModal: () => <div data-testid="rename-slug-modal-mock" />
}));

describe("ArticleEdit Component", () => {
  beforeEach(() => {
    mockGet.mockClear();
    mockPost.mockClear();
    mockPut.mockClear();
  });

  test("renders form inputs with accessible labels", () => {
    // Render without filename (new article mode) to avoid loading logic
    const { getByLabelText } = render(
      <ArticleEdit
        token="test-token"
        onNavigate={() => {}}
      />
    );

    // These should work if accessibility is correct
    // If they fail, it means the label is not associated with the input
    expect(getByLabelText("Title")).toBeTruthy();
    expect(getByLabelText("Folder")).toBeTruthy();
    expect(getByLabelText("Content (Markdown)")).toBeTruthy();
  });
});
