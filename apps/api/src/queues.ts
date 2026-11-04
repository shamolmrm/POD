/** BullMQ queue names. Jobs are added by the API and processed by the worker. */
export const QUEUES = {
  system: "system", // heartbeat / maintenance
} as const;

export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null, // required by BullMQ workers
  };
}
