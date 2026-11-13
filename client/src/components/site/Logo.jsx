import { Link } from 'react-router-dom';

// The ALU logo, used as supplied (never redrawn). The files live in
// src/assets/brand/ and are picked at build time, best first:
//   on a dark background:  alu-logo-dark.svg → alu-logo.svg → alu-logo.png
//   on a light background: alu-logo-light.svg → alu-logo.svg → alu-logo.png
// So adding an SVG (or a light/dark variant) there needs no code change.
// alu-logo.png is the original artwork with its 2px light edge cropped off.
const FILES = import.meta.glob('../../assets/brand/alu-logo*.{svg,png}', { eager: true, query: '?url', import: 'default' });
const file = (name) => FILES[`../../assets/brand/${name}`];
const SOURCES = {
  dark: file('alu-logo-dark.svg') || file('alu-logo.svg') || file('alu-logo.png'),
  light: file('alu-logo-light.svg') || file('alu-logo.svg') || file('alu-logo.png'),
};
// Intrinsic size of alu-logo.png; keeps the box stable while it loads.
const WIDTH = 712;
const HEIGHT = 218;

/**
 * `on` is the background the logo sits on: "dark", "light", or "auto" to
 * follow the page theme (data-theme on <html>). `name` is the product name
 * set as real text after a subtle divider (`nameClassName` styles that pair,
 * e.g. to hide it on narrow screens); `size` is the logo height in px.
 */
export default function Logo({ to = '/', on = 'auto', name = 'Ventures', size = 32, label, className = '', nameClassName = '', textClassName = '', onClick }) {
  const img = (src, extra = '') => (
    <img
      src={src}
      alt="African Leadership University"
      width={WIDTH}
      height={HEIGHT}
      decoding="async"
      style={{ height: size, width: 'auto' }}
      className={`block max-w-none shrink-0 object-contain ${extra}`}
    />
  );
  const sameFile = SOURCES.dark === SOURCES.light;
  // A gap or text size passed in replaces the default one.
  const gap = (cls) => (/(^|\s)gap-/.test(cls) ? '' : 'gap-3');
  const textSize = /(^|\s)text-\[/.test(textClassName) ? '' : 'text-[15px]';
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-label={label || `${name ? `ALU ${name}` : 'African Leadership University'} home`}
      className={`inline-flex min-h-11 min-w-0 items-center ${gap(className)} rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--s-focus,#60a5fa)] ${className}`}
    >
      {on === 'auto' && !sameFile ? (
        <>
          {img(SOURCES.light, 'dark:hidden')}
          {img(SOURCES.dark, 'hidden dark:block')}
        </>
      ) : (
        img(on === 'light' ? SOURCES.light : SOURCES.dark)
      )}
      {name && (
        <span className={`flex min-w-0 items-center ${gap(nameClassName)} ${nameClassName}`}>
          <span className="h-5 w-px shrink-0 bg-current opacity-20" aria-hidden="true" />
          <span className={`min-w-0 truncate ${textSize} font-semibold leading-none tracking-[-0.2px] ${textClassName}`}>{name}</span>
        </span>
      )}
    </Link>
  );
}
