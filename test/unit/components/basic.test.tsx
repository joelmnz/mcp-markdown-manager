import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom";

const TestComponent = () => {
  return (
    <div>
      <h1>Hello World</h1>
      <button>Click me</button>
    </div>
  );
};

describe("Frontend DOM Testing", () => {
  test("should render component in virtual DOM", () => {
    const { getByText, getByRole } = render(<TestComponent />);
    
    expect(getByText("Hello World")).toBeTruthy();
    expect(getByRole("button")).toBeTruthy();
    expect(getByText("Click me")).toBeTruthy();
  });
});
