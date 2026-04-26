import type { FC, PropsWithChildren } from 'hono/jsx';

import { IconChevronDown } from './icons.js';

export type NavKey =
  | 'dashboard'
  | 'settings'
  | 'settings.competitors'
  | 'settings.keywords'
  | 'settings.inspiration'
  | 'health'
  | 'sign-out';

export type FlashMessage = {
  type: 'success' | 'error';
  message: string;
};

interface LayoutProps {
  title?: string;
  active?: NavKey;
  flash?: FlashMessage | null;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  title,
  active,
  flash,
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
        <script src="/js/settings.js" defer></script>
      </head>
      <body class="min-h-screen flex bg-flowcore-bg text-flowcore-text-primary">
        <PageLoader />
        <Sidebar active={active} />
        <main class="flex-1 px-8 py-6 overflow-x-auto relative">
          {flash ? <FlashBanner flash={flash} /> : null}
          {children}
          <ModalRoot />
        </main>
      </body>
    </html>
  );
};

const FlashBanner: FC<{ flash: FlashMessage }> = ({ flash }) => (
  <div
    class={
      flash.type === 'success'
        ? 'fc-flash fc-flash--success'
        : 'fc-flash fc-flash--error'
    }
    data-testid="flash"
    role="status"
  >
    {flash.message}
  </div>
);

const ModalRoot: FC = () => (
  <div id="modal-root" data-testid="modal-root"></div>
);

const PageLoader: FC = () => (
  <div
    id="fc-page-loader"
    class="fc-page-loader"
    data-testid="page-loader"
    aria-hidden="true"
  ></div>
);

const isSettingsActive = (active?: NavKey): boolean =>
  active === 'settings' ||
  active === 'settings.competitors' ||
  active === 'settings.keywords' ||
  active === 'settings.inspiration';

const Sidebar: FC<{ active?: NavKey }> = ({ active }) => {
  const settingsOpen = isSettingsActive(active);
  return (
    <aside class="fc-sidebar" data-testid="sidebar">
      <div class="fc-sidebar__brand">FLOWCORE</div>
      <div class="fc-sidebar__sublabel">Marketing Sensor</div>
      <nav class="flex flex-col gap-1">
        <NavLink href="/" label="Dashboard" isActive={active === 'dashboard'} />
        <SettingsGroup active={active} open={settingsOpen} />
        <NavLink
          href="/health/channels"
          label="Health"
          isActive={active === 'health'}
        />
        <SignOutForm />
      </nav>
      <div class="mt-auto text-[11px] text-flowcore-muted">
        v0.1.0 · Phase 7
      </div>
    </aside>
  );
};

const NavLink: FC<{ href: string; label: string; isActive: boolean }> = ({
  href,
  label,
  isActive,
}) => (
  <a
    href={href}
    class={
      isActive
        ? 'fc-sidebar__nav-item fc-sidebar__nav-item--active'
        : 'fc-sidebar__nav-item'
    }
    data-active={isActive ? 'true' : 'false'}
  >
    {label}
  </a>
);

const SettingsGroup: FC<{ active?: NavKey; open: boolean }> = ({ active, open }) => (
  <div
    class="fc-sidebar__group"
    data-testid="sidebar-settings-group"
    data-open={open ? 'true' : 'false'}
  >
    <button
      type="button"
      class={
        isSettingsActive(active)
          ? 'fc-sidebar__nav-item fc-sidebar__nav-item--active fc-sidebar__group-toggle'
          : 'fc-sidebar__nav-item fc-sidebar__group-toggle'
      }
      data-toggle="settings"
      aria-expanded={open ? 'true' : 'false'}
      data-active={isSettingsActive(active) ? 'true' : 'false'}
    >
      <span>Settings</span>
      <span class="fc-sidebar__chevron">
        <IconChevronDown />
      </span>
    </button>
    <div
      class={open ? 'fc-sidebar__sub' : 'fc-sidebar__sub fc-sidebar__sub--hidden'}
      data-testid="sidebar-settings-sub"
    >
      <SubNavLink
        href="/settings/competitors"
        label="Competitors"
        isActive={active === 'settings.competitors'}
      />
      <SubNavLink
        href="/settings/keywords"
        label="Keywords"
        isActive={active === 'settings.keywords'}
      />
      <SubNavLink
        href="/settings/inspiration"
        label="Inspiration"
        isActive={active === 'settings.inspiration'}
      />
    </div>
  </div>
);

const SignOutForm: FC = () => (
  <form method="post" action="/auth/logout" data-testid="sign-out-form">
    <button
      type="submit"
      class="fc-sidebar__nav-item w-full text-left"
      data-testid="sign-out"
    >
      Sign Out
    </button>
  </form>
);

const SubNavLink: FC<{ href: string; label: string; isActive: boolean }> = ({
  href,
  label,
  isActive,
}) => (
  <a
    href={href}
    class={
      isActive
        ? 'fc-sidebar__nav-sub-item fc-sidebar__nav-sub-item--active'
        : 'fc-sidebar__nav-sub-item'
    }
    data-active={isActive ? 'true' : 'false'}
  >
    {label}
  </a>
);
