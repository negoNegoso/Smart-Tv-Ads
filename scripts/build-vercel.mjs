/**
 * Builds the Vercel deployment output by hand, using the Build Output API v3.
 *
 * Automatic function discovery scans the source `api/` directory, which cannot
 * work here: the API bundle only exists after the build runs. Writing
 * .vercel/output/ explicitly removes every piece of guesswork.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".vercel", "output");
const functionDir = path.join(outputDir, "functions", "api", "index.func");

function run(args) {
  execFileSync("pnpm", args, { cwd: root, stdio: "inherit" });
}

await rm(outputDir, { recursive: true, force: true });

run(["--filter", "@workspace/signage", "run", "build"]);
run(["--filter", "@workspace/api-server", "run", "build:vercel"]);

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
