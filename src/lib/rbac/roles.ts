/**
 * App RBAC — admin vs org_user, with a short bootstrap allowlist so the
 * platform stays usable before / without the app_users table.
 *
 * Privileges:
 * - admin: ingest, reporting, logs, edit lots & valuation marks, admin portal
 * - org_user: everything else; may edit records except lots & valuation marks
 *
 * Special (hard-coded):
 * - Only Kushal may change roles
 * - Kushal + Aarjav may invite users
 */

export type AppRole = "admin" | "org_user";
export type AppUserStatus = "invited" | "active" | "disabled";

export const BOOTSTRAP_ADMIN_EMAILS = [
  "kushal@allincapital.vc",
  "kb@allincapital.vc",
  "aarjav@allincapital.vc",
  "rs@allincapital.vc",
] as const;

/** Only this account may change another user's role. */
export const ROLE_MANAGER_EMAIL = "kushal@allincapital.vc";

/** Accounts allowed to send invites. */
export const INVITER_EMAILS = [
  "kushal@allincapital.vc",
  "aarjav@allincapital.vc",
] as const;

/** @deprecated Prefer isAdminRole / resolveRole — kept for existing imports. */
export const ADMIN_EMAILS = [...BOOTSTRAP_ADMIN_EMAILS];

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

export function isBootstrapAdmin(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return Boolean(e && (BOOTSTRAP_ADMIN_EMAILS as readonly string[]).includes(e));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return isBootstrapAdmin(email);
}

export function canManageRoles(email: string | null | undefined): boolean {
  return normalizeEmail(email) === ROLE_MANAGER_EMAIL;
}

export function canInviteUsers(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return Boolean(e && (INVITER_EMAILS as readonly string[]).includes(e));
}

export function isAdminRole(role: AppRole | null | undefined): boolean {
  return role === "admin";
}

/**
 * Resolve effective role from JWT app_metadata + bootstrap list.
 * Bootstrap admins always stay admin even if metadata is missing.
 */
export function resolveRole(opts: {
  email: string | null | undefined;
  appMetadataRole?: unknown;
  userMetadataRole?: unknown;
  dbRole?: AppRole | null;
}): AppRole {
  const email = normalizeEmail(opts.email);
  if (email && isBootstrapAdmin(email)) return "admin";
  if (opts.dbRole === "admin" || opts.dbRole === "org_user") return opts.dbRole;
  const meta =
    typeof opts.appMetadataRole === "string"
      ? opts.appMetadataRole
      : typeof opts.userMetadataRole === "string"
        ? opts.userMetadataRole
        : null;
  if (meta === "admin" || meta === "org_user") return meta;
  return "org_user";
}

export type Permission =
  | "ingest"
  | "reporting"
  | "logs"
  | "admin_portal"
  | "edit_lots"
  | "edit_valuation_marks"
  | "invite_users"
  | "manage_roles";

export function hasPermission(
  role: AppRole,
  permission: Permission,
  actorEmail?: string | null,
): boolean {
  switch (permission) {
    case "ingest":
    case "reporting":
    case "logs":
    case "admin_portal":
    case "edit_lots":
    case "edit_valuation_marks":
      return role === "admin";
    case "invite_users":
      return role === "admin" && canInviteUsers(actorEmail);
    case "manage_roles":
      return role === "admin" && canManageRoles(actorEmail);
    default:
      return false;
  }
}
