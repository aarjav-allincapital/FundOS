/**
 * Backward-compatible re-exports. Prefer `@/lib/rbac/roles` for new code.
 */
export {
  ADMIN_EMAILS,
  BOOTSTRAP_ADMIN_EMAILS,
  isAdminEmail,
  isBootstrapAdmin,
  canManageRoles,
  canInviteUsers,
  resolveRole,
  hasPermission,
  type AppRole,
  type Permission,
} from "@/lib/rbac/roles";
