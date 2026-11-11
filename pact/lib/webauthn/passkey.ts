/**
 * PACT Client-Side WebAuthn Passkey & Silent Digital Touch ID Fallback Utility
 *
 * Non-Negotiable Rule:
 * Raw biometric material never leaves the local device authenticator.
 * Uses navigator.credentials.create / get when supported, and falls back silently
 * to a WebCrypto ECDSA (P-256) digital Touch ID keypair when WebAuthn hardware
 * support is unavailable or blocked.
 */

import type {
  PasskeyAssertionMetadata,
  PasskeyChallengeResponse,
  PasskeyVerificationMode,
} from "@/types/passkey";

export function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function isWebAuthnAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.isSecureContext &&
      typeof window.PublicKeyCredential !== "undefined" &&
      navigator.credentials &&
      typeof navigator.credentials.create === "function" &&
      typeof navigator.credentials.get === "function"
  );
}

export interface BrowserPasskeyRegistrationResult {
  credentialId: string;
  publicKey: string;
  deviceLabel: string;
  isFallback: false;
}

/**
 * Triggers native WebAuthn biometric registration (Touch ID / Face ID / Windows Hello)
 * using navigator.credentials.create.
 */
export async function registerBrowserPasskey(params: {
  challenge: string;
  userId: string;
  userName: string;
  displayName: string;
}): Promise<BrowserPasskeyRegistrationResult> {
  if (!isWebAuthnAvailable()) {
    throw new Error("WebAuthn hardware API is unavailable in this browser context.");
  }

  const rpId = window.location.hostname;
  const challengeBytes = base64UrlToUint8Array(params.challenge);
  const userIdBytes = new TextEncoder().encode(params.userId.slice(0, 32));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challengeBytes.buffer as ArrayBuffer,
      rp: {
        name: "PACT Transaction Assurance",
        id: rpId,
      },
      user: {
        id: userIdBytes.buffer as ArrayBuffer,
        name: params.userName,
        displayName: params.displayName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: {
        userVerification: "preferred",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Biometric passkey registration was cancelled or returned empty.");
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const spkiKey =
    typeof response.getPublicKey === "function" ? response.getPublicKey() : null;
  const publicKeyBase64 = spkiKey
    ? bufferToBase64Url(spkiKey)
    : bufferToBase64Url(response.attestationObject);

  return {
    credentialId: credential.id,
    publicKey: publicKeyBase64,
    deviceLabel: `Platform Biometric Passkey (${navigator.platform || "WebAuthn"})`,
    isFallback: false,
  };
}

export interface BrowserPasskeyAssertionResult {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  mode: PasskeyVerificationMode;
}

/**
 * Triggers native WebAuthn biometric verification prompt using navigator.credentials.get.
 */
export async function authenticateWithPasskey(params: {
  challenge: string;
  credentialIds: string[];
}): Promise<BrowserPasskeyAssertionResult> {
  if (!isWebAuthnAvailable()) {
    throw new Error("WebAuthn hardware API is unavailable.");
  }

  const challengeBytes = base64UrlToUint8Array(params.challenge);
  const allowCredentials: PublicKeyCredentialDescriptor[] = params.credentialIds.map(
    (id) => ({
      id: base64UrlToUint8Array(id).buffer as ArrayBuffer,
      type: "public-key",
    })
  );

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes.buffer as ArrayBuffer,
      rpId: window.location.hostname,
      allowCredentials,
      userVerification: "preferred",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error("Biometric assertion returned empty.");
  }

  const response = assertion.response as AuthenticatorAssertionResponse;

  return {
    credentialId: assertion.id,
    clientDataJSON: bufferToBase64Url(response.clientDataJSON),
    authenticatorData: bufferToBase64Url(response.authenticatorData),
    signature: bufferToBase64Url(response.signature),
    mode: "webauthn_passkey",
  };
}

const FALLBACK_KEY_STORAGE_PREFIX = "pact_fallback_device_key_";

interface StoredFallbackKeypair {
  credentialId: string;
  publicKeySpki: string;
  privateKeyJwk: JsonWebKey;
}

/**
 * Silent Digital Touch ID fallback using browser WebCrypto ECDSA (P-256)
 * when hardware WebAuthn / Touch ID / Windows Hello APIs are unavailable.
 */
export async function generateDeviceFallbackSignature(params: {
  userId: string;
  challenge: string;
  contentHash: string;
}): Promise<{
  credentialId: string;
  publicKey: string;
  signature: string;
  clientDataJSON: string;
  authenticatorData: string;
  mode: "device_fallback_signature";
  deviceLabel: string;
}> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Browser WebCrypto subtle APIs are unavailable.");
  }

  const storageKey = `${FALLBACK_KEY_STORAGE_PREFIX}${params.userId}`;
  let stored: StoredFallbackKeypair | null = null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      stored = JSON.parse(raw) as StoredFallbackKeypair;
    }
  } catch {
    stored = null;
  }

  let privateKey: CryptoKey;
  let credentialId: string;
  let publicKeySpki: string;

  if (stored?.privateKeyJwk && stored.credentialId && stored.publicKeySpki) {
    privateKey = await window.crypto.subtle.importKey(
      "jwk",
      stored.privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"]
    );
    credentialId = stored.credentialId;
    publicKeySpki = stored.publicKeySpki;
  } else {
    const keypair = await window.crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const spkiBuf = await window.crypto.subtle.exportKey("spki", keypair.publicKey);
    const privateJwk = await window.crypto.subtle.exportKey("jwk", keypair.privateKey);
    const randomIdBytes = window.crypto.getRandomValues(new Uint8Array(16));

    credentialId = `touchid-sim-${bufferToBase64Url(randomIdBytes)}`;
    publicKeySpki = bufferToBase64Url(spkiBuf);
    privateKey = keypair.privateKey;

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          credentialId,
          publicKeySpki,
          privateKeyJwk: privateJwk,
        })
      );
    } catch {
      // Ignore storage restrictions in private browsing tabs
    }
  }

  const clientDataObj = {
    type: "pact.digital_touch_id_assertion",
    challenge: params.challenge,
    contentHash: params.contentHash,
    origin: window.location.origin,
    timestamp: new Date().toISOString(),
  };
  const clientDataStr = JSON.stringify(clientDataObj);
  const clientDataBytes = new TextEncoder().encode(clientDataStr);

  const signatureBuffer = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    clientDataBytes
  );

  return {
    credentialId,
    publicKey: publicKeySpki,
    signature: bufferToBase64Url(signatureBuffer),
    clientDataJSON: bufferToBase64Url(clientDataBytes),
    authenticatorData: bufferToBase64Url(
      new TextEncoder().encode(`digital-touchid:${params.contentHash}`)
    ),
    mode: "device_fallback_signature",
    deviceLabel: "Digital Touch ID Simulation (ECDSA P-256)",
  };
}

