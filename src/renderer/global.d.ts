import type { DevBoxBridge } from "../shared/bridge";

declare global {
  interface Window {
    devbox: DevBoxBridge;
  }
}

export {};
