import { cn } from '@/lib/utils';

/** Active state for segmented controls (theme, language, filters, …) */
export function segmentButtonClass(active: boolean, flex = false): string {
  return cn(
    flex
      ? 'flex-1 rounded-md px-2 py-1.5 text-2xs font-medium transition-colors'
      : 'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-2xs font-medium transition-colors',
    active
      ? 'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/10 dark:ring-primary/25'
      : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
  );
}

/** Toolbar icon button active state */
export function toggleIconActiveClass(active: boolean, base?: string): string {
  return cn(
    base,
    active &&
      'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/10 dark:ring-primary/25',
  );
}

export const ACCENT_ICON_SM =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/10 dark:ring-primary/25';

export const ACCENT_ICON_MD =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/10 dark:ring-primary/25';

export const ACCENT_ICON_LG =
  'mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/10 dark:ring-primary/25';

export const ACCENT_AVATAR =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/10 dark:ring-primary/25';

export const STATUS_SUCCESS = 'border-primary/25 bg-primary/10 text-primary';

export const STATUS_SUCCESS_DOT = 'bg-primary';

export const STATUS_SUCCESS_ICON = 'text-primary';

export const PRIMARY_CTA =
  'bg-primary text-primary-foreground hover:bg-primary/90';

/** Selected card / tile / list item */
export const SELECTABLE_ACTIVE =
  'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/10 dark:ring-primary/25';

export const SELECTABLE_ACTIVE_OUTLINE =
  'border-primary/30 bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/10 dark:ring-primary/25';

/** Neutral list-row hover — light gray in light theme (avoids cream muted/accent) */
export const HOVER_ROW = 'hover:bg-surface-input dark:hover:bg-white/10';

/** Subtle hover for icon buttons inside panels */
export const HOVER_ROW_SUBTLE =
  'hover:bg-black/[0.04] dark:hover:bg-white/10';
