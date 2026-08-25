# Tradução da interface para português (pt-BR)

Data: 2026-08-25

## Objetivo

Traduzir todos os textos visíveis ao usuário do painel Smart TV Ads para
português do Brasil, deixando a experiência amigável para operadores e clientes
que falam português. A tradução é feita por substituição direta das strings
(sem biblioteca de i18n), pois não há necessidade de alternância de idiomas.

## Escopo

Traduzir tudo que o usuário vê: dashboard de administração, tela de exibição da
TV e títulos/metadados de página.

### Arquivos que precisam de tradução (atualmente em inglês)

- `artifacts/signage/src/components/layout.tsx` — labels de navegação e marca
- `artifacts/signage/src/pages/clients.tsx` — página de clientes + validação Zod
- `artifacts/signage/src/pages/client-detail.tsx` — detalhe do cliente / dispositivos
- `artifacts/signage/src/pages/device-detail.tsx` — detalhe do dispositivo / playlist
- `artifacts/signage/src/pages/admin.tsx` — biblioteca de mídia / anúncios
- `artifacts/signage/src/pages/analytics.tsx` — página de análises
- `artifacts/signage/src/pages/display.tsx` — estados vazios da exibição (React)
- `artifacts/signage/src/pages/not-found.tsx` — página 404
- `artifacts/signage/index.html` — meta descrições e Open Graph
- `artifacts/signage/public/tv.html` — apenas `<title>Display</title>`

### Arquivos já em português (não alterar, exceto ajuste de marca)

- `artifacts/signage/src/pages/advertisers.tsx` — o `<h1>Advertisers</h1>` será
  traduzido para "Anunciantes" para consistência (restante já em pt-BR)
- `artifacts/signage/src/pages/advertiser-detail.tsx` — o botão "Advertisers"
  vira "Anunciantes"

## O que traduzir em cada arquivo

- Títulos de página, subtítulos e cabeçalhos de seção
- Labels e itens de navegação
- Textos de botões e links
- Labels, placeholders e textos de ajuda de formulários
- Mensagens de validação (schemas Zod)
- Toasts de sucesso e erro
- Cabeçalhos de tabela e estados vazios
- Estados de carregamento ("Loading...", skeletons com texto)
- Atributos de acessibilidade: `aria-label`, `sr-only`, `alt`
- `<title>` e meta tags (`description`, `og:*`, `twitter:*`)

## O que NÃO alterar

- Nomes de rotas e URLs (`/clients`, `/devices`, `/api/...`)
- Chaves de objetos, nomes de variáveis, tipos e demais código
- Valores enviados/recebidos da API
- Formatações já existentes (`pt-BR`, `BRL`)

## Marca do produto

A marca no cabeçalho (`layout.tsx`), hoje "SignageOS", passa a ser
**"Painel de Anúncios"**, ficando consistente com o `<title>` da aba do
navegador definido em `index.html`.

## Glossário (consistência de termos)

| Inglês | Português |
|---|---|
| Clients | Clientes |
| Client | Cliente |
| Devices | Dispositivos / TVs |
| Device | Dispositivo / TV |
| Media Library | Biblioteca de Mídia |
| Analytics | Análises |
| Advertisers | Anunciantes |
| Announcement(s) | Anúncio(s) |
| Playlist | Playlist |
| Impressions | Impressões |
| Display Time | Tempo de exibição |
| Add | Adicionar |
| New | Novo / Nova |
| Create | Criar / Cadastrar |
| Delete | Excluir |
| Back to clients | Voltar para clientes |
| Loading... | Carregando... |
| Summary | Resumo |
| Total | Total |
| Location | Local |
| Name | Nome |

## Validação

Rodar o build do pacote `signage` para garantir que nenhuma string quebrou JSX
ou tipos:

```
pnpm --filter signage build
```

(ou o script de build equivalente do workspace). Ajustar qualquer erro
introduzido pela tradução.

## Fora de escopo

- Mensagens de erro/resposta do backend (API) — permanecem como estão
- Introdução de biblioteca de i18n ou alternância de idiomas
- Qualquer refatoração não relacionada à tradução
