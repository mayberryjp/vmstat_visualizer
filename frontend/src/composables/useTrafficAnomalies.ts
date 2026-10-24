import type { TrafficDay } from "@/types/domain";

export const trafficFields = ["rx_bytes", "tx_bytes"] as const;

export function findTrafficAnomalies(days: TrafficDay[]): Map<string, Set<typeof trafficFields[number]>> {
  const warnings = new Map<string, Set<typeof trafficFields[number]>>();
  if (days.length < 2) return warnings;
  const totals = days.reduce((sum, day) => ({
    rx_bytes: sum.rx_bytes + day.rx_bytes,
    tx_bytes: sum.tx_bytes + day.tx_bytes
  }), { rx_bytes: 0, tx_bytes: 0 });
  for (const day of days) {
    const fields = new Set<typeof trafficFields[number]>();
    for (const field of trafficFields) {
      const average = (totals[field] - day[field]) / (days.length - 1);
      if (day[field] > 0 && day[field] >= 10 * average) fields.add(field);
    }
    if (fields.size) warnings.set(day.day, fields);
  }
  return warnings;
}