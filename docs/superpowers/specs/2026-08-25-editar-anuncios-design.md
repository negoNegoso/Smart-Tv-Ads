# Editar anúncios existentes — Design

## Contexto

A página **Anúncios** (`artifacts/signage/src/pages/admin.tsx`, rotulada "Biblioteca de Mídia" na
navegação) hoje permite: criar (upload), ativar/ocultar, excluir e reordenar anúncios. **Não existe
edição** de um anúncio já criado — não é possível corrigir título, ajustar duração nem trocar a imagem.

O backend já possui `PATCH /announcements/:id`, mas com `requestBody` `application/json`, cobrindo
apenas `title`, `isActive`, `displayOrder` e `duration`. Não há suporte a substituição de imagem no
update (apenas o `POST` de criação processa `multipart/form-data`).

## Objetivo

Permitir editar um anúncio existente: **título**, **duração** e **substituir a imagem** (opcional).

## Abordagem escolhida

- **Backend:** transformar o `PATCH /announcements/:id` em `multipart/form-data`, espelhando o
  endpoint de criação (`multer.single("image")`). Um único endpoint.
- **UI:** botão de lápis (Editar) em cada linha, abrindo um diálogo pré-preenchido igual ao de
  "Adicionar anúncio", com imagem opcional e preview da atual.

## Seção 1 — Backend (`artifacts/api-server/src/routes/announcements.ts` + `lib/api-spec/openapi.yaml`)

Modificar o handler `PATCH /announcements/:id`:

- Aplicar o middleware `upload.single("image")` na rota (o mesmo `multer` já usado no `POST`).
- Ler campos do form: `title` e `duration`, coagindo `duration` para número quando presente (como no
  create, onde FormData envia tudo como string). Todos os campos são opcionais — atualiza apenas o que
  foi enviado.
- Validar os campos de texto com `UpdateAnnouncementBody` (já define `title`/`duration` como opcionais).
- Se `req.file` existir: persistir via `persistImage()`, definir o novo `imageUrl` e apagar o arquivo
  antigo do disco, reaproveitando a lógica de limpeza usada no handler `DELETE` (só remove arquivos
  locais em `/api/uploads/`). Se nenhum arquivo vier, manter a imagem atual.
- `imageUrl` é sempre derivado no servidor, nunca aceito do cliente.
- Retornar a linha atualizada com `UpdateAnnouncementResponse.parse(row)` (comportamento atual).
- Retornar 404 se o id não existir.

No `openapi.yaml`, alterar o `requestBody` de `patch /announcements/{id}` de `application/json` para
`multipart/form-data` com propriedades `title` (string), `duration` (integer) e `image` (string,
format binary) — todas opcionais — espelhando o `post /announcements`. O spec permanece como fonte de
verdade para o client gerado.

## Seção 2 — Client gerado (`lib/api-zod` + `lib/api-client-react`)

O client é gerado por orval a partir do `openapi.yaml`. Após alterar o spec, rodar a geração para
atualizar `api-zod` e `api-client-react`.

O hook gerado `useUpdateAnnouncement` pode não montar `FormData` corretamente para multipart (o mesmo
motivo pelo qual a criação, no `admin.tsx`, usa um `fetch` manual com `FormData` em vez do hook). A UI
de edição seguirá esse mesmo padrão já estabelecido: `fetch` manual `PATCH` com `FormData`,
reutilizando as query keys exportadas para invalidar o cache. Não forçamos o hook gerado para multipart.

## Seção 3 — UI (`artifacts/signage/src/pages/admin.tsx`)

- Adicionar um botão de **lápis (Editar)** em cada `SortableAnnouncementRow`, ao lado do botão de
  excluir, com callback `onEdit(item)`.
- Novo estado `editing: Announcement | null` na página. Clicar em Editar abre um **diálogo de edição**
  com o mesmo layout do diálogo "Adicionar anúncio".
- Formulário react-hook-form pré-preenchido com `title` e `duration` atuais. Schema de edição separado
  do de upload: campo de imagem **opcional** (sem o `refine` que exige arquivo). Exibir **preview da
  imagem atual** e permitir escolher uma nova para substituir.
- Submit: `fetch` `PATCH` `${import.meta.env.BASE_URL}api/announcements/${id}` com `FormData`,
  incluindo `image` apenas se um arquivo novo foi escolhido. Estado de carregamento `isSaving`
  espelhando o `isUploading` existente.
- Ao sucesso: toast "Anúncio atualizado", fechar o diálogo e invalidar `getListAnnouncementsQueryKey`,
  `getGetAnnouncementStatsQueryKey`, `getListActiveAnnouncementsQueryKey`.
- Reaproveitar `Dialog`/`Form`/`Input` já importados.

## Fluxo de dados

UI (diálogo de edição) → `PATCH` multipart `/api/announcements/:id` → rota persiste imagem (se houver) +
atualiza campos no banco → invalidação de cache no cliente → lista da Biblioteca de Mídia e exibição
nas TVs (`/announcements/active`) refletem a mudança.

## Tratamento de erros

- Backend: validação Zod (400), falha de object storage (502), 404 para id inexistente.
- UI: toast destrutivo em qualquer falha, mantendo o diálogo aberto para nova tentativa.

## Testes / validação

- Rodar type-check/build do workspace após a geração do client.
- Não há suíte de testes de UI aparente; validar via build e checagem manual do endpoint com o dev
  server, se disponível.

## Fora de escopo (YAGNI)

- Edição em lote.
- Edição inline na linha (descartada por conflitar com o drag-and-drop existente).
- Alterar `isActive`/`displayOrder` pelo diálogo (já cobertos por toggle e drag-and-drop).
