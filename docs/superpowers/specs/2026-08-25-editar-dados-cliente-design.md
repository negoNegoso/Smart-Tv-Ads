# Editar dados do cliente — Design

## Problema

Hoje não é possível editar os dados de um cliente (nome, e-mail, telefone)
pela interface. A lista de clientes (`clients.tsx`) e a página de detalhe
(`client-detail.tsx`) só permitem criar e excluir clientes.

## Contexto

A infraestrutura de edição já existe; falta apenas a interface:

- **Backend:** a rota `PATCH /clients/:id` já está implementada em
  `artifacts/api-server/src/routes/clients.ts`.
- **Cliente gerado:** o hook `useUpdateClient` já está disponível em
  `@workspace/api-client-react`.

Portanto, esta mudança é somente de frontend.

## Escopo

Adicionar a capacidade de editar nome, e-mail e telefone de um cliente na
página de detalhe do cliente (`artifacts/signage/src/pages/client-detail.tsx`),
por meio de um modal que reaproveita o padrão do formulário "Novo cliente".

Fora de escopo: editar clientes a partir da lista; alterar o schema do
banco ou a API; editar outros recursos (TVs, anunciantes).

## Design

Todas as mudanças ocorrem em `client-detail.tsx`.

### Interface

1. Botão **"Editar"** (ícone `Pencil` do `lucide-react`) ao lado do nome do
   cliente no cabeçalho da página.
2. Novo `Dialog` intitulado **"Editar cliente"**, com o mesmo layout do modal
   de cadastro: campos Nome, E-mail (opcional) e Telefone (opcional).

### Formulário e validação

- `react-hook-form` + `zodResolver`, reutilizando o mesmo schema do cadastro:
  - `name`: string obrigatória ("O nome é obrigatório").
  - `email`: e-mail válido, opcional (aceita string vazia).
  - `phone`: string opcional.
- `defaultValues` preenchidos com os dados atuais do cliente.
- `form.reset(...)` sincroniza os valores quando os dados do cliente carregam
  e ao abrir o modal, para refletir sempre o estado atual.

### Fluxo de dados

- Envio via `useUpdateClient` → `mutate({ id: clientId, data })`.
- `email` vazio é enviado como `undefined` (mesmo tratamento do cadastro).
- **Sucesso:** invalida `getGetClientQueryKey(clientId)` e
  `getListClientsQueryKey()`, exibe toast "Cliente atualizado" e fecha o modal.
- **Erro:** toast destrutivo "Não foi possível atualizar o cliente".

### Estados

- Botão "Salvar" desabilitado e com spinner (`Loader2`) enquanto
  `isPending`.
- Mensagens de validação inline por campo.

## Testes / validação

- `pnpm run typecheck` do workspace deve passar.
- Verificação manual do fluxo: abrir o modal, editar os campos, salvar e
  confirmar que o cabeçalho e a lista refletem os novos dados.
- O projeto não possui suíte de testes de UI automatizados.
