import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type StubFieldKey =
  | "gross"
  | "net"
  | "taxableWages"
  | "fed"
  | "ss"
  | "medicare"
  | "waPfl"
  | "waPml"
  | "waLtc"
  | "waLi"
  | "union"
  | "life"
  | "adnd"
  | "dentalPretax"
  | "visionPretax"
  | "roth";

export type StubParseReport = {
  extractedTextChars: number;
  likelyScannedPdf: boolean;

  foundCount: number;
  totalCount: number;

  missing: StubFieldKey[];
  requiredMissing: StubFieldKey[];
};

export type StubParseResult = {
  label: string;
  fields: Record<StubFieldKey, number | null>;
  report: StubParseReport;
};

const FIELD_DEFS: Array<{ key: StubFieldKey; labels: string[]; required?: boolean }> = [
  { key: "gross", labels: ["Gross Pay"], required: true },
  { key: "net", labels: ["Net Pay"] },
  {
    key: "taxableWages",
    labels: ["Your federal taxable wages this period are", "federal taxable wages this period are"],
    required: true,
  },

  { key: "fed", labels: ["Federal Income Tax"] },
  { key: "ss", labels: ["Social Security Tax", "Social Security"] },
  { key: "medicare", labels: ["Medicare Tax", "Medicare"] },

  { key: "waPfl", labels: ["WA Paid Family Leave Ins", "WA Paid Family Leave"] },
  { key: "waPml", labels: ["WA Paid Medical Leave Ins", "WA Paid Medical Leave"] },
  { key: "waLtc", labels: ["WA LTCare"] },
  { key: "waLi", labels: ["Wa L&I Ee", "WA L&I Ee", "L&I Ee"] },

  { key: "union", labels: ["Union Dues"] },
  { key: "life", labels: ["UEELIFE", "Life"] },
  { key: "adnd", labels: ["UEEAD&D", "AD&D"] },

  { key: "dentalPretax", labels: ["Dental Pretax", "Dental"] },
  { key: "visionPretax", labels: ["Vision"] },
  { key: "roth", labels: ["Roth"] },
];

const MONEY_DECIMAL_RE = /-?\$?\s*\d[\d,]*\.\d{2}\b/g;
// Matches ADP-style spaced money like "2 303 08" or "0 50" (NOT "20 5400").
const MONEY_SPACED_RE = /-?\$?\s*\d{1,3}(?:\s\d{3})*\s\d{2}\b/g;

function parseMoneyToken(raw: string): number | null {
  const neg = raw.includes("-");
  // keep only digits
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 3) return null;
  const whole = digits.slice(0, -2);
  const cents = digits.slice(-2);
  const num = Number(`${whole}.${cents}`);
  if (!isFinite(num)) return null;
  return neg ? -num : num;
}

function normalizeText(s: string) {
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function findNearestMoney(text: string, label: string, window = 140): number | null {
  const lower = text.toLowerCase();
  const lab = label.toLowerCase();

  let idx = lower.indexOf(lab);
  if (idx < 0) return null;

  let best: { val: number; dist: number } | null = null;

  while (idx >= 0) {
    const start = Math.max(0, idx - window);
    const end = Math.min(text.length, idx + lab.length + window);
    const chunk = text.slice(start, end);

    const matches: Array<{ i: number; raw: string }> = [];

    for (const m of chunk.matchAll(MONEY_DECIMAL_RE)) {
      matches.push({ i: m.index ?? 0, raw: m[0] });
    }
    for (const m of chunk.matchAll(MONEY_SPACED_RE)) {
      matches.push({ i: m.index ?? 0, raw: m[0] });
    }

    for (const m of matches) {
      const val = parseMoneyToken(m.raw);
      if (val === null) continue;

      const absoluteIndex = start + m.i;
      const dist = Math.abs(absoluteIndex - idx);

      if (!best || dist < best.dist) {
        best = { val, dist };
      }
    }

    idx = lower.indexOf(lab, idx + lab.length);
  }

  if (!best) return null;
  return best.val;
}

export function parseStubText(textRaw: string, label: string): StubParseResult {
  const text = normalizeText(textRaw);

  const fields = Object.fromEntries(FIELD_DEFS.map((d) => [d.key, null])) as Record<StubFieldKey, number | null>;

  for (const def of FIELD_DEFS) {
    let found: number | null = null;
    for (const l of def.labels) {
      const v = findNearestMoney(text, l);
      if (v !== null) {
        found = v;
        break;
      }
    }
    fields[def.key] = found !== null ? Math.abs(found) : null;
  }

  const missing: StubFieldKey[] = [];
  const requiredMissing: StubFieldKey[] = [];
  let foundCount = 0;

  for (const def of FIELD_DEFS) {
    const ok = fields[def.key] !== null;
    if (ok) foundCount += 1;
    else {
      missing.push(def.key);
      if (def.required) requiredMissing.push(def.key);
    }
  }

  const report: StubParseReport = {
    extractedTextChars: text.length,
    likelyScannedPdf: text.length < 200,

    foundCount,
    totalCount: FIELD_DEFS.length,
    missing,
    requiredMissing,
  };

  return { label, fields, report };
}

export async function parsePdfStub(file: File): Promise<StubParseResult> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      if (item?.str) parts.push(String(item.str));
    }
    parts.push("\n");
  }

  const text = parts.join("\n");
  return parseStubText(text, `Calibrated from PDF (${file.name})`);
}

export async function parseImageStubOcr(file: File): Promise<StubParseResult> {
  // Lazy-load OCR so it doesn't slow down normal use.
  const mod = await import("tesseract.js");
  const Tesseract = mod.default;

  const { data } = await Tesseract.recognize(file, "eng", { logger: () => {} });
  const text = (data?.text || "").trim();
  return parseStubText(text, `Calibrated from OCR (${file.name})`);
}