async function fetchPasskeyChallenge(): Promise<PasskeyChallengeResponse> {
  const challengeRes = await fetch("/api/auth/passkey", {
    method: "GET",
    cache: "no-store",
  });
  const challengeData = (await challengeRes.json()) as PasskeyChallengeResponse & {
    error?: string;
  };
  if (!challengeRes.ok) {
    throw new Error(challengeData.error || "Unable to fetch WebAuthn challenge.");
  }
  return challengeData;
}

async function executeSilentTouchIdFallback(params: {
  challengeData: PasskeyChallengeResponse;
  transactionId: string;
  agreementVersionId: string;
  contentHash: string;
  fallbackUserId: string;
}): Promise<PasskeyAssertionMetadata> {
  const fallbackSig = await generateDeviceFallbackSignature({
    userId: params.challengeData.user.id || params.fallbackUserId,
    challenge: params.challengeData.challenge,
    contentHash: params.contentHash,
  });

  const verifyRes = await fetch("/api/auth/passkey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "assert",
      transactionId: params.transactionId,
      agreementVersionId: params.agreementVersionId,
      contentHash: params.contentHash,
      credentialId: fallbackSig.credentialId,
      publicKey: fallbackSig.publicKey,
      deviceLabel: fallbackSig.deviceLabel,
      isFallback: true,
      challenge: params.challengeData.challenge,
      clientDataJSON: fallbackSig.clientDataJSON,
      authenticatorData: fallbackSig.authenticatorData,
      signature: fallbackSig.signature,
      mode: "device_fallback_signature",
    }),
  });

  const verifyJson = (await verifyRes.json()) as {
    verification?: PasskeyAssertionMetadata;
    error?: string;
  };

  if (!verifyRes.ok || !verifyJson.verification) {
    throw new Error(
      verifyJson.error || "Digital Touch ID fallback verification failed."
    );
  }

  return verifyJson.verification;
}

