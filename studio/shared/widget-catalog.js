import types from "./widget-types.json" with { type: "json" };

// These are the properties read by the Flutter renderer, rather than generic
// CSS controls. Structural slots remain widget trees; data records remain data.
export const widgetType = (node) => node?.type || node?.widgetType;
export const widgetNames = [...types, "component"];
export const isWidget = (node) =>
  !!node &&
  widgetNames.includes(widgetType(node)) &&
  !(widgetType(node) === "bottomSheet" && Object.hasOwn(node, "content"));
export function properties(node) {
  return {
    ...node?.style,
    ...node,
    ...node?.props,
    type: widgetType(node),
    id: node?.id,
    child: node?.child,
    children: node?.children,
  };
}
export function patchProperties(node, changes) {
  const next = structuredClone(node);
  for (const [key, value] of Object.entries(changes)) {
    const nested =
      !["child", "children", "id", "type", "widgetType"].includes(key) &&
      Object.hasOwn(next.props || {}, key);
    delete next[key];
    if (next.props) delete next.props[key];
    if (next.style) delete next.style[key];
    if (value !== undefined) {
      if (nested) next.props[key] = value;
      else next[key] = value;
    }
  }
  return next;
}

const label = (key) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const spec = {};
function fields(keys, kind, options = {}) {
  for (const key of keys.split(" "))
    spec[key] = { key, label: label(key), kind, ...options };
}
fields(
  "returnUrl cancelUrl text label title subtitle hint helperText message semanticLabel name bind src package fontFamily pattern patternMessage requiredMessage source stream endsAt positionBind captions tooltip actionLabel rowKey icon iconColor",
  "text",
);
fields(
  "fontSize letterSpacing lineHeight width height size radius elevation borderWidth spacing runSpacing crossAxisSpacing mainAxisSpacing mainAxisExtent childAspectRatio aspectRatio minWidth minHeight maxWidth maxHeight widthFactor heightFactor top left right bottom itemExtent expandedHeight minChildSize maxChildSize initialChildSize min max scale angle value opacity strokeWidth latitude longitude zoom maxScale appBarHeight bottomHeight iconSize",
  "number",
);
fields(
  "length initialIndex selectedIndex flex crossAxisCount fontWeight duration maxLines minLines maxLength minLength divisions debounce pageSize rowsPerPage",
  "number",
  { integer: true },
);
fields(
  "enabled required readOnly obscureText filled email autovalidate italic literal visible maintainState ignoring absorbing button liveRegion shrinkWrap primary scrollable clip top bottom left right extendBody resizeToAvoidBottomInset centerTitle automaticallyImplyLeading extended isScrollable initiallyExpanded selected border pinned floating hasScrollBody expand autoplay loop sortable selectable",
  "boolean",
);
// SafeArea's side flags share names with Positioned's offsets; overridden there.
fields(
  "color backgroundColor borderColor shadowColor indicatorColor selectedColor seedColor iconColor primaryColor secondaryColor surfaceColor onSurfaceColor onPrimaryColor onSecondaryColor errorColor onErrorColor",
  "color",
);
fields("padding margin", "insets");
fields("borderRadius", "number", { min: 0 });
fields("initialValue query initialData nextCursor theme data", "json");
fields(
  "action onTap onPressed onChanged onSubmitted onLongPress onRefresh onComplete onSuccess onSelectionChanged onReturn onCancel onError",
  "action",
);
fields(
  "child body appBar leading trailing drawer endDrawer bottomNavigationBar floatingActionButton bottomSheet bottom content avatar then else small medium large template loading empty error flexibleSpace",
  "widget",
);
fields("children actions headers images", "widgets");
function choice(key, options) {
  spec[key] = { key, label: label(key), kind: "select", options };
}
choice("alignment", [
  "topLeft",
  "topCenter",
  "topRight",
  "centerLeft",
  "center",
  "centerRight",
  "bottomLeft",
  "bottomCenter",
  "bottomRight",
]);
choice("mainAxisAlignment", [
  "start",
  "end",
  "center",
  "spaceBetween",
  "spaceAround",
  "spaceEvenly",
]);
choice("crossAxisAlignment", ["start", "end", "center", "stretch"]);
choice("mainAxisSize", ["min", "max"]);
choice("direction", ["vertical", "horizontal"]);
choice("fit", [
  "contain",
  "cover",
  "fill",
  "fitWidth",
  "fitHeight",
  "none",
  "scaleDown",
]);
choice("textAlign", ["start", "left", "center", "right", "end", "justify"]);
choice("decoration", ["none", "underline", "lineThrough"]);
choice("keyboardType", [
  "text",
  "email",
  "number",
  "phone",
  "url",
  "multiline",
]);
choice("kind", ["bar", "line"]);
choice("layout", ["list", "grid"]);
fields("firstDate lastDate", "text");
fields("largeBreakpoint mediumBreakpoint", "number", { min: 0 });

