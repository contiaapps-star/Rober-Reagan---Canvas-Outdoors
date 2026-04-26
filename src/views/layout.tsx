import type { FC, PropsWithChildren } from 'hono/jsx';

type NavKey = 'dashboard' | 'settings' | 'health' | 'sign-out';

interface NavItem {
  key: NavKey;
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/' },
  { key: 'settings', label: 'Settings', href: '/settings/competitors' },
  { key: 'health', label: 'Health', href: '/health/channels' },
  { key: 'sign-out', label: 'Sign Out', href: '/auth/logout' },
];

interface LayoutProps {
  title?: string;
  active?: NavKey;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  title,
  active,
  children,
}) => {
  const fullTitle = title
    ? `${title} · FlowCore Marketing Sensor`
    : 'FlowCore Marketing Sensor';

  return (
    <html lang="en" data-tw="loaded" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>{fullTitle}</title>
        <link rel="stylesheet" href="/css/output.css" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <script src="/js/htmx.min.js" defer></script>
      </head>
      <body class="min-h-screen flex bg-flowcore-bg text-flowcore-text-primary">
        <Sidebar active={active} />
        <main class="flex-1 px-8 py-6 overflow-x-auto">{children}</main>
      </body>
    </html>
  );
};

const Sidebar: FC<{ active?: NavKey }> = ({ active }) => (
  <aside class="fc-sidebar" data-testid="sidebar">
    <div class="fc-sidebar__brand">FLOWCORE</div>
    <div class="fc-sidebar__sublabel">Marketing Sensor</div>
    <nav class="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <a
          href={item.href}
          class={
            active === item.key
              ? 'fc-sidebar__nav-item fc-sidebar__nav-item--active'
              : 'fc-sidebar__nav-item'
          }
        >
          {item.label}
        </a>
      ))}
    </nav>
    <div class="mt-auto text-[11px] text-flowcore-muted">
      v0.1.0 · Phase 0
    </div>
  </aside>
);
