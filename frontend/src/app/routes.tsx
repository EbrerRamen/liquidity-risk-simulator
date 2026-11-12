import { createBrowserRouter, type RouteObject } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { DesignSystemPage } from "@/features/design-system/DesignSystemPage";
import { NotFoundPage, PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
import { NAV } from "./navigation";
import { RequireRole } from "./RequireRole";

/** Screens that exist. Everything else in NAV renders a placeholder until designed. */
const SCREENS: Record<string, React.ReactNode> = {
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
  {
    element: <AppShell />,
    children: [...navRoutes, { path: "*", element: <NotFoundPage /> }],
  },
]);
