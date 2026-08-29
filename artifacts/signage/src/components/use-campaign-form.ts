import { useState } from "react";

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

export type CampaignFormAdvertiser = { id: number; name: string; company: string | null };
export type CampaignFormAnnouncement = { id: number; title: string };
export type CampaignFormDevice = { id: number; name: string; location: string | null; clientName: string };

export type CampaignFormCampaign = {
  id: number;
  advertiserId: number;
  name: string;
  contractValue: number;
  startsAt: string;
  endsAt: string;
  allDevices: boolean;
  deviceIds?: number[];
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
  allDevices: boolean;
  setAllDevices: (value: boolean) => void;
  selectedDevices: number[];
  setSelectedDevices: (value: number[]) => void;
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
  const [allDevices, setAllDevices] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState<number[]>([]);
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
      setAllDevices(campaign.allDevices);
    } else {
      setCampaignId(null);
      setName("");
      setContractValue("");
      setStartsAt("");
      setEndsAt("");
      setSelectedAdvertiser(lockedAdvertiserId ?? null);
      setSelectedDevices([]);
      setSelectedAnnouncements([]);
      setAnnouncementDestinations({});
      setPublishedScanCodes({});
      setAllDevices(true);
    }
  }

  async function submit(): Promise<{ ok: boolean; error?: string }> {
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
        allDevices,
        deviceIds: selectedDevices,
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
    allDevices, setAllDevices,
    selectedDevices, setSelectedDevices,
    selectedAnnouncements, setSelectedAnnouncements,
    announcementDestinations, setAnnouncementDestinations,
    publishedScanCodes,
    reset,
    submit,
  };
}
