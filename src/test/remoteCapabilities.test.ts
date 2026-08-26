import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRemoteProbeArguments, parseRemoteCapabilities } from '../remoteCapabilities';

test('parses sudo and complete TUN support', () => {
  assert.deepEqual(
    parseRemoteCapabilities('OS=Linux\nSUDO=passwordless\nTUN=yes\nTUN2SOCKS=yes\nSOCAT=yes\nIP=yes\n'),
    {
      operatingSystem: 'Linux',
      sudoAccess: 'passwordless',
      tunDevice: true,
      tun2socks: true,
      socat: true,
      ipCommand: true,
    },
  );
});

test('handles a sudo group member with missing TUN dependencies', () => {
  const capabilities = parseRemoteCapabilities('OS=Linux\nSUDO=member\nTUN=no\nTUN2SOCKS=no\nSOCAT=no\nIP=yes\n');
  assert.equal(capabilities.sudoAccess, 'member');
  assert.equal(capabilities.tunDevice, false);
  assert.equal(capabilities.tun2socks, false);
  assert.equal(capabilities.socat, false);
  assert.equal(capabilities.ipCommand, true);
});

test('builds a non-interactive SSH capability probe', () => {
  const args = buildRemoteProbeArguments(
    {
      sshPath: 'ssh',
      sshTarget: 'dev-server',
      sshConfigFile: '/tmp/test config',
      connectTimeoutSeconds: 12,
    },
    'dev-server',
  );
  assert.deepEqual(args.slice(0, 7), ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', '-F', '/tmp/test config']);
  assert.equal(args[7], 'dev-server');
  assert.equal(args[8], 'sh');
  assert.equal(args[9], '-lc');
  assert.match(args[10], /sudo -n true/u);
});
