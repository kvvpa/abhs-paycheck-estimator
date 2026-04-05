import React, { useMemo, useRef, useState } from "react";
import { DEFAULT_CODES, DEFAULT_NET_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { applyAdjustments, calibrateFromStub, computeNet, grossFromEntries, makeId, round2 } from "./calc";
import { downloadJson, loadState, readJsonFile, saveState } from "./storage";
import { Adjustment, ExportBundle, PayCodeDef } from "./types";

function money(n: number | null) {
  if (n === null) return "--";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function parseNum(v: string) {
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
      <div className="header">
        <div>
          <h1 className="h1">ABHS Paycheck Estimator</h1>
          <p className="sub">Local-only. Pay-code input. Custom codes + one-offs + net calibration.</p>
        </div>
        <div className="row">
          <span className={"badge " + (netCalc.calibrated ? "good" : "warn")}>
            {netCalc.calibrated ? "Calibrated" : "Uncalibrated"}
          </span>
          <button className="button secondary" onClick={exportShareable}>Shareable Export</button>
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
        <button className={"button " + (tab === "estimate" ? "" : "secondary")} onClick={() => setTab("estimate")}>Estimate</button>
        <button className={"button " + (tab === "codes" ? "" : "secondary")} onClick={() => setTab("codes")}>Pay Codes</button>
        <button className={"button " + (tab === "net" ? "" : "secondary")} onClick={() => setTab("net")}>Net Profile</button>
      </div>

      {tab === "estimate" && (
        <div className="grid">
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
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
                <div className="label">Diffs (swing / grave / weekend)</div>
                <div className="row">
                  <input
                    className="input"
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
                  />
                  <input
                    className="input"
                    value={String(settings.diffs.weekend)}
                    onChange={(e) =>
                      setBundle((p) => ({ ...p, settings: { ...settings, diffs: { ...settings.diffs, weekend: parseNum(e.target.value) } } }))
                    }
                  />
                </div>
              </div>
            </div>

            <hr />

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
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
                      <button className="button secondary" onClick={() => removeEntry(l.id)}>X</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr />

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="label">One-off earnings / deductions</div>
                <div className="small">Bonuses, retention, lunch, misc. These adjust gross and (if calibrated) taxable wages.</div>
              </div>
              <div className="row">
                <button className="button secondary" onClick={() => addAdjustment("deductions")}>Add deduction</button>
                <button className="button" onClick={() => addAdjustment("earnings")}>Add earning</button>
              </div>
            </div>

            <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div className="label">Earnings</div>
                {(adjustments.earnings || []).map((a) => (
                  <div className="row" key={a.id} style={{ marginTop: 8 }}>
                    <input className="input" value={a.label} onChange={(e) => updateAdjustment("earnings", a.id, { label: e.target.value })} />
                    <input className="input" style={{ width: 140 }} value={String(a.amount)} onChange={(e) => updateAdjustment("earnings", a.id, { amount: parseNum(e.target.value) })} />
                    <label className="pill">
                      <input type="checkbox" checked={a.taxable} onChange={(e) => updateAdjustment("earnings", a.id, { taxable: e.target.checked })} /> taxable
                    </label>
                    <button className="button secondary" onClick={() => removeAdjustment("earnings", a.id)}>X</button>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1 }}>
                <div className="label">Deductions</div>
                {(adjustments.deductions || []).map((a) => (
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
                <div className="label">Net</div>
                <div className="num">{money(netCalc.net)}</div>
                <div className="hint">{netCalc.calibrated ? "Tight estimate" : "Calibrate from a stub for accuracy"}</div>
              </div>
            </div>

            <hr />

            <div className="label">Gross breakdown</div>
            <div className="small">Hours-only gross: {money(grossCalc.gross)} | Adjusted gross: {money(gross)}</div>

            <hr />

            <div className="label">Net breakdown</div>
            {!netCalc.details ? (
              <div className="small">Uncalibrated. Go to Net Profile and paste one stub.</div>
            ) : (
              <div className="small">
                Taxable wages: {money(netCalc.details.taxable)}
                <br />Pretax total: {money(netCalc.details.pretaxTotal)}
                <br />Federal: {money(netCalc.details.fed)}
                <br />SS: {money(netCalc.details.ss)}
                <br />Medicare: {money(netCalc.details.med)}
                <br />WA PFML/PML/LTC/L&I: {money(round2(netCalc.details.waPfl + netCalc.details.waPml + netCalc.details.waLtc + netCalc.details.waLi))}
                <br />Roth: {money(netCalc.details.roth)}
                <br />Fixed (union/life/ad&d + dental/vision): {money(netCalc.details.fixed)}
                <br />Total deductions: {money(netCalc.details.totalDeductions)}
              </div>
            )}

            <hr />

            <div className="small">
              Disclaimer: estimate only. Your pay stub is the source of truth.
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
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="label">Pay codes</div>
          <div className="small">Custom-code builder is enabled by default. Define how a code prices hours.</div>
        </div>
        <button className="button" onClick={addCode}>Add code</button>
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
              <td><input className="input" value={c.code} onChange={(e) => updateCode(idx, { code: e.target.value })} /></td>
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

function NetPanel(props: { netProfile: any; setBundle: React.Dispatch<React.SetStateAction<ExportBundle>> }) {
  const { netProfile, setBundle } = props;

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

  const update = (k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: typeof p[k as keyof typeof p] === "number" ? parseNum(v) : v } as any));
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="label">Net Profile</div>
          <div className="small">Net is ON by default. Calibrate once from your ADP stub for tight estimates.</div>
        </div>
        <label className="pill">
          <input
            type="checkbox"
            checked={!!netProfile.enabled}
            onChange={(e) => setBundle((p) => ({ ...p, net_profile: { ...(p.net_profile || {}), enabled: e.target.checked } }))}
          />
          net enabled
        </label>
      </div>

      <div className="small" style={{ marginTop: 8 }}>
        Current calibration: <b>{netProfile.calibrationLabel || "Uncalibrated"}</b>
      </div>

      <hr />

      <div className="label">Calibrate from stub</div>
      <div className="small">Enter values from one pay stub. This captures your tax situation (claim 0, dependents, extra withholding, etc.).</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div>
          <div className="label">Label</div>
          <input className="input" value={form.label} onChange={(e) => update("label", e.target.value)} />
        </div>
        <div>
          <div className="label">Extra federal flat (optional)</div>
          <input className="input" value={String(form.extraFedFlat)} onChange={(e) => update("extraFedFlat", e.target.value)} />
        </div>

        {(
          [
            ["gross", "Gross"],
            ["taxableWages", "Federal taxable wages"],
            ["fed", "Federal income tax"],
            ["ss", "Social Security"],
            ["medicare", "Medicare"],
            ["waPfl", "WA Paid Family Leave"],
            ["waPml", "WA Paid Medical Leave"],
            ["waLtc", "WA LTCare"],
            ["waLi", "WA L&I Ee"],
            ["roth", "Roth"],
            ["union", "Union dues"],
            ["life", "Life"],
            ["adnd", "AD&D"],
            ["dentalPretax", "Dental pretax"],
            ["visionPretax", "Vision"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <div className="label">{label}</div>
            <input className="input" value={String((form as any)[key])} onChange={(e) => update(key, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="button" onClick={applyCalibration}>Apply calibration</button>
        <button
          className="button secondary"
          onClick={() => setBundle((p) => ({ ...p, net_profile: DEFAULT_NET_PROFILE }))}
        >
          Reset profile
        </button>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        Tip: After calibration, your net estimate should match that stub within a few dollars (rounding).
      </div>
    </div>
  );
}
