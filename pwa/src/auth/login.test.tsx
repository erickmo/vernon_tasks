import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./login";

// Mock session module
vi.mock("./session", () => ({
  login: vi.fn(),
  probeSession: vi.fn().mockResolvedValue({ user: null, csrf_token: null, roles: [] }),
}));

import { login as mockLogin } from "./session";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/m/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("LoginPage", () => {
  it("renders username and password inputs", () => {
    renderLogin();
    expect(screen.getByRole("textbox", { name: /username/i })).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
  });

  it("renders submit button", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: /masuk/i })).toBeInTheDocument();
  });

  it("pre-fills username from localStorage", () => {
    localStorage.setItem("vt_last_user", "erick@company.com");
    renderLogin();
    expect(screen.getByRole("textbox", { name: /username/i })).toHaveValue("erick@company.com");
  });

  it("shows error message on failed login", async () => {
    vi.mocked(mockLogin).mockRejectedValueOnce(new Error("bad credentials"));
    renderLogin();
    fireEvent.change(screen.getByRole("textbox", { name: /username/i }), {
      target: { value: "bad@user.com" },
    });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: "wrongpwd" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("disables button while busy", async () => {
    vi.mocked(mockLogin).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 500)),
    );
    renderLogin();
    fireEvent.change(screen.getByRole("textbox", { name: /username/i }), {
      target: { value: "user" },
    });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: "pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
