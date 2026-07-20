"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, LogOut, User as UserIcon } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/cn";

export default function SettingsPage() {
  const { email, profile, authEnabled, isLoading, updateProfile, signOut } =
    useAuth();

  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(profile.fullName);
    setTitle(profile.title);
  }, [profile.fullName, profile.title]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await updateProfile({ fullName: fullName.trim(), title: title.trim() });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const initials =
    (fullName || email || "?")
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-ink">Profile & settings</h1>
        <p className="mt-1 text-[13px] text-ink-faint">
          Your personal details. The portfolio data itself is shared live across
          the whole All In Capital team.
        </p>
      </div>

      {!authEnabled ? (
        <Panel>
          <PanelBody>
            <p className="text-[13px] text-ink-muted">
              Authentication is not configured for this environment (running in
              local mode).
            </p>
          </PanelBody>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Account" icon={<UserIcon className="h-4 w-4" />} />
            <PanelBody>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-sm font-semibold text-surface">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">
                    {fullName || "Unnamed member"}
                  </div>
                  <div className="truncate text-2xs text-ink-faint">
                    {isLoading ? "Loading…" : email ?? "—"}
                  </div>
                </div>
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Details" />
            <PanelBody>
              <form onSubmit={save} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-2xs font-medium text-ink-muted">
                    Full name
                  </span>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Aarjav Shah"
                    className="h-10 rounded border border-line bg-surface-subtle px-3 text-[13px] text-ink outline-none focus:border-line-strong"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-2xs font-medium text-ink-muted">
                    Title / role
                  </span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Partner"
                    className="h-10 rounded border border-line bg-surface-subtle px-3 text-[13px] text-ink outline-none focus:border-line-strong"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-2xs font-medium text-ink-muted">
                    Email
                  </span>
                  <input
                    value={email ?? ""}
                    readOnly
                    className="h-10 cursor-not-allowed rounded border border-line bg-surface-sunken px-3 text-[13px] text-ink-faint outline-none"
                  />
                </label>

                {error && <p className="text-2xs text-loss">{error}</p>}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={busy}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded bg-ink px-4 text-[13px] font-medium text-surface transition-opacity",
                      busy ? "opacity-60" : "hover:opacity-90",
                    )}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : saved ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Saved
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </button>
                </div>
              </form>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Session" />
            <PanelBody>
              <div className="flex items-center justify-between gap-3">
                <p className="text-2xs text-ink-faint">
                  Sign out of FundOS on this device.
                </p>
                <button
                  onClick={() => void signOut()}
                  className="flex h-9 items-center gap-2 rounded border border-line px-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-subtle"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </PanelBody>
          </Panel>
        </div>
      )}
    </div>
  );
}