const lists = {
  destinations: {
    label: "Navigation items",
    item: { label: "New item", icon: "home" },
    fields: ["label", "icon", "selectedIcon", "action"],
    min: 2,
  },
  options: {
    label: "Options",
    item: { label: "New option", value: "option" },
    fields: ["label", "value"],
  },
  steps: {
    label: "Steps",
    item: {
      title: "New step",
      content: { type: "text", text: "Step content" },
    },
    fields: ["title", "content"],
    min: 1,
  },
  columns: {
    label: "Columns",
    item: { key: "column", label: "New column" },
    fields: ["key", "label"],
  },
  rows: { label: "Rows", item: { id: "row" } },
  items: {
    label: "Items",
    item: { title: "New item", subtitle: "Details", complete: false },
    fields: ["title", "subtitle", "complete"],
  },
  markers: {
    label: "Markers",
    item: { latitude: 12.97, longitude: 77.59, label: "Location" },
    fields: ["label", "latitude", "longitude"],
  },
};
for (const [key, options] of Object.entries(lists))
  spec[key] = { key, label: options.label, kind: "collection", ...options };
fields("values initialItems", "array");
export const fieldTypes = [
  "input",
  "textArea",
  "searchField",
  "autocomplete",
  "dropdown",
  "multiSelect",
  "checkbox",
  "switch",
  "radio",
  "slider",
  "rangeSlider",
  "rating",
  "datePicker",
  "timePicker",
  "dateRangePicker",
  "filePicker",
  "cameraInput",
];
const textStyle =
  "fontSize fontWeight color fontFamily italic letterSpacing lineHeight decoration textAlign";
const decoration =
  "backgroundColor borderRadius border borderColor borderWidth elevation shadowColor";
const flex = "mainAxisAlignment crossAxisAlignment mainAxisSize spacing";
const field =
  "name label bind initialValue enabled required requiredMessage onChanged";
