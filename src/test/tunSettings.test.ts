import assert from 'node:assert/strict';
import test from 'node:test';
import { createTunSetupPlan, validateTunSetupOptions } from '../tunSettings';

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
