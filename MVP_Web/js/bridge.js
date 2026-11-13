/**
 * 事件桥接装配层（一次性写定，之后双方都不必再改本文件）。
 * sim.on(fn) 内部是 listeners.push(fn)，天然支持多路监听：
 * A 侧 coreListener 与 B 侧 viewListener 各注册各的，互不干扰，
 * 同一事件可由两侧分别处理（如 end：A 管状态机、B 管结算页）。
 */
import { coreListener } from './bridge-core.js';
import { viewListener } from './bridge-view.js';

export function installBridge(sim, ctx) {
  sim.on(coreListener(ctx));
  sim.on(viewListener(ctx));
}
