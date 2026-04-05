export type DiffKey = "swing" | "grave" | "weekend";

export type RuleType =
  | "base"
  | "base_plus_diff"
  | "multiplier_base"
  | "multiplier_base_plus_diff"
  | "flat_hourly";

export type PayCodeRule = {
  type: RuleType;
  diff?: DiffKey;
  multiplier?: number;
  flatRate?: number;
};

export type PayCodeDef = {
  code: string;
  rule: PayCodeRule;
  notes?: string;
};

export type EntryRow = {
  id: string;
  code: string;
  hours: number;
};

export type Adjustment = {
  id: string;
  label: string;
  amount: number; // positive number
  taxable: boolean; // for earnings
  pretax: boolean; // for deductions
};

export type AdjustmentState = {
  earnings: Adjustment[];
  deductions: Adjustment[];
};

export type NetProfile = {
  enabled: boolean;
  calibrationLabel: string;

  // amounts
  pretaxDental: number;
  pretaxVision: number;
  fixedUnion: number;
  fixedLife: number;
  fixedAdnd: number;

  // rates
  fedRateOnTaxable: number;
  ssRateOnTaxable: number;
  medicareRateOnTaxable: number;
  waPflRateOnGross: number;
  waPmlRateOnGross: number;
  waLtcRateOnGross: number;
  waLiRateOnGross: number;
  rothRateOnGross: number;

  // optional extra federal flat
  extraFedFlat: number;
};

export type AppSettings = {
  baseRate: number;
  diffs: Record<DiffKey, number>;
};

export type ExportBundle = {
  schema_version: string;
  settings: AppSettings;
  pay_codes: PayCodeDef[];
  entries: EntryRow[];
  adjustments: AdjustmentState;
  net_profile?: NetProfile;
};
