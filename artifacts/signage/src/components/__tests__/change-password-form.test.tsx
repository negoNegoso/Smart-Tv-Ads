import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from '../change-password-form';

afterEach(() => vi.unstubAllGlobals());

async function preencherEEnviar() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Senha atual'), 'senha-velha');
  await user.type(screen.getByLabelText(/Nova senha/), 'senha-nova-123');
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
}

describe('ChangePasswordForm', () => {
  it('envia as duas senhas, avisa quem chamou e limpa os campos', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    render(<ChangePasswordForm onSuccess={onSuccess} />);

    await preencherEEnviar();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('api/auth/change-password');
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'senha-velha', newPassword: 'senha-nova-123' });
    // Na página Minha conta o formulário continua na tela: senha não pode
    // ficar preenchida depois de trocada.
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText(/Nova senha/)).toHaveValue('');
  });

  it('mostra o erro do servidor e não avisa sucesso', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Senha atual incorreta' }), { status: 400 })),
    );
    const onSuccess = vi.fn();
    render(<ChangePasswordForm onSuccess={onSuccess} />);

    await preencherEEnviar();

    expect(await screen.findByText('Senha atual incorreta')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
