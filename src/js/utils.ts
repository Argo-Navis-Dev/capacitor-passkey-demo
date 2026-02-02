import { PasskeyPlugin, PasskeyCreateResult, PublicKeyCreationOptions, PublicKeyAuthenticationOptions } from 'capacitor-passkey-plugin';
import { DemoConfig } from './config';
import { Dialog } from '@capacitor/dialog';
import { Capacitor } from '@capacitor/core';

// Android YubiKey NFC credential storage
const ANDROID_YUBIKEY_CREDENTIALS_KEY = 'android_yubikey_nfc_credentials';

interface AndroidCredential {
  id: string;
  rawId: string;
  timestamp: number;
  name?: string; // Optional user-friendly name for the credential
}

export function saveAndroidCredential(id: string, rawId: string, name?: string): void {
  const credentials = getAndroidCredentials();
  credentials.push({
    id,
    rawId,
    timestamp: Date.now(),
    name: name || `Credential ${credentials.length + 1}`
  });
  localStorage.setItem(ANDROID_YUBIKEY_CREDENTIALS_KEY, JSON.stringify(credentials));
  if (DemoConfig.debug) {
    console.log('Saved Android credential:', { id, rawId, name });
  }
}

export function getAndroidCredentials(): AndroidCredential[] {
  const stored = localStorage.getItem(ANDROID_YUBIKEY_CREDENTIALS_KEY);
  if (!stored) {
    return [];
  }
  try {
    return JSON.parse(stored) as AndroidCredential[];
  } catch (error) {
    console.error('Failed to parse Android credentials, clearing corrupted data');
    localStorage.removeItem(ANDROID_YUBIKEY_CREDENTIALS_KEY);
    return [];
  }
}

export function clearAndroidCredentials(): void {
  localStorage.removeItem(ANDROID_YUBIKEY_CREDENTIALS_KEY);
  if (DemoConfig.debug) {
    console.log('Cleared all Android credentials');
  }
}

export function toBase64Url(uint8: Uint8Array): string {
    return btoa(String.fromCharCode.apply(null, Array.from(uint8)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}


export function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(base64url.length / 4) * 4, '=');

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}

export type AuthenticatorType = 'platform' | 'cross-platform' | 'any';

export interface PasskeyResultBase {
  id: string;
  rawId: ArrayBuffer;
  type: 'public-key';
}

export interface PasskeyRegistrationResponse {
  attestationObject: ArrayBuffer;
  clientDataJSON: ArrayBuffer;
}

export interface PasskeyAuthenticationResponse {
  clientDataJSON: ArrayBuffer;
  authenticatorData: ArrayBuffer;
  signature: ArrayBuffer;
  userHandle: ArrayBuffer | null;
}

export interface PasskeyRegistrationResult extends PasskeyResultBase {
  response: PasskeyRegistrationResponse;
}

export interface PasskeyAuthenticationResult extends PasskeyResultBase {
  response: PasskeyAuthenticationResponse;
}

export type PasskeyResult = PasskeyRegistrationResult | PasskeyAuthenticationResult;

export function getSelectedAuthenticatorType(selectId: string = 'passkey-authenticator-type-select'): AuthenticatorType {
  const select = document.getElementById(selectId) as any;
  return select?.value || 'any';
}

export async function assembleCreatePasskeyOptions(authenticatorType: AuthenticatorType = 'any'): Promise<PublicKeyCreationOptions> {
    const { value: passkeyName, cancelled } = await Dialog.prompt({
      title: 'Passkey Name',
      message: 'Give this passkey a name:',
    });
    if (cancelled || !passkeyName) {
      throw new Error("Passkey name is required");
    }

    const timestampedName = `${passkeyName}${new Date().getTime()}`;
    const userIdBytes = new TextEncoder().encode(timestampedName);

    const challengeBytes = new TextEncoder().encode(DemoConfig.challenge);//Uint8Array
    const isAndroid = Capacitor.getPlatform() === 'android';
    const useAndroidDemo = DemoConfig.androidDemo && isAndroid;
    const options: PublicKeyCreationOptions = {
      challenge: toBase64Url(challengeBytes),
      rp: {
        name: passkeyName,
        id: DemoConfig.rpId
      },
      user: {
        id: toBase64Url(userIdBytes),
        name: `user_${passkeyName}@${DemoConfig.rpId}`,
        displayName: passkeyName
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },//ES256 (what you need)
        { type: "public-key", alg: -257 }//RS256 (for compatibility, even if unused)
      ],
      authenticatorSelection: {
        authenticatorAttachment: authenticatorType === 'any' ? undefined : authenticatorType,
        userVerification: useAndroidDemo ? 'discouraged' : 'required',
        residentKey: useAndroidDemo ? 'discouraged' : 'required'
      },
      timeout: 60000,
      attestation: 'none',
    };

    return options;
  }

