import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, DatabaseZap, Droplets, Eye, EyeOff, FlaskConical, Lock, Sparkles } from "lucide-react";
import { isApiError } from "@/api/problem";
import { ROLE_LABEL, ROLE_SUMMARY } from "@/app/session";
import { useAuth } from "@/auth/AuthProvider";
import { safeNext, SessionSplash } from "@/auth/RequireAuth";
import { BrandMark } from "@/components/layout/Brand";
import { Alert, Badge, Button, Field, Input } from "@/components/ui";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/mocks/auth";
import { MOCK_SYSTEM_INFO } from "@/mocks/session";

/** Until the backend exists, sign-in is mocked and the demo accounts are listed. */
const MOCK_AUTH = true;

type FailureKind = "invalid" | "locked" | "inactive" | "unexpected";

interface Failure {
  kind: FailureKind;
  lockedUntil?: string;
  requestId?: string;
  message?: string;
}

const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

function classify(e: unknown): Failure {
  if (isApiError(e)) {
    if (e.status === 401) return { kind: "invalid" };
    if (e.status === 423) return { kind: "locked", lockedUntil: e.problem.locked_until };
    if (e.status === 403) return { kind: "inactive" };
    return { kind: "unexpected", requestId: e.requestId, message: e.message };
  }
  return { kind: "unexpected", message: "The server couldn't be reached. Check your connection and try again." };
}

function FailureNotice({ failure }: { failure: Failure }) {
  switch (failure.kind) {
    case "invalid":
      return (
        <Alert tone="negative" title="Email or password is incorrect" live>
          Check both and try again. After 5 failed attempts the account locks for 15 minutes.
        </Alert>
      );
    case "locked":
      return (
        <Alert tone="negative" icon={<Lock />} title="Account temporarily locked" live>
          Too many failed attempts.{" "}
          {failure.lockedUntil
            ? `Try again after ${TIME_FMT.format(new Date(failure.lockedUntil))}.`
            : "Try again in 15 minutes."}
        </Alert>
      );
    case "inactive":
      return (
        <Alert tone="negative" title="This account is deactivated" live>
          Ask an administrator to reactivate it.
        </Alert>
      );
    default:
      return (
        <Alert tone="negative" title="Sign-in failed" live>
          {failure.message}
          {failure.requestId && <span className="mt-1 block font-mono text-2xs text-fg-faint">Request ID {failure.requestId}</span>}
        </Alert>
      );
  }
}

/* ---------- Brand panel ---------- */

/**
 * Illustrative only: a stylised 21-day available-liquidity path that uses the
 * app's chart conventions (actual solid, projected dashed, T0 marker, buffer line).
 */
function IllustrativeChart() {
  // x: 10px per day; T0 at x=90, projection to x=300 (21 days). Breach at x=228, day 14.
  const actual = "M0 52 L10 48 L20 55 L30 46 L40 50 L50 41 L60 44 L70 38 L80 42 L90 36";
  const projected =
    "M90 36 L100 40 L110 37 L120 45 L130 43 L140 52 L150 49 L160 58 L170 61 L180 57 L190 68 L200 72 L210 70 L220 81 L230 89 L240 86 L250 95 L260 92 L270 99 L280 97 L290 103 L300 100";
  const bufferY = 88;
  return (
    <figure className="rounded-lg border border-line bg-surface-1/80 p-4 backdrop-blur-sm">
      <figcaption className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-fg">Available liquidity · 21-day projection</div>
          <div className="text-2xs text-fg-faint">Illustrative, synthetic</div>
        </div>
        <Badge tone="warning" dot>Breach on day 14</Badge>
      </figcaption>
      <svg viewBox="-4 20 312 100" className="h-auto w-full" role="img" aria-label="Illustrative chart: projected liquidity falls below the minimum buffer on day 14">
        {[40, 64, 88, 112].map((y) => (
          <line key={y} x1="0" x2="300" y1={y} y2={y} className="stroke-line" strokeWidth="1" />
        ))}
        <path d={`${projected} L300 120 L90 120 Z`} className="fill-accent/8" />
        <line x1="0" x2="300" y1={bufferY} y2={bufferY} className="stroke-warning" strokeWidth="1.25" strokeDasharray="4 3" />
        <text x="2" y={bufferY - 4} className="fill-warning text-[7px]">Minimum buffer</text>
        <line x1="90" x2="90" y1="22" y2="120" className="stroke-fg-faint" strokeWidth="1" strokeDasharray="2 2" />
        <text x="93" y="29" className="fill-fg-faint text-[7px]">T₀</text>
        <path d={actual} fill="none" className="stroke-fg-muted" strokeWidth="1.75" strokeLinejoin="round" />
        <path d={projected} fill="none" className="stroke-accent" strokeWidth="1.75" strokeDasharray="5 3" strokeLinejoin="round" />
        <circle cx="228" cy={bufferY} r="3.5" className="fill-canvas stroke-warning" strokeWidth="1.5" />
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-fg-faint">
        <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-fg-muted" />Actual</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-accent" />Projected</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-warning" />Buffer</span>
      </div>
    </figure>
  );
}

