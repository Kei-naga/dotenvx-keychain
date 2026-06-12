import { describe, expect, it } from 'vitest';

import { KeytarSecretStore } from '../../src/secretStore/backends/keytarStore.js';
import { createSecretStore } from '../../src/secretStore/factory.js';
import { SecretStoreError, type KeytarLike } from '../../src/secretStore/interface.js';

class FakeKeytar implements KeytarLike {
  public readonly entries = new Map<string, string>();
  public findCredentialsCalls = 0;

  public async setPassword(service: string, account: string, password: string): Promise<void> {
    this.entries.set(`${service}:${account}`, password);
  }

  public async getPassword(service: string, account: string): Promise<string | null> {
    return this.entries.get(`${service}:${account}`) ?? null;
  }

  public async deletePassword(service: string, account: string): Promise<boolean> {
    return this.entries.delete(`${service}:${account}`);
  }

  public async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
    this.findCredentialsCalls += 1;

    return Array.from(this.entries.entries())
      .filter(([key]) => key.startsWith(`${service}:`))
      .map(([key, password]) => ({
        account: key.slice(service.length + 1),
        password
      }));
  }
}

describe('KeytarSecretStore', () => {
  it('maps CRUD operations to the keytar API', async () => {
    const keytar = new FakeKeytar();
    const store = new KeytarSecretStore(keytar);

    await store.set('app-a', 'secret-a');
    await store.set('app-b', 'secret-b');

    await expect(store.get('app-a')).resolves.toBe('secret-a');
    await expect(store.list()).resolves.toEqual(['app-a', 'app-b']);
    await expect(store.remove('app-a')).resolves.toBe(true);
    await expect(store.remove('missing')).resolves.toBe(false);
  });

  it('deduplicates IDs returned by findCredentials', async () => {
    const store = new KeytarSecretStore({
      async setPassword(): Promise<void> {},
      async getPassword(): Promise<string | null> {
        return null;
      },
      async deletePassword(): Promise<boolean> {
        return false;
      },
      async findCredentials(): Promise<Array<{ account: string; password: string }>> {
        return [
          { account: 'app-a', password: 'one' },
          { account: 'app-a', password: 'two' },
          { account: 'app-b', password: 'three' }
        ];
      }
    });

    await expect(store.list()).resolves.toEqual(['app-a', 'app-b']);
  });

  it('classifies probe failures as backend-unavailable', async () => {
    const store = new KeytarSecretStore({
      async setPassword(): Promise<void> {},
      async getPassword(): Promise<string | null> {
        return null;
      },
      async deletePassword(): Promise<boolean> {
        return false;
      },
      async findCredentials(): Promise<Array<{ account: string; password: string }>> {
        throw new Error('Secret Service is not available on this system');
      }
    });

    await expect(store.probe()).rejects.toMatchObject<Partial<SecretStoreError>>({
      code: 'backend-unavailable'
    });
  });
});

describe('createSecretStore', () => {
  it('rejects unsupported platforms', async () => {
    await expect(createSecretStore('aix')).rejects.toMatchObject<Partial<SecretStoreError>>({
      code: 'unsupported-platform'
    });
  });

  it('probes supported platforms before returning the store', async () => {
    const keytar = new FakeKeytar();

    const store = await createSecretStore('win32', {
      loadKeytar: async () => keytar
    });

    expect(keytar.findCredentialsCalls).toBe(1);
    await expect(store.list()).resolves.toEqual([]);
  });
});
