import { createBrowserRouter, type RouteObject } from "react-router";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DesignSystemPage } from "@/features/design-system/DesignSystemPage";
import { NotFoundPage, PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
import { NAV } from "./navigation";
import { RequireRole } from "./RequireRole";

/** Screens that exist. Everything else in NAV renders a placeholder until designed. */
const SCREENS: Record<string, React.ReactNode> = {
  "/": <DashboardPage />,
  "/design-system": <DesignSystemPage />,
};

const navRoutes: RouteObject[] = NAV.filter((g) => !g.devOnly || import.meta.env.DEV).flatMap((group) =>
  group.items.map((item) => {
    const screen = SCREENS[item.path] ?? <PlaceholderPage item={item} />;
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
