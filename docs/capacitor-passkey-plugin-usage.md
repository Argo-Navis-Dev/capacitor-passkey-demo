# Capacitor Passkey Demo - Overview

This document describes what the demo application does and its scope.

## Purpose

Demonstrates how to integrate the [Capacitor Passkey Plugin](https://github.com/argo-navis-dev/capacitor-passkey-plugin) with Stellar blockchain to create a **cross-platform smart wallet** secured by passkeys (WebAuthn/FIDO2).

## What It Does

### 1. Passkey-Based Wallet Creation
- User creates a passkey using device biometrics (Face ID, Touch ID, fingerprint)
- Public key is extracted from the passkey's COSE format (ES256/Secp256r1)
- A Stellar Soroban smart contract is deployed using the public key as the signer
- Contract ID is deterministically derived from the passkey's credential ID

### 2. Wallet Sign-In
- User authenticates with their passkey
- Contract ID is re-derived from the credential ID
- System verifies the contract exists on-chain before granting access
- Session is maintained via localStorage (credential ID only)

### 3. Fund Management
- **Add Funds**: Transfer XLM from a submitter account to the smart wallet
- **View Balance**: Query the wallet's XLM balance from Stellar network
- **Send Payment**: Transfer XLM from the smart wallet to any Stellar address
  - User authenticates with passkey to authorize the transaction
  - Signature is generated using WebAuthn and formatted for Stellar (low-S normalization)

### 4. Cross-Platform Support
- **Web**: Works on localhost (development) and production domains
- **iOS**: Uses Face ID / Touch ID via native Passkey APIs
- **Android**: Uses biometric authentication + optional YubiKey NFC support

## Components

**Frontend (Capacitor)**
- [main.ts](../src/js/main.ts) - Entry point, DOM event handlers
- [capacitor-passkey-demo.ts](../src/js/capacitor-passkey-demo.ts) - Smart wallet demo logic
- [stellar-smart-wallet-service.ts](../src/js/stellar-smart-wallet-service.ts) - Stellar SDK integration
- [utils.ts](../src/js/utils.ts) - Passkey plugin wrappers, WebAuthn helpers
- [config.ts](../src/js/config.ts) - Environment configuration

**Local SDKs**
- `packages/smart-wallet-sdk` - Soroban smart wallet contract client
- `packages/sac-sdk` - Stellar Asset Contract (SAC) client for XLM transfers

**Smart Contracts** (not included in this repo)
- Soroban smart wallet contract (Rust) - deployed to Stellar testnet
- WASM hash configured via `VITE_CONTRACT_WASM_HASH`

### Key Flows

#### Wallet Creation Flow
```
User → Create Passkey (Capacitor Plugin)
     → Extract Public Key (COSE parsing)
     → Deploy Contract (smart-wallet-sdk)
     → Store Credential ID (localStorage)
     → Show Contract ID + Balance
```

#### Payment Flow
```
User → Enter Destination + Amount
     → Build SAC Transfer TX (sac-sdk)
     → Generate Challenge (from auth entry)
     → Authenticate with Passkey (plugin)
     → Sign with WebAuthn Signature
     → Submit to Stellar Network
     → Refresh Balance
```

## Technical Highlights

### Passkey Integration
- Uses Capacitor Passkey Plugin for cross-platform WebAuthn support
- Extracts raw public keys from COSE attestation objects
- Handles both ES256 (platform authenticators) and RS256 (YubiKey)
- Converts WebAuthn DER signatures to compact format with low-S normalization

### Stellar Integration
- Deterministic contract IDs: `hash(deployer_address + salt)` where `salt = hash(credentialId)`
- Passkey signatures are embedded in Soroban authorization entries
- Submitter account sponsors transaction fees (fee-bump pattern)
- SAC (Stellar Asset Contract) for native XLM transfers

### Android YubiKey Support
- Uses non-resident keys (`residentKey: 'discouraged'`)
- Stores credential IDs in localStorage
- Provides `allowCredentials` with NFC/USB transports during authentication

## Demo Limitations

⚠️ **This is a demonstration** - not production-ready:

## Use Cases

**What This Demo Is Good For:**
- Learning Capacitor Passkey Plugin integration
- Understanding WebAuthn + Stellar smart contracts
- Cross-platform passkey development reference
- Prototyping biometric wallet UX

**What You Should Add for Production:**
- Backend API for transaction signing
- Account recovery (social recovery, seed phrase backup)
- Multi-device passkey support
- Comprehensive error handling
- Fee estimation and gas management
- Transaction history UI
- Security audits

## References

- [Capacitor Passkey Plugin](https://github.com/argo-navis-dev/capacitor-passkey-plugin)
- [Stellar Documentation](https://developers.stellar.org/)
- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/)
- [FIDO2 Alliance](https://fidoalliance.org/)
