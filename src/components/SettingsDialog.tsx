import { useState } from 'react';
import { Monitor, Moon, PanelLeft, PanelRight, Sun } from 'lucide-react';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-react';
import { PALETTES, type ExplorerSide, type Palette } from '@/lib/theme';
import { DEFAULT_PREFERENCES, type Preferences, type ThemeMode } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  onReset: () => void;
  onClearRecents: () => void;
  recentsCount: number;
}

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-[10.5px] whitespace-nowrap transition-colors',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-[11px]">{label}</div>
        {hint && <div className="text-[10px] text-subtle-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="py-2">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px]">{label}</span>
        <span className="text-[10.5px] tabular-nums text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="mb-1 text-[10px] font-semibold tracking-wide text-subtle-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Dialog with all the preferences; the quick actions in the menu remain. */
export function SettingsDialog({
  open,
  onOpenChange,
  preferences,
  onChange,
  onReset,
  onClearRecents,
  recentsCount,
}: SettingsDialogProps) {
  const { t, plural } = useI18n();
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setConfirmingReset(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm">{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        {/* The list scrolls; the footer with Reset/Done stays always visible.
            The right gutter keeps the text clear of the scrollbar and the
            bottom padding keeps the last row away from the footer buttons. */}
        <div className="mb-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-3 pb-4 [scrollbar-gutter:stable]">
          <Section title={t('settings.appearance')}>
            <Row label={t('settings.theme')}>
              <Segmented<ThemeMode>
                value={preferences.themeMode}
                onChange={(value) => onChange({ themeMode: value })}
                options={[
                  { value: 'light', label: t('header.themeLight'), icon: <Sun className="size-3" /> },
                  { value: 'dark', label: t('header.themeDark'), icon: <Moon className="size-3" /> },
                  { value: 'system', label: t('header.themeSystem'), icon: <Monitor className="size-3" /> },
                ]}
              />
            </Row>
            <Row label={t('settings.palette')}>
              <Segmented<Palette>
                value={preferences.palette}
                onChange={(value) => onChange({ palette: value })}
                options={PALETTES.map((palette) => ({
                  value: palette.id,
                  label: palette.label,
                }))}
              />
            </Row>
            <Row label={t('settings.language')} hint={t('settings.languageHint')}>
              <Segmented<Language>
                value={preferences.language}
                onChange={(value) => onChange({ language: value })}
                options={LANGUAGES.map((language) => ({
                  value: language.id,
                  label: language.native,
                }))}
              />
            </Row>
          </Section>

          <Separator />

          <Section title={t('settings.editor')}>
            <SliderRow
              label={t('settings.fontSize')}
              value={preferences.editorFontSize}
              min={11}
              max={20}
              step={0.5}
              suffix=" px"
              onChange={(value) => onChange({ editorFontSize: value })}
            />
            <Row label={t('settings.lineNumbers')}>
              <Switch
                checked={preferences.editorLineNumbers}
                onCheckedChange={(checked) => onChange({ editorLineNumbers: checked })}
                aria-label={t('settings.lineNumbers')}
              />
            </Row>
            <Row label={t('settings.wrap')}>
              <Switch
                checked={preferences.editorWrap}
                onCheckedChange={(checked) => onChange({ editorWrap: checked })}
                aria-label={t('settings.wrap')}
              />
            </Row>
          </Section>

          <Separator />

          <Section title={t('settings.preview')}>
            <Row label={t('settings.syncScroll')} hint={t('settings.syncScrollHint')}>
              <Switch
                checked={preferences.previewSyncScroll}
                onCheckedChange={(checked) => onChange({ previewSyncScroll: checked })}
                aria-label={t('settings.syncScroll')}
              />
            </Row>
            <SliderRow
              label={t('settings.fontSize')}
              value={preferences.previewFontSize}
              min={13}
              max={22}
              step={1}
              suffix=" px"
              onChange={(value) => onChange({ previewFontSize: value })}
            />
          </Section>

          <Separator />

          <Section title={t('settings.explorer')}>
            <Row label={t('settings.explorerPosition')} hint={t('settings.explorerHint')}>
              <Segmented<ExplorerSide>
                value={preferences.explorerSide}
                onChange={(value) => onChange({ explorerSide: value })}
                options={[
                  { value: 'left', label: t('header.left'), icon: <PanelLeft className="size-3" /> },
                  { value: 'right', label: t('header.right'), icon: <PanelRight className="size-3" /> },
                ]}
              />
            </Row>
          </Section>

          <Separator />

          <Section title={t('settings.export')}>
            <Row label={t('settings.pdfLight')} hint={t('settings.pdfLightHint')}>
              <Switch
                checked={preferences.pdfLight}
                onCheckedChange={(checked) => onChange({ pdfLight: checked })}
                aria-label={t('settings.pdfLight')}
              />
            </Row>
          </Section>

          <Separator />

          <Section title={t('settings.start')}>
            <Row label={t('settings.showRecents')}>
              <Switch
                checked={preferences.showRecents}
                onCheckedChange={(checked) => onChange({ showRecents: checked })}
                aria-label={t('settings.showRecents')}
              />
            </Row>
            <Row
              label={t('settings.recentsList')}
              hint={plural('settings.recentsCount', recentsCount)}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11.5px]"
                disabled={recentsCount === 0}
                onClick={onClearRecents}
              >
                {t('common.clearList')}
              </Button>
            </Row>
          </Section>
        </div>

        <DialogFooter className="gap-2 border-t pt-4 sm:items-center sm:justify-between">
          <Label className="text-[10.5px] text-subtle-foreground">
            {confirmingReset ? t('settings.resetConfirm') : ''}
          </Label>
          <div className="flex gap-2">
            {confirmingReset ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-[11.5px]"
                  onClick={() => setConfirmingReset(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2.5 text-[11.5px]"
                  onClick={() => {
                    onReset();
                    setConfirmingReset(false);
                  }}
                >
                  {t('common.reset')}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11.5px]"
                onClick={() => setConfirmingReset(true)}
                disabled={
                  JSON.stringify({ ...DEFAULT_PREFERENCES }) === JSON.stringify(preferences)
                }
              >
                {t('common.reset')}
              </Button>
            )}
            <Button size="sm" className="h-7 px-2.5 text-[11.5px]" onClick={() => onOpenChange(false)}>
              {t('common.done')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
