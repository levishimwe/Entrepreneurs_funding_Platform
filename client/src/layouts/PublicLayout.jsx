import { Outlet, useLocation } from 'react-router-dom';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome';

// Pages drawn edge to edge on the public site design (they set their own
// backgrounds). Every other public page sits on the light canvas inside the
// same dark top bar and footer.
const FULL_BLEED = new Set(['/signin', '/register', '/ventures', '/opportunities']);

export default function PublicLayout() {
  const { pathname } = useLocation();

  // The home page draws its own top bar and footer around its sections.
  if (pathname === '/') return <Outlet />;

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6f9] font-sans">
      <SiteHeader />
      <main className={FULL_BLEED.has(pathname) ? 'flex flex-1 flex-col text-[#111827]' : 'adm flex-1 bg-[var(--adm-page)]'}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
