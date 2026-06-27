export const SECRET_STORE_NAMESPACE = "dotenvx-keychain";

export type SecretStoreErrorCode =
  | "unsupported-platform"
  | "backend-unavailable"
  | "backend-io-error"
  | "enumeration-failed"
  | "remove-failed";

export class SecretStoreError extends Error {
  public readonly code: SecretStoreErrorCode;

  public constructor(
    code: SecretStoreErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "SecretStoreError";
    this.code = code;
  }
}

export interface SecretStore {
  set(id: string, value: string): Promise<void>;
  get(id: string): Promise<string | null>;
  list(): Promise<string[]>;
  remove(id: string): Promise<boolean>;
}

export interface SecretStoreFactory {
  create(platform?: NodeJS.Platform): Promise<SecretStore>;
}

export interface SecretStoreCredential {
  account: string;
  password: string;
}

export interface KeytarLike {
  setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<SecretStoreCredential[]>;
}
