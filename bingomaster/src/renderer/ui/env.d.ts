import type { BingoBridge } from '../../shared/ipc/contract';

declare global {
  interface Window {
    bingo: BingoBridge;
  }
}

export {};