export function assembleAuthenticateOptions(): PublicKeyAuthenticationOptions {
  const challengeBytes = new TextEncoder().encode(DemoConfig.challenge);//Uint8Array
  const isAndroid = Capacitor.getPlatform() === 'android';
  const useAndroidDemo = DemoConfig.androidDemo && isAndroid;

  let allowCredentials: any[] = [];
  if (useAndroidDemo) {
    // Load stored credentials for Android demo mode
    // Note: Only the first credential is used to avoid confusion with multiple credentials
    const storedCredentials = getAndroidCredentials();
    if (storedCredentials.length > 0) {
      const firstCredential = storedCredentials[0];
      allowCredentials = [{
        type: 'public-key',
        id: firstCredential.id,
        transports: ['nfc', 'usb']
      }];
      if (DemoConfig.debug) {
        console.log('Android Demo Mode: Using first stored credential for authentication');
        console.log('Total stored credentials:', storedCredentials.length);
        console.log('Using credential:', JSON.stringify(firstCredential, null, 2));
        console.log('allowCredentials:', JSON.stringify(allowCredentials, null, 2));
      }
    } else if (DemoConfig.debug) {
      console.log('Android Demo Mode: No stored credentials found');
    }
  }

  const options: PublicKeyAuthenticationOptions = {
    challenge: toBase64Url(challengeBytes),
    rpId: DemoConfig.rpId,
    allowCredentials,
    userVerification: useAndroidDemo ? 'discouraged' : 'required',
    timeout: 60000,
    ...(useAndroidDemo && { authenticatorAttachment: 'cross-platform' })
  };

  if (DemoConfig.debug && useAndroidDemo) {
    console.log('Authentication options:', JSON.stringify(options, null, 2));
  }

  return options;
}

export async function authenticate(authOptions: PublicKeyAuthenticationOptions): Promise<PasskeyAuthenticationResult> {
  try {
    const result = await PasskeyPlugin.authenticate({ publicKey: authOptions });
    const nativeResult: PasskeyAuthenticationResult = {
      id: result.id,
      rawId: base64urlToArrayBuffer(result.rawId),
      type: "public-key",
      response: {
        clientDataJSON: base64urlToArrayBuffer(result.response.clientDataJSON),
        authenticatorData: base64urlToArrayBuffer(result.response.authenticatorData),
        signature: base64urlToArrayBuffer(result.response.signature),
        userHandle: result.response.userHandle ? base64urlToArrayBuffer(result.response.userHandle) : null
      }
    };
    if (DemoConfig.debug) {
      console.log('Authentication successful, plugin result received: ', JSON.stringify(result, null, 2));
      console.log('Authentication successful, plugin result received, the converted result: ', JSON.stringify(nativeResult, null, 2));
    }
    return nativeResult;
  } catch (error: any) {
    console.error('Authentication failed:', error);
    throw error;
  }
}

export async function createPasskey(createPasskeyOptions: PublicKeyCreationOptions): Promise<PasskeyRegistrationResult> {
  if (!createPasskeyOptions) {
    throw new Error('No options provided for passkey creation');
  }
  try {
    const registerResult = await PasskeyPlugin.createPasskey({ publicKey: createPasskeyOptions });
    const nativeResult: PasskeyRegistrationResult = {
      id: registerResult.id,
      rawId: base64urlToArrayBuffer(registerResult.rawId),
      type: "public-key",
      response: {
        attestationObject: base64urlToArrayBuffer(registerResult.response.attestationObject),
        clientDataJSON: base64urlToArrayBuffer(registerResult.response.clientDataJSON)
      }
    };

    if (DemoConfig.debug) {
      console.log('Passkey created successfully, plugin result received: ', JSON.stringify(registerResult, null, 2));
      console.log('Passkey created successfully, plugin converted result: ', JSON.stringify(nativeResult, null, 2));
    }
    return nativeResult;
  } catch (error) {
    console.error('Passkey creation failed:', error);
    throw error;
  }
}

