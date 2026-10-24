import { isAxiosError } from "axios";
import api from "@/services/api";
import type { ApiListResponse } from "@/types/api";
import type { Device, TrafficDay, TrafficSummary } from "@/types/domain";

export type TrafficValues = Pick<TrafficDay, "rx_bytes" | "tx_bytes" | "avg_rate_bps">;

export async function updateTrafficDay(hostname: string, iface: string, day: string, values: TrafficValues): Promise<void> {
  await changeTraffic("put", hostname, iface, day, values);
}

export async function deleteTraffic(hostname: string, iface: string, day?: string): Promise<void> {
  await changeTraffic("delete", hostname, iface, day);
}

async function changeTraffic(method: "put" | "delete", hostname: string, iface: string, day?: string, values?: TrafficValues): Promise<void> {
  const path = `/traffic/${encodeURIComponent(hostname)}/${encodeURIComponent(iface)}${day ? `/${encodeURIComponent(day)}` : ""}`;
  try {
    await api.request({ method, url: path, data: values });
  } catch (error) {
    if (isAxiosError(error) && error.response?.data?.error) {
      throw new Error(error.response.data.detail || error.response.data.error);
    }
    throw error;
  }
}

export async function listDevices(): Promise<Device[]> {
  const res = await api.get<ApiListResponse<Device>>("/devices");
  return res.data.items;
}

export async function listTrafficSummary(start?: string): Promise<TrafficSummary[]> {
  const res = await api.get<ApiListResponse<TrafficSummary>>("/traffic/summary", {
    params: start ? { start } : {}
  });
  return res.data.items;
}

export async function listTraffic(start?: string, hostname?: string, iface?: string): Promise<TrafficDay[]> {
  const res = await api.get<ApiListResponse<TrafficDay>>("/traffic", {
    params: { ...(start ? { start } : {}), ...(hostname ? { hostname } : {}), ...(iface ? { interface: iface } : {}) }
  });
  return res.data.items;
}
