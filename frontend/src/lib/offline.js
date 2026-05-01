/* Tiny offline order queue using localStorage.
 * - addToQueue(order): persist a pending order locally with a clientId
 * - getQueue(): list of pending orders
 * - syncQueue(api): push all pending orders to /api/sync, clear on success */

const KEY = "pos_offline_queue";

export const isOnline = () => navigator.onLine;

export const getQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};

export const addToQueue = (order) => {
  const queue = getQueue();
  const clientId = order.client_id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const enriched = {
    ...order,
    client_id: clientId,
    created_at: order.created_at || new Date().toISOString(),
  };
  queue.push(enriched);
  localStorage.setItem(KEY, JSON.stringify(queue));
  return enriched;
};

export const clearQueue = () => localStorage.setItem(KEY, "[]");

export const syncQueue = async (api) => {
  const queue = getQueue();
  if (queue.length === 0) return { created: [], skipped: [] };
  const { data } = await api.post("/sync", { orders: queue });
  clearQueue();
  return data;
};
