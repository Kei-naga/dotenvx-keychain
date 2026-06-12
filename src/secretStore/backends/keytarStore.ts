import {
  SECRET_STORE_NAMESPACE,
  SecretStoreError,
  type KeytarLike,
  type SecretStore,
  type SecretStoreCredential,
  type SecretStoreErrorCode
} from '../interface.js';

function isBackendUnavailableMessage(message: string): boolean {
  return /(dbus|keychain|credential manager|not available|unlock|serviceunknown|secret service|native module|cannot find module)/i.test(
    message
  );
}

function formatSecretStoreMessage(code: SecretStoreErrorCode): string {
  switch (code) {
    case 'backend-unavailable':
      return 'Native secret store backend is unavailable.';
    case 'enumeration-failed':
      return 'Failed to enumerate stored IDs.';
    case 'remove-failed':
      return 'Failed to remove the stored secret.';
    case 'backend-io-error':
      return 'Secret store operation failed.';
    case 'unsupported-platform':
      return 'Unsupported platform.';
  }
}

function normalizeCredentials(credentials: SecretStoreCredential[]): string[] {
  return Array.from(new Set(credentials.map((credential) => credential.account)));
}

export class KeytarSecretStore implements SecretStore {
  public constructor(
    private readonly keytar: KeytarLike,
    private readonly namespace: string = SECRET_STORE_NAMESPACE
  ) {}

  public async probe(): Promise<void> {
    try {
      await this.keytar.findCredentials(this.namespace);
    } catch (error) {
      throw this.classifyError(error, 'backend-unavailable');
    }
  }

  public async set(id: string, value: string): Promise<void> {
    try {
      await this.keytar.setPassword(this.namespace, id, value);
    } catch (error) {
      throw this.classifyError(error, 'backend-io-error');
    }
  }

  public async get(id: string): Promise<string | null> {
    try {
      return await this.keytar.getPassword(this.namespace, id);
    } catch (error) {
      throw this.classifyError(error, 'backend-io-error');
    }
  }

  public async list(): Promise<string[]> {
    try {
      return normalizeCredentials(await this.keytar.findCredentials(this.namespace));
    } catch (error) {
      throw this.classifyError(error, 'enumeration-failed');
    }
  }

  public async remove(id: string): Promise<boolean> {
    try {
      return await this.keytar.deletePassword(this.namespace, id);
    } catch (error) {
      throw this.classifyError(error, 'remove-failed');
    }
  }

  private classifyError(error: unknown, fallbackCode: SecretStoreErrorCode): SecretStoreError {
    if (error instanceof SecretStoreError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const code =
      fallbackCode === 'enumeration-failed' || fallbackCode === 'remove-failed'
        ? fallbackCode
        : isBackendUnavailableMessage(message)
          ? 'backend-unavailable'
          : fallbackCode;

    return new SecretStoreError(code, formatSecretStoreMessage(code), error);
  }
}
