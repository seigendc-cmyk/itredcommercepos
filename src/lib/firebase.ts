import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  requireFirebaseConfiguration,
  resolveFirebaseEnvironment,
} from "../config/firebaseEnvironment";

const processEnvironment = (
  typeof process !== "undefined" ? process.env : {}
);

const viteEnvironment = import.meta.env ?? {};
const runtimeEnvironment = resolveFirebaseEnvironment(
  processEnvironment,
  viteEnvironment,
);
const { firebaseConfig, databaseId: configuredDatabaseId } =
  requireFirebaseConfiguration(runtimeEnvironment);

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
  configuredDatabaseId ||
  "ai-studio-6dd086fa-b537-4e03-b916-32eee1121008";

export const db = getFirestore(app, databaseId);
export const storage = getStorage(app);

export const firebaseProjectId =
  firebaseConfig.projectId;

export default app;
