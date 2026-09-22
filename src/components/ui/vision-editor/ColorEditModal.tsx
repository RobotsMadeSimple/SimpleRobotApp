import React, { useEffect, useRef, useState } from "react";
import { Modal, PanResponder, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ColorEntry } from "@/src/models/robotModels";
import { colors, spacing, radii, shadows, accents } from "@/src/components/ui/kit";
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
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: accent, width: 16 }}>{label}</Text>
        <View
          style={{ flex: 1, height: ROW_H, position: 'relative' }}
          onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
          {...pan.panHandlers}
        >
          <View style={{
            position: 'absolute', left: 0, right: 0,
            top: (ROW_H - 5) / 2, height: 5, borderRadius: 3,
            backgroundColor: colors.border, overflow: 'hidden',
          }}>
            <View style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 3, backgroundColor: accent }} />
          </View>
          <View style={{
            position: 'absolute', left: `${frac * 100}%`, top: 0,
            width: THUMB_D, height: ROW_H, marginLeft: -THUMB_D / 2,
            justifyContent: 'center', alignItems: 'center',
          }}>
            <View style={[{
              width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
              backgroundColor: colors.surface, borderWidth: 2, borderColor: accent,
            }, shadows.soft]} />
          </View>
        </View>
        <TextInput
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, fontSize: 13, color: colors.text, width: 52, textAlign: 'right' }}
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
          <TouchableOpacity style={[ves.sheet, { paddingBottom: spacing.xl }]} activeOpacity={1} onPress={() => {}}>
            <Text style={ves.sheetTitle}>Color Entry</Text>

            {/* Preview swatch + pick button */}
            <View style={{ alignSelf: 'center', marginBottom: spacing.lg, gap: spacing.sm, alignItems: 'center' }}>
              <View style={[{ width: 64, height: 64, borderRadius: radii.lg + 2, backgroundColor: `rgb(${r},${g},${b})`,
                borderWidth: 1, borderColor: colors.border }, shadows.soft]} />
              <TouchableOpacity onPress={openPick} activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                  backgroundColor: accents.cyan, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ color: colors.onAccent, fontSize: 12, fontWeight: '700' }}>Pick from Camera</Text>
              </TouchableOpacity>
            </View>

            <ChannelRow label="R" value={r} onChange={setR} accent={colors.danger} />
            <ChannelRow label="G" value={g} onChange={setG} accent={colors.success} />
            <ChannelRow label="B" value={b} onChange={setB} accent={colors.accent} />

            {/* Tolerance slider */}
            <View style={{ marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, width: 70 }}>Tolerance</Text>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontSize: 13, color: colors.text }}
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
                <Text style={{ fontSize: 11, color: colors.textFaint }}>/ 100</Text>
              </View>
              <View
                style={{ height: TROW_H, position: 'relative', marginBottom: 2 }}
                onLayout={e => { tolBarWRef.current = e.nativeEvent.layout.width; }}
                {...tolPan.panHandlers}
              >
                <View style={{
                  position: 'absolute', left: 0, right: 0,
                  top: (TROW_H - 5) / 2, height: 5, borderRadius: 3,
                  backgroundColor: colors.border, overflow: 'hidden',
                }}>
                  <View style={{ width: `${tolFrac * 100}%`, height: '100%', borderRadius: 3, backgroundColor: colors.textMuted }} />
                </View>
                <View style={{
                  position: 'absolute', left: `${tolFrac * 100}%`, top: 0,
                  width: TTHUMB, height: TROW_H, marginLeft: -TTHUMB / 2,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <View style={[{
                    width: TTHUMB, height: TTHUMB, borderRadius: TTHUMB / 2,
                    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.textMuted,
                  }, shadows.soft]} />
                </View>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: colors.textFaint, marginTop: 2, marginBottom: spacing.lg }}>
              0 = exact match · 100 = very loose
            </Text>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity onPress={onClose} activeOpacity={0.75}
                style={{ flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: colors.background, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (entry) onSave({ ...entry, r, g, b, tolerance: tol }); onClose(); }}
                activeOpacity={0.75}
                style={{ flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: accents.cyan, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.onAccent }}>Save</Text>
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
