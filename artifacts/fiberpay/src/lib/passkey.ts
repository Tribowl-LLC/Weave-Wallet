import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

function bufferToBase64URLString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateChallenge(): string {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return bufferToBase64URLString(challenge.buffer as ArrayBuffer);
}

export function isBiometricsAvailable(): boolean {
  return window.PublicKeyCredential !== undefined;
}

export async function registerPasskey(userHandle: string): Promise<string> {
  const hostname = window.location.hostname;
  
  const options = {
    rp: {
      name: "FiberPay",
      id: hostname,
    },
    user: {
      id: userHandle,
      name: "fiberpay-user",
      displayName: "FiberPay User",
    },
    challenge: generateChallenge(),
    pubKeyCredParams: [
      { type: "public-key" as const, alg: -7 },
      { type: "public-key" as const, alg: -257 }
    ],
    authenticatorSelection: {
      residentKey: "preferred" as const,
      userVerification: "required" as const,
    },
    attestation: "none" as const,
    timeout: 60000,
  };

  const attResp = await startRegistration({ optionsJSON: options as any });
  return attResp.id;
}

export async function authenticatePasskey(credentialId: string): Promise<boolean> {
  const hostname = window.location.hostname;
  
  const options = {
    challenge: generateChallenge(),
    rpId: hostname,
    allowCredentials: [
      {
        id: credentialId,
        type: "public-key" as const,
      }
    ],
    userVerification: "required" as const,
    timeout: 60000,
  };

  const asseResp = await startAuthentication({ optionsJSON: options as any });
  return !!asseResp.id;
}
