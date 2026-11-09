import { useEffect, useRef, useState } from "react";

type DragState = { id: string; fromIndex: number; toIndex: number };

/**
 * Drag-bar reordering for a vertical list (pair with `DragHandle`). Rows report their height with
 * `onRowLayout`; the drop slot follows the finger by row heights, and `onDrop` gets the moved order.
 */
export function useDragReorder<T extends { id: string }>(items: T[], onDrop: (next: T[]) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef    = useRef<DragState | null>(null);
  const rowHeights = useRef<Map<string, number>>(new Map());
  const itemsRef   = useRef(items);
  const dropRef    = useRef(onDrop);
  useEffect(() => { itemsRef.current = items; dropRef.current = onDrop; });

  function dropIndex(fromIndex: number, dy: number): number {
    const ids = itemsRef.current.map(t => t.id);
    if (fromIndex < 0 || ids.length < 2) return Math.max(0, Math.min(ids.length - 1, fromIndex));
    let target = fromIndex, acc = 0;
    if (dy > 0) {
      for (let i = fromIndex + 1; i < ids.length; i++) {
        const h = rowHeights.current.get(ids[i]) ?? 64;
        if (dy > acc + h / 2) { target = i; acc += h; } else break;
      }
    } else {
      for (let i = fromIndex - 1; i >= 0; i--) {
        const h = rowHeights.current.get(ids[i]) ?? 64;
        if (-dy > acc + h / 2) { target = i; acc += h; } else break;
      }
    }
    return target;
  }

  function onStart(id: string) {
    const i = itemsRef.current.findIndex(t => t.id === id);
    const s = { id, fromIndex: i, toIndex: i };
    dragRef.current = s; setDrag(s);
  }
  function onMove(id: string, dy: number) {
    const d = dragRef.current;
    if (!d || d.id !== id) return;
    const to = dropIndex(d.fromIndex, dy);
    if (to !== d.toIndex) { const u = { ...d, toIndex: to }; dragRef.current = u; setDrag(u); }
  }
  function onEnd(id: string) {
    const d = dragRef.current;
    dragRef.current = null; setDrag(null);
    if (!d || d.id !== id || d.fromIndex < 0 || d.toIndex === d.fromIndex) return;
    const next = [...itemsRef.current];
    const [m] = next.splice(d.fromIndex, 1);
    next.splice(d.toIndex, 0, m);
    dropRef.current(next);
  }

  return {
    dragging: drag !== null,
    handle: { onStart, onMove, onEnd },
    onRowLayout: (id: string) => (e: { nativeEvent: { layout: { height: number } } }) =>
      rowHeights.current.set(id, e.nativeEvent.layout.height),
    isDragged: (id: string) => drag?.id === id,
    /** Where to draw the drop line on the row at `index`, if anywhere. */
    dropAt: (id: string, index: number): "above" | "below" | null =>
      !drag || drag.id === id || drag.toIndex !== index ? null : drag.toIndex < drag.fromIndex ? "above" : "below",
  };
}
