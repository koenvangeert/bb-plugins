import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

export interface MenuItem { label: string; run: () => void | Promise<unknown>; disabled?: boolean }

/** Portals above the scrolling list, so menus at its lower edge stay visible. */
export function ActionMenu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    const scroll = () => setOpen(false);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  const toggle = () => {
    if (!open && trigger.current) {
      const rect = trigger.current.getBoundingClientRect();
      setPosition({
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 280)),
        left: Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)),
      });
    }
    setOpen(!open);
  };
  return <span className="shrink-0">
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open}
      className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={toggle}>⋯</button>
    {open ? createPortal(<div ref={panel} role="menu" aria-label={label}
      className="fixed z-50 max-h-64 w-52 overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      style={position} onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const next = buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowDown" ? 1 : -1);
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }}>
      {items.map((item) => <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
        className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent disabled:opacity-40"
        onClick={() => {
          setOpen(false);
          trigger.current?.focus();
          try { void Promise.resolve(item.run()).catch(() => toast.error(`Could not ${item.label.toLowerCase()}.`)); }
          catch { toast.error(`Could not ${item.label.toLowerCase()}.`); }
        }}>{item.label}</button>)}
    </div>, document.body) : null}
  </span>;
}
