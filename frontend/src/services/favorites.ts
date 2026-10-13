import api from "@/services/api";
import type { ApiListResponse } from "@/types/api";
import type { Favorite } from "@/types/domain";

const segment = encodeURIComponent;

export async function listFavorites(): Promise<Favorite[]> {
  const res = await api.get<ApiListResponse<Favorite>>("/favorites");
  return res.data.items;
}

export async function addFavorite(hostname: string, iface: string): Promise<Favorite[]> {
  const res = await api.put<ApiListResponse<Favorite>>(
    `/favorites/${segment(hostname)}/${segment(iface)}`
  );
  return res.data.items;
}

export async function removeFavorite(hostname: string, iface: string): Promise<Favorite[]> {
  const res = await api.delete<ApiListResponse<Favorite>>(
    `/favorites/${segment(hostname)}/${segment(iface)}`
  );
  return res.data.items;
}

export async function saveFavoriteOrder(items: Favorite[]): Promise<Favorite[]> {
  const res = await api.put<ApiListResponse<Favorite>>("/favorites/order", { items });
  return res.data.items;
}
