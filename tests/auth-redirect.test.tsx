import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

/**
 * Where a successful sign-in or registration lands (PROMPT — auth redirect).
 *
 * ## What this pins down, and why at the form rather than the guard
 *
 * `auth-guards.test.ts` proves the *rule* (`getPostAuthTarget` refuses off-origin
 * values, `requireGuest` bounces a signed-in visitor off `/login`). What it cannot
 * prove is the half that actually moved the user: that the form calls `navigate` only
 * after the server confirms the credentials, that a rejection keeps them on the page
 * with a message, and that the destination is `/dashboard` — the authenticated
 * workspace home — when nothing sent them somewhere specific.
 *
 * The mutation is mocked because there is no server here; the form, the Zod schemas
 * and `getPostAuthTarget` are the real ones.
 */

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  mfa: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/features/auth/query", () => ({
  useLoginMutation: () => ({ mutateAsync: mocks.login, isPending: false }),
  useMfaChallengeMutation: () => ({ mutateAsync: mocks.mfa, isPending: false }),
  useRegisterMutation: () => ({ mutateAsync: mocks.register, isPending: false }),
}));

const USER = { id: 7, name: "Asha Rao", email: "asha@example.com", role: "USER" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("login", () => {
  it("lands on /dashboard after the server confirms the credentials", async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue({ user: USER });
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "asha@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true }),
    );
  });

  it("honours a validated returnTo instead of the default", async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue({ user: USER });
    render(<LoginForm redirectTo="/orders/RV-2026-000123" />);

    await user.type(screen.getByLabelText("Email"), "asha@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/orders/RV-2026-000123",
        replace: true,
      }),
    );
  });

  it("stays on the page and shows the error when the credentials are wrong", async () => {
    const user = userEvent.setup();
    mocks.login.mockRejectedValue(new Error("Email or password is incorrect"));
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "asha@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText("Email or password is incorrect")).toBeInTheDocument(),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("registration", () => {
  async function fillRegistration(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Full name"), "Asha Rao");
    await user.type(screen.getByLabelText("Email"), "asha@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "supersecret");
  }

  it("lands on /dashboard once the server creates the account and the session", async () => {
    const user = userEvent.setup();
    mocks.register.mockResolvedValue({ user: USER });
    render(<RegisterForm />);

    await fillRegistration(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true }),
    );
  });

  it("does not redirect when registration fails", async () => {
    const user = userEvent.setup();
    mocks.register.mockRejectedValue(new Error("An account with that email already exists"));
    render(<RegisterForm />);

    await fillRegistration(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(
        screen.getByText("An account with that email already exists"),
      ).toBeInTheDocument(),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("refuses to submit when the two passwords differ", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Full name"), "Asha Rao");
    await user.type(screen.getByLabelText("Email"), "asha@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
