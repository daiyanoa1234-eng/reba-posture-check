/** Service Worker（オフライン対応）の状態 */
type Listener = () => void;

export const pwaState = {
  needRefresh: false,
  offlineReady: false,
  update: null as null | (() => Promise<void>),
};
const listeners = new Set<Listener>();
export function onPwaChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function setPwa(p: Partial<typeof pwaState>): void {
  Object.assign(pwaState, p);
  for (const l of listeners) l();
}
