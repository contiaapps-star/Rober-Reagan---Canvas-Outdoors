import type { FC } from 'hono/jsx';

export const LoginView: FC<{
  error?: string | null;
  email?: string;
  next?: string;
}> = ({ error, email, next }) => {
  const fullTitle = 'Sign in · FlowCore Marketing Sensor';
  const action = next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login';
  return (
    <html lang="en" data-tw="loaded" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>{fullTitle}</title>
        <link rel="stylesheet" href="/css/output.css" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
      </head>
      <body class="min-h-screen flex items-center justify-center bg-flowcore-bg text-flowcore-text-primary">
        <main class="w-full max-w-sm px-6 py-8" data-testid="login-page">
          <div class="text-center mb-8">
            <div class="text-flowcore-accent font-bold tracking-[0.18em] text-xl">
              FLOWCORE
            </div>
            <div class="text-flowcore-text-secondary text-[11px] tracking-[0.16em] uppercase mt-1">
              Marketing Sensor
            </div>
          </div>
          <div
            class="mb-6 rounded-lg border-2 border-flowcore-accent bg-flowcore-accent/10 px-5 py-4 text-center"
            data-testid="login-demo-credentials"
            role="note"
          >
            <div class="text-flowcore-accent font-bold tracking-[0.16em] uppercase text-xs mb-2">
              Demo Access
            </div>
            <div class="text-flowcore-text-primary text-sm font-mono leading-relaxed">
              <div>
                <span class="text-flowcore-text-secondary">user:</span>{' '}
                <span class="font-semibold">robert@reagan.com</span>
              </div>
              <div>
                <span class="text-flowcore-text-secondary">pass:</span>{' '}
                <span class="font-semibold">robert123</span>
              </div>
            </div>
          </div>
          <div class="fc-panel px-6 py-6">
            <h1 class="text-lg font-semibold mb-4">Sign in</h1>
            {error ? (
              <div class="fc-form-error mb-4" data-testid="login-error" role="alert">
                {error}
              </div>
            ) : null}
            <form method="post" action={action} class="flex flex-col gap-4" data-testid="login-form">
              <label class="flex flex-col gap-1">
                <span class="fc-form-label">Email</span>
                <input
                  type="email"
                  name="email"
                  required
                  autocomplete="username"
                  value={email ?? ''}
                  class="fc-input"
                  data-testid="login-email"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="fc-form-label">Password</span>
                <input
                  type="password"
                  name="password"
                  required
                  autocomplete="current-password"
                  class="fc-input"
                  data-testid="login-password"
                />
              </label>
              <button type="submit" class="btn-primary" data-testid="login-submit">
                Sign in
              </button>
            </form>
          </div>
          <p class="text-center text-flowcore-text-secondary text-xs mt-6">
            Access restricted. Contact your admin if you need an account.
          </p>
        </main>
      </body>
    </html>
  );
};
