import assert from 'node:assert/strict';
import test from 'node:test';
import { isVersionAtLeast, MINIMUM_REMOTE_SSH_VERSION } from '../remoteSshCompatibility';

test('accepts Remote - SSH 0.126.0 and newer', () => {
  assert.equal(isVersionAtLeast('0.126.0', MINIMUM_REMOTE_SSH_VERSION), true);
  assert.equal(isVersionAtLeast('0.127.0', MINIMUM_REMOTE_SSH_VERSION), true);
  assert.equal(isVersionAtLeast('1.0.0', MINIMUM_REMOTE_SSH_VERSION), true);
});

test('rejects older or invalid Remote - SSH versions', () => {
  assert.equal(isVersionAtLeast('0.125.9', MINIMUM_REMOTE_SSH_VERSION), false);
  assert.equal(isVersionAtLeast('unknown', MINIMUM_REMOTE_SSH_VERSION), false);
});
