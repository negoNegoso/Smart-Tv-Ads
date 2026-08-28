import pino from "pino";

// The Vercel bundle drops esbuild-plugin-pino, so the pino-pretty transport
// worker file is never emitted there. Selecting the transport would make pino
// throw at module scope and break every cold start, so the Vercel runtime must
// take the production branch regardless of what NODE_ENV happens to be.
const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
