import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CODES, DEFAULT_NET_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import {
  applyAdjustments,
  calibrateFromStub,
  computeNet,
  grossFromEntries,
  makeId,
  round2,
} from "./calc";
import { downloadJson, loadState, readJsonFile, saveState } from "./storage";
import { Adjustment, ExportBundle, PayCodeDef } from "./types";
import { parseImageStubOcr, parsePdfStub, StubFieldKey, StubParseResult } from "./stubImport";

function money(n: number | null) {
  if (n === null) return "--";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function parseNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function App() {
  const [tab, setTab] = useState<"estimate" | "codes" | "net">("estimate");
  const [bundle, setBundle] = useState<ExportBundle>(() => loadState());

  useEffect(() => {
    saveState(bundle);
  }, [bundle]);

  const settings = bundle.settings || DEFAULT_SETTINGS;
  const payCodes = bundle.pay_codes || DEFAULT_CODES;
  const entries = bundle.entries || [];
  const adjustments = bundle.adjustments || { earnings: [], deductions: [] };
  const netProfile = bundle.net_profile || DEFAULT_NET_PROFILE;

  const grossCalc = useMemo(
    () => grossFromEntries(entries, payCodes, settings),
    [entries, payCodes, settings]
  );
  const gross = useMemo(
    () => applyAdjustments(grossCalc.gross, adjustments),
    [grossCalc.gross, adjustments]
  );
  const netCalc = useMemo(
    () => computeNet(gross, adjustments, netProfile),
    [gross, adjustments, netProfile]
  );

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
        earnings:
          kind === "earnings"
            ? [...(prev.adjustments?.earnings || []), baseAdj]
            : prev.adjustments?.earnings || [],
        deductions:
          kind === "deductions"
            ? [...(prev.adjustments?.deductions || []), baseAdj]
            : prev.adjustments?.deductions || [],
      },
    }));
  };

  const updateAdjustment = (
    kind: "earnings" | "deductions",
    id: string,
    patch: Partial<Adjustment>
  ) => {
    setBundle((prev) => ({
      ...prev,
      adjustments: {
        earnings:
          kind === "earnings"
            ? (prev.adjustments?.earnings || []).map((a) => (a.id === id ? { ...a, ...patch } : a))
            : prev.adjustments?.earnings || [],
        deductions:
          kind === "deductions"
            ? (prev.adjustments?.deductions || []).map((a) => (a.id === id ? { ...a, ...patch } : a))
            : prev.adjustments?.deductions || [],
      },
    }));
  };

  const removeAdjustment = (kind: "earnings" | "deductions", id: string) => {
    setBundle((prev) => ({
      ...prev,
      adjustments: {
        earnings:
          kind === "earnings"
            ? (prev.adjustments?.earnings || []).filter((a) => a.id !== id)
            : prev.adjustments?.earnings || [],
        deductions:
          kind === "deductions"
            ? (prev.adjustments?.deductions || []).filter((a) => a.id !== id)
            : prev.adjustments?.deductions || [],
      },
    }));
  };

  const exportFull = () => downloadJson("abhs-paycheck-estimator_full.json", bundle);

  const exportShareable = () => {
    const stripped: ExportBundle = {
      schema_version: bundle.schema_version || "1.0",
      settings: bundle.settings,
      pay_codes: bundle.pay_codes,
      entries: bundle.entries,
      adjustments: bundle.adjustments,
      net_profile: bundle.net_profile,
    };
    downloadJson("abhs-paycheck-estimator_shareable.json", stripped);
  };

  const fileRef = useRef<HTMLInputElement | null>(null);
  const importJson = async (file: File) => {
    const obj = (await readJsonFile(file)) as ExportBundle;
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
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>ABHS Paycheck Estimator</h1>
          <div style={{ opacity: 0.8 }}>
            Local-only. Pay-code input. Custom codes + one-offs + net calibration.
            <br />
            <b>Unofficial tool. Not endorsed by American Behavioral Health Systems, Inc.</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: netCalc.calibrated ? "#d1fae5" : "#fee2e2",
              color: "#111",
              fontWeight: 600,
            }}
          >
            {netCalc.calibrated ? "Calibrated" : "Uncalibrated"}
          </span>

          <button onClick={exportShareable}>Shareable Export</button>
          <button onClick={exportFull}>Full Export</button>

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
          <button onClick={() => fileRef.current?.click()}>Import</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={() => setTab("estimate")}>{tab === "estimate" ? "Estimate ✓" : "Estimate"}</button>
        <button onClick={() => setTab("codes")}>{tab === "codes" ? "Pay Codes ✓" : "Pay Codes"}</button>
        <button onClick={() => setTab("net")}>{tab === "net" ? "Net Profile ✓" : "Net Profile"}</button>
      </div>

      {tab === "estimate" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 12, marginTop: 16 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Base rate</div>
                <input
                  value={String(settings.baseRate)}
                  onChange={(e) =>
                    setBundle((p) => ({ ...p, settings: { ...settings, baseRate: parseNum(e.target.value) } }))
                  }
                />
              </div>

              <div>
                <div style={{ fontWeight: 700 }}>Diffs (swing / grave / weekend)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ width: 90 }}
                    value={String(settings.diffs.swing)}
                    onChange={(e) =>
                      setBundle((p) => ({
                        ...p,
                        settings: { ...settings, diffs: { ...settings.diffs, swing: parseNum(e.target.value) } },
                      }))
                    }
                  />
                  <input
                    style={{ width: 90 }}
                    value={String(settings.diffs.grave)}
                    onChange={(e) =>
                      setBundle((p) => ({
                        ...p,
                        settings: { ...settings, diffs: { ...settings.diffs, grave: parseNum(e.target.value) } },
                      }))
                    }
                  />
                  <input
                    style={{ width: 90 }}
                    value={String(settings.diffs.weekend)}
                    onChange={(e) =>
                      setBundle((p) => ({
                        ...p,
                        settings: { ...settings, diffs: { ...settings.diffs, weekend: parseNum(e.target.value) } },
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <hr />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Hours by pay code</div>
                <div style={{ opacity: 0.75 }}>Enter what your ADP timesheet shows. Add custom codes in Pay Codes.</div>
              </div>
              <button onClick={addEntry}>Add row</button>
            </div>

            <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Pay code</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Hours</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Rate</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Line total</th>
                  <th style={{ borderBottom: "1px solid #ddd" }} />
                </tr>
              </thead>
              <tbody>
                {grossCalc.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <select value={l.code} onChange={(e) => updateEntry(l.id, { code: e.target.value })}>
                        {payCodes.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={String(l.hours)}
                        onChange={(e) => updateEntry(l.id, { hours: parseNum(e.target.value) })}
                      />
                    </td>
                    <td>{money(l.rate)}</td>
                    <td>{money(l.total)}</td>
                    <td>
                      <button onClick={() => removeEntry(l.id)}>X</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>One-off earnings / deductions</div>
                <div style={{ opacity: 0.75 }}>Bonuses, retention, lunch, misc. These adjust gross.</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => addAdjustment("deductions")}>Add deduction</button>
                <button onClick={() => addAdjustment("earnings")}>Add earning</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Earnings</div>
                {(adjustments.earnings || []).map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <input value={a.label} onChange={(e) => updateAdjustment("earnings", a.id, { label: e.target.value })} />
                    <input
                      style={{ width: 120 }}
                      value={String(a.amount)}
                      onChange={(e) => updateAdjustment("earnings", a.id, { amount: parseNum(e.target.value) })}
                    />
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={a.taxable}
                        onChange={(e) => updateAdjustment("earnings", a.id, { taxable: e.target.checked })}
                      />
                      taxable
                    </label>
                    <button onClick={() => removeAdjustment("earnings", a.id)}>X</button>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontWeight: 700 }}>Deductions</div>
                {(adjustments.deductions || []).map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <input value={a.label} onChange={(e) => updateAdjustment("deductions", a.id, { label: e.target.value })} />
                    <input
                      style={{ width: 120 }}
                      value={String(a.amount)}
                      onChange={(e) => updateAdjustment("deductions", a.id, { amount: parseNum(e.target.value) })}
                    />
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={a.pretax}
                        onChange={(e) => updateAdjustment("deductions", a.id, { pretax: e.target.checked })}
                      />
                      pretax
                    </label>
                    <button onClick={() => removeAdjustment("deductions", a.id)}>X</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>Results</div>

            <div style={{ marginTop: 10 }}>
              <div><b>Gross:</b> {money(gross)}</div>
              <div><b>Net:</b> {money(netCalc.net)}</div>
              <div style={{ opacity: 0.75, marginTop: 6 }}>
                Hours-only gross: {money(grossCalc.gross)} | Adjusted gross: {money(gross)}
              </div>
            </div>

            <hr />

            <div style={{ fontWeight: 700 }}>Net breakdown</div>
            {!netCalc.details ? (
              <div style={{ opacity: 0.75 }}>Uncalibrated. Go to Net Profile and calibrate (upload or manual).</div>
            ) : (
              <div style={{ opacity: 0.9, marginTop: 6 }}>
                Taxable wages: {money(netCalc.details.taxable)}<br />
                Pretax total: {money(netCalc.details.pretaxTotal)}<br />
                Federal: {money(netCalc.details.fed)}<br />
                SS: {money(netCalc.details.ss)}<br />
                Medicare: {money(netCalc.details.med)}<br />
                WA PFML/PML/LTC/L&amp;I: {money(round2(netCalc.details.waPfl + netCalc.details.waPml + netCalc.details.waLtc + netCalc.details.waLi))}<br />
                Roth: {money(netCalc.details.roth)}<br />
                Fixed (union/life/ad&amp;d + dental/vision): {money(netCalc.details.fixed)}<br />
                Total deductions: {money(netCalc.details.totalDeductions)}
              </div>
            )}

            <hr />
            <div style={{ opacity: 0.8 }}>
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

function PayCodesPanel(props: {
  payCodes: PayCodeDef[];
  setBundle: React.Dispatch<React.SetStateAction<ExportBundle>>;
}) {
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
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800 }}>Pay codes</div>
          <div style={{ opacity: 0.75 }}>Custom-code builder is enabled by default.</div>
        </div>
        <button onClick={addCode}>Add code</button>
      </div>

      <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Code</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Rule</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Diff</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Mult</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Flat</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Notes</th>
            <th style={{ borderBottom: "1px solid #ddd" }} />
          </tr>
        </thead>
        <tbody>
          {(payCodes || []).map((c, idx) => (
            <tr key={idx}>
              <td>
                <input value={c.code} onChange={(e) => updateCode(idx, { code: e.target.value })} />
              </td>
              <td>
                <select value={c.rule.type} onChange={(e) => updateCode(idx, { rule: { ...c.rule, type: e.target.value as any } })}>
                  <option value="base">base</option>
                  <option value="base_plus_diff">base + diff</option>
                  <option value="multiplier_base">multiplier * base</option>
                  <option value="multiplier_base_plus_diff">multiplier * (base + diff)</option>
                  <option value="flat_hourly">flat hourly</option>
                </select>
              </td>
              <td>
                <select
                  value={c.rule.diff || ""}
                  onChange={(e) => updateCode(idx, { rule: { ...c.rule, diff: e.target.value ? (e.target.value as any) : undefined } })}
                >
                  <option value="">--</option>
                  <option value="swing">swing</option>
                  <option value="grave">grave</option>
                  <option value="weekend">weekend</option>
                </select>
              </td>
              <td>
                <input
                  style={{ width: 90 }}
                  value={String(c.rule.multiplier ?? "")}
                  onChange={(e) => updateCode(idx, { rule: { ...c.rule, multiplier: parseNum(e.target.value) } })}
                />
              </td>
              <td>
                <input
                  style={{ width: 90 }}
                  value={String(c.rule.flatRate ?? "")}
                  onChange={(e) => updateCode(idx, { rule: { ...c.rule, flatRate: parseNum(e.target.value) } })}
                />
              </td>
              <td>
                <input value={c.notes || ""} onChange={(e) => updateCode(idx, { notes: e.target.value })} />
              </td>
              <td>
                <button onClick={() => removeCode(idx)}>X</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ opacity: 0.8, marginTop: 10 }}>
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
  { key: "visionPretax", label: "Vision pretax" },
  { key: "roth", label: "Roth" },
  { key: "net", label: "Net pay (optional)" },
];

function NetPanel(props: {
  netProfile: any;
  setBundle: React.Dispatch<React.SetStateAction<ExportBundle>>;
}) {
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

  const update = (ky: string, v: string) => {
    setForm((p) => ({ ...p, [ky]: typeof (p as any)[ky] === "number" ? parseNum(v) : v } as any));
  };

  const applyCalibration = () => {
    const prof = calibrateFromStub(form);
    setBundle((p) => ({ ...p, net_profile: prof }));
  };

  const resetProfile = () => setBundle((p) => ({ ...p, net_profile: DEFAULT_NET_PROFILE }));

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
      waLi: parsed.fields.waLi ?? p.waLi,
      roth: parsed.fields.roth ?? p.roth,
      union: parsed.fields.union ?? p.union,
      life: parsed.fields.life ?? p.life,
      adnd: parsed.fields.adnd ?? p.adnd,
      dentalPretax: parsed.fields.dentalPretax ?? p.dentalPretax,
      visionPretax: parsed.fields.visionPretax ?? p.visionPretax,
      extraFedFlat: p.extraFedFlat,
    }));
  };

  const renderParseSummary = () => {
    if (!lastParse) return null;
    const { report, fields } = lastParse;
    const scary = report.likelyScannedPdf || report.requiredMissing.length > 0;

    return (
      <div style={{ marginTop: 10, opacity: 0.9 }}>
        Found {report.foundCount}/{report.totalCount} fields.
        <br />
        {scary ? (
          <b>Couldn't read text (might be a scanned PDF). Try screenshot upload (OCR) or manual entry.</b>
        ) : (
          <>PDF/OCR parsed. Review fields and click <b>Apply calibration</b>.</>
        )}

        <ul style={{ marginTop: 8 }}>
          {CHECK_FIELDS.map((f) => {
            const ok = fields[f.key] !== null;
            return (
              <li key={f.key}>
                {ok ? "[OK]" : "[--]"} {f.label}{f.required ? " (required)" : ""}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const onPdf = async (file: File) => {
    setUploadStatus("Parsing PDF...");
    try {
      const parsed = await parsePdfStub(file);
      setLastParse(parsed);
      applyParsedFieldsToForm(parsed);
      setUploadStatus(parsed.report.likelyScannedPdf ? "PDF looks scanned (low text)." : "PDF parsed.");
    } catch {
      setUploadStatus("PDF parse failed. Try screenshot upload (OCR) or manual entry.");
      setLastParse(null);
    }
  };

  const onImage = async (file: File) => {
    setUploadStatus("Running OCR (this can take a sec)...");
    try {
      const parsed = await parseImageStubOcr(file);
      setLastParse(parsed);
      applyParsedFieldsToForm(parsed);
      setUploadStatus("OCR parsed.");
    } catch {
      setUploadStatus("OCR failed. Try a clearer screenshot or manual entry.");
      setLastParse(null);
    }
  };

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800 }}>Net Profile</div>
          <div style={{ opacity: 0.75 }}>Net is ON by default. Calibrate once from a real pay stub for tight estimates.</div>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!netProfile.enabled}
            onChange={(e) =>
              setBundle((p) => ({
                ...p,
                net_profile: { ...(p.net_profile || DEFAULT_NET_PROFILE), enabled: e.target.checked },
              }))
            }
          />
          net enabled
        </label>
      </div>

      <div style={{ marginTop: 8, opacity: 0.9 }}>
        Current calibration: <b>{netProfile.calibrationLabel || "Uncalibrated"}</b>
      </div>

      <hr />

      <div style={{ fontWeight: 800 }}>Easy mode (Option A)</div>
      <div style={{ opacity: 0.75 }}>Upload a pay stub. If it can't read text, you'll see the exact fallback message.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Upload pay stub PDF</div>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPdf(f);
              e.currentTarget.value = "";
            }}
          />
        </div>

        <div>
          <div style={{ fontWeight: 700 }}>Upload screenshot (OCR)</div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImage(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {uploadStatus && <div style={{ marginTop: 10, opacity: 0.9 }}>{uploadStatus}</div>}
      {renderParseSummary()}

      <hr />

      <div style={{ fontWeight: 800 }}>Manual calibration (always works)</div>
      <div style={{ opacity: 0.75 }}>
        Enter values from one pay stub. This captures your tax situation (claim 0, dependents, extra withholding, etc.).
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Label</div>
          <input value={form.label} onChange={(e) => update("label", e.target.value)} />
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>Extra federal flat (optional)</div>
          <input value={String(form.extraFedFlat)} onChange={(e) => update("extraFedFlat", e.target.value)} />
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
            ["visionPretax", "Vision pretax"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <div style={{ fontWeight: 700 }}>{label}</div>
            <input value={String((form as any)[key])} onChange={(e) => update(key, e.target.value)} />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={applyCalibration}>Apply calibration</button>
        <button onClick={resetProfile}>Reset profile</button>
      </div>

      <div style={{ marginTop: 10, opacity: 0.85 }}>
        Disclaimer: Unofficial tool. Not endorsed by American Behavioral Health Systems, Inc. Your pay stub is the source of truth.
      </div>
    </div>
  );
}
