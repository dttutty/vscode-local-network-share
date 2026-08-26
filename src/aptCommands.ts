export const REMOVE_PERSISTENT_APT_PROXY_COMMAND = 'sudo rm -f /etc/apt/apt.conf.d/99local-network-share';

export function createOneTimeAptCommand(port: number): string {
  const proxy = `http://127.0.0.1:${port}`;
  return `sudo apt -o Acquire::http::Proxy="${proxy}" -o Acquire::https::Proxy="${proxy}" update`;
}

export function createAptInstallCommand(port: number): string {
  const proxy = `http://127.0.0.1:${port}`;
  return `sudo apt -o Acquire::http::Proxy="${proxy}" -o Acquire::https::Proxy="${proxy}" install PACKAGE_NAME`;
}

export function createPersistentAptCommand(port: number): string {
  const proxy = `http://127.0.0.1:${port}`;
  return `printf '%s\\n' 'Acquire::http::Proxy "${proxy}";' 'Acquire::https::Proxy "${proxy}";' | sudo tee /etc/apt/apt.conf.d/99local-network-share >/dev/null`;
}
