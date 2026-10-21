import { useState } from 'react';
import { cn } from '@/lib/cn';

const palette = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#db2777', '#0891b2'];

export function TokenLogo({ src, symbol, size = 26, className }: { src: string | null | undefined; symbol: string | null | undefined; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  const label = (symbol ?? '?').replace(/^\$/, '').slice(0, 2).toUpperCase();
  const color = palette[(label.charCodeAt(0) || 0) % palette.length];
  if (src && !err) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setErr(true)}
        className={cn('shrink-0 rounded-full bg-raised object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full text-[9px] font-bold text-white', className)}
      style={{ width: size, height: size, background: color }}
    >
      {label}
    </span>
  );
}
