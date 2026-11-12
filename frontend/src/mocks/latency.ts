/** Simulated network latency so loading states are visible during design. */
export function latency(min = 350, max = 800): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

export function mockRequestId(): string {
  return crypto.randomUUID().slice(0, 13);
}
