import * as vscode from 'vscode';
import { parseRemoteSshTarget, sanitizeTarget } from './remoteTarget';
import { ShareViewProvider } from './shareView';
import { TunnelManager } from './tunnelManager';

let tunnelManager: TunnelManager | undefined;

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
          `Local network sharing is active at socks5h://127.0.0.1:${settings.remotePort}. Open a new terminal to use it.`,
        );
      } catch (error) {
        output.show(true);
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }),
    vscode.commands.registerCommand('localNetworkShare.stop', async () => {
      await manager.stop();
      void vscode.window.showInformationMessage('Local network sharing stopped. Open terminals keep their existing environment until closed.');
    }),
    vscode.commands.registerCommand('localNetworkShare.restart', async () => {
      await manager.stop();
      await vscode.commands.executeCommand('localNetworkShare.start');
    }),
    vscode.commands.registerCommand('localNetworkShare.copyProxyEnvironment', async () => {
      const { remotePort, injectHttpProxyVariables } = readSettings();
      const script = createProxyEnvironmentScript(remotePort, injectHttpProxyVariables);
      await vscode.env.clipboard.writeText(script);
      void vscode.window.showInformationMessage('Proxy environment commands copied to the clipboard.');
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
    connectTimeoutSeconds: configuration.get<number>('connectTimeoutSeconds', 15),
    injectHttpProxyVariables: configuration.get<boolean>('injectHttpProxyVariables', true),
    autoStart: configuration.get<boolean>('autoStart', false),
  };
}

function createProxyEnvironmentScript(remotePort: number, includeHttpVariables: boolean): string {
  const proxyUrl = `socks5h://127.0.0.1:${remotePort}`;
  const assignments = [
    `export ALL_PROXY=${proxyUrl}`,
    `export all_proxy=${proxyUrl}`,
  ];
  if (includeHttpVariables) {
    assignments.push(
      `export HTTP_PROXY=${proxyUrl}`,
      `export HTTPS_PROXY=${proxyUrl}`,
      `export http_proxy=${proxyUrl}`,
      `export https_proxy=${proxyUrl}`,
    );
  }
  assignments.push(
    'export NO_PROXY="localhost,127.0.0.1,::1${NO_PROXY:+,$NO_PROXY}"',
    'export no_proxy="localhost,127.0.0.1,::1${no_proxy:+,$no_proxy}"',
  );
  return assignments.join('\n');
}

async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:local-network-tools.remote-local-network-share');
}
