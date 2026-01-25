import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import React from "react";
import { MarkdownView } from "../../../src/frontend/components/MarkdownView";

describe("MarkdownView Component", () => {
  test("renders code block with copy button", () => {
    const markdown = "```javascript\nconst a = 1;\n```";
    const { container, getAllByLabelText } = render(<MarkdownView content={markdown} />);

    // Check if code is rendered
    expect(container.textContent).toContain("const a = 1;");

    // Check if copy button is rendered (by aria-label)
    // This is expected to fail initially as we haven't implemented it yet
    const copyButtons = getAllByLabelText("Copy code");
    expect(copyButtons.length).toBeGreaterThan(0);
  });

  test("renders mermaid diagram without extra copy button", () => {
    const markdown = "```mermaid\ngraph TD;\nA-->B;\n```";
    const { queryByLabelText } = render(<MarkdownView content={markdown} />);

    // The "Copy code" aria-label comes from our new CopyButton.
    // MermaidDiagram has its own button but without that aria-label.
    // So we expect NOT to find "Copy code" button.
    const copyButtons = queryByLabelText("Copy code");
    expect(copyButtons).toBeNull();
  });
});
