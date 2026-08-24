import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const TITLE = "Sign in — Kernel Surface Ledger";
const DESCRIPTION =
  "Sign in to save kernel surface scans, compare hosts over time and ask the report questions with the live narration layer.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/scans" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/scans` },
      });
      setBusy(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        void navigate({ to: "/scans" });
      } else {
        setNotice("Account created. Confirm the email we just sent, then sign in.");
        setMode("signin");
      }
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    void navigate({ to: "/scans" });
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-xl font-bold tracking-tight text-foreground">
        {mode === "signin" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        An account stores your scans so you can diff a host before and after hardening, and keeps
        the live narration output with the scan it describes. The demo dashboard needs no account.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-xs">
          <span className="text-muted-foreground">email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-amber-dim"
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="mt-1 w-full border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-amber-dim"
          />
        </label>

        {error ? (
          <p className="border border-destructive/50 bg-surface px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="border border-ok/40 bg-surface px-3 py-2 text-xs text-ok">{notice}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full border border-amber-dim bg-surface px-3 py-2 text-sm text-amber transition-colors hover:bg-surface-raised disabled:opacity-50"
        >
          {busy ? "working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="mt-6 border-t border-border pt-6">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const { error: oauthError } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: window.location.origin },
            });
            if (oauthError) {
              setBusy(false);
              setError(oauthError.message ?? "Google sign-in failed");
              return;
            }
            // Supabase redirects to the provider; nothing else to do here.
          }}
          className="w-full border border-border bg-surface px-3 py-2 text-sm text-foreground transition-colors hover:border-amber-dim hover:text-amber disabled:opacity-50"
        >
          Continue with Google
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Fastest route for a reviewer — no confirmation email in the way.
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError(null);
        }}
        className="mt-4 text-xs text-muted-foreground underline transition-colors hover:text-amber"
      >
        {mode === "signin" ? "No account yet? Create one" : "Already have an account? Sign in"}
      </button>

      <Link
        to="/"
        className="mt-8 text-xs text-muted-foreground transition-colors hover:text-amber"
      >
        ← back to the demo dashboard
      </Link>
    </main>
  );
}
