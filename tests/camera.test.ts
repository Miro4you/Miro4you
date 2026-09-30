import { describe, expect, it } from 'vitest';
import { Camera, snapRotation } from '../src/core/camera';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('camera', () => {
  it('round-trips world and screen coordinates with rotation', () => {
    const c = new Camera();
    c.state = { scale: 3.3, rot: 0.7, tx: 120, ty: -40 };
    const w = { x: 12.5, y: -7 };
    close(c.toWorld(c.toScreen(w)), w);
  });

  it('keeps the point under the cursor fixed when zooming', () => {
    const c = new Camera();
    c.state = { scale: 4, rot: 0.3, tx: 10, ty: 20 };
    const s = { x: 300, y: 200 };
    const w = c.toWorld(s);
    c.zoomAt(s, 2.5);
    close(c.toScreen(w), s);
    expect(c.scale).toBeCloseTo(10);
  });

  it('two-finger gesture keeps both grabbed points under the fingers', () => {
    const c = new Camera();
    const w1 = c.toWorld({ x: 100, y: 100 });
    const w2 = c.toWorld({ x: 200, y: 100 });
    const s1 = { x: 80, y: 90 };
    const s2 = { x: 80 + 120 * Math.cos(0.5), y: 90 + 120 * Math.sin(0.5) };
    c.gesture(w1, w2, s1, s2, true, 0);
    expect(c.rot).toBeCloseTo(0.5);
    close(c.toScreen(w1), s1);
    close(c.toScreen(w2), s2);
  });

  it('snaps the view rotation near multiples of 45°', () => {
    const d = Math.PI / 180;
    expect(snapRotation(2 * d)).toBe(0);
    expect(snapRotation(47 * d)).toBeCloseTo(45 * d);
    expect(snapRotation(-88 * d)).toBeCloseTo(-90 * d);
    expect(snapRotation(20 * d)).toBeCloseTo(20 * d);
  });
});
