import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  type AppRole,
  type AppUserStatus,
  isBootstrapAdmin,
  normalizeEmail,
  resolveRole,
} from "@/lib/rbac/roles";

export interface AppUserRow {
  email: string;
  role: AppRole;
  status: AppUserStatus;
  invited_by: string | null;
  invited_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AuthzResult =
  | { ok: true; email: string; role: AppRole }
  | { ok: false; status: number; error: string };

/** Ensure bootstrap admins / first-time sign-in have an app_users row. */
export async function ensureAppUser(
  emailRaw: string,
  opts?: { invitedBy?: string | null; status?: AppUserStatus },
): Promise<AppUserRow | null> {
  const email = normalizeEmail(emailRaw);
  if (!email) return null;
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const { data: existing } = await sb
    .from("app_users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return existing as AppUserRow;
  }

  const role: AppRole = isBootstrapAdmin(email) ? "admin" : "org_user";
  const status: AppUserStatus = opts?.status ?? "active";
  const now = new Date().toISOString();
  const row = {
    email,
    role,
    status,
    invited_by: opts?.invitedBy ?? null,
    invited_at: opts?.invitedBy ? now : null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await sb.from("app_users").insert(row).select("*").maybeSingle();
  if (error) {
    console.error("[rbac] ensureAppUser insert failed", error.message);
    return row as AppUserRow;
  }
  return (data as AppUserRow) ?? (row as AppUserRow);
}

/** Push role into Supabase Auth app_metadata so middleware can read it from the JWT. */
export async function syncAuthRoleMetadata(emailRaw: string, role: AppRole): Promise<void> {
  const email = normalizeEmail(emailRaw);
  if (!email) return;
  const sb = getSupabaseAdminClient();
  if (!sb) return;

  const { data: listed, error } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    console.error("[rbac] listUsers failed", error.message);
    return;
  }
  const user = listed.users.find((u) => normalizeEmail(u.email) === email);
  if (!user) return;

  const { error: updErr } = await sb.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), role },
  });
  if (updErr) console.error("[rbac] updateUserById failed", updErr.message);
}

export async function getAppUser(emailRaw: string): Promise<AppUserRow | null> {
  const email = normalizeEmail(emailRaw);
  if (!email) return null;
  const sb = getSupabaseAdminClient();
  if (!sb) return null;
  const { data } = await sb.from("app_users").select("*").eq("email", email).maybeSingle();
  return (data as AppUserRow) ?? null;
}

export async function listAppUsers(): Promise<AppUserRow[]> {
  const sb = getSupabaseAdminClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("app_users")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[rbac] listAppUsers", error.message);
    return [];
  }
  return (data as AppUserRow[]) ?? [];
}

/**
 * Pull every @allincapital.vc account already in Supabase Auth into app_users.
 * Existing people become org_user (bootstrap emails stay admin). Idempotent —
 * never overwrites an existing role.
 */
export async function syncAuthUsersIntoAppUsers(): Promise<{
  added: number;
  totalAuth: number;
}> {
  const sb = getSupabaseAdminClient();
  if (!sb) return { added: 0, totalAuth: 0 };

  const emails: string[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("[rbac] syncAuthUsers listUsers", error.message);
      break;
    }
    for (const u of data.users) {
      const e = normalizeEmail(u.email);
      if (e && e.endsWith("@allincapital.vc")) emails.push(e);
    }
    if (data.users.length < 200) break;
    page += 1;
    if (page > 20) break;
  }

  let added = 0;
  const now = new Date().toISOString();
  for (const email of emails) {
    const existing = await getAppUser(email);
    if (existing) continue;
    const role: AppRole = isBootstrapAdmin(email) ? "admin" : "org_user";
    const { error } = await sb.from("app_users").insert({
      email,
      role,
      status: "active",
      invited_by: null,
      invited_at: null,
      created_at: now,
      updated_at: now,
    });
    if (!error) {
      added += 1;
      await syncAuthRoleMetadata(email, role);
    }
  }
  return { added, totalAuth: emails.length };
}

async function authUserExists(email: string): Promise<boolean> {
  const sb = getSupabaseAdminClient();
  if (!sb) return false;
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return false;
    if (data.users.some((u) => normalizeEmail(u.email) === email)) return true;
    if (data.users.length < 200) return false;
    page += 1;
    if (page > 20) return false;
  }
}

