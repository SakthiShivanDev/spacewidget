import React, { useEffect, useId, useMemo, useState } from "react";
import {
  Download,
  ClipboardPaste,
  Upload,
  Layers,
  Image,
  AlertCircle,
} from "lucide-react";
import {
  FIGMA_MAX_BYTES,
  parseFigmaPackage,
  snapshotPackage,
} from "./figma-import.js";

export function readFigmaFile(file) {
  if (!file || file.size > FIGMA_MAX_BYTES)
    return Promise.reject(
      new Error("Choose a PNG or JSON export smaller than 1.5 MB."),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read this file."));
    reader.onload = () => {
      try {
        resolve(
          file.type === "image/png" || /\.png$/i.test(file.name)
            ? JSON.stringify(
                snapshotPackage(
                  String(reader.result),
                  file.name.replace(/\.png$/i, ""),
                ),
              )
            : String(reader.result),
        );
      } catch (e) {
        reject(e);
      }
    };
    if (file.type === "image/png" || /\.png$/i.test(file.name))
      reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}
export function FigmaImport({
  initial,
  onImport,
  currentName,
  editingComponent,
}) {
  const [text, setText] = useState(initial?.text || ""),
    [error, setError] = useState("");
  const [frameIndex, setFrameIndex] = useState(0),
    [mode, setMode] = useState("editable"),
    [destination, setDestination] = useState("screen"),
    [name, setName] = useState(""),
    [originalSize, setOriginalSize] = useState(true);
  const fileId = useId();
  const result = useMemo(() => {
    if (!text.trim()) return {};
    try {
      return { data: parseFigmaPackage(text) };
    } catch (e) {
      return { error: e.message };
    }
  }, [text]);
  const frame = result.data?.frames[frameIndex];
  useEffect(() => {
    setFrameIndex(0);
  }, [text]);
  useEffect(() => {
    if (frame) {
      setName(frame.name);
      if (!frame.root) setMode("snapshot");
    }
  }, [frame]);
  const apply = () => {
    try {
      onImport(result.data, {
        frameIndex,
        mode,
        destination,
        name,
        originalSize,
      });
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="figma-import">
      <p className="figma-intro">
        Copy a selection with <strong>SpaceWidget · Copy to Studio</strong> in
        Figma, then paste here. Review the design before changing your draft.
      </p>
      <div className="figma-import-actions">
        <a
          className="secondary compact"
          href="/api/figma-plugin"
          download="spacewidget-figma-plugin.zip"
        >
          <Download size={15} />
          Download Figma plugin
        </a>
        <button
          type="button"
          className="secondary compact"
          onClick={async () => {
            try {
              setText(await navigator.clipboard.readText());
              setError("");
            } catch {
              setError(
                "Clipboard access is unavailable. Paste into the export box with Ctrl/Cmd+V, or choose a file.",
              );
            }
          }}
        >
          <ClipboardPaste size={15} />
          Paste clipboard
        </button>
        <label className="secondary compact figma-file-button" htmlFor={fileId}>
          <Upload size={15} />
          Choose JSON / PNG
        </label>
        <input
          id={fileId}
          className="visually-hidden"
          type="file"
          aria-label="Figma export file"
          accept=".json,.png,application/json,image/png"
          onChange={async (e) => {
            try {
              if (e.target.files[0]) {
                setText(await readFigmaFile(e.target.files[0]));
                setError("");
              }
            } catch (error) {
              setError(error.message);
            }
            e.target.value = "";
          }}
        />
      </div>
      <details className="figma-setup" open={initial?.native === true}>
        <summary>One-time Figma setup and clipboard support</summary>
        <ol>
          <li>Download and extract the plugin ZIP.</li>
          <li>
            In Figma desktop, open{" "}
            <strong>
              Plugins → Development → Import plugin from manifest…
            </strong>{" "}
            and choose <code>manifest.json</code>.
          </li>
          <li>
            Select a frame, run <strong>SpaceWidget · Copy to Studio</strong>,
            then click <strong>Export selection → Copy for Studio</strong>.
          </li>
          <li>
            Return to Studio and press <strong>Ctrl/Cmd+V</strong> outside a
            text field.
          </li>
        </ol>
        <p>
          Normal Figma copy data is not an editable Studio export. A pasted PNG
          imports as one image. The plugin provides named editable layers
          without a Figma API token.
        </p>
      </details>
      {initial?.native && !text && (
        <p className="figma-native-notice">
          <AlertCircle size={17} />
          Figma clipboard detected. Use the companion plugin for editable
          layers, or choose a PNG for a visual snapshot.
        </p>
      )}
      <label className="field">
        <span>Figma export JSON</span>
        <textarea
          aria-label="Figma export JSON"
          className="figma-export-input"
          rows={3}
          spellCheck={false}
          placeholder="Paste the JSON copied by the SpaceWidget Figma plugin…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
        />
      </label>
      {(error || result.error) && (
        <p className="error" role="alert">
          {error || result.error}
        </p>
      )}
      {frame && (
        <div className="figma-review">
          <div className="figma-reference">
            {frame.preview ? (
              <img src={frame.preview} alt={`Figma reference: ${frame.name}`} />
            ) : (
              <div className="figma-no-reference">
                <Layers size={32} />
                Editable layer export
              </div>
            )}
            <span>
              Figma reference · {frame.width} × {frame.height}
            </span>
          </div>
          <div className="figma-import-options">
            {result.data.frames.length > 1 && (
              <label className="field">
                <span>Selected frame</span>
                <select
                  aria-label="Selected Figma frame"
                  value={frameIndex}
                  onChange={(e) => setFrameIndex(Number(e.target.value))}
                >
                  {result.data.frames.map((f, index) => (
                    <option key={index} value={index}>
                      {f.name} · {f.width} × {f.height}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset className="figma-mode">
              <legend>Import as</legend>
              <label className={mode === "editable" ? "selected" : ""}>
                <input
                  type="radio"
                  name="figma-mode"
                  value="editable"
                  checked={mode === "editable"}
                  disabled={!frame.root}
                  onChange={() => setMode("editable")}
                />
                <Layers size={18} />
                <span>
                  <strong>Editable layers</strong>
                  <small>
                    Text, colors and measured positions. Complex artwork stays
                    as images.
                  </small>
                </span>
              </label>
              <label className={mode === "snapshot" ? "selected" : ""}>
                <input
                  type="radio"
                  name="figma-mode"
                  value="snapshot"
                  checked={mode === "snapshot"}
                  disabled={!frame.preview}
                  onChange={() => setMode("snapshot")}
                />
                <Image size={18} />
                <span>
                  <strong>Visual snapshot</strong>
                  <small>
                    Preserves the exported appearance as one image. Individual
                    layers are not editable.
                  </small>
                </span>
              </label>
            </fieldset>
            <label className="field">
              <span>Design name</span>
              <input
                aria-label="Imported design name"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Destination</span>
              <select
                aria-label="Figma import destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="screen">New screen</option>
                <option value="component">Reusable component</option>
                <option value="insert">
                  Insert in {currentName || "current layout"}
                </option>
                <option value="replace">
                  Replace {currentName || "current layout"}
                </option>
              </select>
            </label>
            {destination === "replace" && (
              <p className="figma-replace-note">
                Replaces this {editingComponent ? "component" : "screen"}{" "}
                layout. Existing data settings stay in place. Undo restores the
                previous layout.
              </p>
            )}
            {destination === "insert" && (
              <p className="slot-hint">
                The selected parent’s constraints can affect the imported size.
                A new screen preserves the original frame dimensions.
              </p>
            )}
            <label className="check-field">
              <input
                type="checkbox"
                checked={originalSize}
                onChange={(e) => setOriginalSize(e.target.checked)}
              />
              Open preview at the original frame size
            </label>
          </div>
          <div className="figma-fidelity">
            <strong>
              {mode === "snapshot"
                ? "Visual appearance is preserved; this import is a single image."
                : "Layers remain editable at the copied frame size."}
            </strong>
            <p>
              {mode === "editable"
                ? "Text metrics can differ in Flutter. Use the same fonts in your app, or choose Visual snapshot for the exported appearance. Fixed layer positions do not automatically become responsive layouts."
                : "Scaling or changing the aspect ratio affects image sharpness. Choose Editable layers when you need to change text or bind individual widgets to data."}
            </p>
            {mode === "editable" && !!result.data.fonts.length && (
              <p>
                Required fonts: {result.data.fonts.join(", ")}. Font files are
                not included by Figma export.
              </p>
            )}
            {!!result.data.warnings.length && (
              <details>
                <summary>
                  {result.data.warnings.length} export note
                  {result.data.warnings.length === 1 ? "" : "s"}
                </summary>
                <ul>
                  {result.data.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            <p>
              Design imports do not create API actions, authentication or
              database bindings. Connect these using the widget inspector after
              importing.
            </p>
          </div>
        </div>
      )}
      <div className="figma-import-footer">
        <small>
          {result.data
            ? `${result.data.layerCount} editable layer records · ${result.data.frames.length} frame(s)`
            : "PNG / SpaceWidget Figma JSON · maximum 1.5 MB"}
        </small>
        <button
          type="button"
          className="primary"
          disabled={
            !frame ||
            !name.trim() ||
            (mode === "editable" && !frame.root) ||
            (mode === "snapshot" && !frame.preview)
          }
          onClick={apply}
        >
          Import design
        </button>
      </div>
    </div>
  );
}
