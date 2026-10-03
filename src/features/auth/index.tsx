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
            New to Revaro?{" "}
            <Link to="/register" className="font-bold text-primary hover:underline">
              Create an account
            </Link>
          </p>
          {/*
           * The password is deliberately absent.
           *
           * It used to be printed here, which put a credential in client code and in
           * every production bundle — and made this hint *wrong* the moment the
           * admin password was set from the environment. The seeded credentials now
           * live only in `server/lib/config.ts`; the seed script prints them to the
           * terminal that ran it, which is the only place a local demo password
           * needs to be visible.
           *
           * `import.meta.env.DEV` is replaced with `false` and this branch is
           * tree-shaken out of a production build, so a deployed marketplace does
           * not advertise which local accounts exist either.
           */}
          {import.meta.env.DEV ? (
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              Local demo accounts: buyer@revaro.local · seller@revaro.local · admin@revaro.local
              <br />
              The password is printed by <code>pnpm db:seed</code>.
            </p>
          ) : null}
        </AuthCard>
      </div>
    </div>
  );
}

export function RegisterPage() {
  return (
    <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
      <AuthHeader
        title="Create your Revaro account"
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
