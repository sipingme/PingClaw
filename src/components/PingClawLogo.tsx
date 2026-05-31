import pingclawIcon from '@/assets/logo.png';
import pingclawIcon2x from '@/assets/logo@2x.png';
import { cn } from '@/lib/utils';

interface PingClawLogoProps {
  className?: string;
  alt?: string;
}

export function PingClawLogo({ className, alt = 'PingClaw' }: PingClawLogoProps) {
  return (
    <img
      src={pingclawIcon}
      srcSet={`${pingclawIcon} 1x, ${pingclawIcon2x} 2x`}
      alt={alt}
      className={cn('inline-block shrink-0 object-contain', className)}
      draggable={false}
    />
  );
}
