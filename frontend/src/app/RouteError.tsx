import { isRouteErrorResponse, useRouteError } from "react-router";
import { Home, RotateCw } from "lucide-react";
import { isApiError } from "@/api/problem";
import { Button, buttonClass, Card, ErrorState } from "@/components/ui";

/** A lazily loaded page whose file is gone, usually because a new version was deployed. */
const isChunkError = (e: unknown) => e instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(e.message);

/**
 * Error boundary for routes (TECHNICAL_PLAN §1.5 states). Inside the shell it
 * replaces only the page, so navigation still works; `fullPage` is the last
 * resort when the shell itself fails.
 */
export function RouteError({ fullPage = false }: { fullPage?: boolean }) {
  const error = useRouteError();
  const chunk = isChunkError(error);
  const message = chunk
    ? "The app was probably updated since this tab opened. Reload to get the latest version."
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : "An unexpected error stopped this page from rendering.";

  const body = (
    <Card>
      <ErrorState title={chunk ? "This page couldn't load" : "Something went wrong on this page"} message={message} requestId={isApiError(error) ? error.requestId : undefined} />
      <div className="-mt-4 flex justify-center gap-2 pb-8">
        <Button variant="primary" icon={<RotateCw />} onClick={() => window.location.reload()}>
          Reload page
        </Button>
        {/* A plain link: the router may be what failed. */}
        <a href="/" className={buttonClass("secondary")}>
          <Home aria-hidden />
          Go to the dashboard
        </a>
      </div>
      {import.meta.env.DEV && error instanceof Error && error.stack && !chunk && (
        <pre className="max-h-64 overflow-auto border-t border-line px-4 py-3 font-mono text-2xs whitespace-pre-wrap text-fg-faint">{error.stack}</pre>
      )}
    </Card>
  );

  return fullPage ? <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4">{body}</div> : body;
}
