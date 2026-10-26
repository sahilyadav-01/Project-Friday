type BrandLogoProps = {
  size?: 'small' | 'large';
  className?: string;
};

export function BrandLogo({ size = 'small', className = '' }: BrandLogoProps) {
  const dimensions = size === 'large' ? 'w-16 h-16' : 'w-8 h-8';

  return (
    <div className={`relative ${dimensions} shrink-0 inline-flex items-center justify-center rounded-full group ${className}`}>
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-orange-500/30 to-amber-500/40 blur-sm group-hover:blur-md transition-all animate-pulse" />
      <img
        src="/friday-core.jpg"
        alt="F.R.I.D.A.Y. logo"
        className="relative w-full h-full rounded-full object-cover ring-2 ring-orange-500/60 shadow-md shadow-orange-500/25"
      />
    </div>
  );
}
