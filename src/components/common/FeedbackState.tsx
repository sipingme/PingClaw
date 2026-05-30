import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeedbackStateProps {
  state: 'loading' | 'empty' | 'error';
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'default' | 'sm';
}

export function FeedbackState({ state, title, description, action, size = 'default' }: FeedbackStateProps) {
  const compact = size === 'sm';
  const iconClass = compact ? 'h-5 w-5' : 'h-8 w-8';
  const icon = state === 'loading'
    ? <Loader2 className={cn(iconClass, 'animate-spin text-primary')} />
    : state === 'error'
      ? <AlertCircle className={cn(iconClass, 'text-destructive')} />
      : <Inbox className={cn(iconClass, 'text-muted-foreground')} />;

  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-6' : 'py-8')}>
      <div className={cn(compact ? 'mb-2' : 'mb-3')}>{icon}</div>
      <p className={cn(compact ? 'text-xs text-muted-foreground' : 'font-medium')}>{title}</p>
      {description && (
        <p className={cn('mt-1 text-muted-foreground', compact ? 'text-2xs' : 'text-sm')}>{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
