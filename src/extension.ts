import * as vscode from 'vscode';
import {
  probeRemoteCapabilities,
  type RemoteCapabilities,
  type RemoteCapabilityProbeConfiguration,
} from './remoteCapabilities';
import { parseRemoteSshTarget, sanitizeTarget } from './remoteTarget';
import { ShareViewProvider } from './shareView';
import { TunnelManager } from './tunnelManager';

let tunnelManager: TunnelManager | undefined;
let capabilityProbeGeneration = 0;
let lastCapabilities: RemoteCapabilities | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Local Network Share');
  const manager = new TunnelManager(output, context.environmentVariableCollection);
  const viewProvider = new ShareViewProvider();
  tunnelManager = manager;

  context.subscriptions.push(
    output,
    manager,
    viewProvider,
    vscode.window.registerTreeDataProvider('localNetworkShare.view', viewProvider),
  );

  const refreshPresentation = async () => {
    const settings = readSettings();
    const target = resolveSshTarget(settings.sshTarget);
    viewProvider.update(manager.currentState, target, settings.remotePort);
    await vscode.commands.executeCommand(
      'setContext',
      'localNetworkShare.running',
      manager.currentState.phase === 'active' || manager.currentState.phase === 'starting',
    );
  };

  context.subscriptions.push(
    manager.onDidChangeState(() => void refreshPresentation()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('localNetworkShare')) {
        void refreshPresentation();
      }
    }),
    vscode.commands.registerCommand('localNetworkShare.start', async () => {
      if (!ensureRemoteSshWindow()) {
        return;
      }

      const settings = readSettings();
      const target = resolveSshTarget(settings.sshTarget);
      if (!target) {
        const action = await vscode.window.showErrorMessage(
          'Could not infer the SSH destination. Set Local Network Share: SSH Target to the same alias used by Remote-SSH.',
          'Open Settings',
        );
        if (action === 'Open Settings') {
          await openSettings();
        }
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Sharing local network with ${target}`,
            cancellable: false,
          },
          () => manager.start({ ...settings, sshTarget: target }),
        );
        void vscode.window.showInformationMessage(
          `Local network sharing is active. SOCKS5: 127.0.0.1:${settings.remotePort}; HTTP: 127.0.0.1:${settings.httpProxyRemotePort}. Open a new terminal to use it.`,
        );
        void refreshRemoteCapabilities(settings, target, output, viewProvider);
      } catch (error) {
        output.show(true);
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }),
    vscode.commands.registerCommand('localNetworkShare.stop', async () => {
      ++capabilityProbeGeneration;
      lastCapabilities = undefined;
      viewProvider.updateCapabilities({ phase: 'idle' });
      await manager.stop();
      void vscode.window.showInformationMessage('Local network sharing stopped. Open terminals keep their existing environment until closed.');
    }),
    vscode.commands.registerCommand('localNetworkShare.restart', async () => {
      await manager.stop();
      await vscode.commands.executeCommand('localNetworkShare.start');
    }),
    vscode.commands.registerCommand('localNetworkShare.copyProxyEnvironment', async () => {
      const { remotePort, httpProxyRemotePort, injectHttpProxyVariables } = readSettings();
      const script = createProxyEnvironmentScript(remotePort, httpProxyRemotePort, injectHttpProxyVariables);
      await vscode.env.clipboard.writeText(script);
      void vscode.window.showInformationMessage('Proxy environment commands copied to the clipboard.');
    }),
    vscode.commands.registerCommand('localNetworkShare.configureAptProxy', async () => {
      const { remotePort } = readSettings();
      const selection = await vscode.window.showQuickPick(
        [
          {
            label: 'Copy one-time apt update command',
            description: 'Uses the proxy for one sudo apt update only',
            command: createOneTimeAptCommand(remotePort),
          },
          {
            label: 'Copy persistent APT proxy setup',
            description: 'Creates /etc/apt/apt.conf.d/99local-network-share',
            command: createPersistentAptCommand(remotePort),
          },
          {
            label: 'Copy APT proxy removal command',
            description: 'Removes the extension-specific APT config file',
            command: 'sudo rm -f /etc/apt/apt.conf.d/99local-network-share',
          },
        ],
        { placeHolder: 'Choose a safe APT command to copy' },
      );
      if (!selection) {
        return;
      }
      await vscode.env.clipboard.writeText(selection.command);
      void vscode.window.showInformationMessage('APT proxy command copied. Paste it into the remote terminal when ready.');
    }),
    vscode.commands.registerCommand('localNetworkShare.showAdvancedTunGuide', async () => {
      const confirmation = await vscode.window.showWarningMessage(
        'Advanced TUN mode can change network routes. In rare cases, it may make this server unreachable over SSH. Continue only if you have physical access to the server or out-of-band management such as BMC/IPMI/iDRAC/iLO.',
        { modal: true },
        'I have physical/BMC access',
      );
      if (confirmation !== 'I have physical/BMC access') {
        return;
      }
      const document = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: createAdvancedTunGuide(lastCapabilities, readSettings().remotePort),
      });
      await vscode.window.showTextDocument(document, { preview: true });
    }),
    vscode.commands.registerCommand('localNetworkShare.checkAdvancedTunRequirements', async () => {
      if (!ensureRemoteSshWindow() || manager.currentState.phase !== 'active') {
        void vscode.window.showInformationMessage('Start local network sharing before checking advanced TUN requirements.');
        return;
      }
      const settings = readSettings();
      const target = resolveSshTarget(settings.sshTarget);
      if (!target) {
        void vscode.window.showErrorMessage('Could not infer the SSH destination for the requirements check.');
        return;
      }
      await refreshRemoteCapabilities(settings, target, output, viewProvider);
    }),
    vscode.commands.registerCommand('localNetworkShare.showOutput', () => output.show()),
    vscode.commands.registerCommand('localNetworkShare.openSettings', openSettings),
  );

  void refreshPresentation();

  if (vscode.env.remoteName === 'ssh-remote' && readSettings().autoStart) {
    setTimeout(() => void vscode.commands.executeCommand('localNetworkShare.start'), 500);
  }
}

export async function deactivate(): Promise<void> {
  await tunnelManager?.stop();
  tunnelManager = undefined;
}

function ensureRemoteSshWindow(): boolean {
  if (vscode.env.remoteName === 'ssh-remote') {
    return true;
  }
  void vscode.window.showErrorMessage('Local Network Share currently supports VS Code Remote-SSH windows only.');
  return false;
}

function resolveSshTarget(configuredTarget: string): string | undefined {
  const explicitTarget = sanitizeTarget(configuredTarget);
  if (explicitTarget) {
    return explicitTarget;
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const target = parseRemoteSshTarget(folder.uri.authority);
    if (target) {
      return target;
    }
  }
  return undefined;
}

function readSettings() {
  const configuration = vscode.workspace.getConfiguration('localNetworkShare');
  return {
    sshPath: configuration.get<string>('sshPath', 'ssh').trim() || 'ssh',
    sshTarget: configuration.get<string>('sshTarget', ''),
    sshConfigFile: configuration.get<string>('sshConfigFile', '').trim() || undefined,
    remotePort: configuration.get<number>('remotePort', 17890),
    httpProxyRemotePort: configuration.get<number>('httpProxyRemotePort', 17891),
    connectTimeoutSeconds: configuration.get<number>('connectTimeoutSeconds', 15),
    injectHttpProxyVariables: configuration.get<boolean>('injectHttpProxyVariables', true),
    autoStart: configuration.get<boolean>('autoStart', false),
  };
}

function createProxyEnvironmentScript(
  remotePort: number,
  httpProxyRemotePort: number,
  includeHttpVariables: boolean,
): string {
  const proxyUrl = `socks5h://127.0.0.1:${remotePort}`;
  const httpProxyUrl = `http://127.0.0.1:${httpProxyRemotePort}`;
  const assignments = [
    `export ALL_PROXY=${proxyUrl}`,
    `export all_proxy=${proxyUrl}`,
  ];
  if (includeHttpVariables) {
    assignments.push(
      `export HTTP_PROXY=${httpProxyUrl}`,
      `export HTTPS_PROXY=${httpProxyUrl}`,
      `export http_proxy=${httpProxyUrl}`,
      `export https_proxy=${httpProxyUrl}`,
    );
  }
  assignments.push(
    'export NO_PROXY="localhost,127.0.0.1,::1${NO_PROXY:+,$NO_PROXY}"',
    'export no_proxy="localhost,127.0.0.1,::1${no_proxy:+,$no_proxy}"',
  );
  return assignments.join('\n');
}

async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:dttutty.remote-local-network-share');
}

async function refreshRemoteCapabilities(
  settings: RemoteCapabilityProbeConfiguration,
  target: string,
  output: vscode.OutputChannel,
  viewProvider: ShareViewProvider,
): Promise<void> {
  const generation = ++capabilityProbeGeneration;
  viewProvider.updateCapabilities({ phase: 'checking' });
  try {
    const capabilities = await probeRemoteCapabilities({ ...settings, sshTarget: target }, output);
    if (generation !== capabilityProbeGeneration) {
      return;
    }
    lastCapabilities = capabilities;
    viewProvider.updateCapabilities({ phase: 'ready', capabilities });
  } catch (error) {
    if (generation !== capabilityProbeGeneration) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[capabilities] ${message}`);
    viewProvider.updateCapabilities({ phase: 'error', message });
  }
}

function createOneTimeAptCommand(port: number): string {
  const proxy = `socks5h://127.0.0.1:${port}`;
  return `sudo apt -o Acquire::http::Proxy="${proxy}" -o Acquire::https::Proxy="${proxy}" update`;
}

function createPersistentAptCommand(port: number): string {
  const proxy = `socks5h://127.0.0.1:${port}`;
  return `printf '%s\\n' 'Acquire::http::Proxy "${proxy}";' 'Acquire::https::Proxy "${proxy}";' | sudo tee /etc/apt/apt.conf.d/99local-network-share >/dev/null`;
}

function createAdvancedTunGuide(capabilities: RemoteCapabilities | undefined, port: number): string {
  const detected = capabilities
    ? [
        `- Operating system: ${capabilities.operatingSystem}`,
        `- sudo access: ${capabilities.sudoAccess}`,
        `- /dev/net/tun: ${capabilities.tunDevice ? 'available' : 'not detected'}`,
        `- tun2socks: ${capabilities.tun2socks ? 'available' : 'not detected'}`,
        `- ip command: ${capabilities.ipCommand ? 'available' : 'not detected'}`,
      ].join('\n')
    : '- No capability check is available. Start sharing first to run the read-only check.';

  return `# Advanced transparent TUN mode

This mode is configured from the expandable Advanced TUN mode section at the bottom of the Local Network Share sidebar and is never enabled automatically. Opening this guide requires an explicit risk confirmation.

A TUN interface can make applications that ignore proxy variables use the shared SOCKS5 endpoint at \`127.0.0.1:${port}\`. The risky part is changing the host's global routes or DNS: on a Remote-SSH or multi-user server, that can break the SSH session or affect other users.

## Read-only capability check

${detected}

## Safety requirements

- Prefer a dedicated network namespace or per-process routing instead of replacing the host's default route.
- Keep explicit routes for the SSH server and local networks outside the TUN path.
- Plan a rollback command before making any route or DNS change.
- Do not run unreviewed TUN commands on a shared server.

This extension does not request a sudo password, create interfaces, install tun2socks, or change routes/DNS. Advanced mode remains a manual, expert workflow.

Reference: https://github.com/xjasonlyu/tun2socks/wiki/Examples
`;
}