const input = `${field} hint helperText filled icon iconColor backgroundColor borderColor borderWidth borderRadius fontSize padding readOnly obscureText keyboardType textInputAction onSubmitted minLines maxLines minLength maxLength email pattern patternMessage`;
choice("destinationStyle", ["standard", "pill"]);
choice("textInputAction", ["done", "next", "search", "send"]);
const entries = {};
function define(names, keys = "", defaults = {}, options = {}) {
  for (const name of names.split(" "))
    entries[name] = {
      name,
      fields: keys
        .split(" ")
        .filter(Boolean)
        .map((key) => ({
          ...(spec[key] || { key, label: label(key), kind: "json" }),
        })),
      defaults: structuredClone(defaults),
      ...options,
    };
}
const text = (value = "Your text") => ({ type: "text", text: value });
const child = { child: text("Content") };
const children = { children: [] };
const nav = [
  { label: "Home", icon: "home" },
  { label: "Profile", icon: "person" },
];
define(
  "scaffold",
  "backgroundColor resizeToAvoidBottomInset extendBody appBarHeight body appBar drawer endDrawer bottomNavigationBar floatingActionButton bottomSheet",
  { body: { type: "column", children: [] } },
  { slot: "body", placement: "bounded" },
);
define(
  "appBar",
  "title centerTitle automaticallyImplyLeading backgroundColor color elevation bottomHeight leading actions bottom",
  { title: "Screen title" },
);
define(
  "drawer",
  "width backgroundColor padding child children",
  { children: [text("Menu")] },
  { slot: "children" },
);
define(
  "navigationBar bottomNavigationBar navigationRail",
  "destinations selectedIndex bind backgroundColor indicatorColor destinationStyle selectedColor color iconSize fontSize height extended onChanged",
  { destinations: nav, selectedIndex: 0, bind: "navigation" },
);
define(
  "defaultTabController",
  "length initialIndex child",
  {
    length: 2,
    child: {
      type: "column",
      mainAxisSize: "min",
      children: [
        {
          type: "tabBar",
          children: [
            { type: "tab", text: "First" },
            { type: "tab", text: "Second" },
          ],
        },
        {
          type: "sizedBox",
          height: 160,
          child: {
            type: "tabBarView",
            children: [text("First page"), text("Second page")],
          },
        },
      ],
    },
  },
  { slot: "child" },
);
define(
  "tabBar",
  "isScrollable bind onChanged children",
  {
    children: [
      { type: "tab", text: "First" },
      { type: "tab", text: "Second" },
    ],
  },
  { slot: "children", placement: "tabs" },
);
define(
  "tabBarView",
  "children",
  { children: [text("First page"), text("Second page")] },
  { slot: "children", placement: "tabView" },
);
define("tab", "text icon child", { text: "Tab" }, { slot: "child" });
define("customWidget", "name data", { name: "greeting", data: {} });
define("safeArea", "top bottom left right child", child, { slot: "child" });
for (const f of entries.safeArea.fields)
  if (["top", "bottom", "left", "right"].includes(f.key)) f.kind = "boolean";
define(
  "container",
  `width height padding margin alignment ${decoration} child`,
  { padding: 20, borderRadius: 16, backgroundColor: "#F0EDF9", ...child },
  { slot: "child" },
);
define(
  "animatedContainer",
  `duration width height padding margin ${decoration} child`,
  { duration: 250, padding: 16, ...child },
  { slot: "child" },
);
define(
  "padding",
  "padding child",
  { padding: 16, ...child },
  { slot: "child" },
);
define("center", "child", child, { slot: "child" });
define("align", "alignment child", child, { slot: "child" });
define("sizedBox", "width height child", { height: 24 }, { slot: "child" });
define("sizedBoxFill", "child", child, { slot: "child", placement: "bounded" });
define(
  "row column",
  `${flex} children`,
  { spacing: 12, mainAxisSize: "min", children: [] },
  { slot: "children" },
);
define(
  "stack",
  "alignment clip children",
  { children: [] },
  { slot: "children" },
);
define(
  "positioned",
  "top left right bottom width height child",
  { top: 0, left: 0, ...child },
  { slot: "child", placement: "positioned" },
);
for (const f of entries.positioned.fields)
  if (["top", "left", "right", "bottom"].includes(f.key)) f.kind = "number";
