# Importador de perfil do Instagram — design

Data: 2026-09-30
Branch: `feat/importador-instagram`

## Objetivo

Cadastrar um anunciante novo hoje é manual: criar a empresa, criar a campanha,
baixar as artes que o lojista já publicou e subir uma por uma. O objetivo é um
agente que recebe a URL do perfil do Instagram da empresa e entrega tudo
pronto para revisão: empresa cadastrada, campanha criada e as peças (fotos e
reels) dentro dela.

Quem usa: o admin da plataforma, pelo Claude Code, na própria máquina.

Sucesso = com um comando e a URL do perfil, o admin escolhe os posts, e ao fim
existe uma campanha **pausada** da empresa certa com uma peça por mídia
escolhida, na melhor resolução disponível. Rodar de novo no mesmo perfil não
duplica empresa, campanha nem peça.

Premissa de uso: só perfis de empresas que autorizaram exibir o conteúdo nas
TVs.

## Decisões

| Tema | Decisão |
|---|---|
| Forma | Skill do Claude Code (`/importar-instagram <url>`) orquestrando um script local |
| Download | `gallery-dl` com cookies do Chrome, de uma conta do Instagram separada |
| Imagens | Peça `image` pelo fluxo de upload que já existe |
| Reels | Sobem no YouTube como não listado e entram como peça `youtube_video` |
| Envio ao YouTube | Automático, YouTube Data API com OAuth do canal da plataforma |
| Volume | Últimos N posts (padrão 12); o admin escolhe antes de baixar |
| Empresa | Identificada pelo @ em nova coluna `companies.instagram`; sem @, nome parecido com confirmação |
| Campanha | Nasce pausada, hoje + 30 dias, contrato 0, alvo padrão |
| Som | Peça de reel entra `muted` |
| Acesso à plataforma | Script chama a API HTTP como admin, não o banco |

Descartadas: botão no painel admin (raspagem a partir da Vercel é bloqueada e o
corpo da requisição trava em 4,5 MB), `instaloader` (bloqueio mais rápido,
sessão em arquivo), serviço pago de raspagem (custo; a fonte fica atrás de uma
interface, dá para trocar depois), vídeo nativo na TV (projeto à parte).

## 1. Mudanças na plataforma

**Migration `0016`:**

- `companies.instagram text`, nulo por padrão, índice único. Guarda o @
  normalizado: minúsculas, sem `@`, sem URL.
- `announcements.external_ref text`, nulo por padrão, índice único. Formato
  `instagram:<código-do-post>:<n>`, com `n` a posição da mídia no post
  (1 para post simples). É o que impede peça duplicada.

**API:**

- `lib/companies/input.ts`: campo `instagram` em criar e editar, normalizado
  pela mesma função do script (aceita `@nome`, `nome` ou URL do perfil). @ já
  usado por outra empresa responde `409` pelo `CompanyConflictError` existente.
- `GET /companies?instagram=<handle>`: filtro exato.
- `POST /announcements`: aceita `externalRef` opcional. Valor repetido responde
  `409 { error: "Peça já importada", id }` com o id da peça existente.
- `GET /announcements`: devolve `externalRef`, para o `listar` marcar o que já
  entrou.
- `POST /campaigns`: aceita `isActive` opcional, padrão `true`. O importador
  manda `false`, e a campanha nunca chega a ir ao ar sem revisão.
- `lib/api-spec/openapi.yaml` e os tipos gerados acompanham os campos novos.

**Painel:** campo "Instagram" no cadastro da empresa. Nada mais muda na tela.

**TV:** sem mudança. Peça importada é `image` ou `youtube_video`, tipos que o
player web e o app Android já tocam.

## 2. Script local

Tudo em `scripts/src/instagram/`. Quatro unidades com uma função cada,
ligadas por interfaces para o executor ser testado sem rede.

**`perfil.ts` — fonte Instagram.** Roda `gallery-dl` e traduz a saída.

```ts
interface FonteInstagram {
  lerPerfil(handle: string, limite: number): Promise<Perfil>;
  baixar(midia: Midia, destino: string): Promise<string>; // caminho do arquivo
}
type Perfil = { handle: string; nome: string; bio: string; site: string | null; posts: Post[] };
type Post = { codigo: string; data: string; legenda: string; url: string; midias: Midia[] };
type Midia = { n: number; tipo: "imagem" | "video"; largura: number; altura: number; url: string };
```

`lerPerfil` pede só metadados. `baixar` pega o arquivo original, sem
recompressão. Orientação da peça: `altura > largura` → `portrait`; senão
`landscape`. Quadrado vale `landscape`, para tocar na maioria das TVs.

**`youtube.ts` — envio ao YouTube.**

```ts
interface EnvioYouTube {
  subir(arquivo: string, titulo: string): Promise<string>; // videoId
}
```

Upload retomável, privacidade `unlisted`, título `@handle · AAAA-MM-DD`.
Erro de cota vira `CotaYouTubeEsgotada`, tratado pelo executor.

**`plataforma.ts` — cliente da API.** `POST /auth/login` com usuário e senha do
admin, guarda o cookie de sessão, e expõe: buscar/criar empresa, listar/criar
campanha, criar peça de imagem (multipart), criar peça YouTube, vincular peças
à campanha (lê as peças atuais da campanha e acrescenta, sem remover nenhuma).

**`importar.ts` — CLI.**

- `listar <url> [--limite 12]`: só leitura. Imprime JSON com perfil, posts,
  empresa encontrada (por @) ou candidatas por nome, campanhas do anunciante, e
  para cada mídia se o `externalRef` já existe.
- `importar --plano <arquivo>`: executa o plano item a item e grava o status de
  volta no mesmo arquivo.

