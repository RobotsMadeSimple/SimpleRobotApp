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
  | "camera"     // pick a connected camera (stores its id) for the live-stream widget
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
    defaultConfig: { variable: "", label: "", unit: "" },
    fields: [
      { key: "variable", label: "Value (expression)", kind: "expression", placeholder: "$force  or  $x * 2" },
      { key: "label", label: "Label (optional)", kind: "text" },
      { key: "unit", label: "Unit (optional)", kind: "text", placeholder: "g, mm, °…" },
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
    defaultConfig: { source: "loadcell", deviceId: "", pin: 0, unit: "g", variable: "", label: "", min: "", max: "", color: "#2563eb" },
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
      {
        key: "unit",
        label: "Unit",
        kind: "select",
        options: [
          { label: "Grams (g)", value: "g" },
          { label: "Kilograms (kg)", value: "kg" },
          { label: "Ounces (oz)", value: "oz" },
          { label: "Pounds (lb)", value: "lb" },
          { label: "Newtons (N)", value: "N" },
        ],
        showWhen: { key: "source", equals: ["loadcell"] },
      },
      { key: "variable", label: "Value (expression)", kind: "expression", placeholder: "$force", showWhen: { key: "source", equals: ["variable"] } },
      { key: "min", label: "Axis min (blank = auto)", kind: "text", placeholder: "0" },
      { key: "max", label: "Axis max (blank = auto)", kind: "text", placeholder: "5" },
      { key: "color", label: "Line colour", kind: "text", placeholder: "#2563eb" },
    ],
  },
  image: {
    type: "image",
    label: "Image",
    hint: "A display-image variable (camera / capture).",
    defaultSize: { w: 4, h: 4 },
    defaultConfig: { variable: "", label: "", fit: "cover" },
    fields: [
      { key: "variable", label: "Image variable", kind: "variable", placeholder: "image variable name" },
      { key: "label", label: "Label (optional)", kind: "text" },
      {
        key: "fit",
        label: "Fit",
        kind: "select",
        options: [
          { label: "Fill the card (crops edges)", value: "cover" },
          { label: "Whole image", value: "contain" },
        ],
      },
    ],
  },
  camera: {
    type: "camera",
    label: "Camera",
    hint: "A live camera feed (smooth), like the I/O page.",
    defaultSize: { w: 6, h: 6 },
    defaultConfig: { cameraId: "", label: "", fit: "cover" },
    fields: [
      { key: "cameraId", label: "Camera", kind: "camera" },
      { key: "label", label: "Label (optional)", kind: "text" },
      {
        key: "fit",
        label: "Fit",
        kind: "select",
        options: [
          { label: "Fill the card (crops edges)", value: "cover" },
          { label: "Whole image", value: "contain" },
        ],
      },
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
    hint: "Embed a live plugin's UI panel, with optional settings.",
    defaultSize: { w: 6, h: 6 },
    // params: the plugin's declared UI settings; paramsText: any others as "name=value, …".
    defaultConfig: { pluginId: "", entry: "", title: "", pluginName: "", params: {}, paramsText: "" },
    fields: [{ key: "pluginId", label: "Plugin", kind: "plugin" }],
  },
  status: {
    type: "status",
    label: "Status",
    hint: "The program's run state and current step.",
    defaultSize: { w: 4, h: 2 },
    defaultConfig: {},
    fields: [],
  },
  cell3d: {
    type: "cell3d",
    label: "3D view",
    hint: "The robot and its cell in 3D, moving live.",
    defaultSize: { w: 6, h: 8 },
    defaultConfig: { label: "", view: "iso", trail: "on", points: "off", controls: "views" },
    fields: [
      { key: "label", label: "Label (optional)", kind: "text" },
      {
        key: "view",
        label: "Default view",
        kind: "select",
        options: [
          { label: "Iso", value: "iso" },
          { label: "Front", value: "front" },
          { label: "Side", value: "side" },
          { label: "Top", value: "top" },
          { label: "Follow the tool", value: "follow" },
        ],
      },
      { key: "trail", label: "Tool path trail", kind: "select", options: [{ label: "Show", value: "on" }, { label: "Hide", value: "off" }] },
      { key: "points", label: "Taught points", kind: "select", options: [{ label: "Show", value: "on" }, { label: "Hide", value: "off" }] },
      {
        key: "controls",
        label: "On-screen controls",
        kind: "select",
        options: [
          { label: "View buttons", value: "views" },
          { label: "View buttons + toggles", value: "full" },
          { label: "None", value: "none" },
        ],
      },
    ],
  },
};

/** The palette order shown in the editor. */
export const WIDGET_PALETTE: DisplayWidgetType[] = [
  "value",
  "gauge",
  "boolean",
  "graph",
  "image",
  "camera",
  "button",
  "text",
  "status",
  "cell3d",
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
