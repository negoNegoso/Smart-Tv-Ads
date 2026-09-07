import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

/**
 * Placeholder — o editor de verdade é a próxima tarefa. Isto só existe para
 * que "Editar" e "Novo cardápio/promoção/aviso" em portal-panels.tsx tenham
 * para onde ir sem deixar a navegação num beco sem saída.
 */
export default function PortalPanelEditor({
  panelId,
  onBack,
}: {
  panelId: number;
  onBack: () => void;
}) {
  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Voltar
      </Button>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Editor do painel #{panelId}</EmptyTitle>
          <EmptyDescription>
            A edição de conteúdo ainda não está disponível nesta versão. O painel já foi salvo.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