define(
  "expanded flexible",
  "flex fit child",
  { flex: 1, ...child },
  { slot: "child", placement: "flex" },
);
entries.navigationRail.placement = "bounded";
entries.flexible.fields.find((f) => f.key === "fit").options = [
  "loose",
  "tight",
];
entries.expanded.fields = entries.expanded.fields.filter(
  (f) => f.key !== "fit",
);
define("spacer", "flex", { flex: 1 }, { placement: "flex" });
define(
  "wrap",
  "direction spacing runSpacing children",
  { spacing: 8, runSpacing: 8, children: [text("First"), text("Second")] },
  { slot: "children" },
);
define(
  "listView",
  "direction padding shrinkWrap primary scrollable itemExtent children",
  { shrinkWrap: true, primary: false, padding: 16, ...children },
  { slot: "children" },
);
define(
  "gridView",
  "padding shrinkWrap primary scrollable crossAxisCount crossAxisSpacing mainAxisSpacing mainAxisExtent childAspectRatio children",
  {
    shrinkWrap: true,
    primary: false,
    crossAxisCount: 2,
    children: [text("First"), text("Second")],
  },
  { slot: "children" },
);
define("singleChildScrollView", "direction padding child", child, {
  slot: "child",
});
define(
  "pageView",
  "direction bind onChanged children",
  { children: [text("First page"), text("Second page")] },
  { slot: "children", placement: "bounded" },
);
define(
  "aspectRatio",
  "aspectRatio child",
  { aspectRatio: 2, ...child },
  { slot: "child" },
);
define("constrainedBox", "minWidth minHeight maxWidth maxHeight child", child, {
  slot: "child",
});
define(
  "fractionallySizedBox",
  "widthFactor heightFactor alignment child",
  { widthFactor: 0.8, ...child },
  { slot: "child" },
);
define(
  "clipRRect",
  "borderRadius child",
  { borderRadius: 16, ...child },
  { slot: "child" },
);
define("clipOval", "child", child, { slot: "child" });
define("fittedBox", "fit alignment child", child, { slot: "child" });
define("text selectableText", `text literal maxLines ${textStyle}`, {
  text: "Your text",
  fontSize: 18,
});
entries.selectableText.fields = entries.selectableText.fields.filter(
  (f) => f.key !== "maxLines",
);
define(
  "richText textSpan",
  `text ${textStyle} children`,
  {
    text: "Styled text",
    children: [{ type: "textSpan", text: " with emphasis", fontWeight: 700 }],
  },
  { slot: "children" },
);
define("icon", "name size color semanticLabel", { name: "star", size: 24 });
define("image", "src source package width height fit semanticLabel error", {
  src: "",
  height: 180,
  fit: "cover",
});
define(
  "circleAvatar",
  "text radius backgroundColor src child",
  { text: "S", radius: 28 },
  { slot: "child" },
);
define(
  "card",
  "backgroundColor elevation margin borderRadius child",
  {
    child: {
      type: "listTile",
      title: "Card title",
      subtitle: "Supporting text",
    },
  },
  { slot: "child" },
);
define(
  "listTile",
  "title subtitle icon iconSize iconColor selected enabled leading trailing",
  { title: "Title", subtitle: "Supporting text" },
);
define(
  "expansionTile",
  "title initiallyExpanded leading children",
  { title: "Details", children: [text("More information")] },
  { slot: "children" },
);
define("divider", "height thickness color");
define(
  "verticalDivider",
  "width thickness color",
  { width: 16 },
  { placement: "bounded" },
);
fields("thickness", "number", { min: 0 });
for (const name of ["divider", "verticalDivider"])
  entries[name].fields.find((f) => f.key === "thickness").kind = "number";
