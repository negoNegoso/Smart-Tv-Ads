import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpFor, latestVersion, nextVersion } from "./next-version.mjs";

test("feat sobe minor", () => {
  assert.equal(bumpFor("feat(tv): gatilho de tela cheia", ""), "minor");
});

test("fix, docs, ci e título livre sobem patch", () => {
  assert.equal(bumpFor("fix(api): 409 com o erro real", ""), "patch");
  assert.equal(bumpFor("docs(spec): pareamento", ""), "patch");
  assert.equal(bumpFor("ci(android-tv): pipeline", ""), "patch");
  assert.equal(bumpFor("Ajusta a landing", ""), "patch");
});

test("! depois do tipo ou BREAKING CHANGE no corpo sobem major", () => {
  assert.equal(bumpFor("feat(api)!: remove rota antiga", ""), "major");
  assert.equal(bumpFor("refactor!: novo formato", ""), "major");
  assert.equal(bumpFor("fix(db): troca coluna", "BREAKING CHANGE: key muda"), "major");
});

test("nextVersion zera as posições abaixo da que sobe", () => {
  assert.equal(nextVersion("1.4.2", "patch"), "1.4.3");
  assert.equal(nextVersion("1.4.2", "minor"), "1.5.0");
  assert.equal(nextVersion("1.4.2", "major"), "2.0.0");
});

test("latestVersion pega a maior tag vX.Y.Z e ignora as outras", () => {
  const tags = ["v1.2.0", "v1.10.0", "v1.9.3", "android-tv-v1.0.1-rc1", "v2.0.0-rc1", "lixo"];
  assert.equal(latestVersion(tags), "1.10.0");
});

test("sem tag de versão parte de 1.0.0", () => {
  assert.equal(latestVersion([]), "1.0.0");
  assert.equal(latestVersion(["android-tv-v1.0.1-rc1"]), "1.0.0");
});