**Plano** (`.instagram-import/<handle>/plano.json`, fora do git):

```json
{
  "handle": "padariacentral",
  "empresa": { "id": 12 },
  "campanha": { "id": null, "criar": { "nome": "Instagram @padariacentral" } },
  "itens": [
    { "ref": "instagram:DAbc123:1", "tipo": "imagem", "status": "pendente" },
    { "ref": "instagram:DXyz789:1", "tipo": "video", "status": "pendente", "videoId": null }
  ]
}
```

`empresa` e `campanha` aceitam `{ "id": n }` (usar existente) ou
`{ "criar": {...} }`. Depois de criar, o executor grava o `id` no plano. Status
do item: `pendente`, `criada`, `pulada`, `falha` (com `erro`).

**Mapeamento:**

| Instagram | Plataforma |
|---|---|
| Nome do perfil | `companies.name` |
| Bio | `companies.notes` |
| @ | `companies.instagram` |
| — | empresa nasce `isAdvertiser: true`, `isClient: false`, sem segmento |
| Post de imagem | 1 peça `image` |
| Carrossel | 1 peça por item |
| Reel ou vídeo de carrossel | YouTube não listado → peça `youtube_video`, `playbackMode: "natural"`, `audioMode: "muted"` |
| Data + posição | título `@handle · AAAA-MM-DD · n` |
| Legenda | não vai para a tela (`showText: false`) |
| Link do post | `destinationUrl` da peça na campanha (QR) |

Imagem dura 10 s (padrão da plataforma).

**Credenciais** em `.env.local` (já fora do git): `PLATAFORMA_URL`,
`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `YOUTUBE_CLIENT_ID`,
`YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`. Um comando
`importar youtube-login` faz o fluxo OAuth uma vez e imprime o refresh token.

`.instagram-import/` entra no `.gitignore`.

## 3. Skill

`.claude/skills/importar-instagram/SKILL.md`. Passos:

1. Normaliza a URL e roda `listar`.
2. Mostra tabela dos posts: data, tipo, formato, início da legenda, já
   importado. Pergunta quais entram.
3. Empresa: achou por @, usa. Senão, havendo candidata por nome, pergunta se é
   a mesma; confirmada, grava o @ nela. Sem candidata, marca para criar.
4. Campanha: sem campanha do anunciante, marca para criar. Havendo, pergunta
   qual usar ou se cria nova.
5. Grava o plano, mostra o resumo e pede confirmação.
6. Roda `importar --plano`.
7. Relata: criadas, puladas, pendentes, falhas, e o link da campanha no painel.

A skill não escreve na plataforma por conta própria: toda escrita passa pelo
`importar`, a partir de um plano confirmado.

## 4. Erros

| Situação | Comportamento |
|---|---|
| `gallery-dl` ausente | para com a instrução de instalação |
| Sessão do Instagram expirada ou perfil privado | para antes de qualquer escrita; pede login no Chrome com a conta separada |
| Instagram limita as requisições | para; o que já baixou fica; nova execução continua |
| Login admin recusado | para antes de qualquer escrita |
| Cota do YouTube esgotada | imagens seguem; vídeos restantes ficam `pendente`; rodar `importar` outro dia retoma |
| Vídeo subiu, peça falhou | `videoId` fica no plano; nova execução reaproveita, sem subir de novo |
| Imagem acima do limite de upload | recomprime em JPEG de qualidade alta com `ffmpeg` até caber; anota no relatório |
| `409` de `externalRef` | item `pulada` |
| Falha em um item | item `falha` com a mensagem; os outros seguem |

Empresa e campanha são criadas antes das peças e gravadas no plano na hora, de
modo que uma execução interrompida nunca cria a segunda empresa ou campanha.

## 5. Testes

Scripts ganham `vitest` (hoje só a API tem). Sem teste automático contra
Instagram e YouTube reais.

| Alvo | Prova |
|---|---|
| Normalização do @ | URL com barra final, query e maiúsculas → handle; URL que não é perfil → erro |
| Leitura da saída do `gallery-dl` | foto, carrossel e reel viram `Post[]` certo; orientação por largura × altura (fixtures JSON) |
| Montagem do plano | `externalRef` estável entre execuções; item já importado sai marcado |
| Executor | retoma `pendente`; reaproveita `videoId`; falha de um item não derruba o resto; cota esgotada deixa vídeos pendentes; empresa/campanha criadas uma vez só (fonte, YouTube e plataforma falsos) |
| `companies.instagram` | cria, filtra por @, @ repetido → 409 |
| `announcements.externalRef` | segundo `POST` igual → 409 com o id |
| `POST /campaigns` | `isActive: false` nasce fora do ar; sem o campo, nasce ativa |

Verificação manual no fim: um perfil autorizado, 1 foto + 1 reel; conferir
empresa, campanha pausada, as duas peças no painel, e segunda execução sem
duplicar nada.

## Fora do escopo

- Vídeo nativo na TV.
- Peça vertical em TV horizontal.
- Foto de perfil como logo da empresa.
- Stories e destaques.
- Botão no painel admin.
- Sincronização periódica de posts novos.
- Preenchimento automático de segmento, endereço, telefone e e-mail.

## Pré-requisitos do admin (uma vez)

- `brew install gallery-dl`.
- Conta do Instagram separada, logada no Chrome. Raspagem automatizada viola
  os termos do Instagram e a conta usada pode ser limitada; não usar a conta
  pessoal nem a da plataforma.
- Projeto no Google Cloud com YouTube Data API v3 e credencial OAuth do canal
  da plataforma. Cota padrão: cerca de 6 envios por dia.