define(
  "chip",
  "text backgroundColor avatar child",
  { text: "Label" },
  { slot: "child" },
);
define(
  "actionChip",
  "text enabled child",
  { text: "Label" },
  { slot: "child" },
);
define(
  "badge",
  "text visible child",
  { text: "3", child: { type: "icon", name: "notifications" } },
  { slot: "child" },
);
define(
  "tooltip",
  "message child",
  { message: "More information", ...child },
  { slot: "child" },
);
define(
  "button elevatedButton filledButton outlinedButton textButton",
  "text enabled backgroundColor color borderColor borderWidth padding borderRadius child",
  { text: "Continue", action: { type: "snackbar", message: "Button pressed" } },
  { slot: "child" },
);
define("iconButton", "icon iconSize iconColor tooltip enabled padding", {
  icon: "star",
  action: { type: "snackbar", message: "Button pressed" },
});
define(
  "floatingActionButton",
  "icon iconSize iconColor backgroundColor child",
  { icon: "add", action: { type: "snackbar", message: "Button pressed" } },
  { slot: "child" },
);
define("gestureDetector", "onLongPress child", child, { slot: "child" });
define("inkWell", "borderRadius child", child, { slot: "child" });
define("canPop", "child", child, { slot: "child" });
define(
  "form",
  "name autovalidate child children",
  { children: [] },
  { slot: "children" },
);
define("input textField textArea searchField", input, {
  name: "field",
  label: "Label",
});
entries.textArea.defaults = {
  name: "field",
  label: "Message",
  minLines: 3,
  maxLines: 5,
};
entries.searchField.fields.push({ ...spec.debounce });
define("autocomplete dropdown multiSelect radio", `${field} hint options`, {
  name: "choice",
  label: "Choose an option",
  options: [
    { label: "First option", value: "first" },
    { label: "Second option", value: "second" },
  ],
});
define("checkbox switch", field, {
  name: "enabled",
  label: "Enabled",
  initialValue: false,
});
define("slider rangeSlider rating", `${field} min max divisions`, {
  name: "value",
  min: 0,
  max: 5,
});
define(
  "datePicker timePicker dateRangePicker",
  `${field} hint firstDate lastDate`,
  { name: "date", label: "Choose a date" },
);
define("loader circularProgressIndicator", "value color strokeWidth", {
  value: 0.5,
});
define("linearProgressIndicator", "value color backgroundColor height", {
  value: 0.5,
});
define(
  "refreshIndicator",
  "onRefresh child",
  {
    onRefresh: { type: "refresh" },
    child: {
      type: "listView",
      shrinkWrap: true,
      children: [text("Pull to refresh")],
    },
  },
  { slot: "child" },
);
define(
  "visibility",
  "visible maintainState child",
  { visible: true, ...child },
  { slot: "child" },
);
define(
  "conditional",
  "condition then else",
  { condition: true, then: text("When true"), else: text("When false") },
  { slot: "then" },
);
define(
  "repeat",
  "items layout crossAxisCount crossAxisSpacing mainAxisSpacing mainAxisExtent childAspectRatio shrinkWrap padding template empty",
  {
    items: [{ name: "First item" }, { name: "Second item" }],
    template: { type: "listTile", title: "{{item.name}}" },
  },
  { slot: "template" },
);
// Repeat items can have arbitrary application-specific shapes.
entries.repeat.fields.find((f) => f.key === "items").fields = undefined;
entries.repeat.fields.find((f) => f.key === "items").item = {
  name: "New item",
};
define(
  "responsive",
  "largeBreakpoint mediumBreakpoint small medium large child",
  {
    small: text("Small layout"),
    medium: text("Medium layout"),
    large: text("Large layout"),
  },
  { slot: "small" },
);
define(
  "opacity animatedOpacity",
  "opacity duration child",
  { opacity: 0.6, ...child },
  { slot: "child" },
);
entries.opacity.fields = entries.opacity.fields.filter(
  (f) => f.key !== "duration",
);
define(
  "animatedSwitcher",
  "duration child",
  { duration: 250, ...child },
  { slot: "child" },
);
define(
  "transform",
  "angle scale alignment child",
  { angle: 0, scale: 1, ...child },
  { slot: "child" },
);
define("ignorePointer", "ignoring child", child, { slot: "child" });
define("absorbPointer", "absorbing child", child, { slot: "child" });
define("semantics", "label button liveRegion child", child, { slot: "child" });
define(
  "theme",
  "seedColor primaryColor secondaryColor surfaceColor onSurfaceColor onPrimaryColor onSecondaryColor errorColor onErrorColor backgroundColor fontFamily fontSize borderRadius child",
  child,
  {
    slot: "child",
  },
);
define(
  "alertDialog",
  "title text content actions child",
  { title: "Dialog title", text: "Dialog content" },
  { slot: "content" },
);
define(
  "bottomSheet",
  "backgroundColor padding borderRadius child",
  { padding: 16, ...child },
  { slot: "child" },
);
define(
  "dataTable",
  "columns rows rowKey bind sortable selectable pageSize onSelectionChanged",
  {
    columns: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
    ],
    rows: [{ id: "r1", name: "First", value: 42 }],
  },
);
define("stepper", "steps selectedIndex bind direction onChanged onComplete", {
  bind: "currentStep",
  steps: [
    { title: "Details", content: text("Enter your details") },
    { title: "Confirm", content: text("Review and confirm") },
  ],
});
define(
  "customScrollView",
  "shrinkWrap children",
  { children: [{ type: "sliverList", children: [text("Scrolling content")] }] },
  { slot: "children", placement: "bounded" },
);
define(
  "sliverAppBar",
  "title pinned floating expandedHeight flexibleSpace actions",
  { title: "Header" },
  { placement: "sliver" },
);
define("sliverToBoxAdapter", "child", child, {
  slot: "child",
  placement: "sliver",
});
define(
  "sliverFillRemaining",
  "hasScrollBody child",
  { hasScrollBody: false, ...child },
  { slot: "child", placement: "sliver" },
);
define(
  "sliverPadding",
  "padding child",
  { padding: 16, child: { type: "sliverList", children: [text("Content")] } },
  { slot: "child", placement: "sliver" },
);
define(
  "sliverList",
  "children",
  { children: [text("First item"), text("Second item")] },
  { slot: "children", placement: "sliver" },
);
define(
  "sliverGrid",
  "crossAxisCount spacing childAspectRatio children",
  { crossAxisCount: 2, children: [text("First"), text("Second")] },
  { slot: "children", placement: "sliver" },
);
define(
  "stickyHeader",
  "minHeight maxHeight pinned child",
  { minHeight: 48, maxHeight: 48, ...child },
  { slot: "child", placement: "sliver" },
);
define(
  "nestedScrollView",
  "headers child",
  {
    headers: [{ type: "sliverAppBar", title: "Header" }],
    child: { type: "listView", shrinkWrap: true, children: [text("Content")] },
  },
  { slot: "child", placement: "bounded" },
);
define(
  "draggableScrollableSheet",
  "minChildSize maxChildSize initialChildSize expand borderRadius padding child",
  { initialChildSize: 0.5, minChildSize: 0.25, maxChildSize: 0.95, ...child },
  { slot: "child", placement: "bounded" },
);
define("imageGallery", "images height maxScale", {
  images: [{ type: "icon", name: "image", size: 64 }],
  height: 240,
  maxScale: 4,
});
define("quantitySelector", "name bind initialValue min max onChanged", {
  name: "quantity",
  initialValue: 1,
  min: 1,
  max: 10,
});
define("timeline", "items", {
  items: [
    { title: "Order received", complete: true },
    { title: "On its way", complete: false },
  ],
});
define("countdown", "endsAt onComplete", { endsAt: "2030-01-01T00:00:00Z" });
define("chart", "values kind height width color semanticLabel", {
  values: [4, 7, 5, 9],
  height: 160,
  kind: "bar",
});
define(
  "paginatedList",
  "source query initialItems nextCursor shrinkWrap template loading empty error",
  {
    source: "/runtime/data/main/products",
    initialItems: [{ name: "First item" }],
    nextCursor: null,
    shrinkWrap: true,
    template: { type: "listTile", title: "{{item.name}}" },
  },
  { slot: "template" },
);
define(
  "dataView",
  "source query initialData template loading empty error",
  {
    source: "/runtime/data/main/products",
    initialData: { title: "Data preview" },
    template: text("{{item.title}}"),
  },
  { slot: "template" },
);
define(
  "live",
  "stream source query bind child loading error",
  { stream: "updates", source: "/live", child: text("Live content") },
  { slot: "child" },
);
define("emptyState errorState", "text padding actionLabel", {
  text: "Nothing here yet",
});
define("skeleton", "width height borderRadius", {
  height: 24,
  borderRadius: 8,
});
define(
  "videoPlayer audioPlayer",
  "src autoplay loop captions positionBind onComplete",
  { src: "" },
);
define("map", "latitude longitude zoom height markers bind", {
  latitude: 12.97,
  longitude: 77.59,
  height: 250,
  markers: [],
});
define("documentViewer", "src height", { src: "", height: 240 });
define(
  "webView",
  "src height bind returnUrl cancelUrl onReturn onCancel onError",
  {
    src: "",
    height: 400,
  },
);
define("filePicker cameraInput", "name bind label required", {
  name: "files",
  label: "Select files",
});
define(
  "loginForm signUpForm forgotPasswordForm resetPasswordForm otpForm",
  "title subtitle submitText nameLabel emailLabel passwordLabel codeLabel onSuccess",
);
define(
  "authGate",
  "then else",
  { then: text("You are signed in"), else: { type: "loginForm" } },
  { slot: "then" },
);
define("component", "");

