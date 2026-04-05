import { DEFAULT_CODES, DEFAULT_NET_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { ExportBundle } from "./types";

const KEY = "abhs_paycheck_estimator_v1";

export function loadState(): ExportBundle {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {
        schema_version: "1.0",
        settings: DEFAULT_SETTINGS,
        pay_codes: DEFAULT_CODES,
        entries: [],
        adjustments: { earnings: [], deductions: [] },
        net_profile: DEFAULT_NET_PROFILE,
      };
    }
    const parsed = JSON.parse(raw) as ExportBundle;
    return {
      schema_version: parsed.schema_version || "1.0",
      settings: parsed.settings || DEFAULT_SETTINGS,
      pay_codes: parsed.pay_codes || DEFAULT_CODES,
      entries: parsed.entries || [],
      adjustments: parsed.adjustments || { earnings: [], deductions: [] },
      net_profile: parsed.net_profile || DEFAULT_NET_PROFILE,
    };
  } catch {
    return {
      schema_version: "1.0",
      settings: DEFAULT_SETTINGS,
      pay_codes: DEFAULT_CODES,
      entries: [],
      adjustments: { earnings: [], deductions: [] },
      net_profile: DEFAULT_NET_PROFILE,
    };
  }
}

export function saveState(bundle: ExportBundle) {
  localStorage.setItem(KEY, JSON.stringify(bundle));
}

export function downloadJson(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file: File): Promise<any> {
  const text = await file.text();
  return JSON.parse(text);
}
