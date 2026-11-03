export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export function circleRect(c: Circle, r: Rect): boolean {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - cx;
  const dy = c.y - cy;
  return dx * dx + dy * dy < c.r * c.r;
}

/** Circle against a vertical segment at x spanning [top, bottom]. */
export function circleVSegment(c: Circle, x: number, top: number, bottom: number): boolean {
  const cy = Math.max(top, Math.min(c.y, bottom));
  const dx = c.x - x;
  const dy = c.y - cy;
  return dx * dx + dy * dy < c.r * c.r;
}
