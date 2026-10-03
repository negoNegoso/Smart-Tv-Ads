import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ChangePasswordForm } from '@/components/change-password-form';

/**
 * Antes desta página, quem queria trocar a senha depois do primeiro login
 * não tinha por onde. Fica na mesma tela depois de salvar: o toast confirma.
 */
export default function PortalAccount() {
  const { toast } = useToast();

  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight">Minha conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">Troque a senha de acesso ao portal.</p>
      <Card className="mt-6 p-6">
        <ChangePasswordForm onSuccess={() => toast({ title: 'Senha alterada' })} />
      </Card>
    </div>
  );
}
