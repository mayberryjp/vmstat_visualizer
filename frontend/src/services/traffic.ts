import api from "@/services/api";
import type { ApiListResponse } from "@/types/api";
import type { Device, TrafficDay } from "@/types/domain";

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
