import { Client, Signer, SignerStorage } from 'smart-wallet-sdk';
import { Client as SacClient } from 'sac-sdk';
import { PublicKeyCreationOptions } from 'capacitor-passkey-plugin';
import { PasskeyRegistrationResult } from './utils';
import { DemoConfig } from './config';
import * as cborModule from 'cbor-web';
import { Buffer } from 'buffer';

// Handle both default and named exports from cbor-web
const cbor = cborModule.default || cborModule;

// Use global StellarSdk loaded from CDN in index.html
const StellarSdk = (window as unknown as { StellarSdk: any }).StellarSdk;

export interface WalletServiceConfig {
  contractWasmHash: string;
  submitterSeed: string;
  horizonUrl: string;
  rpcUrl: string;
  nativeContractId: string;
  networkPassphrase: string;
}

/**
 * Passkey creator function type.
 * Accepts PublicKeyCreationOptions and returns a PasskeyRegistrationResult.
 */
export type PasskeyCreator = (options: PublicKeyCreationOptions) => Promise<PasskeyRegistrationResult>;

export class StellarSmartWalletService {
  private readonly contractWasmHash: string;
  private readonly submitterSeed: string;
  private readonly horizonUrl: string;
  private readonly rpcUrl: string;
  private readonly nativeContractId: string;
  private readonly networkPassphrase: string;
  private readonly submitterKeypair: any;

  constructor(config: WalletServiceConfig) {
    this.contractWasmHash = config.contractWasmHash;
    this.submitterSeed = config.submitterSeed;
    this.horizonUrl = config.horizonUrl;
    this.rpcUrl = config.rpcUrl;
    this.nativeContractId = config.nativeContractId;
    this.networkPassphrase = config.networkPassphrase;

    this.submitterKeypair = StellarSdk.Keypair.fromSecret(this.submitterSeed);
  }

  async createWallet(passkeyCreator: PasskeyCreator, passkeyOptions: PublicKeyCreationOptions) {
    try {
      const passkey = await passkeyCreator(passkeyOptions);
      const deployResponse = await this.deploySmartWallet(passkey);
      await deployResponse.sign({
        signTransaction: StellarSdk.contract.basicNodeSigner(this.submitterKeypair, this.networkPassphrase).signTransaction
      });
      await deployResponse.send();
      return deployResponse;
    } catch (error) {
      console.error('Error creating wallet:', error);
      throw error;
    }
  }

  deriveContractIdFromPasskey(passkey: PasskeyRegistrationResult | null): string | undefined {
    if (passkey) {
      const rawId = new Uint8Array(passkey.rawId);
      const credentialId = btoa(String.fromCharCode(...rawId));
      return this.deriveContractIdFromPasskeyId(credentialId);
    }
    return undefined;
  }

  async deploySmartWallet(passkey: PasskeyRegistrationResult) {
    const response = passkey.response;
    const attestationObject = new Uint8Array(response.attestationObject);

    if (DemoConfig.debug) {
      console.log("Attestation object buffer:", attestationObject.buffer);
    }
    const decoded = cbor.decode(attestationObject.buffer) as {
      fmt: string;
      attStmt: unknown;
      authData: ArrayBuffer;
    };
    const authDataBytes = new Uint8Array(decoded.authData);

    if (DemoConfig.debug) {
      console.log("Attestation format:", decoded.fmt);
      console.log("Attestation statement:", decoded.attStmt);
    }

    const rawPublicKey = this.extractRawPublicKeyFromAuthData(authDataBytes);

    const rawId = new Uint8Array(passkey.rawId);
    const credentialId = btoa(String.fromCharCode(...rawId));
    if (DemoConfig.debug) {
      console.log("Credential ID (base64):", credentialId);
    }

    const signerStorage: SignerStorage = { tag: 'Persistent', values: undefined as unknown as void };

    const signer: Signer = {
      tag: 'Secp256r1',
      values: [
        Buffer.from(credentialId),
        Buffer.from(rawPublicKey),
        [undefined],
        [undefined],
        signerStorage,
      ]
    };

    const deployOptions = {
      rpcUrl: this.rpcUrl,
      wasmHash: this.contractWasmHash,
      networkPassphrase: this.networkPassphrase,
      publicKey: this.submitterKeypair.publicKey(),
      salt: StellarSdk.hash(Buffer.from(credentialId)),
      timeoutInSeconds: 60,
    };

    return Client.deploy({ signer }, deployOptions);
  }

