import { AdjustmentState, AppSettings, EntryRow, NetProfile, PayCodeDef } from "./types";

export function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function clampNonNeg(n: number) {
  return isFinite(n) ? Math.max(0, n) : 0;
}

export function resolveHourlyRate(code: PayCodeDef, settings: AppSettings): number {
  const base = settings.baseRate;
  const diffs = settings.diffs;
  const r = code.rule;

  switch (r.type) {
    case "base":
      return base;
    case "base_plus_diff":
      return base + (r.diff ? diffs[r.diff] : 0);
    case "multiplier_base":
      return (r.multiplier ?? 1) * base;
    case "multiplier_base_plus_diff":
      return (r.multiplier ?? 1) * (base + (r.diff ? diffs[r.diff] : 0));
    case "flat_hourly":
      return r.flatRate ?? 0;
    default:
      return base;
  }
}

export function grossFromEntries(entries: EntryRow[], codes: PayCodeDef[], settings: AppSettings) {
  const map = new Map(codes.map((c) => [c.code, c]));
  const lines = entries.map((e) => {
    const def = map.get(e.code);
    const rate = def ? resolveHourlyRate(def, settings) : 0;
    const total = round2(rate * clampNonNeg(e.hours));
    return { ...e, rate: round2(rate), total };
  });
  const gross = round2(lines.reduce((sum, l) => sum + l.total, 0));
  return { gross, lines };
}

export function applyAdjustments(grossFromHours: number, adjustments: AdjustmentState) {
  const earn = adjustments.earnings.reduce((s, a) => s + clampNonNeg(a.amount), 0);
  const ded = adjustments.deductions.reduce((s, a) => s + clampNonNeg(a.amount), 0);
  return round2(grossFromHours + earn - ded);
}

export function computeNet(gross: number, adjustments: AdjustmentState, profile: NetProfile) {
  // If profile is uncalibrated, return null net with explanation.
  const calibrated =
    profile.pretaxDental + profile.pretaxVision > 0 ||
    profile.fedRateOnTaxable > 0 ||
    profile.ssRateOnTaxable > 0 ||
    profile.rothRateOnGross > 0 ||
    profile.fixedUnion + profile.fixedLife + profile.fixedAdnd > 0;

  if (!profile.enabled) {
    return { net: null as number | null, calibrated: false, details: null as any };
  }

  const taxableEarnings = adjustments.earnings.filter((a) => a.taxable).reduce((s, a) => s + clampNonNeg(a.amount), 0);
  const pretaxOneOff = adjustments.deductions.filter((a) => a.pretax).reduce((s, a) => s + clampNonNeg(a.amount), 0);

  const pretaxTotal = round2(profile.pretaxDental + profile.pretaxVision + pretaxOneOff);
  const taxable = round2(gross + taxableEarnings - pretaxTotal);

  const fed = round2(profile.fedRateOnTaxable * taxable + clampNonNeg(profile.extraFedFlat));
  const ss = round2(profile.ssRateOnTaxable * taxable);
  const med = round2(profile.medicareRateOnTaxable * taxable);

  const waPfl = round2(profile.waPflRateOnGross * gross);
  const waPml = round2(profile.waPmlRateOnGross * gross);
  const waLtc = round2(profile.waLtcRateOnGross * gross);
  const waLi = round2(profile.waLiRateOnGross * gross);

  const roth = round2(profile.rothRateOnGross * gross);

  const fixed = round2(
    profile.fixedUnion + profile.fixedLife + profile.fixedAdnd + profile.pretaxDental + profile.pretaxVision
  );

  const totalDeductions = round2(fed + ss + med + waPfl + waPml + waLtc + waLi + roth + fixed + pretaxOneOff);
  const net = round2(gross - totalDeductions);

  return {
    net,
    calibrated,
    details: {
      taxable,
      pretaxTotal,
      fed,
      ss,
      med,
      waPfl,
      waPml,
      waLtc,
      waLi,
      roth,
      fixed,
      pretaxOneOff: round2(pretaxOneOff),
      totalDeductions,
    },
  };
}

export function calibrateFromStub(input: {
  label: string;
  gross: number;
  taxableWages: number;
  fed: number;
  ss: number;
  medicare: number;
  waPfl: number;
  waPml: number;
  waLtc: number;
  waLi: number;
  roth: number;
  union: number;
  life: number;
  adnd: number;
  dentalPretax: number;
  visionPretax: number;
  extraFedFlat?: number;
}): NetProfile {
  const gross = clampNonNeg(input.gross);
  const taxable = clampNonNeg(input.taxableWages);

  const fedRate = taxable > 0 ? clampNonNeg(input.fed) / taxable : 0;
  const ssRate = taxable > 0 ? clampNonNeg(input.ss) / taxable : 0;
  const medRate = taxable > 0 ? clampNonNeg(input.medicare) / taxable : 0;

  const waPflRate = gross > 0 ? clampNonNeg(input.waPfl) / gross : 0;
  const waPmlRate = gross > 0 ? clampNonNeg(input.waPml) / gross : 0;
  const waLtcRate = gross > 0 ? clampNonNeg(input.waLtc) / gross : 0;
  const waLiRate = gross > 0 ? clampNonNeg(input.waLi) / gross : 0;

  const rothRate = gross > 0 ? clampNonNeg(input.roth) / gross : 0;

  return {
    enabled: true,
    calibrationLabel: input.label,

    pretaxDental: clampNonNeg(input.dentalPretax),
    pretaxVision: clampNonNeg(input.visionPretax),
    fixedUnion: clampNonNeg(input.union),
    fixedLife: clampNonNeg(input.life),
    fixedAdnd: clampNonNeg(input.adnd),

    fedRateOnTaxable: fedRate,
    ssRateOnTaxable: ssRate,
    medicareRateOnTaxable: medRate,
    waPflRateOnGross: waPflRate,
    waPmlRateOnGross: waPmlRate,
    waLtcRateOnGross: waLtcRate,
    waLiRateOnGross: waLiRate,
    rothRateOnGross: rothRate,

    extraFedFlat: clampNonNeg(input.extraFedFlat ?? 0),
  };
}