export async function setAppUserRole(
  emailRaw: string,
  role: AppRole,
): Promise<{ ok: true; user: AppUserRow } | { ok: false; error: string }> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false, error: "Invalid email." };
  const sb = getSupabaseAdminClient();
  if (!sb) return { ok: false, error: "Database not configured." };

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("app_users")
    .upsert(
      {
        email,
        role,
        status: "active",
        updated_at: now,
      },
      { onConflict: "email" },
    )
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  await syncAuthRoleMetadata(email, role);
  return { ok: true, user: data as AppUserRow };
}

export async function inviteAppUser(
  emailRaw: string,
  invitedBy: string,
  role: AppRole = "org_user",
): Promise<{ ok: true; user: AppUserRow } | { ok: false; error: string }> {
  const email = normalizeEmail(emailRaw);
  const by = normalizeEmail(invitedBy);
  if (!email) return { ok: false, error: "Invalid email." };
  if (!by) return { ok: false, error: "Invalid inviter." };

  // Admins cannot be demoted via invite — bootstrap stays admin.
  const effectiveRole: AppRole = isBootstrapAdmin(email) ? "admin" : role;
  const sb = getSupabaseAdminClient();
  if (!sb) return { ok: false, error: "Database not configured." };

  const existing = await getAppUser(email);
  if (existing && existing.status !== "invited") {
    return { ok: false, error: "User is already registered." };
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("app_users")
    .upsert(
      {
        email,
        role: effectiveRole,
        status: "invited",
        invited_by: by,
        invited_at: now,
        updated_at: now,
        ...(existing ? {} : { created_at: now }),
      },
      { onConflict: "email" },
    )
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  await syncAuthRoleMetadata(email, effectiveRole);
  return { ok: true, user: data as AppUserRow };
}

/** Signed-in org member with resolved role (DB preferred). */
export async function assertSignedIn(): Promise<AuthzResult> {
  if (!isSupabaseConfigured()) {
    // Local mode — treat as Kushal admin so features are testable.
    return { ok: true, email: ROLE_MANAGER_LOCAL, role: "admin" };
  }
  const sb = await getSupabaseServerClient();
  if (!sb) return { ok: false, status: 503, error: "Supabase not configured" };
  const {
    data: { user },
  } = await sb.auth.getUser();
  const email = normalizeEmail(user?.email);
  if (!email) return { ok: false, status: 401, error: "Sign in required" };

  const dbUser = await ensureAppUser(email);
  const role = resolveRole({
    email,
    appMetadataRole: user?.app_metadata?.role,
    userMetadataRole: user?.user_metadata?.role,
    dbRole: dbUser?.role ?? null,
  });

  if (dbUser?.status === "disabled") {
    return { ok: false, status: 403, error: "Account disabled" };
  }

  return { ok: true, email, role };
}

const ROLE_MANAGER_LOCAL = "kushal@allincapital.vc";

export async function assertAdmin(): Promise<AuthzResult> {
  const auth = await assertSignedIn();
  if (!auth.ok) return auth;
  if (auth.role !== "admin") {
    return { ok: false, status: 403, error: "Admin access required" };
  }
  return auth;
}

/**
 * Who may request an OTP / complete sign-in.
 * - Bootstrap admins always
 * - Rows in app_users with status invited|active
 * - Anyone who already has a Supabase Auth account (pre-RBAC legacy)
 * - If app_users table is missing, fall back to domain-only access
 */
export async function canSignInEmail(
  emailRaw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false, error: "Invalid email." };
  if (isBootstrapAdmin(email)) return { ok: true };

  const sb = getSupabaseAdminClient();
  if (!sb) return { ok: true };

  const { data, error } = await sb
    .from("app_users")
    .select("status")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) {
      return { ok: true };
    }
    console.error("[rbac] canSignInEmail", error.message);
    return { ok: true };
  }

  if (data) {
    if (data.status === "disabled") {
      return { ok: false, error: "This account has been disabled." };
    }
    return { ok: true };
  }

  // Not on roster yet — allow if they already signed in before RBAC existed.
  if (await authUserExists(email)) return { ok: true };

  return {
    ok: false,
    error: "You're not on the FundOS roster yet. Ask Kushal or Aarjav to invite you.",
  };
}
