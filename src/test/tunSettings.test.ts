import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTunSetupPlan,
  createTunStartCommand,
  createTunStopCommand,
  determineTunWorkflowStage,
  validateTunSetupOptions,
} from '../tunSettings';

test('maps Advanced TUN progress to Check, Start, and Stop', () => {
  assert.equal(determineTunWorkflowStage({ checking: false, tunnelPhase: 'idle', hasCapabilities: false, stopped: false }), 'check');
  assert.equal(determineTunWorkflowStage({ checking: true, tunnelPhase: 'idle', hasCapabilities: true, stopped: false }), 'check');
  assert.equal(determineTunWorkflowStage({ checking: false, tunnelPhase: 'idle', hasCapabilities: true, stopped: false }), 'start');
  assert.equal(determineTunWorkflowStage({ checking: false, tunnelPhase: 'starting', hasCapabilities: true, stopped: false }), 'start');
  assert.equal(determineTunWorkflowStage({ checking: false, tunnelPhase: 'active', hasCapabilities: true, stopped: false }), 'stop');
  assert.equal(determineTunWorkflowStage({ checking: true, tunnelPhase: 'active', hasCapabilities: true, stopped: false }), 'stop');
  assert.equal(determineTunWorkflowStage({ checking: false, tunnelPhase: 'idle', hasCapabilities: true, stopped: true }), 'stop');
});

test('validates safe TUN setup options', () => {
  assert.deepEqual(validateTunSetupOptions({
    routingMode: 'namespace',
    interfaceName: 'tun0',
    mtu: 1500,
    dnsMode: 'preserve',
  }), {
    routingMode: 'namespace',
    interfaceName: 'tun0',
    mtu: 1500,
    dnsMode: 'preserve',
  });
});

test('rejects unsafe TUN option values', () => {
  assert.throws(() => validateTunSetupOptions({
    routingMode: 'global',
    interfaceName: 'tun 0; rm',
    mtu: 1500,
    dnsMode: 'preserve',
  }), /interface name/u);
  assert.throws(() => validateTunSetupOptions({
    routingMode: 'namespace',
    interfaceName: 'tun0',
    mtu: 100,
    dnsMode: 'preserve',
  }), /MTU/u);
});

test('creates a non-executing setup plan', () => {
  const plan = createTunSetupPlan({
    routingMode: 'namespace',
    interfaceName: 'tun0',
    mtu: 1500,
    dnsMode: 'preserve',
  }, { target: 'markov', socksPort: 17890 });
  assert.match(plan, /review only/u);
  assert.match(plan, /markov/u);
  assert.match(plan, /127\.0\.0\.1:17890/u);
  assert.match(plan, /No interface, route, DNS, or sudo change was executed/u);
});

test('creates a reviewable isolated namespace start and stop command', () => {
  const options = {
    routingMode: 'namespace' as const,
    interfaceName: 'tun0',
    mtu: 1500,
    dnsMode: 'preserve' as const,
  };
  const start = createTunStartCommand(options, { target: 'markov', socksPort: 17890 });
  const stop = createTunStopCommand(options);
  assert.match(start, /^sudo bash -lc /u);
  assert.match(start, /ip netns add/u);
  assert.match(start, /socat/u);
  assert.match(start, /socks5:\/\/192\.0\.2\.1:\$SOCKS_PORT/u);
  assert.equal(start.includes('\n'), false);
  assert.match(stop, /ip netns del/u);
});

test('creates a global command that preserves SSH recovery routing', () => {
  const start = createTunStartCommand({
    routingMode: 'global',
    interfaceName: 'tun0',
    mtu: 1400,
    dnsMode: 'preserve',
  }, { target: 'markov', socksPort: 17890 });
  assert.match(start, /SSH_CLIENT/u);
  assert.match(start, /default-route/u);
  assert.match(start, /dns-routes/u);
});

test('rejects DNS-through-TUN with the OpenSSH SOCKS endpoint', () => {
  assert.throws(() => createTunStartCommand({
    routingMode: 'namespace',
    interfaceName: 'tun0',
    mtu: 1500,
    dnsMode: 'tunnel',
  }, { target: 'markov', socksPort: 17890 }), /not available/u);
});
