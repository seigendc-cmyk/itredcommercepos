import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAuthErrorMessage,
  isDemoLoginEnabled,
  resolveAuthState,
} from './authPolicy';

test('restores a valid Firebase user identity', () => {
  assert.deepEqual(
    resolveAuthState({
      uid: '  firebase-user-123  ',
      email: '  vendor@example.com  ',
    }),
    {
      status: 'authenticated',
      identity: {
        uid: 'firebase-user-123',
        email: 'vendor@example.com',
      },
    },
  );
});

test('keeps a signed-out Firebase session unauthenticated', () => {
  assert.deepEqual(resolveAuthState(null), { status: 'signed_out' });
});

test('rejects Firebase users without a usable email or uid', () => {
  assert.deepEqual(resolveAuthState({ uid: 'firebase-user-123', email: null }), {
    status: 'invalid',
  });
  assert.deepEqual(resolveAuthState({ uid: 'firebase-user-123', email: '   ' }), {
    status: 'invalid',
  });
  assert.deepEqual(resolveAuthState({ uid: '   ', email: 'vendor@example.com' }), {
    status: 'invalid',
  });
});

test('enables demo login only for an explicit development flag', () => {
  assert.equal(isDemoLoginEnabled(true, 'true'), true);
  assert.equal(isDemoLoginEnabled(true, 'false'), false);
  assert.equal(isDemoLoginEnabled(true, undefined), false);
  assert.equal(isDemoLoginEnabled(false, 'true'), false);
  assert.equal(isDemoLoginEnabled(false, 'TRUE'), false);
});

test('returns a safe authentication error message', () => {
  assert.equal(getAuthErrorMessage(new Error('Popup was blocked.')), 'Popup was blocked.');
  assert.equal(
    getAuthErrorMessage({ code: 'auth/popup-closed-by-user' }),
    'Google authentication failed. Please try again.',
  );
});
