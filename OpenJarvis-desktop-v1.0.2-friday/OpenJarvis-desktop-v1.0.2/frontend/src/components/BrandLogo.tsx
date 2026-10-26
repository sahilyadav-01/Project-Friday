type BrandLogoProps = {
  size?: 'small' | 'large';
};

export function BrandLogo({ size = 'small' }: BrandLogoProps) {
  const dimensions = size === 'large' ? 'w-16 h-16' : 'w-8 h-8';

  return (
    <img
      src="/pwa-192x192.png"
      alt="Friday logo"
      className={`${dimensions} rounded-xl object-cover shrink-0`}
    />
  );
}
