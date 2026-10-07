import { useAuth } from "@/lib/auth/auth-context";
import { MyReviewsSection } from "@/features/reviews";
import { AccountCard } from "./components/AccountCard";
import { AddressSection } from "./components/AddressSection";
import { AvatarCard } from "./components/AvatarCard";
import { ProfileDetailsCard } from "./components/ProfileDetailsCard";
import { SecurityCard } from "./components/SecurityCard";
import { SessionsCard } from "./components/SessionsCard";

/**
 * `/profile` — the signed-in user's own account.
 *
 * Guarded by `requireAuth` at the route, so reaching this component at all means the server
 * resolved a session. `useAuth().user` is therefore non-null, and it is the *same* user the
 * header is rendering: one query, one cache entry. Two components fetching `/auth/me`
 * separately would be two chances for the name beside the avatar to disagree with the name
 * in the navbar.
 *
 * ## Why the security card is on the profile page
 *
 * A password change has to live behind the session, and `/profile` is the one page every
 * signed-in role already has. Putting it here means no role can reach it and no role is
 * excluded from it, which is the correct shape for an account-level action.
 */
export function ProfilePage() {
  const { user } = useAuth();

  // The route guard has already run; this is the belt-and-braces that keeps the page honest
  // if it is ever rendered outside the router (a story, a test) with no session at all.
  if (!user) return null;

  return (
    <div className="page-wrap max-w-3xl space-y-6 pb-10 pt-8">
      <div>
        <p className="eyebrow">Your account</p>
        <h1 className="section-title mt-1 text-3xl">Profile</h1>
      </div>

      <AccountCard user={user} />
      <ProfileDetailsCard user={user} />
      <AvatarCard user={user} />
      <SecurityCard />
      {/* Sessions sit beside the password change because they are the other half of the
          same question — "who still has access to this account?" — and because the
          control that ends *other* devices belongs next to the one that ends their
          credentials. */}
      <SessionsCard />
      <AddressSection />

      {/* Reviews live here rather than on their own route because a customer's
          own words are part of their account, not a destination — it is the
          profile's history, alongside the addresses they saved. */}
      <MyReviewsSection />
    </div>
  );
}