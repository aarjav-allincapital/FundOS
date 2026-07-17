/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { HardDrive } from "lucide-react";
import { cn } from "@/lib/cn";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const GAPI_SRC = "https://apis.google.com/js/api.js";

// Google Docs/Sheets/Slides aren't downloadable as-is — export them to a format
// the ingest pipeline already understands.
const EXPORT_MAP: Record<string, { mimeType: string; ext: string }> = {
  "application/vnd.google-apps.document": { mimeType: "application/pdf", ext: ".pdf" },
  "application/vnd.google-apps.spreadsheet": {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
  },
  "application/vnd.google-apps.presentation": { mimeType: "application/pdf", ext: ".pdf" },
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadPicker(): Promise<void> {
  return new Promise((resolve, reject) => {
    (window as any).gapi.load("picker", { callback: resolve, onerror: reject });
  });
}

export function GoogleDrivePicker({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(CLIENT_ID && API_KEY);

  async function downloadPicked(accessToken: string, docs: any[]) {
    const files: File[] = [];
    for (const doc of docs) {
      const id = doc.id as string;
      const name = (doc.name as string) ?? "drive-file";
      const mimeType = (doc.mimeType as string) ?? "";
      const exportAs = EXPORT_MAP[mimeType];
      const url = exportAs
        ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exportAs.mimeType)}`
        : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`Drive download failed for ${name} (${res.status})`);
      const blob = await res.blob();
      const outName = exportAs && !name.endsWith(exportAs.ext) ? name + exportAs.ext : name;
      files.push(new File([blob], outName, { type: exportAs?.mimeType ?? mimeType }));
    }
    return files;
  }

  async function connect() {
    if (!configured) return;
    setError(null);
    setWorking(true);
    try {
      await Promise.all([loadScript(GIS_SRC), loadScript(GAPI_SRC)]);
      await loadPicker();

      const google = (window as any).google;
      const accessToken: string = await new Promise((resolve, reject) => {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (resp: any) => {
            if (resp.error) reject(new Error(resp.error));
            else resolve(resp.access_token);
          },
        });
        tokenClient.requestAccessToken({ prompt: "" });
      });

      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      await new Promise<void>((resolve) => {
        const picker = new google.picker.PickerBuilder()
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
          .setOAuthToken(accessToken)
          .setDeveloperKey(API_KEY)
          .addView(view)
          .setCallback(async (result: any) => {
            if (result.action === google.picker.Action.PICKED) {
              try {
                const files = await downloadPicked(accessToken, result.docs ?? []);
                if (files.length > 0) onFiles(files);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Drive download failed.");
              } finally {
                resolve();
              }
            } else if (result.action === google.picker.Action.CANCEL) {
              resolve();
            }
          })
          .build();
        picker.setVisible(true);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Google Drive.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={connect}
        disabled={!configured || busy || working}
        title={
          configured
            ? "Pick files from Google Drive"
            : "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_API_KEY in .env.local"
        }
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded border border-line bg-surface px-3 py-1.5 text-2xs font-semibold text-ink transition-colors",
          configured && !busy && !working
            ? "hover:border-line-strong hover:bg-surface-subtle"
            : "cursor-not-allowed opacity-60"
        )}
      >
        <HardDrive className="h-3.5 w-3.5" />
        {working ? "Opening Drive…" : "Connect Google Drive"}
      </button>
      {!configured && (
        <span className="text-[10px] text-ink-faint">
          Add NEXT_PUBLIC_GOOGLE_CLIENT_ID + NEXT_PUBLIC_GOOGLE_API_KEY to enable (see .env.example).
        </span>
      )}
      {error && <span className="text-[10px] text-loss">{error}</span>}
    </div>
  );
}
