// Standalone mode: serves the playtest at /playtest. Render start command: node server.js
const express = require("express");
const app = express();
app.set("trust proxy", 1);
app.get("/robots.txt", (req, res) => res.type("text/plain").send("User-agent: *\nDisallow: /playtest\n"));
app.use("/playtest", require("./router"));
app.get("/", (req, res) => res.redirect("/playtest"));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("HOE playtest on port " + port));
