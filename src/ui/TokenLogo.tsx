import { useState } from 'react';
import { cn } from '@/lib/cn';

const palette = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#db2777', '#0891b2'];

/** Imagem do token no CDN do DexScreener (existe para muitos tokens mesmo sem perfil na API). */
const dsCdn = (address: string) => `https://dd.dexscreener.com/ds-data/tokens/solana/${address}.png?size=sm`;

export function TokenLogo({
  src,
  symbol,
  address,
  size = 26,
  className,
}: {
  src: string | null | undefined;
  symbol: string | null | undefined;
  /** endereço do token: habilita a foto alternativa quando `src` falta ou falha */
  address?: string | null;
  size?: number;
  className?: string;
}) {
  const [errs, setErrs] = useState<string[]>([]);
  const label = (symbol ?? '?').replace(/^\$/, '').slice(0, 2).toUpperCase();
  const color = palette[(label.charCodeAt(0) || 0) % palette.length];
  const candidates = [src, address ? dsCdn(address) : null].filter((u): u is string => !!u && !errs.includes(u));
  const url = candidates[0];
  if (url) {
    return (
      <img
        key={url}
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setErrs((e) => [...e, url])}
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
