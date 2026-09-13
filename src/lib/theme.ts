export type ColorMode = "light" | "dark";

export const THEME_STORAGE_KEY = "fundos_theme_v1";

/** Theme toggle is local-dev only — never on production hosts. */
export function isLocalThemeAvailable(hostname?: string): boolean {
  const host =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  return host === "localhost" || host === "127.0.0.1";
}

export function readStoredColorMode(): ColorMode {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyColorMode(mode: ColorMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!isLocalThemeAvailable()) {
    root.removeAttribute("data-theme");
    return;
  }
  if (mode === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}
