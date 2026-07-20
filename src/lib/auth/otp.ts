import { createHash, randomInt } from "crypto";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds

function pepper(): string {
  return (
    process.env.AUTH_OTP_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "fundos-otp-dev"
  );
}

export function generateOtpCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function hashOtp(email: string, code: string): string {
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${pepper()}`)
    .digest("hex");
}

export function otpExpiresAt(): string {
  return new Date(Date.now() + OTP_TTL_MS).toISOString();
}

export function canResendOtp(lastCreatedAt: string | null): boolean {
  if (!lastCreatedAt) return true;
  return Date.now() - new Date(lastCreatedAt).getTime() >= RESEND_COOLDOWN_MS;
}

export function resendCooldownRemaining(lastCreatedAt: string): number {
  const elapsed = Date.now() - new Date(lastCreatedAt).getTime();
  const remaining = RESEND_COOLDOWN_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export function isOtpExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

export function verifyOtpHash(
  email: string,
  code: string,
  storedHash: string,
): boolean {
  const candidate = hashOtp(email, code);
  return candidate === storedHash;
}
