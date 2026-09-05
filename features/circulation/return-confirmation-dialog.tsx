'use client';

import type { ReactElement } from 'react';
import { BookCheck } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { AppLocale } from '@/lib/domain/types';

interface ReturnConfirmationDialogProps {
  bookTitle: string;
  locale: AppLocale;
  onConfirm: () => void;
  trigger: ReactElement;
}

export function ReturnConfirmationDialog({
  bookTitle,
  locale,
  onConfirm,
  trigger,
}: ReturnConfirmationDialogProps) {
  const korean = locale === 'ko';

  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia><BookCheck /></AlertDialogMedia>
          <AlertDialogTitle>
            {korean ? '반납 완료로 표시할까요?' : 'Mark this book as returned?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {korean
              ? `『${bookTitle}』의 대여가 종료돼요. 대기자가 있다면 다음 분에게 알림을 보내요.`
              : `This ends the loan for “${bookTitle}.” If someone is waiting, they’ll be notified next.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11" data-testid="cancel-return-confirmation">
            {korean ? '취소' : 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className="h-11"
            onClick={onConfirm}
            data-testid="confirm-return"
          >
            {korean ? '반납 완료' : 'Confirm return'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
