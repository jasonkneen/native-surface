import { applyToPoint, type Mat3 } from '../engine/matrix';
import type { Point, Rect } from './types';

export function rectPolygon(r: Rect): Point[] {
  return [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
}
export function transformRect(m: Mat3, r: Rect): Point[] {
  return rectPolygon(r).map(p => applyToPoint(m, p.x, p.y));
}
export function envelope(points: readonly Point[]): Rect | null {
  if (!points.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  return width > 1e-6 && height > 1e-6 ? { x, y, width, height } : null;
}
export function area(poly: readonly Point[]): number {
  return Math.abs(poly.reduce((sum, p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return sum + p.x * q.y - p.y * q.x;
  }, 0)) / 2;
}
function halfPlane(poly: Point[], a: Point, b: Point, sign: number): Point[] {
  const result: Point[] = [];
  const distance = (p: Point) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const dp = distance(p), dq = distance(q);
    if (dp >= 0) result.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq);
      result.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return result;
}
export function intersect(poly: Point[], clip: Point[]): Point[] {
  const signed = clip.reduce((s, p, i) => {
    const q = clip[(i + 1) % clip.length]!;
    return s + p.x * q.y - p.y * q.x;
  }, 0);
  if (Math.abs(signed) < 1e-8) return [];
  let out = poly;
  for (let i = 0; i < clip.length && out.length; i++) {
    out = halfPlane(out, clip[i]!, clip[(i + 1) % clip.length]!, Math.sign(signed));
  }
  return area(out) > 1e-6 ? out : [];
}
/** Subtract an opaque, axis-aligned box, preserving disconnected visible pieces. */
export function subtract(poly: Point[], box: Rect): Point[][] {
  const clip = rectPolygon(box), out: Point[][] = [];
  let inside = poly;
  for (let i = 0; i < 4 && inside.length; i++) {
    const a = clip[i]!, b = clip[(i + 1) % 4]!;
    const outside = halfPlane(inside, a, b, -1);
    if (area(outside) > 1e-6) out.push(outside);
    inside = halfPlane(inside, a, b, 1);
  }
  return out;
}
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
