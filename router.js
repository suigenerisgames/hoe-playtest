// Heroes of Edgeport playtest: password-protected router.
// Mount in an existing Express app:  app.use("/playtest", require("./hoe-playtest/router"));
// Or run on its own with server.js.
// Settings (Render > Environment): PLAYTEST_PASSWORD (required), SESSION_SECRET (any long random string).
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const cards = require("./cards");
const TEMPLATE = fs.readFileSync(path.join(__dirname, "public", "playtest_template.html"), "utf8");
cards.refresh(true);

const PASSWORD = process.env.PLAYTEST_PASSWORD || "";
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE = "hoe_pt";
const DAYS = 30;
const attempts = new Map(); // ip -> {n, until}

function sign(v) { return v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("base64url"); }
function verify(s) {
  if (!s) return false;
  const i = s.lastIndexOf("."); if (i < 0) return false;
  const v = s.slice(0, i), good = sign(v);
  if (good.length !== s.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(s))) return false;
  return Number(v) > Date.now();
}
function getCookie(req, name) {
  const h = req.headers.cookie || "";
  for (const part of h.split(";")) { const [k, ...r] = part.trim().split("="); if (k === name) return decodeURIComponent(r.join("=")); }
  return null;
}
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(a).digest(), hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Playtest</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#D9CCAF;color:#2A2118;font-family:Georgia,serif}
form{background:#EFE3C6;border:1.5px solid #B9A57C;border-radius:14px;padding:24px;width:min(340px,88vw)}
h1{font-size:22px;margin:0 0 14px}input,button{font:inherit;width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1.5px solid #B9A57C;margin-top:8px}
button{background:#2A2118;color:#D9CCAF;font-weight:bold;cursor:pointer}.err{color:#A33A2E;margin-top:10px}</style></head><body>${body}</body></html>`;

const router = express.Router();
router.use((req, res, next) => { res.set("X-Robots-Tag", "noindex, nofollow"); res.set("Cache-Control", "no-store"); next(); });
router.use(express.urlencoded({ extended: false }));

router.get("/login", (req, res) => {
  const err = req.query.e ? `<div class="err">${req.query.e === "wait" ? "Too many tries. Wait a few minutes." : "Wrong password."}</div>` : "";
  res.send(page(`<form method="post" action="login"><h1>Heroes of Edgeport</h1><label for="pw">Playtest password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" autofocus required><button type="submit">Enter</button>${err}</form>`));
});
router.post("/login", (req, res) => {
  const ip = req.ip || "x", a = attempts.get(ip) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.redirect("login?e=wait");
  if (!PASSWORD) return res.status(500).send("PLAYTEST_PASSWORD is not set on the server.");
  if (safeEqual(String(req.body.password || ""), PASSWORD)) {
    attempts.delete(ip);
    const exp = String(Date.now() + DAYS * 864e5);
    res.set("Set-Cookie", `${COOKIE}=${encodeURIComponent(sign(exp))}; Path=${req.baseUrl || "/"}; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
    return res.redirect(req.baseUrl + "/");
  }
  a.n++; if (a.n >= 8) { a.until = Date.now() + 10 * 60e3; a.n = 0; }
  attempts.set(ip, a);
  res.redirect("login?e=1");
});
router.get("/logout", (req, res) => {
  res.set("Set-Cookie", `${COOKIE}=; Path=${req.baseUrl || "/"}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  res.redirect(req.baseUrl + "/login");
});
// everything else needs a valid session
router.use((req, res, next) => {
  if (verify(getCookie(req, COOKIE))) return next();
  res.redirect(req.baseUrl + "/login");
});
router.get(["/", "/index.html"], async (req, res) => {
  const cur = await cards.refresh(false);
  const json = JSON.stringify(cur.data).replace(/</g, "\\u003c");
  res.type("html").send(TEMPLATE.replace("/*__HOE_DATA__*/null", json));
});
// force an immediate reload from the sheet after you edit it
router.get("/refresh", async (req, res) => {
  const cur = await cards.refresh(true);
  res.redirect(req.baseUrl + "/?v=" + encodeURIComponent(cur.data.version));
});
module.exports = router;
