import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const runtimeEnvironment = import.meta.env ?? (
  typeof process !== "undefined" ? process.env : {}
);

const requiredEnvironmentVariables = {
  apiKey: runtimeEnvironment.VITE_FIREBASE_API_KEY,
  authDomain: runtimeEnvironment.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: runtimeEnvironment.VITE_FIREBASE_PROJECT_ID,
  storageBucket: runtimeEnvironment.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: runtimeEnvironment.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: runtimeEnvironment.VITE_FIREBASE_APP_ID,
};

const missingEnvironmentVariables = Object.entries(
  requiredEnvironmentVariables,
)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnvironmentVariables.length > 0) {
  throw new Error(
    `Missing Firebase environment variables: ${missingEnvironmentVariables.join(", ")}`,
  );
}

const firebaseConfig = {
  apiKey: requiredEnvironmentVariables.apiKey,
  authDomain: requiredEnvironmentVariables.authDomain,
  projectId: requiredEnvironmentVariables.projectId,
  storageBucket: requiredEnvironmentVariables.storageBucket,
  messagingSenderId: requiredEnvironmentVariables.messagingSenderId,
  appId: requiredEnvironmentVariables.appId,
};

export const app =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account",
});

export const databaseId =
  runtimeEnvironment.VITE_DATABASE_ID ||
  "ai-studio-6dd086fa-b537-4e03-b916-32eee1121008";

export const db = getFirestore(app, databaseId);
export const storage = getStorage(app);

export const firebaseProjectId =
  requiredEnvironmentVariables.projectId;

export default app;
