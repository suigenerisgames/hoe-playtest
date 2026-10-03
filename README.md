# Heroes of Edgeport playtest (password protected)

Serves the HOE Playtest Table at `/playtest`, behind one shared password.
Search engines are told not to index it.

## 1. Find out what your site runs on

In Render, open your SGG site's service.

- Says **Static Site** at the top: it can't run server code. Use Option B.
- Says **Web Service**: check Settings for the Runtime and Start Command.
  - Node (Start Command like `node server.js` or `npm start`, repo has `package.json`): use Option A.
  - Python (Start Command like `gunicorn ...` or `uvicorn ...`, repo has `requirements.txt`): use Option B for now. A Python version is a short job if you want it on the same service.

## 2. Publish your master card sheet (one time)

1. Open the master card list in Google Sheets.
2. File > Share > Publish to web.
3. Under Link, choose **Entire Document** and **Microsoft Excel (.xlsx)**. Click Publish.
4. Copy the link. It looks like `https://docs.google.com/spreadsheets/d/e/.../pub?output=xlsx`.

Keep "Automatically republish when changes are made" ticked (it's under Published content and settings).

Heads up: a published link is unlisted, not private. Anyone who has the exact link can download the card list. Nobody can edit it.

## 3. Set environment variables (Render > your service > Environment)

- `PLAYTEST_PASSWORD`: the shared password you give friends.
- `SESSION_SECRET`: any long random string. Changing it logs everyone out.
- `CARD_SHEET_URL`: the published link from step 2.
- `CARD_REFRESH_MINUTES` (optional): how often the server rechecks the sheet. Default 5.

## Option A: add to your existing Node/Express site (suigeneris.games/playtest)

1. Copy this whole `hoe-playtest` folder into your site's repo.
2. Add `express` and `xlsx` to your site's `package.json` dependencies (run `npm install express xlsx` in the site folder).
3. In your main server file, after `const app = express()`:

   ```js
   app.set("trust proxy", 1);
   app.use("/playtest", require("./hoe-playtest/router"));
   ```

4. Commit and push. Render redeploys. Visit `https://suigeneris.games/playtest`.

## Option B: run it as its own Render service

1. Put this folder in its own GitHub repo.
2. Render > New > Web Service > pick the repo.
   - Build Command: `npm install`
   - Start Command: `node server.js`
3. Add the two environment variables above.
4. It runs at `https://<name>.onrender.com/playtest`. To use your domain, add a custom domain in Render (for example `playtest.suigeneris.games`) and the CNAME record it gives you at your DNS host.

## Updating the cards

Edit the Google Sheet. The playtest picks up changes within 5 minutes, or right away if you visit `/playtest/refresh`. No redeploy.

What updates live: Cost, Power, Prestige, Influence, Qty, Portals, card names, Monster Power, the Config tab, and cards marked Cut in Status.

What needs Claude: a new ability or changed ability text. Each ability is played by the rules in the SimKeys column, which Claude writes. When you change a card's ability text or add a card, the setup screen lists it under "Card list notes" until Claude reviews it and sends an updated package. If a card's text is unchanged, the server keeps the reviewed SimKeys even if an older copy of the sheet has outdated ones.

Keep the sheet's structure: the tabs named Cards, Monsters and Config, and their column headers. If the sheet can't be read or looks broken, the server keeps using the last good card list and shows a note.

## Notes

- Logins last 30 days. Visit `/playtest/logout` to log out.
- After 8 wrong passwords, that address waits 10 minutes.
- The login cookie needs HTTPS, so test the login on Render, not on `localhost`.
- Games save in each player's browser, the same as the Claude version.
- Render's free tier sleeps after 15 minutes idle; the first visit after that takes a little while to wake.
