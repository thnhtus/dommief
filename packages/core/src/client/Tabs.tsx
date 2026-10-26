import React, { useState, useMemo } from 'react';

export interface TabEntry {
  id: string;
  source: string;
  label?: string;
}

export interface DomTabsProps {
  tabs: TabEntry[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function DomTabs({ tabs, value: controlledValue, defaultValue = tabs[0]?.id, onValueChange }: DomTabsProps) {
  const [internal, setInternal] = useState<string | undefined>(defaultValue);
  const active = controlledValue ?? internal;
  const handleSelect = (id: string) => {
    setInternal(id);
    onValueChange?.(id);
  };
  const selectedIndex = tabs.findIndex((t) => t.id === active);

  return (
    <div className="dommief-tabs">
      <div className="dommief-tabs__list" role="tablist">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              type="button"
              key={t.id}
              className={`dommief-tabs__button${selected ? ' dommief-tabs__button--active' : ''}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`tab-panel-${t.id.replace(/\W/g, '_')}`}
              id={`tab-${t.id.replace(/\W/g, '_')}`}
              onClick={() => handleSelect(t.id)}
            >
              {t.label ?? t.id}
            </button>
          );
        })}
      </div>
      <div className="dommief-tabs__panels">
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <div
              key={t.id}
              className={`dommief-tabs__panel${selected ? ' dommief-tabs__panel--active' : ''}`}
              role="tabpanel"
              aria-labelledby={`tab-${t.id.replace(/\W/g, '_')}`}
              id={`tab-panel-${t.id.replace(/\W/g, '_')}`}
              hidden={!selected}
            >
              <pre className="dommief-tab__code"><code>{t.source}</code></pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** @deprecated Dùng DomTabs hoặc tạo TabEntry mới */
export function DomTab({ id, source, label }: TabEntry & { id: string }) {
  return <div data-tab-id={id} data-tab-label={label}>{source}</div>;
}
