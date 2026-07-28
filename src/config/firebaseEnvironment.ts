export type EnvironmentValues = Record<string, string | undefined>;

const REQUIRED_FIREBASE_VARIABLES = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const;

export interface FirebaseRuntimeConfiguration {
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  databaseId: string | undefined;
}

export function resolveFirebaseEnvironment(
  processEnvironment: EnvironmentValues = {},
  viteEnvironment: EnvironmentValues = {},
): EnvironmentValues {
  return {
    ...processEnvironment,
    ...viteEnvironment,
  };
}

export function requireFirebaseConfiguration(
  environment: EnvironmentValues,
): FirebaseRuntimeConfiguration {
  const values = Object.fromEntries(
    Object.entries(REQUIRED_FIREBASE_VARIABLES).map(([configKey, environmentKey]) => [
      configKey,
      environment[environmentKey]?.trim(),
    ]),
  ) as Record<keyof typeof REQUIRED_FIREBASE_VARIABLES, string | undefined>;

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Firebase environment variables: ${missing.join(', ')}`);
  }

  return {
    firebaseConfig: {
      apiKey: values.apiKey!,
      authDomain: values.authDomain!,
      projectId: values.projectId!,
      storageBucket: values.storageBucket!,
      messagingSenderId: values.messagingSenderId!,
      appId: values.appId!,
    },
    databaseId: environment.VITE_DATABASE_ID?.trim() || undefined,
  };
}
