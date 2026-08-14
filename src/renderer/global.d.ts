import type { DevBoxBridge } from "../shared/bridge";

declare global {
  const __DEVBOX_VERSION__: string;

  interface Window {
    devbox: DevBoxBridge;
  }
}

export {};
