import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV, type NavGroup, type NavItem } from "@/app/navigation";
import { useSession } from "@/app/session";
import { cn } from "@/lib/cn";
import { readPref, writePref } from "@/lib/prefs";
import { BrandMark } from "./Brand";

function useVisibleGroups(): NavGroup[] {
  const { can } = useSession();
  return NAV.filter((g) => (!g.devOnly || import.meta.env.DEV) && (!g.minRole || can(g.minRole)))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.minRole || can(i.minRole)) }))
    .filter((g) => g.items.length > 0);
}

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors",
          collapsed ? "mx-auto w-9 justify-center" : "px-2.5",
          isActive ? "bg-accent-soft font-medium text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute top-1.5 bottom-1.5 -left-2 w-0.5 rounded-full bg-accent" aria-hidden />
          )}
          <Icon className={cn("size-4 shrink-0", isActive ? "text-accent" : "text-fg-faint group-hover:text-fg-muted")} aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

function Group({ group, collapsed, onNavigate }: { group: NavGroup; collapsed: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const containsActive = group.items.some((i) => i.path === pathname);
  const prefKey = `nav.group.${group.id}`;
  const [open, setOpen] = useState(() => readPref(prefKey, !group.collapsedByDefault));

  // Opening a page inside a collapsed group (e.g. from a link) reveals it.
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    writePref(prefKey, next);
  };

  // Single-item groups (Overview, Reports) render as plain rows: a header would only repeat the label.
  if (group.items.length === 1 || collapsed) {
    return (
      <div className={cn("flex flex-col gap-0.5", collapsed && "border-t border-line pt-2 first:border-t-0 first:pt-0")}>
        {group.items.map((item) => (
          <NavRow key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
    );
  }

  const listId = `nav-${group.id}`;
  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={listId}
        className="group flex h-7 w-full items-center justify-between rounded-md px-2.5 text-left"
      >
        <span className="eyebrow group-hover:text-fg-muted">{group.label}</span>
        <span className="flex items-center gap-1.5">
          {!open && <span className="num text-2xs text-fg-faint">{group.items.length}</span>}
          <ChevronRight
            className={cn("size-3.5 text-fg-faint transition-transform group-hover:text-fg-muted", open && "rotate-90")}
            aria-hidden
          />
        </span>
      </button>
      {open && (
        <div id={listId} className="mt-0.5 flex flex-col gap-0.5">
          {group.items.map((item) => (
            <NavRow key={item.path} item={item} collapsed={false} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const groups = useVisibleGroups();
  return (
    <nav aria-label="Main" className={cn("flex flex-col overflow-y-auto pb-3", collapsed ? "gap-2 px-2" : "gap-3 px-3")}>
      {groups.map((g) => (
        <Group key={g.id} group={g} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { system } = useSession();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface-1 transition-[width] duration-200 lg:flex",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <BrandMark collapsed={collapsed} />
      <div className="flex-1 overflow-hidden pt-2">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn("flex h-11 shrink-0 items-center border-t border-line", collapsed ? "justify-center" : "justify-between px-3")}>
        {!collapsed && <span className="num text-2xs text-fg-faint">v{system.version}</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar  [" : "Collapse sidebar  ["}
          className="flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-hover hover:text-fg"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
    </aside>
  );
}
