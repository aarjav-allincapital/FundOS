"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, UserPlus, RefreshCw } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { MiniSelect } from "@/components/ui/MiniSelect";
import type { AppRole } from "@/lib/rbac/roles";

interface AppUserRow {
  email: string;
  role: AppRole;
  status: "invited" | "active" | "disabled";
  invited_by: string | null;
  invited_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminPage() {
  const { isAdmin, can, email: me } = useAuth();
  const canInvite = can("invite_users");
  const canRoles = can("manage_roles");

  const [users, setUsers] = useState<AppUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("org_user");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const json = (await res.json()) as {
        ok?: boolean;
        users?: AppUserRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load users");
      setUsers(json.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        emailSent?: boolean;
        warning?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error || "Invite failed");
      setInviteEmail("");
      setStatus(
        json.emailSent
          ? "Invite sent via email."
          : `User added${json.warning ? ` — email not sent: ${json.warning}` : "."}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(target: string, role: AppRole) {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: target, role }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Role update failed");
      setStatus(`Updated ${target} → ${role}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <ShieldAlertIcon />
        <p className="text-sm font-medium text-ink">Admin access required</p>
        <p className="text-2xs text-ink-muted">
          Ingest, Reporting, and Admin are limited to admin accounts.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin"
        description="Invite new teammates, and change roles for anyone already registered. Ingest and Reporting stay admin-only."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FeatureCard
          title="Ingest"
          body="SHA / document upload & AI extraction — admin only."
          href="/ingest"
        />
        <FeatureCard
          title="Reporting"
          body="LP updates, PDF/Excel, and email send — admin only."
          href="/reporting"
        />
        <FeatureCard
          title="Audit Logs"
          body="State write history and backups — admin only."
          href="/logs"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Panel>
            <PanelHeader
              title="Invite user"
              subtitle={
                canInvite
                  ? "Add a teammate to the roster"
                  : "Only Kushal or Aarjav can invite"
              }
            />
            <PanelBody>
              <form onSubmit={handleInvite} className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-faint">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    disabled={!canInvite || busy}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@allincapital.vc"
                    className="h-8 w-full rounded border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-line-strong disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-faint">
                    Role
                  </label>
                  <MiniSelect
                    aria-label="Invite role"
                    value={inviteRole}
                    onChange={(v) => setInviteRole(v as AppRole)}
                    className="h-8 w-full px-2"
                    options={[
                      { value: "org_user", label: "Org user" },
                      { value: "admin", label: "Admin" },
                    ]}
                  />
                  <p className="mt-1.5 text-2xs text-ink-faint">
                    Org users can edit most records but not investment lots or
                    valuation marks, and cannot use Ingest / Reporting.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={!canInvite || busy || !inviteEmail.trim()}
                  className="inline-flex items-center justify-center gap-1.5 rounded bg-ink px-3 py-1.5 text-2xs font-semibold text-surface hover:bg-ink/90 disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {busy ? "Sending…" : "Send invite"}
                </button>
              </form>
            </PanelBody>
          </Panel>
        </div>

        <div className="lg:col-span-3">
          <Panel>
            <PanelHeader
              title="Registered users"
              subtitle={
                canRoles ? "Change any user's role with the dropdown" : undefined
              }
              action={
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-2xs text-ink-muted hover:text-ink"
                >
                  <RefreshCw className="h-3 w-3" />
                  Sync & refresh
                </button>
              }
            />
            {users === null ? (
              <p className="px-4 py-6 text-2xs text-ink-faint">Loading…</p>
            ) : (
              <Table>
                <THead>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Invited by</TH>
                </THead>
                <TBody>
                  {users.map((u) => (
                    <TR key={u.email}>
                      <TD strong>
                        {u.email}
                        {u.email === me && (
                          <span className="ml-1.5 text-2xs font-normal text-ink-faint">
                            (you)
                          </span>
                        )}
                      </TD>
                      <TD>
                        {canRoles ? (
                          <MiniSelect
                            aria-label={`Role for ${u.email}`}
                            value={u.role}
                            onChange={(v) =>
                              void handleRoleChange(u.email, v as AppRole)
                            }
                            className="h-7 px-1.5"
                            options={[
                              { value: "admin", label: "Admin" },
                              { value: "org_user", label: "Org user" },
                            ]}
                          />
                        ) : (
                          <Badge tone={u.role === "admin" ? "info" : "neutral"}>
                            {u.role === "admin" ? "Admin" : "Org user"}
                          </Badge>
                        )}
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            u.status === "active"
                              ? "gain"
                              : u.status === "invited"
                                ? "warn"
                                : "neutral"
                          }
                        >
                          {u.status}
                        </Badge>
                      </TD>
                      <TD muted>{u.invited_by ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Panel>
        </div>
      </div>

      {(status || error) && (
        <p className={`mt-3 text-2xs ${error ? "text-loss" : "text-ink-muted"}`}>
          {error ?? status}
        </p>
      )}
    </>
  );
}

function FeatureCard({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="rounded border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong"
    >
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Shield className="h-3.5 w-3.5 text-brand-red" />
        {title}
      </div>
      <p className="mt-1 text-2xs text-ink-muted">{body}</p>
    </a>
  );
}

function ShieldAlertIcon() {
  return <Shield className="h-8 w-8 text-ink-faint" />;
}
