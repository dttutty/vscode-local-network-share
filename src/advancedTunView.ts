import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { RemoteCapabilities } from './remoteCapabilities';
import { createTunStartCommand, createTunStopCommand, validateTunSetupOptions } from './tunSettings';

export interface AdvancedTunViewState {
  workflowStage: 'check' | 'start' | 'stop';
  sharingActive: boolean;
  checking: boolean;
  target?: string;
  socksPort: number;
  capabilities?: RemoteCapabilities;
  error?: string;
}

export interface AdvancedTunViewCallbacks {
  closeView(): Promise<void>;
  startSharing(): Promise<void>;
  stopSharing(): Promise<void>;
  checkRequirements(): Promise<void>;
}

export class AdvancedTunViewContent {
  private webview: vscode.Webview | undefined;
  private state: AdvancedTunViewState;

  constructor(
    state: AdvancedTunViewState,
    private readonly callbacks: AdvancedTunViewCallbacks,
  ) {
    this.state = state;
  }

  attach(webview: vscode.Webview): void {
    this.webview = webview;
    webview.options = { enableScripts: true };
    webview.html = this.createHtml();
  }

  detach(webview: vscode.Webview): void {
    if (this.webview === webview) {
      this.webview = undefined;
    }
  }

  update(state: AdvancedTunViewState): void {
    this.state = state;
    void this.webview?.postMessage({ type: 'state', state });
  }

