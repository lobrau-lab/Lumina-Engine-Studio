import { GameObjectData } from './types';
import * as THREE from 'three';

export class ScriptRunner {
  private scripts: Map<string, Function> = new Map();
  private onLog: (msg: string, type: 'info' | 'error') => void;

  constructor(onLog: (msg: string, type: 'info' | 'error') => void) {
    this.onLog = onLog;
  }

  public compile(id: string, code: string) {
    try {
      const fn = new Function('self', 'time', 'deltaTime', 'THREE', 'log', `
        try {
          ${code}
        } catch (e) {
          log("Script Error: " + e.message, 'error');
        }
      `);
      this.scripts.set(id, fn);
    } catch (e) {
      this.onLog("Compilation Error: " + e.message, 'error');
    }
  }

  public run(id: string, obj: any, time: number, deltaTime: number) {
    const script = this.scripts.get(id);
    if (script) {
      script(obj, time, deltaTime, THREE, (msg: string, type: 'info' | 'error' = 'info') => this.onLog(msg, type));
    }
  }

  public clear() {
    this.scripts.clear();
  }
}
