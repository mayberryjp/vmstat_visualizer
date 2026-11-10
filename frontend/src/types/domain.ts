export interface Device {
  hostname: string;
  interface: string;
  source_ip: string;
  days: number;
  first_day: string;
  last_day: string;
  last_seen: string;
  last_day_with_non_zero_data: string | null;
  non_zero_data_in_last_24h: boolean;
}

export interface TrafficDay {
  hostname: string;
  source_ip: string;
  interface: string;
  day: string;
  rx_bytes: number;
  tx_bytes: number;
  total_bytes: number;
  avg_rate_bps: number;
  received_at: string;
  is_estimated?: boolean;
  is_manual?: boolean;
}

export interface TrafficSummary {
  hostname: string;
  interface: string;
  days: number;
  rx_bytes: number;
  tx_bytes: number;
  total_bytes: number;
}

export interface Favorite {
  hostname: string;
  interface: string;
  metered?: boolean;
}

export interface DeviceGroup {
  key: string;
  hostname: string;
  interface: string;
  sourceIp: string;
  lastSeen: string;
  days: TrafficDay[];
  totals: { rx_bytes: number; tx_bytes: number };
}

export interface DashboardDeviceGroup extends DeviceGroup {
  monthToDateTotals: { rx_bytes: number; tx_bytes: number };
}