  async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }
    const typed = message as { type: unknown; options?: unknown };
    try {
      if (typed.type === 'startSharing') {
        await this.callbacks.startSharing();
      } else if (typed.type === 'closeView') {
        await this.callbacks.closeView();
      } else if (typed.type === 'stopSharing') {
        await this.callbacks.stopSharing();
      } else if (typed.type === 'checkRequirements') {
        await this.callbacks.checkRequirements();
      } else if (typed.type === 'prepareTunStart') {
        if (!this.state.sharingActive) {
          throw new Error('Start network sharing before preparing the TUN command.');
        }
        const options = validateTunSetupOptions(typed.options);
        const command = createTunStartCommand(options, {
          target: this.state.target,
          socksPort: this.state.socksPort,
        });
        await this.prepareTerminalCommand(
          command,
          'Prepare Advanced TUN start command?',
          'The command will be inserted into a remote terminal but will not run until you review it and press Enter. sudo prompts only in that terminal.',
          'Start command prepared. Review it in the terminal, then press Enter when ready.',
        );
      } else if (typed.type === 'prepareTunStop') {
        const options = validateTunSetupOptions(typed.options);
        const command = createTunStopCommand(options);
        await this.prepareTerminalCommand(
          command,
          'Prepare Advanced TUN stop command?',
          'The cleanup command will be inserted into a remote terminal but will not run until you review it and press Enter.',
          'Stop command prepared. Review it in the terminal, then press Enter when ready.',
        );
      }
    } catch (error) {
      void this.webview?.postMessage({
        type: 'notice',
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async prepareTerminalCommand(
    command: string,
    title: string,
    detail: string,
    notice: string,
  ): Promise<void> {
    const selection = await vscode.window.showWarningMessage(
      title,
      { modal: true, detail },
      'Prepare command',
    );
    if (selection !== 'Prepare command') {
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Local Network Share — TUN' });
    terminal.show();
    terminal.sendText(command, false);
    void this.webview?.postMessage({ type: 'notice', message: notice });
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
  <title>Advanced TUN Setup</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); }
    main { width: 100%; }
    .mode-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 14px; padding: 3px; border: 1px solid var(--vscode-widget-border); border-radius: 7px; background: var(--vscode-editorWidget-background); }
    .mode-tab { padding: 7px 8px; color: var(--vscode-descriptionForeground); background: transparent; }
    .mode-tab:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
    .mode-tab.active { color: var(--vscode-button-foreground); background: var(--vscode-button-background); font-weight: 600; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    h2 { margin: 0 0 16px; font-size: 16px; }
    p { line-height: 1.55; }
    .subtitle { margin: 0 0 16px; color: var(--vscode-descriptionForeground); }
    .workflow { display: flex; align-items: center; justify-content: center; gap: 5px; margin: 18px 0; }
    .step { flex: 1; min-width: 0; padding: 8px 4px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 999px; text-align: center; font-size: 12px; font-weight: 600; }
    .step.active { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
    .step.complete { color: var(--vscode-testing-iconPassed); border-color: var(--vscode-testing-iconPassed); }
    .arrow { color: var(--vscode-descriptionForeground); font-size: 14px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    .card { padding: 14px; border: 1px solid var(--vscode-widget-border); border-radius: 8px; background: var(--vscode-sideBar-background); }
    .danger { border-color: var(--vscode-inputValidation-warningBorder); background: var(--vscode-inputValidation-warningBackground); }
    .danger strong { color: var(--vscode-inputValidation-warningForeground); }
    [hidden] { display: none !important; }
    .requirements { display: grid; gap: 10px; }
    .requirement { padding: 10px 0; border-bottom: 1px solid var(--vscode-widget-border); }
    .requirement:last-child { border-bottom: 0; }
    .requirement-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .requirement-detail { margin-top: 6px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }
    .status { font-size: 12px; white-space: nowrap; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .missing { color: var(--vscode-testing-iconFailed); }
    .warning { color: var(--vscode-editorWarning-foreground); }
    .unknown { color: var(--vscode-descriptionForeground); }
    label { display: block; margin: 14px 0 6px; font-weight: 600; }
    select, input[type='text'], input[type='number'] { box-sizing: border-box; width: 100%; padding: 7px 9px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 2px; }
    select:focus, input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    button { padding: 7px 14px; border: 0; border-radius: 2px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .wide { margin-top: 16px; }
    .note { padding: 12px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textBlockQuote-border); }
    .global-warning { display: none; margin-top: 10px; color: var(--vscode-testing-iconFailed); }
    .notice { min-height: 20px; margin-top: 12px; color: var(--vscode-descriptionForeground); }
    .notice.error { color: var(--vscode-errorForeground); }
    summary { cursor: pointer; font-weight: 600; }
    details[open] summary { margin-bottom: 12px; }
  </style>
</head>
<body>
  <main>
    <nav class="mode-tabs" aria-label="Network sharing mode">
      <button id="basicMode" class="mode-tab" aria-selected="false">Basic mode</button>
      <button class="mode-tab active" aria-selected="true">TUN mode</button>
    </nav>
    <h1>Advanced TUN Setup</h1>
    <p class="subtitle">Use this only when Basic mode does not work for a program. TUN mode can route that program's network traffic through your laptop without requiring proxy support.</p>

    <section id="riskGate" class="card danger">
      <strong>⚠ This can interrupt SSH access.</strong>
      <p>Continue only when you can physically access the server or recover it through BMC, IPMI, iDRAC, or iLO.</p>
      <div class="actions"><button id="acknowledge">I acknowledge</button></div>
    </section>

    <div id="tunContent" hidden>
      <nav class="workflow" aria-label="Setup progress">
        <div id="stage-check" class="step">1. Check</div>
        <span class="arrow" aria-hidden="true">→</span>
        <div id="stage-start" class="step">2. Start</div>
        <span class="arrow" aria-hidden="true">→</span>
        <div id="stage-stop" class="step">3. Stop</div>
      </nav>

      <div class="grid wide">
      <section class="card">
        <h2>1. Server readiness</h2>
        <p id="connectionStatus" class="subtitle"></p>
        <div id="requirements" class="requirements"></div>
        <div class="actions">
          <button id="check">Check server</button>
          <button id="startSharing" class="secondary">Start sharing</button>
          <button id="stopSharing" class="secondary">Stop sharing</button>
        </div>
      </section>

      <details class="card">
        <summary>2. Setup options</summary>
        <label for="routing">Routing isolation</label>
        <select id="routing">
          <option value="namespace">Isolated network namespace (Recommended)</option>
          <option value="global">Global host routing (High risk)</option>
        </select>
        <p id="globalWarning" class="global-warning">Global routing can break the current SSH connection and affect other users.</p>

        <label for="interfaceName">TUN interface name</label>
        <input id="interfaceName" type="text" value="tun0" maxlength="15">

        <label for="mtu">MTU</label>
        <input id="mtu" type="number" value="1500" min="576" max="9000">

        <label for="dns">DNS handling</label>
        <select id="dns">
          <option value="preserve">Keep server DNS reachable outside the TUN route</option>
        </select>
      </details>
      </div>

      <details class="card wide">
        <summary>3. Review and start</summary>
        <p class="note">Prepare the selected command in a remote terminal, review it there, then press Enter yourself. The extension never submits sudo or changes the server network in the background.</p>
        <div class="actions">
          <button id="prepareTunStart">Prepare Start TUN</button>
          <button id="prepareTunStop" class="secondary">Prepare Stop TUN</button>
        </div>
        <div id="notice" class="notice" role="status"></div>
      </details>
    </div>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${initialState};
    const requirements = [
      {
        label: 'Administrator access',
        test: value => value && (value.sudoAccess === 'member' || value.sudoAccess === 'passwordless'),
        warning: value => value && value.sudoAccess === 'unknown',
        status: value => value.sudoAccess === 'unknown' ? 'Manual check' : 'Not available',
        pending: 'Checks whether this account can perform the privileged setup required by Advanced TUN.',
        detail: value => value.sudoAccess === 'passwordless'
          ? 'Passwordless sudo is available.'
          : value.sudoAccess === 'member'
            ? 'This account belongs to an administrator group; sudo may still ask for a password.'
            : value.sudoAccess === 'unknown'
              ? 'This does not mean you lack sudo. Password-protected sudo, custom sudoers rules, and LDAP/AD groups cannot be confirmed non-interactively. Run sudo -v in a terminal to verify.'
              : 'The sudo command was not found. Ask the server administrator to install or provide administrator access.',
      },
      {
        label: 'TUN device support',
        test: value => value && value.tunDevice,
        warning: () => false,
        status: () => 'Unavailable',
        pending: 'Checks whether the kernel exposes the /dev/net/tun device.',
        detail: value => value.tunDevice
          ? '/dev/net/tun is available.'
          : '/dev/net/tun was not found. The server or kernel must have TUN support enabled.',
      },
      {
        label: 'Proxy helper (tun2socks)',
        test: value => value && value.tun2socks,
        warning: () => false,
        status: () => 'Not installed',
        pending: 'Checks for the helper that converts TUN traffic to the local SOCKS5 proxy.',
        detail: value => value.tun2socks
          ? 'tun2socks is available in PATH.'
          : 'tun2socks was not found in PATH. Normal SOCKS5 and HTTP proxy sharing still works; only Advanced TUN needs this helper.',
      },
      {
        label: 'Namespace relay (socat)',
        test: value => value && value.socat,
        warning: () => false,
        status: () => 'Not installed',
        pending: 'Checks for the TCP and DNS relay used by isolated namespace mode.',
        detail: value => value.socat
          ? 'socat is available for isolated namespace mode.'
          : 'socat was not found. Install it before using isolated namespace mode; global routing does not require it.',
      },
      {
        label: 'Networking tools',
        test: value => value && value.ipCommand,
        warning: () => false,
        status: () => 'Not installed',
        pending: 'Checks for the Linux ip command used to create interfaces and routes.',
        detail: value => value.ipCommand
          ? 'The ip networking command is available.'
          : 'The ip command was not found. Install the iproute2 package for your distribution before using Advanced TUN.',
      },
    ];
    const prepareTunStart = document.getElementById('prepareTunStart');
    const routing = document.getElementById('routing');
    const globalWarning = document.getElementById('globalWarning');
    const stageOrder = ['check', 'start', 'stop'];

    function render(next) {
      state = next;
      const activeIndex = stageOrder.indexOf(state.workflowStage);
      stageOrder.forEach((stage, index) => {
        const element = document.getElementById('stage-' + stage);
        element.className = 'step' + (index === activeIndex ? ' active' : (index < activeIndex ? ' complete' : ''));
        element.setAttribute('aria-current', index === activeIndex ? 'step' : 'false');
      });
      const allReady = state.capabilities && requirements.every(item => item.test(state.capabilities));
      document.getElementById('connectionStatus').textContent = state.checking
        ? 'Checking ' + (state.target || 'the selected server') + '…'
        : state.sharingActive
          ? 'Sharing with ' + (state.target || 'the selected server') + ' through SOCKS5 port ' + state.socksPort + '.'
          : state.capabilities
            ? allReady
              ? 'Check complete. The server is ready for Advanced TUN setup.'
              : 'Check complete. Review the explanations below before continuing.'
            : state.workflowStage === 'stop'
              ? 'Sharing is stopped. Run Check to begin again.'
              : 'Check the remote server before starting network sharing.';
      const start = document.getElementById('startSharing');
      start.style.display = state.sharingActive ? 'none' : '';
      start.disabled = state.checking || !state.capabilities;
      const stop = document.getElementById('stopSharing');
      stop.style.display = state.sharingActive ? '' : 'none';
      const check = document.getElementById('check');
      check.disabled = state.checking;
      check.textContent = state.checking ? 'Checking…' : (state.capabilities ? 'Check again' : 'Check server');
      check.className = state.workflowStage === 'check' ? '' : 'secondary';
      start.className = state.workflowStage === 'start' ? '' : 'secondary';
      stop.className = state.workflowStage === 'stop' ? '' : 'secondary';
      prepareTunStart.disabled = state.checking || !state.sharingActive || !state.capabilities;
      const container = document.getElementById('requirements');
      container.replaceChildren(...requirements.map(item => {
        const row = document.createElement('div');
        row.className = 'requirement';
        const main = document.createElement('div');
        main.className = 'requirement-main';
        const name = document.createElement('span');
        name.textContent = item.label;
        const status = document.createElement('span');
        const known = Boolean(state.capabilities);
        const passed = known && item.test(state.capabilities);
        const warning = known && item.warning(state.capabilities);
        status.className = 'status ' + (known ? (passed ? 'ok' : (warning ? 'warning' : 'missing')) : 'unknown');
        status.textContent = known ? (passed ? 'Ready' : item.status(state.capabilities)) : 'Not checked';
        const detail = document.createElement('div');
        detail.className = 'requirement-detail';
        detail.textContent = known ? item.detail(state.capabilities) : item.pending;
        main.append(name, status);
        row.append(main, detail);
        return row;
      }));
      if (state.error) showNotice(state.error, true);
    }

    function showNotice(message, error = false) {
      const notice = document.getElementById('notice');
      notice.textContent = message;
      notice.className = 'notice' + (error ? ' error' : '');
    }

    function updateControls() {
      globalWarning.style.display = routing.value === 'global' ? 'block' : 'none';
    }

    routing.addEventListener('change', updateControls);
    document.getElementById('basicMode').addEventListener('click', () => vscode.postMessage({ type: 'closeView' }));
    document.getElementById('acknowledge').addEventListener('click', () => {
      document.getElementById('riskGate').hidden = true;
      document.getElementById('tunContent').hidden = false;
    });
    document.getElementById('startSharing').addEventListener('click', () => vscode.postMessage({ type: 'startSharing' }));
    document.getElementById('stopSharing').addEventListener('click', () => vscode.postMessage({ type: 'stopSharing' }));
    document.getElementById('check').addEventListener('click', () => vscode.postMessage({ type: 'checkRequirements' }));
    prepareTunStart.addEventListener('click', () => vscode.postMessage({
      type: 'prepareTunStart',
      options: {
        routingMode: routing.value,
        interfaceName: document.getElementById('interfaceName').value,
        mtu: Number(document.getElementById('mtu').value),
        dnsMode: document.getElementById('dns').value,
      },
    }));
    document.getElementById('prepareTunStop').addEventListener('click', () => vscode.postMessage({
      type: 'prepareTunStop',
      options: {
        routingMode: routing.value,
        interfaceName: document.getElementById('interfaceName').value,
        mtu: Number(document.getElementById('mtu').value),
        dnsMode: document.getElementById('dns').value,
      },
    }));
    window.addEventListener('message', event => {
      if (event.data?.type === 'state') render(event.data.state);
      if (event.data?.type === 'notice') showNotice(event.data.message, Boolean(event.data.error));
    });
    render(state);
    updateControls();
  </script>
</body>
</html>`;
  }
}
