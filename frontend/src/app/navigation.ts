/**
 * Information architecture (TECHNICAL_PLAN §1.5). One source of truth for the
 * sidebar, the top-bar breadcrumb, routes and role gating.
 */
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownUp,
  ArrowLeftRight,
  Building2,
  ChartColumnStacked,
  ChartPie,
  ChartSpline,
  Coins,
  Droplets,
  FileText,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  Landmark,
  LayoutDashboard,
  Palette,
  Radar,
  Repeat,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  Vault,
  Wallet,
} from "lucide-react";
import type { Role } from "./session";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** One line shown on the page header and the placeholder screen. */
  description: string;
  /** Minimum role to see the item. Omitted means every signed-in user. */
  minRole?: Role;
  /** Roadmap milestone that builds the screen. */
  milestone: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  minRole?: Role;
  /** Collapsed by default in the sidebar (long or rarely used groups). */
  collapsedByDefault?: boolean;
  /** Only shown in development builds. */
  devOnly?: boolean;
}

export const NAV: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        path: "/",
        icon: LayoutDashboard,
        description: "Liquidity KPIs, cash position, projections, concentration and risk at a glance.",
        milestone: "M3.4",
      },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    items: [
      {
        label: "Liquidity Position",
        path: "/liquidity/position",
        icon: Droplets,
        description: "Opening liquidity, daily and weekly available liquidity, funding requirement and survival horizon.",
        milestone: "M4.3",
      },
      {
        label: "Gaps & Maturity Ladder",
        path: "/liquidity/gaps",
        icon: ChartColumnStacked,
        description: "Cash-flow gaps by ladder bucket, principal maturity mismatch and weighted average maturity.",
        milestone: "M4.3",
      },
      {
        label: "Concentration & FX",
        path: "/liquidity/concentration",
        icon: ChartPie,
        description: "Counterparty concentration (HHI), funding dependency and net open position by currency.",
        milestone: "M4.3",
      },
    ],
  },
  {
    id: "stress",
    label: "Stress Testing",
    items: [
      {
        label: "Scenarios",
        path: "/stress/scenarios",
        icon: FlaskConical,
        description: "Build lever-based stress scenarios from presets and run them against current positions.",
        milestone: "M5.4",
      },
      {
        label: "Executions & Comparison",
        path: "/stress/executions",
        icon: GitCompareArrows,
        description: "Baseline vs stressed results, attribution by lever, and side-by-side comparison of runs.",
        milestone: "M5.4",
      },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      {
        label: "Forecasts",
        path: "/intelligence/forecasts",
        icon: ChartSpline,
        description: "Forecasts of non-contractual flows with prediction intervals and backtest metrics.",
        milestone: "M6.2",
      },
      {
        label: "Anomalies",
        path: "/intelligence/anomalies",
        icon: Radar,
        description: "Unusual cash flows with the reasons they were flagged, and a review workflow.",
        milestone: "M6.3",
      },
      {
        label: "Counterparty Risk",
        path: "/intelligence/counterparty-risk",
        icon: ShieldAlert,
        description: "Risk scores with factor contributions, compared against the analyst-assigned classification.",
        milestone: "M6.4",
      },
      {
        label: "Insights",
        path: "/intelligence/insights",
        icon: Sparkles,
        description: "Findings generated from engine results, with an optional local-LLM narrative.",
        milestone: "M6.5",
      },
      {
        label: "Model Performance",
        path: "/intelligence/models",
        icon: Gauge,
        description: "Model registry, evaluation metrics, champion selection and training runs.",
        milestone: "M6.6",
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    collapsedByDefault: true,
    items: [
      { label: "Counterparties", path: "/data/counterparties", icon: Building2, description: "Counterparty master data, ratings and payment behaviour.", milestone: "M3.3" },
      { label: "MM Deals", path: "/data/deals", icon: ArrowLeftRight, description: "Money-market deals with generated cash-flow schedules.", milestone: "M3.3" },
      { label: "Cash Flows", path: "/data/cash-flows", icon: ArrowDownUp, description: "Projected and settled cash flows, overdue items and settlement.", milestone: "M3.3" },
      { label: "Funding Sources", path: "/data/funding-sources", icon: Landmark, description: "Deposit pools and credit facilities, with utilisation and headroom.", milestone: "M3.3" },
      { label: "Liquid Assets", path: "/data/liquid-assets", icon: Vault, description: "Securities buffer with market values, haircuts and encumbrance.", milestone: "M3.3" },
      { label: "Cash Accounts", path: "/data/cash-accounts", icon: Wallet, description: "Cash accounts and opening balance anchors per currency.", milestone: "M3.3" },
      { label: "Currency Exposures", path: "/data/currency-exposures", icon: Coins, description: "Manual FX positions and off-balance items not captured elsewhere.", milestone: "M3.3" },
      { label: "FX Rates", path: "/data/fx-rates", icon: Repeat, description: "FX rate history and as-of snapshots against the base currency.", milestone: "M3.3" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      {
        label: "Reports",
        path: "/reports",
        icon: FileText,
        description: "Build risk reports and export them as PDF or a ZIP of CSVs.",
        milestone: "M7.1",
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    minRole: "ADMIN",
    collapsedByDefault: true,
    items: [
      { label: "Users", path: "/admin/users", icon: Users, description: "User accounts, roles and activation.", milestone: "M3.2", minRole: "ADMIN" },
      { label: "Audit Log", path: "/admin/audit", icon: ScrollText, description: "Append-only trail of every change, login and export.", milestone: "M3.3", minRole: "ADMIN" },
      { label: "Settings", path: "/admin/settings", icon: Settings, description: "Simulation business date, minimum liquidity buffer and defaults.", milestone: "M3.2", minRole: "ADMIN" },
    ],
  },
  {
    id: "dev",
    label: "Developer",
    devOnly: true,
    items: [
      {
        label: "Design System",
        path: "/design-system",
        icon: Palette,
        description: "Tokens, typography, number formatting and UI primitives.",
        milestone: "M3.1",
      },
    ],
  },
];

export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | undefined {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.path === pathname) return { group, item };
    }
  }
  return undefined;
}
