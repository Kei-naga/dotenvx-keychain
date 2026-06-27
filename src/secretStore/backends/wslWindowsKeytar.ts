import { spawn } from "node:child_process";

import type { KeytarLike, SecretStoreCredential } from "../interface.js";

type WslCredentialOperation = "set" | "get" | "delete" | "list";

interface WslCredentialRequest {
  operation: WslCredentialOperation;
  service: string;
  account?: string;
  password?: string;
}

interface WslCredentialResponse {
  password?: string | null;
  deleted?: boolean;
  credentials?: SecretStoreCredential[];
}

export interface RunWslPowerShellOptions {
  file: string;
  args: string[];
  input: string;
}

export interface RunWslPowerShellResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type RunWslPowerShell = (
  options: RunWslPowerShellOptions,
) => Promise<RunWslPowerShellResult>;

export interface CreateWslWindowsKeytarOptions {
  powershellCommand?: string;
  runPowerShell?: RunWslPowerShell;
}

const POWERSHELL_BRIDGE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if (-not ('DxkCredentialBridge' -as [type])) {
$source = @"
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class DxkCredentialBridge {
  private const UInt32 CRED_TYPE_GENERIC = 1;
  private const UInt32 CRED_PERSIST_ENTERPRISE = 3;
  private const Int32 ERROR_NOT_FOUND = 1168;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct FILETIME {
    public UInt32 dwLowDateTime;
    public UInt32 dwHighDateTime;
  }

  [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);

  [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);

  [DllImport("Advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

  [DllImport("Advapi32.dll", EntryPoint = "CredEnumerateW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredEnumerate(string filter, UInt32 flags, out UInt32 count, out IntPtr credentialsPtr);

  [DllImport("Advapi32.dll", SetLastError = true)]
  private static extern void CredFree(IntPtr buffer);

  public sealed class CredentialEntry {
    public string account { get; set; }
    public string password { get; set; }
  }

  private static string MakeTarget(string service, string account) {
    return service + "/" + account;
  }

  private static string MakeTargetPrefix(string service) {
    return service + "/";
  }

  public static void SetPassword(string service, string account, string password) {
    byte[] blob = Encoding.UTF8.GetBytes(password);
    IntPtr blobPtr = Marshal.AllocCoTaskMem(blob.Length);

    try {
      if (blob.Length > 0) {
        Marshal.Copy(blob, 0, blobPtr, blob.Length);
      }

      CREDENTIAL credential = new CREDENTIAL();
      credential.Type = CRED_TYPE_GENERIC;
      credential.TargetName = MakeTarget(service, account);
      credential.UserName = account;
      credential.CredentialBlobSize = (UInt32)blob.Length;
      credential.CredentialBlob = blobPtr;
      credential.Persist = CRED_PERSIST_ENTERPRISE;

      if (!CredWrite(ref credential, 0)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
    } finally {
      Marshal.FreeCoTaskMem(blobPtr);
    }
  }

  public static string GetPassword(string service, string account) {
    IntPtr credentialPtr;

    if (!CredRead(MakeTarget(service, account), CRED_TYPE_GENERIC, 0, out credentialPtr)) {
      Int32 errorCode = Marshal.GetLastWin32Error();

      if (errorCode == ERROR_NOT_FOUND) {
        return null;
      }

      throw new Win32Exception(errorCode);
    }

    try {
      CREDENTIAL credential = (CREDENTIAL)Marshal.PtrToStructure(credentialPtr, typeof(CREDENTIAL));

      if (credential.CredentialBlobSize == 0 || credential.CredentialBlob == IntPtr.Zero) {
        return string.Empty;
      }

      byte[] blob = new byte[credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, blob, 0, blob.Length);
      return Encoding.UTF8.GetString(blob);
    } finally {
      CredFree(credentialPtr);
    }
  }

  public static bool DeletePassword(string service, string account) {
    if (!CredDelete(MakeTarget(service, account), CRED_TYPE_GENERIC, 0)) {
      Int32 errorCode = Marshal.GetLastWin32Error();

      if (errorCode == ERROR_NOT_FOUND) {
        return false;
      }

      throw new Win32Exception(errorCode);
    }

    return true;
  }

  public static CredentialEntry[] FindCredentials(string service) {
    string targetPrefix = MakeTargetPrefix(service);
    UInt32 count;
    IntPtr credentialsPtr;

    if (!CredEnumerate(targetPrefix + "*", 0, out count, out credentialsPtr)) {
      Int32 errorCode = Marshal.GetLastWin32Error();

      if (errorCode == ERROR_NOT_FOUND) {
        return new CredentialEntry[0];
      }

      throw new Win32Exception(errorCode);
    }

    try {
      List<CredentialEntry> credentials = new List<CredentialEntry>();

      for (Int32 index = 0; index < count; index++) {
        IntPtr credentialPtr = Marshal.ReadIntPtr(credentialsPtr, index * IntPtr.Size);
        CREDENTIAL credential = (CREDENTIAL)Marshal.PtrToStructure(credentialPtr, typeof(CREDENTIAL));

        if (credential.TargetName == null || !credential.TargetName.StartsWith(targetPrefix, StringComparison.Ordinal)) {
          continue;
        }

        if (credential.UserName == null) {
          continue;
        }

        string password = string.Empty;

        if (credential.CredentialBlobSize > 0 && credential.CredentialBlob != IntPtr.Zero) {
          byte[] blob = new byte[credential.CredentialBlobSize];
          Marshal.Copy(credential.CredentialBlob, blob, 0, blob.Length);
          password = Encoding.UTF8.GetString(blob);
        }

        credentials.Add(new CredentialEntry {
          account = credential.UserName,
          password = password,
        });
      }

      return credentials.ToArray();
    } finally {
      CredFree(credentialsPtr);
    }
  }
}
"@

  Add-Type -TypeDefinition $source
}

$request = [Console]::In.ReadToEnd() | ConvertFrom-Json

switch ($request.operation) {
  'set' {
    [DxkCredentialBridge]::SetPassword($request.service, $request.account, $request.password)
    [pscustomobject]@{ ok = $true } | ConvertTo-Json -Compress -Depth 4
  }
  'get' {
    [pscustomobject]@{
      password = [DxkCredentialBridge]::GetPassword($request.service, $request.account)
    } | ConvertTo-Json -Compress -Depth 4
  }
  'delete' {
    [pscustomobject]@{
      deleted = [DxkCredentialBridge]::DeletePassword($request.service, $request.account)
    } | ConvertTo-Json -Compress -Depth 4
  }
  'list' {
    [pscustomobject]@{
      credentials = [DxkCredentialBridge]::FindCredentials($request.service)
    } | ConvertTo-Json -Compress -Depth 4
  }
  default {
    throw 'Unsupported credential operation.'
  }
}
`;

function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, "utf16le").toString("base64");
}

function normalizeProcessErrorMessage(stderr: string): string {
  const trimmed = stderr.trim();

  if (trimmed.length === 0) {
    return "Credential Manager operation failed.";
  }

  if (/credential manager/i.test(trimmed)) {
    return trimmed;
  }

  return `Credential Manager operation failed: ${trimmed}`;
}

async function defaultRunWslPowerShell(
  options: RunWslPowerShellOptions,
): Promise<RunWslPowerShellResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(options.file, options.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });

    child.stdin.end(options.input, "utf8");
  });
}

function parseWslCredentialResponse(stdout: string): WslCredentialResponse {
  const payload = stdout.trim();

  if (payload.length === 0) {
    throw new Error("Credential Manager returned an invalid response.");
  }

  try {
    return JSON.parse(payload) as WslCredentialResponse;
  } catch {
    throw new Error("Credential Manager returned an invalid response.");
  }
}

export class WslWindowsKeytar implements KeytarLike {
  private readonly encodedBridgeCommand = encodePowerShellCommand(
    POWERSHELL_BRIDGE_SCRIPT,
  );

  public constructor(
    private readonly powershellCommand: string = "powershell.exe",
    private readonly runPowerShell: RunWslPowerShell = defaultRunWslPowerShell,
  ) {}

  public async setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void> {
    await this.invoke({
      operation: "set",
      service,
      account,
      password,
    });
  }

  public async getPassword(
    service: string,
    account: string,
  ): Promise<string | null> {
    const response = await this.invoke({
      operation: "get",
      service,
      account,
    });

    return response.password ?? null;
  }

  public async deletePassword(
    service: string,
    account: string,
  ): Promise<boolean> {
    const response = await this.invoke({
      operation: "delete",
      service,
      account,
    });

    return response.deleted ?? false;
  }

  public async findCredentials(
    service: string,
  ): Promise<SecretStoreCredential[]> {
    const response = await this.invoke({
      operation: "list",
      service,
    });

    return response.credentials ?? [];
  }

  private async invoke(
    request: WslCredentialRequest,
  ): Promise<WslCredentialResponse> {
    let result: RunWslPowerShellResult;

    try {
      result = await this.runPowerShell({
        file: this.powershellCommand,
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-EncodedCommand",
          this.encodedBridgeCommand,
        ],
        input: JSON.stringify(request),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(normalizeProcessErrorMessage(message), {
        cause: error,
      });
    }

    if (result.exitCode !== 0) {
      throw new Error(normalizeProcessErrorMessage(result.stderr));
    }

    return parseWslCredentialResponse(result.stdout);
  }
}

export async function createWslWindowsKeytar(
  options: CreateWslWindowsKeytarOptions = {},
): Promise<KeytarLike> {
  return new WslWindowsKeytar(options.powershellCommand, options.runPowerShell);
}
