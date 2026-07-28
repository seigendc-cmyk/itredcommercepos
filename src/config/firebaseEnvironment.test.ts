import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EnvironmentValues,
  requireFirebaseConfiguration,
  resolveFirebaseEnvironment,
} from './firebaseEnvironment';

const completeEnvironment: EnvironmentValues = {
  VITE_FIREBASE_API_KEY: 'process-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'process.firebaseapp.test',
  VITE_FIREBASE_PROJECT_ID: 'process-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'process.test',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:process',
  VITE_DATABASE_ID: '(default)',
};

test('uses process environment values in Node tests', () => {
  const resolved = resolveFirebaseEnvironment(completeEnvironment, {});
  const configuration = requireFirebaseConfiguration(resolved);
  assert.equal(configuration.firebaseConfig.apiKey, 'process-api-key');
  assert.equal(configuration.databaseId, '(default)');
});

test('Vite environment values take precedence when both sources provide a value', () => {
  const resolved = resolveFirebaseEnvironment(completeEnvironment, {
    VITE_FIREBASE_API_KEY: 'vite-api-key',
    VITE_FIREBASE_PROJECT_ID: 'vite-project',
  });
  const configuration = requireFirebaseConfiguration(resolved);
  assert.equal(configuration.firebaseConfig.apiKey, 'vite-api-key');
  assert.equal(configuration.firebaseConfig.projectId, 'vite-project');
  assert.equal(configuration.firebaseConfig.authDomain, 'process.firebaseapp.test');
});

test('an empty Vite environment does not hide the populated process environment', () => {
  const resolved = resolveFirebaseEnvironment(completeEnvironment, {});
  assert.deepEqual(resolved, completeEnvironment);
  assert.doesNotThrow(() => requireFirebaseConfiguration(resolved));
});

test('missing required Firebase variables still fail closed', () => {
  assert.throws(
    () => requireFirebaseConfiguration({}),
    /Missing Firebase environment variables: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId/,
  );
});

test('validation errors name missing keys without exposing configured values', () => {
  const secretValue = 'do-not-print-this-value';
  assert.throws(
    () => requireFirebaseConfiguration({
      ...completeEnvironment,
      VITE_FIREBASE_API_KEY: secretValue,
      VITE_FIREBASE_APP_ID: '',
    }),
    error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /appId/);
      assert.doesNotMatch(error.message, new RegExp(secretValue));
      return true;
    },
  );
});
