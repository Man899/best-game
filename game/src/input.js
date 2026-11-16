// Keyboard and mouse input, read once per frame. Movement is WASD or arrows; the mouse aims;
// holding the mouse (or Space) fires; Shift or right-click dashes; P pauses, M mutes, Enter
// confirms, and 1/2/3 pick an upgrade card.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_DASH = 8;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let upgradePick = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseInside = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (KEY_ACTIONS[event.code]) actions |= KEY_ACTIONS[event.code];
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') actions |= ACTION_DASH;
    if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
      upgradePick = Number(event.code.slice(-1));
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseInside = true;
  }

  function onMouseDown(event) {
    trackMouse(event);
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_CONFIRM;
    } else if (event.button === 2) {
      actions |= ACTION_DASH;
    }
    event.preventDefault();
  }

  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', trackMouse);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('mouseleave', () => {
    mouseInside = false;
  });

  return {
    /** Movement vector from WASD/arrows, normalised. */
    move() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const len = Math.hypot(x, y);
        x /= len;
        y /= len;
      }
      return { x, y };
    },
    /** Aim point in canvas CSS pixels (the renderer maps it into arena space). */
    aim() {
      return { x: mouseX, y: mouseY, inside: mouseInside };
    },
    firing() {
      return mouseDown || keys.has('Space');
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeUpgradePick() {
      const pick = upgradePick;
      upgradePick = 0;
      return pick;
    },
  };
}
