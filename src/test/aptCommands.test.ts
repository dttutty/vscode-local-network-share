import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAptInstallCommand,
  createAptUpgradeCommand,
  createOneTimeAptCommand,
  createPersistentAptCommand,
  REMOVE_PERSISTENT_APT_PROXY_COMMAND,
} from '../aptCommands';

test('builds APT commands with the HTTP proxy port', () => {
  assert.match(createOneTimeAptCommand(17891), /http:\/\/127\.0\.0\.1:17891.* update$/u);
  assert.match(createAptUpgradeCommand(17891), /http:\/\/127\.0\.0\.1:17891.* upgrade$/u);
  assert.match(createAptInstallCommand(17891), /http:\/\/127\.0\.0\.1:17891.* install PACKAGE_NAME$/u);
  assert.match(createPersistentAptCommand(17891), /99local-network-share/u);
  assert.equal(REMOVE_PERSISTENT_APT_PROXY_COMMAND, 'sudo rm -f /etc/apt/apt.conf.d/99local-network-share');
});
