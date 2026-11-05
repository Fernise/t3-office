/** Place projected labels beside their floors while keeping controls and other labels reachable. */
export interface Rect { left: number; top: number; width: number; height: number }
export function placeLabel(anchor: { x: number; y: number }, width: number, height: number, viewport: { width: number; height: number }, obstacles: Rect[]): Rect | undefined {
  const gap = 8, inset = 10;
  const clampX = (x: number) => Math.max(inset, Math.min(viewport.width - width - inset, x));
  const clampY = (y: number) => Math.max(inset, Math.min(viewport.height - height - inset, y));
  if (viewport.width < width + inset * 2 || viewport.height < height + inset * 2) return;
  const x = clampX(anchor.x - width - 12), y = clampY(anchor.y - height / 2);
  const candidates = [{ x, y }, { x: clampX(anchor.x + 12), y }];
  for (const r of obstacles) candidates.push(
    { x: clampX(r.left - width - gap), y }, { x: clampX(r.left + r.width + gap), y },
    { x, y: clampY(r.top - height - gap) }, { x, y: clampY(r.top + r.height + gap) },
  );
  const free = candidates.filter(p => !obstacles.some(r => p.x < r.left + r.width + gap && p.x + width + gap > r.left && p.y < r.top + r.height + gap && p.y + height + gap > r.top));
  free.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  return free[0] && { left: free[0].x, top: free[0].y, width, height };
}