const styleKeys = new Set(
  "fontSize fontWeight color fontFamily italic letterSpacing lineHeight decoration backgroundColor borderRadius border borderColor borderWidth elevation shadowColor seedColor".split(
    " ",
  ),
);
const layoutKeys = new Set(
  "width height size radius padding margin alignment mainAxisAlignment crossAxisAlignment mainAxisSize spacing runSpacing crossAxisSpacing mainAxisSpacing mainAxisExtent childAspectRatio aspectRatio minWidth maxWidth minHeight maxHeight widthFactor heightFactor top bottom left right direction flex fit shrinkWrap primary scrollable itemExtent crossAxisCount expand".split(
    " ",
  ),
);
for (const entry of Object.values(entries))
  for (const field of entry.fields) {
    if (
      field.kind === "number" &&
      [
        "width",
        "height",
        "fontSize",
        "radius",
        "size",
        "spacing",
        "runSpacing",
        "crossAxisSpacing",
        "mainAxisSpacing",
        "padding",
        "margin",
        "strokeWidth",
        "elevation",
        "borderWidth",
        "maxLength",
        "minLength",
        "duration",
        "debounce",
        "expandedHeight",
        "minHeight",
        "maxHeight",
        "minWidth",
        "maxWidth",
        "pageSize",
      ].includes(field.key)
    )
      field.min = 0;
    if (
      field.kind === "number" &&
      [
        "flex",
        "length",
        "crossAxisCount",
        "maxLines",
        "minLines",
        "divisions",
        "aspectRatio",
        "childAspectRatio",
      ].includes(field.key)
    )
      field.min = field.integer ? 1 : 0.001;
    if (
      ["opacity", "minChildSize", "maxChildSize", "initialChildSize"].includes(
        field.key,
      )
    ) {
      field.min = 0;
      field.max = 1;
    }
  }
