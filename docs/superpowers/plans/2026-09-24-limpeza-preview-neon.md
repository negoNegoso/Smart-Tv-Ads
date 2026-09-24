# Limpeza automática dos branches de preview do Neon — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um workflow do GitHub apaga o branch `preview/<branch>` do Neon quando o PR fecha ou a branch é apagada.

**Architecture:** Um arquivo, `.github/workflows/neon-preview-cleanup.yml`, disparado por `pull_request: closed` e `delete`, chamando `neondatabase/delete-branch-action@v3`. Sem código de aplicação. A verificação é um checador de contrato descartável (fora do repo) + `actionlint`, e depois um ciclo real de PR.

**Tech Stack:** GitHub Actions, `neondatabase/delete-branch-action@v3`, `actionlint` (imagem Docker `rhysd/actionlint`), Node + pacote `yaml` (já instalado em `artifacts/api-server`) para o checador.

**Spec:** `docs/superpowers/specs/2026-09-24-limpeza-preview-neon-design.md`

## Global Constraints

- Projeto Neon: `billowing-bread-04245726`. Prefixo dos branches de preview: `preview/`.
- Action: `neondatabase/delete-branch-action@v3`, entradas `project_id: ${{ vars.NEON_PROJECT_ID }}`, `api_key: ${{ secrets.NEON_API_KEY }}`, `branch: preview/<branch alvo>`.
- `permissions: {}`; `continue-on-error: true` no passo; nunca para `main`; pula PR de fork; nome da branch nunca em `run:`.
- Comentários em português explicando o porquê; acentos UTF-8 reais.
- Commits e PR: `tipo(escopo): descrição` em português; PR `ci(preview): apaga o branch do Neon quando o PR fecha`; commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch de trabalho: `ci/limpeza-preview-neon` (já existe, com o spec).
- Nunca criar, ver ou imprimir o `NEON_API_KEY`: o dono do projeto cadastra no GitHub.

## Review Focus

1. **Secrets ausentes ou errados**: a action falha e o `continue-on-error` deixa verde — a limpeza para em silêncio. Pego no Task 2, Step 4, lendo o log do passo (não só a cor do run).
2. **Branch do git com barra** (`feat/x`): o nome no Neon é `preview/feat/x`; o workflow tem de mandar exatamente isso. Pego no Task 2 usando uma branch de verificação com barra.
3. **Tag apagada** (evento `delete` com `ref_type: tag`): não pode apagar nada. Pego no checador do Task 1 (condição `ref_type == 'branch'`).
4. **PR vindo de fork**: sem secrets, o job é pulado. Pego no checador do Task 1.
5. **`main`** fechando PR (ex.: PR de `main` para outra base) ou apagada: nunca vira `preview/main`. Pego no checador do Task 1.

---

### Task 1: Workflow de limpeza

**Files:**
- Create: `.github/workflows/neon-preview-cleanup.yml`
- Create (descartável, fora do repo): `<workspace do plano>/check-workflow.mjs` — `<workspace do plano>` é o que `sdd-workspace` imprime (git-ignored)

**Interfaces:**
- Produces: workflow `Limpeza do preview no Neon`, job `apagar-branch-neon`, que o Task 2 observa na aba Actions.

- [ ] **Step 1: Checador de contrato (o "teste" do workflow)**

Criar `<workspace do plano>/check-workflow.mjs`:

```js
// Descartável: confere o contrato do spec no workflow. Uso:
//   node check-workflow.mjs <caminho do yml>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/Users/yvillanova/Downloads/tv/Smart-Tv-Ads/artifacts/api-server/package.json");
const YAML = require("yaml");

const file = process.argv[2];
let doc;
try {
  doc = YAML.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`FALHA: não li ${file}: ${e.message}`);
  process.exit(1);
}
const erros = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };

ok(JSON.stringify(doc.on?.pull_request?.types) === '["closed"]', "gatilho pull_request: types [closed]");
ok(doc.on && "delete" in doc.on, "gatilho delete");
ok(doc.permissions && Object.keys(doc.permissions).length === 0, "permissions: {}");

const job = doc.jobs?.["apagar-branch-neon"];
ok(job, "job apagar-branch-neon");
const cond = String(job?.if ?? "");
ok(cond.includes("github.event.pull_request.head.repo.full_name == github.repository"), "pula PR de fork");
ok(cond.includes("github.event.ref_type == 'branch'"), "delete só para branch (não tag)");
ok(cond.includes("github.event.pull_request.head.ref != 'main'"), "PR: nunca main");
ok(cond.includes("github.event.ref != 'main'"), "delete: nunca main");

const steps = job?.steps ?? [];
const passo = steps.find((s) => String(s.uses ?? "").startsWith("neondatabase/delete-branch-action"));
ok(passo, "passo com neondatabase/delete-branch-action");
ok(passo?.uses === "neondatabase/delete-branch-action@v3", "action @v3");
ok(passo?.["continue-on-error"] === true, "continue-on-error: true");
ok(passo?.with?.project_id === "${{ vars.NEON_PROJECT_ID }}", "project_id da variável NEON_PROJECT_ID");
ok(passo?.with?.api_key === "${{ secrets.NEON_API_KEY }}", "api_key do secret NEON_API_KEY");
ok(String(passo?.with?.branch ?? "").startsWith("preview/${{"), "branch sempre com prefixo preview/");
ok(steps.every((s) => !String(s.run ?? "").includes("github.event")), "nome da branch nunca em run:");

if (erros.length) {
  console.error("FALHA:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("OK: contrato do spec atendido");
```

