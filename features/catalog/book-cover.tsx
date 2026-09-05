import Image from 'next/image';
import { BookOpen } from 'lucide-react';
import type { BookEdition } from '@/lib/domain/types';
import { highResolutionCoverUrl } from '@/lib/isbn/cover-url';
import { cn } from '@/lib/utils';

interface BookCoverProps {
  edition: BookEdition;
  className?: string;
  eager?: boolean;
}

export function BookCover({ edition, className, eager = false }: BookCoverProps) {
  if (edition.coverUrl) {
    return (
      <div className={cn('relative overflow-hidden rounded-[1.1rem] bg-muted shadow-[0_16px_36px_-20px_rgba(15,55,46,0.65)]', className)}>
        {/* Provider and member-uploaded covers are rendered directly; Google thumbnail URLs request their widest available source. */}
        <Image
          src={highResolutionCoverUrl(edition.coverUrl)}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 260px"
          className="h-full w-full object-cover"
          priority={eager}
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        `book-cover-${edition.coverTone}`,
        'relative flex overflow-hidden rounded-[1.1rem] p-3 text-white shadow-[0_16px_36px_-20px_rgba(15,55,46,0.75)]',
        className,
      )}
    >
      <div className="absolute inset-y-0 left-2 w-px bg-white/20" />
      <div className="absolute -right-8 -top-10 size-28 rounded-full border border-white/20" />
      <div className="absolute -bottom-14 -left-10 size-32 rounded-full bg-white/10" />
      <div className="relative mt-auto min-w-0">
        <BookOpen className="mb-2 size-4 text-white/80" />
        <p className="line-clamp-3 text-sm font-semibold leading-snug text-balance sm:text-base">{edition.title}</p>
        <p className="mt-1 line-clamp-1 text-[0.68rem] text-white/75">{edition.authors.join(', ')}</p>
      </div>
    </div>
  );
}
