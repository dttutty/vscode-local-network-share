import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import {
  createAptInstallCommand,
  createOneTimeAptCommand,
  createPersistentAptCommand,
  REMOVE_PERSISTENT_APT_PROXY_COMMAND,
} from './aptCommands';
import type { TunnelState } from './tunnelManager';

interface ShareViewState {
  phase: TunnelState['phase'];
  message?: string;
  target?: string;
  remotePort: number;
  httpPort: number;
  injectHttpProxyVariables: boolean;
  aptCommands: {
    update: string;
    install: string;
    persistent: string;
    remove: string;
  };
}

const ALLOWED_COMMANDS = new Set([
  'localNetworkShare.start',
  'localNetworkShare.stop',
  'localNetworkShare.restart',
  'localNetworkShare.copyProxyEnvironment',
  'localNetworkShare.copyAptUpdate',
  'localNetworkShare.copyAptInstall',
  'localNetworkShare.copyAptPersistentSetup',
  'localNetworkShare.copyAptPersistentRemoval',
  'localNetworkShare.chooseSshTarget',
  'localNetworkShare.showOutput',
  'localNetworkShare.openSettings',
  'localNetworkShare.openAdvancedTunSetup',
]);

export class ShareViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'localNetworkShare.view';

  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private state = createShareViewState({ phase: 'idle' }, undefined, 17890, true);

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.createHtml();
    this.disposables.push(
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
        }
      }),
      webviewView.webview.onDidReceiveMessage((message: unknown) => void this.handleMessage(message)),
    );
  }

  update(state: TunnelState, target: string | undefined, port: number, injectHttpProxyVariables: boolean): void {
    this.state = createShareViewState(state, target, port, injectHttpProxyVariables);
    void this.view?.webview.postMessage({ type: 'state', state: this.state });
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }
    const typed = message as { type: unknown; command?: unknown };
    if (typed.type !== 'command' || typeof typed.command !== 'string' || !ALLOWED_COMMANDS.has(typed.command)) {
      return;
    }
    try {
      await vscode.commands.executeCommand(typed.command);
    } catch (error) {
      void this.view?.webview.postMessage({
        type: 'notice',
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createHtml(): string {
    const nonce = randomBytes(16).toString('base64');
    const initialState = JSON.stringify(this.state).replace(/</gu, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Local Network Share</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); }
    main { display: grid; gap: 12px; }
    .card { padding: 14px; border: 1px solid var(--vscode-widget-border); border-radius: 8px; background: var(--vscode-sideBar-background); }
    .hero { display: grid; gap: 12px; }
    .status-line, .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .status-title { font-size: 16px; font-weight: 700; }
    .pill, .badge { padding: 3px 8px; border-radius: 999px; font-size: 11px; white-space: nowrap; }
    .idle { color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); }
    .working, .manual { color: var(--vscode-editorWarning-foreground); background: var(--vscode-inputValidation-warningBackground); }
    .active, .covered { color: var(--vscode-testing-iconPassed); background: color-mix(in srgb, var(--vscode-testing-iconPassed) 12%, transparent); }
    .error, .unmanaged { color: var(--vscode-testing-iconFailed); background: color-mix(in srgb, var(--vscode-testing-iconFailed) 12%, transparent); }
    .target { display: grid; gap: 4px; }
    .label { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .value { overflow-wrap: anywhere; font-weight: 600; }
    .description { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button { padding: 7px 12px; border: 0; border-radius: 3px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.link { padding: 0; color: var(--vscode-textLink-foreground); background: transparent; text-align: left; }
    button.link:hover { color: var(--vscode-textLink-activeForeground); background: transparent; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .endpoints { display: none; grid-template-columns: 1fr; gap: 8px; }
    code { display: block; padding: 7px 8px; overflow-wrap: anywhere; color: var(--vscode-textPreformat-foreground); background: var(--vscode-textCodeBlock-background); border-radius: 3px; font-family: var(--vscode-editor-font-family); font-size: 11px; }
    details summary { cursor: pointer; font-weight: 700; }
    details[open] summary { margin-bottom: 10px; }
    .coverage { display: grid; }
    .coverage .row { align-items: flex-start; padding: 9px 0; border-bottom: 1px solid var(--vscode-widget-border); }
    .coverage .row:last-child { border-bottom: 0; }
    .item-title { font-weight: 600; }
    .item-copy { min-width: 0; }
    .apt-grid { display: grid; gap: 8px; }
    .apt-grid button { width: 100%; text-align: left; }
    .notice { min-height: 16px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .notice.error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <main>
    <section class="card hero">
      <div class="status-line">
        <span class="status-title">Network sharing</span>
        <span id="status" class="pill idle">Not sharing</span>
      </div>
      <div class="target">
        <span class="label">SSH target</span>
        <button id="target" class="link">Select host…</button>
      </div>
      <div id="message" class="description"></div>
      <div class="actions">
        <button id="start" data-command="localNetworkShare.start">Start sharing</button>
        <button id="stop" data-command="localNetworkShare.stop">Stop sharing</button>
        <button id="restart" class="secondary" data-command="localNetworkShare.restart">Restart</button>
      </div>
      <div id="endpoints" class="endpoints">
        <div><span class="label">SOCKS5</span><code id="socks"></code></div>
        <div><span class="label">HTTP CONNECT</span><code id="http"></code></div>
      </div>
    </section>

    <details class="card" open>
      <summary>Proxy coverage</summary>
      <p id="coverageNote" class="description"></p>
      <div id="coverage" class="coverage">
        <div class="row" data-coverage="active">
          <div class="item-copy"><div class="item-title">New VS Code terminals</div><div class="description">Proxy environment is injected when the terminal is created.</div></div>
          <span class="badge covered">Environment ready</span>
        </div>
        <div class="row" data-coverage="active">
          <div class="item-copy"><div class="item-title">curl, pip, uv, Conda</div><div class="description">Normally read standard proxy variables; per-tool settings can override them.</div></div>
          <span class="badge typical covered">Usually covered</span>
        </div>
        <div class="row" data-coverage="active">
          <div class="item-copy"><div class="item-title">npm, Wget, Homebrew</div><div class="description">Normally use HTTP proxy variables in newly created terminals.</div></div>
          <span class="badge typical covered">Usually covered</span>
        </div>
        <div class="row" data-coverage="active">
          <div class="item-copy"><div class="item-title">Existing terminals</div><div class="description">Reopen them or copy the environment manually.</div></div>
          <button class="link badge manual" data-command="localNetworkShare.copyProxyEnvironment">Action needed</button>
        </div>
        <div class="row" data-coverage="active">
          <div class="item-copy"><div class="item-title">APT and sudo</div><div class="description">sudo commonly removes proxy variables; APT needs an explicit option.</div></div>
          <button class="link badge manual" data-command="localNetworkShare.copyAptUpdate">Manual setup</button>
        </div>
        <div class="row" data-coverage="active">
          <div class="item-copy"><div class="item-title">Docker daemon, systemd, cron</div><div class="description">System services require their own proxy configuration.</div></div>
          <span class="badge unmanaged">Not managed</span>
        </div>
        <div class="row" data-coverage="active">
          <div class="item-copy"><div class="item-title">Apps ignoring proxy variables</div><div class="description">Use application-specific settings or review Advanced TUN.</div></div>
          <button class="link badge unmanaged" data-command="localNetworkShare.openAdvancedTunSetup">Not managed</button>
        </div>
      </div>
    </details>

    <details class="card">
      <summary>APT and sudo commands</summary>
      <p class="description">Commands are copied for review; the extension never runs sudo automatically.</p>
      <div class="apt-grid">
        <button class="secondary apt-action" data-command="localNetworkShare.copyAptUpdate" data-apt="update">Copy one-time apt update</button>
        <button class="secondary apt-action" data-command="localNetworkShare.copyAptInstall" data-apt="install">Copy apt install command</button>
        <button class="secondary apt-action" data-command="localNetworkShare.copyAptPersistentSetup" data-apt="persistent">Copy persistent APT setup</button>
        <button class="secondary apt-action" data-command="localNetworkShare.copyAptPersistentRemoval" data-apt="remove">Copy persistent setup removal</button>
      </div>
    </details>

    <section class="card">
      <div class="actions">
        <button class="secondary" data-command="localNetworkShare.showOutput">Open log</button>
        <button class="secondary" data-command="localNetworkShare.openSettings">Settings</button>
        <button class="secondary" data-command="localNetworkShare.openAdvancedTunSetup">Advanced TUN</button>
      </div>
      <div id="notice" class="notice" role="status"></div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${initialState};
    const phasePresentation = {
      idle: ['Not sharing', 'idle'],
      starting: ['Starting…', 'working'],
      active: ['Sharing', 'active'],
      stopping: ['Stopping…', 'working'],
      error: ['Error', 'error'],
    };

    function render(next) {
      state = next;
      const active = state.phase === 'active';
      const busy = state.phase === 'starting' || state.phase === 'stopping';
      const presentation = phasePresentation[state.phase];
      const status = document.getElementById('status');
      status.textContent = presentation[0];
      status.className = 'pill ' + presentation[1];
      document.getElementById('target').textContent = state.target || 'Select host…';
      document.getElementById('message').textContent = state.message || (active ? 'New integrated terminals receive the proxy environment.' : 'Start sharing to make the local network available on this SSH host.');
      document.getElementById('start').style.display = state.phase === 'idle' || state.phase === 'error' ? '' : 'none';
      document.getElementById('stop').style.display = active || state.phase === 'stopping' ? '' : 'none';
      document.getElementById('restart').style.display = active ? '' : 'none';
      document.getElementById('start').disabled = busy;
      document.getElementById('stop').disabled = busy;
      document.getElementById('endpoints').style.display = active ? 'grid' : 'none';
      document.getElementById('socks').textContent = 'socks5h://127.0.0.1:' + state.remotePort;
      document.getElementById('http').textContent = 'http://127.0.0.1:' + state.httpPort;
      document.getElementById('coverageNote').textContent = active
        ? 'Inferred from the environment controlled by this extension; not live process inspection.'
        : 'Inactive. Start sharing to inject proxy settings into new VS Code terminals.';
      document.querySelectorAll('[data-coverage="active"]').forEach(element => {
        element.style.display = active ? 'flex' : 'none';
      });
      document.querySelectorAll('.typical').forEach(element => {
        element.textContent = state.injectHttpProxyVariables ? 'Usually covered' : 'SOCKS support varies';
        element.className = 'badge typical ' + (state.injectHttpProxyVariables ? 'covered' : 'manual');
      });
      document.querySelectorAll('.apt-action').forEach(element => {
        element.disabled = !active;
        element.title = state.aptCommands[element.dataset.apt];
      });
    }

    function runCommand(command) {
      vscode.postMessage({ type: 'command', command });
    }

    document.querySelectorAll('[data-command]').forEach(element => {
      element.addEventListener('click', () => runCommand(element.dataset.command));
    });
    document.getElementById('target').addEventListener('click', () => runCommand('localNetworkShare.chooseSshTarget'));
    window.addEventListener('message', event => {
      if (event.data?.type === 'state') render(event.data.state);
      if (event.data?.type === 'notice') {
        const notice = document.getElementById('notice');
        notice.textContent = event.data.message;
        notice.className = 'notice' + (event.data.error ? ' error' : '');
      }
    });
    render(state);
  </script>
</body>
</html>`;
  }
}

function createShareViewState(
  state: TunnelState,
  target: string | undefined,
  port: number,
  injectHttpProxyVariables: boolean,
): ShareViewState {
  const remotePort = state.remotePort ?? port;
  const httpPort = state.remoteHttpPort ?? port + 1;
  return {
    phase: state.phase,
    message: state.message,
    target: state.target ?? target,
    remotePort,
    httpPort,
    injectHttpProxyVariables,
    aptCommands: {
      update: createOneTimeAptCommand(httpPort),
      install: createAptInstallCommand(httpPort),
      persistent: createPersistentAptCommand(httpPort),
      remove: REMOVE_PERSISTENT_APT_PROXY_COMMAND,
    },
  };
}
