# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Capacitor demo app showcasing passkey (WebAuthn) integration for Stellar smart wallet creation and management. Runs as a hybrid mobile app on iOS/Android via Capacitor, with web development support. Includes Soroban smart contracts (Rust) for the wallet implementation.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Development server (web)
npm run dev

# Production build (outputs to dist/)
npm run build

# Build and sync for iOS
npm run build:ios

# Build and sync for Android
npm run build:android
```

### Building Local SDK Packages

The `packages/` directory contains local SDK packages that must be built before the main app:

```bash
cd packages/passkey-kit-sdk && npm run build
cd packages/sac-sdk && npm run build
```

### Building Smart Contracts

```bash
cd contracts
make build      # Build and optimize smart-wallet contract
make upload     # Upload to network (uses STELLAR_ACCOUNT env)
make bindings   # Generate TypeScript bindings for SDKs
```

## Architecture

### Demo App (src/js/)
- **main.ts** - Entry point, sets up DOM event handlers for UI buttons
- **capacitor-passkey-demo.ts** - Smart wallet demo with create/sign-in/fund operations
- **stellar-smart-wallet-service.ts** - Core service orchestrating wallet deployment and Stellar transactions
- **utils.ts** - WebAuthn helpers (base64url encoding, credential options, passkey creation/authentication)
- **config.ts** - Environment config via Vite env vars, platform-specific rpId handling
- **passkey-demo.ts** - Basic passkey creation/authentication demo

### Local SDK Packages (packages/)
- **passkey-kit-sdk** - Stellar smart wallet contract client (generated from Soroban contract spec via `make bindings`), handles signer management (Secp256r1, Ed25519, Policy signers)
- **sac-sdk** - Stellar Asset Contract client for token operations (transfer, balance)

### Smart Contracts (contracts/)
Rust/Soroban smart contracts:
- **smart-wallet** - Main wallet contract supporting passkey-based signing
- **smart-wallet-interface** - Contract interface definitions
- **sample-policy** - Example policy signer implementation
- **example-contract** - Example usage contract

### Key Flows
1. **Wallet Creation**: Passkey created via capacitor-passkey-plugin → public key extracted from COSE format (ES256/Secp256r1) → contract deployed via passkey-kit-sdk `Client.deploy()`
2. **Sign In**: Authenticate with passkey → derive contract ID from credential ID hash + deployer address
3. **Fund Transfer**: Uses sac-sdk to transfer XLM from submitter account to smart wallet contract

## Environment Configuration

Copy `src/env-example` to `src/.env` and configure:
- `VITE_RP_ID` - Relying Party ID for passkey (domain, overridden to `localhost` for web)
- `VITE_CHALLENGE` - WebAuthn challenge string
- `VITE_CONTRACT_WASM_HASH` - Deployed Soroban contract WASM hash
- `VITE_SUBMITTER_SEED` - Stellar account seed for transaction submission
- `VITE_RPC_URL` / `VITE_HORIZON_URL` - Stellar network endpoints
- `VITE_NATIVE_CONTRACT_ID` - Native XLM SAC contract ID
- `VITE_NETWORK_PASSPHRASE` - Stellar network passphrase
- `VITE_DEBUG` - Set to `true` for verbose logging

## Dependencies

- **capacitor-passkey-plugin** - Local plugin at `../capacitor-passkey-plugin` (must exist in sibling directory)
- **@stellar/stellar-sdk** - Loaded via CDN in index.html, accessed as `window.StellarSdk`
- **cbor-web** - CBOR decoding for WebAuthn attestation parsing

## Key Implementation Notes

- Stellar SDK is loaded from CDN, not bundled - access via `window.StellarSdk`
- Passkey rawId (base64 encoded) is used as salt to derive deterministic contract IDs
- Only ES256 (Secp256r1) keys are fully supported; RS256 keys will trigger a warning
- Credential storage uses localStorage with key `demo:credential`
