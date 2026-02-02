# Android NFC Integration - YubiKey Support

## Overview

This document describes the limitations and workarounds for integrating YubiKey NFC authentication on Android using WebAuthn/FIDO2 passkeys.

## YubiKey NFC Limitations on Android

### Problem

YubiKey NFC does **not work** with Android's default WebAuthn passkey settings. Specifically:

- **Resident Keys**: YubiKey NFC does not support `residentKey: 'required'` on Android
- **User Verification**: YubiKey NFC does not support `userVerification: 'required'` on Android

When using these default settings, authentication will fail with:
```
androidx.credentials.exceptions.NoCredentialException: No credentials available
```

### Root Cause

YubiKey hardware keys have limited onboard storage and processing capabilities compared to platform authenticators (like Android's built-in biometric authentication). They cannot store resident/discoverable credentials with the same requirements as platform authenticators.

## Solution: Android Demo Mode

To enable YubiKey NFC support on Android, we implement "Android Demo Mode" which uses **non-resident keys** with relaxed verification requirements.

### Configuration

Enable Android demo mode by setting the following environment variable:

```env
VITE_ANDROID_DEMO=true
```

### Technical Changes

When Android demo mode is enabled (`VITE_ANDROID_DEMO=true`) and running on Android platform:

#### 1. Passkey Creation Options

```javascript
{
  authenticatorSelection: {
    authenticatorAttachment: 'cross-platform', // Target external authenticators
    userVerification: 'discouraged',           // Don't require PIN/biometric
    residentKey: 'discouraged'                 // Non-resident/non-discoverable key
  }
}
```

**Key differences from default:**
- `userVerification: 'discouraged'` instead of `'required'`
- `residentKey: 'discouraged'` instead of `'required'`
- `authenticatorAttachment: 'cross-platform'` to target YubiKey instead of platform authenticator

#### 2. Credential Storage

Since non-resident keys are **not discoverable**, the credential ID must be stored and provided during authentication:

```javascript
// After successful creation, save credential ID
saveAndroidCredential(credentialId, rawId);

// Stored in localStorage as:
{
  id: "base64url-encoded-credential-id",
  rawId: "base64-encoded-raw-id",
  timestamp: 1234567890
}
```

#### 3. Authentication Options

```javascript
{
  challenge: "...",
  rpId: "argo-navis.dev",
  userVerification: 'discouraged',
  authenticatorAttachment: 'cross-platform',  // Critical: target external authenticators
  allowCredentials: [
    {
      type: 'public-key',
      id: 'first-stored-credential-id',  // Only the first credential is used
      transports: ['nfc', 'usb']
    }
  ]
}
```

**Key differences from default:**
- `allowCredentials` array contains **only the first stored credential**
- `authenticatorAttachment: 'cross-platform'` to ensure Android looks for YubiKey, not platform authenticator
- `transports: ['nfc', 'usb']` to support both connection methods

**Note**: If multiple credentials are stored, only the first one (oldest by creation time) is used during authentication.