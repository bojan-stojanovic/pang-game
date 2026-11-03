/** State of the DOM on-screen buttons (left / right / fire), read by the Phaser scene each tick. */
export const touch = {
  left: false,
  right: false,
  fire: false,
  /** Set when the fire button is pressed; consumed as a "confirm" gesture in menus. */
  confirm: false,
};

function bind(id: string, set: (v: boolean) => void): void {
  const el = document.getElementById(id);
  if (!el) return;
  const off = (e: Event) => {
    e.preventDefault();
    el.classList.remove('down');
    set(false);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('down');
    set(true);
  });
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('lostpointercapture', off);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function initTouchControls(): void {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
  }
  bind('btn-left', (v) => (touch.left = v));
  bind('btn-right', (v) => (touch.right = v));
  bind('btn-fire', (v) => {
    touch.fire = v;
    if (v) touch.confirm = true;
  });
}
