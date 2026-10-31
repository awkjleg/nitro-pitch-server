# Nitro Pitch release requirements

The owner requires patch notes and the existing refresh notification for every published game update. Apply this to UI, gameplay, server, migration, and player-facing bug fixes. Group changes released together into one release.

Before publishing:
- Increment the served `BUILD` in `src/game-shell.js`, `public/version.txt`, and the `X-Nitropitch-Build` header in `src/worker.js` together. They must match.
- Update the active `PATCH_NOTES` version, title, and player-friendly notes in `src/game-shell.js` for the release. Updating only historical patch-note constants is insufficient.
- Preserve the existing `checkVersion` / `noteBuild` / `showUpdateBar` refresh popup. It appears on menu screens after a newer build is detected; do not interrupt a match or matchmaking with a forced refresh.
- Run `node --test tests/*.test.mjs` and the Wrangler dry-run. Check Cloudflare production deployment before claiming the update is live.

The bundled `public/index.html` remains the source asset; `src/game-shell.js` applies checked compatibility edits before serving it. If replacing the bundled game, update its anchors and rerun the tests.
