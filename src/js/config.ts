import { Capacitor } from '@capacitor/core';

function getRequiredEnv(key: string): string {
    const value = import.meta.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}. Please check your .env file.`);
    }
    return value;
}

export const DemoConfig = {
    rpId: getRequiredEnv('VITE_RP_ID'),
    challenge: getRequiredEnv('VITE_CHALLENGE'),
    contractWasmHash: getRequiredEnv('VITE_CONTRACT_WASM_HASH'),
    submitterSeed: getRequiredEnv('VITE_SUBMITTER_SEED'),
    rpcUrl: getRequiredEnv('VITE_RPC_URL'),
    horizonUrl: getRequiredEnv('VITE_HORIZON_URL'),
    nativeContractId: getRequiredEnv('VITE_NATIVE_CONTRACT_ID'),
    networkPassphrase: getRequiredEnv('VITE_NETWORK_PASSPHRASE'),
    debug: import.meta.env.VITE_DEBUG === 'true'
};

const platform = Capacitor.getPlatform();
if (platform === 'web') {
    DemoConfig.rpId = 'localhost'; // Use localhost for web testing
}