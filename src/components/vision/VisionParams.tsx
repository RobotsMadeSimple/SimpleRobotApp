import { BlobDetectionParams } from "@/src/models/robotModels";
import { useEffect, useRef, useState } from "react";
import { PanResponder, StyleSheet, Switch, Text, TextInput, View } from "react-native";

export function ParamRow({ label, value, min, max, onChange, desc }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; desc?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  return (
    <View>
      <View style={styles.paramRow}>
        <Text style={styles.paramLabel}>{label}</Text>
        <TextInput
          style={styles.paramInput}
          keyboardType="numeric"
          value={text}
          onChangeText={t => {
            setText(t);
            const n = parseFloat(t);
            if (!isNaN(n) && n >= min && n <= max) onChange(n);
          }}
        />
      </View>
      {!!desc && <Text style={styles.paramDesc}>{desc}</Text>}
    </View>
  );
}

export function ToggleRow({ label, value, onChange, desc }: {
  label: string; value: boolean; onChange: (v: boolean) => void; desc?: string;
}) {
  return (
    <View>
      <View style={styles.paramRow}>
        <Text style={styles.paramLabel}>{label}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: "#0891b2" }} />
      </View>
      {!!desc && <Text style={styles.paramDesc}>{desc}</Text>}
    </View>
  );
}

export function SliderParamRow({ label, value, min, max, onChange, desc }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; desc?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const THUMB_D     = 20;
  const ROW_H       = THUMB_D + 8;
  const barWRef     = useRef(1);
  const valueRef    = useRef(value);
  const startValRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current    = value;
  onChangeRef.current = onChange;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startValRef.current = valueRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const raw     = startValRef.current + (g.dx / Math.max(1, barWRef.current)) * (max - min);
      const clamped = Math.max(min, Math.min(max, raw));
      onChangeRef.current(Math.round(clamped * 1000) / 1000);
    },
    onPanResponderRelease: () => {},
  })).current;

  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));

  return (
    <View>
      <View style={styles.paramRow}>
        <Text style={styles.paramLabel}>{label}</Text>
        <TextInput
          style={styles.paramInput}
          keyboardType="numeric"
          value={text}
          onChangeText={t => {
            setText(t);
            const n = parseFloat(t);
            if (!isNaN(n) && n >= min && n <= max) onChange(n);
          }}
        />
      </View>

      <View
        style={{ height: ROW_H, position: 'relative', marginTop: 6, marginBottom: 2 }}
        onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
      >
        <View style={{
          position: 'absolute', left: 0, right: 0,
          top: (ROW_H - 4) / 2, height: 4, borderRadius: 2,
          backgroundColor: '#e5e7eb', overflow: 'hidden',
        }}>
          <View style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 2, backgroundColor: '#d97706' }} />
        </View>

        <View
          {...pan.panHandlers}
          style={{
            position: 'absolute',
            left: `${frac * 100}%`,
            top: 0,
            width: THUMB_D, height: ROW_H,
            marginLeft: -THUMB_D / 2,
            justifyContent: 'center', alignItems: 'center',
          }}
        >
          <View style={{
            width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
            backgroundColor: '#fff', borderWidth: 2.5, borderColor: '#d97706',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 3,
          }} />
        </View>
      </View>

      {!!desc && <Text style={styles.paramDesc}>{desc}</Text>}
    </View>
  );
}

