import { useLocation, useRoute } from 'wouter';
import PortalPanels from './portal-panels';
import PortalPanelEditor from './portal-panel-editor';

/**
 * "Painéis" do admin: a mesma tela do lojista, com todas as lojas. O editor
 * ganha URL própria (/panels/:id) — o admin costuma abrir o painel de uma
 * loja a pedido dela, e poder colar o link ajuda nessa conversa.
 */
export default function PanelsAdmin() {
  const [, navigate] = useLocation();
  const [editing, params] = useRoute('/panels/:id');
  const panelId = editing ? Number(params.id) : null;

  return (
    <div className="container mx-auto px-4 py-8">
      {panelId !== null && Number.isInteger(panelId) && panelId > 0 ? (
        <PortalPanelEditor panelId={panelId} onBack={() => navigate('/panels')} />
      ) : (
        <PortalPanels variant="admin" onEdit={(id) => navigate(`/panels/${id}`)} />
      )}
    </div>
  );
}
