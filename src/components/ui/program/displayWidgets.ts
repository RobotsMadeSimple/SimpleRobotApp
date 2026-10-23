import type { DisplayWidget, DisplayWidgetType } from "@/src/models/robotModels";

/**
 * Widget catalog for the visual display-page builder: each type's palette label, its default
 * grid size and config, and the fields the config panel edits. The compiler (displayCompiler)
 * turns a configured widget into positioned bridge HTML; the editor (GridCanvas + config panel)
 * reads these defs to place and edit widgets. Keep the three in sync when adding a widget.
 */

export type ConfigFieldKind =
  | "text"
  | "number"
  | "select"
  | "expression" // an expression (opens the program's expression editor), evaluated live
  | "variable"   // a program variable name (chips of the program's variables + free text)
  | "plugin";    // pick an installed plugin that ships a UI (stores id/entry/title)

export type ConfigField = {
  key: string;
  label: string;
  kind: ConfigFieldKind;
  options?: { label: string; value: string }[];
  placeholder?: string;
  /** Only show this field when another field equals one of these values. */
  showWhen?: { key: string; equals: string[] };
};

export type WidgetDef = {
  type: DisplayWidgetType;
  label: string;
  /** One-line palette description. */
  hint: string;
  defaultSize: { w: number; h: number };
  defaultConfig: Record<string, any>;
  fields: ConfigField[];
};

export const DISPLAY_WIDGET_DEFS: Record<DisplayWidgetType, WidgetDef> = {
  value: {
    type: "value",
    label: "Value",
    hint: "A variable's live number or true/false.",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { variable: "", label: "" },
    fields: [
      { key: "variable", label: "Value (expression)", kind: "expression", placeholder: "$force  or  $x * 2" },
      { key: "label", label: "Label (optional)", kind: "text" },
    ],
  },
  gauge: {
    type: "gauge",
    label: "Gauge",
    hint: "A variable on a dial, with a min and max.",
    defaultSize: { w: 4, h: 4 },
    defaultConfig: { variable: "", label: "", min: 0, max: 100, unit: "" },
    fields: [
      { key: "variable", label: "Value (expression)", kind: "expression", placeholder: "$force  or  $x * 2" },
      { key: "label", label: "Label (optional)", kind: "text" },
      { key: "min", label: "Min", kind: "number" },
      { key: "max", label: "Max", kind: "number" },
      { key: "unit", label: "Unit (optional)", kind: "text", placeholder: "g, mm, °…" },
    ],
  },
  boolean: {
    type: "boolean",
    label: "Lamp",
    hint: "A true/false indicator light.",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { variable: "", label: "" },
    fields: [
      { key: "variable", label: "Value (expression)", kind: "expression", placeholder: "$done  or  $x > 5" },
      { key: "label", label: "Label (optional)", kind: "text" },
    ],
  },
  graph: {
    type: "graph",
    label: "Graph",
    hint: "A live line chart of a load cell or a variable.",
    defaultSize: { w: 6, h: 4 },
    defaultConfig: { source: "loadcell", deviceId: "", pin: 0, variable: "", label: "", color: "#2563eb" },
    fields: [
      { key: "label", label: "Label (optional)", kind: "text" },
      {
        key: "source",
        label: "Source",
        kind: "select",
        options: [
          { label: "Load cell (live stream)", value: "loadcell" },
          { label: "Variable (sampled over time)", value: "variable" },
        ],
      },
      { key: "deviceId", label: "Nano id", kind: "text", showWhen: { key: "source", equals: ["loadcell"] } },
      { key: "pin", label: "Load-cell DT pin", kind: "number", showWhen: { key: "source", equals: ["loadcell"] } },
      { key: "variable", label: "Value (expression)", kind: "expression", placeholder: "$force", showWhen: { key: "source", equals: ["variable"] } },
      { key: "color", label: "Line colour", kind: "text", placeholder: "#2563eb" },
    ],
  },
  image: {
    type: "image",
    label: "Image",
    hint: "A display-image variable (camera / capture).",
    defaultSize: { w: 4, h: 4 },
    defaultConfig: { variable: "", label: "" },
    fields: [
      { key: "variable", label: "Image variable", kind: "variable", placeholder: "image variable name" },
      { key: "label", label: "Label (optional)", kind: "text" },
    ],
  },
  button: {
    type: "button",
    label: "Button",
    hint: "Run or stop the program (optionally seeding inputs).",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { label: "Run", action: "run", inputs: "" },
    fields: [
      { key: "label", label: "Label", kind: "text" },
      {
        key: "action",
        label: "Action",
        kind: "select",
        options: [
          { label: "Run program", value: "run" },
          { label: "Stop program", value: "stop" },
        ],
      },
      {
        key: "inputs",
        label: "Seed inputs (name=value, …)",
        kind: "text",
        placeholder: "speed=120, count=3",
        showWhen: { key: "action", equals: ["run"] },
      },
    ],
  },
  text: {
    type: "text",
    label: "Text",
    hint: "A static heading or caption.",
    defaultSize: { w: 6, h: 1 },
    defaultConfig: { text: "Heading", size: "large" },
    fields: [
      { key: "text", label: "Text", kind: "text" },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { label: "Small", value: "small" },
          { label: "Medium", value: "medium" },
          { label: "Large", value: "large" },
        ],
      },
    ],
  },
  plugin: {
    type: "plugin",
    label: "Plugin",
    hint: "Embed a live plugin UI (e.g. the checkers board).",
    defaultSize: { w: 6, h: 6 },
    defaultConfig: { pluginId: "", entry: "", title: "", pluginName: "" },
    fields: [{ key: "pluginId", label: "Plugin", kind: "plugin" }],
  },
};

/** The palette order shown in the editor. */
export const WIDGET_PALETTE: DisplayWidgetType[] = [
  "value",
  "gauge",
  "boolean",
  "graph",
  "image",
  "button",
  "text",
  "plugin",
];

let seq = 0;
/** A fresh widget of a type at a grid position, with the type's default size and config. */
export function makeWidget(type: DisplayWidgetType, x: number, y: number): DisplayWidget {
  const def = DISPLAY_WIDGET_DEFS[type];
  return {
    id: `w${Date.now().toString(36)}${(seq++).toString(36)}`,
    type,
    x,
    y,
    w: def.defaultSize.w,
    h: def.defaultSize.h,
    config: { ...def.defaultConfig },
  };
}
