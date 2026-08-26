import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRemoteSshTarget, sanitizeTarget } from '../remoteTarget';

test('parses a normal Remote-SSH authority', () => {
  assert.equal(parseRemoteSshTarget('ssh-remote+production'), 'production');
});

test('decodes a URI-encoded SSH target', () => {
  assert.equal(parseRemoteSshTarget('ssh-remote+user%40example.com'), 'user@example.com');
});

test('parses a hex-encoded JSON authority', () => {
  const authority = Buffer.from(JSON.stringify({ hostName: 'dev-box' }), 'utf8').toString('hex');
  assert.equal(parseRemoteSshTarget(`ssh-remote+${authority}`), 'dev-box');
});

test('rejects non-SSH authorities and option-like targets', () => {
  assert.equal(parseRemoteSshTarget('dev-container+production'), undefined);
  assert.equal(sanitizeTarget('-oProxyCommand=bad'), undefined);
  assert.equal(sanitizeTarget('host\nother'), undefined);
});

test('allows common aliases and user-at-host destinations', () => {
  assert.equal(sanitizeTarget('dev_server-1'), 'dev_server-1');
  assert.equal(sanitizeTarget('alice@example.com'), 'alice@example.com');
});
