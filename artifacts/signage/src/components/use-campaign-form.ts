import { useState } from "react";
import { DEFAULT_TIME_WINDOW, MAX_TIME_WINDOWS, isValidWindow, type TimeWindow } from "@/lib/time-windows";

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

export type CampaignFormAdvertiser = { id: number; name: string; company: string | null };
export type CampaignFormAnnouncement = { id: number; title: string };
export type CampaignFormDevice = { id: number; name: string; location: string | null; clientName: string };
export type CampaignFormSegment = { id: number; name: string };
export type CampaignTargetMode = "all" | "devices" | "segments";

export type CampaignFormCampaign = {
  id: number;
  advertiserId: number;
  name: string;
  contractValue: number;
  startsAt: string;
  endsAt: string;
  targetMode: CampaignTargetMode;
  weekdays?: number[];
  timeWindows?: TimeWindow[];
  loopInsertions?: number;
  deviceIds?: number[];
  segmentIds?: number[];
  announcementIds?: number[];
  announcementLinks?: Array<{ announcementId: number; scanCode: string | null; destinationUrl: string | null }>;
};

export type UseCampaignForm = {
  name: string;
  setName: (value: string) => void;
  contractValue: string;
  setContractValue: (value: string) => void;
  startsAt: string;
  setStartsAt: (value: string) => void;
  endsAt: string;
  setEndsAt: (value: string) => void;
  selectedAdvertiser: number | null;
  setSelectedAdvertiser: (value: number | null) => void;
  targetMode: CampaignTargetMode;
  setTargetMode: (value: CampaignTargetMode) => void;
  weekdays: number[];
  toggleWeekday: (day: number) => void;
  timeWindows: TimeWindow[];
  timeWindowsValid: boolean;
  addWindow: () => void;
  updateWindow: (index: number, patch: Partial<TimeWindow>) => void;
  removeWindow: (index: number) => void;
  loopInsertions: number;
  setLoopInsertions: (value: number) => void;
  selectedDevices: number[];
  setSelectedDevices: (value: number[]) => void;
  selectedSegments: number[];
  setSelectedSegments: (value: number[]) => void;
  selectedAnnouncements: number[];
  setSelectedAnnouncements: (value: number[]) => void;
  announcementDestinations: Record<string, string>;
  setAnnouncementDestinations: (value: Record<string, string>) => void;
  publishedScanCodes: Record<string, boolean>;
  reset: (campaign?: CampaignFormCampaign | null, lockedAdvertiserId?: number) => void;
  submit: () => Promise<{ ok: boolean; error?: string }>;
};

export function useCampaignForm(): UseCampaignForm {
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<number | null>(null);
  const [targetMode, setTargetMode] = useState<CampaignTargetMode>("all");
  // Vazio = roda todo dia, mesma convenção do servidor.
  const [weekdays, setWeekdays] = useState<number[]>([]);
  // Vazio = dia todo, mesma convenção do servidor.
  const [timeWindows, setTimeWindows] = useState<TimeWindow[]>([]);
  // 1× = como antes da frequência existir, mesma convenção do servidor.
  const [loopInsertions, setLoopInsertions] = useState(1);
  const [selectedDevices, setSelectedDevices] = useState<number[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<number[]>([]);
  const [selectedAnnouncements, setSelectedAnnouncements] = useState<number[]>([]);
  const [announcementDestinations, setAnnouncementDestinations] = useState<Record<string, string>>({});
  const [publishedScanCodes, setPublishedScanCodes] = useState<Record<string, boolean>>({});

  function reset(campaign?: CampaignFormCampaign | null, lockedAdvertiserId?: number) {
    if (campaign) {
      setCampaignId(campaign.id);
      setName(campaign.name);
      setContractValue(String(campaign.contractValue ?? ""));
      setStartsAt(campaign.startsAt.slice(0, 10));
      setEndsAt(campaign.endsAt.slice(0, 10));
      setSelectedAdvertiser(campaign.advertiserId);
      setSelectedDevices(campaign.deviceIds ?? []);
      setSelectedSegments(campaign.segmentIds ?? []);
      setSelectedAnnouncements(campaign.announcementIds ?? []);
      setAnnouncementDestinations(
        Object.fromEntries((campaign.announcementLinks ?? []).map((link) => [String(link.announcementId), link.destinationUrl ?? ""])),
      );
      setPublishedScanCodes(
        Object.fromEntries(
          (campaign.announcementLinks ?? [])
            .filter((link) => link.scanCode && link.destinationUrl)
            .map((link) => [String(link.announcementId), true]),
        ),
      );
      setTargetMode(campaign.targetMode);
      setWeekdays(campaign.weekdays ?? []);
      setTimeWindows(campaign.timeWindows ?? []);
      setLoopInsertions(campaign.loopInsertions ?? 1);
    } else {
      setCampaignId(null);
      setName("");
      setContractValue("");
      setStartsAt("");
      setEndsAt("");
      setSelectedAdvertiser(lockedAdvertiserId ?? null);
      setSelectedDevices([]);
      setSelectedSegments([]);
      setSelectedAnnouncements([]);
      setAnnouncementDestinations({});
      setPublishedScanCodes({});
      setTargetMode("all");
      setWeekdays([]);
      setTimeWindows([]);
      setLoopInsertions(1);
    }
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b),
    );
  }

  function addWindow() {
    setTimeWindows((current) => (current.length >= MAX_TIME_WINDOWS ? current : [...current, { ...DEFAULT_TIME_WINDOW }]));
  }

  function updateWindow(index: number, patch: Partial<TimeWindow>) {
    setTimeWindows((current) => current.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  }

  function removeWindow(index: number) {
    setTimeWindows((current) => current.filter((_, i) => i !== index));
  }

  const timeWindowsValid = timeWindows.every(isValidWindow);

  async function submit(): Promise<{ ok: boolean; error?: string }> {
    // A página da campanha não trava o botão; a recusa aqui vale para os dois
    // formulários, e a API valida de novo de qualquer jeito.
    if (!timeWindowsValid) return { ok: false, error: "Fim da faixa precisa ser depois do início" };
    const isEditing = campaignId != null;
    const response = await fetch(api(isEditing ? `/campaigns/${campaignId}` : "/campaigns"), {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        startsAt,
        endsAt,
        advertiserId: selectedAdvertiser,
        announcementIds: selectedAnnouncements,
        announcementDestinations,
        contractValue: Number(contractValue || 0),
        targetMode,
        deviceIds: selectedDevices,
        segmentIds: selectedSegments,
        weekdays,
        // Sempre enviado, mesmo vazio: painel novo nunca depende do default da API.
        timeWindows,
        loopInsertions,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      return { ok: false, error: error?.error };
    }
    return { ok: true };
  }

  return {
    name, setName,
    contractValue, setContractValue,
    startsAt, setStartsAt,
    endsAt, setEndsAt,
    selectedAdvertiser, setSelectedAdvertiser,
    targetMode, setTargetMode,
    weekdays, toggleWeekday,
    timeWindows, timeWindowsValid, addWindow, updateWindow, removeWindow,
    loopInsertions, setLoopInsertions,
    selectedDevices, setSelectedDevices,
    selectedSegments, setSelectedSegments,
    selectedAnnouncements, setSelectedAnnouncements,
    announcementDestinations, setAnnouncementDestinations,
    publishedScanCodes,
    reset,
    submit,
  };
}
