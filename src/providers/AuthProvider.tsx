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

export interface UserProfile {
  fullName: string;
  title: string;
}

interface AuthContextValue {
  user: User | null;
  email: string | null;
  profile: UserProfile;
  authEnabled: boolean;
  isLoading: boolean;
  updateProfile: (patch: Partial<UserProfile>) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readProfile(user: User | null): UserProfile {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return {
    fullName: typeof meta.full_name === "string" ? meta.full_name : "",
    title: typeof meta.title === "string" ? meta.title : "",
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const authEnabled = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(authEnabled);

  useEffect(() => {
    if (!authEnabled) {
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
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      email: user?.email ?? null,
      profile: readProfile(user),
      authEnabled,
      isLoading,
      updateProfile,
      signOut,
    }),
    [user, authEnabled, isLoading, updateProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
