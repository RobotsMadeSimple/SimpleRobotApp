import React, { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import { ProgramVariable, hasScalarElements, variableList } from "@/src/models/robotModels";
import { Button, SectionHeader, accents, colors, radii, shadows, spacing, type } from "@/src/components/ui/kit";
import { useIsWide } from "@/src/components/ui/responsive";
import { useExpressionEnv } from "./ExpressionEnv";
import { SymbolSections } from "./SymbolSections";
import { FunctionsList } from "./FunctionsList";
import { applyCompletion, completionsAt, insertAt, isExpressionText } from "./completions";
import { useLiveValue } from "./useLiveValue";

// ── The standardized symbol strip ─────────────────────────────────────────────
//
// One canonical set of adders for every expression field in the builder, so the
// chips never move between a speed field and a condition. Operators insert
// themselves with a trailing space (`$speed * `), grouping inserts bare so
// `round($a)` closes tight, and comparisons only appear where the field's answer
// is a true/false.

/** `[label, inserted text]`. The label is the maths spelling, the insert is what the evaluator reads. */
export type OpChip = [string, string];

const OPERATOR_CHIPS: OpChip[]   = [["+", "+"], ["−", "-"], ["×", "*"], ["÷", "/"]];
const GROUPING_CHIPS: OpChip[]   = [["(", "("], [")", ")"]];
const COMPARISON_CHIPS: OpChip[] = [
  ["==", "=="], ["!=", "!="], ["<", "<"], ["<=", "<="], [">", ">"], [">=", ">="],
  ["and", "and"], ["or", "or"],
];

/**
 * The text a picked variable contributes. A list needs an index to reach a number, and
 * what comes after the index depends on the element type — nothing for the scalar types,
 * an axis for a point. For a record there is no fixed field set, so borrow the first field
 * of the first element and leave a placeholder when the list is empty.
 *
 * Unchanged from the inline picker this modal replaces: the stored format is the same.
 */
export function variableToken(v: ProgramVariable): string {
  const list = variableList(v);
  return !list                               ? `$${v.name}`
    : hasScalarElements(list.elementType)    ? `$${v.name}[0]`
    : list.elementType === "Point"           ? `$${v.name}[0].x`
    : `$${v.name}[0].${Object.keys(list.items[0] ?? {})[0] ?? "field"}`;
}

/** A newline is never part of an expression; on a multiline input Return reads as a space. */
const NEWLINE = /\r?\n/g;

/** A plain number evaluates to itself — everything else is worth asking the controller about. */
function worthEvaluating(text: string): boolean {
  const t = text.trim();
  return !!t && !/^-?\d*\.?\d+$/.test(t);
}

export type ExpressionEditorModalProps = {
  visible: boolean;
  /** Names the field being edited, e.g. "SPEED  (mm/s)". */
  title: string;
  /** The text the draft starts from; re-read each time the modal opens. */
  initialText: string;
  placeholder?: string;
  /** One line under the title — the field's own hint, when it has one. */
  hint?: string;
  variables?: ProgramVariable[];
  /** Variables of a calling program, listed separately. */
  contextVariables?: ProgramVariable[];
  contextLabel?: string;
  /** Adds the comparison and logic chips — for a field whose answer is a true/false. */
  comparisons?: boolean;
  /** Per-field extras appended after the canonical strip, as `[label, inserted text]`. */
  extraOps?: OpChip[];
  /** Discards the draft. */
  onCancel: () => void;
  /** Commits the draft — the field's own onChange. */
  onCommit: (text: string) => void;
};

/**
 * The one editor for every expression-capable field in the builder.
 *
 * The field itself is only a display; tapping it opens this, where the input is
 * pinned at the top (above the keyboard on a phone, by construction rather than by
 * scrolling), the live value sits under it, and every way of building an expression —
 * operators, variables, properties, IO, functions — is one standardized list below.
 *
 * Controlled: edits run on a draft and only reach the field on Done.
 */
export function ExpressionEditorModal(props: ExpressionEditorModalProps) {
  const isWide = useIsWide();
  const { visible, onCancel } = props;

  return (
    <Modal visible={visible} transparent animationType={isWide ? "fade" : "slide"} onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={s.flex}
        // The sheet's own height is what gives way to the keyboard; the input is at the
        // top of it either way, so it cannot end up underneath.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={[s.backdrop, isWide ? s.backdropWide : s.backdropSheet]} onPress={onCancel}>
          {/* Mounted only while open, so the draft starts from the field's current value
              every time and nothing survives a cancel. */}
          {visible && <EditorCard {...props} isWide={isWide} />}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The card itself — one mount per opening, which is what makes the draft disposable. */
function EditorCard({
  title, initialText, placeholder, hint,
  variables, contextVariables, contextLabel,
  comparisons, extraOps,
  isWide, onCancel, onCommit,
}: ExpressionEditorModalProps & { isWide: boolean }) {
  const env    = useExpressionEnv();
  const inputRef = useRef<TextInput | null>(null);

  const [text, setText] = useState(initialText);
  /** Caret, as state because the completions depend on it. */
  const [caret, setCaret] = useState(initialText.length);
  /** Set only right after a programmatic insert, so the caret lands after the token. */
  const [forcedSel, setForcedSel] = useState<{ start: number; end: number } | null>(null);
  const [search, setSearch] = useState("");

  const live = useLiveValue(env, text, worthEvaluating(text));
  const completion = useMemo(
    () => (env ? completionsAt(text, Math.min(caret, text.length), env.symbols, env.localVariables) : null),
    [env, text, caret]);

  const isExpr  = isExpressionText(text);
  const hasErr  = live.kind === "error";

  // ── Editing ────────────────────────────────────────────────────────────────

  function write(next: string, cursor: number) {
    setText(next);
    setCaret(cursor);
    setForcedSel({ start: cursor, end: cursor });
    inputRef.current?.focus();
  }

  /** Inserts at the caret, spacing the token off a preceding word or value. */
  function insertToken(token: string) {
    const at   = Math.min(caret, text.length);
    const next = insertAt(text, at, token);
    write(next, next.length - (text.length - at));
  }

  /** Operators read with room around them: `$speed * `. */
  const insertOperator = (op: string) => insertToken(`${op} `);
  /** Grouping inserts bare so `round($a)` closes tight. */
  function insertRaw(token: string) {
    const at = Math.min(caret, text.length);
    write(text.slice(0, at) + token + text.slice(at), at + token.length);
  }

  const canonical = useMemo(() => {
    const chips: OpChip[] = [...OPERATOR_CHIPS, ...GROUPING_CHIPS, ...(comparisons ? COMPARISON_CHIPS : [])];
    const taken = new Set(chips.map(([, ins]) => ins));
    return { chips, extras: (extraOps ?? []).filter(([, ins]) => !taken.has(ins)) };
  }, [comparisons, extraOps]);

  // ── Reference sections ─────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const localNames = useMemo(
    () => new Set((variables ?? []).map(v => v.name.toLowerCase())), [variables]);
  const shownVars    = (variables ?? []).filter(v => matches(v.name));
  const shownContext = (contextVariables ?? []).filter(v => matches(v.name));
  // Globals live on the controller, not in the program — offered once, without duplicating
  // a program variable of the same name.
  const shownGlobals = (env?.symbols?.variables ?? [])
    .filter(v => v.isGlobal && !localNames.has(v.name.toLowerCase()) && matches(v.name));
  const functions    = env?.symbols?.functions ?? [];

  const hasReference = shownVars.length + shownContext.length + shownGlobals.length > 0
    || (env?.symbols?.properties.length ?? 0) + (env?.symbols?.io.length ?? 0) + functions.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  const input = (
    <View style={s.inputBlock}>
      <View style={[s.inputBox, isExpr && s.inputBoxExpr, hasErr && s.inputBoxError]}>
        <TextInput
          ref={inputRef}
          style={[s.input, isExpr && { color: accents.purple }]}
          value={text}
          // Multiline so a long expression wraps into view; newlines themselves are not
          // part of an expression, so Return reads as a space.
          onChangeText={next => { setText(next.replace(NEWLINE, " ")); setForcedSel(null); }}
          onSelectionChange={e => {
            const sel = e.nativeEvent.selection;
            setCaret(sel.end);
            if (forcedSel && sel.start === forcedSel.start && sel.end === forcedSel.end) setForcedSel(null);
          }}
          selection={forcedSel ?? undefined}
          placeholder={placeholder ?? "0"}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          multiline
          keyboardType="default"
          // Done belongs to the footer button — Return must not close the editor.
          blurOnSubmit={false}
        />
        {text.length > 0 && (
          <TouchableOpacity onPress={() => write("", 0)} hitSlop={10} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Clear">
            <X size={15} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {/* Live value / error — beside the input, never below the fold. */}
      <View style={s.statusRow}>
        {live.kind === "value" && <Text style={s.valueText} numberOfLines={1}>= {live.text}</Text>}
        {live.kind === "error" && <Text style={s.errorText} numberOfLines={2}>{live.text}</Text>}
        {live.kind === "unavailable" && (
          <Text style={s.mutedText} numberOfLines={1}>= —  (evaluated while the program runs)</Text>
        )}
        {live.kind === "none" && (
          <Text style={s.mutedText} numberOfLines={1}>
            {isExpr ? "Expression" : text.trim() ? "Number" : "Type a number, or build an expression below"}
          </Text>
        )}
      </View>

      {/* Autocomplete for the token being typed. */}
      {completion && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
          style={s.suggestions} contentContainerStyle={s.suggestionsContent}>
          {completion.items.map(item => (
            <TouchableOpacity
              key={`${item.kind}:${item.label}`}
              style={s.suggestion}
              activeOpacity={0.7}
              onPress={() => {
                const at = Math.min(caret, text.length);
                write(applyCompletion(text, completion.start, at, item.insert),
                  completion.start + item.insert.length);
              }}
            >
              <Text style={[s.suggestionText, { color: KIND_TINT[item.kind] }]}>
                {item.label}{item.computed && <Text style={s.computedTag}>  ƒ</Text>}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const body = (
    <ScrollView style={s.body} contentContainerStyle={s.bodyContent}
      keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
      {/* (b) The standardized symbol strip — identical on every field. */}
      <SectionHeader title="Symbols" />
      <View style={s.chipRow}>
        {canonical.chips.map(([label, ins]) => (
          <OpButton key={ins} label={label} wide={label.length > 1}
            onPress={() => (ins === "(" || ins === ")" ? insertRaw(ins) : insertOperator(ins))} />
        ))}
        {canonical.extras.map(([label, ins]) => (
          <OpButton key={`x:${ins}`} label={label} wide={label.length > 1} onPress={() => insertOperator(ins)} />
        ))}
      </View>

      {hasReference && (
        <View style={s.searchBox}>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search variables and functions…"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
              <X size={13} color={colors.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* (c) Variables — one tap inserts `$name`. */}
      {shownVars.length > 0 && (
        <>
          <SectionHeader title="Variables" />
          <View style={s.chipRow}>
            {shownVars.map(v => (
              <VarButton key={v.id} name={v.name} onPress={() => insertToken(variableToken(v))} />
            ))}
          </View>
        </>
      )}
      {shownContext.length > 0 && (
        <>
          <SectionHeader title={contextLabel ?? "Caller variables"} />
          <View style={s.chipRow}>
            {shownContext.map(v => (
              <VarButton key={`ctx:${v.id}`} name={v.name} onPress={() => insertToken(variableToken(v))} />
            ))}
          </View>
        </>
      )}
      {shownGlobals.length > 0 && (
        <>
          <SectionHeader title="Globals" />
          <View style={s.chipRow}>
            {shownGlobals.map(v => (
              <VarButton key={`g:${v.name}`} name={v.name} onPress={() => insertToken(`$${v.name}`)} />
            ))}
          </View>
        </>
      )}

      {/* Properties and IO, the same rows the variable picker shows. */}
      <SymbolSections search={search} onPick={name => insertToken(`$${name}`)} />

      {/* (d) Functions — inline, so the reference and the input stay on one screen. */}
      {functions.length > 0 && (
        <>
          <SectionHeader title="Functions" />
          <FunctionsList functions={functions} search={search} onInsert={name => insertToken(`${name}(`)} />
        </>
      )}
    </ScrollView>
  );

  const header = (
    <View style={s.header}>
      <View style={s.headerText}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {!!hint && <Text style={s.hint} numberOfLines={2}>{hint}</Text>}
      </View>
      <TouchableOpacity onPress={onCancel} hitSlop={12} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel="Close">
        <X size={18} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );

  const footer = (
    <View style={s.footer}>
      <Button label="Cancel" variant="secondary" style={s.footerBtn} onPress={onCancel} />
      <Button label="Done" variant="primary" style={s.footerBtn} onPress={() => onCommit(text)} />
    </View>
  );

  // A Pressable so a tap on the card does not reach the backdrop's dismiss.
  return (
    <Pressable style={[s.card, isWide ? s.cardWide : s.cardSheet]} onPress={() => {}}>
      {header}
      {input}
      {body}
      {footer}
    </Pressable>
  );
}

// ── The field that opens it ───────────────────────────────────────────────────

/**
 * A read-only display of an expression (or plain value) that opens the editor on tap.
 *
 * This is the shape every expression-capable field takes now: nothing is typed inline,
 * so the keyboard can never cover what is being edited and the adders are the same
 * everywhere. Expressions keep their purple, with an `fx` badge as the affordance.
 */
export function ExpressionField({
  value, onChange, title, placeholder, hint,
  variables, contextVariables, contextLabel,
  comparisons, extraOps,
  style, accent = accents.purple, clearable = true,
}: {
  value: string;
  /** Called with the committed text on Done, and with "" when the field is cleared. */
  onChange: (next: string) => void;
  title: string;
  placeholder?: string;
  hint?: string;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  contextLabel?: string;
  comparisons?: boolean;
  extraOps?: OpChip[];
  /** The field box style the call site already used (`ms.input`). */
  style?: any;
  /** Tint for expression text — lets a screen keep its own accent. */
  accent?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isExpr = isExpressionText(value);
  const shown  = value.trim();

  return (
    <View>
      <TouchableOpacity
        style={[style, s.fieldBox]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${shown || "empty"}. Opens the expression editor.`}
      >
        <Text
          style={[s.fieldText, !shown && { color: colors.textFaint }, shown && isExpr && { color: accent }]}
          numberOfLines={1}
        >
          {shown || placeholder || "0"}
        </Text>
        {/* The affordance: faint on a plain value (this field can take an expression),
            in the accent once it holds one. */}
        <Text style={[s.fx, { color: isExpr && shown ? accent : colors.textFaint }]}>fx</Text>
        {clearable && shown.length > 0 && (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={8} activeOpacity={0.7} style={s.fieldClear}
            accessibilityRole="button" accessibilityLabel={`Clear ${title}`}>
            <X size={13} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <ExpressionEditorModal
        visible={open}
        title={title}
        hint={hint}
        initialText={value}
        placeholder={placeholder}
        variables={variables}
        contextVariables={contextVariables}
        contextLabel={contextLabel}
        comparisons={comparisons}
        extraOps={extraOps}
        onCancel={() => setOpen(false)}
        onCommit={next => { setOpen(false); onChange(next); }}
      />
    </View>
  );
}

function OpButton({ label, wide, onPress }: { label: string; wide?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.opChip, wide && s.opChipWide]} onPress={onPress} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel={`Insert ${label}`}>
      <Text style={s.opChipText}>{label}</Text>
    </TouchableOpacity>
  );
}

function VarButton({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.varChip} onPress={onPress} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel={`Insert $${name}`}>
      <Text style={s.varChipText}>${name}</Text>
    </TouchableOpacity>
  );
}

const KIND_TINT: Record<"variable" | "property" | "io" | "function", string> = {
  variable: accents.purple,
  property: accents.cyan,
  io:       colors.success,
  function: colors.accent,
};

const s = StyleSheet.create({
  flex:       { flex: 1 },
  backdrop:   { flex: 1, backgroundColor: colors.overlay },
  backdropWide:  { justifyContent: "center", alignItems: "center", padding: spacing.xl },
  backdropSheet: { justifyContent: "flex-end" },

  card: { backgroundColor: colors.surface, ...shadows.raised, overflow: "hidden" },
  cardWide:  { width: "100%", maxWidth: 560, maxHeight: "88%", borderRadius: radii.xl },
  // Full-height sheet: the input sits at the top of it, structurally above the keyboard.
  cardSheet: { width: "100%", height: "94%", borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },

  header: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  hint:  { ...type.caption, marginTop: 2, lineHeight: 15 },

  // (a) Pinned input row
  inputBlock: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  inputBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md,
  },
  inputBoxExpr:  { borderColor: accents.purpleBorder, backgroundColor: accents.purpleSoft },
  inputBoxError: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft },
  input: {
    flex: 1, fontSize: 16, color: colors.text, paddingVertical: 11, minHeight: 44,
    // A long expression wraps instead of scrolling out of sight.
    maxHeight: 96,
  },

  statusRow: { minHeight: 18, marginTop: 5 },
  valueText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  errorText: { fontSize: 12, color: colors.danger },
  mutedText: { fontSize: 12, color: colors.textFaint },

  suggestions:        { marginTop: 6, flexGrow: 0 },
  suggestionsContent: { gap: 5, paddingRight: spacing.lg },
  suggestion: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4,
  },
  suggestionText: { fontSize: 12, fontWeight: "600" },
  computedTag:    { fontStyle: "italic", fontWeight: "700", color: colors.textMuted },

  // (b)–(d) Scrolling sections. flexBasis auto (not `flex: 1`) so the wide card can size
  // itself to its content up to its maxHeight, while the full-height sheet still fills.
  body:        { flexGrow: 1, flexShrink: 1, flexBasis: "auto" },
  bodyContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 6 },
  opChip: {
    minWidth: 46, alignItems: "center",
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  opChipWide:  { minWidth: 56 },
  opChipText:  { fontSize: 16, fontWeight: "600", color: colors.textSecondary },
  varChip: {
    backgroundColor: accents.purpleSoft, borderWidth: 1, borderColor: accents.purpleBorder,
    borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  varChipText: { fontSize: 14, fontWeight: "700", color: accents.purple },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    paddingHorizontal: 10, backgroundColor: colors.surfaceMuted,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 9 },

  // (e) Footer
  footer: {
    flexDirection: "row", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerBtn: { flex: 1 },

  // The field that opens the editor
  fieldBox:   { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fieldText:  { flex: 1, fontSize: 14, color: colors.text },
  fx:         { fontSize: 12, fontWeight: "700", fontStyle: "italic" },
  fieldClear: { paddingLeft: 2 },
});
