// One-off: mint a new SPOTIFY_REFRESH_TOKEN.
// Prereq: add  http://127.0.0.1:8888/callback  as a Redirect URI in your app at
// https://developer.spotify.com/dashboard  (Edit → Redirect URIs → Save).
//
// Run:  npm run spotify:token             (from the project root, reads .env.local)

import fs from "node:fs";
import http from "node:http";
import { exec } from "node:child_process";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPES = "user-read-currently-playing user-read-playback-state";
const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

const authUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    show_dialog: "true",
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") return res.end();

  const code = url.searchParams.get("code");
  if (!code) {
    res.end("No code: " + url.searchParams.get("error"));
    console.error("Authorization failed:", url.searchParams.get("error"));
    server.close();
    return;
  }

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  const json = await r.json();

  if (!json.refresh_token) {
    res.end("Token exchange failed, see terminal.");
    console.error("Token exchange failed:", json);
  } else {
    res.end("Done — you can close this tab.");
    console.log("\nReplace this line in .env.local:\n");
    console.log(`SPOTIFY_REFRESH_TOKEN=${json.refresh_token}\n`);
  }
  server.close();
});

server.listen(8888, "127.0.0.1", () => {
  console.log("Opening browser to authorize...\n" + authUrl + "\n");
  exec(`open "${authUrl}"`);
});
