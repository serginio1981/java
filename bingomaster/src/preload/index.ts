import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { BingoBridge } from '../shared/ipc/contract';
import { FOLDER_CHANNEL, STATE_CHANNEL } from '../shared/ipc/contract';

const bridge: BingoBridge = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  onState: (cb) => {
    const h = (_e: IpcRendererEvent, s: Parameters<typeof cb>[0]): void => cb(s);
    ipcRenderer.on(STATE_CHANNEL, h);
    return () => {
      ipcRenderer.removeListener(STATE_CHANNEL, h);
    };
  },
  onFolderChanged: (cb) => {
    const h = (): void => cb();
    ipcRenderer.on(FOLDER_CHANNEL, h);
    return () => {
      ipcRenderer.removeListener(FOLDER_CHANNEL, h);
    };
  },
};

contextBridge.exposeInMainWorld('bingo', bridge);
