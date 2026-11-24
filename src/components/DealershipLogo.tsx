import { useState } from 'react';
import type { Branch, DealershipGroup } from '../types/survey';

interface DealershipLogoProps {
  branch: Branch;
  size?: 'sm' | 'lg';
}

export interface BrandLogoAsset {
  src: string;
  alt: string;
  scaleClass?: string;
}

export const GROUP_LOGOS: Record<DealershipGroup, BrandLogoAsset[]> = {
  Autosol: [
    {
      src: '/assets/aistudio/Logo_VW_-_422b7499.png',
      alt: 'Logo Volkswagen',
      scaleClass: 'scale-105',
    },
  ],
  Autolux: [
    {
      src: '/assets/aistudio/Logo_Toyota-_93a2c03d.png',
      alt: 'Logo Toyota',
      scaleClass: 'scale-100',
    },
  ],
  Autociel: [
    {
      src: '/assets/aistudio/Logo_Peugeot-_b1819b42.png',
      alt: 'Logo Peugeot',
      scaleClass: 'scale-105',
    },
    {
      src: '/assets/aistudio/Logo_Citroen_62571d84.png',
      alt: 'Logo Citroën',
      scaleClass: 'scale-95',
    },
  ],
  Otro: [],
};

function BrandAssetBadge({
  asset,
  fallbackLetter,
  size,
}: {
  asset?: BrandLogoAsset;
  fallbackLetter: string;
  size: 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);

  const boxClass =
    size === 'lg'
      ? 'h-16 w-16 rounded-2xl p-2.5 sm:h-20 sm:w-20 sm:p-3'
      : 'h-9 w-9 rounded-xl p-1.5';

  if (!asset || failed) {
    return (
      <div
        className={`flex items-center justify-center border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 shadow-sm ${boxClass}`}
      >
        <span
          className={`font-display font-bold text-slate-800 ${
            size === 'lg' ? 'text-2xl' : 'text-sm'
          }`}
        >
          {fallbackLetter}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center border border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50 shadow-[0_10px_24px_-8px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,1)] ${boxClass}`}
    >
      <img
        src={asset.src}
        alt={asset.alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`h-full w-full object-contain mix-blend-multiply ${asset.scaleClass ?? ''}`}
      />
    </div>
  );
}

export function DealershipLogo({ branch, size = 'lg' }: DealershipLogoProps) {
  const isLarge = size === 'lg';
  const assets = GROUP_LOGOS[branch.group] ?? [];
  const fallbackLetter = branch.name.charAt(0).toUpperCase() || 'C';

  return (
    <div className={`flex flex-col items-center ${isLarge ? 'gap-3.5' : 'flex-row gap-2.5'}`}>
      <div className="flex items-center justify-center gap-3">
        {assets.length > 0 ? (
          assets.map((asset, index) => (
            <div key={asset.src} className="flex items-center gap-3">
              {index > 0 && isLarge && (
                <span
                  aria-hidden="true"
                  className="h-10 w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent"
                />
              )}
              <BrandAssetBadge
                asset={asset}
                fallbackLetter={fallbackLetter}
                size={size}
              />
            </div>
          ))
        ) : (
          <BrandAssetBadge fallbackLetter={fallbackLetter} size={size} />
        )}
      </div>

      <div className={isLarge ? 'text-center' : 'text-left'}>
        <div
          className={`font-display font-semibold tracking-tight text-slate-900 ${
            isLarge ? 'text-xl sm:text-2xl' : 'text-sm'
          }`}
        >
          {branch.name}
        </div>
        {isLarge && branch.city && (
          <div className="mt-0.5 text-xs font-medium tracking-wide text-slate-500">
            {branch.city} · Atención al Cliente
          </div>
        )}
      </div>
    </div>
  );
}
