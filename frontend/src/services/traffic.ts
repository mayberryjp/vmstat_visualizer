import api from "@/services/api";
import type { ApiListResponse, ChartsResponse } from "@/types/api";
import type { ChartConfig, Device, TrafficDay } from "@/types/domain";

// Resolves to null when the server has no charts file, meaning "show everything".
export async function listChartConfig(): Promise<ChartConfig[] | null> {
  const res = await api.get<ChartsResponse<ChartConfig>>("/charts");
  return res.data.configured ? res.data.items : null;
}

export async function listDevices(): Promise<Device[]> {
  const res = await api.get<ApiListResponse<Device>>("/devices");
  return res.data.items;
}

export async function listTraffic(start?: string): Promise<TrafficDay[]> {
  const res = await api.get<ApiListResponse<TrafficDay>>("/traffic", {
    params: start ? { start } : {}
  });
  return res.data.items;
}
