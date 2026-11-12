import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { CalendarDays, ChevronDown, ChevronRight, DatabaseZap, Loader2, LogOut, Menu } from "lucide-react";
import { findNavItem } from "@/app/navigation";
import { ROLE_LABEL, ROLE_SUMMARY, useSession } from "@/app/session";
import { Badge, IconButton, Tooltip } from "@/components/ui";
import { formatDate, formatDateShort, formatWeekday } from "@/lib/format";

function Breadcrumb() {
  const { pathname } = useLocation();
  const match = findNavItem(pathname);
  if (!match) return <span className="text-sm font-medium text-fg">Not found</span>;
  const { group, item } = match;
  const showGroup = group.items.length > 1;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {showGroup && (
        <>
          <span className="hidden truncate text-fg-faint sm:inline">{group.label}</span>
          <ChevronRight className="hidden size-3.5 shrink-0 text-fg-faint sm:block" aria-hidden />
        </>
      )}
      <span className="truncate font-medium text-fg" aria-current="page">{item.label}</span>
    </nav>
  );
}

/** The simulation "today". Every as-of calculation uses it, never the wall clock (A8). */
function BusinessDate() {
  const { system, can } = useSession();
  const chip = (
    <span className="flex h-7 items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 text-xs">
      <CalendarDays className="size-3.5 text-fg-faint" aria-hidden />
      <span className="hidden text-fg-faint md:inline">Business date</span>
      <span className="num font-medium text-fg">
        <span className="hidden text-fg-muted sm:inline">{formatWeekday(system.businessDate)} </span>
        <span className="sm:hidden">{formatDateShort(system.businessDate)}</span>
        <span className="hidden sm:inline">{formatDate(system.businessDate)}</span>
      </span>
    </span>
  );
  return (
    <Tooltip
      side="bottom"
      align="end"
      content={
        <span className="block max-w-60">
          Simulation business date. All as-of calculations use this date, not today's calendar date.
          {can("ADMIN") ? " Change it in Admin › Settings." : ""}
        </span>
      }
    >
      {can("ADMIN") ? <Link to="/admin/settings" tabIndex={-1}>{chip}</Link> : chip}
    </Tooltip>
  );
}

function UserMenu() {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await logout(); // RequireAuth then sends the user to /login
  };
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-2 rounded-md pr-1.5 pl-1 hover:bg-hover"
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-surface-3 text-2xs font-semibold text-fg-muted ring-1 ring-line-strong">
          {initials}
        </span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-xs font-medium text-fg">{user.name}</span>
          <span className="block text-2xs text-fg-faint">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="size-3.5 text-fg-faint" aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute top-full right-0 z-50 mt-1.5 w-64 rounded-lg bg-surface-3 p-1 shadow-pop">
          <div className="px-2.5 py-2">
            <div className="text-sm font-medium text-fg">{user.name}</div>
            <div className="truncate text-xs text-fg-faint">{user.email}</div>
          </div>
          <div className="mx-2.5 mb-2 rounded-md border border-line-strong px-2.5 py-2">
            <div className="eyebrow">Role</div>
            <div className="mt-0.5 text-xs font-medium text-fg">{ROLE_LABEL[user.role]}</div>
            <div className="text-2xs text-fg-faint">{ROLE_SUMMARY[user.role]}</div>
          </div>
          <div className="my-1 h-px bg-line-strong" />
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={signOut}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-sm text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-60"
          >
            {signingOut ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { system } = useSession();
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md lg:px-6">
      <IconButton label="Open navigation" className="-ml-1.5 lg:hidden" onClick={onOpenMobileNav}>
        <Menu />
      </IconButton>
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {system.synthetic && (
          <Tooltip
            side="bottom"
            align="end"
            content={
              <span className="block max-w-60">
                Every dataset is synthetic. Metrics are simulation metrics, not regulatory ratios.
              </span>
            }
          >
            <Badge tone="warning" icon={<DatabaseZap aria-hidden />} className="h-7 rounded-md px-2 tracking-wide">
              <span className="hidden sm:inline">SYNTHETIC DATA</span>
              <span className="sr-only sm:hidden">Synthetic data</span>
            </Badge>
          </Tooltip>
        )}
        <BusinessDate />
        <Tooltip side="bottom" align="end" content="Base currency for aggregation and reporting">
          <span className="hidden h-7 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 text-xs sm:flex">
            <span className="text-fg-faint">Base</span>
            <span className="font-mono font-medium text-fg">{system.baseCurrency}</span>
          </span>
        </Tooltip>
        <div className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
        <UserMenu />
      </div>
    </header>
  );
}