const CAPABILITIES = [
  { icon: Droplets, title: "Liquidity position", text: "Daily available liquidity, gaps, funding requirement and survival horizon." },
  { icon: FlaskConical, title: "Stress testing", text: "Lever-based scenarios run on real positions, with attribution per lever." },
  { icon: Sparkles, title: "Explainable intelligence", text: "Forecasts, anomalies and risk scores that show their reasons." },
];

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden border-r border-line bg-surface-1 lg:flex lg:flex-col">
      {/* The one place a gradient is allowed (TECHNICAL_PLAN §1.5): a quiet accent glow. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 15% 0%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
        aria-hidden
      />
      <BrandMark className="relative px-10 pt-6" />
      <div className="relative flex flex-1 flex-col justify-center px-10 py-10 xl:px-16">
        <div className="max-w-lg">
          <p className="eyebrow mb-3 text-accent">Treasury simulation workspace</p>
          <h2 className="text-[28px] leading-[36px] font-semibold tracking-tight text-fg">
            See the liquidity gap before it opens.
          </h2>
          <p className="mt-3 text-base text-fg-muted">
            Project positions, stress funding and FX, and trace every number back to the cash flows behind it.
          </p>
          <div className="mt-8">
            <IllustrativeChart />
          </div>
          <ul className="mt-8 flex flex-col gap-4">
            {CAPABILITIES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-accent">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-fg">{title}</p>
                  <p className="text-xs text-fg-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="relative flex items-center gap-2 px-10 pb-6 text-xs text-fg-faint xl:px-16">
        <DatabaseZap className="size-3.5 text-warning" aria-hidden />
        All data is synthetic. Metrics are simulation metrics, not regulatory ratios.
      </p>
    </aside>
  );
}

/* ---------- Form ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function DemoAccounts({ onPick, disabled }: { onPick: (email: string) => void; disabled: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-1">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="eyebrow">Demo accounts</span>
        <Badge tone="warning">Mock sign-in</Badge>
      </div>
      <ul className="p-1">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(a.email)}
              className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-hover disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-fg">{ROLE_LABEL[a.role]}</span>
                  <span className="truncate font-mono text-2xs text-fg-faint">{a.email}</span>
                </span>
                <span className="block truncate text-xs text-fg-muted">{ROLE_SUMMARY[a.role]}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-3 py-2 text-2xs text-fg-faint">
        Selecting an account fills the form. Password for all: <span className="font-mono text-fg-muted">{DEMO_PASSWORD}</span>
      </p>
    </div>
  );
}

export function LoginPage() {
  const { status, signOutReason, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "signedOut") emailRef.current?.focus();
  }, [status]);

  if (status === "restoring") return <SessionSplash />;
  if (status === "signedIn") return <Navigate to={next} replace />;

  const onCapsKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = "Enter your email address";
    else if (!EMAIL_RE.test(email.trim())) errors.email = "Enter a valid email address, like name@lrs.local";
    if (!password) errors.password = "Enter your password";
    setFieldErrors(errors);
    if (errors.email) return emailRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();

    setSubmitting(true);
    setFailure(null);
    try {
      await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setFailure(classify(err));
      setPassword("");
      setSubmitting(false);
      passwordRef.current?.focus();
    }
  };

  const pickDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setFieldErrors({});
    setFailure(null);
  };

  const notice = failure ? (
    <FailureNotice failure={failure} />
  ) : signOutReason === "expired" ? (
    <Alert tone="warning" title="Your session expired">Sign in again to continue where you left off.</Alert>
  ) : signOutReason === "signedOut" ? (
    <Alert tone="positive" title="You've signed out" />
  ) : next !== "/" ? (
    <Alert tone="info" title="Sign in to continue">You'll go straight back to the page you opened.</Alert>
  ) : null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(440px,1fr)]">
      <BrandPanel />

      <main className="flex flex-col">
        <div className="flex items-center justify-between px-6 pt-4 lg:hidden">
          <BrandMark className="px-0" />
          <Badge tone="warning" icon={<DatabaseZap aria-hidden />}>SYNTHETIC DATA</Badge>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-[360px]">
            <h1 className="text-xl font-semibold tracking-tight text-fg">Sign in</h1>
            <p className="mt-1 text-sm text-fg-muted">Use your simulator account.</p>

            {notice && <div className="mt-5">{notice}</div>}

            <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
              <Field label="Email" error={fieldErrors.email}>
                {(p) => (
                  <Input
                    {...p}
                    ref={emailRef}
                    type="email"
                    name="email"
                    autoComplete="username"
                    spellCheck={false}
                    placeholder="name@lrs.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    className="h-9"
                  />
                )}
              </Field>

              <Field
                label="Password"
                error={fieldErrors.password}
                hint={capsLock ? <span className="text-warning">Caps Lock is on</span> : undefined}
              >
                {(p) => (
                  <div className="relative">
                    <Input
                      {...p}
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={onCapsKey}
                      onKeyUp={onCapsKey}
                      disabled={submitting}
                      className="h-9 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      title={showPassword ? "Hide password" : "Show password"}
                      className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-faint hover:bg-hover hover:text-fg"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                )}
              </Field>

              <Button type="submit" variant="primary" loading={submitting} className="mt-1 h-9 w-full">
                {submitting ? "Signing in…" : "Sign in"}
              </Button>

              <p className="text-center text-xs text-fg-faint">
                Forgot your password? Ask an administrator to reset it.
              </p>
            </form>

            {MOCK_AUTH && (
              <div className="mt-8">
                <DemoAccounts onPick={pickDemo} disabled={submitting} />
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between px-6 pb-5 text-2xs text-fg-faint">
          <span className="num">v{MOCK_SYSTEM_INFO.version}</span>
          <span className="lg:hidden">Simulation metrics, not regulatory ratios</span>
        </footer>
      </main>
    </div>
  );
}
