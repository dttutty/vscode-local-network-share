import * as vscode from 'vscode';
import { AdvancedTunPanel, type AdvancedTunPanelState } from './advancedTunPanel';
import {
  createAptInstallCommand,
  createOneTimeAptCommand,
  createPersistentAptCommand,
  REMOVE_PERSISTENT_APT_PROXY_COMMAND,
} from './aptCommands';
import {
  probeRemoteCapabilities,
  type RemoteCapabilities,
  type RemoteCapabilityProbeConfiguration,
} from './remoteCapabilities';
import { parseRemoteSshTarget, sanitizeTarget } from './remoteTarget';
import { ShareViewProvider } from './shareView';
import { TunnelManager } from './tunnelManager';
import { determineTunWorkflowStage } from './tunSettings';

let tunnelManager: TunnelManager | undefined;
let capabilityProbeGeneration = 0;
let lastCapabilities: RemoteCapabilities | undefined;
let lastCapabilitiesTarget: string | undefined;
let capabilityProbeChecking = false;
let capabilityProbeError: string | undefined;
let advancedTunStopped = false;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Local Network Share');
  const manager = new TunnelManager(output, context.environmentVariableCollection);
  const viewProvider = new ShareViewProvider();
  let advancedTunPanel: AdvancedTunPanel | undefined;
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
    advancedTunPanel?.update(createAdvancedTunPanelState(manager, settings, target));
    await vscode.commands.executeCommand(
      'setContext',
      'localNetworkShare.running',
      manager.currentState.phase === 'active' || manager.currentState.phase === 'starting',
    );
  };

  const runCapabilityCheck = async (settings: ReturnType<typeof readSettings>, target: string) => {
    await refreshRemoteCapabilities(settings, target, output, () => {
      advancedTunPanel?.update(createAdvancedTunPanelState(manager, readSettings(), target));
    });
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
      let target = resolveSshTarget(settings.sshTarget);
      if (!target) {
        target = await chooseAndSaveSshTarget();
        if (!target) {
          return;
        }
        await refreshPresentation();
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
        advancedTunStopped = false;
        void vscode.window.showInformationMessage(
          `Local network sharing is active. SOCKS5: 127.0.0.1:${settings.remotePort}; HTTP: 127.0.0.1:${settings.httpProxyRemotePort}. Open a new terminal to use it.`,
        );
        void runCapabilityCheck(settings, target);
      } catch (error) {
        output.show(true);
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }),
    vscode.commands.registerCommand('localNetworkShare.stop', async () => {
      ++capabilityProbeGeneration;
      capabilityProbeChecking = false;
      capabilityProbeError = undefined;
      advancedTunStopped = true;
      await manager.stop();
      advancedTunPanel?.update(createAdvancedTunPanelState(manager, readSettings()));
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
      const { httpProxyRemotePort } = readSettings();
      const selection = await vscode.window.showQuickPick(
        [
          {
            label: 'Copy one-time apt update command',
            description: 'Uses the proxy for one sudo apt update only',
            command: createOneTimeAptCommand(httpProxyRemotePort),
          },
          {
            label: 'Copy persistent APT proxy setup',
            description: 'Creates /etc/apt/apt.conf.d/99local-network-share',
            command: createPersistentAptCommand(httpProxyRemotePort),
          },
          {
            label: 'Copy APT proxy removal command',
            description: 'Removes the extension-specific APT config file',
            command: REMOVE_PERSISTENT_APT_PROXY_COMMAND,
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
    vscode.commands.registerCommand('localNetworkShare.copyAptUpdate', async () => {
      await copyTerminalCommand(
        createOneTimeAptCommand(readSettings().httpProxyRemotePort),
        'One-time apt update command copied.',
      );
    }),
    vscode.commands.registerCommand('localNetworkShare.copyAptInstall', async () => {
      await copyTerminalCommand(
        createAptInstallCommand(readSettings().httpProxyRemotePort),
        'APT install command copied. Replace PACKAGE_NAME before running it.',
      );
    }),
    vscode.commands.registerCommand('localNetworkShare.copyAptPersistentSetup', async () => {
      await copyTerminalCommand(
        createPersistentAptCommand(readSettings().httpProxyRemotePort),
        'Persistent APT proxy setup copied.',
      );
    }),
    vscode.commands.registerCommand('localNetworkShare.copyAptPersistentRemoval', async () => {
      await copyTerminalCommand(
        REMOVE_PERSISTENT_APT_PROXY_COMMAND,
        'Persistent APT proxy removal command copied.',
      );
    }),
    vscode.commands.registerCommand('localNetworkShare.openAdvancedTunSetup', async () => {
      const confirmation = await vscode.window.showWarningMessage(
        'Advanced TUN mode can change network routes. In rare cases, it may make this server unreachable over SSH. Continue only if you have physical access to the server or out-of-band management such as BMC/IPMI/iDRAC/iLO.',
        { modal: true },
        'I have physical/BMC access',
      );
      if (confirmation !== 'I have physical/BMC access') {
        return;
      }
      const settings = readSettings();
      const target = manager.currentState.target ?? resolveSshTarget(settings.sshTarget);
      if (advancedTunPanel) {
        advancedTunPanel.update(createAdvancedTunPanelState(manager, settings, target));
        advancedTunPanel.reveal();
      } else {
        advancedTunPanel = new AdvancedTunPanel(
          createAdvancedTunPanelState(manager, settings, target),
          {
            startSharing: async () => {
              await vscode.commands.executeCommand('localNetworkShare.start');
            },
            stopSharing: async () => {
              await vscode.commands.executeCommand('localNetworkShare.stop');
            },
            checkRequirements: async () => {
              if (!ensureRemoteSshWindow()) {
                return;
              }
              const currentSettings = readSettings();
              let currentTarget = manager.currentState.target ?? resolveSshTarget(currentSettings.sshTarget);
              if (!currentTarget) {
                currentTarget = await chooseAndSaveSshTarget();
                if (!currentTarget) {
                  return;
                }
                await refreshPresentation();
              }
              await runCapabilityCheck(currentSettings, currentTarget);
            },
          },
          () => { advancedTunPanel = undefined; },
        );
        context.subscriptions.push(advancedTunPanel);
      }
    }),
    vscode.commands.registerCommand('localNetworkShare.chooseSshTarget', async () => {
      const target = await chooseAndSaveSshTarget();
      if (target) {
        await refreshPresentation();
      }
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

async function chooseAndSaveSshTarget(): Promise<string | undefined> {
  const current = readSettings().sshTarget;
  const value = await vscode.window.showInputBox({
    title: 'Choose the Remote-SSH host',
    prompt: 'Enter the same SSH host or alias you selected in Remote-SSH. Local Network Share uses it to create the proxy tunnel.',
    placeHolder: 'For example: markov or user@example.com',
    value: current,
    ignoreFocusOut: true,
    validateInput: (candidate) => {
      if (!candidate.trim()) {
        return 'Enter an SSH host or config alias.';
      }
      if (!sanitizeTarget(candidate)) {
        return 'Use a host name, SSH config alias, or user@host. Command-line options are not allowed.';
      }
      return undefined;
    },
  });
  const target = value ? sanitizeTarget(value) : undefined;
  if (!target) {
    return undefined;
  }

  await vscode.workspace.getConfiguration('localNetworkShare').update(
    'sshTarget',
    target,
    vscode.ConfigurationTarget.Global,
  );
  if (lastCapabilitiesTarget !== target) {
    lastCapabilities = undefined;
    lastCapabilitiesTarget = undefined;
    capabilityProbeError = undefined;
    advancedTunStopped = false;
  }
  return target;
}

async function refreshRemoteCapabilities(
  settings: RemoteCapabilityProbeConfiguration,
  target: string,
  output: vscode.OutputChannel,
  onUpdate?: () => void,
): Promise<void> {
  const generation = ++capabilityProbeGeneration;
  advancedTunStopped = false;
  capabilityProbeChecking = true;
  capabilityProbeError = undefined;
  onUpdate?.();
  try {
    const capabilities = await probeRemoteCapabilities({ ...settings, sshTarget: target }, output);
    if (generation !== capabilityProbeGeneration) {
      return;
    }
    lastCapabilities = capabilities;
    lastCapabilitiesTarget = target;
    capabilityProbeChecking = false;
    onUpdate?.();
  } catch (error) {
    if (generation !== capabilityProbeGeneration) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[capabilities] ${message}`);
    capabilityProbeChecking = false;
    capabilityProbeError = message;
    onUpdate?.();
  }
}

async function copyTerminalCommand(command: string, message: string): Promise<void> {
  await vscode.env.clipboard.writeText(command);
  void vscode.window.showInformationMessage(`${message} Paste it into the remote terminal when ready.`);
}

function createAdvancedTunPanelState(
  manager: TunnelManager,
  settings: ReturnType<typeof readSettings>,
  target?: string,
): AdvancedTunPanelState {
  const resolvedTarget = manager.currentState.target ?? target;
  const capabilities = resolvedTarget && lastCapabilitiesTarget === resolvedTarget
    ? lastCapabilities
    : undefined;
  return {
    workflowStage: determineTunWorkflowStage({
      checking: capabilityProbeChecking,
      tunnelPhase: manager.currentState.phase,
      hasCapabilities: Boolean(capabilities),
      stopped: advancedTunStopped,
    }),
    sharingActive: manager.currentState.phase === 'active',
    checking: capabilityProbeChecking,
    target: resolvedTarget,
    socksPort: manager.currentState.remotePort ?? settings.remotePort,
    capabilities,
    error: capabilityProbeError,
  };
}
