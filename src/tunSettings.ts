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

export function createTunStartCommand(options: TunSetupOptions, context: TunSetupContext): string {
  const validated = validateTunSetupOptions(options);
  if (!Number.isInteger(context.socksPort) || context.socksPort < 1024 || context.socksPort > 65535) {
    throw new Error('The SOCKS5 port must be an integer between 1024 and 65535.');
  }
  if (validated.dnsMode === 'tunnel') {
    throw new Error('DNS-through-TUN is not available with the OpenSSH SOCKS endpoint. Keep the server DNS setting.');
  }
  return validated.routingMode === 'namespace'
    ? createNamespaceStartCommand(validated, context.socksPort)
    : createGlobalStartCommand(validated, context.socksPort);
}

export function createTunStopCommand(options: TunSetupOptions): string {
  const validated = validateTunSetupOptions(options);
  const stateDirectory = `/run/remote-local-network-share-${validated.interfaceName}`;
  if (validated.routingMode === 'namespace') {
    const namespace = `lns-${validated.interfaceName}`;
    return privilegedShellCommand([
      'set -eu',
      `STATE=${quoteForShell(stateDirectory)}`,
      `NS=${quoteForShell(namespace)}`,
      'for file in "$STATE"/tun2socks.pid "$STATE"/socks-relay.pid "$STATE"/dns-relay.pid; do if [ -f "$file" ]; then kill "$(cat "$file")" 2>/dev/null || true; fi; done',
      'ip netns del "$NS" 2>/dev/null || true',
      'ip link del lns-host 2>/dev/null || true',
      'rm -rf "/etc/netns/$NS" "$STATE"',
      'echo "Advanced TUN namespace stopped."',
    ]);
  }
  return privilegedShellCommand([
    'set -eu',
    `STATE=${quoteForShell(stateDirectory)}`,
    'if [ -f "$STATE/tun2socks.pid" ]; then kill "$(cat "$STATE/tun2socks.pid")" 2>/dev/null || true; fi',
    'if [ -s "$STATE/default-route" ]; then ip route replace $(cat "$STATE/default-route"); fi',
    'if [ -s "$STATE/ssh-route" ]; then ip route replace $(cat "$STATE/ssh-route"); elif [ -s "$STATE/ssh-peer" ]; then ip route del "$(cat "$STATE/ssh-peer")/32" 2>/dev/null || true; fi',
    'if [ -f "$STATE/dns-routes" ]; then while IFS="|" read -r dns route; do [ -n "$dns" ] || continue; if [ -n "$route" ]; then ip route replace $route; else ip route del "$dns/32" 2>/dev/null || true; fi; done <"$STATE/dns-routes"; fi',
    `ip link del ${quoteForShell(validated.interfaceName)} 2>/dev/null || true`,
    'rm -rf "$STATE"',
    'echo "Advanced TUN global routing stopped and the original default route was restored."',
  ]);
}

function createNamespaceStartCommand(options: TunSetupOptions, socksPort: number): string {
  const namespace = `lns-${options.interfaceName}`;
  const stateDirectory = `/run/remote-local-network-share-${options.interfaceName}`;
  return privilegedShellCommand([
    'set -eu',
    `STATE=${quoteForShell(stateDirectory)}`,
    `NS=${quoteForShell(namespace)}`,
    `TUN=${quoteForShell(options.interfaceName)}`,
    `MTU=${options.mtu}`,
    `SOCKS_PORT=${socksPort}`,
    'command -v tun2socks >/dev/null || { echo "tun2socks is not installed." >&2; exit 1; }',
    'command -v socat >/dev/null || { echo "socat is required for isolated namespace mode." >&2; exit 1; }',
    'test -c /dev/net/tun || { echo "/dev/net/tun is unavailable." >&2; exit 1; }',
    '! ip netns list | grep -Eq "^${NS}( |$)" || { echo "Network namespace $NS already exists; stop it first." >&2; exit 1; }',
    `DNS_SERVER=$(awk '$1 == "nameserver" && $2 ~ /^[0-9.]+$/ { print $2; exit }' /etc/resolv.conf)`,
    'test -n "$DNS_SERVER" || { echo "No IPv4 DNS server was found in /etc/resolv.conf." >&2; exit 1; }',
    'mkdir -p "$STATE" "/etc/netns/$NS"',
    'ip netns add "$NS"',
    'ip link add lns-host type veth peer name lns-ns',
    'ip addr add 192.0.2.1/30 dev lns-host',
    'ip link set lns-host up',
    'ip link set lns-ns netns "$NS"',
    'ip netns exec "$NS" ip link set lo up',
    'ip netns exec "$NS" ip addr add 192.0.2.2/30 dev lns-ns',
    'ip netns exec "$NS" ip link set lns-ns up',
    'ip netns exec "$NS" ip tuntap add mode tun dev "$TUN"',
    'ip netns exec "$NS" ip addr add 198.18.0.1/15 dev "$TUN"',
    'ip netns exec "$NS" ip link set "$TUN" mtu "$MTU" up',
    'nohup socat "TCP-LISTEN:${SOCKS_PORT},bind=192.0.2.1,reuseaddr,fork" "TCP:127.0.0.1:${SOCKS_PORT}" >"$STATE/socks-relay.log" 2>&1 & echo $! >"$STATE/socks-relay.pid"',
    'nohup socat "UDP4-RECVFROM:53,bind=192.0.2.1,reuseaddr,fork" "UDP4-SENDTO:${DNS_SERVER}:53" >"$STATE/dns-relay.log" 2>&1 & echo $! >"$STATE/dns-relay.pid"',
    'printf "nameserver 192.0.2.1\\n" >"/etc/netns/$NS/resolv.conf"',
    'nohup ip netns exec "$NS" tun2socks --device "tun://$TUN" --proxy "socks5://192.0.2.1:$SOCKS_PORT" --mtu "$MTU" >"$STATE/tun2socks.log" 2>&1 & echo $! >"$STATE/tun2socks.pid"',
    'sleep 1',
    'kill -0 "$(cat "$STATE/tun2socks.pid")" 2>/dev/null || { cat "$STATE/tun2socks.log" >&2; exit 1; }',
    'ip netns exec "$NS" ip route replace default via 198.18.0.1 dev "$TUN"',
    'LOGIN_USER=${SUDO_USER:-$(id -un)}',
    'echo "Advanced TUN namespace is ready."',
    'echo "Run an isolated shell with: sudo ip netns exec $NS sudo -u $LOGIN_USER -H ${SHELL:-/bin/sh}"',
  ]);
}

