/** Drives the HTML loading screen defined in index.html. */

export function setProgress(fraction: number): void {
  const bar = document.getElementById('loader-bar');
  if (bar) bar.style.width = `${Math.round(Math.max(0.08, Math.min(1, fraction)) * 100)}%`;
}

/** Reveals the game: shows touch buttons and fades the loader out. */
export function markReady(): void {
  document.body.classList.add('ready');
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.classList.add('hide');
  const remove = () => loader.remove();
  loader.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 800);
}
