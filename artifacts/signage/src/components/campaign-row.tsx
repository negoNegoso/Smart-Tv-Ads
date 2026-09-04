import { Link } from "wouter";
import { CalendarDays, Megaphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { weekdaysLabel } from "@/lib/weekdays";

export type CampaignRowData = {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  targetMode: "all" | "devices" | "segments";
  weekdays?: number[];
  segmentNames: string[];
  deviceIds?: number[];
  isActive: boolean;
};

// Alvo em uma linha, para não precisar abrir a campanha só para saber onde ela passa.
function target(campaign: CampaignRowData) {
  if (campaign.targetMode === "segments") {
    return campaign.segmentNames.length ? campaign.segmentNames.join(", ") : "Sem segmento";
  }
  if (campaign.targetMode === "devices") {
    const total = campaign.deviceIds?.length ?? 0;
    return `${total} ${total === 1 ? "TV" : "TVs"}`;
  }
  return "Todas as TVs";
}

// Só mostra a recorrência quando ela restringe algo: "todo dia" já é o
// implícito do período e viraria ruído em cada linha da lista.
function recurrence(campaign: CampaignRowData) {
  const days = campaign.weekdays ?? [];
  if (days.length === 0 || days.length === 7) return "";
  return ` · ${weekdaysLabel(days)}`;
}

function date(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function CampaignRow({ campaign, onToggle }: { campaign: CampaignRowData; onToggle: (id: number) => void }) {
  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <div className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/30 ${!campaign.isActive ? "opacity-55" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Megaphone className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{campaign.name}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3 w-3" />{date(campaign.startsAt)} — {date(campaign.endsAt)} · {target(campaign)}{recurrence(campaign)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${campaign.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{campaign.isActive ? "Ativa" : "Pausada"}</span>
        <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="shrink-0">
          <Switch checked={campaign.isActive} onCheckedChange={() => onToggle(campaign.id)} aria-label="Ativar campanha" />
        </div>
      </div>
    </Link>
  );
}
