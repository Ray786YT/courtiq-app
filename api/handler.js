/**
 * Vercel serverless function entry for every /api/* request.
 *
 * A plain filename plus an explicit rewrite in vercel.json, rather than a
 * `[...slug]` catch-all: the bracket form only matched a single path segment in
 * practice, so /api/auth/login and /api/players/1/history 404'd before ever
 * reaching Express.
 *
 * This file is committed and deliberately tiny. Vercel validates the `functions`
 * config against the repository before the build runs, so the entry point has to
 * exist in git even though the code it serves does not.
 *
 * `./_app.js` is the bundled Express app, written by build-vercel.mjs during the
 * build and ignored by git. The underscore keeps Vercel from routing to it.
 */
module.exports = require("./_app.js");
