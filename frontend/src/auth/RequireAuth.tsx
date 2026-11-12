import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { BrandGlyph } from "@/components/layout/Brand";
import { useAuth } from "./AuthProvider";

/** Gate for the signed-in app. Remembers where the user was going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signOutReason } = useAuth();
  const location = useLocation();

  if (status === "restoring") return <SessionSplash />;
  if (status === "signedOut") {
    // A deliberate sign-out starts fresh; otherwise come back to the same page after signing in.
    const next = location.pathname + location.search;
    const to = signOutReason === "signedOut" || next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}

/** Shown while the refresh call restores a session on page load. */
export function SessionSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <BrandGlyph className="size-10 animate-shimmer" />
      <p className="text-xs text-fg-faint">Restoring your session…</p>
    </div>
  );
}

/**
 * Only same-app paths are allowed as a post-login destination, so a crafted
 * ?next= link can't bounce the user to another site (open redirect).
 */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login")) return "/";
  return raw;
}
