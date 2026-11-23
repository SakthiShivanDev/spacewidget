import { widgetCatalog } from "./widget-catalog.js";
import { resolveScreen } from "../shared/screens.mjs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Maximize,
  RefreshCw,
  AlertCircle,
  Undo2,
  Redo2,
  Plus,
  PanelLeft,
  PanelRight,
} from "lucide-react";

const DEVICES = {
  phone: [390, 844],
  android: [412, 915],
  tablet: [768, 1024],
  desktop: [1280, 800],
};
export function FlutterCanvas({
  api,
  appId,
  document: doc,
  screenId,
  componentId,
  overlayId,
  onCloseOverlay,
  sample,
  selected,
  selectionVersion,
  onSelect,
  onAdd,
  onMove,
  name,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onInsert,
  onLayers,
  onInspector,
  onResize,
  resizeWidth,
  resizeHeight,
  viewport,
  previewSource = "draft",
  onPreviewSource,
  publishedVersion,
  draftRevision,
  previewUser,
  onResolvedData,
}) {
  const [device, setDevice] = useState("phone"),
    [width, setWidth] = useState(390),
    [height, setHeight] = useState(844);
  useEffect(() => {
    if (!viewport) return;
    setDevice("custom");
    setWidth(Math.max(1, Math.min(8192, viewport.width)));
    setHeight(Math.max(1, Math.min(8192, viewport.height)));
    setAutoFit(true);
  }, [viewport]);
  const [zoom, setZoom] = useState(0.75),
    [autoFit, setAutoFit] = useState(true),
    [mode, setMode] = useState("edit");
  let contentScreen;
  try {
    contentScreen = resolveScreen(doc, screenId);
  } catch {
    contentScreen = null;
  }
  const preferredDataMode =
    previewSource === "published" ||
    contentScreen?.queries?.length ||
    contentScreen?.httpQueries?.length ||
    contentScreen?.loader
      ? "database"
      : "sample";
  const dataChoice = useRef({ scope: null, manual: false });
  const [dataMode, setDataMode] = useState(preferredDataMode);
  useEffect(() => {
    const scope = `${appId}:${screenId}:${componentId || ""}`;
    if (dataChoice.current.scope !== scope)
      dataChoice.current = { scope, manual: false };
    if (!dataChoice.current.manual) setDataMode(preferredDataMode);
  }, [appId, screenId, componentId, preferredDataMode]);
  const [previewWarnings, setPreviewWarnings] = useState([]);
  const [status, setStatus] = useState("loading"),
    [error, setError] = useState(""),
    [issues, setIssues] = useState([]),
    [showIssues, setShowIssues] = useState(false);
  const [src, setSrc] = useState(null),
    [reload, setReload] = useState(0),
    [reset, setReset] = useState(0),
    [boxes, setBoxes] = useState([]),
    [hover, setHover] = useState(null),
    [runScreen, setRunScreen] = useState(null),
    [resizing, setResizing] = useState(null);
  const frame = useRef(),
    area = useRef(),
    resize = useRef(),
    dragNode = useRef(),
    current = useRef({}),
    sequence = useRef(0),
    ready = useRef(false),
    pending = useRef(null),
    bootTimer = useRef(),
    renderTimer = useRef();
  current.current = {
    api,
    appId,
    doc,
    screenId,
    componentId,
    sample,
    mode,
    reset,
    previewSource,
    dataMode,
    userId: previewUser,
    onResolvedData,
  };
  const post = useCallback(
    (message) =>
      frame.current?.contentWindow?.postMessage(
        message,
        window.location.origin,
      ),
    [],
  );
  const fail = useCallback((message) => {
    setStatus("error");
    setError(message);
  }, []);
  const send = useCallback(() => {
    if (!ready.current || !pending.current) return;
    setStatus("rendering");
    post({
      type: "spacewidget-preview",
      ...pending.current,
      reset: current.current.reset,
    });
    post({ type: "spacewidget-preview-controls", mode: current.current.mode });
    clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(
      () =>
        fail(
          "Flutter has not acknowledged this update. Reload the preview to reconnect.",
        ),
      20000,
    );
  }, [post, fail]);
  useEffect(() => {
    const abort = new AbortController();
    ready.current = false;
    setSrc(null);
    setError("");
    setIssues([]);
    setStatus("loading");
    fetch(`/flutter-preview/flutter_bootstrap.js?studio=${Date.now()}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !(response.headers.get("content-type") || "").match(
            /javascript|ecmascript/,
          )
        )
          throw new Error(
            "Flutter preview assets are unavailable. Build the preview with npm run preview:build, then restart Studio. The server must serve Flutter JavaScript at /flutter-preview/.",
          );
        setSrc(`/flutter-preview/?studio=${Date.now()}`);
        bootTimer.current = setTimeout(
          () =>
            fail(
              "Flutter took too long to start. Check the preview build and network connection, then reload.",
            ),
          45000,
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") fail(e.message);
      });
    return () => {
      abort.abort();
      clearTimeout(bootTimer.current);
      clearTimeout(renderTimer.current);
    };
  }, [reload, fail]);
  useEffect(() => {
    const generation = ++sequence.current,
      abort = new AbortController();
    setError("");
    setIssues([]);
    if (ready.current) setStatus("updating");
    const timer = setTimeout(async () => {
      try {
        const result = await api(
          `/api/apps/${appId}/preview`,
          "POST",
          {
            document: doc,
            screenId,
            componentId,
            overlayId,
            sampleState: sample,
            source: previewSource,
            dataMode,
            userId: previewUser,
          },
          {},
          { signal: abort.signal },
        );
        if (generation !== sequence.current || abort.signal.aborted) return;
        setPreviewWarnings(result.preview?.warnings || []);
        current.current.onResolvedData?.(result.state || {});
        pending.current = { document: result, revision: generation };
        send();
      } catch (e) {
        if (e.name !== "AbortError" && generation === sequence.current)
          fail(e.message);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      abort.abort();
      clearTimeout(renderTimer.current);
    };
  }, [
    api,
    appId,
    doc,
    screenId,
    componentId,
    overlayId,
    sample,
    send,
    previewSource,
    dataMode,
    previewUser,
    publishedVersion,
  ]);
  useEffect(() => {
    setBoxes([]);
    setHover(null);
    setRunScreen(null);
  }, [appId, screenId, componentId, overlayId]);
  useEffect(() => {
    setMode("edit");
  }, [selectionVersion]);
  useEffect(() => {
    post({ type: "spacewidget-preview-controls", mode });
    setHover(null);
    if (mode === "edit") setRunScreen(null);
  }, [mode, post]);
  useEffect(() => {
    if (reset) send();
  }, [reset, send]);
  useEffect(() => {
    const receive = async (event) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "spacewidget-preview-shortcut") {
        if (
          typeof message.key !== "string" ||
          !["s", "z", "y", "d", "delete", "backspace", "escape"].includes(
            message.key.toLowerCase(),
          )
        )
          return;
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: message.key,
            ctrlKey: message.ctrlKey === true,
            metaKey: message.metaKey === true,
            shiftKey: message.shiftKey === true,
          }),
        );
        return;
      }
      if (message.type === "spacewidget-preview-ready") {
        if (message.protocol !== 2) {
          fail(
            "This Flutter preview build is outdated. Run npm run preview:build and reload the preview.",
          );
          clearTimeout(bootTimer.current);
          return;
        }
        ready.current = true;
        clearTimeout(bootTimer.current);
        send();
        return;
      }
      if (message.type === "spacewidget-preview-request") {
        const snapshot = current.current;
        try {
          const target = /^\/runtime\/screens\/([a-z][a-z0-9_-]*)$/.exec(
            message.source || "",
          )?.[1];
          if (
            !target ||
            (snapshot.mode !== "run" && target !== snapshot.screenId) ||
            (snapshot.previewSource !== "published" &&
              !snapshot.doc.screens.some((s) => s.id === target))
          )
            throw new Error(
              "This screen is not available in the draft preview.",
            );
          const result = await snapshot.api(
            `/api/apps/${snapshot.appId}/preview`,
            "POST",
            {
              document: snapshot.doc,
              screenId: target,
              sampleState: snapshot.sample,
              source: snapshot.previewSource,
              dataMode: snapshot.dataMode,
              userId: snapshot.userId,
              query: message.query || {},
            },
          );
          if (
            snapshot.appId !== current.current.appId ||
            snapshot.doc !== current.current.doc ||
            snapshot.previewSource !== current.current.previewSource ||
            snapshot.dataMode !== current.current.dataMode ||
            snapshot.userId !== current.current.userId ||
            snapshot.mode !== current.current.mode ||
            message.revision !== pending.current?.revision
          )
            throw new Error(
              "The draft changed. Refresh the latest preview again.",
            );
          post({
            type: "spacewidget-preview-response",
            requestId: message.requestId,
            document: result,
          });
          if (target !== snapshot.screenId) setRunScreen(target);
        } catch (e) {
          post({
            type: "spacewidget-preview-response",
            requestId: message.requestId,
            error: e.message,
          });
        }
        return;
      }
      if (message.revision !== sequence.current) return;
      if (message.type === "spacewidget-preview-rendered") {
        clearTimeout(renderTimer.current);
        setStatus("ready");
        setError("");
      }
      if (
        message.type === "spacewidget-preview-geometry" &&
        Array.isArray(message.nodes)
      ) {
        if (previewSource === "published") {
          setBoxes([]);
          return;
        }
        const sources = pending.current?.document?.sourceMap || {};
        setBoxes(
          message.nodes
            .filter(
              (b) =>
                b &&
                typeof b.id === "string" &&
                [b.x, b.y, b.width, b.height].every(Number.isFinite),
            )
            .map((b) => ({ ...b, nodeId: sources[b.id]?.nodeId || b.id })),
        );
      }
      if (message.type === "spacewidget-preview-error")
        setIssues((list) =>
          [
            ...list.filter(
              (i) => i.message !== message.message || i.path !== message.path,
            ),
            {
              message: String(message.message),
              path: String(message.path || "$"),
            },
          ].slice(-20),
        );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [post, send, fail, previewSource]);
  useEffect(() => {
    const element = area.current;
    if (!autoFit || !element) return;
    let active = true;
    const fit = () => {
      if (!active || !element.isConnected) return;
      setZoom(
        Math.min(
          1,
          Math.max(
            0.15,
            Math.min(
              (element.clientWidth - 96) / width,
              (element.clientHeight - 180) / height,
            ),
          ),
        ),
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [width, height, autoFit]);
  useEffect(() => {
    const element = area.current;
    const wheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setAutoFit(false);
        setZoom((z) => Math.max(0.05, Math.min(2, z - e.deltaY * 0.002)));
      } else if (mode === "edit" && e.target.closest?.(".flutter-edit-overlay"))
        e.preventDefault();
    };
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => element?.removeEventListener("wheel", wheel);
  }, [mode]);
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.("input,textarea,select,[contenteditable=true]"))
        return;
      if (e.key.toLowerCase() === "v") setMode("edit");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const hit = (event, containerOnly = false) => {
    const rect = event.currentTarget.getBoundingClientRect(),
      x = ((event.clientX - rect.left) * width) / rect.width,
      y = ((event.clientY - rect.top) * height) / rect.height;
    return boxes
      .filter(
        (b) =>
          (!containerOnly || widgetCatalog[b.widgetType]?.slot) &&
          x >= b.x &&
          y >= b.y &&
          x <= b.x + b.width &&
          y <= b.y + b.height,
      )
      .sort(
        (a, b) =>
          a.width * a.height - b.width * b.height ||
          b.path.length - a.path.length,
      )[0];
  };
  const dropAt = (event) => {
    const box = hit(event);
    if (!box) return { target: undefined, position: "inside" };
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / zoom,
      fraction = (y - box.y) / box.height;
    const position = !widgetCatalog[box.widgetType]?.slot
      ? fraction < 0.5
        ? "before"
        : "after"
      : fraction < 0.25
        ? "before"
        : fraction > 0.75
          ? "after"
          : "inside";
    return { target: box.nodeId, position, box };
  };
  const selectedBoxes = boxes.filter((b) => b.nodeId === selected);
  const setScale = (value) => {
    setAutoFit(false);
    setZoom(Math.max(0.05, Math.min(2, value)));
  };
  const outline = (box, className, key) => {
    const active =
      resizing?.nodeId === box.nodeId
        ? { ...box, width: resizing.width, height: resizing.height }
        : box;
    return (
      <div
        key={key}
        className={className}
        style={{
          left: active.x,
          top: active.y,
          width: active.width,
          height: active.height,
        }}
      >
        <span>
          {box.dropPosition
            ? `${box.dropPosition === "inside" ? "Add inside" : `Insert ${box.dropPosition}`} · `
            : ""}
          {box.widgetType}
          {resizing?.nodeId === box.nodeId
            ? ` · ${Math.round(active.width)} × ${Math.round(active.height)}`
            : ""}
        </span>
        {className.includes("selected") && (
          <>
            <i />
            <i />
            <i />
            <i />
            {(resizeWidth || resizeHeight) && (
              <button
                type="button"
                className="canvas-resize-handle"
                aria-label="Resize selected widget"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  resize.current = {
                    x: e.clientX,
                    y: e.clientY,
                    width: box.width,
                    height: box.height,
                    nodeId: box.nodeId,
                  };
                  setResizing(resize.current);
                }}
                onPointerMove={(e) => {
                  if (!resize.current) return;
                  const value = {
                    ...resize.current,
                    width: resizeWidth
                      ? Math.max(
                          1,
                          Math.round(
                            resize.current.width +
                              (e.clientX - resize.current.x) / zoom,
                          ),
                        )
                      : box.width,
                    height: resizeHeight
                      ? Math.max(
                          1,
                          Math.round(
                            resize.current.height +
                              (e.clientY - resize.current.y) / zoom,
                          ),
                        )
                      : box.height,
                  };
                  setResizing(value);
                }}
                onPointerUp={(e) => {
                  if (!resize.current) return;
                  const value = {
                    ...(resizeWidth
                      ? {
                          width: Math.max(
                            1,
                            Math.round(
                              resize.current.width +
                                (e.clientX - resize.current.x) / zoom,
                            ),
                          ),
                        }
                      : {}),
                    ...(resizeHeight
                      ? {
                          height: Math.max(
                            1,
                            Math.round(
                              resize.current.height +
                                (e.clientY - resize.current.y) / zoom,
                            ),
                          ),
                        }
                      : {}),
                  };
                  resize.current = null;
                  setResizing(null);
                  onResize(value);
                }}
                onPointerCancel={() => {
                  resize.current = null;
                  setResizing(null);
                }}
              />
            )}
          </>
        )}
      </div>
    );
  };
  return (
    <main className="canvas-workspace flutter-workspace">
      <div className="preview-context-bar">
        {overlayId && (
          <button type="button" className="secondary" onClick={onCloseOverlay}>
            Back to screen
          </button>
        )}
        <div
          className="preview-source-switch"
          role="group"
          aria-label="Preview version"
        >
          <button
            type="button"
            className={previewSource === "draft" ? "active" : ""}
            aria-pressed={previewSource === "draft"}
            onClick={() => onPreviewSource?.("draft")}
          >
            Draft <span>r{draftRevision}</span>
          </button>
          <button
            type="button"
            className={previewSource === "published" ? "active" : ""}
            aria-pressed={previewSource === "published"}
            disabled={!publishedVersion}
            onClick={() => {
              setDataMode("database");
              onPreviewSource?.("published");
            }}
          >
            Published app{" "}
            <span>
              {publishedVersion ? `v${publishedVersion}` : "Not published"}
            </span>
          </button>
        </div>
        <label className="preview-data-mode">
          Preview data{" "}
          <select
            aria-label="Preview data source"
            value={dataMode}
            onChange={(e) => {
              dataChoice.current.manual = true;
              setDataMode(e.target.value);
            }}
          >
            <option value="sample">Sample content</option>
            <option value="database">Live content</option>
          </select>
        </label>
        <span className="preview-version-help">
          {previewSource === "published"
            ? "Read-only · matches the live app version"
            : "Editing draft · publish, then reload app"}
        </span>
      </div>
      <header className="canvas-toolbar">
        <div className="canvas-breadcrumb">
          <Smartphone size={16} />
          <strong>{name || "Untitled"}</strong>
          {componentId && <span>Component</span>}
        </div>
        <div className="viewport-controls">
          <select
            aria-label="Preview device"
            value={device}
            onChange={(e) => {
              const key = e.target.value;
              setDevice(key);
              if (DEVICES[key]) {
                setWidth(DEVICES[key][0]);
                setHeight(DEVICES[key][1]);
              }
              setAutoFit(true);
            }}
          >
            <option value="phone">iPhone · 390 × 844</option>
            <option value="android">Android · 412 × 915</option>
            <option value="tablet">Tablet · 768 × 1024</option>
            <option value="desktop">Desktop · 1280 × 800</option>
            <option value="custom">Custom size</option>
          </select>
          {device === "custom" && (
            <>
              <input
                aria-label="Preview width"
                type="number"
                min="1"
                max="8192"
                value={width}
                onChange={(e) =>
                  setWidth(
                    Math.max(1, Math.min(8192, Number(e.target.value) || 1)),
                  )
                }
              />
              <span>×</span>
              <input
                aria-label="Preview height"
                type="number"
                min="1"
                max="8192"
                value={height}
                onChange={(e) =>
                  setHeight(
                    Math.max(1, Math.min(8192, Number(e.target.value) || 1)),
                  )
                }
              />
            </>
          )}
        </div>
        <div className="canvas-history">
          <button
            type="button"
            aria-label="Toggle layers panel"
            onClick={onLayers}
          >
            <PanelLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Toggle properties panel"
            onClick={onInspector}
          >
            <PanelRight size={16} />
          </button>
          <button
            type="button"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            aria-label="Reload Flutter preview"
            onClick={() => {
              setBoxes([]);
              setReload((n) => n + 1);
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>
      <div
        className="canvas-area flutter-canvas-area"
        ref={area}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        <div
          className="flutter-stage"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = e.dataTransfer.types.includes(
              "application/spacewidget-node",
            )
              ? "move"
              : "copy";
          }}
          onDrop={(e) => {
            if (mode !== "edit" || e.target.closest(".flutter-edit-overlay"))
              return;
            e.preventDefault();
            const type = e.dataTransfer.getData("application/spacewidget");
            if (type) onAdd(type);
          }}
        >
          <div
            className="artboard-shell"
            style={{ width: width * zoom, height: height * zoom }}
          >
            <div className="artboard-label">
              <span>{runScreen ? `Running /${runScreen}` : name}</span>
              <span>
                {width} × {height}
              </span>
            </div>
            <div
              className="flutter-artboard"
              style={{ width, height, transform: `scale(${zoom})` }}
            >
              {src && (
                <iframe
                  title="Live Flutter preview"
                  data-ready={status === "ready"}
                  src={src}
                  ref={frame}
                  allow="autoplay"
                />
              )}
              {mode === "edit" && status !== "error" && (
                <div
                  className="flutter-edit-overlay"
                  draggable={!!selected}
                  onDragStart={(e) => {
                    if (!dragNode.current) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData(
                      "application/spacewidget-node",
                      dragNode.current,
                    );
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  aria-label="Flutter editing canvas"
                  onDoubleClick={() => {
                    setMode("run");
                    setHover(null);
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    dragNode.current = hit(e)?.nodeId;
                    onSelect(dragNode.current || null);
                  }}
                  onPointerMove={(e) => setHover(hit(e))}
                  onPointerLeave={() => setHover(null)}
                  onWheel={(e) => {
                    e.stopPropagation();
                    if (e.ctrlKey || e.metaKey) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    post({
                      type: "spacewidget-preview-scroll",
                      x: (e.clientX - rect.left) / zoom,
                      y: (e.clientY - rect.top) / zoom,
                      dx: e.deltaX,
                      dy: e.deltaY,
                    });
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const drop = dropAt(e);
                    setHover(
                      drop.box
                        ? { ...drop.box, dropPosition: drop.position }
                        : null,
                    );
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const type = e.dataTransfer.getData(
                        "application/spacewidget",
                      ),
                      id = e.dataTransfer.getData(
                        "application/spacewidget-node",
                      ),
                      { target, position } = dropAt(e);
                    if (type) onAdd(type, target, position);
                    else if (id) onMove(id, target, position);
                    setHover(null);
                  }}
                />
              )}
              {mode === "edit" &&
                hover &&
                hover.nodeId !== selected &&
                outline(
                  hover,
                  `node-outline hovered ${hover.dropPosition ? `drop-${hover.dropPosition}` : ""}`,
                  "hover",
                )}
              {mode === "edit" &&
                selectedBoxes.map((box, index) =>
                  outline(box, "node-outline selected", index),
                )}
            </div>
          </div>
        </div>
      </div>
      {(status === "loading" || status === "error") && (
        <div
          className="preview-notice"
          role={status === "error" ? "alert" : "status"}
        >
          <div>
            {status === "error" ? (
              <AlertCircle size={24} />
            ) : (
              <span className="preview-spinner" />
            )}
            <strong>
              {status === "error"
                ? "Flutter preview needs attention"
                : "Starting Flutter preview"}
            </strong>
            <p>{error || "Loading the same Flutter widgets your app uses…"}</p>
            {status === "error" && (
              <button
                type="button"
                className="secondary"
                onClick={() => setReload((n) => n + 1)}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}
      <div
        className="canvas-floating-tools"
        role="toolbar"
        aria-label="Canvas tools"
      >
        <button
          type="button"
          aria-label="Select tool"
          title="Select (V)"
          aria-pressed={mode === "edit"}
          onClick={() => {
            setMode("edit");
          }}
        >
          <MousePointer2 size={18} />
        </button>
        <button
          type="button"
          aria-label="Insert widget"
          onClick={() => {
            setMode("edit");
            onInsert();
          }}
        >
          <Plus size={19} />
        </button>
        <button
          type="button"
          aria-label="Reset preview state"
          title="Reset preview state"
          onClick={() => {
            setReset((n) => n + 1);
            setRunScreen(null);
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {!!previewWarnings.length && (
        <div className="preview-data-warning" role="status">
          {previewWarnings.join(" ")}
        </div>
      )}
      <footer className="canvas-footer flutter-footer">
        <span className={`preview-status ${status}`}>
          <i />
          {status === "ready"
            ? "Flutter live"
            : status === "error"
              ? "Preview unavailable"
              : status === "loading"
                ? "Starting Flutter"
                : "Updating…"}
        </span>
        <button
          type="button"
          className={issues.length ? "has-issues" : ""}
          onClick={() => setShowIssues(!showIssues)}
          aria-expanded={showIssues}
        >
          {issues.length
            ? `${issues.length} preview issue${issues.length === 1 ? "" : "s"}`
            : mode === "run"
              ? "Interactive · use Select to edit layers"
              : "Select layers · double-click preview to use widgets"}
        </button>
        <div className="zoom-controls">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setScale(zoom - 0.1)}
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            aria-label="Zoom 100%"
            onClick={() => setScale(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setScale(zoom + 0.1)}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            aria-label="Fit preview"
            onClick={() => setAutoFit(true)}
          >
            <Maximize size={14} />
          </button>
        </div>
      </footer>
      {showIssues && (
        <div className="preview-issues">
          <header>
            <strong>Preview diagnostics</strong>
            <button type="button" onClick={() => setShowIssues(false)}>
              Close
            </button>
          </header>
          {issues.length ? (
            issues.map((issue, i) => (
              <div key={i}>
                <code>{issue.path}</code>
                <p>{issue.message}</p>
              </div>
            ))
          ) : (
            <p>
              No rendering issues. Double-click the preview to interact. Preview
              service writes require the connected app.
            </p>
          )}
        </div>
      )}
      <div
        className="geometry-accessibility"
        aria-hidden="true"
        data-node-count={boxes.length}
      >
        {boxes.map((box, index) => (
          <span
            key={`${box.id}:${index}`}
            data-rendered-node={box.nodeId}
            data-widget-type={box.widgetType}
            data-x={box.x}
            data-y={box.y}
            data-width={box.width}
            data-height={box.height}
          />
        ))}
      </div>
    </main>
  );
}
