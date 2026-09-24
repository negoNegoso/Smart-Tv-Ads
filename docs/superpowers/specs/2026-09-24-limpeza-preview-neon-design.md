# Limpeza automática dos branches de preview do Neon — design

Data: 2026-09-24
Branch: `ci/limpeza-preview-neon`

## Contexto

Item 1 da revisão de métricas pedia preview com banco separado da produção.
A investigação mostrou que isso **já existe**:

- O banco é Neon, ligado pela integração do Marketplace da Vercel (recurso
  `neon-copper-nest`, projeto Neon `billowing-bread-04245726`).
- A opção "Preview" da integração está ligada desde pelo menos 19/09: cada
  branch do git com deploy de preview ganha um branch do Neon
  `preview/<branch-do-git>`, criado a partir de `main` (a produção) — uma cópia
  instantânea da produção, e o que o preview grava fica só nele.
- As variáveis do branch são injetadas pelo Neon em cada deploy de preview e
  **não aparecem** em `vercel env ls`; por isso as variáveis compartilhadas
  "Preview, Production" pareciam apontar o preview para a produção.
- Se o Neon não consegue criar o branch, o deploy de preview falha antes do
  build ("Resource provisioning failed") em vez de cair na produção.

O problema real é a **limpeza**: o Neon só apaga `preview/<branch>` quando a
Vercel apaga os deploys de preview daquela branch, e a Vercel guarda previews
por 6 meses. Os branches se acumulam, o limite do plano do Neon estoura e todos
os previews passam a falhar — foi o que aconteceu em 23/09.

Limpeza única já feita (24/09, com autorização): apagados
`preview/fix/metricas-portal`, `preview/feat/pecas-verticais`,
`preview/fix/release-breaking-change` e `preview/feat/release-automatica`
(branches do git já mescladas e apagadas). Restaram `main` e
`backup-antes-empresas-2026-09-15`.

## Objetivo

Apagar o branch `preview/<branch>` do Neon assim que a branch do git deixa de
precisar de preview, para o limite do plano só estourar se houver mais PRs
abertos ao mesmo tempo do que o plano permite.

## Decisões

- Dados do preview: **cópia da produção** (padrão do Neon). Nada muda.
- Limpeza: **GitHub Action** ao fechar PR / apagar branch.
- Fora do escopo: checagem no build que recusa preview apontando para a
  produção; mudar a retenção de previews da Vercel; subir de plano no Neon.

## Workflow `.github/workflows/neon-preview-cleanup.yml`

### Gatilhos

- `pull_request` com `types: [closed]` — mesclado ou não. Branch alvo:
  `github.event.pull_request.head.ref`.
- `delete` — branch apagada no GitHub sem PR. Só quando
  `github.event.ref_type == 'branch'`. Branch alvo: `github.event.ref`.

Os dois podem disparar para a mesma branch (PR mesclado e branch apagada em
seguida); o segundo não acha o branch e segue sem falhar (ver abaixo).

### Proteções

- Nunca roda para `main`: condição `if` no job descarta branch alvo `main`.
- O nome enviado ao Neon é sempre `preview/<branch alvo>`. Branches do Neon
  sem esse prefixo (`main`, `backup-*`) ficam fora do alcance.
- PR vindo de fork não recebe secrets no GitHub; o job é pulado quando
  `github.event.pull_request.head.repo.full_name != github.repository`.
- A action é composta e monta `neonctl branches delete "<branch>"` num passo
  de bash: dentro das aspas, `$`, `` ` `` e `"` ainda são interpretados. O
  `if` do job recusa branch com qualquer um dos três (o git já proíbe espaço e
  `\`). Sem isso, um nome de branch montado de propósito rodaria comandos com
  a chave do Neon, que pode apagar a `main`.
- `timeout-minutes: 5` no job: sem a chave, a CLI do Neon pode cair no login
  pelo navegador e prender o runner até o limite padrão de 6 horas.

### Passo

`neondatabase/delete-branch-action@v3` com:

- `project_id: ${{ vars.NEON_PROJECT_ID }}`
- `api_key: ${{ secrets.NEON_API_KEY }}`
- `branch: preview/<branch alvo>`

`continue-on-error: true`: a documentação da action não diz o que acontece com
branch inexistente (branch sem preview, ou já apagado pela Vercel/pelo outro
gatilho). A limpeza nunca deixa PR ou branch com ✗ vermelho; o log mostra o
resultado.

### Permissões

`permissions: {}` — o workflow não usa o `GITHUB_TOKEN`.

## Configuração manual (dono do projeto)

No GitHub, Settings → Secrets and variables → Actions:

- Secret `NEON_API_KEY`: chave criada no Neon (Account settings → API keys).
- Variável `NEON_PROJECT_ID` = `billowing-bread-04245726`.

## Verificação

Sem teste automatizado possível para um workflow de GitHub. Prova com ciclo
real, depois dos secrets configurados:

1. Abrir um PR pequeno (pode ser o próprio PR deste workflow).
2. Esperar o preview ficar pronto e conferir que `preview/<branch>` existe:
   `neon branches list --project-id billowing-bread-04245726`.
3. Mesclar ou fechar o PR.
4. Conferir que o workflow rodou verde e que `preview/<branch>` sumiu.

## Riscos

- **Secrets não configurados**: a action falha, `continue-on-error` esconde a
  falha e os branches voltam a acumular em silêncio. Mitigação: a verificação
  acima é obrigatória antes de dar o item por encerrado.
- **Preview antigo de PR mesclado fica sem banco** e passa a dar erro. Aceito:
  esse preview não serve mais.
- **Branch do git reaberta com o mesmo nome** depois da limpeza: o próximo
  preview recria `preview/<branch>` a partir da produção. Comportamento
  desejado.

## Versão

PR `ci(preview): apaga o branch do Neon quando o PR fecha` → patch. Não muda nada que roda nas TVs ou na API.
