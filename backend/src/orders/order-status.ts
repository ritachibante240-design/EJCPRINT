export const orderStatuses = [
  'RECEIVED',
  'PREPARING',
  'PRINTING',
  'READY_FOR_PICKUP',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof orderStatuses)[number];
