export interface ApiListResponse<T> {
  status: "ok";
  items: T[];
  total: number;
}

export interface ChartsResponse<T> extends ApiListResponse<T> {
  configured: boolean;
}
