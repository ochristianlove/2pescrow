type Client = { send: (data: string) => void };

const clients = new Set<Client>();

export function registerClient(client: Client) {
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcast(event: string, payload: unknown) {
  const msg = JSON.stringify({ event, payload });
  for (const c of clients) {
    try {
      c.send(msg);
    } catch {
      clients.delete(c);
    }
  }
}