export function GrayscaleSliderRow({ label, value, onChange, desc }: {
  label: string; value: number; onChange: (v: number) => void; desc?: string;
}) {
  const SEGS    = 32;
  const THUMB_D = 20;
  const ROW_H   = THUMB_D + 8;

  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const barWRef     = useRef(1);
  const valueRef    = useRef(value);
  const startValRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current    = value;
  onChangeRef.current = onChange;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startValRef.current = valueRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const v = Math.round(Math.max(0, Math.min(255,
        startValRef.current + (g.dx / Math.max(1, barWRef.current)) * 255)));
      onChangeRef.current(v);
    },
    onPanResponderRelease: () => {},
  })).current;

  const frac       = value / 255;
  const brightness = Math.round(Math.max(0, Math.min(255, value)));

  return (
    <View>
      <View style={styles.paramRow}>
        <Text style={styles.paramLabel}>{label}</Text>
        <TextInput
          style={styles.paramInput}
          keyboardType="numeric"
          value={text}
          onChangeText={t => {
            setText(t);
            const n = parseInt(t, 10);
            if (!isNaN(n) && n >= 0 && n <= 255) onChange(n);
          }}
        />
      </View>

      <View
        style={{ height: ROW_H, position: 'relative', marginTop: 6, marginBottom: 2 }}
        onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
      >
        {/* Black-to-white gradient track */}
        <View style={{
          position: 'absolute', left: 0, right: 0,
          top: (ROW_H - 4) / 2, height: 4, borderRadius: 2, overflow: 'hidden',
          flexDirection: 'row',
        }}>
          {Array.from({ length: SEGS }, (_, i) => {
            const b = Math.round((i / (SEGS - 1)) * 255);
            return <View key={i} style={{ flex: 1, backgroundColor: `rgb(${b},${b},${b})` }} />;
          })}
        </View>

        {/* Thumb — shows the actual grayscale color */}
        <View
          {...pan.panHandlers}
          style={{
            position: 'absolute',
            left: `${frac * 100}%`,
            top: 0,
            width: THUMB_D, height: ROW_H,
            marginLeft: -THUMB_D / 2,
            justifyContent: 'center', alignItems: 'center',
          }}
        >
          <View style={{
            width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
            backgroundColor: `rgb(${brightness},${brightness},${brightness})`,
            borderWidth: 2.5, borderColor: '#374151',
            shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, elevation: 3,
          }} />
        </View>
      </View>

      {!!desc && <Text style={styles.paramDesc}>{desc}</Text>}
    </View>
  );
}

export function ThresholdRangeRow({
  minVal, maxVal, inverted, onMinChange, onMaxChange, onInvertChange,
}: {
  minVal: number; maxVal: number; inverted: boolean;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  onInvertChange: (v: boolean) => void;
}) {
  const SEGS    = 40;
  const BAR_H   = 20;
  const THUMB_D = 22;
  const ROW_H   = THUMB_D + 8;

  const barWRef     = useRef(1);
  const minRef      = useRef(minVal);
  const maxRef      = useRef(maxVal);
  const onMinRef    = useRef(onMinChange);
  const onMaxRef    = useRef(onMaxChange);
  const startMinRef = useRef(minVal);
  const startMaxRef = useRef(maxVal);

  minRef.current   = minVal;
  maxRef.current   = maxVal;
  onMinRef.current = onMinChange;
  onMaxRef.current = onMaxChange;

  const panMin = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startMinRef.current = minRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const delta = (g.dx / Math.max(1, barWRef.current)) * 255;
      const v = Math.round(Math.max(0, Math.min(maxRef.current, startMinRef.current + delta)));
      onMinRef.current(v);
    },
    onPanResponderRelease: () => {},
  })).current;

  const panMax = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startMaxRef.current = maxRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const delta = (g.dx / Math.max(1, barWRef.current)) * 255;
      const v = Math.round(Math.max(minRef.current, Math.min(255, startMaxRef.current + delta)));
      onMaxRef.current(v);
    },
    onPanResponderRelease: () => {},
  })).current;

  const minFrac = minVal / 255;
  const maxFrac = maxVal / 255;

  const thumbStyle = {
    width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
    backgroundColor: '#fff', borderWidth: 2.5, borderColor: '#374151',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, elevation: 4,
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <Text style={styles.paramLabel}>Threshold</Text>
        <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>{minVal}–{maxVal}</Text>
      </View>

      <View
        style={{ height: ROW_H, position: 'relative', marginBottom: 8 }}
        onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
      >
        <View style={{
          position: 'absolute', left: 0, right: 0,
          top: (ROW_H - BAR_H) / 2,
          height: BAR_H, borderRadius: 6, overflow: 'hidden',
          flexDirection: 'row',
        }}>
          {Array.from({ length: SEGS }, (_, i) => {
            const segFrac = i / (SEGS - 1);
            const bright  = Math.round(segFrac * 255);
            const inRange = segFrac >= minFrac && segFrac <= maxFrac;
            const active  = inverted ? !inRange : inRange;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  backgroundColor: `rgb(${bright},${bright},${bright})`,
                  opacity: active ? 1 : 0.18,
                }}
              />
            );
          })}
        </View>

        <View
          {...panMin.panHandlers}
          style={{
            position: 'absolute',
            left: `${minFrac * 100}%`,
            top: 0,
            width: THUMB_D, height: ROW_H,
            marginLeft: -THUMB_D / 2,
            justifyContent: 'center', alignItems: 'center',
          }}
        >
          <View style={thumbStyle} />
        </View>

        <View
          {...panMax.panHandlers}
          style={{
            position: 'absolute',
            left: `${maxFrac * 100}%`,
            top: 0,
            width: THUMB_D, height: ROW_H,
            marginLeft: -THUMB_D / 2,
            justifyContent: 'center', alignItems: 'center',
          }}
        >
          <View style={thumbStyle} />
        </View>
      </View>

      <ToggleRow
        label="Detect outside range"
        value={inverted}
        onChange={onInvertChange}
        desc="When on, finds shapes made of pixels OUTSIDE this brightness range — useful for detecting dark shapes by selecting the bright background instead"
      />
    </View>
  );
}

