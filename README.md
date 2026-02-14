# Capacitor Passkey Demo

Cross-platform demo showcasing [Capacitor Passkey Plugin](https://github.com/argo-navis-dev/capacitor-passkey-plugin) for creating Stellar smart wallets secured by passkeys (WebAuthn).

> **⚠️ DISCLAIMER**: This is a **demonstration application** built to showcase the Capacitor Passkey Plugin in a real-world Stellar smart wallet scenario. It is **NOT production-ready**. Before extending or deploying this code, conduct thorough security audits and validation.

## Features

- **Passkey-Based Wallet**: Create Stellar smart wallets using biometric authentication
- **Cross-Platform**: Works on iOS, Android, and web
- **Smart Contract Integration**: Deploy and interact with Soroban smart contracts
- **Secure Transactions**: Sign payments using passkey authentication
- **YubiKey Support**: Android NFC support for hardware security keys

## Prerequisites

- Node.js 18+
- [capacitor-passkey-plugin](https://github.com/argo-navis-dev/capacitor-passkey-plugin) in sibling directory (`../capacitor-passkey-plugin`)
- Stellar testnet account with XLM for deployment
- iOS: Xcode and CocoaPods
- Android: Android Studio

## Setup

1. **Clone and install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment** - Copy `src/env-example` to `src/.env` and set:
   ```bash
   VITE_RP_ID=your-domain.com
   VITE_CONTRACT_WASM_HASH=<your-deployed-contract-hash>
   VITE_SUBMITTER_SEED=<stellar-account-secret>
   VITE_RPC_URL=https://soroban-testnet.stellar.org
   VITE_HORIZON_URL=https://horizon-testnet.stellar.org
   VITE_NATIVE_CONTRACT_ID=<native-xlm-contract-id>
   VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
   ```

3. **Build local SDKs**
   ```bash
   cd packages/smart-wallet-sdk && npm run build
   cd ../sac-sdk && npm run build
   ```

## Run

```bash
# Web
npm run dev

# iOS
npm run build:ios
# Open ios/App/App.xcworkspace in Xcode and run

# Android
npm run build:android
# Open android/ in Android Studio and run
```

## How It Works

1. **Create Wallet** - User creates passkey → public key extracted → smart contract deployed
2. **Sign In** - Authenticate with passkey → contract ID derived from credential
3. **Add Funds** - Transfer XLM from submitter account to wallet
4. **Send Payment** - Sign transaction with passkey → transfer from wallet to destination

## License

Apache 2.0