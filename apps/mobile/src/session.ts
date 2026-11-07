let token: string | null = null;

export function getToken(): string | null {
  return token;
}

export function setMemoryToken(next: string | null) {
  token = next;
}