- [ ] **Step 2: Rodar o checador sem o workflow**

Run: `node <workspace do plano>/check-workflow.mjs .github/workflows/neon-preview-cleanup.yml`
Expected: `FALHA: não li .github/workflows/neon-preview-cleanup.yml: ENOENT...` e código de saída 1.

- [ ] **Step 3: Criar o workflow**

Criar `.github/workflows/neon-preview-cleanup.yml`:

```yaml
name: Limpeza do preview no Neon

# Cada branch do git com deploy de preview ganha no Neon um branch
# `preview/<branch>`, cópia da produção. O Neon só apaga esse branch quando a
# Vercel apaga os deploys de preview (6 meses por padrão): eles se acumulam, o
# limite do plano estoura e todo preview passa a falhar com "Resource
# provisioning failed" (23/09). Aqui o branch sai assim que a branch do git
# deixa de precisar de preview.
on:
  pull_request:
    types: [closed]
  delete:

# O workflow não usa o GITHUB_TOKEN.
permissions: {}

jobs:
  apagar-branch-neon:
    runs-on: ubuntu-24.04
    # Nunca a main. No delete, só branch (tag apagada não tem preview). PR de
    # fork não recebe secrets do repositório: nem tenta.
    if: >-
      (github.event_name == 'pull_request'
        && github.event.pull_request.head.repo.full_name == github.repository
        && github.event.pull_request.head.ref != 'main')
      || (github.event_name == 'delete'
        && github.event.ref_type == 'branch'
        && github.event.ref != 'main')
    steps:
      - name: Apagar preview/<branch> no Neon
        # A action não documenta o que faz com branch inexistente (branch sem
        # preview, ou já apagado pelo outro gatilho — PR mesclado e branch
        # apagada em seguida disparam os dois). A limpeza nunca deixa PR ou
        # branch com X vermelho; o resultado fica no log deste passo.
        continue-on-error: true
        uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          api_key: ${{ secrets.NEON_API_KEY }}
          # Sempre com o prefixo: branches do Neon sem ele (main, backup-*)
          # ficam fora de alcance. O nome só entra aqui, nunca em `run:`.
          branch: preview/${{ github.event_name == 'pull_request' && github.event.pull_request.head.ref || github.event.ref }}
```

- [ ] **Step 4: Rodar o checador e o actionlint**

Run: `node <workspace do plano>/check-workflow.mjs .github/workflows/neon-preview-cleanup.yml`
Expected: `OK: contrato do spec atendido`

Run: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest .github/workflows/neon-preview-cleanup.yml`
Expected: nenhuma saída e código 0. (Se o actionlint reclamar de `vars.NEON_PROJECT_ID` por não conhecer a variável, é aviso de configuração, não erro de sintaxe: registrar como ruling e seguir.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/neon-preview-cleanup.yml
git commit -m "ci(preview): apaga o branch do Neon quando o PR fecha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: PR, configuração e ciclo real de verificação

**Files:** nenhum.

**Interfaces:**
- Consumes: workflow do Task 1; secret `NEON_API_KEY` e variável `NEON_PROJECT_ID` cadastrados pelo dono do projeto.

- [ ] **Step 1: Push e PR**

```bash
git push -u origin ci/limpeza-preview-neon
gh pr create --base main --title "ci(preview): apaga o branch do Neon quando o PR fecha" --body "<corpo>"
```

Corpo: contexto do spec (separação já existe; problema é a limpeza; limpeza única feita), o que o workflow faz e protege, a configuração manual, e o rodapé `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Nenhuma linha começando com a expressão de quebra de compatibilidade.

- [ ] **Step 2: Pedir a configuração ao dono do projeto (parada obrigatória)**

Pedir, e esperar confirmação, antes do Step 3:
- GitHub → Settings → Secrets and variables → Actions → **Secrets** → `NEON_API_KEY` (chave criada no Neon, Account settings → API keys).
- Mesma tela → **Variables** → `NEON_PROJECT_ID` = `billowing-bread-04245726`.

Conferir que a variável existe (não mostra segredo):

Run: `gh variable list | grep NEON_PROJECT_ID && gh secret list | grep NEON_API_KEY`
Expected: as duas linhas aparecem (o `secret list` mostra só o nome e a data).

- [ ] **Step 3: Branch de verificação com barra no nome**

A branch do PR (`ci/limpeza-preview-neon`) já tem barra. Esperar o preview dela ficar pronto e conferir o branch no Neon:

Run: `npx -y neon@latest branches list --project-id billowing-bread-04245726 -o json | python3 -c "import json,sys; d=json.load(sys.stdin); print([b['name'] for b in (d if isinstance(d,list) else d['branches'])])"`
Expected: a lista contém `preview/ci/limpeza-preview-neon`.

(Se o preview falhar com "Resource provisioning failed", o limite estourou de novo: parar e reportar.)

- [ ] **Step 4: Mesclar e conferir a limpeza**

O merge é do dono do projeto (merge commit, `gh pr merge --merge`) — pedir e esperar. Depois:

Run: `gh run list --workflow neon-preview-cleanup.yml --limit 2`
Expected: runs de `pull_request` e `delete` concluídos.

Run: `gh run view <id do run de pull_request> --log | grep -iE "delet|error|not found" | head`
Expected: log do passo mostra o branch apagado, **sem** erro de autenticação. Erro de `401/unauthorized` ou `project not found` = secret/variável errados, mesmo com o run verde.

Run: o mesmo `branches list` do Step 3.
Expected: `preview/ci/limpeza-preview-neon` não aparece mais; `main` e `backup-antes-empresas-2026-09-15` continuam.
