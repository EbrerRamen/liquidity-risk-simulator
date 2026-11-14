import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui";
import { readPref, writePref } from "@/lib/prefs";
import { BrandMark } from "./Brand";
import { Sidebar, SidebarNav } from "./Sidebar";
import { TopBar } from "./TopBar";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => readPref("sidebar.collapsed", false));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writePref("sidebar.collapsed", next);
  };

  // "[" toggles the sidebar, as in most dense desktop tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-fg-onaccent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <Sidebar collapsed={collapsed} onToggle={toggle} />

      {/* Mobile and tablet: the sidebar becomes a drawer. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface-1 shadow-pop">
            <div className="flex items-center justify-between pr-2">
              <BrandMark />
              <IconButton label="Close navigation" onClick={() => setMobileOpen(false)}>
                <X />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 scrollbar-none overflow-y-auto overscroll-contain pt-2">
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
        <main id="main" className="min-w-0 flex-1 px-4 py-5 lg:px-6">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
