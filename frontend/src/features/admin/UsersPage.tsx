import { useCallback, useId, useState } from "react";
import { Link } from "react-router";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { z } from "zod";
import { Eye, EyeOff, MoreHorizontal, Pencil, ScrollText, UserCheck, UserX, Users } from "lucide-react";
import { isApiError } from "@/api/problem";
import { PASSWORD_MIN_LENGTH, usersApi, type User, type UserFilters, type UserItem } from "@/api/users";
import { ROLE_LABEL, ROLE_SUMMARY, useSession, type Role } from "@/app/session";
import { applyServerErrors, DetailSection, DetailSkeleton, EditorDrawer, FormBanner, KeyValueList, RecordSection, ResourceListPage, useReportDirty, type Banner, type PanelNav } from "@/components/data";
import { Alert, Badge, Button, ConfirmDialog, Drawer, Field, IconButton, Input, Menu, Select, Tooltip, useToast, type Tone } from "@/components/ui";
import { formatDateTime, formatTime } from "@/lib/format";
import { useWrite } from "../data-shared/shared";

const ROLES: readonly Role[] = ["VIEWER", "RISK_ANALYST", "ADMIN"];
const LOCKOUT_RULE = "Five failed sign-ins in a row lock an account for 15 minutes.";
const col = createColumnHelper<UserItem>();

/* ---------- status ---------- */

function userStatus(u: Pick<UserItem, "is_active" | "locked_until">): [Tone, string] {
  if (!u.is_active) return ["neutral", "Inactive"];
  if (u.locked_until) return ["warning", "Locked"];
  return ["positive", "Active"];
}

