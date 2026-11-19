/**
 * Process entry point.
 *
 * Phase 0 only proves the build pipeline: TypeScript compiles, `dist/server.js`
 * exists, and `npm start` runs it. Phase 2 replaces this module with config
 * loading, database startup, and `app.listen`.
 */
export const entrypoint = "scaffold";
