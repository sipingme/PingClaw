import pingclawIcon from '@/assets/logo.svg';
import { cn } from '@/lib/utils';

interface PingClawLogoProps {
  className?: string;
  alt?: string;
}

export function PingClawLogo({ className, alt = 'PingClaw' }: PingClawLogoProps) {
  return (
    <span
      role="img"
      aria-label={alt}
      className={cn('inline-block shrink-0 bg-primary aspect-[550/450]', className)}
      style={{
        WebkitMaskImage: `url(${pingclawIcon})`,
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskImage: `url(${pingclawIcon})`,
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
      }}
    />
  );
}
