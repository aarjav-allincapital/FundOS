"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  type AppRole,
  type Permission,
  hasPermission,
  resolveRole,
} from "@/lib/rbac/roles";

export interface UserProfile {
  fullName: string;
  title: string;
}

interface AuthContextValue {
  user: User | null;
  email: string | null;
  role: AppRole;
  isAdmin: boolean;
  profile: UserProfile;
  authEnabled: boolean;
  isLoading: boolean;
  can: (permission: Permission) => boolean;
  updateProfile: (patch: Partial<UserProfile>) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readProfile(user: User | null): UserProfile {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return {
    fullName: typeof meta.full_name === "string" ? meta.full_name : "",
    title: typeof meta.title === "string" ? meta.title : "",
  };
}

function roleFromUser(user: User | null, dbRole: AppRole | null): AppRole {
  return resolveRole({
    email: user?.email,
    appMetadataRole: user?.app_metadata?.role,
    userMetadataRole: user?.user_metadata?.role,
    dbRole,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const authEnabled = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [dbRole, setDbRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(authEnabled);

  const refreshRole = useCallback(async () => {
    if (!authEnabled) {
      setDbRole("admin");
      return;
    }
    try {
      const res = await fetch("/api/me");
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; role?: AppRole }
        | null;
      if (json?.ok && (json.role === "admin" || json.role === "org_user")) {
        setDbRole(json.role);
      }
    } catch {
      /* keep prior */
    }
  }, [authEnabled]);

  useEffect(() => {
    if (!authEnabled) {
      setDbRole("admin");
      setIsLoading(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [authEnabled]);

  useEffect(() => {
    if (!authEnabled || !user) return;
    void refreshRole();
  }, [authEnabled, user, refreshRole]);

  const updateProfile = useCallback(
    async (patch: Partial<UserProfile>) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { error: "Authentication is not configured." };
      const current = readProfile(user);
      const next = { ...current, ...patch };
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: next.fullName, title: next.title },
      });
      if (error) return { error: error.message };
      setUser(data.user ?? null);
      return {};
    },
    [user],
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setDbRole(null);
    router.replace("/login");
    router.refresh();
  }, [router]);

  const role = roleFromUser(user, dbRole);
  const email = user?.email ?? (authEnabled ? null : "kushal@allincapital.vc");

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      email,
      role,
      isAdmin: role === "admin",
      profile: readProfile(user),
      authEnabled,
      isLoading,
      can: (permission) => hasPermission(role, permission, email),
      updateProfile,
      signOut,
      refreshRole,
    }),
    [user, email, role, authEnabled, isLoading, updateProfile, signOut, refreshRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
