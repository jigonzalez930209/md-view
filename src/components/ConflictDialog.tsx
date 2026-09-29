import { useI18n } from '@/lib/i18n-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ConflictDialogProps {
  open: boolean;
  /** Name of the document that changed on disk. */
  name: string;
  onOverwrite: () => void;
  onReload: () => void;
  onCancel: () => void;
}

/** The file was written by another program: keep ours, take theirs, or stop. */
export function ConflictDialog({
  open,
  name,
  onOverwrite,
  onReload,
  onCancel,
}: ConflictDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('app.conflictTitle')}</DialogTitle>
          <DialogDescription>{t('app.conflictBody', { name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" size="sm" onClick={onReload}>
            {t('common.reload')}
          </Button>
          <Button size="sm" onClick={onOverwrite}>
            {t('app.conflictOverwrite')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
