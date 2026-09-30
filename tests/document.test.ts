import { describe, expect, it } from 'vitest';
import { SketchDocument, validateFile } from '../src/core/document';
import type { LineEntity } from '../src/core/types';

function line(doc: SketchDocument, id: string, x = 0): LineEntity {
  return {
    kind: 'line',
    id,
    layerId: doc.activeLayerId,
    z: doc.allocZ(),
    style: { pen: 'ink', width: 0.35, lineType: 'solid', color: null },
    a: { x, y: 0 },
    b: { x: x + 10, y: 0 },
  };
}

describe('SketchDocument', () => {
  it('undoes and redoes adds, updates and removes', () => {
    const doc = new SketchDocument();
    const l = line(doc, 'a');
    doc.add(l);
    doc.update({ ...l, b: { x: 20, y: 0 } });
    doc.remove('a');
    expect(doc.size).toBe(0);
    doc.undo();
    expect((doc.get('a') as LineEntity).b.x).toBe(20);
    doc.undo();
    expect((doc.get('a') as LineEntity).b.x).toBe(10);
    doc.undo();
    expect(doc.size).toBe(0);
    doc.redo();
    doc.redo();
    expect((doc.get('a') as LineEntity).b.x).toBe(20);
  });

  it('groups transactions into one undo step', () => {
    const doc = new SketchDocument();
    doc.begin();
    doc.add(line(doc, 'a'));
    doc.add(line(doc, 'b'));
    doc.commit();
    doc.undo();
    expect(doc.size).toBe(0);
  });

  it('restores the start state after transient drag updates', () => {
    const doc = new SketchDocument();
    const l = line(doc, 'a');
    doc.add(l);
    doc.replaceTransient({ ...l, b: { x: 30, y: 0 } });
    doc.replaceTransient({ ...l, b: { x: 40, y: 0 } });
    doc.update(doc.get('a')!, l);
    doc.undo();
    expect((doc.get('a') as LineEntity).b.x).toBe(10);
  });

  it('keeps layer display flags out of undo history', () => {
    const doc = new SketchDocument();
    const [bottom] = doc.layers;
    doc.setLayers(doc.layers.map((l) => (l.id === bottom.id ? { ...l, name: 'Neu' } : l)));
    doc.patchLayerView(bottom.id, { visible: false });
    doc.undo();
    expect(doc.layer(bottom.id)!.name).toBe('Skizze');
    expect(doc.layer(bottom.id)!.visible).toBe(false);
  });

  it('deleting a layer removes its entities as one undo step', () => {
    const doc = new SketchDocument();
    const id = doc.activeLayerId;
    doc.add(line(doc, 'a'));
    doc.deleteLayer(id);
    expect(doc.layers.length).toBe(1);
    expect(doc.size).toBe(0);
    doc.undo();
    expect(doc.layers.length).toBe(2);
    expect(doc.get('a')?.layerId).toBe(id);
  });

  it('keeps draw order by z, also after undoing a removal', () => {
    const doc = new SketchDocument();
    doc.add(line(doc, 'a'));
    doc.add(line(doc, 'b'));
    doc.remove('a');
    doc.undo();
    expect(doc.byLayer().get(doc.activeLayerId)!.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('serialises and loads files', () => {
    const doc = new SketchDocument();
    doc.add(line(doc, 'a', 1.23456));
    const file = JSON.parse(JSON.stringify(doc.toFile({ scale: 2, rot: 0, tx: 1, ty: 2 })));
    const other = new SketchDocument();
    const f = other.loadFile(file);
    expect(other.size).toBe(1);
    expect((other.get('a') as LineEntity).a.x).toBe(1.235);
    expect(f.view?.scale).toBe(2);
    expect(other.canUndo).toBe(false);
  });

  it('rejects foreign files and drops invalid entities', () => {
    expect(() => validateFile({ hello: 1 })).toThrow();
    const doc = new SketchDocument();
    const f = doc.toFile();
    f.entities.push({ kind: 'line', id: 'x', layerId: 'missing' } as unknown as LineEntity);
    expect(validateFile(f).entities.length).toBe(0);
  });
});
