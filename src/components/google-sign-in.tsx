"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const onSignIn = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      alert("Missing Supabase env vars. Fill .env.local first.");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });
  };

  return (
    <button
      onClick={onSignIn}
      className="rounded-lg border px-4 py-2 text-sm font-semibold"
      style={{ borderColor: "var(--line)", background: "var(--card)" }}
    >
      Continue with Google
    </button>
  );
}
