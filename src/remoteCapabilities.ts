import { spawn } from 'node:child_process';
import type * as vscode from 'vscode';
import { sanitizeTarget } from './remoteTarget';

export type SudoAccess = 'passwordless' | 'member' | 'unknown' | 'none';

export interface RemoteCapabilities {
  operatingSystem: string;
  sudoAccess: SudoAccess;
  tunDevice: boolean;
  tun2socks: boolean;
  socat: boolean;
  ipCommand: boolean;
}

export type CapabilityProbeState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'ready'; capabilities: RemoteCapabilities }
  | { phase: 'error'; message: string };

export interface RemoteCapabilityProbeConfiguration {
  sshPath: string;
  sshTarget: string;
  sshConfigFile?: string;
  connectTimeoutSeconds: number;
}

const PROBE_SCRIPT = `
groups="$(id -nG 2>/dev/null || true)"
sudo_access=none
if command -v sudo >/dev/null 2>&1; then
  if sudo -n true >/dev/null 2>&1; then
    sudo_access=passwordless
  elif printf '%s\\n' "$groups" | tr ' ' '\\n' | grep -Eq '^(sudo|wheel|admin)$'; then
    sudo_access=member
  else
    sudo_access=unknown
  fi
fi
printf 'OS=%s\\n' "$(uname -s 2>/dev/null || printf unknown)"
printf 'SUDO=%s\\n' "$sudo_access"
if [ -c /dev/net/tun ]; then printf 'TUN=yes\\n'; else printf 'TUN=no\\n'; fi
if command -v tun2socks >/dev/null 2>&1; then printf 'TUN2SOCKS=yes\\n'; else printf 'TUN2SOCKS=no\\n'; fi
if command -v socat >/dev/null 2>&1; then printf 'SOCAT=yes\\n'; else printf 'SOCAT=no\\n'; fi
if command -v ip >/dev/null 2>&1; then printf 'IP=yes\\n'; else printf 'IP=no\\n'; fi
`.trim();

export async function probeRemoteCapabilities(
  configuration: RemoteCapabilityProbeConfiguration,
  output: vscode.OutputChannel,
): Promise<RemoteCapabilities> {
  const target = sanitizeTarget(configuration.sshTarget);
  if (!target) {
    throw new Error('Cannot check remote capabilities because the SSH target is empty or unsafe.');
  }

  const args = buildRemoteProbeArguments(configuration, target);
  output.appendLine(`[capabilities] Checking sudo and TUN support on ${target}.`);
  const child = spawn(configuration.sshPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: string) => {
    stdout = `${stdout}${chunk}`.slice(-16_384);
  });
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-16_384);
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error('Timed out while checking remote sudo and TUN support.'));
    }, (configuration.connectTimeoutSeconds + 3) * 1000);

    child.once('error', (error) => finish(new Error(`Could not run the remote capability check: ${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) {
        finish();
        return;
      }
      const detail = stderr.trim() || `code=${String(code)}, signal=${String(signal)}`;
      finish(new Error(`Remote capability check failed: ${detail}`));
    });
  });

  const capabilities = parseRemoteCapabilities(stdout);
  output.appendLine(
    `[capabilities] sudo=${capabilities.sudoAccess}, tun=${capabilities.tunDevice}, tun2socks=${capabilities.tun2socks}, socat=${capabilities.socat}, ip=${capabilities.ipCommand}.`,
  );
  return capabilities;
}

export function buildRemoteProbeArguments(
  configuration: RemoteCapabilityProbeConfiguration,
  target: string,
): string[] {
  const args = [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${configuration.connectTimeoutSeconds}`,
  ];
  if (configuration.sshConfigFile) {
    args.push('-F', configuration.sshConfigFile);
  }
  args.push(target, 'sh', '-lc', quoteForPosixShell(PROBE_SCRIPT));
  return args;
}

export function parseRemoteCapabilities(output: string): RemoteCapabilities {
  const values = new Map<string, string>();
  for (const line of output.replace(/\r\n/gu, '\n').split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0) {
      values.set(line.slice(0, separator), line.slice(separator + 1).trim());
    }
  }

  const reportedSudo = values.get('SUDO');
  const sudoAccess: SudoAccess = reportedSudo === 'passwordless'
    || reportedSudo === 'member'
    || reportedSudo === 'unknown'
    || reportedSudo === 'none'
    ? reportedSudo
    : 'unknown';

  return {
    operatingSystem: values.get('OS') || 'unknown',
    sudoAccess,
    tunDevice: values.get('TUN') === 'yes',
    tun2socks: values.get('TUN2SOCKS') === 'yes',
    socat: values.get('SOCAT') === 'yes',
    ipCommand: values.get('IP') === 'yes',
  };
}

function quoteForPosixShell(value: string): string {
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}
