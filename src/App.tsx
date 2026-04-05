import React, { useMemo, useRef, useState } from "react";
import { DEFAULT_CODES, DEFAULT_NET_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { applyAdjustments, calibrateFromStub, computeNet, grossFromEntries, makeId, round2 } from "./calc";
import { downloadJson, loadState, readJsonFile, saveState } from "./storage";
import { Adjustment, ExportBundle, PayCodeDef } from "./types";
import { parseImageStubOcr, parsePdfStub, StubFieldKey, StubParseResult } from "./stubImport";

function money(n: number | null) {
  if (n === null) return "--";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function parseNum(v : string) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export default function App() {
  const [tab, setTab] = useState<"estimate" | "codes" | "net">("estimate");
  const [bundle, setBundle] = useState<ExportBundle>(() => loadState());

  // auto-save
  React.useEffect(() => {
    saveState(bundle);
  }, [bundle]);

  const settings = bundle.settings || DEFAULT_SETTINGS;
  const payCodes = bundle.pay_codes || DEFAULT_CODES;
  const entries = bundle.entries || [];
  const adjustments = bundle.adjustments || { earnings: [], deductions: [] };
  const netProfile = bundle.net_profile || DEFAULT_NET_PROFILE;

  const grossCalc = useMemo(() => grossFromEntries(entries, payCodes, settings), [entries, payCodes, settings]);
  const gross = useMemo(() => applyAdjustments(grossCalc.gross, adjustments), [grossCalc.gross, adjustments]);
  const netCalc = useMemo(() => computeNet(gross, adjustments, netProfile), [gross, adjustments, netProfile]);

  const addEntry = () => {
    const first = payCodes[0]?.code || "REGULAR";
    setBundle((prev) => ({
      ...prev,
      entries: [...(prev.entries || []), { id: makeId("row"), code: first, hours: 0 }],
    }));
  };

  const updateEntry = (id: string, patch: Partial<{ code: string; hours: number }>) => {
    setBundle((prev) => ({
      ...prev,
      entries: (prev.entries || []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const removeEntry = (id: string) => {
    setBundle((prev) => ({
      ...prev,
      entries: (prev.entries || []).filter((r) => r.id !== id),
    }));
  };

  const addAdjustment = (kind: "earnings" | "deductions") => {
    const baseAdj: Adjustment = {
      id: makeId(kind === "earnings" ? "earn" : "ded"),
      label: kind === "earnings" ? "Bonus" : "Deduction",
      amount: 0,
      taxable: true,
      pretax: false,
    };
    setBundle((prev) => ({
      ...prev,
      adjustments: {
        earnings: kind === "earnings" ? [...(prev.adjustments?.earnings || []), baseAdj] : (prev.adjustments?.earnings || []),
        deductions: kind === "deductions" ? [...(prev.adjustments?.deductions || []), baseAdj] : (prev.adjustments?.deductions || []),
      },
    }));
  };

  const updateAdjustment = (kind: "earnings" | "deductions", id: string, patch: Partial<Adjustment>) => {
    setBundle((prev) => ({
      ...prev,
      adjustments: {
        earnings: kind === "earnings" ? (prev.adjustments?.earnings || []).map((a) => (a.id === id ? { ...a, ...patch } : a)) : (prev.adjustments?.earnings || []),
        deductions: kind === "deductions" ? (prev.adjustments?.deductions || []).map((a) => (a.id === id ? { ...a, ...patch } : a)) : (prev.adjustments?.deductions || []),
      },
    }));
  };

  const removeAdjustment = (kind: "earnings" | "deductions", id: string) => {
    setBundle((prev) => ({
      ...prev,
      adjustments: {
        earnings: kind === "earnings" ? (prev.adjustments?.earnings || []).filter((a) => a.id !== id) : (prev.adjustments?.earnings || []),
        deductions: kind === "deductions" ? (prev.adjustments?.deductions || []).filter((a) => a.id !== id) : (prev.adjustments?.deductions || []),
      },
    }));
  };

  const exportFull = () => {
    downloadJson("abhs-paycheck-estimator_full.json", bundle);
  };

  const exportShareable = () => {
    const stripped: ExportBundle = {
      schema_version: bundle.schema_version || "1.0",
      settings: bundle.settings,
      pay_codes: bundle.pay_codes,
      entries: bundle.entries,
      adjustments: bundle.adjustments,
    };
    downloadJson("abhs-paycheck-estimator_shareable.json", stripped);
  };

  const fileRef = useRef<HTMLInputElement | null>(null);
  const importJson = async (file: File) => {
    const obj = (await readJsonFile(file)) as ExportBundle;
    // Merge strategy: replace everything, but ensure defaults exist.
    setBundle({
      schema_version: obj.schema_version || "1.0",
      settings: obj.settings || DEFAULT_SETTINGS,
      pay_codes: obj.pay_codes || DEFAULT_CODES,
      entries: obj.entries || [],
      adjustments: obj.adjustments || { earnings: [], deductions: [] },
      net_profile: obj.net_profile || DEFAULT_NET_PROFILE,
    });
  };

  return (
    <div className="container">
      <div class=name="header">
        <div>
          <h1 className="h1">ABHS Paycheck Estimator</h1>
          <p className="sub">
            Local-only. Pay-code input. Custom codes + one-offs + net calibration.
            <br>
            <span className="small">Unofficial tool. Not endorsed by American Behavioral Health Systems, Inc.</span>
          </p>
        </div>
        <div className="row">
          <span className="{"badge " + (netCalc.calibrated ? "good" : "warn")}">
            {netCalc.calibrated ? "Calibrated" : "Uncalibrated"}
          </span>
          <button class=name="button secondary" onClick={exportShareable}>Shareable Export</button>
          <button className="button" onClick={exportFull}>Full Export</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.currentTarget.value = "";
          }}
          />
          <button className="button secondary" onClick={() => fileRef.current?.click()}>Import</button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button class=name={"button " + (tab === "estimate" ? "" : "secondary")} onClick={() => setTab("estimate")}>Estimate</button>
        <button className="{"button " + (tab === "codes" ? "" : "secondary")} onClick={() => setTab("codes")}>Pay Codes</button>
        <button className="{"button " + (tab === "net" ? "" : "secondary")} onClick={() => setTab("net")}>Net Profile</button>
      </div>

      {tab === "estimate" && (
        <div class=name="grid">
          <div className="card">
            <div class=name="row" style={{ justifyContent: "space-between" }}>
              <div >
                <div className="label">Base rate</div>
                <input
                  className="input"
                  value={String(settings.baseRate)}
                  onChange={(e) =>
                    setBundle((p) => ({ ...p, settings: { ...settings, baseRate: parseNum(e.target.value) } }))
                  }
                />
                </div>
              <div style={{ width: 220 }}>
                <div class=name="label">Diffs (swing / grave / weekend)</div>
                <div class=name="row">
                  <input
                    class=name="input"
                    value={String(settings.diffs.swing)}
                    onChange={(e) =>
                    setBundle((p) => ({ ...p, settings: { ...settings, diffs: { ...settings.diffs, swing: parseNum(e.target.value) } } }))
                  }
                  />
                  <input
                    className="input"
                    value={String(settings.diffs.grave)}
                    onChange={(e) =>
                      setBundle((p) => ({ ...p, settings: { ...settings, diffs: { ...settings.diffs, grave: parseNum(e.target.value) } } }))
                    }
                    }
                  />
                  <input
                    className="input"
                    value={String(settings.diffs.weekend)}
                    onChange={(e) =>
                    setBundle((p) => ({ ...p, settings: { ...settings, diffs: { ...settings.diffs, weekend: parseNum(e.target.value) } } }))
                  }
                    }
                  />
                </div>
                </div>
            </div>

            <hr />

            <div class=name="row" style={{ justifyContent: "space-between" }}>
              <div >
                <div className="label">Hours by pay code</div>
                <div className="small">Enter what your ADP timesheet shows. Add custom codes in the Pay Codes tab.</div>
              </div>
              <button className="button" onClick={addEntry}>Add row</button>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "45%" }}>Pay code</th>
                  <th style={{ width: "15%" }}>Hours</th>
                  <th style={{ width: "20%" }}>Rate</th>
                  <th style={{ width: "20%" }}>Line total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grossCalc.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <select className="input" value={l.code} onChange={(e) => updateEntry(l.id, { code: e.target.value })}>
                        {payCodes.map((c) => (
                          <option key={c.code} value={c.code}>{c.code}</option>
                        ))}
                      </select>
                  </td>
                  <td>
                    <input className="input" value={String(l.hours)} onChange={(e) => updateEntry(l.id, { hours: parseNum(e.target.value) })} />
                  </td>
                  <td>{money(l.rate)}</td>
                    <td>{money(l.total)}</td>
                    <td>
                      <button class=name="button secondary" onClick={() => removeEntry(l.id)}>X</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <xr />

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="label">One-off earnings / deductions</div>
                <div className="small">Bonuses, retention, lunch, misc. These adjust gross and (if calibrated) taxable wages.</div>
              </div>
              <div class=name="row">
                <button class=name="button secondary" onClick={() => addAdjustment("deductions")}>Add deduction</button>
                <button className="button" onClick={() => addAdjustment("earnings")}>Add earning</button>
              </div>
            </div>

            <div class=name="row" style={{ gap: 16, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div className="label">Earnings</div>
                <{(adjustments.earnings || []).map((a) => (
                  <div className="row" key={a.id} style={{ marginTop: 8 }}>
                  <input className="input" value={a.label} onChange={(e) => updateAdjustment("earnings", a.id, { label: e.target.value })} />
                    <input className="input" style={{ width: 140 }} value={String(a.amount)} onChange={(e) => updateAdjustment("earnings", a.id, { amount: parseNum(e.target.value) })} />
                    <label className="pill">
                      <input type="checkbox" checked={a.taxable} onChange={(e) => updateAdjustment("earnings", a.id, { taxable: e.target.checked })} /> taxable
                    </label>
                    <button class=name="button secondary" onClick={() => removeAdjustment("earnings", a.id)}>X</button>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1 }}>
                <div class=name="label">Deductions</div>
                <{(adjustments.deductions || []).map((a) => (
                  <div className="row" key={a.id} style={{ marginTop: 8 }}>
                  <input className="input" value={a.label} onChange={(e) => updateAdjustment("deductions", a.id, { label: e.target.value })} />
                  <input className="input" style={{ width: 140 }} value={String(a.amount)} onChange={(e) => updateAdjustment("deductions", a.id, { amount: parseNum(e.target.value) })} />
                    <label className="pill">
                      <input type="checkbox" checked={a.pretax} onChange={(e) => updateAdjustment("deductions", a.id, { pretax: e.target.checked })} /> pretax
                    </label>
                  <button className="button secondary" onClick={() => removeAdjustment("deductions", a.id)}>X</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="label">Results</div>
            <div className="kpi">
              <div className="box">
                <div className="label">Gross</div>
                <div className="num">{money(gross)}</div>
                <div className="hint">Hours gross + one-offs</div>
              </div>
              <div className="box">
                <div class=name="label">Net</div>
                <div className="num">{money(netCalc.net)}</div>
                <div class=name="hint">{netCalc.calibrated ? "Tight estimate" : "Calibrate from a stub for accuracy"}</div>
              </div>
            </div>

            <hr />

            <div className="label">Gross breakdown</div>
            <div className="small">Hours-only gross: {money(grossCalc.gross)} | Adjusted gross: {money(gross)}</div>

            <hr />

            <div className="label">Net breakdown</div>
             {!netCalc.details ? (
              <div class=name="small">Uncalibrated. Go to Net Profile and paste one stub (or upload it).</div>
            ) : (
              <div class=name="small">
                Taxable wages: {money(netCalc.details.taxable)}
                <br />Pretax total: {money(netCalc.details.pretaxTotal)}
                <br0/>Federal: {money(netCalc.details.fed)}
                <br0/>SS: {money(netCalc.details.ss)}
                <br0/>Medicare: {money(netCalc.details.med)}
                <br/>WA PFML/PML/LTC/L&I: {money(round2(netCalc.details.waPfl + netCalc.details.waPml + netCalc.details.waLtc + netCalc.details.waLi))}
                <br0/>Roth: {money(netCalc.details.roth)}
                <br/>Fixed (union/life/ad&d + dental/vision): {money(netCalc.details.fixed)}
                <br/>Total deductions: {money(netCalc.details.totalDeductions)}
               </div>
            ))}

            <hr />

            <div className="small" style={{ marginTop: 10 }}>
              Disclaimer: Unofficial tool. Not endorsed by American Behavioral Health Systems, Inc. Your pay stub is the source of truth.
            </div>
          </div>
        </div>
        )}

      {tab === "codes" && <PayCodesPanel payCodes={payCodes} setBundle={setBundle} />}

      {tab === "net" && <NetPanel netProfile={netProfile} setBundle={setBundle} />}
    </div>
  );
}

function PayCodesPanel(props: { payCodes: PayCodeDef[]; setBundle: React.Dispatch<React.SetStateAction<ExportBundle>> }) {
  const { payCodes, setBundle } = props;

  const addCode = () => {
    setBundle((p) => ({
      ...p,
      pay_codes: [...(p.pay_codes || []), { code: "NEW CODE", rule: { type: "base" }, notes: "" }],
    }));
  };

  const updateCode = (idx: number, patch: Partial<PayCodeDef>) => {
    setBundle((p) => ({
      ...p,
      pay_codes: (p.pay_codes || []).map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };

  const removeCode = (idx: number) => {
    setBundle((p) => ({
      ...p,
      pay_codes: (p.pay_codes || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <div class=name="card">
      <div class=name="row" style={{ justifyContent: "space-between" }}>
        <div >
          <div className="label">Pay codes</div>
            <div className="small">Custom-code builder is enabled by default. Define how a code prices hours.</div>
        </div>
        <button class=name="button" onClick={addCode}>Add code</button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Rule</th>
            <th>Diff</th>
            <th>Mult</th>
            <th>Flat</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(payCodes || []).map((c, idx) => (
            <tr key={idx}>
              <td><input class=name="input" value={c.code} onChange={(e) => updateCode(idx, { code: e.target.value })} /></td>
              <td>
                <select className="input" value={c.rule.type} onChange={(e) => updateCode(idx, { rule: { ...c.rule, type: e.target.value as any } })}>
                  <option value="base">base</option>
                  <option value="base_plus_diff">base + diff</option>
                 <option value="multiplier_base">multiplier * base</option>
                <option value="multiplier_base_plus_diff">multiplier * (base + diff)</option>
                  <option value="flat_hourly">flat hourly</option>
              </select>
              </td>
              <td>
                <select className="input" value={c.rule.diff || ""} onChange={(e) => updateCode(idx, { rule: { ...c.rule, diff: e.target.value ? (e.target.value as any) : undefined } })}>
                  <option value="">--</option>
                  <option value="swing">swing</option>
                  <option value="grave">grave</option>
                 <option value="weekend">weekend</option>
                </select>
              </td>
              <td><input className="input" value={String(c.rule.multiplier ?? "")} onChange={(e) => updateCode(idx, { rule: { ...c.rule, multiplier: parseNum(e.target.value) } })} /></td>
              <td><input className="input" value={String(c.rule.flatRate ?? "")} onChange={(e) => updateCode(idx, { rule: { ...c.rule, flatRate: parseNum(e.target.value) } })} /></td>
              <td><input className="input" value={c.notes || ""} onChange={(e) => updateCode(idx, { notes: e.target.value })} /></td>
              <td><button className="button secondary" onClick={() => removeCode(idx)}>X</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="small" style={{ marginTop: 10 }}>
        Tip: For OT codes, use multiplier 1.5. For weekend OT, use multiplier * (base + weekend diff).
      </div>
    </div>
  );
}

const CHECK_FIELDS: Array<{ key: StubFieldKey; label: string; required?: boolean }> = [
  { key: "gross", label: "Gross", required: true },
  { key: "taxableWages", label: "Federal taxable wages", required: true },
  { key: "fed", label: "Federal income tax" },
  { key: "ss", label: "Social Security" },
  { key: "medicare", label: "Medicare" },
  { key: "waPfl", label: "WA Paid Family Leave" },
  { key: "waPml", label: "WA Paid Medical Leave" },
  { key: "waLtc", label: "WA LTCare" },
  { key: "waLi", label: "WA L&I Ee" },
  { key: "union", label: "Union dues" },
  { key: "life", label: "Life" },
  { key: "adnd", label: "AD&D" },
  { key: "dentalPretax", label: "Dental pretax" },
  { key: "visionPretax", label: "Vision" },
  { key: "roth", label: "Roth" },
  { key: "net", label: "Net pay (optional)" },
];

function NetPanel(props: { netProfile: any; setBundle: React.Dispatch<React.SetStateAction<ExportBundle>> }) {
  const { netProfile, setBundle } = props;

  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [lastParse, setLastParse] = useState<StubParseResult | null>(null);

  const [form, setForm] = useState({
    label: "Calibrated",
    gross: 0,
    taxableWages: 0,
    fed: 0,
    ss: 0,
    medicare: 0,
    waPfl: 0,
    waPml: 0,
    waLtc: 0,
    waLi: 0,
    roth: 0,
    union: 0,
    life: 0,
    adnd: 0,
    dentalPretax: 0,
    visionPretax: 0,
    extraFedFlat: 0,
  });

  const applyCalibration = () => {
    const prof = calibrateFromStub(form);
    setBundle((p) => ({ ...p, net_profile: prof }));
  };

  const update = (ky: string, v: string) => {
    setForm((p) => ({ ...p, [ky]: typeof p[kas keyof typeof p] === "number" ? parseNum(v) : v } as any));
  };

  const applyParsedFieldsToForm = (parsed: StubParseResult) => {
    setForm((p) => ({
      ...p,
      label: parsed.label,
      gross: parsed.fields.gross ?? p.gross,
      taxableWages: parsed.fields.taxableWages ?? p.taxableWages,
      fed: parsed.fields.fed ?? p.fed,
      ss: parsed.fields.ss ?? p.ss,
      medicare: parsed.fields.medicare ?? p.medicare,
      waPfl: parsed.fields.waPfl ?? p.waPfl,
      waPml: parsed.fields.waPml ?? p.waPml,
      waLtc: parsed.fields.waLtc ?? p.waLtc,
      waLi: parsedfields.waLi ?? p.waLi,
      roth: parsed.fields.roth ?? p.roth,
      union: parsedfields.union ?? p.union,
      life: parsed.fields.life ?? p.life,
      adnd: parsed.fields.adnd ?? p.adnd,
      dentalPretax: parsedfields.dentalPretax ?? p.dentalPretax,
      visionPretax: parsed.fields.visionPretax ?? p.visionPretax,
    }));
  };

  const renderParseSummary = () => {
    if (!lastParse) return null;
    const { report, fields } = lastParse;
    const scary = report.likelyScannedPdf || report.requiredMissing.length > 0;
    return (
      <div style={{ marginTop: 10 }}>
        <div className="small">
          Found {report.foundCount}/{report.totalCount} fields.
          scary ? (
            <>
              <br />
              <b>Couldn't read text (might be a scanned PDF). Try screenshot upload (OCR) or manual entry.</b>
            </>
          ) : (
            <>
              <br />
              PDF/OCR parsed. Review fields and click <b>Apply calibration</b>.
            </>
            )}
        </div>

        <div class=name="small" style={{ marginTop: 8 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {CHECK_FIELDS.map((f) => {
              const ok = fields[f.key] !== null;
              const mark = ok ? "✓" : "☗";
              const req = f.required ? " (required)" : "";
              return (
                <li key={f.key}>
                  {mark} {f.label}{req}
              </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div class=name="card">
      <div class=name="row" style={{ justifyContent: "space-between" }}>
        <div >
          <div className="label">Net Profile</div>
          <div className="small">
            Net is ON by default. Calibrate once from your ASECB1