entries.rating.fields.find((field) => field.key === "max").max = 10;
entries.imageGallery.fields.find((field) => field.key === "maxScale").min = 1;
entries.chart.fields.find((field) => field.key === "values").numeric = true;
export const tapWidgetTypes = new Set(
  "button elevatedButton filledButton outlinedButton textButton iconButton floatingActionButton listTile actionChip gestureDetector inkWell emptyState errorState".split(
    " ",
  ),
);
export const widgetCatalog = entries;
export function fieldsFor(node) {
  const p = properties(node),
    defined = entries[p.type]?.fields || [];
  const extra = Object.keys(p).filter(
    (key) =>
      ![
        "type",
        "widgetType",
        "id",
        "props",
        "style",
        "labelName",
        "componentId",
        "defaults",
      ].includes(key) &&
      p[key] !== undefined &&
      !defined.some((f) => f.key === key),
  );
  return [
    ...defined,
    ...(tapWidgetTypes.has(p.type) &&
    ![...defined.map((f) => f.key), ...extra].some((k) =>
      ["action", "onTap", "onPressed"].includes(k),
    )
      ? [{ key: "action", label: "On tap", kind: "action" }]
      : []),
    ...extra.map((key) => ({
      ...(spec[key] || {
        key,
        label: label(key),
        kind:
          typeof p[key] === "boolean"
            ? "boolean"
            : typeof p[key] === "number"
              ? "number"
              : typeof p[key] === "string"
                ? "text"
                : "json",
      }),
    })),
  ].map((f) => ({
    ...f,
    label:
      f.kind === "action" && ["action", "onPressed", "onTap"].includes(f.key)
        ? "On tap"
        : f.label,
    kind: p.type === "component" && f.key === "values" ? "json" : f.kind,
    group: ["widget", "widgets"].includes(f.kind)
      ? "Child widgets"
      : f.kind === "action"
        ? "Events"
        : styleKeys.has(f.key)
          ? "Appearance"
          : layoutKeys.has(f.key)
            ? "Layout"
            : "Properties",
  }));
}
export function defaultBinding(node) {
  const keys = fieldsFor(node)
    .filter((f) => !["widget", "widgets", "action"].includes(f.kind))
    .map((f) => f.key);
  return (
    ["text", "title", "src", "items", "rows", "initialValue", "value"].find(
      (key) => keys.includes(key),
    ) ||
    keys[0] ||
    "text"
  );
}
