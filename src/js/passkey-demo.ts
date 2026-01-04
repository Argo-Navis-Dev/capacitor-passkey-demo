import { PublicKeyCreationOptions, PublicKeyAuthenticationOptions } from 'capacitor-passkey-plugin';
import { Dialog } from '@capacitor/dialog';
import { createPasskey as createPasskeyUtil, authenticate as authenticateUtil, assembleCreatePasskeyOptions, assembleAuthenticateOptions, getSelectedAuthenticatorType } from './utils';

export async function createPasskey(): Promise<void> {
    try {
        const authenticatorType = getSelectedAuthenticatorType('passkey-authenticator-type-select');
        const createPasskeyOptions: PublicKeyCreationOptions = await assembleCreatePasskeyOptions(authenticatorType);
        const createPasskeyResult = await createPasskeyUtil(createPasskeyOptions);
        await Dialog.alert({
            message: 'Passkey created successfully, the id: ' + createPasskeyResult.id,
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await Dialog.alert({
            message: 'Passkey creation failed: ' + errorMsg,
        });
    }
}

export async function authenticate(): Promise<void> {
    await Dialog.alert({
        message: 'Starting passkey retrieval...',
    });
    try {
        const authOptions: PublicKeyAuthenticationOptions = assembleAuthenticateOptions();
        const authResult = await authenticateUtil(authOptions);
        await Dialog.alert({
            message: 'Authentication successful, the id: ' + authResult.id,
        });
    } catch (error: any) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await Dialog.alert({
            message: 'Authentication failed: ' + errorMsg,
        });
    }
}