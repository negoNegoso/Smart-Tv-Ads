import type { QueryClient } from '@tanstack/react-query';
import { clearSessionHint } from './session-hint';

/**
 * Sair é o único momento em que o navegador sabe que a sessão acabou por
 * vontade do usuário. O handler de UNAUTHORIZED_EVENT não cobre este caso: ele
 * só existe enquanto o RoleRouter está montado, e depois do logout a rota é
 * pública. Sem limpar a dica aqui, `signage:has-session` fica em "1" para
 * sempre e a raiz mostra spinner em vez da landing — justamente o caso que a
 * dica existe para separar.
 *
 * A limpeza vai no finally: se a requisição de logout falhar, o cookie pode
 * até sobreviver, mas manter a dica de uma sessão que o usuário mandou encerrar
 * é o pior dos dois erros.
 */
export async function logout(queryClient: QueryClient): Promise<void> {
  try {
    await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, { method: 'POST' });
  } finally {
    clearSessionHint();
    queryClient.setQueryData(['auth'], { authenticated: false });
  }
}
