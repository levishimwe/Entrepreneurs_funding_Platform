import { useState } from 'react';

const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base' };

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// Profile photo from an authenticated endpoint, falling back to initials.
export default function Avatar({ name, src, size = 'sm' }) {
  const [failed, setFailed] = useState(false);
  const cls = `${SIZES[size]} shrink-0 rounded-full`;
  if (src && !failed) {
    return <img src={src} alt="" className={`${cls} bg-subtle object-cover ring-1 ring-line`} onError={() => setFailed(true)} />;
  }
  return (
    <div className={`${cls} flex items-center justify-center bg-alu-navy font-semibold text-white`} aria-hidden="true">
      {initials(name)}
    </div>
  );
}