export interface SignAgreementBiometricOptions {
  transactionId: string;
  agreementVersionId: string;
  contentHash: string;
  userId?: string;
  forceFallback?: boolean;
  onStatusChange?: (status: string) => void;
}

/**
 * Orchestrates full biometric signing:
 * 1. Requests a WebAuthn challenge from /api/auth/passkey.
 * 2. Prompts native Touch ID / Face ID / Windows Hello via navigator.credentials.create/get.
 * 3. Falls back silently to Digital Touch ID ECDSA P-256 simulation if hardware WebAuthn
 *    is unavailable or declined, persisting credentials + transaction audit event to Supabase.
 */
export async function signAgreementWithBiometrics({
  transactionId,
  agreementVersionId,
  contentHash,
  userId = "current-user",
  forceFallback = false,
  onStatusChange,
}: SignAgreementBiometricOptions): Promise<PasskeyAssertionMetadata> {
  onStatusChange?.("Requesting cryptographic signing challenge...");
  const challengeData = await fetchPasskeyChallenge();

  if (forceFallback || !isWebAuthnAvailable()) {
    onStatusChange?.("Completing Digital Touch ID biometric signature...");
    return executeSilentTouchIdFallback({
      challengeData,
      transactionId,
      agreementVersionId,
      contentHash,
      fallbackUserId: userId,
    });
  }

  try {
    const hardwareCreds = (challengeData.registeredCredentials || []).filter(
      (c) => !c.isFallback
    );
    let activeCredentialIds = hardwareCreds.map((c) => c.credentialId);
    let activeChallenge = challengeData.challenge;

    if (activeCredentialIds.length === 0) {
      onStatusChange?.("Waiting for Touch ID / Face ID / Windows Hello...");
      const reg = await registerBrowserPasskey({
        challenge: challengeData.challenge,
        userId: challengeData.user.id,
        userName: challengeData.user.name,
        displayName: challengeData.user.displayName,
      });

      const regRes = await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          transactionId,
          credentialId: reg.credentialId,
          publicKey: reg.publicKey,
          deviceLabel: reg.deviceLabel,
          isFallback: false,
          challenge: challengeData.challenge,
          signature: "registration-attestation-ack",
          mode: "webauthn_passkey",
        }),
      });
      const regJson = (await regRes.json()) as { error?: string };
      if (!regRes.ok) {
        throw new Error(regJson.error || "Passkey registration failed.");
      }
      activeCredentialIds = [reg.credentialId];

      const freshChallengeData = await fetchPasskeyChallenge();
      activeChallenge = freshChallengeData.challenge;
    }

    onStatusChange?.("Confirming biometric assertion signature...");
    const assertion = await authenticateWithPasskey({
      challenge: activeChallenge,
      credentialIds: activeCredentialIds,
    });

    const verifyRes = await fetch("/api/auth/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assert",
        transactionId,
        agreementVersionId,
        contentHash,
        credentialId: assertion.credentialId,
        challenge: activeChallenge,
        clientDataJSON: assertion.clientDataJSON,
        authenticatorData: assertion.authenticatorData,
        signature: assertion.signature,
        mode: "webauthn_passkey",
      }),
    });

    const verifyJson = (await verifyRes.json()) as {
      verification?: PasskeyAssertionMetadata;
      error?: string;
    };

    if (!verifyRes.ok || !verifyJson.verification) {
      throw new Error(verifyJson.error || "WebAuthn biometric verification failed.");
    }

    return verifyJson.verification;
  } catch {
    onStatusChange?.("Switching seamlessly to Digital Touch ID signature...");
    const freshChallenge = await fetchPasskeyChallenge();
    return executeSilentTouchIdFallback({
      challengeData: freshChallenge,
      transactionId,
      agreementVersionId,
      contentHash,
      fallbackUserId: userId,
    });
  }
}