function UserStatusBadge({ user }: { user: Pick<UserItem, "is_active" | "locked_until"> }) {
  const [tone, label] = userStatus(user);
  const badge = (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
  return user.is_active && user.locked_until ? (
    <Tooltip content={`Too many failed sign-ins. Unlocks at ${formatTime(user.locked_until)}.`}>{badge}</Tooltip>
  ) : (
    badge
  );
}

/* ---------- detail ---------- */

function UserDetail({ id, nav }: { id: string; nav: PanelNav }) {
  const { user: me } = useSession();
  const toast = useToast();
  const q = useQuery({ queryKey: ["users", "detail", id], queryFn: () => usersApi.get(id) });
  const setActive = useWrite((u: User) => usersApi.update(u.id, { is_active: !u.is_active, version: u.version }), "users");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const u = q.data;
  const isSelf = u?.id === me.id;

  return (
    <>
      <Drawer
        open
        onClose={nav.close}
        title={u?.full_name ?? "User"}
        subtitle={u?.email}
        headerActions={
          u && (
            <>
              <Button size="sm" icon={<Pencil />} onClick={nav.edit}>
                Edit
              </Button>
              <Menu
                label="More actions"
                trigger={(p) => (
                  <IconButton label="More actions" {...p}>
                    <MoreHorizontal />
                  </IconButton>
                )}
                items={[
                  u.is_active
                    ? { label: "Deactivate", icon: <UserX />, tone: "danger", disabled: isSelf, hint: isSelf ? "You can't deactivate your own account" : undefined, onSelect: () => setConfirm(true) }
                    : { label: "Reactivate", icon: <UserCheck />, onSelect: () => setConfirm(true) },
                ]}
              />
            </>
          )
        }
      >
        {q.isPending ? (
          <DetailSkeleton />
        ) : q.isError ? (
          <div className="p-5">
            <Alert tone="negative" title="Couldn't load this user">
              {q.error.message}
            </Alert>
          </div>
        ) : (
          u && (
            <>
              <DetailSection title="Access">
                <KeyValueList
                  rows={[
                    [
                      "Role",
                      <span key="r">
                        <span className="font-medium">{ROLE_LABEL[u.role]}</span>
                        <span className="block text-xs text-fg-muted">{ROLE_SUMMARY[u.role]}</span>
                      </span>,
                    ],
                    ["Status", <UserStatusBadge key="s" user={u} />],
                    ["Last sign-in", u.last_login_at ? formatDateTime(u.last_login_at) : <span key="n" className="text-fg-faint">Never</span>],
                    ["Failed sign-ins", <span key="f" className="num">{u.failed_login_count}</span>],
                  ]}
                />
                {u.is_active && u.locked_until && (
                  <Alert tone="warning" title="Locked out" className="mt-3">
                    {LOCKOUT_RULE} The account unlocks by itself at {formatTime(u.locked_until)}.
                  </Alert>
                )}
                {!u.is_active && (
                  <Alert tone="info" title="Deactivated" className="mt-3">
                    {u.full_name} can't sign in, and any open session has ended. The account and its history are kept for the audit trail.
                  </Alert>
                )}
              </DetailSection>
              <DetailSection title="Activity">
                <Link to={`/admin/audit?actor=${u.id}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-strong">
                  <ScrollText className="size-4" aria-hidden />
                  View {isSelf ? "your" : `${u.full_name}'s`} actions in the audit log
                </Link>
              </DetailSection>
              <RecordSection record={u} />
            </>
          )
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm}
        tone={u?.is_active ? "danger" : "default"}
        title={u?.is_active ? `Deactivate ${u.full_name}?` : `Reactivate ${u?.full_name ?? "user"}?`}
        body={
          <>
            {u?.is_active
              ? "They'll be signed out and can't sign in again until an admin reactivates the account. Their history stays in the audit log."
              : `They'll be able to sign in again as ${u ? ROLE_LABEL[u.role] : ""}, with their previous password.`}
            {error && (
              <Alert tone="negative" title="Couldn't save" className="mt-3">
                {error}
              </Alert>
            )}
          </>
        }
        confirmLabel={u?.is_active ? "Deactivate" : "Reactivate"}
        busy={setActive.isPending}
        onCancel={() => {
          setConfirm(false);
          setError(null);
        }}
        onConfirm={() =>
          void setActive
            .mutateAsync(u!)
            .then((saved) => {
              setConfirm(false);
              toast.show({ tone: "positive", title: saved.is_active ? `${saved.full_name} reactivated` : `${saved.full_name} deactivated` });
            })
            .catch((e) => setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server."))
        }
      />
    </>
  );
}

/* ---------- editor ---------- */

const CREATE_FIELDS = ["full_name", "email", "role", "password"] as const;
const EDIT_FIELDS = ["full_name", "role"] as const;

const createSchema = z
  .object({
    full_name: z.string().trim().min(2, { error: "Enter at least 2 characters" }),
    email: z.email({ error: "Enter an email address" }),
    role: z.enum(ROLES),
    password: z.string().min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters` }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], error: "The passwords don't match" });

const editSchema = z.object({
  full_name: z.string().trim().min(2, { error: "Enter at least 2 characters" }),
  role: z.enum(ROLES),
});

function RoleField({ error, disabledReason, registration }: { error?: string; disabledReason?: string; registration: UseFormRegisterReturn<"role"> }) {
  return (
    <Field label="Role" required error={error} hint={disabledReason ?? "Each role includes the ones above it"}>
      {(p) => (
        <Select {...p} {...registration} disabled={!!disabledReason}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}: {ROLE_SUMMARY[r]}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function CreateUserEditor({ nav }: { nav: PanelNav }) {
  const formId = useId();
  const toast = useToast();
  const create = useWrite((v: z.infer<typeof createSchema>) => usersApi.create({ full_name: v.full_name, email: v.email, role: v.role, password: v.password }), "users");
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [show, setShow] = useState(false);
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    mode: "onTouched",
    defaultValues: { full_name: "", email: "", role: "VIEWER", password: "", confirm: "" },
  });
  const { register, handleSubmit, formState, setError } = form;
  const { errors } = formState;
  useReportDirty(formState.isDirty, setDirty);

  const submit = handleSubmit(async (v) => {
    setBanner(null);
    try {
      const saved = await create.mutateAsync(v);
      setDirty(false);
      toast.show({ tone: "positive", title: `${saved.full_name} added`, detail: `Share the initial password with them securely. They sign in as ${saved.email}.` });
      nav.view(saved.id);
    } catch (err) {
      setBanner(applyServerErrors(err, setError, CREATE_FIELDS));
    }
  });

  return (
    <EditorDrawer noun="user" title="New user" formId={formId} isNew dirty={dirty} saving={create.isPending} submitLabel="Add user" onClose={nav.closeEditor}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5">
        <FormBanner banner={banner} />
        <Field label="Full name" required error={errors.full_name?.message}>
          {(p) => <Input {...p} {...register("full_name")} autoComplete="off" placeholder="e.g. Jordan Ellis" />}
        </Field>
        <Field label="Email" required error={errors.email?.message} hint="Their sign-in name. It can't be changed later.">
          {(p) => <Input {...p} type="email" {...register("email")} autoComplete="off" placeholder="name@example.com" />}
        </Field>
        <RoleField error={errors.role?.message} registration={register("role")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Initial password" required error={errors.password?.message} hint={`At least ${PASSWORD_MIN_LENGTH} characters`}>
            {(p) => <Input {...p} type={show ? "text" : "password"} {...register("password")} autoComplete="new-password" />}
          </Field>
          <Field label="Confirm password" required error={errors.confirm?.message}>
            {(p) => <Input {...p} type={show ? "text" : "password"} {...register("confirm")} autoComplete="new-password" />}
          </Field>
        </div>
        <div className="-mt-2">
          <Button size="sm" variant="ghost" icon={show ? <EyeOff /> : <Eye />} aria-pressed={show} onClick={() => setShow((v) => !v)}>
            {show ? "Hide passwords" : "Show passwords"}
          </Button>
        </div>
      </form>
    </EditorDrawer>
  );
}

function EditUserEditor({ id, nav }: { id: string; nav: PanelNav }) {
  const formId = useId();
  const toast = useToast();
  const { user: me, reload } = useSession();
  const entity = useQuery({ queryKey: ["users", "detail", id], queryFn: () => usersApi.get(id) });
  const update = useWrite(({ uid, patch }: { uid: string; patch: Parameters<typeof usersApi.update>[1] }) => usersApi.update(uid, patch), "users");
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const e = entity.data;
  const isSelf = id === me.id;
  const toValues = (u: User) => ({ full_name: u.full_name, role: u.role });
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    mode: "onTouched",
    values: e ? toValues(e) : undefined,
    defaultValues: { full_name: "", role: "VIEWER" },
    resetOptions: { keepDirtyValues: true },
  });
  const { register, handleSubmit, formState, setError } = form;
  const { errors } = formState;
  useReportDirty(formState.isDirty, setDirty);

  const submit = handleSubmit(async (v) => {
    if (!e) return;
    setBanner(null);
    try {
      const patch: Parameters<typeof usersApi.update>[1] = { version: e.version };
      if (v.full_name !== e.full_name) patch.full_name = v.full_name;
      if (v.role !== e.role) patch.role = v.role;
      const saved = await update.mutateAsync({ uid: e.id, patch });
      setDirty(false);
      // Your own name shows in the top bar.
      if (isSelf) void reload();
      toast.show({ tone: "positive", title: "Changes saved", detail: patch.role ? `${saved.full_name} is now ${ROLE_LABEL[saved.role]}. It applies from their next request.` : undefined });
      nav.closeEditor();
    } catch (err) {
      setBanner(applyServerErrors(err, setError, EDIT_FIELDS));
    }
  });

  return (
    <EditorDrawer
      noun="user"
      title={`Edit ${e?.full_name ?? "user"}`}
      subtitle={e?.email}
      formId={formId}
      isNew={false}
      dirty={dirty}
      saving={update.isPending}
      loading={entity.isPending}
      loadError={entity.isError ? entity.error.message : null}
      submitLabel="Save changes"
      onClose={nav.closeEditor}
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5">
        <FormBanner banner={banner} onReloadLatest={() => void entity.refetch().then((r) => { if (r.data) form.reset(toValues(r.data), { keepDirtyValues: false }); setBanner(null); })} />
        <Field label="Full name" required error={errors.full_name?.message}>
          {(p) => <Input {...p} {...register("full_name")} autoComplete="off" />}
        </Field>
        <RoleField error={errors.role?.message} registration={register("role")} disabledReason={isSelf ? "You can't change your own role. Ask another admin." : undefined} />
        <p className="text-xs text-fg-faint">To stop someone signing in, deactivate the account from its detail panel. Users are never deleted, so the audit trail keeps every name.</p>
      </form>
    </EditorDrawer>
  );
}

/* ---------- page ---------- */

export function UsersPage() {
  const { user: me } = useSession();

  const columns = useCallback(
    (open: (id: string) => void) => [
      col.accessor("full_name", {
        header: "Name",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <button type="button" onClick={() => open(row.original.id)} className="rounded-sm text-left font-medium hover:underline">
              {row.original.full_name}
            </button>
            {row.original.id === me.id && <Badge tone="accent">You</Badge>}
          </span>
        ),
      }),
      col.accessor("email", { header: "Email", cell: (c) => <span className="text-fg-muted">{c.getValue()}</span>, meta: { hideBelow: "md" } }),
      col.accessor("role", { header: "Role", cell: (c) => ROLE_LABEL[c.getValue()], meta: { hint: "Viewer < Risk analyst < Admin. Sorted by access level" } }),
      col.display({ id: "status", header: "Status", cell: ({ row }) => <UserStatusBadge user={row.original} /> }),
      col.accessor("last_login_at", {
        header: "Last sign-in",
        cell: (c) => {
          const v = c.getValue();
          return v ? <span className="num text-fg-muted">{formatDateTime(v)}</span> : <span className="text-fg-faint">Never</span>;
        },
        meta: { hideBelow: "lg" },
      }),
    ],
    [me.id],
  );

  return (
    <ResourceListPage<UserItem>
      title="Users"
      description="Who can sign in, and what each person can do. Admins manage users, the audit log and settings."
      noun={["user", "users"]}
      searchPlaceholder="Search name or email"
      defaultSort="full_name"
      filters={[
        { kind: "multi", key: "role", label: "Role", options: ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })) },
        {
          kind: "segmented",
          key: "status",
          label: "Status",
          defaultValue: "active",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "all", label: "All" },
          ],
        },
      ]}
      columns={columns}
      rowId={(r) => r.id}
      useList={(p) => useQuery({ queryKey: ["users", "list", p], queryFn: () => usersApi.list(p as UserFilters), placeholderData: keepPreviousData })}
      canCreate
      canEdit
      createLabel="New user"
      renderDetail={(id, nav) => <UserDetail id={id} nav={nav} />}
      renderEditor={(id, nav) => (id ? <EditUserEditor id={id} nav={nav} /> : <CreateUserEditor nav={nav} />)}
      empty={{ icon: <Users />, title: "No users here", description: "Deactivated accounts show under Inactive." }}
    />
  );
}
