import { cn } from "@/lib/cn";
import { formatCompact, formatMoney, isNegative } from "@/lib/format";
import { Tooltip } from "./Tooltip";

export interface MoneyProps {
  /** Decimal string from the API, e.g. "-1250000.00". */
  value: string;
  currency: string;
  /** Compact notation (1.25bn) with the exact amount in a tooltip. */
  compact?: boolean;
  /** "always" adds + to positive values, for deltas and net flows. */
  sign?: "negative" | "always";
  /** Colour negatives (and positives when sign="always"). The minus sign is always shown. */
  colored?: boolean;
  /** Hide the currency code, e.g. in a table whose column header names the currency. */
  hideCurrency?: boolean;
  /** Tabular figures for columns (default). Large standalone values (KPI tiles) read better proportional. */
  tabular?: boolean;
  className?: string;
}

export function Money({
  value,
  currency,
  compact = false,
  sign = "negative",
  colored = true,
  hideCurrency = false,
  tabular = true,
  className,
}: MoneyProps) {
  const negative = isNegative(value);
  const positiveDelta = sign === "always" && !negative && Number(value) !== 0;
  const exact = formatMoney(value, currency, { sign });

  const text = (
    <span
      className={cn(
        tabular && "num",
        "whitespace-nowrap",
        colored && negative && "text-negative",
        colored && positiveDelta && "text-positive",
        className,
      )}
    >
      {compact ? formatCompact(value, { sign }) : exact}
      {!hideCurrency && <span className="ml-1 text-[0.8em] font-medium text-fg-faint">{currency}</span>}
    </span>
  );

  if (!compact) return text;
  return (
    <Tooltip content={<span className="num">{exact} {currency}</span>}>
      {text}
    </Tooltip>
  );
}
