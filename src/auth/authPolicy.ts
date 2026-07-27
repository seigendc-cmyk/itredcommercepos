export interface AuthIdentity {
  uid: string;
  email: string;
}

export type AuthStateResolution =
  | { status: 'signed_out' }
  | { status: 'invalid' }
  | { status: 'authenticated'; identity: AuthIdentity };

interface FirebaseUserIdentity {
  uid: string;
  email: string | null;
}

export function resolveAuthState(user: FirebaseUserIdentity | null): AuthStateResolution {
  if (!user) {
    return { status: 'signed_out' };
  }

  const uid = user.uid.trim();
  const email = user.email?.trim();
  if (!uid || !email) {
    return { status: 'invalid' };
  }

  return {
    status: 'authenticated',
    identity: { uid, email },
  };
}

export function isDemoLoginEnabled(isDevelopment: boolean, flag: string | undefined): boolean {
  return isDevelopment && flag === 'true';
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Google authentication failed. Please try again.';
}
