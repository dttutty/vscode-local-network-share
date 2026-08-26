import { ChildProcessByStdio, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import * as vscode from 'vscode';
import { LocalHttpProxy } from './localHttpProxy';
import { sanitizeTarget } from './remoteTarget';

type SshProcess = ChildProcessByStdio<null, Readable, Readable>;

export type TunnelPhase = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

export interface TunnelState {
  phase: TunnelPhase;
  target?: string;
  remotePort?: number;
  remoteHttpPort?: number;
  message?: string;
}

export interface TunnelConfiguration {
  sshPath: string;
  sshTarget: string;
  sshConfigFile?: string;
  remotePort: number;
  httpProxyRemotePort: number;
  connectTimeoutSeconds: number;
  injectHttpProxyVariables: boolean;
}

export class TunnelManager implements vscode.Disposable {
  private readonly stateEmitter = new vscode.EventEmitter<TunnelState>();
  private process: SshProcess | undefined;
  private expectedStop = false;
  private operationId = 0;
  private state: TunnelState = { phase: 'idle' };
  private readonly httpProxy = new LocalHttpProxy();

  readonly onDidChangeState = this.stateEmitter.event;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly environment: vscode.GlobalEnvironmentVariableCollection,
  ) {
    this.environment.persistent = false;
    this.environment.description = new vscode.MarkdownString(
      'Proxy variables managed by Remote Local Network Share for newly created integrated terminals.',
    );
  }

  get currentState(): TunnelState {
    return this.state;
  }

  async start(configuration: TunnelConfiguration): Promise<void> {
    if (this.process && this.process.exitCode === null) {
      return;
    }

    const target = sanitizeTarget(configuration.sshTarget);
    if (!target) {
      throw new Error('The SSH target is empty or unsafe. Configure localNetworkShare.sshTarget.');
    }
    if (!Number.isInteger(configuration.remotePort) || configuration.remotePort < 1024 || configuration.remotePort > 65535) {
      throw new Error('The remote proxy port must be an integer between 1024 and 65535.');
    }
    if (
      !Number.isInteger(configuration.httpProxyRemotePort)
      || configuration.httpProxyRemotePort < 1024
      || configuration.httpProxyRemotePort > 65535
    ) {
      throw new Error('The remote HTTP proxy port must be an integer between 1024 and 65535.');
    }
    if (configuration.httpProxyRemotePort === configuration.remotePort) {
      throw new Error('The SOCKS5 and HTTP proxy ports must be different.');
    }
    if (
      !Number.isInteger(configuration.connectTimeoutSeconds)
      || configuration.connectTimeoutSeconds < 3
      || configuration.connectTimeoutSeconds > 120
    ) {
      throw new Error('The SSH connection timeout must be an integer between 3 and 120 seconds.');
    }

    const currentOperation = ++this.operationId;
    this.expectedStop = false;
    this.setState({
      phase: 'starting',
      target,
      remotePort: configuration.remotePort,
      remoteHttpPort: configuration.httpProxyRemotePort,
    });

    let localHttpPort: number;
    try {
      localHttpPort = await this.httpProxy.start();
      this.output.appendLine(`[http-proxy] Listening locally at http://127.0.0.1:${localHttpPort}.`);
    } catch (error) {
      this.setState({
        phase: 'error',
        target,
        remotePort: configuration.remotePort,
        remoteHttpPort: configuration.httpProxyRemotePort,
        message: 'Could not start the local HTTP CONNECT proxy.',
      });
      throw new Error(`Could not start the local HTTP CONNECT proxy: ${error instanceof Error ? error.message : String(error)}`);
    }

    const args = buildSshArguments(configuration, target, localHttpPort);
    this.output.appendLine(`[tunnel] Starting ${configuration.sshPath} ${formatArgumentsForLog(args)}`);

    let child: SshProcess;
    try {
      child = spawn(configuration.sshPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      await this.httpProxy.stop();
      this.setState({
        phase: 'error',
        target,
        remotePort: configuration.remotePort,
        remoteHttpPort: configuration.httpProxyRemotePort,
        message: 'Could not launch the local SSH client.',
      });
      throw new Error(`Could not launch the local SSH client: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.process = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.appendProcessOutput('stdout', chunk));
    child.stderr.on('data', (chunk: string) => this.appendProcessOutput('stderr', chunk));

    const startupResult = await new Promise<'running' | 'failed'>((resolve) => {
      let settled = false;
      let startupOutput = '';
      let timeout: NodeJS.Timeout | undefined;
      const settle = (result: 'running' | 'failed') => {
        if (!settled) {
          settled = true;
          if (timeout) {
            clearTimeout(timeout);
          }
          child.stderr.off('data', onStderr);
          child.off('error', onError);
          child.off('exit', onExit);
          resolve(result);
        }
      };
      const onStderr = (chunk: string | Buffer) => {
        startupOutput = `${startupOutput}${chunk.toString()}`.slice(-16_384);
        const successfulForwards = startupOutput.match(/remote forward success/giu)?.length ?? 0;
        if (successfulForwards >= 2) {
          settle('running');
        }
      };
      const onError = (error: Error) => {
        this.output.appendLine(`[tunnel] Failed to launch SSH: ${error.message}`);
        settle('failed');
      };
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        this.output.appendLine(`[tunnel] SSH exited during startup (code=${String(code)}, signal=${String(signal)}).`);
        settle('failed');
      };

      child.stderr.on('data', onStderr);
      child.once('error', onError);
      child.once('exit', onExit);
      timeout = setTimeout(
        () => settle('failed'),
        (configuration.connectTimeoutSeconds + 5) * 1000,
      );
    });

    if (currentOperation !== this.operationId) {
      await this.httpProxy.stop();
      return;
    }

    if (startupResult === 'failed' || child.exitCode !== null) {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
      this.process = undefined;
      await this.httpProxy.stop();
      this.clearProxyEnvironment();
      this.setState({
        phase: 'error',
        target,
        remotePort: configuration.remotePort,
        remoteHttpPort: configuration.httpProxyRemotePort,
        message: 'SSH exited before the tunnel became ready. Open the Local Network Share log for details.',
      });
      throw new Error('Could not establish the SSH reverse tunnel. Open the extension log for details.');
    }

    child.once('exit', (code, signal) => this.handleUnexpectedExit(child, code, signal));
    this.applyProxyEnvironment(
      configuration.remotePort,
      configuration.httpProxyRemotePort,
      configuration.injectHttpProxyVariables,
    );
    this.setState({
      phase: 'active',
      target,
      remotePort: configuration.remotePort,
      remoteHttpPort: configuration.httpProxyRemotePort,
    });
    this.output.appendLine(`[tunnel] Active. Remote SOCKS5 endpoint: socks5h://127.0.0.1:${configuration.remotePort}`);
    this.output.appendLine(`[tunnel] Active. Remote HTTP endpoint: http://127.0.0.1:${configuration.httpProxyRemotePort}`);
  }

  async stop(): Promise<void> {
    ++this.operationId;
    this.expectedStop = true;
    this.clearProxyEnvironment();

    const child = this.process;
    if (!child || child.exitCode !== null) {
      this.process = undefined;
      await this.httpProxy.stop();
      this.setState({ phase: 'idle' });
      return;
    }

    this.setState({ ...this.state, phase: 'stopping' });
    this.output.appendLine('[tunnel] Stopping SSH tunnel.');
    child.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      child.once('exit', finish);
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
        finish();
      }, 2500);
    });

    if (this.process === child) {
      this.process = undefined;
    }
    await this.httpProxy.stop();
    this.setState({ phase: 'idle' });
    this.output.appendLine('[tunnel] Stopped.');
  }

  dispose(): void {
    this.clearProxyEnvironment();
    void this.httpProxy.stop();
    if (this.process?.exitCode === null) {
      this.expectedStop = true;
      this.process.kill('SIGTERM');
    }
    this.process = undefined;
    this.stateEmitter.dispose();
  }

  private handleUnexpectedExit(
    child: SshProcess,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (this.process !== child) {
      return;
    }
    this.process = undefined;
    this.clearProxyEnvironment();
    void this.httpProxy.stop();

    if (this.expectedStop) {
      this.setState({ phase: 'idle' });
      return;
    }

    const message = `SSH tunnel stopped unexpectedly (code=${String(code)}, signal=${String(signal)}).`;
    this.output.appendLine(`[tunnel] ${message}`);
    this.setState({ ...this.state, phase: 'error', message });
    void vscode.window.showWarningMessage(`${message} Open the Local Network Share log for details.`);
  }

  private applyProxyEnvironment(
    socksPort: number,
    httpPort: number,
    injectHttpProxyVariables: boolean,
  ): void {
    const socksProxyUrl = `socks5h://127.0.0.1:${socksPort}`;
    this.environment.replace('ALL_PROXY', socksProxyUrl);
    this.environment.replace('all_proxy', socksProxyUrl);

    if (injectHttpProxyVariables) {
      const httpProxyUrl = `http://127.0.0.1:${httpPort}`;
      for (const variable of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
        this.environment.replace(variable, httpProxyUrl);
      }
    }

    this.environment.prepend('NO_PROXY', 'localhost,127.0.0.1,::1,');
    this.environment.prepend('no_proxy', 'localhost,127.0.0.1,::1,');
  }

  private clearProxyEnvironment(): void {
    this.environment.clear();
  }

  private appendProcessOutput(stream: string, chunk: string): void {
    for (const line of chunk.replace(/\r\n/gu, '\n').split('\n')) {
      if (line) {
        this.output.appendLine(`[ssh:${stream}] ${line}`);
      }
    }
  }

  private setState(state: TunnelState): void {
    this.state = state;
    this.stateEmitter.fire(state);
  }
}

export function buildSshArguments(
  configuration: TunnelConfiguration,
  target: string,
  localHttpPort: number,
): string[] {
  const args = [
    '-v',
    '-N',
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    `ConnectTimeout=${configuration.connectTimeoutSeconds}`,
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=3',
  ];

  if (configuration.sshConfigFile) {
    args.push('-F', configuration.sshConfigFile);
  }

  args.push(
    '-R',
    `127.0.0.1:${configuration.remotePort}`,
    '-R',
    `127.0.0.1:${configuration.httpProxyRemotePort}:127.0.0.1:${localHttpPort}`,
    target,
  );
  return args;
}

function formatArgumentsForLog(args: string[]): string {
  return args.map((argument) => (/^[A-Za-z0-9_./:=@-]+$/u.test(argument) ? argument : JSON.stringify(argument))).join(' ');
}
