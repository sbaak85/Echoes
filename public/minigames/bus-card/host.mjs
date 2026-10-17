const embedded = window.parent !== window;
export const initialOwner = ['mouse','keyboard','gamepad','touch'].includes(new URLSearchParams(location.search).get('owner'))
  ? new URLSearchParams(location.search).get('owner') : 'mouse';
let pad = null;
export const hostPad = () => embedded ? pad : [...(navigator.getGamepads?.() || [])].find(Boolean);
export function notifyHost(type, payload = {}) {
  if (embedded) window.parent.postMessage({ channel:'echoes-bus-card', type, ...payload }, location.origin);
}
window.addEventListener('message', event => {
  if (event.origin === location.origin && event.source === window.parent &&
      event.data?.channel === 'echoes-bus-card' && event.data.type === 'gamepad') pad = event.data.pad;
});
