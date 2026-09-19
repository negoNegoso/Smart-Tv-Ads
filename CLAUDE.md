# Smart TV Ads — regras do projeto

Monorepo pnpm: web (`artifacts/signage`), API (`artifacts/api-server`), banco
(`lib/db`), app Android da TV (`artifacts/android-tv`). Deploy do web pela
integração da Vercel a cada merge na `main`.

## Branches e PRs

- Todo trabalho em branch própria (`feat/<tema>`, `fix/<tema>`, …), nunca
  commit direto na `main`.
- Entra na `main` só por PR, com **merge commit** (`gh pr merge --merge`).
- Branch mesclada pode ser apagada (local e remota).

## Títulos de commit e de PR (obrigatório)

Formato: `tipo(escopo): descrição curta em português`, no imperativo/presente,
sem ponto final. Ex.: `feat(tv): pareamento por QR code`,
`fix(api): 409 com o erro real do drizzle`.

Tipos usados: `feat`, `fix`, `docs`, `test`, `refactor`, `ci`, `build`,
`perf`, `chore`. Escopos comuns: `tv`, `api`, `portal`, `promo`, `db`,
`android-tv`, `release`, `spec`, `plano`.

**O título do PR decide a versão da release** (ver abaixo), então escolha o
tipo pelo efeito para quem usa o sistema:

| Título do PR | Versão sobe | Ex. a partir de 1.4.2 |
|---|---|---|
| `feat(...)` — funcionalidade nova | minor | 1.5.0 |
| `fix`, `docs`, `test`, `refactor`, `ci`, `build`, `perf`, `chore`, ou título fora do padrão | patch | 1.4.3 |
| `!` depois do tipo/escopo (`feat(api)!: ...`) ou `BREAKING CHANGE` no corpo do PR — quebra compatibilidade (TVs instaladas, API pública, formato de dados) | major | 2.0.0 |

Um PR com vários commits: o título do PR resume o todo e usa o tipo de maior
efeito (tem `feat` dentro → PR é `feat`).

## Releases (automáticas)

- `.github/workflows/release.yml`: todo merge na `main` roda os testes e cria a
  release `vX.Y.Z` no GitHub com `signage-tv-X.Y.Z.apk` (assinado) e
  `signage-web-X.Y.Z.zip` anexados. PR roda só os testes.
- A versão vem de `scripts/release/next-version.mjs`: última tag `vX.Y.Z` +
  título do PR mesclado. Sem tag, base `1.0.0`.
- **Nunca** criar tag `vX.Y.Z` à mão nem editar `versionName`/`versionCode` no
  Gradle: a pipeline passa `-PversionName` e o `versionCode` sai de
  major×1000000 + minor×1000 + patch.
- Tags fora do padrão `vX.Y.Z` (ex.: `android-tv-v1.0.1-rc1`) são ignoradas no
  cálculo.
- Assinatura do APK: secrets `SIGNAGE_KEYSTORE_BASE64`, `SIGNAGE_KEYSTORE_PASS`,
  `SIGNAGE_KEY_ALIAS`, `SIGNAGE_KEY_PASS`. O keystore é do dono do projeto;
  nunca commitar `.jks`/senhas.

## Commits

- Mensagem: título no formato acima; corpo (opcional) explica o porquê.
- Código e comentários em português, explicando o porquê.
- Acentos como caracteres UTF-8 reais, nunca escapes `\uXXXX`.
