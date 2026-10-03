import { Card } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';
import { ChangePasswordForm } from '@/components/change-password-form';

export default function ChangePassword({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2 font-bold tracking-tight text-primary">
          <KeyRound className="h-6 w-6" />
          <span>Defina uma nova senha</span>
        </div>
        <ChangePasswordForm onSuccess={onDone} />
      </Card>
    </div>
  );
}
