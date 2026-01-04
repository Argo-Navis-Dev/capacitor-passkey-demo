import { PasskeyPlugin, PasskeyCreateResult, PublicKeyCreationOptions, PublicKeyAuthenticationOptions } from 'capacitor-passkey-plugin';
import { DemoConfig } from './config';
import { Dialog } from '@capacitor/dialog';

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
        userVerification: 'required',
        residentKey: 'required',
        requireResidentKey: true
      },
      timeout: 60000,
      attestation: 'none'
    };

    return options;
  }

export function assembleAuthenticateOptions(): PublicKeyAuthenticationOptions {
  const challengeBytes = new TextEncoder().encode(DemoConfig.challenge);//Uint8Array
  const options: PublicKeyAuthenticationOptions = {
    challenge: toBase64Url(challengeBytes),
    rpId: DemoConfig.rpId,
    allowCredentials: [],
    userVerification: 'required',
    timeout: 60000
  };
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

