/**
 * Builds the Vercel deployment output by hand, using the Build Output API v3.
 *
 * Automatic function discovery scans the source `api/` directory, which cannot
 * work here: the API bundle only exists after the build runs. Writing
 * .vercel/output/ explicitly removes every piece of guesswork.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".vercel", "output");
const functionDir = path.join(outputDir, "functions", "api", "index.func");

function run(args) {
  execFileSync("pnpm", args, { cwd: root, stdio: "inherit" });
}

await rm(outputDir, { recursive: true, force: true });

// Aplica migrações versionadas do banco antes de construir a aplicação.
// migrate.mjs pula silenciosamente se não houver URL de banco no ambiente
// (ex.: builds de preview sem banco) e falha o build se uma migração quebrar.
run(["--filter", "db", "run", "migrate"]);

run(["--filter", "@workspace/signage", "run", "build"]);
run(["--filter", "@workspace/api-server", "run", "build:vercel"]);

/**
 * The Build Output API performs no dependency tracing: the .func directory is
 * the whole lambda filesystem and contains no node_modules. Any top-level
 * import of a bare specifier that is not a Node builtin therefore throws
 * ERR_MODULE_NOT_FOUND on every cold start, before a single route runs. Fail
 * the build here instead of discovering it in production.
 */
const bundlePath = path.join(root, "artifacts/api-server/dist-vercel/index.mjs");
const bundle = await readFile(bundlePath, "utf8");
const unresolvable = [
  ...bundle.matchAll(/^import[^;]*?from\s+"([^".][^"]*)"/gm),
]
  .map((match) => match[1])
  .filter((specifier) => !specifier.startsWith("node:") && !isBuiltin(specifier));
if (unresolvable.length > 0) {
  throw new Error(
    `Vercel bundle has unresolvable top-level imports: ${[...new Set(unresolvable)].join(", ")}`,
  );
}

await mkdir(outputDir, { recursive: true });
await cp(path.join(root, "artifacts/signage/dist/public"), path.join(outputDir, "static"), {
  recursive: true,
});

await mkdir(functionDir, { recursive: true });
await cp(path.join(root, "artifacts/api-server/dist-vercel"), functionDir, { recursive: true });
await writeFile(
  path.join(functionDir, ".vc-config.json"),
  `${JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: true,
      // The bundle ships index.mjs.map anyway; without this the runtime never
      // loads it and the bytes are dead weight. A readable stack trace is worth
      // the size on a first production deployment.
      shouldAddSourcemapSupport: true,
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  path.join(outputDir, "config.json"),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/api/(.*)", dest: "/api" },
        { src: "/r/(.*)", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log("Build output written to .vercel/output");
