# Marca Smart Vale TV

Mestres do logo. Tudo o que mostra a marca deriva destes arquivos.

| Arquivo | Uso |
|---|---|
| `logo.svg` | logo horizontal; partes brancas pedem fundo escuro |
| `logo-mark.svg` | só o ícone (favicon, ícone do app, espaços pequenos) |

## Paleta

| Cor | Hex | Uso |
|---|---|---|
| Preto | `#000000` | fundo |
| Branco | `#FFFFFF` | texto, "smart" e "tv" do logo |
| Teal | `#28D8B3` | marca, botões, destaques; texto sobre teal é preto |
| Teal escuro | `#0B7A66` | teal sobre papel branco (impressão) |
| Cartão | `#0E0F10` | superfícies |
| Borda | `#24272A` | bordas |
| Texto secundário | `#9AA3A8` | legendas |

## Regras

- Respiro mínimo em volta do logo: a altura da letra "s".
- Tamanho mínimo: logo horizontal com 24 px de altura; abaixo disso, use o ícone.
- Fonte do logo: Outfit 800, já convertida em path (não depende de fonte instalada).
- A moldura da TV é um contorno preenchido com furo desenhado no sentido
  contrário: assim o buraco aparece tanto com `nonzero` quanto com `evenodd`,
  inclusive no Android anterior ao 7, que ignora `fillType`.

## Cópias dos paths (atualize todas juntas)

- `artifacts/signage/src/components/brand/logo-paths.ts` (componente `<Logo>`)
- `artifacts/signage/public/tv.html` e `public/apk.html` (SVG inline, ES5)
- `artifacts/android-tv/app/src/main/res/drawable/ic_launcher.xml` e `banner.xml`
- `marketing/gerar.mjs` lê `brand/logo.svg` direto

Os testes `logo.test.tsx` e `identidade-visual.test.ts` falham se uma cópia
se desencontrar do mestre.
