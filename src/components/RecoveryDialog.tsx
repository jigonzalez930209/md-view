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

interface RecoveryDialogProps {
  open: boolean;
  /** Number of drafts found from the last session. */
  count: number;
  onRecover: () => void;
  onDiscard: () => void;
}

/** Offers to restore (or drop) the drafts left by an unexpected exit. */
export function RecoveryDialog({ open, count, onRecover, onDiscard }: RecoveryDialogProps) {
  const { t, plural } = useI18n();
  const body = plural('app.draftsFound', count);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onDiscard(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('app.draftsTitle')}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            {t('common.discard')}
          </Button>
          <Button size="sm" onClick={onRecover}>
            {t('app.recover')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
