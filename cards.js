// Loads the card list from the published Google Sheet (CARD_SHEET_URL), with a safe fallback.
const XLSX = require("xlsx");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const FALLBACK = JSON.parse(fs.readFileSync(path.join(__dirname, "cards_fallback.json"), "utf8"));
const REVIEWED = JSON.parse(fs.readFileSync(path.join(__dirname, "reviewed.json"), "utf8"));
const URL_ = process.env.CARD_SHEET_URL || "";
const MAX_AGE = (Number(process.env.CARD_REFRESH_MINUTES) || 5) * 60e3;

let current = { data: Object.assign({}, FALLBACK, { notes: URL_ ? [] : ["Using the built-in card list (CARD_SHEET_URL is not set)."] }), at: 0, source: "built-in" };
let loading = null;

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const num = (v) => (v === null || v === undefined || v === "" ? null : typeof v === "number" ? Math.trunc(v) : (/^-?\d+(\.0+)?$/.test(String(v).trim()) ? Math.trunc(Number(v)) : v));
function rows(ws) {
  const a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const head = (a[0] || []).map((h) => (h == null ? "" : String(h).trim()));
  return a.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; }); return o; });
}
function parse(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  for (const s of ["Cards", "Monsters", "Config"]) if (!wb.Sheets[s]) throw new Error(`Sheet "${s}" is missing`);
  const notes = [];
  let version = "sheet";
  if (wb.Sheets["Read Me"]) {
    const rm = XLSX.utils.sheet_to_json(wb.Sheets["Read Me"], { header: 1, defval: null });
    for (const r of rm) { const m = String(r[0] || "").match(/Version (v[\d.]+[a-z]?)/i); if (m) { version = m[1]; break; } }
  }
  const cards = [];
  for (const r of rows(wb.Sheets["Cards"])) {
    if (!r.ID || String(r.Status || "") === "Cut") continue;
    let ab = r.Ability == null || r.Ability === "" ? "No ability." : String(r.Ability);
    if (ab.startsWith("#")) { const fb = FALLBACK.cards.find((c) => c.id === r.ID); ab = fb ? fb.ability : "(text missing)"; notes.push(`${r.Name}: the Ability cell shows a sheet error; using the last good text.`); }
    ab = ab.trim();
    let keys = r.SimKeys == null ? "" : String(r.SimKeys);
    const rev = REVIEWED.cards[r.ID];
    if (rev) {
      if (rev.h === sha(ab)) { if (keys !== rev.keys) keys = rev.keys; } // same text: keep reviewed rules
      else notes.push(`${r.Name} has new text. Its new ability may not play correctly until it is reviewed.`);
    } else notes.push(`${r.Name} is a new card. Its ability may not play correctly until it is reviewed.`);
    const pw = num(r.Power), pr = num(r.Prestige);
    cards.push({ id: String(r.ID), name: String(r.Name), area: r.Area, type: r.Type, guild: r.Guild || null,
      cost: num(r.Cost) || 0, power: typeof pw === "number" ? pw : 0, prestige: typeof pr === "number" ? pr : 0,
      infl: num(r.Influence) || 0, qty: num(r.Qty) || 1, portals: num(r.Portals) || 0, ability: ab, keys,
      xpower: r.Power === "X", xprestige: r.Prestige === "X" });
  }
  const monsters = [];
  for (const r of rows(wb.Sheets["Monsters"])) {
    if (!r.Level) continue;
    const ab = r.Ability == null ? "" : String(r.Ability).trim();
    let keys = r.SimKeys == null ? "" : String(r.SimKeys);
    const rev = REVIEWED.monsters[r.Name];
    if (rev) { if (rev.h === sha(ab)) keys = rev.keys; else notes.push(`${r.Name} has new text. Its new ability may not play correctly until it is reviewed.`); }
    else notes.push(`${r.Name} is a new Monster. Its ability may not play correctly until it is reviewed.`);
    monsters.push({ level: Number(r.Level), name: String(r.Name), power: Number(r.Power), ability: ab, keys });
  }
  const cfg = {};
  const cws = XLSX.utils.sheet_to_json(wb.Sheets["Config"], { header: 1, defval: null });
  for (const r of cws.slice(1)) if (r[0]) cfg[String(r[0]).trim()] = typeof r[1] === "string" ? r[1] : num(r[1]);
  // sanity checks before trusting the sheet
  if (cards.length < 50) throw new Error(`only ${cards.length} cards found`);
  for (const L of [1, 2, 3]) if (!monsters.some((m) => m.level === L)) throw new Error(`no Level ${L} Monster`);
  if (!cards.some((c) => c.area === "Starter")) throw new Error("no Starter cards");
  return { cards, monsters, cfg, version, notes };
}
async function refresh(force) {
  if (!URL_) return current;
  if (!force && Date.now() - current.at < MAX_AGE) return current;
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch(URL_, { redirect: "follow" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = String(res.headers.get("content-type") || "");
      if (ct.includes("text/html") || buf.slice(0, 15).toString().toLowerCase().includes("<!doctype html") || buf.slice(0, 6).toString().toLowerCase().startsWith("<html"))
        throw new Error("the sheet link returned a web page instead of an .xlsx file. In Google Sheets, check File > Share > Publish to web is on, set to Entire Document and Microsoft Excel (.xlsx)");
      const data = parse(buf);
      current = { data, at: Date.now(), source: "sheet" };
      console.log(`[cards] loaded ${data.version} from Google Sheet: ${data.cards.length} cards, ${data.notes.length} notes`);
    } catch (e) {
      console.error("[cards] could not load the sheet, keeping the last good list:", e.message);
      current.at = Date.now();
      current.data = Object.assign({}, current.data, { notes: [`Couldn't read the Google Sheet (${e.message}). Using the last good card list.`] });
    } finally { loading = null; }
    return current;
  })();
  return loading;
}
module.exports = { refresh, parse, get: () => current };
