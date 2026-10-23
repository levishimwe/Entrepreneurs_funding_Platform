import { Children, cloneElement } from 'react';

// Continuously moving row (home page). Pauses on hover and keyboard focus, or
// with the page's pause control (`paused`); with reduced motion, or when
// paused, it becomes a normal row that scrolls and swipes sideways.
// Short lists are repeated (`minItems`) so the moving row never shows a gap;
// repeats are hidden from screen readers and from the paused view.
export default function Marquee({ children, label, reverse = false, paused = false, seconds = 40, minItems = 10, className = '' }) {
  const items = Children.toArray(children);
  if (!items.length) return null;
  const repeats = [];
  const copies = Math.ceil(minItems / items.length);
  for (let n = 1; n < copies; n += 1) {
    items.forEach((item, i) => repeats.push(cloneElement(item, { key: `r${n}-${i}`, 'aria-hidden': true, inert: true, className: `${item.props.className || ''} marquee-repeat` })));
  }
  return (
    <div className={`marquee ${className}`} data-paused={paused ? 'true' : 'false'} role="region" aria-label={label}>
      <div className={`marquee-track ${reverse ? 'marquee-reverse' : ''}`} style={{ '--marquee-duration': `${seconds}s` }}>
        <ul className="marquee-group">
          {items}
          {repeats}
        </ul>
        {/* The second copy makes the loop seamless; screen readers skip it. */}
        <ul className="marquee-group marquee-copy" aria-hidden="true" inert>
          {items}
          {repeats}
        </ul>
      </div>
    </div>
  );
}
