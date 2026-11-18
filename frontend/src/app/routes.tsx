import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui";
import { LoginPage } from "@/features/auth/LoginPage";
import { NotFoundPage, PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
import { NAV } from "./navigation";
import { RequireRole } from "./RequireRole";

/** Load a page's code only when it is first opened (keeps the initial bundle small). */
function page(load: () => Promise<ComponentType>) {
  const Component = lazy(() => load().then((c) => ({ default: c })));
  return <Component />;
}

function PageFallback() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="mt-2 h-64 w-full" />
    </div>
  );
}

/** Screens that exist. Everything else in NAV renders a placeholder until designed. */
const SCREENS: Record<string, ReactNode> = {
  "/": page(() => import("@/features/dashboard/DashboardPage").then((m) => m.DashboardPage)),
  "/data/counterparties": page(() => import("@/features/counterparties/CounterpartiesPage").then((m) => m.CounterpartiesPage)),
  "/data/deals": page(() => import("@/features/deals/DealsPage").then((m) => m.DealsPage)),
  "/data/cash-flows": page(() => import("@/features/cash-flows/CashFlowsPage").then((m) => m.CashFlowsPage)),
  "/design-system": page(() => import("@/features/design-system/DesignSystemPage").then((m) => m.DesignSystemPage)),
};

const navRoutes: RouteObject[] = NAV.filter((g) => !g.devOnly || import.meta.env.DEV).flatMap((group) =>
  group.items.map((item) => {
    const screen = SCREENS[item.path] ? <Suspense fallback={<PageFallback />}>{SCREENS[item.path]}</Suspense> : <PlaceholderPage item={item} />;
    const role = item.minRole ?? group.minRole;
    return {
      path: item.path,
      element: role ? <RequireRole role={role}>{screen}</RequireRole> : screen,
    };
  }),
);

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [...navRoutes, { path: "*", element: <NotFoundPage /> }],
  },
]);
