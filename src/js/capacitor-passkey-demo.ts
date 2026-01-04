import { Dialog } from '@capacitor/dialog';
import { DemoConfig } from './config';
import { assembleCreatePasskeyOptions, assembleAuthenticateOptions, authenticate, createPasskey, getSelectedAuthenticatorType, PasskeyResultBase } from './utils';
import { StellarSmartWalletService } from './stellar-smart-wallet-service';
import { PublicKeyCreationOptions } from 'capacitor-passkey-plugin';

const CREDENTIAL_STORAGE_KEY = 'demo:credential';
const DEFAULT_FUND_AMOUNT_XLM = 50;
const FUND_TRANSACTION_DELAY_MS = 7500;

let stellarService: StellarSmartWalletService | null = null;

/**
 * Minimal credential info needed for contract ID derivation.
 * Only stores what's required - the rawId is used to derive the Stellar contract ID.
 */
interface StoredCredential {
    id: string;
    rawId: string; // base64 encoded
}


/**
 * Creates a new smart wallet by registering a passkey and deploying a Stellar smart contract.
 * The passkey's rawId is used to derive a deterministic contract ID.
 * On success, stores the credential and navigates to the post-login UI.
 */
export async function createSmartWallet(): Promise<void> {
    try {
        const smartWalletSdk = getSmartWalletSdk();
        const authenticatorType = getSelectedAuthenticatorType('passkey-authenticator-type-select');
        const createPasskeyOptions = await assembleCreatePasskeyOptions(authenticatorType);
        const smartWalletResponse = await smartWalletSdk.createWallet(
            async function (options: PublicKeyCreationOptions) {
                const registrationResult = await createPasskey(options);
                if (!registrationResult) {
                    throw new Error('Passkey creation failed');
                }
                const credential = extractCredential(registrationResult);
                localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(credential));
                return registrationResult;
            },
            createPasskeyOptions
        );

        const contractId = smartWalletResponse.result.options.contractId;
        await Dialog.alert({
            message: `Smart wallet deployed successfully!`,
        });
        postLoginActions(contractId);
        if (DemoConfig.debug) {
            console.log(`Smart wallet deployed successfully! Contract ID: ${contractId}`);
            console.log(`You can check it here: https://stellar.expert/explorer/testnet/contract/${contractId}`);
        }
    } catch (error) {
        console.error('Failed to create smart wallet:', error);
        await Dialog.alert({
            title: 'Error',
            message: `Failed to create smart wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
    }
}

/**
 * Retrieves the wallet balance in XLM for a given credential.
 * If no credential is provided, prompts the user to authenticate via passkey.
 * @param credentialParam - Optional stored credential to use for balance lookup.
 * @returns The balance in XLM, or undefined if an error occurs.
 */
export async function getWalletBalance(credentialParam?: StoredCredential): Promise<string | undefined> {
    try {
        const smartWalletSdk = getSmartWalletSdk();
        let credential = credentialParam;
        if (!credential) {
            const options = assembleAuthenticateOptions();
            const authResult = await authenticate(options);
            credential = extractCredential(authResult);
        }
        const contractId = smartWalletSdk.deriveContractIdFromPasskeyId(credential.rawId);

        const balance = await smartWalletSdk.getWalletBalanceByContract(contractId);
        return smartWalletSdk.stroopsToXlm(balance);
    } catch (error) {
        console.error('Failed to get wallet balance:', error);
        await Dialog.alert({
            title: 'Error',
            message: `Failed to get wallet balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        return undefined;
    }
}

/**
 * Transfers XLM funds to a smart wallet contract.
 * Prompts user for contract ID and amount if not provided.
 * Validates that the amount is a positive number.
 * @param contractIDParam - Optional contract ID to transfer funds to.
 * @param amountToTransfer - Optional amount in XLM to transfer.
 */
export async function addFunds(contractIDParam?: string, amountToTransfer?: number): Promise<void> {
    let contractId = contractIDParam;
    if (!contractId) {
        const { value, cancelled } = await Dialog.prompt({
            title: 'Contract ID',
            message: 'Contract ID to transfer to:',
        });
        if (cancelled || !value) {
            return;
        }
        contractId = value;
    }

    let amountToTransferXlm = amountToTransfer;
    if (amountToTransferXlm === undefined || amountToTransferXlm <= 0) {
        const { value, cancelled } = await Dialog.prompt({
            title: 'Amount',
            message: 'Amount in XLM to transfer (1 XLM = 10,000,000 stroops):',
        });
        if (cancelled || !value) {
            return;
        }
        const parsedAmount = parseFloat(value);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            await Dialog.alert({
                title: 'Invalid Amount',
                message: 'Please enter a positive number.',
            });
            return;
        }
        amountToTransferXlm = parsedAmount;
    }

    try {
        const smartWalletSdk = getSmartWalletSdk();
        const tx = await smartWalletSdk.addFunds(contractId, amountToTransferXlm);

        await Dialog.alert({
            message: `The process of adding funds has started, status: ${tx.status}`,
        });
        if (DemoConfig.debug) {
            console.log(`Transfer initiated successfully! Status: ${tx.status}`);
        }
    } catch (error) {
        console.error('Failed to add funds:', error);
        await Dialog.alert({
            title: 'Error',
            message: `Failed to add funds: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
    }
}

/**
 * Signs in the user using a stored or new passkey credential.
 * If a credential is stored locally, uses it directly; otherwise prompts for passkey authentication.
 * Verifies the associated contract exists on-chain before proceeding.
 */
export async function signIn(): Promise<void> {
    try {
        const storedCredentialStr = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
        let credential: StoredCredential | null = null;

        if (storedCredentialStr) {
            credential = JSON.parse(storedCredentialStr) as StoredCredential;
        } else {
            const options = assembleAuthenticateOptions();
            const authResult = await authenticate(options);
            if (!authResult) {
                await Dialog.alert({
                    message: 'Authentication failed, please try again.',
                });
                return;
            }
            credential = extractCredential(authResult);
            localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(credential));
        }

        const smartWalletSdk = getSmartWalletSdk();
        const contractId = smartWalletSdk.deriveContractIdFromPasskeyId(credential.rawId);
        const exists = await smartWalletSdk.contractExists(contractId);
        if (!exists) {
            await Dialog.alert({
                message: 'No contract found for this passkey. Please create a smart wallet first.',
            });
            return;
        }
        postLoginActions(contractId);
    } catch (error) {
        console.error('Failed to sign in:', error);
        await Dialog.alert({
            title: 'Error',
            message: `Failed to sign in: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
    }
}

/**
 * Resets the application state by clearing stored credentials, SDK instance, and UI.
 * Returns the user to the initial "create wallet" state.
 */
export function reset() {
    localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
    stellarService = null;
    document.getElementById('contract-info')?.classList.add('hidden');
    document.getElementById('create-smart-wallet-btn')?.classList.remove('hidden');
}

/**
 * Executes UI updates after successful login or wallet creation.
 * Shows the contract info section and refreshes the balance display.
 * @param contractId - The Stellar contract ID to display.
 */
async function postLoginActions(contractId: string): Promise<void> {
    document.getElementById('contract-info')?.classList.remove('hidden');
    document.getElementById('create-smart-wallet-btn')?.classList.add('hidden');
    refreshContractInfo(contractId);
    await refreshBalance();
}

/**
 * Updates the UI to display the contract ID and Stellar Expert link.
 * Note: Uses innerHTML for formatting. contractId is derived from Stellar SDK (alphanumeric only).
 * @param contractId - The Stellar contract ID to display.
 */
function refreshContractInfo(contractId: string): void {
    const contractTextEl = document.getElementById('contract-text');
    const stellarLinkEl = document.getElementById('stellar-expert-link');
    if (contractTextEl) {
        contractTextEl.innerHTML = `<strong>Contract:</strong> ${contractId}`;
    }
    if (stellarLinkEl) {
        stellarLinkEl.setAttribute('href', `https://stellar.expert/explorer/testnet/contract/${contractId}`);
    }
}

/**
 * Fetches and displays the current wallet balance.
 * Note: Uses innerHTML for formatting. balance is a number from the SDK.
 */
async function refreshBalance(): Promise<void> {
    const credential = getStoredCredential();
    if (!credential) {
        return;
    }
    const balance = await getWalletBalance(credential);
    const balanceTextEl = document.getElementById('balance-text');
    if (balanceTextEl) {
        balanceTextEl.innerHTML = `<strong>Balance:</strong> ${balance} XLM`;
    }
    showBalanceFlash();
}

/**
 * Adds a fixed amount of XLM to the currently signed-in wallet.
 * Verifies the contract exists on-chain before initiating the transfer.
 * Waits for the transaction to process before refreshing the balance.
 */
export async function addFixedFundForSignedInContract(): Promise<void> {
    try {
        const credential = getStoredCredential();
        if (!credential) {
            await Dialog.alert({
                message: 'You need to sign in first to add funds.',
            });
            return;
        }

        const smartWalletSdk = getSmartWalletSdk();
        const contractId = smartWalletSdk.deriveContractIdFromPasskeyId(credential.rawId);
        const exists = await smartWalletSdk.contractExists(contractId);
        if (!exists) {
            await Dialog.alert({
                message: 'No contract found for this passkey. Please create a smart wallet first.',
            });
            return;
        }
        await addFunds(contractId, DEFAULT_FUND_AMOUNT_XLM);
        await new Promise(resolve => setTimeout(resolve, FUND_TRANSACTION_DELAY_MS));
        await refreshBalance();
    } catch (error) {
        console.error('Failed to add funds:', error);
        await Dialog.alert({
            title: 'Error',
            message: `Failed to add funds: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
    }
}

/**
 * Returns the singleton StellarSmartWalletService instance.
 * Lazily initializes the SDK with configuration from DemoConfig on first call.
 */
function getSmartWalletSdk(): StellarSmartWalletService {
    if (!stellarService) {
        stellarService = new StellarSmartWalletService({
            contractWasmHash: DemoConfig.contractWasmHash,
            submitterSeed: DemoConfig.submitterSeed,
            horizonUrl: DemoConfig.horizonUrl,
            rpcUrl: DemoConfig.rpcUrl,
            nativeContractId: DemoConfig.nativeContractId,
            networkPassphrase: DemoConfig.networkPassphrase
        });
    }
    return stellarService;
}

/**
 * Extracts minimal credential info from a passkey result for storage.
 * Works with both registration and authentication results.
 */
function extractCredential(result: PasskeyResultBase): StoredCredential {
    const rawId = new Uint8Array(result.rawId);
    return {
        id: result.id,
        rawId: btoa(String.fromCharCode(...rawId)),
    };
}

/**
 * Retrieves stored credential from localStorage.
 */
function getStoredCredential(): StoredCredential | null {
    const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    if (!stored) {
        return null;
    }
    try {
        return JSON.parse(stored) as StoredCredential;
    } catch {
        console.error('Failed to parse stored credential, clearing corrupted data');
        localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
        return null;
    }
}

/**
 * Triggers a CSS flash animation on the balance display element.
 * Used to draw attention when the balance updates.
 */
function showBalanceFlash() {
    const el = document.getElementById('balance-text');
    if (el) {
        el.classList.remove('balance-flash'); // Remove if present (re-trigger)
        void el.offsetWidth; // Force reflow for animation restart
        el.classList.add('balance-flash');
    }
}