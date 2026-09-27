import { memo, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export interface TabInfo {
  id: string;
  name: string;
  path: string | null;
  dirty: boolean;
}

interface TabBarProps {
  tabs: TabInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Chrome-style tabs: short, with rounded top corners and the active one in the
 * same color as the content (it feels part of it). The bottom line is an inner
 * shadow of the strip, so the active tab covers it.
 */
function TabBarComponent({ tabs, activeId, onSelect, onClose }: TabBarProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement | null>(null);

  // When the tab changes, we bring it into view if it was scrolled out.
  useEffect(() => {
    const active = listRef.current?.querySelector('[data-state="active"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId, tabs.length]);

  return (
    <Tabs
      value={activeId ?? ''}
      onValueChange={onSelect}
      className="tabbar flex min-w-0 shrink-0 flex-col gap-0 bg-card select-none"
    >
      <TabsList
        ref={listRef}
        aria-label={t('tabs.list')}
        className="flex h-[29px] min-w-0 items-end gap-1 overflow-x-auto overflow-y-hidden rounded-none bg-transparent px-2 shadow-[inset_0_-1px_0_var(--color-border-muted)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(event) => {
          const element = listRef.current;
          if (!element) return;
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) element.scrollLeft += event.deltaY;
        }}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            title={tab.path ?? tab.name}
            data-dirty={tab.dirty}
            className={cn(
              'group/tab relative flex h-[26px] max-w-50 shrink-0 items-center gap-1.5 rounded-t-lg rounded-b-none border border-transparent px-2.5 text-muted-foreground transition-colors',
              'hover:bg-accent/60 hover:text-foreground',
              'data-[state=active]:border-border data-[state=active]:border-b-transparent data-[state=active]:bg-background data-[state=active]:text-foreground',
              'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
            )}
            onAuxClick={(event) => {
              // Middle click closes the tab, like in any browser.
              if (event.button === 1) {
                event.preventDefault();
                onClose(tab.id);
              }
            }}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-[6px] shrink-0 rounded-full bg-primary opacity-0 transition-opacity',
                'group-data-[dirty=true]/tab:opacity-100',
                'group-hover/tab:opacity-0 group-data-[state=active]/tab:opacity-0',
              )}
            />
            <span className="truncate text-[12px] group-data-[state=active]/tab:font-medium">
              {tab.name}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={t('tabs.closeTab', { name: tab.name })}
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/tab:opacity-100 group-data-[state=active]/tab:opacity-100 hover:bg-accent-foreground/10 hover:text-foreground"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                >
                  <X className="size-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('tabs.closeTab', { name: tab.name })}</TooltipContent>
            </Tooltip>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Memoized: the props are stable unless something visible in the tab changes. */
export const TabBar = memo(TabBarComponent);
