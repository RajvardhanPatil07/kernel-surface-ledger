import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/how-it-works", label: "Method" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/prior-art", label: "Prior art" },
  { to: "/submission", label: "Submission" },
] as const;

export function SiteNav() {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center px-4 py-2 sm:px-6">
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
      </div>
    </div>
  );
}
