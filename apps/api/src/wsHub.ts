type Client = { send: (data: string) => void };

const clients = new Set<Client>();
const userClients = new Map<string, Set<Client>>();
const clientToUser = new Map<Client, string>();

export function registerClient(client: Client, userId?: string) {
  clients.add(client);
  if (userId) {
    associateClient(client, userId);
  }

  return () => {
    clients.delete(client);
    const uid = clientToUser.get(client);
    if (uid) {
      clientToUser.delete(client);
      const userSet = userClients.get(uid);
      if (userSet) {
        userSet.delete(client);
        if (userSet.size === 0) userClients.delete(uid);
      }
    }
  };
}

export function associateClient(client: Client, userId: string) {
  if (!clients.has(client)) {
    clients.add(client);
  }

  // Remove old user association if switching
  const prevUid = clientToUser.get(client);
  if (prevUid && prevUid !== userId) {
    const prevSet = userClients.get(prevUid);
    if (prevSet) {
      prevSet.delete(client);
      if (prevSet.size === 0) userClients.delete(prevUid);
    }
  }

  clientToUser.set(client, userId);
  let set = userClients.get(userId);
  if (!set) {
    set = new Set<Client>();
    userClients.set(userId, set);
  }
  set.add(client);
}

export function sendToUser(userId: string, event: string, payload: unknown) {
  const set = userClients.get(userId);
  if (!set || set.size === 0) return false;

  const msg = JSON.stringify({ event, payload });
  for (const c of set) {
    try {
      c.send(msg);
    } catch {
      set.delete(c);
      clients.delete(c);
      clientToUser.delete(c);
    }
  }
  return true;
}

export function sendToUsers(userIds: string[], event: string, payload: unknown) {
  for (const uid of userIds) {
    sendToUser(uid, event, payload);
  }
}

export function broadcast(event: string, payload: unknown) {
  const msg = JSON.stringify({ event, payload });
  for (const c of clients) {
    try {
      c.send(msg);
    } catch {
      clients.delete(c);
      const uid = clientToUser.get(c);
      if (uid) {
        clientToUser.delete(c);
        userClients.get(uid)?.delete(c);
      }
    }
  }
}
