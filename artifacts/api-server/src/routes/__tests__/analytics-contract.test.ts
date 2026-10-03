import { describe, expect, it } from "vitest";
import {
  GetAnalyticsHourlyResponse,
  GetAnalyticsOverviewResponse,
  GetAnalyticsRankingsResponse,
} from "@workspace/api-zod";

const PERIOD = { days: 30, from: "2026-09-03", to: "2026-10-02" };
const TOTALS = { plays: 10, durationSeconds: 100, scans: 1, uniqueVisitors: 1, scanRate: 0.1 };

describe("contrato da Visão geral", () => {
  it("overview aceita dia sem histórico (activeDevices null)", () => {
    const body = {
      period: PERIOD,
      totals: { ...TOTALS, previous: TOTALS },
      now: { devices: 2, devicesOnline: 1, clients: 1 },
      series: [
        { date: "2026-09-03", plays: 0, scans: 0, activeDevices: null, totalDevices: 2 },
        { date: "2026-09-04", plays: 5, scans: 1, activeDevices: 2, totalDevices: 2 },
      ],
    };
    expect(GetAnalyticsOverviewResponse.parse(body)).toEqual(body);
  });

  it("overview recusa dia sem totalDevices", () => {
    const body = {
      period: PERIOD,
      totals: { ...TOTALS, previous: TOTALS },
      now: { devices: 2, devicesOnline: 1, clients: 1 },
      series: [{ date: "2026-09-03", plays: 0, scans: 0, activeDevices: 1 }],
    };
    expect(() => GetAnalyticsOverviewResponse.parse(body)).toThrow();
  });

  it("hourly e rankings no formato do spec", () => {
    const hourly = { period: PERIOD, hours: [{ hour: 0, plays: 3 }] };
    expect(GetAnalyticsHourlyResponse.parse(hourly)).toEqual(hourly);
    const rankings = {
      period: PERIOD,
      campaigns: [{ campaignId: 4, name: "Natal", advertiserName: "Padaria", plays: 9 }],
      devices: [{ deviceId: 2, name: "Balcão", clientName: "Padaria", plays: 6 }],
      announcements: [{ announcementId: 9, title: "Pão", plays: 3, scans: 1, scanRate: 0.33, durationSeconds: 30 }],
    };
    expect(GetAnalyticsRankingsResponse.parse(rankings)).toEqual(rankings);
  });
});
