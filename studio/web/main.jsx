import { AuthScreen } from "./features/account/StudioSignIn.jsx";
import { SignInSetup } from "./features/account/SignInSetup.jsx";
import { ComponentSetup } from "./ComponentSetup.jsx";
import { MappingContext } from "./ValueMapping.jsx";
import {
  extractComponent,
  openingOverlays,
  operationInputs,
  requestOptions,
} from "../shared/authoring.mjs";
import { DatabaseOperationBuilder } from "./features/content/DatabaseOperationBuilder.jsx";
import { navigationBar } from "../shared/screens.mjs";
import { ScreenSetup } from "./ScreenSetup.jsx";
import { DataPage } from "./features/content/DatabaseContent.jsx";
import {
  readRecovery,
  useDraftPersistence,
  recoveryKey,
} from "./useDraftPersistence.js";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Layers,
  Component,
  Database,
  KeyRound,
  History,
  ShieldCheck,
  Workflow,
  Plus,
  ChevronDown,
  ChevronRight,
  Smartphone,
  Code2,
  Upload,
  Check,
  Type,
  Square,
  MousePointer2,
  LayoutList,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  LogOut,
  X,
  Save,
  Lock,
  Globe,
  Link,
  AlertCircle,
  Package,
  ClipboardPaste,
  Palette,
} from "lucide-react";
import { FigmaImport, readFigmaFile } from "./FigmaImport.jsx";
import { applyFigmaImport, classifyFigmaClipboard } from "./figma-import.js";
import { FlutterCanvas } from "./FlutterCanvas.jsx";
import { WidgetList } from "./WidgetPicker.jsx";
import { widgetOptions, availableComponents } from "./widget-search.js";
import { DataBindingPanel, CollectionBuilder } from "./DataBindingPanel.jsx";
import { ThemeEditor, DEFAULT_THEME } from "./ThemeEditor.jsx";
import { QueryBuilder } from "./QueryBuilder.jsx";
import {
  repeatedCollection,
  friendlyName,
  nodePath,
  actionFieldChoices,
  bindingContext,
} from "./designer-model.js";
import { AIStudio, CodeStudio, AppIntegrations } from "./PlatformPanel.jsx";
import { IntegrationStatus } from "./IntegrationStatus.jsx";
import { HttpServicesPanel } from "./HttpServicesPanel.jsx";
import { WidgetProperties, ComponentValues } from "./WidgetProperties.jsx";
import {
  properties,
  patchProperties,
  widgetType,
  isWidget,
  fieldsFor,
  fieldTypes,
  defaultBinding,
  widgetCatalog,
  tapWidgetTypes,
} from "./widget-catalog.js";
import {
  uid,
  slug,
  clone,
  hydrate,
  nodes,
  updateNode,
  insertInto,
  moveSibling,
  moveWidget,
  widget,
  duplicateInTree,
  wrapWidget,
  replaceWidget,
  wrapperTypes,
  canPlace,
  nodeLocation,
  insertBeside,
  prepareInsertion,
  synchronizeTabs,
} from "./model.js";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./style.css";

const SAMPLE = {
  user: { name: "Sakthi", email: "sakthi@example.com" },
  products: [
    { id: "p1", name: "Studio headphones", category: "Audio", price: 89 },
    { id: "p2", name: "Everyday backpack", category: "Accessories", price: 64 },
    { id: "p3", name: "Desk lamp", category: "Home", price: 42 },
  ],
};
const title = (value) =>
  value === "repeat"
    ? "Repeated collection"
    : value.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
