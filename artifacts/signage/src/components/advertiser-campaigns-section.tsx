import { useCallback, useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CampaignFormDialog, type CampaignFormAdvertiser } from '@/components/campaign-form-dialog';
import { CampaignRow, type CampaignRowData } from '@/components/campaign-row';

type AdvertiserWithCampaigns = CampaignFormAdvertiser & {
  campaigns: CampaignRowData[];
};

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Campanhas do perfil de anunciante de uma empresa, com criação e pausa. */
export function AdvertiserCampaignsSection({ advertiserId }: { advertiserId: number }) {
  const [data, setData] = useState<AdvertiserWithCampaigns | null>(null);
  const [announcements, setAnnouncements] = useState<Array<{ id: number; title: string }>>([]);
  const [devices, setDevices] = useState<Array<{ id: number; name: string; location: string | null; clientName: string }>>([]);
  const [segments, setSegments] = useState<Array<{ id: number; slug: string; name: string }>>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [adv, media, tvs, seg] = await Promise.all([
      fetch(api(`/advertisers/${advertiserId}`)).then((r) => (r.ok ? r.json() : null)),
      fetch(api('/announcements')).then((r) => (r.ok ? r.json() : [])),
      fetch(api('/devices')).then((r) => (r.ok ? r.json() : [])),
      fetch(api('/segments')).then((r) => (r.ok ? r.json() : [])),
    ]);
    setData(adv);
    setAnnouncements(asArray(media));
    setDevices(asArray(tvs));
    setSegments(asArray(seg));
    setLoading(false);
  }, [advertiserId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleCampaign(id: number) {
    await fetch(api(`/campaigns/${id}/toggle`), { method: 'PATCH' });
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Campanhas</CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!data || announcements.length === 0}>
          Nova campanha
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : !data?.campaigns?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha cadastrada.</p>
        ) : (
          data.campaigns.map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} onToggle={toggleCampaign} />)
        )}
      </CardContent>
      {data ? (
        <CampaignFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          advertisers={[data]}
          announcements={announcements}
          devices={devices}
          segments={segments}
          lockedAdvertiserId={advertiserId}
          onSaved={load}
        />
      ) : null}
    </Card>
  );
}
