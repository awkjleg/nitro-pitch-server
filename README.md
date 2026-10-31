# Nitro Pitch server

This folder is the whole `nitropitch` site **plus** its online server. Cloudflare builds it straight from GitHub, so
everything happens in the browser (works on a Chromebook, nothing to install).

- `public/`: the game (the same files as the zip you upload to Cloudflare).
- `src/worker.js`: the online server. It runs the lobby, chat, matchmaking and matches.
- `wrangler.jsonc`: tells Cloudflare how to put it together. Its `"name"` must stay `nitropitch`.

## One-time setup (about 10 minutes)

1. **GitHub account.** Go to [github.com](https://github.com) and sign up (free) if you don't have an account.
2. **New repository.** Click **+** (top right) → **New repository**. Name it `nitro-pitch-server`. Private is fine.
   Click **Create repository**.
3. **Upload the files.** Unzip `nitro-pitch-server-v5.2.zip` (open it in the Files app and copy the folder out).
   On the new repository's page, click **uploading an existing file**. Open the `nitro-pitch-server` folder and drag
   **everything inside it** (`wrangler.jsonc`, `README.md`, and the `src` and `public` folders) onto the page.
   Click **Commit changes**.
4. **Connect it to Cloudflare.** In the Cloudflare dashboard: **Workers & Pages** → **nitropitch** → **Settings** →
   **Build** → **Connect** (Git repository) → **GitHub**. Allow Cloudflare to see the repository when GitHub asks, pick
   `nitro-pitch-server`, branch `main`. Leave the build command empty and the deploy command as `npx wrangler deploy`.
   Click **Connect** / **Save and deploy**.
5. **Wait 1–2 minutes.** The **Deployments** tab shows the build. When it's done, open
   [nitropitch.bibleway.workers.dev](https://nitropitch.bibleway.workers.dev): online should connect, even on a work or
   school network.
6. **Your other sites** (`yo`, `hi`, `nitro-pitch`): keep uploading the normal game zip there. They use the server on
   `nitropitch` too.

If the build fails, send Claude a screenshot of the build log (Deployments → the failed build).

## Updating later

Upload the new files to the GitHub repository (usually just `public/index.html` and `public/version.txt`; open the
`public` folder on GitHub → **Add file** → **Upload files** → drop them in → **Commit changes**). Cloudflare redeploys by
itself in a minute or two. Don't upload the game zip to `nitropitch` in the dashboard any more: GitHub is its source now.

## Cost

Cloudflare's free plan includes Durable Objects (what the server uses) with daily limits. If a busy day uses them up,
online stops working on the server until midnight UTC, and the game switches to the old peer-to-peer online by itself
(which doesn't work on networks that block it). The Workers Paid plan ($5/month) raises the limits a lot.


## Domain migration

The canonical website is `https://nitropitch.app`. The Wrangler configuration attaches that custom domain to this same `nitropitch` Worker and keeps its workers.dev address enabled; both hosts must reach the same deployment. The domain must belong to the deployment’s Cloudflare account. The correctly spelled legacy hostname is `nitropitch.bibleway.workers.dev`.

Legacy page visits automatically pass through a short migration before opening the same path on the new address. The new-origin tab generates a private ECDH key and a PKCE-style verifier. The old page encrypts the allowed game storage and the pinned Firebase 10.12.2 persistence record with ECDH/AES-GCM. A short-lived Durable Object holds only ciphertext, validates the verifier, permits one redemption, and deletes the transfer. Keys and raw login credentials never appear in the redirect URLs. Both source and target pages run as top-level pages, so third-party storage partitioning does not hide the old save.

The old browser save remains intact. A completion flag on the new address prevents old bookmarks from offering the stale source copy again. When a different account or guest save already exists on the new address, the player chooses which to keep. Blocked storage, revoked/expired credentials, connectivity failures, or saves exceeding 8 MiB may require retrying or signing in again. Revisit the old URL to restart; do not clear the old site data first. This migration depends on Firebase’s pinned persistence format; re-test it before changing the Firebase SDK version.

Keep the old `/ws` endpoint available: existing game tabs and the default room-server URL use it. The room server accepts `https://nitropitch.app` as well as the existing development and legacy origins. The cookie dialog is centered and gives equal one-click allow/reject controls.

## Online consistency and game-shell compatibility updates

`public/online-rooms.js` keeps every tab on the same WebSocket lobby. It reconciles snapshots atomically, refreshes on tab wake and heartbeats, retries without a separate peer-to-peer fallback, and ignores callbacks from replaced connections. `src/room.js` retains small presence records in hibernating socket attachments, requests larger records again without deleting player seats, and allows 12 seconds for a transient reconnect. Explicit Leave remains immediate.

The prebuilt `public/index.html` asset is unchanged. `src/game-shell.js` applies a small set of checked compatibility edits before it is served: loading the new transport, live connection/admin-list refresh, the build number, and accurate final ground-contact/goal ordering. If replacing the game asset, update these tested anchors or apply the changes directly and remove the compatibility layer. The layer refuses ambiguous/missing anchors rather than silently serving a partially patched game.

Run `node --test tests/*.test.mjs` (Node 22+) before deployment. These tests cover hibernation, transient reconnects, explicit departures, stale socket callbacks, atomic snapshots, tab wake, stationary gameplay timestamps, the game-script syntax, and zero-second goals/ground contacts including Dropshot.
