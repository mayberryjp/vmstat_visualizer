import { classifyApiError } from "@/services/api";

export function describeError(err: unknown, fallback: string): string {
  const { message } = classifyApiError(err);
  return message || fallback;
}
