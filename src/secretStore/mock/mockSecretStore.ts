import type { SecretStore } from '../interface.js';

export class MockSecretStore implements SecretStore {
  private readonly entries: Map<string, string>;

  public constructor(initialEntries?: Iterable<readonly [string, string]>) {
    this.entries = new Map(initialEntries);
  }

  public async set(id: string, value: string): Promise<void> {
    this.entries.set(id, value);
  }

  public async get(id: string): Promise<string | null> {
    return this.entries.get(id) ?? null;
  }

  public async list(): Promise<string[]> {
    return Array.from(this.entries.keys());
  }

  public async remove(id: string): Promise<boolean> {
    return this.entries.delete(id);
  }
}