  /**
   * Extracts the raw public key from WebAuthn authData
   * Supports both ES256 (EC2) and RS256 (RSA) key formats
   *
   * ES256 (Platform & YubiKey with -7): Returns 0x04 || x || y (65 bytes)
   * RS256 (YubiKey & Windows with -257): Returns n || e (variable length)
   *
   * Note: Stellar Soroban smart wallets require ES256 (Secp256r1) keys.
   * RS256 keys will be extracted but may not work with the current contract.
   */
  extractRawPublicKeyFromAuthData(authDataBytes: Uint8Array): Uint8Array {
    // WebAuthn authData structure byte lengths (per W3C spec)
    const RP_ID_HASH_LENGTH = 32;
    const FLAGS_LENGTH = 1;
    const SIGNATURE_COUNTER_LENGTH = 4;
    const AAGUID_LENGTH = 16;
    const CRED_ID_LENGTH_BYTES = 2;

    // Ensure safe slicing
    const slicedBuffer = authDataBytes.buffer.slice(
      authDataBytes.byteOffset,
      authDataBytes.byteOffset + authDataBytes.byteLength
    );

    const view = new DataView(slicedBuffer);

    let offset = 0;
    offset += RP_ID_HASH_LENGTH;
    offset += FLAGS_LENGTH;
    offset += SIGNATURE_COUNTER_LENGTH;
    offset += AAGUID_LENGTH;

    const credIdLen = view.getUint16(offset);
    offset += CRED_ID_LENGTH_BYTES;
    offset += credIdLen;

    // COSE key starts here
    const coseKeyBytes = new Uint8Array(slicedBuffer.slice(offset));
    if (coseKeyBytes.length === 0) {
      throw new Error("COSE key not found in authData");
    }

    if (DemoConfig.debug) {
      console.log("COSE key bytes (first 20):", Array.from(coseKeyBytes.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    }

    // Use decodeFirstSync to decode only the COSE key, ignoring extensions (like credProtect) that follow
    let coseKey: Map<number, unknown>;
    try {
      const result = cbor.decodeFirstSync(coseKeyBytes, { extendedResults: true }) as { value?: Map<number, unknown> } | Map<number, unknown>;
      coseKey = (result as { value?: Map<number, unknown> }).value ?? result as Map<number, unknown>;
    } catch (error) {
      console.error("CBOR decode error:", error);
      console.error("Failed to decode COSE key");
      throw error;
    }

    if (!coseKey || !(coseKey instanceof Map)) {
      console.error("Decoded COSE key is invalid:", coseKey);
      throw new Error("Invalid COSE key structure");
    }

    // Log all keys in the COSE map
    if (DemoConfig.debug) {
      console.log("COSE key map entries:");
      for (const [key, value] of coseKey.entries()) {
        if (value instanceof Uint8Array) {
          console.log(`  Key ${key}: Uint8Array(${value.length})`);
        } else {
          console.log(`  Key ${key}:`, value);
        }
      }
    }

    // Check key type (kty) and algorithm (alg)
    const kty = coseKey.get(1) as number; // Key Type: 1=OKP, 2=EC2, 3=RSA
    const alg = coseKey.get(3) as number; // Algorithm: -7=ES256, -257=RS256, etc.

    if (DemoConfig.debug) {
      console.log("COSE Key Type (kty):", kty);
      console.log("COSE Algorithm (alg):", alg);
    }

    // Handle ES256 (EC2) - Platform authenticators and some YubiKeys
    if (kty === 2 && alg === -7) {
      const x = coseKey.get(-2) as Uint8Array; // x-coordinate
      const y = coseKey.get(-3) as Uint8Array; // y-coordinate

      if (!x || !y) {
        console.error("COSE key missing x/y coordinates:", coseKey);
        throw new Error("Malformed ES256 COSE key: missing x or y");
      }

      if (DemoConfig.debug) {
        console.log("Extracting ES256 public key (EC2)");
      }
      const rawKey = new Uint8Array(1 + x.length + y.length);
      rawKey[0] = 0x04; // Uncompressed point format
      rawKey.set(x, 1);
      rawKey.set(y, 1 + x.length);

      return rawKey;
    }

    // Handle RS256 (RSA) - YubiKeys and Windows Hello
    if (kty === 3 && alg === -257) {
      const n = coseKey.get(-1) as Uint8Array; // Modulus
      const e = coseKey.get(-2) as Uint8Array; // Exponent

      if (!n || !e) {
        console.error("COSE key missing modulus/exponent:", coseKey);
        throw new Error("Malformed RS256 COSE key: missing n or e");
      }

      if (DemoConfig.debug) {
        console.log("Extracting RS256 public key (RSA)");
        console.log("Modulus length:", n.length);
        console.log("Exponent length:", e.length);
      }

      // For RS256, we need to convert to a format compatible with Stellar
      // RS256 uses PKCS#1 RSA public key format
      // However, Stellar Soroban currently only supports Secp256r1 (ES256)
      // We need to return the raw RSA key in a format that can be used

      // RSA public key format: modulus (n) + exponent (e)
      const rawKey = new Uint8Array(n.length + e.length);
      rawKey.set(n, 0);
      rawKey.set(e, n.length);

      console.warn("WARNING: RS256 key detected. Stellar Soroban smart wallets require ES256 (Secp256r1) keys.");
      console.warn("RS256 keys from YubiKeys may not work with the current smart wallet contract.");

      return rawKey;
    }

    // Handle other algorithms
    console.error("Unsupported key type or algorithm:", { kty, alg });
    throw new Error(`Unsupported COSE key: kty=${kty}, alg=${alg}. Supported: ES256 (kty=2, alg=-7) or RS256 (kty=3, alg=-257)`);
  }

  async getWalletBalanceByContract(contractId: string): Promise<bigint> {
    const sacClient = this.getSacClient();
    try {
      const tx = await sacClient.balance({
        id: contractId,
      });
      return tx.result;
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      throw error;
    }
  }

  deriveContractIdFromPasskeyId(base64CredentialId: string): string {
    const salt = StellarSdk.hash(Buffer.from(base64CredentialId));
    // The submitter account deploys the contract (MUST match submitter used in createWallet)
    const submitterAddress = StellarSdk.Address.fromString(this.submitterKeypair.publicKey());
    // Step 4: Derive network ID
    const networkId = StellarSdk.hash(Buffer.from(this.networkPassphrase));
    // Step 5: Build the preimage for the contract ID
    const contractIdPreimage = StellarSdk.xdr.HashIdPreimage.envelopeTypeContractId(
      new StellarSdk.xdr.HashIdPreimageContractId({
        networkId,
        contractIdPreimage: StellarSdk.xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new StellarSdk.xdr.ContractIdPreimageFromAddress({
            address: submitterAddress.toScAddress(),
            salt,
          })
        )
      })
    );

    // Step 6: Hash the preimage → contract ID
    const contractHash = StellarSdk.hash(contractIdPreimage.toXDR());
    const contractId = StellarSdk.StrKey.encodeContract(contractHash);

    return contractId;
  }

  /**
   * Checks if a contract exists on-chain by querying its ledger data.
   * Returns true if the contract exists, false otherwise.
   */
  async contractExists(contractId: string): Promise<boolean> {
    try {
      const rpcClient = new StellarSdk.rpc.Server(this.rpcUrl);
      const contractAddress = new StellarSdk.Contract(contractId).address();
      const key = StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance();
      await rpcClient.getContractData(contractAddress, key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Converts stroops (smallest Stellar unit) to XLM.
   * Returns a string to preserve precision for large values (bigint safe).
   * 1 XLM = 10,000,000 stroops
   */
  stroopsToXlm(stroops: bigint | number): string {
    const stroopsBigInt = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
    const whole = stroopsBigInt / 10_000_000n;
    const fraction = stroopsBigInt % 10_000_000n;
    const fractionStr = fraction.toString().padStart(7, '0').replace(/0+$/, '');
    return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
  }

  xlmToStroops(xlm: number): number {
    return Math.round(Number(xlm) * 10_000_000);
  }

  private getSacClient(): SacClient {
    return new SacClient({
      contractId: this.nativeContractId,
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
    });
  }

  async addFunds(contractId: string, amountToTransferXlm: number) {
    try {
      if (contractId === undefined || contractId === null) {
        throw new Error('Contract ID is required');
      }

      if (amountToTransferXlm === undefined || amountToTransferXlm === null) {
        throw new Error('Amount to transfer is required');
      }
      const amountToTransfer = this.xlmToStroops(Number(amountToTransferXlm));
      const sacClient = this.getSacClient();

      const horizonClient = new StellarSdk.Horizon.Server(this.horizonUrl, {
        allowHttp: true
      });
      const rpcClient = new StellarSdk.rpc.Server(this.rpcUrl);

      const submitterAccount = await horizonClient.loadAccount(this.submitterKeypair.publicKey());
      const submitterSigner = StellarSdk.contract.basicNodeSigner(this.submitterKeypair, this.networkPassphrase);

      const sacTx = await sacClient.transfer({
        from: this.submitterKeypair.publicKey(),
        to: contractId,
        amount: BigInt(amountToTransfer),
      });
      // Sign the authorization entries
      await sacTx.signAuthEntries({
        address: this.submitterKeypair.publicKey(),
        signAuthEntry: submitterSigner.signAuthEntry,
      });

      const sorobanOperation = sacTx.built.operations[0] as any;
      const invokeContract = sorobanOperation.func.invokeContract();
      const contract = StellarSdk.StrKey.encodeContract(invokeContract.contractAddress().contractId());

      const tmpTx = new StellarSdk.TransactionBuilder(submitterAccount, {
        fee: '0',
        networkPassphrase: this.networkPassphrase
      }).addOperation(StellarSdk.Operation.invokeContractFunction({
        contract,
        function: invokeContract.functionName().toString(),
        args: invokeContract.args(),
        auth: sorobanOperation.auth
      }))
        .setTimeout(5 * 60)
        .build();
      tmpTx.sign(this.submitterKeypair);

      const simulationRs = await rpcClient.simulateTransaction(tmpTx);
      if (!('transactionData' in simulationRs)) {
        throw new Error('Simulation failed');
      }
      const sorobanData = simulationRs.transactionData.build();
      const resourceFee = sorobanData.resourceFee().toBigInt();

      const realTransaction = StellarSdk.TransactionBuilder
        .cloneFrom(tmpTx, {
          fee: resourceFee.toString(),
          sorobanData
        })
        .build();
      realTransaction.sign(this.submitterKeypair);

      const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
        this.submitterKeypair,
        resourceFee.toString(),
        realTransaction,
        this.networkPassphrase
      );
      feeBumpTx.sign(this.submitterKeypair);
      const feeBumpTxResult = await rpcClient.sendTransaction(feeBumpTx);

      return feeBumpTxResult;
    } catch (error) {
      console.error('Error in transfer', error);
      if (error && typeof error === 'object' && 'response' in error) {
        console.error('Error response:', (error as { response: unknown }).response);
      }
      if (error instanceof Error) {
        console.error('Error message:', error.message);
      }
      throw error;
    }
  }
}
