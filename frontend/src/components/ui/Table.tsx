import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Table conventions: dense 36px rows, sticky header, numbers right-aligned in
 * tabular figures, identifiers in mono. The full server-paginated DataTable
 * (TanStack Table) builds on these in M3.3.
 */
export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-surface-1">{children}</thead>;
}

export function Th({ numeric, className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 border-b border-line px-3 text-xs font-medium whitespace-nowrap text-fg-faint first:pl-4 last:pr-4",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Tr({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-line last:border-b-0 hover:bg-surface-2", className)} {...rest}>
      {children}
    </tr>
  );
}

export function Td({
  numeric,
  mono,
  className,
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; mono?: boolean }) {
  return (
    <td
      className={cn(
        "h-9 px-3 whitespace-nowrap text-fg first:pl-4 last:pr-4",
        numeric && "num text-right",
        mono && "font-mono text-xs",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
