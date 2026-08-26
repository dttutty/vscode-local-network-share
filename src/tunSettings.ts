export type TunRoutingMode = 'namespace' | 'global';
export type TunDnsMode = 'preserve' | 'tunnel';

export interface TunSetupOptions {
  routingMode: TunRoutingMode;
  interfaceName: string;
  mtu: number;
  dnsMode: TunDnsMode;
}

export interface TunSetupContext {
  target?: string;
  socksPort: number;
}

export function validateTunSetupOptions(value: unknown): TunSetupOptions {
  if (!value || typeof value !== 'object') {
    throw new Error('The TUN settings are missing.');
  }
  const candidate = value as Partial<TunSetupOptions>;
  if (candidate.routingMode !== 'namespace' && candidate.routingMode !== 'global') {
    throw new Error('Choose a supported routing mode.');
  }
  if (typeof candidate.interfaceName !== 'string' || !/^[A-Za-z0-9_.-]{1,15}$/u.test(candidate.interfaceName)) {
    throw new Error('The interface name must contain 1–15 letters, numbers, dots, underscores, or hyphens.');
  }
  if (!Number.isInteger(candidate.mtu) || (candidate.mtu ?? 0) < 576 || (candidate.mtu ?? 0) > 9000) {
    throw new Error('MTU must be an integer between 576 and 9000.');
  }
  if (candidate.dnsMode !== 'preserve' && candidate.dnsMode !== 'tunnel') {
    throw new Error('Choose a supported DNS mode.');
  }
  return candidate as TunSetupOptions;
}

export function createTunSetupPlan(options: TunSetupOptions, context: TunSetupContext): string {
  const routing = options.routingMode === 'namespace'
    ? 'Isolated network namespace (recommended)'
    : 'Global host routing (high risk)';
  const dns = options.dnsMode === 'preserve'
    ? 'Keep the server’s current DNS configuration'
    : 'Route DNS through the tunnel (advanced)';
  return [
    'Advanced TUN setup plan — review only',
    '',
    `SSH target: ${context.target ?? 'not selected'}`,
    `SOCKS5 endpoint: socks5h://127.0.0.1:${context.socksPort}`,
    `Routing: ${routing}`,
    `Interface: ${options.interfaceName}`,
    `MTU: ${options.mtu}`,
    `DNS: ${dns}`,
    '',
    'Safety requirement: maintain physical access or BMC/IPMI/iDRAC/iLO access.',
    'No interface, route, DNS, or sudo change was executed by copying this plan.',
  ].join('\n');
}
