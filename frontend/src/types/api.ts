export interface ApiListResponse<T> {
  status: "ok";
  items: T[];
  total: number;
}
