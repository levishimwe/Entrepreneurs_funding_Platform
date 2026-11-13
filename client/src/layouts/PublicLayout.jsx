import { Outlet, useLocation } from 'react-router-dom';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome';
import { useSiteTheme } from '../lib/siteTheme';

// Pages drawn edge to edge on the public site design (they set their own
// backgrounds). Every other public page sits on the console canvas inside the
// same top bar and footer. All of them follow the visitor's light/dark choice.
const FULL_BLEED = ['/signin', '/register', '/ventures', '/opportunities', '/about'];
const fullBleed = (pathname) => FULL_BLEED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export default function PublicLayout() {
  const { pathname } = useLocation();
  useSiteTheme();

  // The home page draws its own top bar and footer around its sections.
  if (pathname === '/') return <Outlet />;

  // min-h-dvh + flex-1 main: short pages still fill the screen with the footer at the bottom.
  return (
    <div className="site-public flex min-h-dvh flex-col bg-s-canvas font-sans text-s-ink">
      <SiteHeader />
      <main className={fullBleed(pathname) ? 'flex flex-1 flex-col' : 'adm flex-1 bg-[var(--adm-page)]'}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
