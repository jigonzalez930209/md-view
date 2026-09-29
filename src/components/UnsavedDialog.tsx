import { useI18n } from '@/lib/i18n-react';
import { dirtyMessage } from '@/lib/backend';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface UnsavedDialogProps {
  open: boolean;
  /** Names of the documents with unsaved changes that the close action would lose. */
  names: string[];
  /** true while the save is running: every action is disabled. */
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * Three-way prompt shown before closing a dirty tab or quitting.
 * Cancel is the first button so it takes the focus and Escape cancels too.
 */
export function UnsavedDialog({ open, names, busy, onSave, onDiscard, onCancel }: UnsavedDialogProps) {
  const { t } = useI18n();
  const many = names.length > 1;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('app.unsavedTitle')}</DialogTitle>
          <DialogDescription>
            {names.length > 0 ? `${dirtyMessage(names)} ` : ''}
            {t('app.unsavedPrompt')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={onDiscard}>
            {t('common.discard')}
          </Button>
          <Button size="sm" disabled={busy} onClick={onSave}>
            {busy ? t('app.saving') : many ? t('common.saveAll') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
