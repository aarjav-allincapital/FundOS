"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import { ALLOWED_EMAIL_DOMAIN, isAllowedOrgEmail } from "@/lib/supabase/config";
import { cn } from "@/lib/cn";

type Step = "email" | "code";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const RESEND_SECONDS = 30;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestOtp(targetEmail: string) {
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      error?: string;
      cooldown?: number;
    };
    if (!res.ok || !json.ok) {
      if (json.cooldown) setCooldown(json.cooldown);
      throw new Error(json.error ?? "Could not send code.");
    }
    return targetEmail;
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = email.trim().toLowerCase();

    if (!isAllowedOrgEmail(clean)) {
      setError(`Access is limited to @${ALLOWED_EMAIL_DOMAIN} accounts.`);
      return;
    }

    setBusy(true);
    try {
      await requestOtp(clean);
      setEmail(clean);
      setNotice(`We sent a 6-digit code to ${clean}.`);
      setCooldown(RESEND_SECONDS);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const token = code.trim();
    if (token.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: token }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Verification failed.");
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setError(null);
    setBusy(true);
    try {
      await requestOtp(email);
      setNotice(`New code sent to ${email}.`);
      setCode("");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/all-in-logo.png"
            alt="All In Capital"
            width={96}
            height={40}
            className="h-10 w-auto object-contain"
            priority
          />
          <h1 className="mt-5 text-lg font-semibold text-ink">
            Sign in to FundOS
          </h1>
          <p className="mt-1 text-[13px] text-ink-faint">
            Internal operating system — All In Capital team access only.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-pop">
          {step === "email" ? (
            <form onSubmit={sendCode} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-2xs font-medium text-ink-muted">
                  Work email
                </span>
                <div className="flex h-10 items-center gap-2 rounded border border-line bg-surface-subtle px-3 focus-within:border-line-strong">
                  <Mail className="h-3.5 w-3.5 text-ink-faint" />
                  <input
                    type="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
                    className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
                  />
                </div>
              </label>

              {error && <p className="text-2xs text-loss">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded bg-ink text-[13px] font-medium text-surface transition-opacity",
                  busy ? "opacity-60" : "hover:opacity-90",
                )}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Send code
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="flex flex-col gap-4">
              {notice && (
                <p className="flex items-start gap-1.5 text-2xs text-ink-muted">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gain" />
                  {notice}
                </p>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-2xs font-medium text-ink-muted">
                  Verification code
                </span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="••••••"
                  className="h-11 rounded border border-line bg-surface-subtle text-center text-lg tracking-[0.5em] text-ink outline-none focus:border-line-strong"
                />
              </label>

              {error && <p className="text-2xs text-loss">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded bg-ink text-[13px] font-medium text-surface transition-opacity",
                  busy ? "opacity-60" : "hover:opacity-90",
                )}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Verify & continue"
                )}
              </button>

              <div className="flex items-center justify-between text-2xs text-ink-faint">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                    setNotice(null);
                  }}
                  className="hover:text-ink"
                >
                  Use a different email
                </button>
                <button
                  type="button"
                  onClick={resend}
                  disabled={busy || cooldown > 0}
                  className="hover:text-ink disabled:opacity-50"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-2xs text-ink-faint">
          One organisation account. Everyone on the team shares the same live
          dashboard.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
