import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

// Some packages may not be bundleable, so we externalize them, we can add more here as needed.
// Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
// Examples of unbundleable packages:
// - uses native modules and loads them dynamically (e.g. sharp)
// - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
const externalPackages = [
  "*.node",
  "sharp",
  "better-sqlite3",
  "sqlite3",
  "canvas",
  "bcrypt",
  "argon2",
  "fsevents",
  "re2",
  "farmhash",
  "xxhash-addon",
  "bufferutil",
  "utf-8-validate",
  "ssh2",
  "cpu-features",
  "dtrace-provider",
  "isolated-vm",
  "lightningcss",
  "pg-native",
  "oracledb",
  "mongodb-client-encryption",
  "nodemailer",
  "handlebars",
  "knex",
  "typeorm",
  "protobufjs",
  "onnxruntime-node",
  "@tensorflow/*",
  "@prisma/client",
  "@mikro-orm/*",
  "@grpc/*",
  "@swc/*",
  "@aws-sdk/*",
  "@azure/*",
  "@opentelemetry/*",
  "@google-cloud/*",
  "@google/*",
  "googleapis",
  "firebase-admin",
  "@parcel/watcher",
  "@sentry/profiling-node",
  "@tree-sitter/*",
  "aws-sdk",
  "classic-level",
  "dd-trace",
  "ffi-napi",
  "grpc",
  "hiredis",
  "kerberos",
  "leveldown",
  "miniflare",
  "mysql2",
  "newrelic",
  "odbc",
  "piscina",
  "realm",
  "ref-napi",
  "rocksdb",
  "sass-embedded",
  "sequelize",
  "serialport",
  "snappy",
  "tinypool",
  "usb",
  "workerd",
  "wrangler",
  "zeromq",
  "zeromq-prebuilt",
  "playwright",
  "puppeteer",
  "puppeteer-core",
  "electron",
];

/**
 * Replaces `@google-cloud/*` with a throwing stub in the Vercel bundle.
 *
 * Marking the package `external` is not enough: esbuild defers the module body
 * of a dynamic `import()` but still hoists the import statement to the top of
 * the output file. The Build Output API does no dependency tracing — the
 * `.func` directory *is* the lambda filesystem and has no node_modules — so
 * Node would fail to resolve `@google-cloud/storage` on every cold start,
 * before any route runs. Stubbing emits no import statement at all.
 *
 * The stub is never reached at runtime: it lives behind ReplitObjectStore,
 * which is only selected when PRIVATE_OBJECT_DIR is set, and that variable does
 * not exist on Vercel. If something ever did reach it, it fails with a message
 * that names the cause instead of an opaque module-resolution error.
 */
const stubGoogleCloud = {
  name: "stub-google-cloud",
  setup(build) {
    build.onResolve({ filter: /^@google-cloud\// }, (args) => ({
      path: args.path,
      namespace: "gcs-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "gcs-stub" }, () => ({
      contents: `const unavailable = () => {
  throw new Error("Replit App Storage is unavailable on Vercel");
};
export class Storage {
  constructor() {
    unavailable();
  }
}
export class File {
  constructor() {
    unavailable();
  }
}
export default { Storage, File };
`,
      loader: "js",
    }));
  },
};

async function buildAll() {
  // The Vercel target bundles a port-less entrypoint into its own directory and
  // drops the pino transport plugin: NODE_ENV=production disables pino-pretty,
  // so no worker file needs to be emitted and the output stays a single file.
  const isVercel = process.argv.includes("--vercel");
  const distDir = path.resolve(artifactDir, isVercel ? "dist-vercel" : "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    // { in, out } (instead of a plain path) fixes the output basename at "index"
    // regardless of the entry file's own name, so the Vercel target — whose entry
    // is serverless.ts — still emits index.mjs, matching the handler name that
    // .vc-config.json hardcodes.
    entryPoints: [
      {
        in: path.resolve(artifactDir, isVercel ? "src/serverless.ts" : "src/index.ts"),
        out: "index",
      },
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // On Vercel @google-cloud/* is stubbed instead of externalized, so it must
    // not appear here: an external entry would emit an unresolvable top-level
    // import into a .func directory that has no node_modules. On Replit the
    // real package is installed and must stay external.
    external: isVercel
      ? externalPackages.filter((pkg) => pkg !== "@google-cloud/*")
      : externalPackages,
    sourcemap: "linked",
    plugins: isVercel
      ? [stubGoogleCloud]
      : [
          // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
          esbuildPluginPino({ transports: ["pino-pretty"] }),
        ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
