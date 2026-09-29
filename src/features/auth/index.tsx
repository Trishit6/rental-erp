import { Link } from "@tanstack/react-router";
import { AuthCard } from "./components/AuthCard";
import { AuthHeader } from "./components/AuthHeader";
import { LoginForm } from "./components/LoginForm";
import { RegisterForm } from "./components/RegisterForm";

export function LoginPage({ redirectTo }: { redirectTo?: string }) {
  return (
    <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
      <AuthHeader
        title="Welcome back"
        description="Sign in to rent, buy and share with your neighbours."
      />

      <div className="mt-7 w-full">
        <AuthCard>
          <LoginForm redirectTo={redirectTo} />

          <p className="mt-5 text-center text-sm text-muted-foreground">
            New to ReLoop?{" "}
            <Link to="/register" className="font-bold text-primary hover:underline">
              Create an account
            </Link>
          </p>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
            Demo accounts: buyer@reloop.local · seller@reloop.local · admin@reloop.local
            <br />
            Password: reloop-dev-2026
          </p>
        </AuthCard>
      </div>
    </div>
  );
}

export function RegisterPage() {
  return (
    <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
      <AuthHeader
        title="Create your ReLoop account"
        description="One account to rent, buy, sell — and share good things."
      />

      <div className="mt-7 w-full">
        <AuthCard>
          <RegisterForm />

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-bold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </AuthCard>
      </div>
    </div>
  );
}
