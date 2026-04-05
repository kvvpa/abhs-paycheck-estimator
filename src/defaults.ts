import { AppSettings, NetProfile, PayCodeDef } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  baseRate: 20.54,
  diffs: { swing: 1.5, grave: 2.5, weekend: 2.5 },
};

export const DEFAULT_CODES: PayCodeDef[] = [
  { code: "REGULAR", rule: { type: "base" }, notes: "Straight time" },
  { code: "SICK", rule: { type: "base" }, notes: "Straight time" },
  { code: "HOLIDAY", rule: { type: "base" }, notes: "Holiday paid (not worked)" },
  { code: "CALL IN", rule: { type: "base" }, notes: "Base rate (unless employer proves otherwise)" },

  { code: "SWING REG", rule: { type: "base_plus_diff", diff: "swing" } },
  { code: "GRAVE REG", rule: { type: "base_plus_diff", diff: "grave" } },
  { code: "WKND REG", rule: { type: "base_plus_diff", diff: "weekend" } },

  { code: "OVERTIME", rule: { type: "multiplier_base", multiplier: 1.5 } },
  { code: "HOLWRK", rule: { type: "multiplier_base", multiplier: 1.5 } },

  // Payroll behavior commonly seen in ADP for ABHS stubs:
  // WKND OT uses 1.5 * (base + weekend diff).
  { code: "WKND OT", rule: { type: "multiplier_base_plus_diff", multiplier: 1.5, diff: "weekend" } },
  { code: "GRAVE OT", rule: { type: "multiplier_base_plus_diff", multiplier: 1.5, diff: "grave" } },
  { code: "HOLWRK GRAVE", rule: { type: "multiplier_base_plus_diff", multiplier: 1.5, diff: "grave" } },
];

// Net profile is ON by default. If not calibrated, rates start as 0 and UI shows "Uncalibrated".
export const DEFAULT_NET_PROFILE: NetProfile = {
  enabled: true,
  calibrationLabel: "Uncalibrated",

  pretaxDental: 0,
  pretaxVision: 0,
  fixedUnion: 0,
  fixedLife: 0,
  fixedAdnd: 0,

  fedRateOnTaxable: 0,
  ssRateOnTaxable: 0,
  medicareRateOnTaxable: 0,
  waPflRateOnGross: 0,
  waPmlRateOnGross: 0,
  waLtcRateOnGross: 0,
  waLiRateOnGross: 0,
  rothRateOnGross: 0,

  extraFedFlat: 0,
};