function IconButton({ title: label, children, ...props }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
function Field({ label, children, hint }) {
  const labelId = React.useId();
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      {React.isValidElement(children) &&
      ["input", "textarea", "select"].includes(children.type)
        ? React.cloneElement(children, { "aria-labelledby": labelId })
        : children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    ref.current?.focus();
    const fn = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const list = [
          ...ref.current.querySelectorAll(
            "button,input,textarea,select,a[href]",
          ),
        ].filter((el) => !el.disabled);
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <h2>{title}</h2>
          <IconButton title="Close dialog" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
function JsonEditor({ initial, onApply, label = "JSON" }) {
  const [value, setValue] = useState(JSON.stringify(initial, null, 2)),
    [error, setError] = useState("");
  return (
    <>
      <textarea
        className="json-editor"
        aria-label={label}
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <button
        className="primary"
        onClick={() => {
          try {
            onApply(JSON.parse(value));
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        Apply changes
      </button>
    </>
  );
}
function App() {
  const [resolvedData, setResolvedData] = useState(null);
  const [contentSection, setContentSection] = useState("records");
  const [availableRequests, setAvailableRequests] = useState([]);
  const [boot, setBoot] = useState(true),
    [account, setAccount] = useState(null),
    [setup, setSetup] = useState(false),
    [apps, setApps] = useState([]),
    [app, setApp] = useState(null),
    [doc, setDoc] = useState(null),
    [catalog, setCatalog] = useState([]),
    [tab, setTab] = useState("screens"),
    [screenId, setScreenId] = useState("main"),
    [componentId, setComponentId] = useState(null),
    [selected, setSelected] = useState(null),
    [palette, setPalette] = useState(false),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [modal, setModal] = useState(null),
    [saved, setSaved] = useState(""),
    [past, setPast] = useState([]),
    [future, setFuture] = useState([]),
    [sample, setSample] = useState(SAMPLE),
    [inspectorTab, setInspectorTab] = useState("design"),
    [previewSource, setPreviewSource] = useState("draft"),
    [previewUser, setPreviewUser] = useState(""),
    [selectionVersion, setSelectionVersion] = useState(0),
    [importViewport, setImportViewport] = useState(null),
    [connections, setConnections] = useState([]),
    [keys, setKeys] = useState([]),
    [releases, setReleases] = useState([]),
    [outbox, setOutbox] = useState([]),
    [users, setUsers] = useState([]),
    [showInspector, setShowInspector] = useState(window.innerWidth > 950);
  const openGeneration = useRef(0);
  const accountRef = useRef(account);
  accountRef.current = account;
  const appRef = useRef(app);
  appRef.current = app;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const saveQueue = useRef(Promise.resolve());
  const docRef = useRef(doc);
  docRef.current = doc;
  const [leftWidth, setLeftWidth] = useState(264),
    [rightWidth, setRightWidth] = useState(304),
    [showLayers, setShowLayers] = useState(window.innerWidth > 700);
  const notify = (message, error = false) => setToast({ message, error });
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const api = useCallback(
    async (path, method = "GET", body, headers = {}, options = {}) => {
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        signal: options.signal,
        headers: {
          "content-type": "application/json",
          ...(accountRef.current
            ? { "x-csrf-token": accountRef.current.csrf }
            : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.message || `Request failed (${response.status})`);
      return value;
    },
    [],
  );
  async function run(fn) {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function openApp(appId) {
    if (
      appRef.current &&
      docRef.current &&
      savedRef.current !== JSON.stringify(docRef.current)
    )
      await save();
    const generation = ++openGeneration.current;
    const [result, types, connectionList, userList] = await Promise.all([
      api(`/api/apps/${appId}`),
      catalog.length
        ? catalog
        : api("/api/catalog").then((value) => value.widgets),
      api(`/api/apps/${appId}/connections`),
      api(`/api/apps/${appId}/users`),
    ]);
    if (generation !== openGeneration.current) return;
    const serverDocument = hydrate(result.draft, types);
    const recovery = readRecovery(accountRef.current, appId);
    const document =
      recovery?.revision === result.revision
        ? hydrate(recovery.document, types)
        : serverDocument;
    if (recovery?.revision === result.revision)
      notify("Recovered your unsaved draft. Saving it now.");
    else if (recovery) setModal({ type: "recovery", value: recovery, appId });
    const [modules, services] = await Promise.all([
      api(`/api/apps/${appId}/code`),
      api(`/api/apps/${appId}/http-services`),
    ]);
    if (generation !== openGeneration.current) return;
    setAvailableRequests(requestOptions(modules, services));
    setImportViewport(null);
    setPreviewSource("draft");
    setPreviewUser("");
    setUsers(userList);
    setInspectorTab("design");
    setCatalog(types);
    setApp(result);
    setDoc(document);
    setSaved(JSON.stringify(serverDocument));
    setScreenId(document.initialScreen);
    setComponentId(document.components[0]?.id);
    setSelected(null);
    setPast([]);
    setFuture([]);
    setSample(
      document.screens.some((s) => s.queries?.length || s.loader) ? SAMPLE : {},
    );
    setTab("screens");
    setConnections(connectionList);
  }
  async function loadApps() {
    const list = await api("/api/apps");
    setApps(list);
    if (list[0]) await openApp(list[0].id);
  }
  useEffect(() => {
    (async () => {
      try {
        const status = await api("/api/setup");
        setSetup(status.required);
        if (!status.required) {
          try {
            const me = await api("/api/me");
            accountRef.current = me;
            setAccount(me);
            await loadApps();
          } catch {}
        }
      } catch (e) {
        notify(e.message, true);
      } finally {
        setBoot(false);
      }
    })();
  }, []);
  const dirty = !!doc && saved !== JSON.stringify(doc),
    screen = doc?.screens.find((s) => s.id === screenId) || doc?.screens[0],
    component = doc?.components.find((c) => c.id === componentId),
    editingComponent = tab === "components",
    entity = editingComponent ? component : screen,
    overlays = editingComponent ? [] : openingOverlays(screen?.onLoad),
    openingOverlay = overlays.find((root) =>
      nodes(root).some((n) => n.id === selected),
    ),
    tree = openingOverlay || entity?.tree;
  const flattened = tree ? nodes(tree) : [],
    node = flattened.find((n) => n.id === selected),
    nodeProps = node ? properties(node) : {},
    tapAction = nodeProps.onPressed || nodeProps.onTap || nodeProps.action;
  useEffect(() => {
    if (!doc) return;
    if (!doc.screens.some((s) => s.id === screenId))
      setScreenId(doc.initialScreen);
    if (editingComponent && !doc.components.some((c) => c.id === componentId)) {
      if (doc.components.length) setComponentId(doc.components[0].id);
      else setTab("screens");
    }
  }, [doc, screenId, componentId, editingComponent]);
  const persistenceStatus = useDraftPersistence({
    account,
    app,
    doc,
    dirty,
    save,
    notify,
  });
  useEffect(() => {
    if (!app || !["screens", "components"].includes(tab)) return;
    let active = true;
    Promise.all([
      api(`/api/apps/${app.id}/code`),
      api(`/api/apps/${app.id}/http-services`),
    ])
      .then(([modules, services]) => {
        if (active) setAvailableRequests(requestOptions(modules, services));
      })
      .catch((e) => active && notify(e.message, true));
    return () => {
      active = false;
    };
  }, [app?.id, tab, api]);
  const requests = [...(doc?.actions || []), ...availableRequests];
  const [bindingProperty, setBindingProperty] = useState("text");
  useEffect(() => {
    if (node) setBindingProperty(defaultBinding(node));
  }, [selected]);
  function change(fn) {
    if (previewSource === "published") {
      notify("Switch to Draft to edit your design.");
      return;
    }
    setDoc((current) => {
      const next = clone(current);
      fn(next);
      setPast((history) => [...history.slice(-49), clone(current)]);
      setFuture([]);
      return next;
    });
  }
  function changeTree(nextTree) {
    change((d) => {
      const target = editingComponent
        ? d.components.find((c) => c.id === componentId)
        : d.screens.find((s) => s.id === screen.id);
      if (target) {
        const next = synchronizeTabs(nextTree, selected);
        if (openingOverlay)
          target.onLoad = updateNode(
            target.onLoad,
            openingOverlay.id,
            () => next,
          );
        else target.tree = next;
      }
    });
  }
  function patchNode(values) {
    if (
      values.destinations &&
      typeof nodeProps.selectedIndex === "number" &&
      nodeProps.selectedIndex >= values.destinations.length
    )
      values = {
        ...values,
        selectedIndex: Math.max(0, values.destinations.length - 1),
      };
    if (node)
      changeTree(
        updateNode(tree, node.id, (n) =>
          hydrate(patchProperties(n, values), catalog),
        ),
      );
  }
  function addChild(type, slot) {
    if (!node) return;
    const item = type.startsWith("component:")
      ? {
          type: "component",
          id: uid(),
          componentId: type.slice(10),
          values: {},
        }
      : widget(type);
    const current = properties(node);
    let next;
    if (current.type === "form" && slot === "children" && current.child)
      next = insertInto(node, node.id, item);
    else if (slot === "children")
      next = patchProperties(node, {
        children: [
          ...(node.children || []),
          prepareInsertion(item, current.type),
        ],
      });
    else if (["actions", "headers", "images"].includes(slot))
      next = patchProperties(node, {
        [slot]: [
          ...(current[slot] || []),
          prepareInsertion(
            item,
            slot === "headers" ? "nestedScrollView:headers" : current.type,
          ),
        ],
      });
    else
      next = patchProperties(node, {
        [slot]: prepareInsertion(item, current.type),
      });
    changeTree(updateNode(tree, node.id, () => next));
  }
  function structural(operation) {
    try {
      operation();
    } catch (error) {
      notify(error.message, true);
    }
  }
  function duplicateSelected() {
    structural(() => {
      const result = duplicateInTree(tree, node.id);
      changeTree(result.tree);
      setSelected(result.id);
    });
  }
  function move(id, target, position = "inside") {
    structural(() => {
      const next = moveWidget(tree, id, target, position);
      if (next === tree)
        throw new Error(
          "Choose a different compatible parent or drop position.",
        );
      changeTree(next);
      setSelected(id);
    });
  }
  function selectLayer(id) {
    if (
      !editingComponent &&
      !nodes(screen.tree).some((n) => n.id === id) &&
      !overlays.some((root) => nodes(root).some((n) => n.id === id))
    ) {
      const owner = doc.screens.find((s) => s.id === doc.navigation?.screenId);
      if (owner && nodes(navigationBar(doc)).some((n) => n.id === id)) {
        setScreenId(owner.id);
        notify(
          "Editing the shared navigation layout. Changes apply to every tab.",
        );
      }
    }
    setSelected(id);
    setPalette(false);
  }
  function add(type, target = selected, position = "inside") {
    const item = type.startsWith("component:")
      ? {
          type: "component",
          id: uid(),
          componentId: type.slice(10),
          values: {},
        }
      : widget(type);
    structural(() => {
      if (type === "refreshIndicator" && position === "inside") {
        const scrollTypes = [
          "listView",
          "gridView",
          "customScrollView",
          "singleChildScrollView",
        ];
        const path = nodePath(tree, target) || [];
        const scrolling =
          [...path]
            .reverse()
            .find((n) => scrollTypes.includes(widgetType(n))) ||
          (!target
            ? nodes(properties(tree).body || tree).find((n) =>
                scrollTypes.includes(widgetType(n)),
              )
            : null);
        if (scrolling) {
          const result = wrapWidget(tree, scrolling.id, "refreshIndicator");
          changeTree(result.tree);
          setSelected(result.id);
          return;
        }
      }
      changeTree(
        position === "inside"
          ? insertInto(tree, target, item)
          : insertBeside(tree, target, item, position),
      );
      setSelected(item.id);
    });
  }
  function undo() {
    if (previewSource !== "draft") return;
    if (!past.length) return;
    setFuture([clone(doc), ...future]);
    setDoc(past.at(-1));
    setPast(past.slice(0, -1));
  }
  function redo() {
    if (previewSource !== "draft") return;
    if (!future.length) return;
    setPast([...past, clone(doc)]);
    setDoc(future[0]);
    setFuture(future.slice(1));
  }
  async function save() {
    const snapshot = clone(docRef.current),
      targetId = appRef.current.id;
    const task = saveQueue.current
      .catch(() => {})
      .then(async () => {
        if (appRef.current?.id !== targetId)
          throw new Error("App changed while saving. Recovery copy retained.");
        const result = await api(`/api/apps/${targetId}/draft`, "PUT", {
          revision: appRef.current.revision,
          document: snapshot,
        });
        if (appRef.current?.id === targetId) {
          appRef.current = result;
          setApp(result);
          setSaved(JSON.stringify(snapshot));
        }
        return result;
      });
    saveQueue.current = task;
    return task;
  }
  async function publish() {
    return run(async () => {
      await saveQueue.current.catch(() => {});
      const result =
        JSON.stringify(docRef.current) !== savedRef.current
          ? await save()
          : appRef.current;
      const release = await api(`/api/apps/${app.id}/releases`, "POST", {
        revision: result.revision,
      });
      setApp((current) => ({ ...current, published: release.version }));
      notify(`Version ${release.version} is live`);
      setReleases(await api(`/api/apps/${app.id}/releases`));
    });
  }
  useEffect(() => {
    const fn = (e) => {
      if (previewSource === "published") {
        if (
          (e.metaKey || e.ctrlKey) &&
          ["s", "z", "y", "d"].includes(e.key.toLowerCase())
        )
          e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (doc && !busy)
          run(async () => {
            await save();
            notify("Draft saved");
          });
      }
      if (
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        (e.metaKey || e.ctrlKey) &&
        e.key === "z"
      ) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [doc, app, past, future, busy, previewSource]);
  useEffect(() => {
    const shortcut = (e) => {
      if (previewSource === "published") return;
      if (
        e.target.closest?.("input,textarea,select,[contenteditable=true]") ||
        modal
      )
        return;
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      if (!node || node.id === tree.id) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        changeTree(updateNode(tree, node.id, () => null));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [doc, selected, modal, past, future, previewSource]);
  useEffect(() => {
    if (
      previewSource === "published" ||
      !app ||
      !doc ||
      modal ||
      !["screens", "components"].includes(tab)
    )
      return;
    const paste = async (event) => {
      if (
        event.target.closest?.("input,textarea,select,[contenteditable=true]")
      )
        return;
      const text = event.clipboardData?.getData("text/plain") || "",
        html = event.clipboardData?.getData("text/html") || "";
      const kind = classifyFigmaClipboard(text, html);
      const image = [...(event.clipboardData?.items || [])].find(
        (item) => item.kind === "file" && item.type === "image/png",
      );
      if (!kind && !image) return;
      event.preventDefault();
      if (kind === "package") setModal({ type: "figma", initial: { text } });
      else if (image) {
        try {
          setModal({
            type: "figma",
            initial: { text: await readFigmaFile(image.getAsFile()) },
          });
        } catch (e) {
          notify(e.message, true);
        }
      } else setModal({ type: "figma", initial: { native: true } });
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [app, doc, modal, tab, previewSource]);
  function importFigma(exported, options) {
    const result = applyFigmaImport(docRef.current, exported, {
      ...options,
      screenId: screen?.id,
      componentId: editingComponent ? componentId : undefined,
      selected,
    });
    change((d) => Object.assign(d, result.document));
    if (result.destination === "screen") {
      setScreenId(result.entityId);
      setTab("screens");
      setSelected(null);
    } else if (result.destination === "component") {
      setComponentId(result.entityId);
      setTab("components");
      setSelected(null);
    } else setSelected(result.nodeId);
    if (options.originalSize)
      setImportViewport({
        width: result.width,
        height: result.height,
        revision: uid(),
      });
    setPalette(false);
    setShowLayers(true);
    setShowInspector(true);
    setModal(null);
    notify("Figma design imported into your draft.");
  }
  async function loadRecordSample(query, userId) {
    return run(async () => {
      const sourceScreen =
        docRef.current.screens.find(
          (s) =>
            s.id === screen?.id && s.queries.some((q) => q.id === query.id),
        ) ||
        docRef.current.screens.find((s) =>
          s.queries.some(
            (q) => q.id === query.id && q.connectionId === query.connectionId,
          ),
        );
      if (!sourceScreen) throw new Error("Choose a screen data source first.");
      const result = await api(`/api/apps/${app.id}/query-preview`, "POST", {
        document: docRef.current,
        screenId: sourceScreen.id,
        queryId: query.id,
        userId: userId || previewUser || undefined,
      });
      setSample((current) => ({
        ...current,
        [query.id]: query.single ? result.items[0] || null : result.items,
        [`${query.id}Page`]: result,
      }));
      notify(
        `Canvas sample data updated · ${result.items.length} record(s) loaded`,
      );
    });
  }
  function openCollection(query, options) {
    const item = repeatedCollection(query, options, uid);
    changeTree(insertInto(screen.tree, null, item));
    setTab("screens");
    setInspectorTab("data");
    setSelected(item.id);
    setModal(null);
  }
  function manageData(destination, id) {
    if (destination === "component") {
      const target = doc.components.find((c) => c.id === id),
        repeat = nodes(target?.tree).find((n) => widgetType(n) === "repeat");
      setComponentId(id);
      setTab("components");
      setSelected(repeat?.template?.id || target?.tree?.id);
      setInspectorTab("data");
    } else switchTab("data");
  }
  async function switchTab(next) {
    setTab(next);
    setSelected(null);
    if (!app) return;
    await run(async () => {
      if (next === "keys") setKeys(await api(`/api/apps/${app.id}/keys`));
      if (next === "releases")
        setReleases(await api(`/api/apps/${app.id}/releases`));
      if (next === "auth") {
        setOutbox(await api(`/api/apps/${app.id}/outbox`).catch(() => []));
        setUsers(await api(`/api/apps/${app.id}/users`));
      }
    });
  }
  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied to clipboard");
    } catch {
      notify("Select and copy the text manually.", true);
    }
  };
  async function newKey(label = "Production") {
    const result = await api(`/api/apps/${app.id}/keys`, "POST", { label });
    setKeys(await api(`/api/apps/${app.id}/keys`));
    setModal({ type: "key", value: result.key });
  }
  if (boot)
    return (
      <div className="boot">
        <span className="brand-mark">s</span>
        <p>Opening your workspace…</p>
      </div>
    );
  if (!account)
    return (
      <AuthScreen
        setup={setup}
        invite={new URLSearchParams(window.location.search).get("invite")}
        busy={busy}
        error={toast?.error ? toast.message : null}
        onSubmit={(values) =>
          run(async () => {
            if (setup) {
              await api(
                "/api/setup",
                "POST",
                { email: values.email, password: values.password },
                { "x-setup-token": values.setupToken },
              );
              setSetup(false);
            } else if (
              new URLSearchParams(window.location.search).get("invite")
            ) {
              await api("/api/register", "POST", {
                ...values,
                invite: new URLSearchParams(window.location.search).get(
                  "invite",
                ),
              });
            }
            const me = await api("/api/login", "POST", {
              email: values.email,
              password: values.password,
            });
            accountRef.current = me;
            setAccount(me);
            history.replaceState(null, "", window.location.pathname);
            await loadApps();
          })
        }
      />
    );
  const nav = [
    ["screens", Layers, "Screens"],
    ["components", Component, "Components"],
    ["data", Database, "Content"],
    ["ai", Component, "AI design"],
    ["code", Workflow, "Custom code"],
    ["integrations", Workflow, "Integrations"],
    ["actions", Workflow, "Interactions"],
    ["auth", ShieldCheck, "Users & sign-in"],
    ["keys", KeyRound, "Connect app"],
    ["releases", History, "Releases"],
  ];
  const mappingSample = {
    ...screen?.state,
    ...sample,
    ...(resolvedData &&
    app &&
    screen &&
    resolvedData.appId === app.id &&
    resolvedData.screenId === screen.id
      ? resolvedData.state
      : {}),
  };
  const context = doc
    ? bindingContext(
        doc,
        screen,
        tree,
        node,
        editingComponent ? componentId : undefined,
        mappingSample,
      )
    : null;
  const mappingFields = actionFieldChoices(mappingSample, context);
  for (const field of flattened.filter((n) =>
    fieldTypes.includes(widgetType(n)),
  )) {
    const name = properties(field).bind || properties(field).name;
    if (name)
      mappingFields.push([
        name,
        `Form field · ${properties(field).label || name}`,
      ]);
  }
  const uniqueMappingFields = [
    ...new Map(mappingFields.map((entry) => [entry[0], entry])).values(),
  ];
  return (
    <MappingContext.Provider value={uniqueMappingFields}>
      <div className="studio-shell">
        <aside className="rail">
          <a className="brand-mark" aria-label="SpaceWidget Studio">
            s<span />
          </a>
          <div className="rail-divider" />
          {[
            ...["screens", "components", "data", "actions", "ai"].map((id) =>
              nav.find((n) => n[0] === id),
            ),
            ["auth", ShieldCheck, "App settings"],
          ].map(([id, Icon, label]) => (
            <button
              key={id}
              className={
                tab === id ||
                (label === "App settings" &&
                  ["auth", "integrations", "keys", "code", "releases"].includes(
                    tab,
                  ))
                  ? "active"
                  : ""
              }
              title={label}
              aria-label={label}
              onClick={() => switchTab(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
          <div className="rail-bottom">
            {account.isOwner && (
              <button
                title="Invite a builder"
                aria-label="Invite a builder"
                onClick={() => setModal({ type: "invite" })}
              >
                <Plus size={19} />
              </button>
            )}
            <button
              title="Sign out"
              aria-label="Sign out"
              onClick={() =>
                run(async () => {
                  if (dirty) await save();
                  await api("/api/logout", "POST", {});
                  setAccount(null);
                  setApp(null);
                  setDoc(null);
                })
              }
            >
              <LogOut size={19} />
            </button>
            <span className="owner-avatar">
              {account.email[0].toUpperCase()}
            </span>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="project-selector">
              <span className="project-icon">
                <Layers size={19} />
              </span>
              <div>
                <small>WORKSPACE</small>
                <select
                  aria-label="Current app"
                  value={app?.id || ""}
                  onChange={(e) => run(() => openApp(e.target.value))}
                >
                  {!apps.length && <option value="">Your apps</option>}
                  {apps.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <IconButton
                title="Create app"
                onClick={() => setModal({ type: "create", kind: "app" })}
              >
                <Plus size={16} />
              </IconButton>
            </div>
            <span className="workspace-separator" />
            <div className="breadcrumb">
              Studio <ChevronRight size={13} />
              <strong>{nav.find((n) => n[0] === tab)?.[2]}</strong>
            </div>
            <div className="topbar-actions">
              {app && (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setModal({ type: "theme" })}
                    disabled={previewSource === "published"}
                    aria-label="App theme"
                  >
                    <Palette size={15} /> Theme
                  </button>
                  <span className={`save-status ${dirty ? "unsaved" : ""}`}>
                    {dirty ? (
                      <span className="tiny-dot" />
                    ) : (
                      <Check size={13} />
                    )}
                    <span>
                      {dirty
                        ? persistenceStatus === "saving"
                          ? "Saving…"
                          : persistenceStatus === "failed"
                            ? "Save failed · recovery kept"
                            : "Saving draft soon…"
                        : `Draft r${app.revision} saved`}
                      {app.published
                        ? ` · Live v${app.published}`
                        : " · Not published"}
                    </span>
                  </span>
                  <IconButton
                    title="Save draft"
                    disabled={busy || !dirty}
                    onClick={() =>
                      run(async () => {
                        await save();
                        notify("Draft saved");
                      })
                    }
                  >
                    <Save size={17} />
                  </IconButton>
                  {["screens", "components"].includes(tab) && (
                    <button
                      type="button"
                      disabled={previewSource === "published"}
                      title="Import Figma"
                      className="secondary compact import-figma-button"
                      onClick={() => setModal({ type: "figma" })}
                    >
                      <ClipboardPaste size={16} />
                      Import Figma
                    </button>
                  )}
                  <button className="publish" disabled={busy} onClick={publish}>
                    <Upload size={15} />
                    {busy ? "Working…" : "Publish"}
                    <span>Draft</span>
                  </button>
                </>
              )}
            </div>
          </header>
          {!app ? (
            <div className="empty-workspace">
              <div className="empty-art">
                <Layers size={42} />
              </div>
              <span className="eyebrow">YOUR NEXT APP STARTS HERE</span>
              <h1>
                A screen. A connection.
                <br />
                An app that’s yours.
              </h1>
              <p>
                Create your first project to design screens, connect your data,
                <br />
                and publish a live API for your Flutter app.
              </p>
              <button
                className="primary"
                onClick={() => setModal({ type: "create", kind: "app" })}
              >
                <Plus size={17} />
                Create your first app
              </button>
            </div>
          ) : ["screens", "components"].includes(tab) ? (
            <div
              className={`editor-layout ${showLayers ? "" : "layers-collapsed"} ${showInspector ? "" : "inspector-collapsed"}`}
              style={{
                "--studio-left-width": `${leftWidth}px`,
                "--studio-right-width": `${rightWidth}px`,
              }}
            >
              <aside className="left-panel">
                <div className="panel-heading">
                  <h2>
                    {editingComponent ? "Components" : "Screens"}
                    <span>
                      {editingComponent
                        ? doc.components.length
                        : doc.screens.length}
                    </span>
                  </h2>
                  <IconButton
                    title={
                      editingComponent ? "Create component" : "Create screen"
                    }
                    onClick={() =>
                      setModal({
                        type: "create",
                        kind: editingComponent ? "component" : "screen",
                      })
                    }
                  >
                    <Plus size={17} />
                  </IconButton>
                </div>
                <div className="entity-list">
                  {(editingComponent ? doc.components : doc.screens).map(
                    (item) => (
                      <button
                        key={item.id}
                        aria-label={item.name}
                        className={entity?.id === item.id ? "selected" : ""}
                        onClick={() => {
                          editingComponent
                            ? setComponentId(item.id)
                            : setScreenId(item.id);
                          setSelected(null);
                          setInspectorTab("design");
                        }}
                      >
                        {editingComponent ? (
                          <Component size={16} />
                        ) : (
                          <Smartphone size={16} />
                        )}
                        <span>
                          {item.name}
                          <small>
                            {editingComponent
                              ? "Reusable component"
                              : item.id === doc.initialScreen
                                ? "Start screen"
                                : "Screen"}
                          </small>
                        </span>
                        {!editingComponent &&
                          (item.public ? (
                            <Globe size={12} />
                          ) : (
                            <Lock size={12} />
                          ))}
                      </button>
                    ),
                  )}
                </div>
                <div className="panel-section-heading">
                  <button
                    className={!palette ? "chosen" : ""}
                    onClick={() => setPalette(false)}
                  >
                    Layers
                  </button>
                  <button
                    className={palette ? "chosen" : ""}
                    onClick={() => setPalette(true)}
                  >
                    Insert
                  </button>
                  <IconButton
                    title="Add widget"
                    onClick={() => setPalette(true)}
                  >
                    <Plus size={15} />
                  </IconButton>
                </div>
                {palette && (
                  <div className="palette insert-with-layers">
                    <WidgetList
                      options={widgetOptions({
                        components: doc.components,
                        editingId: editingComponent ? componentId : undefined,
                      })}
                      query={search}
                      setQuery={setSearch}
                      onChoose={(type) => {
                        add(type);
                        setPalette(false);
                      }}
                    />
                  </div>
                )}
                <div className="layer-tree">
                  {entity ? (
                    <LayerTree
                      tree={entity.tree}
                      selected={selected}
                      onSelect={(id) => {
                        selectLayer(id);
                        setSelectionVersion((n) => n + 1);
                      }}
                      onMove={move}
                      onAdd={add}
                    />
                  ) : (
                    <p className="muted padded">Create a component to begin.</p>
                  )}
                  {!!overlays.length && (
                    <>
                      <p className="layer-section-label">
                        When screen opens · overlays
                      </p>
                      {overlays.map((root) => (
                        <LayerTree
                          key={root.id}
                          tree={root}
                          selected={selected}
                          onSelect={selectLayer}
                          onMove={move}
                          onAdd={add}
                        />
                      ))}
                    </>
                  )}
                  <button
                    className="add-layer"
                    onClick={() => setPalette(true)}
                  >
                    <Plus size={15} />
                    Insert a widget
                  </button>
                </div>
                <div className="left-panel-footer">
                  <span className="small-logo">
                    <Component size={14} />
                  </span>
                  <div>
                    Build visually. Ship natively.
                    <small>Powered by SpaceWidget</small>
                  </div>
                </div>
              </aside>
              <ResizeHandle
                label="Resize layers panel"
                value={leftWidth}
                onChange={setLeftWidth}
                min={220}
                max={420}
              />
              <FlutterCanvas
                key={app.id}
                api={api}
                appId={app.id}
                document={doc}
                viewport={importViewport}
                previewUser={previewUser}
                onResolvedData={(state) =>
                  setResolvedData({ appId: app.id, screenId: screen.id, state })
                }
                previewSource={previewSource}
                publishedVersion={app.published}
                draftRevision={app.revision}
                onPreviewSource={(source) => {
                  setPreviewSource(source);
                  setSelected(null);
                  if (source === "published" && editingComponent)
                    setTab("screens");
                }}
                screenId={editingComponent ? doc.initialScreen : screen.id}
                componentId={editingComponent ? componentId : undefined}
                overlayId={openingOverlay?.id}
                onCloseOverlay={() => setSelected(null)}
                sample={sample}
                selected={selected}
                selectionVersion={selectionVersion}
                name={
                  openingOverlay
                    ? `Opening overlay · ${entity?.name}`
                    : entity?.name
                }
                onSelect={(id) => {
                  selectLayer(id);
                }}
                onAdd={add}
                onMove={move}
                onUndo={undo}
                onRedo={redo}
                canUndo={previewSource === "draft" && !!past.length}
                canRedo={previewSource === "draft" && !!future.length}
                onInsert={() => {
                  setPalette(true);
                  setShowLayers(true);
                }}
                onLayers={() => setShowLayers(!showLayers)}
                onInspector={() => setShowInspector(!showInspector)}
                onResize={patchNode}
                resizeWidth={
                  !!node &&
                  fieldsFor(node).some((f) => f.key === "width") &&
                  !(
                    widgetType(node) === "positioned" &&
                    nodeProps.left != null &&
                    nodeProps.right != null
                  )
                }
                resizeHeight={
                  !!node &&
                  fieldsFor(node).some((f) => f.key === "height") &&
                  !(
                    widgetType(node) === "positioned" &&
                    nodeProps.top != null &&
                    nodeProps.bottom != null
                  )
                }
              />
              <ResizeHandle
                label="Resize properties panel"
                value={rightWidth}
                onChange={setRightWidth}
                min={272}
                max={480}
                reverse
              />

              <aside
                className={`inspector ${showInspector ? "mobile-open" : ""}`}
              >
                <div className="panel-heading">
                  <h2>
                    {node
                      ? title(widgetType(node))
                      : editingComponent
                        ? "Component settings"
                        : "Screen settings"}
                  </h2>
                  <span className="inspector-label">
                    {node ? "WIDGET" : "SETTINGS"}
                  </span>
                </div>
                <div
                  className="inspector-tabs"
                  role="tablist"
                  aria-label="Layer inspector"
                >
                  {[
                    [
                      "design",
                      node
                        ? "Appearance"
                        : editingComponent
                          ? "Component"
                          : "Setup",
                    ],
                    ["data", "Content"],
                    ["actions", "Interactions"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      type="button"
                      aria-selected={inspectorTab === id}
                      onClick={() => setInspectorTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {node && (
                  <button
                    className="text-link technical-toggle"
                    onClick={() =>
                      setInspectorTab(
                        inspectorTab === "advanced" ? "design" : "advanced",
                      )
                    }
                  >
                    {inspectorTab === "advanced"
                      ? "Back to appearance"
                      : "Technical properties…"}
                  </button>
                )}
                {previewSource === "published" && (
                  <div className="inspector-readonly">
                    <p>
                      Viewing published version {app.published}. Switch to Draft
                      to edit.
                    </p>
                    <button
                      className="secondary full"
                      onClick={() => setPreviewSource("draft")}
                    >
                      Back to editing
                    </button>
                  </div>
                )}
                <fieldset
                  className="inspector-content"
                  disabled={previewSource === "published"}
                >
                  {node ? (
                    <>
                      <div className="inspector-section">
                        <div className="inspector-node-type">
                          <span>
                            <Square size={17} />
                            {widgetType(node) === "component"
                              ? node.componentId
                              : inspectorTab === "advanced"
                                ? widgetType(node)
                                : title(widgetType(node))}
                          </span>
                          {inspectorTab === "advanced" && (
                            <IconButton
                              title="Edit widget JSON"
                              onClick={() => setModal({ type: "node" })}
                            >
                              <Code2 size={15} />
                            </IconButton>
                          )}
                        </div>
                        <Field label="Layer name">
                          <input
                            value={node.labelName || ""}
                            placeholder={title(widgetType(node))}
                            onChange={(e) =>
                              patchNode({ labelName: e.target.value })
                            }
                          />
                        </Field>
                        {widgetType(node) === "component" && (
                          <>
                            <Field label="Component">
                              <select
                                value={node.componentId}
                                onChange={(e) =>
                                  patchNode({ componentId: e.target.value })
                                }
                              >
                                {availableComponents(
                                  doc.components,
                                  editingComponent ? componentId : undefined,
                                ).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            {(inspectorTab === "design" ||
                              inspectorTab === "advanced") && (
                              <ComponentValues
                                designer={inspectorTab !== "advanced"}
                                defaults={
                                  doc.components.find(
                                    (c) => c.id === node.componentId,
                                  )?.defaults
                                }
                                values={node.values}
                                onChange={(values) => patchNode({ values })}
                              />
                            )}
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => {
                                setComponentId(node.componentId);
                                setSelected(null);
                                setTab("components");
                              }}
                            >
                              Edit main component
                            </button>
                            {inspectorTab === "advanced" && (
                              <button
                                className="secondary full"
                                onClick={() => setModal({ type: "values" })}
                              >
                                Edit component properties
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {inspectorTab !== "data" && (
                        <WidgetProperties
                          view={inspectorTab}
                          onConnect={(key) => {
                            setBindingProperty(key);
                            setInspectorTab("data");
                          }}
                          key={node.id}
                          node={node}
                          onPatch={patchNode}
                          onSelect={setSelected}
                          onAdd={addChild}
                          screens={doc.screens}
                          requests={requests}
                          parameters={screen.parameters || {}}
                          forms={nodes(tree).filter(
                            (n) => widgetType(n) === "form",
                          )}
                          components={doc.components}
                          editingId={editingComponent ? componentId : undefined}
                          sharedNavigation={
                            !editingComponent &&
                            doc.navigation?.screenId === screen.id &&
                            navigationBar(doc)?.id === node.id
                          }
                        />
                      )}
                      {inspectorTab === "data" && (
                        <DataBindingPanel
                          users={users}
                          previewUser={previewUser}
                          onPreviewUser={setPreviewUser}
                          onRefreshUsers={() =>
                            run(async () =>
                              setUsers(await api(`/api/apps/${app.id}/users`)),
                            )
                          }
                          node={node}
                          doc={doc}
                          screen={screen}
                          tree={tree}
                          componentId={
                            editingComponent ? componentId : undefined
                          }
                          sample={{
                            ...sample,
                            ...(resolvedData?.appId === app.id &&
                            resolvedData?.screenId === screen.id
                              ? resolvedData.state
                              : {}),
                          }}
                          target={bindingProperty}
                          onTarget={setBindingProperty}
                          onPatch={patchNode}
                          onSelect={setSelected}
                          onManage={manageData}
                          onLoad={loadRecordSample}
                          busy={busy}
                        />
                      )}
                      <div className="inspector-section">
                        <div className="widget-structure-actions">
                          <button
                            type="button"
                            className="secondary"
                            disabled={
                              node.id === tree.id &&
                              widgetType(tree) === "scaffold"
                            }
                            onClick={() =>
                              setModal({ type: "wrap", query: "" })
                            }
                          >
                            Wrap with…
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={widgetType(node) === "component"}
                            onClick={() =>
                              setModal({ type: "replace", query: "" })
                            }
                          >
                            Replace widget…
                          </button>
                        </div>
                        <div className="node-actions">
                          <IconButton
                            title="Move layer up"
                            onClick={() =>
                              changeTree(moveSibling(tree, node.id, -1))
                            }
                          >
                            <ArrowUp size={16} />
                          </IconButton>
                          <IconButton
                            title="Move layer down"
                            onClick={() =>
                              changeTree(moveSibling(tree, node.id, 1))
                            }
                          >
                            <ArrowDown size={16} />
                          </IconButton>
                          <IconButton
                            title="Duplicate widget"
                            disabled={node.id === tree.id}
                            onClick={duplicateSelected}
                          >
                            <Copy size={16} />
                          </IconButton>
                          <IconButton
                            title="Delete widget"
                            disabled={node.id === tree.id}
                            onClick={() => {
                              changeTree(updateNode(tree, node.id, () => null));
                              setSelected(null);
                            }}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
                        {widgetType(node) !== "component" && (
                          <button
                            className="secondary full"
                            onClick={() =>
                              setModal({ type: "create", kind: "extract" })
                            }
                          >
                            <Component size={15} />
                            Create component
                          </button>
                        )}
                      </div>
                    </>
                  ) : entity && !editingComponent ? (
                    <ScreenSetup
                      {...{ doc, screen, change, requests, users, previewUser }}
                      onPreviewUser={setPreviewUser}
                      onSelect={selectLayer}
                      onRefreshUsers={() =>
                        run(async () =>
                          setUsers(await api(`/api/apps/${app.id}/users`)),
                        )
                      }
                      section={inspectorTab}
                      sample={{
                        ...sample,
                        ...(resolvedData?.appId === app.id &&
                        resolvedData?.screenId === screen.id
                          ? resolvedData.state
                          : {}),
                      }}
                      onOpenContent={() => switchTab("data")}
                      onOpenScreen={(id) => {
                        setScreenId(id);
                        setSelected(null);
                        setInspectorTab("design");
                      }}
                    />
                  ) : component ? (
                    <ComponentSetup
                      {...{ doc, component, change }}
                      section={inspectorTab}
                      onSelect={setSelected}
                      onTechnical={() => setModal({ type: "defaults" })}
                      onOpenComponent={(id) => {
                        setComponentId(id);
                        setSelected(null);
                        setInspectorTab("design");
                      }}
                      onOpenScreen={(id) => {
                        setTab("screens");
                        setScreenId(id);
                        setSelected(null);
                        setInspectorTab("design");
                      }}
                    />
                  ) : null}
                </fieldset>
              </aside>
            </div>
          ) : (
            <main className="management-page">
              {["auth", "integrations", "keys", "code", "releases"].includes(
                tab,
              ) && (
                <nav
                  className="section-tabs settings-tabs"
                  aria-label="App settings sections"
                >
                  {nav
                    .filter(([id]) =>
                      [
                        "auth",
                        "integrations",
                        "keys",
                        "code",
                        "releases",
                      ].includes(id),
                    )
                    .map(([id, Icon, label]) => (
                      <button
                        key={id}
                        aria-current={tab === id ? "page" : undefined}
                        onClick={() => switchTab(id)}
                      >
                        <Icon size={16} />
                        {label}
                      </button>
                    ))}
                </nav>
              )}
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {app.name.toUpperCase()} /{" "}
                    {nav.find((n) => n[0] === tab)?.[2].toUpperCase()}
                  </span>
                  <h1>
                    {
                      {
                        data: "Connect content to your screens.",
                        api: "Connect external services.",
                        ai: "Describe your next screen.",
                        code: "Extend your app.",
                        integrations: "Connect your app to the world.",
                        actions: "Reusable database operations.",
                        auth: "Your users. Their own space.",
                        keys: "One connection to your app.",
                        releases: "Ship with confidence.",
                      }[tab]
                    }
                  </h1>
                  <p>
                    {
                      {
                        data: "Connect a database, choose your records, and bring your screens to life.",
                        api: "Save authenticated API endpoints and connect their responses to widgets.",
                        ai: "Use your own OpenAI, Gemini or Claude account.",
                        code: "Dart widgets for your Flutter host and JavaScript for your backend.",
                        integrations:
                          "Payments, OAuth, push notifications and external apps.",
                        actions:
                          "Save database operations here. Add them to a layer’s Interactions or a screen’s opening event. API calls and backend functions are also available directly in those pickers.",
                        auth: "User sessions, verification, and password recovery for your app.",
                        keys: "Connect your Flutter app to published screens with a runtime key.",
                        releases:
                          "Publish immutable versions. Return to an earlier release whenever you need.",
                      }[tab]
                    }
                  </p>
                </div>
                {tab === "data" && (
                  <button
                    className="primary"
                    onClick={() => setModal({ type: "connection" })}
                  >
                    <Plus size={16} />
                    Connect database
                  </button>
                )}
                {tab === "actions" && (
                  <button
                    className="primary"
                    onClick={() => setModal({ type: "action" })}
                  >
                    <Plus size={16} />
                    Create action
                  </button>
                )}
                {tab === "keys" && (
                  <button
                    className="primary"
                    onClick={() => run(() => newKey())}
                  >
                    <Plus size={16} />
                    Create API key
                  </button>
                )}
              </div>
              {tab === "ai" && (
                <AIStudio
                  canEdit={previewSource === "draft"}
                  {...{
                    api,
                    app,
                    doc,
                    change,
                    run,
                    notify,
                    setTab,
                    setScreenId,
                    setComponentId,
                  }}
                />
              )}
              {tab === "code" && (
                <CodeStudio
                  {...{ api, app, run, notify }}
                  onUseFunction={(id) => {
                    change((d) => {
                      const target = d.screens.find((s) => s.id === screen.id);
                      target.public = false;
                      const action = {
                        type: "request",
                        source: `/runtime/functions/${id}`,
                        method: "POST",
                        data: {},
                        resultPath: id.replaceAll("-", "_"),
                        onFailure: {
                          type: "snackbar",
                          message:
                            "Unable to load this content. Please try again.",
                        },
                      };
                      target.onLoad = target.onLoad
                        ? [
                            ...(Array.isArray(target.onLoad)
                              ? target.onLoad
                              : [target.onLoad]),
                            action,
                          ]
                        : action;
                    });
                    setTab("screens");
                    setSelected(null);
                    setInspectorTab("actions");
                    notify(
                      "Opening function added. This screen now requires sign-in. Choose its inputs and response name below.",
                    );
                  }}
                />
              )}
              {tab === "integrations" && (
                <>
                  <IntegrationStatus {...{ api, app }} />
                  <AppIntegrations {...{ api, app, doc, run, notify }} />
                </>
              )}
              {tab === "data" && (
                <>
                  <div className="content-toolbar">
                    <label className="field">
                      <span>Content for screen</span>
                      <select
                        aria-label="Content for screen"
                        value={screen.id}
                        onChange={(e) => setScreenId(e.target.value)}
                      >
                        {doc.screens.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <nav className="section-tabs" aria-label="Content sections">
                      <button
                        aria-pressed={contentSection === "records"}
                        onClick={() => setContentSection("records")}
                      >
                        Database records
                      </button>
                      <button
                        aria-pressed={contentSection === "api"}
                        onClick={() => setContentSection("api")}
                      >
                        API connections
                      </button>
                    </nav>
                    <button
                      className="secondary"
                      onClick={() => {
                        setTab("screens");
                        setSelected(null);
                        setInspectorTab("data");
                      }}
                    >
                      Connect fields to layers
                    </button>
                  </div>
                  <p className="workflow-guide">
                    1. Choose a source → 2. Filter and preview records → 3.
                    Select a layer and connect a field
                  </p>
                  {contentSection === "api" ? (
                    <HttpServicesPanel
                      {...{ api, app, screen, change, run, notify, setSample }}
                    />
                  ) : (
                    <DataPage
                      {...{
                        api,
                        app,
                        doc,
                        connections,
                        screen,
                        change,
                        setModal,
                        run,
                        notify,
                        sample,
                        setSample,
                        save,
                        dirty,
                        users,
                        setUsers,
                        previewUser,
                        setPreviewUser,
                      }}
                      onInsertList={(q) =>
                        openCollection(q, { layout: "list" })
                      }
                      onBuildCollection={(q) =>
                        setModal({ type: "collection", value: q })
                      }
                      onLoadRecords={loadRecordSample}
                    />
                  )}
                </>
              )}
              {tab === "actions" && (
                <>
                  <div className="workflow-guide">
                    <strong>Start with what the user does.</strong>
                    <p>
                      Tap a button, open a screen, submit a form or pull to
                      refresh. Choose that trigger in the screen editor, then
                      add steps. Saved APIs and backend functions appear in the
                      action picker.
                    </p>
                    <button
                      className="secondary"
                      onClick={() => {
                        setTab("screens");
                        setSelected(null);
                        setInspectorTab("actions");
                      }}
                    >
                      Configure when a screen opens
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setTab("screens");
                        setInspectorTab("actions");
                        notify(
                          "Select a button or another interactive layer to add its steps.",
                        );
                      }}
                    >
                      Add a layer interaction
                    </button>
                  </div>
                  <h2 className="section-title">
                    Reusable database operations
                  </h2>
                  <div className="card-list">
                    {doc.actions.map((action) => (
                      <article className="resource-card" key={action.id}>
                        <div className="resource-icon">
                          <Workflow size={22} />
                        </div>
                        <div>
                          <h3>{action.id}</h3>
                          <p>
                            {action.operation.toUpperCase()} · {action.table} ·
                            Owned by current user
                          </p>
                          <code>POST /runtime/actions/{action.id}</code>
                        </div>
                        <div className="card-actions">
                          <button
                            className="secondary"
                            onClick={() =>
                              setModal({ type: "action", value: action })
                            }
                          >
                            Edit action
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              const form = {
                                type: "form",
                                id: uid(),
                                children: [
                                  ...Object.entries(
                                    operationInputs(action).data,
                                  ).map(([name, f]) => ({
                                    type:
                                      f.type === "boolean"
                                        ? "checkbox"
                                        : "input",
                                    id: uid(),
                                    name,
                                    label: title(name),
                                    required: f.required,
                                    keyboardType: [
                                      "number",
                                      "integer",
                                    ].includes(f.type)
                                      ? "number"
                                      : "text",
                                  })),
                                  {
                                    type: "filledButton",
                                    id: uid(),
                                    text: "Save",
                                    action: {
                                      type: "submit",
                                      source: `/runtime/actions/${action.id}`,
                                      onSuccess: { type: "refresh" },
                                    },
                                  },
                                ],
                              };
                              setTab("screens");
                              changeTree(insertInto(screen.tree, null, form));
                              notify("Form added to the selected screen");
                            }}
                          >
                            {action.operation === "delete"
                              ? "Add delete form to screen"
                              : "Add form to screen"}
                          </button>
                          <IconButton
                            title="Delete action"
                            onClick={() =>
                              change((d) => {
                                d.actions = d.actions.filter(
                                  (a) => a.id !== action.id,
                                );
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="info-banner">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>Ownership is always enforced.</strong>
                      <p>
                        Users can only insert, edit, or delete their own
                        records. Filters narrow that scope further.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {tab === "keys" && (
                <>
                  <div className="integration-banner">
                    <div className="integration-art">
                      <Code2 size={32} />
                    </div>
                    <div>
                      <span className="eyebrow">
                        FLUTTER, MEET YOUR BACKEND
                      </span>
                      <h2>Your screens, served dynamically.</h2>
                      <p>
                        Add your base URL and a runtime key to SpaceWidget. Your
                        published app takes it from there.
                      </p>
                      <button
                        className="text-link"
                        onClick={() => setModal({ type: "code" })}
                      >
                        View integration code
                      </button>
                    </div>
                  </div>
                  <div className="table-card">
                    <table>
                      <thead>
                        <tr>
                          <th>KEY NAME</th>
                          <th>RUNTIME KEY</th>
                          <th>STATUS</th>
                          <th>CREATED</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((k) => (
                          <tr key={k.id}>
                            <td>
                              <KeyRound size={16} />
                              {k.label}
                            </td>
                            <td>
                              <code>{k.prefix}</code>
                            </td>
                            <td>
                              <span
                                className={`pill ${k.revoked ? "neutral" : "green"}`}
                              >
                                {k.revoked ? "Revoked" : "Active"}
                              </span>
                            </td>
                            <td>{new Date(k.created).toLocaleDateString()}</td>
                            <td>
                              {!k.revoked && (
                                <>
                                  <button
                                    className="text-link"
                                    onClick={() =>
                                      run(async () => {
                                        const r = await api(
                                          `/api/apps/${app.id}/keys/${k.id}/rotate`,
                                          "POST",
                                          {},
                                        );
                                        setKeys(
                                          await api(`/api/apps/${app.id}/keys`),
                                        );
                                        setModal({ type: "key", value: r.key });
                                      })
                                    }
                                  >
                                    Rotate
                                  </button>
                                  <button
                                    className="danger-text"
                                    onClick={() =>
                                      run(async () => {
                                        await api(
                                          `/api/apps/${app.id}/keys/${k.id}/revoke`,
                                          "POST",
                                          {},
                                        );
                                        setKeys(
                                          await api(`/api/apps/${app.id}/keys`),
                                        );
                                      })
                                    }
                                  >
                                    Revoke
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!keys.length && (
                      <div className="empty-state">
                        <KeyRound size={28} />
                        <h3>Your app’s first connection</h3>
                        <p>Create a runtime key to connect SpaceWidget.</p>
                      </div>
                    )}
                  </div>
                  <p className="page-footnote">
                    Runtime keys identify your app. User sessions control access
                    to private records. New keys are shown only once.
                  </p>
                </>
              )}
              {tab === "releases" && (
                <div className="release-list">
                  {releases.length ? (
                    releases.map((r) => (
                      <article className="release-card" key={r.id}>
                        <span className="release-icon">
                          <Package size={23} />
                        </span>
                        <div>
                          <h3>
                            Version {r.version}
                            {app.published === r.version && (
                              <span className="pill green">Live</span>
                            )}
                          </h3>
                          <p>{new Date(r.created).toLocaleString()}</p>
                          <code>{r.checksum.slice(0, 16)}</code>
                        </div>
                        {app.published !== r.version && (
                          <button
                            className="secondary"
                            onClick={() =>
                              run(async () => {
                                await api(
                                  `/api/apps/${app.id}/releases/${r.version}/activate`,
                                  "POST",
                                  {},
                                );
                                setApp((a) => ({ ...a, published: r.version }));
                                notify(`Version ${r.version} is live`);
                              })
                            }
                          >
                            Activate version
                          </button>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Upload size={30} />
                      <h3>Ready when you are.</h3>
                      <p>
                        Publish your first version to make your screens
                        available to Flutter.
                      </p>
                      <button className="primary" onClick={publish}>
                        Publish first version
                      </button>
                    </div>
                  )}
                </div>
              )}
              {tab === "auth" && (
                <>
                  <div className="auth-overview">
                    <article>
                      <ShieldCheck size={24} />
                      <h3>App authentication</h3>
                      <p>
                        Email/password accounts, short-lived access tokens,
                        rotating refresh tokens, and revocable sessions.
                      </p>
                      <button
                        className="secondary"
                        onClick={() => {
                          setTab("screens");
                          setPalette(true);
                          setSearch("Login");
                        }}
                      >
                        Add authentication UI
                      </button>
                    </article>
                    <article>
                      <Lock size={24} />
                      <h3>Private by ownership</h3>
                      <p>
                        Screen guards and database ownership checks use the
                        verified user identity from every request.
                      </p>
                    </article>
                    <article>
                      <Workflow size={24} />
                      <h3>Recovery & verification</h3>
                      <p>
                        One-use email codes support password recovery and email
                        verification. Configure SMTP on your server for
                        delivery.
                      </p>
                    </article>
                  </div>
                  <SignInSetup
                    doc={doc}
                    change={change}
                    onEdit={(id, nodeId) => {
                      setScreenId(id);
                      setSelected(nodeId);
                      setInspectorTab("actions");
                      setTab("screens");
                    }}
                  />
                  <h2 className="section-title">
                    App users <span>{users.length}</span>
                  </h2>
                  <div className="table-card">
                    <table>
                      <thead>
                        <tr>
                          <th>NAME</th>
                          <th>EMAIL</th>
                          <th>USER ID</th>
                          <th>VERIFIED</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td>{u.name}</td>
                            <td>{u.email}</td>
                            <td>
                              <code>{u.id}</code>
                            </td>
                            <td>{u.verified ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!users.length && (
                      <p className="padded muted">
                        Accounts appear here after users sign up through your
                        app.
                      </p>
                    )}
                  </div>
                  {!!outbox.length && (
                    <>
                      <h2 className="section-title">
                        Development email outbox
                      </h2>
                      <p className="muted">
                        Available only outside production. SMTP delivery
                        replaces this outbox when configured.
                      </p>
                      <div className="card-list">
                        {outbox.map((m) => (
                          <article className="resource-card" key={m.id}>
                            <div>
                              <h3>{m.subject}</h3>
                              <p>{m.to}</p>
                              <code>{m.code}</code>
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </main>
          )}
        </div>
        {toast && (
          <div
            className={`toast ${toast.error ? "error" : ""}`}
            role={toast.error ? "alert" : "status"}
          >
            {toast.error ? <AlertCircle size={17} /> : <Check size={17} />}
            <span>{toast.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast(null)}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {modal && (
          <Modal
            title={
              {
                recovery: "Review recovered draft",
                theme: "App theme",
                wrap: "Wrap selected widget",
                replace: "Replace selected widget",
                create: `Create ${modal.kind === "extract" ? "component" : modal.kind}`,
                connection: "Connect your database",
                query: modal.value ? "Edit data source" : "Connect screen data",
                action: modal.value ? "Edit action" : "Create action",
                node: "Widget definition",
                document: "Screen definition",
                defaults: "Default component properties",
                values: "Component instance properties",
                key: "Your runtime API key",
                code: "Connect your Flutter app",
                sample: "Preview data",
                invite: "Invite a builder",
                invitation: "Builder invitation",
                figma: "Import from Figma",
                collection: "Build a repeated collection",
              }[modal.type]
            }
            onClose={() => setModal(null)}
            wide={["query", "action", "document", "figma"].includes(modal.type)}
          >
            {modal.type === "recovery" && (
              <>
                <p>
                  A recovery copy exists from an older server revision. Download
                  it before continuing; it has not overwritten the newer server
                  draft.
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(modal.value.document, null, 2)],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "recovered-draft.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download recovery copy
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    localStorage.removeItem(recoveryKey(account, modal.appId));
                    setModal(null);
                  }}
                >
                  Keep server draft
                </button>
              </>
            )}
            {modal.type === "theme" && (
              <ThemeEditor
                value={{
                  ...doc.theme,
                  themeMode: doc.themeMode || "light",
                  darkTheme: doc.darkTheme,
                }}
                busy={busy}
                onSubmit={(config) => {
                  change((d) => {
                    const { themeMode, darkTheme, ...theme } = config;
                    d.theme = theme;
                    d.themeMode = themeMode;
                    if (darkTheme) d.darkTheme = darkTheme;
                    else delete d.darkTheme;
                  });
                  setModal(null);
                }}
              />
            )}
            {["wrap", "replace"].includes(modal.type) && node && (
              <>
                <p className="help-copy">
                  Your existing layer and compatible settings are preserved.
                  Undo is available.
                </p>
                <WidgetList
                  compact
                  query={modal.query || ""}
                  setQuery={(query) => setModal((m) => ({ ...m, query }))}
                  options={widgetOptions().filter((option) => {
                    const location = nodeLocation(tree, node.id);
                    if (modal.type === "wrap")
                      return (
                        wrapperTypes.has(option.value) &&
                        !!location &&
                        (location.parent
                          ? canPlace(
                              option.value,
                              widgetType(location.parent),
                              location.slot,
                            )
                          : widgetType(tree) !== "scaffold") &&
                        canPlace(
                          widgetType(node),
                          option.value,
                          widgetCatalog[option.value]?.slot,
                        )
                      );
                    return (
                      option.value !== widgetType(node) &&
                      (location?.parent
                        ? canPlace(
                            option.value,
                            widgetType(location.parent),
                            location.slot,
                          )
                        : widgetType(tree) !== "scaffold" ||
                          option.value === "scaffold")
                    );
                  })}
                  onChoose={(type) =>
                    structural(() => {
                      if (modal.type === "wrap") {
                        const result = wrapWidget(tree, node.id, type);
                        changeTree(result.tree);
                        setSelected(result.id);
                      } else changeTree(replaceWidget(tree, node.id, type));
                      setModal(null);
                    })
                  }
                />
              </>
            )}
            {modal.type === "figma" && (
              <FigmaImport
                initial={modal.initial}
                onImport={importFigma}
                currentName={entity?.name}
                editingComponent={editingComponent}
              />
            )}
            {modal.type === "invite" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const email = new FormData(e.currentTarget).get("email");
                  run(async () => {
                    const invitation = await api("/api/invites", "POST", {
                      email,
                    });
                    setModal({ type: "invitation", value: invitation.url });
                  });
                }}
              >
                <p className="muted">
                  Invite a builder to create their own apps on this server. Each
                  account has an isolated workspace.
                </p>
                <Field label="Builder email">
                  <input name="email" type="email" required />
                </Field>
                <button className="primary">Create invitation</button>
              </form>
            )}
            {modal.type === "invitation" && (
              <>
                <p className="muted">
                  Share this link with the invited builder. It expires in 72
                  hours and can be used once, with their invited email address.
                </p>
                <div className="secret-key">
                  <code>{modal.value}</code>
                  <IconButton
                    title="Copy invitation"
                    onClick={() => copy(modal.value)}
                  >
                    <Copy size={16} />
                  </IconButton>
                </div>
              </>
            )}
            {modal.type === "create" && (
              <CreateForm
                kind={modal.kind}
                busy={busy}
                onSubmit={(name, config) =>
                  run(async () => {
                    if (modal.kind === "app") {
                      const result = await api("/api/apps", "POST", {
                        name,
                        ...config,
                      });
                      setApps(await api("/api/apps"));
                      await openApp(result.id);
                    } else {
                      const collection =
                        modal.kind === "screen" ? doc.screens : doc.components;
                      const newId = slug(name);
                      if (collection.some((x) => x.id === newId))
                        throw new Error(
                          "This ID already exists. Choose another name.",
                        );
                      if (modal.kind === "screen") {
                        const root = {
                          type: "scaffold",
                          id: uid(),
                          appBar: { type: "appBar", id: uid(), title: name },
                          body: {
                            type: "listView",
                            id: uid(),
                            padding: 24,
                            children: [],
                          },
                        };
                        change((d) => {
                          d.screens.push({
                            id: newId,
                            name,
                            public: true,
                            state: {},
                            queries: [],
                            tree: root,
                          });
                        });
                        setScreenId(newId);
                        setTab("screens");
                      } else {
                        const root = widget("container");
                        change((d) => {
                          if (modal.kind === "extract") {
                            Object.assign(
                              d,
                              extractComponent(d, {
                                componentId: editingComponent
                                  ? componentId
                                  : undefined,
                                screenId: screen.id,
                                nodeId: node.id,
                                id: newId,
                                name,
                              }),
                            );
                          } else
                            d.components.push({
                              id: newId,
                              name,
                              defaults: {},
                              tree: root,
                            });
                        });
                        setComponentId(newId);
                        if (modal.kind !== "extract") setTab("components");
                      }
                      setSelected(null);
                    }
                    setModal(null);
                  })
                }
              />
            )}
            {modal.type === "connection" && (
              <ConnectionForm
                api={api}
                app={app}
                busy={busy}
                onSubmit={(values) =>
                  run(async () => {
                    await api(
                      `/api/apps/${app.id}/connections`,
                      "POST",
                      values,
                    );
                    setConnections(
                      await api(`/api/apps/${app.id}/connections`),
                    );
                    setModal(null);
                    notify("Database connected");
                  })
                }
              />
            )}
            {modal.type === "collection" && (
              <CollectionBuilder
                query={modal.value}
                onSubmit={(options) => openCollection(modal.value, options)}
              />
            )}
            {modal.type === "query" && (
              <QueryBuilder
                initial={modal.value}
                {...{ api, app, connections }}
                parameters={screen.parameters || {}}
                reservedNames={[
                  ...screen.queries,
                  ...(screen.httpQueries || []),
                ].map((q) => q.id)}
                onSubmit={(q) => {
                  change((d) => {
                    const s = d.screens.find((s) => s.id === screen.id);
                    s.queries = [
                      ...s.queries.filter((x) => x.id !== modal.value?.id),
                      q,
                    ];
                    if (q.scope === "user") s.public = false;
                  });
                  setModal(null);
                  notify(
                    "Data source added. Save and publish to update the API.",
                  );
                }}
              />
            )}
            {modal.type === "action" && (
              <DatabaseOperationBuilder
                initial={modal.value}
                {...{ api, app, connections }}
                existingNames={doc.actions.map((a) => a.id)}
                onSubmit={(value) => {
                  change((d) => {
                    d.actions = [
                      ...d.actions.filter((a) => a.id !== modal.value?.id),
                      value,
                    ];
                  });
                  setModal(null);
                }}
              />
            )}
            {["node", "document", "defaults", "values", "sample"].includes(
              modal.type,
            ) && (
              <JsonEditor
                initial={
                  modal.type === "node"
                    ? node
                    : modal.type === "document"
                      ? entity.tree
                      : modal.type === "defaults"
                        ? component.defaults
                        : modal.type === "values"
                          ? node.values
                          : sample
                }
                onApply={(value) => {
                  if (modal.type === "sample") setSample(value);
                  else if (modal.type === "node")
                    changeTree(
                      updateNode(tree, node.id, () =>
                        hydrate(
                          {
                            ...value,
                            id: node.id,
                          },
                          catalog,
                        ),
                      ),
                    );
                  else if (modal.type === "document")
                    changeTree(hydrate(value, catalog));
                  else if (modal.type === "defaults")
                    change((d) => {
                      d.components.find((c) => c.id === componentId).defaults =
                        value;
                    });
                  else patchNode({ values: value });
                  setModal(null);
                }}
              />
            )}
            {["key", "code"].includes(modal.type) && (
              <>
                <p className="muted">
                  {modal.type === "key"
                    ? "Copy this key now. It will not be shown again."
                    : "Create a runtime key in App settings → Connect app."}
                </p>
                {modal.value && (
                  <div className="secret-key">
                    <code>{modal.value}</code>
                    <IconButton
                      title="Copy runtime key"
                      onClick={() => copy(modal.value)}
                    >
                      <Copy size={16} />
                    </IconButton>
                  </div>
                )}
                <pre className="integration-code">{`import 'package:spacewidget_adapters/spacewidget_adapters.dart';\n\nvoid main() => runApp(SpaceHostedApp(\n  baseUrl: '${window.location.origin}',\n  apiKey: '${modal.value || "YOUR_RUNTIME_KEY"}',\n));`}</pre>
                <button
                  className="secondary"
                  onClick={() =>
                    copy(
                      `SpaceHostedApp(baseUrl: '${window.location.origin}', apiKey: '${modal.value || "YOUR_RUNTIME_KEY"}')`,
                    )
                  }
                >
                  <Copy size={15} />
                  Copy configuration
                </button>
                <p className="help-copy">
                  After publishing, reload your connected app to fetch the
                  latest screen JSON. Compare at the same window size as
                  Studio’s Flutter viewport.
                </p>
                <div className="info-note">
                  <ShieldCheck size={18} />
                  <p>
                    One app key. Separate user sessions.
                    <small>
                      Private screens require sign-in. Database credentials stay
                      on your server.
                    </small>
                  </p>
                </div>
              </>
            )}
          </Modal>
        )}
      </div>
    </MappingContext.Provider>
  );
}

function CreateForm({ kind, onSubmit, busy }) {
  const [name, setName] = useState(""),
    [template, setTemplate] = useState("blank");
  if (kind === "app")
    return (
      <>
        <label className="field">
          <span>Starting template</span>
          <select
            aria-label="Starting template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="blank">Blank app · start with a clean screen</option>
            <option value="starter">Basic app · sample screens and data</option>
            <option value="commerce">
              E-commerce · shop, cart, orders & account
            </option>
          </select>
          <small>
            Commerce includes server-owned order totals, stock and payment
            confirmation. Configure live providers on the server.
          </small>
        </label>
        <ThemeEditor
          value={DEFAULT_THEME}
          busy={busy}
          creating
          name={name}
          onName={setName}
          onSubmit={({ themeMode, darkTheme, ...theme }) =>
            onSubmit(name, { theme, themeMode, darkTheme, template })
          }
        />
      </>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget).get("name"));
      }}
    >
      <p className="muted">
        {kind === "app"
          ? "Start with Main, Profile and Sign in screens, plus a connected demo database."
          : kind === "screen"
            ? "Give your new screen a name. You can start adding widgets right away."
            : "Build once and reuse across your screens."}
      </p>
      <Field label="Name">
        <input
          autoFocus
          name="name"
          required
          maxLength={100}
          placeholder={
            kind === "app"
              ? "My next app"
              : kind === "screen"
                ? "Settings"
                : "Profile header"
          }
        />
      </Field>
      <button className="primary" disabled={busy}>
        Create {kind === "extract" ? "component" : kind}
      </button>
    </form>
  );
}
function ResizeHandle({ label, value, onChange, min, max, reverse = false }) {
  const drag = useRef();
  return (
    <div
      className={`panel-resizer ${reverse ? "right-resizer" : "left-resizer"}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          onChange(
            Math.max(
              min,
              Math.min(
                max,
                value +
                  (e.key === "ArrowRight" ? 16 : -16) * (reverse ? -1 : 1),
              ),
            ),
          );
        }
      }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, value };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current)
          onChange(
            Math.max(
              min,
              Math.min(
                max,
                drag.current.value +
                  (e.clientX - drag.current.x) * (reverse ? -1 : 1),
              ),
            ),
          );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}
function LayerTree({ tree, selected, onSelect, onMove, onAdd, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!tree || typeof tree !== "object") return null;
  if (Array.isArray(tree))
    return tree.map((n, i) => (
      <LayerTree
        key={n?.id || i}
        {...{ selected, onSelect, onMove, onAdd, depth }}
        tree={n}
      />
    ));
  const isNode = isWidget(tree) && typeof tree.id === "string";
  const children = Object.entries(tree).filter(
    ([, v]) => v && typeof v === "object",
  );
  const hasChildren = children.some(([, v]) => nodes(v).length > 0);
  return (
    <>
      {isNode && (
        <div className="layer-row" style={{ paddingLeft: 8 + depth * 14 }}>
          <button
            type="button"
            className="layer-toggle"
            disabled={!hasChildren}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${tree.labelName || tree.componentId || title(widgetType(tree))}`}
            aria-expanded={hasChildren ? !collapsed : undefined}
            onClick={() => setCollapsed(!collapsed)}
          >
            {hasChildren &&
              (collapsed ? (
                <ChevronRight size={12} />
              ) : (
                <ChevronDown size={12} />
              ))}
          </button>
          <button
            type="button"
            data-node-id={tree.id}
            aria-pressed={selected === tree.id}
            className={`layer ${selected === tree.id ? "selected" : ""}`}
            draggable={depth > 0}
            onDragStart={(e) => {
              e.dataTransfer.setData("application/spacewidget-node", tree.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (
                !e.dataTransfer.types.includes(
                  "application/spacewidget-node",
                ) &&
                !e.dataTransfer.types.includes("application/spacewidget")
              )
                return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect(),
                y = (e.clientY - rect.top) / rect.height;
              e.currentTarget.dataset.drop = !widgetCatalog[widgetType(tree)]
                ?.slot
                ? y < 0.5
                  ? "before"
                  : "after"
                : y < 0.25
                  ? "before"
                  : y > 0.75
                    ? "after"
                    : "inside";
            }}
            onDragLeave={(e) => delete e.currentTarget.dataset.drop}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const type = e.dataTransfer.getData("application/spacewidget");
              (type ? onAdd : onMove)?.(
                type || e.dataTransfer.getData("application/spacewidget-node"),
                tree.id,
                e.currentTarget.dataset.drop || "inside",
              );
              delete e.currentTarget.dataset.drop;
            }}
            onClick={() => onSelect(tree.id)}
          >
            {tree.type === "component" ? (
              <Component size={14} />
            ) : tree.type === "text" ? (
              <Type size={14} />
            ) : (
              <Square size={14} />
            )}
            <span>
              {tree.labelName || tree.componentId || title(widgetType(tree))}
            </span>
            {tree.type === "component" && (
              <span className="layer-component">◇</span>
            )}
          </button>
        </div>
      )}
      {!collapsed &&
        children.map(([key, v]) => (
          <LayerTree
            key={key}
            tree={v}
            {...{ selected, onSelect, onMove, onAdd }}
            depth={depth + (isNode ? 1 : 0)}
          />
        ))}
    </>
  );
}

function ConnectionForm({ onSubmit, busy, api, app }) {
  const [environment, setEnvironment] = useState(false),
    [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    api(`/api/apps/${app.id}/integrations`)
      .then((status) => {
        if (active) {
          setAvailable(status.database);
          setEnvironment(status.database);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [app.id]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.currentTarget));
        onSubmit(
          environment
            ? { name: v.name, kind: "postgres", env: "APP_DATABASE_URL" }
            : { ...v, kind: "postgres", tls: v.tls === "on" },
        );
      }}
    >
      <p className="muted">
        Connect PostgreSQL with a dedicated database role. Database credentials
        stay on your server.
      </p>
      <Field label="Connection name">
        <input name="name" required placeholder="Production database" />
      </Field>
      <Field label="Connection settings">
        <select
          aria-label="Connection settings"
          value={environment ? "env" : "manual"}
          onChange={(e) => setEnvironment(e.target.value === "env")}
        >
          <option value="manual">Enter connection details</option>
          <option value="env">
            Use APP_DATABASE_URL from server environment
          </option>
        </select>
      </Field>
      {environment ? (
        <p className="info-note">
          {available
            ? "Server environment database is configured. Test the connection to browse its tables."
            : "Set APP_DATABASE_URL in studio/.env, then restart Studio. Use STUDIO_DB_HOSTS to approve its hostname. Your URL is never sent to the browser."}
        </p>
      ) : (
        <>
          <Field label="PostgreSQL connection URL">
            <input
              type="password"
              name="url"
              required
              placeholder="postgresql://user:password@host:5432/database"
              autoComplete="off"
            />
          </Field>
          <label className="check-field">
            <input name="tls" type="checkbox" defaultChecked />
            Verify TLS certificate
          </label>
          <Field label="Custom CA certificate (optional)">
            <textarea
              name="ca"
              rows={3}
              placeholder="-----BEGIN CERTIFICATE-----"
            />
          </Field>
        </>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Connecting…" : "Test and connect"}
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