function createGlobalStartCommand(options: TunSetupOptions, socksPort: number): string {
  const stateDirectory = `/run/remote-local-network-share-${options.interfaceName}`;
  return privilegedShellCommand([
    'set -eu',
    `STATE=${quoteForShell(stateDirectory)}`,
    `TUN=${quoteForShell(options.interfaceName)}`,
    `MTU=${options.mtu}`,
    `SOCKS_PORT=${socksPort}`,
    'command -v tun2socks >/dev/null || { echo "tun2socks is not installed." >&2; exit 1; }',
    'test -c /dev/net/tun || { echo "/dev/net/tun is unavailable." >&2; exit 1; }',
    'ORIGINAL_DEFAULT=$(ip -4 route show default | head -n1)',
    'test -n "$ORIGINAL_DEFAULT" || { echo "No IPv4 default route was found." >&2; exit 1; }',
    `ORIGINAL_DEV=$(printf "%s\\n" "$ORIGINAL_DEFAULT" | awk '{for (i=1;i<=NF;i++) if ($i=="dev") {print $(i+1); exit}}')`,
    `ORIGINAL_VIA=$(printf "%s\\n" "$ORIGINAL_DEFAULT" | awk '{for (i=1;i<=NF;i++) if ($i=="via") {print $(i+1); exit}}')`,
    'test -n "$ORIGINAL_DEV" || { echo "The original default-route interface could not be detected." >&2; exit 1; }',
    'SSH_LOOKUP=$(ip -4 route get "$SSH_PEER" | head -n1)',
    `SSH_DEV=$(printf "%s\\n" "$SSH_LOOKUP" | awk '{for (i=1;i<=NF;i++) if ($i=="dev") {print $(i+1); exit}}')`,
    `SSH_VIA=$(printf "%s\\n" "$SSH_LOOKUP" | awk '{for (i=1;i<=NF;i++) if ($i=="via") {print $(i+1); exit}}')`,
    'test -n "$SSH_DEV" || { echo "The SSH recovery-route interface could not be detected." >&2; exit 1; }',
    'PREVIOUS_SSH_ROUTE=$(ip -4 route show "$SSH_PEER/32" | head -n1 || true)',
    'mkdir -p "$STATE"',
    'printf "%s\\n" "$ORIGINAL_DEFAULT" >"$STATE/default-route"',
    'printf "%s\\n" "$SSH_PEER" >"$STATE/ssh-peer"',
    'printf "%s\\n" "$PREVIOUS_SSH_ROUTE" >"$STATE/ssh-route"',
    'if [ -n "$SSH_VIA" ]; then ip route replace "$SSH_PEER/32" via "$SSH_VIA" dev "$SSH_DEV"; else ip route replace "$SSH_PEER/32" dev "$SSH_DEV"; fi',
    `DNS_SERVERS=$(awk '$1 == "nameserver" && $2 ~ /^[0-9.]+$/ { print $2 }' /etc/resolv.conf)`,
    ': >"$STATE/dns-routes"',
    'for DNS_SERVER in $DNS_SERVERS; do PREVIOUS_DNS_ROUTE=$(ip -4 route show "$DNS_SERVER/32" | head -n1 || true); printf "%s|%s\\n" "$DNS_SERVER" "$PREVIOUS_DNS_ROUTE" >>"$STATE/dns-routes"; if [ -n "$ORIGINAL_VIA" ]; then ip route replace "$DNS_SERVER/32" via "$ORIGINAL_VIA" dev "$ORIGINAL_DEV"; else ip route replace "$DNS_SERVER/32" dev "$ORIGINAL_DEV"; fi; done',
    'ip tuntap add mode tun dev "$TUN"',
    'ip addr add 198.18.0.1/15 dev "$TUN"',
    'ip link set "$TUN" mtu "$MTU" up',
    'nohup tun2socks --device "tun://$TUN" --proxy "socks5://127.0.0.1:$SOCKS_PORT" --mtu "$MTU" >"$STATE/tun2socks.log" 2>&1 & echo $! >"$STATE/tun2socks.pid"',
    'sleep 1',
    'kill -0 "$(cat "$STATE/tun2socks.pid")" 2>/dev/null || { cat "$STATE/tun2socks.log" >&2; exit 1; }',
    'ip route replace default via 198.18.0.1 dev "$TUN" metric 1',
    'echo "Advanced TUN global routing is active. Keep this SSH session open and retain recovery access."',
  ], true);
}

function privilegedShellCommand(statements: string[], captureSshPeer = false): string {
  const script = quoteForShell(statements.join('; '));
  if (captureSshPeer) {
    return `SSH_PEER="\${SSH_CLIENT%% *}"; if [ -z "$SSH_PEER" ]; then echo "SSH_CLIENT is unavailable; refusing global routing without a recovery route." >&2; else sudo env SSH_PEER="$SSH_PEER" bash -lc ${script}; fi`;
  }
  return `sudo bash -lc ${script}`;
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}
