# Peças inline no modo de edição da campanha

Data: 2026-08-29

## Problema

Na página de detalhe da campanha (`artifacts/signage/src/pages/campaign-detail.tsx`),
ao entrar em edição o card **Peças / anúncios** troca as linhas ricas da visualização
(miniatura do QR, título, exibições/scans, ações) por uma lista de checkboxes crua com
um input de URL abaixo de cada item marcado. A experiência fica inconsistente com a
visualização e o usuário quer editar "no lugar", mantendo o mesmo visual.

O usuário pediu foco **apenas nas peças** — o restante do formulário (anunciante,
período, valor, cobertura de TVs) permanece como está.

## Objetivo

No modo de edição, o card de peças mantém as mesmas **linhas ricas** da visualização,
com controles inline para editar a URL de destino, desvincular e adicionar peças.

## Design

### Linhas de peça (modo edição)

Renderizar uma linha por peça **vinculada** (`form.selectedAnnouncements`), com o mesmo
layout visual das linhas de visualização:

- Miniatura do QR (`api/qr/<scanCode>.png`) quando a peça já tem QR publicado. Os dados
  de QR/stats vêm de `data.announcementLinks` (lookup por `announcementId`). Peça
  recém-adicionada (ainda não vinculada no backend) aparece **sem** miniatura e sem stats.
- Título da peça.
- Stats `X exibições · Y scans` quando disponíveis em `announcementLinks`.
- **Input de URL de destino inline** abaixo do título, ligado a
  `form.announcementDestinations[String(id)]` (mesma lógica de hoje).
- Botão **desvincular** (ícone lixeira/X) à direita — remove o id de
  `form.selectedAnnouncements`.
- **Aviso âmbar** por linha quando `form.publishedScanCodes[String(id)] === true`
  ("Esta peça já tem um QR code publicado. Desvinculá-la apaga o vínculo e invalida esse
  QR code para sempre.").

### Adicionar peça

Controle **"+ Adicionar peça"** abaixo das linhas: combobox (shadcn `Popover` +
`Command`, ambos já presentes) com **barra de busca** por nome. Lista apenas as peças de
`announcements` cujo id **não** está em `form.selectedAnnouncements`. Ao selecionar, o id
é adicionado a `form.selectedAnnouncements` e a linha aparece.

### Escopo intocado

- Modo de **visualização** do card de peças: sem alteração.
- Demais campos de edição (anunciante, período, valor, TVs): sem alteração.
- Backend e hook `use-campaign-form`: sem alteração — toda a lógica de estado
  (`selectedAnnouncements`, `announcementDestinations`, `publishedScanCodes`) já existe.
  Esta é uma reorganização de renderização no `campaign-detail.tsx`.

## Critérios de sucesso

- Em edição, cada peça vinculada aparece como linha rica (QR quando publicado, título,
  stats quando disponíveis) com input de URL inline e botão de desvincular.
- Combobox de adicionar lista só peças não vinculadas e filtra por busca de nome.
- Adicionar e desvincular refletem em `form.selectedAnnouncements` e são persistidos ao
  salvar (comportamento atual do `save()`/PATCH).
- `pnpm --filter @workspace/signage typecheck` não introduz erros nos arquivos tocados;
  `pnpm --filter @workspace/signage build` passa.
