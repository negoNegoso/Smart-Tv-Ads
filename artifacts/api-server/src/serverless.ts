/**
 * Serverless entrypoint. The platform invokes the default export as a
 * (req, res) handler, which an Express app already is — no adapter needed.
 * Unlike index.ts this never binds a port and never requires PORT.
 */
export { default } from "./app";
