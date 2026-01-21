import { describe, expect, test, mock, beforeEach } from "bun:test";
import { render } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom";
import { Login } from "../../../src/frontend/components/Login";

// Create a mock for the API client
const mockGet = mock();
mock.module("../../../src/frontend/utils/apiClient", () => ({
  getConfiguredApiClient: () => ({
    get: mockGet
  })
}));

describe("Login Component", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  test("renders with accessible label and input", () => {
    const { getByText, getByLabelText, getByRole } = render(<Login onLogin={() => {}} />);

    // Check for visible label
    const label = getByText("Authentication Token");
    expect(label).toBeTruthy();

    // Check input association
    const input = getByLabelText("Authentication Token");
    expect(input).toBeTruthy();
    expect(input.getAttribute("id")).toBe("auth-token");
    expect(input.getAttribute("type")).toBe("password");

    // Check initial accessibility attributes
    expect(input.getAttribute("aria-invalid")).toBe("false");

    // Check initial disabled state (button disabled when empty)
    const button = getByRole("button", { name: "Login" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
