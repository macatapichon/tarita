import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../../lib/cx";
import { FieldShell } from "./Input";
import inputStyles from "./Input.module.css";
import styles from "./Combobox.module.css";

export type ComboOption = { value: string; label: string };

interface ComboboxProps {
  label?: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function Combobox({ label, value, options, onChange, placeholder = "Buscar…" }: ComboboxProps) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return q ? options.filter((o) => norm(o.label).includes(q)) : options;
  }, [options, query]);

  function openMenu() {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(o: ComboOption) {
    onChange(o.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <FieldShell label={label} htmlFor={id}>
      <div ref={wrap} className={cx(inputStyles.control)}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cx(inputStyles.input, inputStyles.select)}
          placeholder={open ? placeholder : undefined}
          value={open ? query : selected?.label ?? ""}
          onFocus={openMenu}
          onClick={() => !open && openMenu()}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <span className={inputStyles.chevron}><ChevronDown size={20} strokeWidth={1.5} aria-hidden /></span>
        {open && (
          <ul id={`${id}-list`} role="listbox" className={styles.menu} style={pos}>
            {filtered.length ? (
              filtered.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={cx(styles.item, i === active && styles.active, o.value === value && styles.selected)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  {o.label}
                </li>
              ))
            ) : (
              <li className={styles.empty}>Sin resultados</li>
            )}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}
