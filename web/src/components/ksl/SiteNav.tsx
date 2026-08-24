import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/scans", label: "Scans" },
  { to: "/how-it-works", label: "Method" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/prior-art", label: "Prior art" },
  { to: "/submission", label: "Submission" },
] as const;

export function SiteNav() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setEmail(session?.user?.email ?? null);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
        <nav aria-label="Site" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="mr-1 tracking-[0.16em] text-amber">ksl</span>
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/" }}
              activeProps={{ className: "text-amber" }}
              className="text-muted-foreground transition-colors hover:text-amber"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-[11px]">
          {email ? (
            <>
              <span className="text-muted-foreground">{email}</span>
              <button
                type="button"
                onClick={() => void supabase.auth.signOut()}
                className="border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
