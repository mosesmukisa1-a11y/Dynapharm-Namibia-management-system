import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Menu, RefreshCw } from 'lucide-react';

function SectionNavItem({ tab, active, onSelect }) {
  const selected = active === tab.id;

  return (
    <button
      type="button"
      key={tab.id}
      onClick={() => onSelect(tab.id)}
      aria-current={selected ? 'page' : undefined}
      className={[
        'group flex w-full min-w-0 items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2',
        selected
          ? 'border-red-800 bg-red-800 text-white shadow-sm'
          : 'border-transparent text-slate-700 hover:border-red-100 hover:bg-red-50 hover:text-red-900',
      ].join(' ')}
    >
      {tab.icon && (
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
          {tab.icon}
        </span>
      )}
      <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{tab.label}</span>
    </button>
  );
}

export default function GMSectionLayout({ tabs = [], active, onChange, onRefresh, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavId = useId();
  const triggerRef = useRef(null);
  const headingRef = useRef(null);
  const activeTab = tabs.find((tab) => tab.id === active);
  const currentTitle = activeTab?.label || 'GM Portal';

  useEffect(() => {
    if (!mobileNavOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

  const selectSection = (sectionId) => {
    onChange?.(sectionId);
    setMobileNavOpen(false);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  return (
    <section className="min-w-0">
      <div className="mb-4 rounded-xl border border-red-100 bg-white px-4 py-3 shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-800">General Manager</p>
            <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 break-words text-lg font-bold leading-6 text-slate-900 focus:outline-none sm:text-xl">
              {currentTitle}
            </h2>
          </div>
          <button
            type="button"
             title="Refresh tab data"
             aria-label={`Refresh ${currentTitle}`}
            onClick={onRefresh}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
          >
            <RefreshCw size={16} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="mb-4 md:hidden">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={mobileNavOpen}
          aria-controls={mobileNavId}
          onClick={() => setMobileNavOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 text-left font-semibold text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
        >
          <Menu size={18} className="shrink-0 text-red-800" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-red-800">GM sections menu</span>
            <span className="block truncate text-sm">{mobileNavOpen ? 'Choose a section' : currentTitle}</span>
          </span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {mobileNavOpen && (
          <nav
            id={mobileNavId}
            aria-label="GM section navigation"
            style={{ display: 'grid', whiteSpace: 'normal', overflowX: 'hidden' }}
            className="mt-2 grid max-h-[min(60dvh,30rem)] grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-red-100 bg-white p-2 shadow-md"
          >
            {tabs.map((tab) => (
              <SectionNavItem key={tab.id} tab={tab} active={active} onSelect={selectSection} />
            ))}
          </nav>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-5">
        <aside className="hidden min-w-0 md:block">
          <nav
            aria-label="GM section navigation"
            className="sticky top-[105px] max-h-[calc(100dvh-120px)] overflow-y-auto overscroll-contain rounded-xl border border-red-100 bg-white p-2 shadow-sm"
          >
            <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-red-800">
              GM sections
            </p>
            <div className="space-y-1">
              {tabs.map((tab) => (
                <SectionNavItem key={tab.id} tab={tab} active={active} onSelect={selectSection} />
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-w-0 overflow-x-auto" data-gm-section-content>
          {children}
        </div>
      </div>
    </section>
  );
}
