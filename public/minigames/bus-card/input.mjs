import { hostPad } from './host.mjs';
export function installInput({ cancel, onOwnerChange, initialOwner = 'mouse' }) {
  let owner = initialOwner, target = document.querySelector('#card-A');
  document.body.dataset.owner = owner;
  let lastPointer = null, touchUntil = 0, previousDirection = '', nextRepeat = 0;
  let previousA = false, previousB = false, armed = false, focused = true;
  const buttons = () => [...document.querySelectorAll('button')].filter(button => !button.disabled && button.offsetParent !== null);
  const clear = () => document.querySelectorAll('[data-nav]').forEach(button => button.removeAttribute('data-nav'));
  const paint = () => {
    clear();
    if (!buttons().includes(target)) target = buttons()[0];
    if (focused && ['keyboard', 'gamepad'].includes(owner) && target) target.dataset.nav = 'true';
  };
  function takeover(next) {
    let interrupted = false;
    if (owner !== next) {
      clear();
      owner = next;
      document.body.dataset.owner = next;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      interrupted = onOwnerChange(next) === true;
    }
    paint();
    return interrupted;
  }
  const center = button => {
    const box = button.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  function move(direction) {
    paint();
    const list = buttons();
    if (!target || list.length < 2) return;
    const point = center(target), horizontal = ['left', 'right'].includes(direction);
    const sign = ['right', 'down'].includes(direction) ? 1 : -1;
    const candidates = list.filter(button => button !== target).map(button => {
      const position = center(button);
      return { button, along: (horizontal ? position.x - point.x : position.y - point.y) * sign, across: Math.abs(horizontal ? position.y - point.y : position.x - point.x) };
    });
    const ahead = candidates.filter(item => item.along > 8).sort((a, b) => (a.along + a.across * 3) - (b.along + b.across * 3));
    const wrapped = candidates.sort((a, b) => (a.across * 5 + a.along) - (b.across * 5 + b.along));
    target = (ahead[0] || wrapped[0]).button;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    paint();
  }
  function activate() { paint(); target?.click(); paint(); }
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || performance.now() < touchUntil) return;
    const position = { x: event.clientX, y: event.clientY };
    if (lastPointer && Math.hypot(position.x - lastPointer.x, position.y - lastPointer.y) > 2) takeover('mouse');
    lastPointer = position;
  });
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      touchUntil = performance.now() + 900;
      takeover('touch');
    } else if (performance.now() >= touchUntil) takeover('mouse');
    const button = event.target.closest('button');
    if (button && !button.disabled) target = button;
  });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (![...Object.keys(directions), 'Tab', 'Enter', ' ', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat && owner !== 'keyboard') return;
    const interrupted = takeover('keyboard');
    if (directions[event.key]) move(directions[event.key]);
    else if (event.key === 'Tab') {
      const list = buttons(), index = list.indexOf(target);
      target = list[(index + (event.shiftKey ? -1 : 1) + list.length) % list.length];
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
      paint();
    } else if (!event.repeat && event.key === 'Escape') { cancel(); paint(); }
    else if (!event.repeat && !interrupted) activate();
  });
  window.addEventListener('blur', () => { focused = false; armed = false; clear(); });
  window.addEventListener('focus', () => { focused = true; armed = false; });
  window.addEventListener('gamepaddisconnected', () => { clear(); armed = false; previousDirection = ''; previousA = previousB = false; });
  document.addEventListener('pointercancel', () => { lastPointer = null; clear(); });
  function poll(now) {
    const pad = hostPad();
    if (!pad) {
      armed = false; previousDirection = ''; previousA = previousB = false;
      if (owner === 'gamepad') clear();
    }
    if (pad && focused) {
      const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
      const pressed = index => !!pad.buttons[index]?.pressed;
      let direction = pressed(14) ? 'left' : pressed(15) ? 'right' : pressed(12) ? 'up' : pressed(13) ? 'down' : '';
      if (!direction && Math.max(Math.abs(x), Math.abs(y)) > .55) direction = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
      const a = pressed(0), b = pressed(1);
      if (!armed) { if (!direction && !a && !b) armed = true; }
      else {
        if (direction && (direction !== previousDirection || (owner === 'gamepad' && now >= nextRepeat))) {
          takeover('gamepad'); move(direction); nextRepeat = now + (direction !== previousDirection ? 370 : 165);
        }
        if (a && !previousA) { if (!takeover('gamepad')) activate(); }
        if (b && !previousB) { takeover('gamepad'); cancel(); paint(); }
      }
      previousDirection = direction; previousA = a; previousB = b;
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
  onOwnerChange(owner);
  paint();
  return { refresh: paint };
}
