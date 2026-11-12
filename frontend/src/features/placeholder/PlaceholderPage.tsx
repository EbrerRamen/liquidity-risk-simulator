import { Link } from "react-router";
import { Hammer } from "lucide-react";
import type { NavItem } from "@/app/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, buttonClass, Card, EmptyState } from "@/components/ui";

/** Stand-in for screens that are designed in later steps. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <Card>
        <EmptyState
          icon={<Hammer />}
          title="This screen hasn't been designed yet"
          description={
            <>
              It is built in milestone <Badge className="mx-0.5 align-middle">{item.milestone}</Badge>. The shell,
              navigation and design system around it are in place.
            </>
          }
          action={
            import.meta.env.DEV ? (
              <Link to="/design-system" className={buttonClass("secondary", "sm")}>
                View design system
              </Link>
            ) : undefined
          }
        />
      </Card>
    </>
  );
}

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        title="Page not found"
        description="The address doesn't match any screen."
        action={
          <Link to="/" className={buttonClass("secondary", "sm")}>
            Go to dashboard
          </Link>
        }
      />
    </Card>
  );
}
