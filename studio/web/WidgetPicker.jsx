import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Component, Square, Clock, X } from "lucide-react";
import { searchWidgets, widgetOptions } from "./widget-search.js";

function recents() {
  try {
    return JSON.parse(
      localStorage.getItem("spacewidget-recent-widgets") || "[]",
    );
  } catch {
    return [];
  }
}
function remember(value) {
  try {
    localStorage.setItem(
      "spacewidget-recent-widgets",
      JSON.stringify(
        [value, ...recents().filter((v) => v !== value)].slice(0, 8),
      ),
    );
  } catch {
    /* Storage can be disabled. */
  }
}
export function WidgetList({
  options,
  onChoose,
  query,
  setQuery,
  label = "Find widget",
  compact = false,
  close,
}) {
  const [active, setActive] = useState(0);
  const id = useId(),
    list = useRef(),
    input = useRef();
  let results = searchWidgets(options, query);
  const recent = recents();
  if (!query)
    results = [...results].sort((a, b) => {
      const rank = (v) =>
        recent.includes(v.value) ? recent.indexOf(v.value) - 20 : 0;
      return rank(a) - rank(b);
    });
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (compact) input.current?.focus();
  }, []);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const choose = (option) => {
    remember(option.value);
    onChoose(option.value);
  };
  return (
    <div className={`widget-library ${compact ? "compact" : ""}`}>
      <div className="widget-search">
        <Search size={16} />
        <input
          ref={input}
          aria-label={label}
          role="combobox"
          aria-expanded="true"
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={
            results[active] ? `${id}-${active}` : undefined
          }
          placeholder="Search widgets or components…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              setActive((n) =>
                Math.max(
                  0,
                  Math.min(
                    results.length - 1,
                    n + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              choose(results[active]);
            }
            if (e.key === "Escape") close?.();
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear widget search"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div
        className="widget-results"
        id={id}
        role="listbox"
        aria-label="Widgets and components"
        ref={list}
      >
        {!results.length && (
          <p className="picker-empty">
            No matching widgets. Try “text”, “grid” or “input”.
          </p>
        )}
        {results.map((option, index) => (
          <button
            type="button"
            role="option"
            aria-label={option.label}
            aria-selected={index === active}
            id={`${id}-${index}`}
            key={option.value}
            draggable={!compact}
            onDragStart={(e) => {
              remember(option.value);
              e.dataTransfer.setData("application/spacewidget", option.value);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => choose(option)}
          >
            <span className="widget-result-icon">
              {option.type === "component" ? (
                <Component size={18} />
              ) : (
                <Square size={17} />
              )}
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>
                {option.category} ·{" "}
                {option.type === "component"
                  ? option.value.slice(10)
                  : option.value}
              </small>
            </span>
            {!query && recent.includes(option.value) && (
              <Clock size={12} aria-label="Recently used" />
            )}
          </button>
        ))}
      </div>
      <div className="picker-hint">
        {results.length} available · ↑↓ navigate · Enter insert
      </div>
    </div>
  );
}

export function WidgetPicker({ value, onChange, label, ...context }) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const [position, setPosition] = useState({});
  const trigger = useRef(),
    popup = useRef();
  const options = widgetOptions(context),
    selected = options.find((o) => o.value === value);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const layout = () => {
      const rect = trigger.current.getBoundingClientRect(),
        width = Math.min(360, window.innerWidth - 24),
        height = Math.min(460, window.innerHeight - 32);
      setPosition({
        width,
        left: Math.max(
          12,
          Math.min(rect.right - width, window.innerWidth - width - 12),
        ),
        top: Math.max(
          12,
          Math.min(rect.bottom + 6, window.innerHeight - height - 12),
        ),
        maxHeight: height,
      });
    };
    const outside = (e) => {
      if (
        !trigger.current?.contains(e.target) &&
        !popup.current?.contains(e.target)
      )
        setOpen(false);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    layout();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", layout);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", layout);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="widget-picker-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen(!open);
        }}
      >
        <span>{selected?.label || "Choose widget…"}</span>
        <ChevronDown size={15} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            className="widget-picker-popover"
            style={position}
            role="dialog"
            aria-label={`${label} picker`}
          >
            <WidgetList
              compact
              options={options}
              query={query}
              setQuery={setQuery}
              label={`Search ${label.toLowerCase()}`}
              close={close}
              onChoose={(type) => {
                onChange(type);
                close();
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