export function BlobParamsPanel({ params, onUpdate }: { params: BlobDetectionParams; onUpdate: (p: BlobDetectionParams) => void }) {
  function upd(patch: Partial<BlobDetectionParams>) { onUpdate({ ...params, ...patch }); }
  return (
    <View style={styles.blobPanel}>
      <Text style={styles.blobPanelTitle}>Blob Detection</Text>
      <ParamRow label="Min Area" value={params.minArea} min={1} max={999999} onChange={v => upd({ minArea: v })}
        desc="Minimum blob size in pixels² — raise to ignore small noise" />
      <ParamRow label="Max Area" value={params.maxArea} min={1} max={999999} onChange={v => upd({ maxArea: v })}
        desc="Maximum blob size in pixels² — lower to exclude large regions" />
      <SliderParamRow label="Min Threshold" value={params.minThreshold} min={0} max={255} onChange={v => upd({ minThreshold: Math.round(v) })}
        desc="Lower grayscale level — blob detection runs at multiple steps from min to max" />
      <SliderParamRow label="Max Threshold" value={params.maxThreshold} min={0} max={255} onChange={v => upd({ maxThreshold: Math.round(v) })}
        desc="Upper grayscale level — more steps between min and max finds more blobs but is slower" />
      <ToggleRow label="Filter by Color" value={params.filterByColor} onChange={v => upd({ filterByColor: v })}
        desc="When on, only detect blobs of a specific brightness (dark or light)" />
      {params.filterByColor && (
        <GrayscaleSliderRow label="Blob Color" value={params.blobColor} onChange={v => upd({ blobColor: v })}
          desc="0 = find dark blobs on a light background · 255 = find light blobs" />
      )}
      <ToggleRow label="Filter by Circularity" value={params.filterByCircularity} onChange={v => upd({ filterByCircularity: v })}
        desc="When on, only detect blobs that are roughly circular" />
      {params.filterByCircularity && (
        <SliderParamRow label="Min Circularity" value={params.minCircularity} min={0} max={1} onChange={v => upd({ minCircularity: v })}
          desc="1.0 = perfect circle · lower values allow less round shapes (0.7 = fairly round)" />
      )}
      <ToggleRow label="Filter by Convexity" value={params.filterByConvexity} onChange={v => upd({ filterByConvexity: v })}
        desc="When on, only detect blobs without large dents or concavities" />
      {params.filterByConvexity && (
        <SliderParamRow label="Min Convexity" value={params.minConvexity} min={0} max={1} onChange={v => upd({ minConvexity: v })}
          desc="Ratio of blob area to its convex hull — lower allows concave shapes like C or L" />
      )}
      <ToggleRow label="Filter by Inertia" value={params.filterByInertia} onChange={v => upd({ filterByInertia: v })}
        desc="When on, filter blobs by how elongated they are" />
      {params.filterByInertia && (
        <SliderParamRow label="Min Inertia Ratio" value={params.minInertiaRatio} min={0} max={1} onChange={v => upd({ minInertiaRatio: v })}
          desc="1.0 = circle · lower values allow more elongated shapes (0.1 = rod or needle)" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paramRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paramLabel: { flex: 1, fontSize: 13, color: '#374151' },
  paramDesc:  { fontSize: 11, color: '#9ca3af', marginTop: 2, lineHeight: 15 },
  paramInput: {
    width: 80, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, textAlign: 'right',
    fontSize: 13, color: '#111827',
  },
  blobPanel: {
    padding: 14, gap: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  blobPanelTitle: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 2 },
});
