import React, { useEffect, useRef, useState } from "react";
import { Modal, PanResponder, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ColorEntry } from "@/src/models/robotModels";
import { ves } from "./visionEditorStyles";
import { ColorPickModal } from "./ColorPickModal";

// ── Draggable RGB / tolerance slider ─────────────────────────────────────────

function ChannelRow({ label, value, onChange, accent }: {
  label: string; value: number; onChange: (n: number) => void; accent: string;
}) {
  const THUMB_D = 18;
  const ROW_H   = THUMB_D + 4;

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

  const frac = value / 255;

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: accent, width: 16 }}>{label}</Text>
        <View
          style={{ flex: 1, height: ROW_H, position: 'relative' }}
          onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
          {...pan.panHandlers}
        >
          <View style={{
            position: 'absolute', left: 0, right: 0,
            top: (ROW_H - 5) / 2, height: 5, borderRadius: 3,
            backgroundColor: '#e5e7eb', overflow: 'hidden',
          }}>
            <View style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 3, backgroundColor: accent }} />
          </View>
          <View style={{
            position: 'absolute', left: `${frac * 100}%`, top: 0,
            width: THUMB_D, height: ROW_H, marginLeft: -THUMB_D / 2,
            justifyContent: 'center', alignItems: 'center',
          }}>
            <View style={{
              width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
              backgroundColor: '#fff', borderWidth: 2, borderColor: accent,
              shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
            }} />
          </View>
        </View>
        <TextInput
          style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, fontSize: 13, color: '#111827', width: 52, textAlign: 'right' }}
          keyboardType="numeric"
          value={text}
          onChangeText={t => {
            setText(t);
            const n = parseInt(t, 10);
            if (!isNaN(n)) onChange(Math.round(Math.max(0, Math.min(255, n))));
          }}
          onBlur={() => {
            if (text.trim() === '' || isNaN(parseInt(text, 10))) setText(String(value));
          }}
        />
      </View>
    </View>
  );
}

// ── Color entry editor modal ──────────────────────────────────────────────────

export function ColorEditModal({ visible, entry, onSave, onClose, snapshotUri, onFetchSnapshot }: {
  visible: boolean;
  entry: ColorEntry | null;
  onSave: (updated: ColorEntry) => void;
  onClose: () => void;
  snapshotUri: string | null;
  onFetchSnapshot: () => Promise<void>;
}) {
  const [r, setR] = useState(128);
  const [g, setG] = useState(128);
  const [b, setB] = useState(128);
  const [tol, setTol]       = useState(20);
  const [tolText, setTolText] = useState('20');
  const [pickOpen, setPickOpen] = useState(false);

  const tolBarWRef  = useRef(1);
  const tolValRef   = useRef(20);
  const tolStartRef = useRef(20);
  tolValRef.current = tol;

  const tolPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { tolStartRef.current = tolValRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const v = Math.round(Math.max(0, Math.min(100,
        tolStartRef.current + (g.dx / Math.max(1, tolBarWRef.current)) * 100)));
      setTol(v); setTolText(String(v));
    },
    onPanResponderRelease: () => {},
  })).current;

  useEffect(() => {
    if (entry && visible) {
      setR(entry.r); setG(entry.g); setB(entry.b);
      setTol(entry.tolerance); setTolText(String(entry.tolerance));
    }
  }, [entry, visible]);

  function openPick() {
    setPickOpen(true);
    onFetchSnapshot();
  }

  const tolFrac = tol / 100;
  const TTHUMB  = 18;
  const TROW_H  = TTHUMB + 4;

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity style={ves.backdrop} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={[ves.sheet, { paddingBottom: 20 }]} activeOpacity={1} onPress={() => {}}>
            <Text style={ves.sheetTitle}>Color Entry</Text>

            {/* Preview swatch + pick button */}
            <View style={{ alignSelf: 'center', marginBottom: 14, gap: 8, alignItems: 'center' }}>
              <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: `rgb(${r},${g},${b})`,
                borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 }} />
              <TouchableOpacity onPress={openPick} activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: '#0891b2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Pick from Camera</Text>
              </TouchableOpacity>
            </View>

            <ChannelRow label="R" value={r} onChange={setR} accent="#dc2626" />
            <ChannelRow label="G" value={g} onChange={setG} accent="#16a34a" />
            <ChannelRow label="B" value={b} onChange={setB} accent="#2563eb" />

            {/* Tolerance slider */}
            <View style={{ marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', width: 70 }}>Tolerance</Text>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: '#111827' }}
                  keyboardType="numeric"
                  value={tolText}
                  onChangeText={t => {
                    setTolText(t);
                    const n = parseInt(t, 10);
                    if (!isNaN(n)) setTol(Math.round(Math.max(0, Math.min(100, n))));
                  }}
                  onBlur={() => {
                    if (tolText.trim() === '' || isNaN(parseInt(tolText, 10))) setTolText(String(tol));
                  }}
                />
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>/ 100</Text>
              </View>
              <View
                style={{ height: TROW_H, position: 'relative', marginBottom: 2 }}
                onLayout={e => { tolBarWRef.current = e.nativeEvent.layout.width; }}
                {...tolPan.panHandlers}
              >
                <View style={{
                  position: 'absolute', left: 0, right: 0,
                  top: (TROW_H - 5) / 2, height: 5, borderRadius: 3,
                  backgroundColor: '#e5e7eb', overflow: 'hidden',
                }}>
                  <View style={{ width: `${tolFrac * 100}%`, height: '100%', borderRadius: 3, backgroundColor: '#6b7280' }} />
                </View>
                <View style={{
                  position: 'absolute', left: `${tolFrac * 100}%`, top: 0,
                  width: TTHUMB, height: TROW_H, marginLeft: -TTHUMB / 2,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <View style={{
                    width: TTHUMB, height: TTHUMB, borderRadius: TTHUMB / 2,
                    backgroundColor: '#fff', borderWidth: 2, borderColor: '#6b7280',
                    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
                  }} />
                </View>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, marginBottom: 14 }}>
              0 = exact match · 100 = very loose
            </Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={onClose} activeOpacity={0.75}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (entry) onSave({ ...entry, r, g, b, tolerance: tol }); onClose(); }}
                activeOpacity={0.75}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: '#0891b2', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <ColorPickModal
        visible={pickOpen}
        snapshotUri={snapshotUri}
        onPick={(pr, pg, pb) => { setR(pr); setG(pg); setB(pb); }}
        onClose={() => setPickOpen(false)}
      />
    </>
  );
}
