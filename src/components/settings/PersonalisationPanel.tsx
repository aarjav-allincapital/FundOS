"use client";

import { Moon, Sun } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";
import { useTheme } from "@/providers/ThemeProvider";
import type { ColorMode } from "@/lib/theme";

const OPTIONS: { id: ColorMode; label: string; description: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", description: "Default FundOS workspace", icon: Sun },
  { id: "dark", label: "Dark", description: "Charcoal UI for local development", icon: Moon },
];

export function PersonalisationPanel() {
  const { colorMode, setColorMode, themeAvailable } = useTheme();
  if (!themeAvailable) return null;

  return (
    <Panel>
      <PanelHeader title="Personalisation" />
      <PanelBody>
        <p className="mb-4 text-[13px] text-ink-muted">
          Appearance is saved in this browser. Available on the local dev server only.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = colorMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setColorMode(opt.id)}
                className={cn(
                  "flex items-start gap-3 rounded border p-3 text-left transition-colors",
                  selected
                    ? "border-line-strong bg-surface-subtle"
                    : "border-line bg-surface hover:bg-surface-subtle",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded",
                    selected ? "bg-ink text-surface" : "bg-surface-sunken text-ink-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-ink">{opt.label}</div>
                  <div className="mt-0.5 text-2xs text-ink-faint">{opt.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </PanelBody>
    </Panel>
  );
}
