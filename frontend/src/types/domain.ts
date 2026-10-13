export interface Device {
  hostname: string;
  interface: string;
  source_ip: string;
  days: number;
  first_day: string;
  last_day: string;
  last_seen: string;
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
}

export interface Favorite {
  hostname: string;
  interface: string;
}

export interface DeviceGroup {
  key: string;
  hostname: string;
  interface: string;
  sourceIp: string;
  lastSeen: string;
  days: TrafficDay[];
}
