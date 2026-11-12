import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { ROLE_LABEL, useSession, type Role } from "./session";

/** Route guard. The API enforces the same rule; this only avoids showing dead ends. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { can } = useSession();
  if (can(role)) return <>{children}</>;
  return (
    <Card>
      <EmptyState
        icon={<Lock />}
        title="You don't have access to this page"
        description={`It needs the ${ROLE_LABEL[role]} role. Ask an administrator if you need access.`}
      />
    </Card>
  );
}
