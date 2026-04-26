import type { FC } from 'hono/jsx';

export const ErrorView: FC<{
  status: number;
  title: string;
  message: string;
  requestId?: string;
  stack?: string | null;
}> = ({ status, title, message, requestId, stack }) => {
  const fullTitle = `${status} · ${title}`;
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
      <body class="min-h-screen flex bg-flowcore-bg text-flowcore-text-primary">
        <main
          class="flex-1 flex items-center justify-center px-6 py-12"
          data-testid="error-page"
        >
          <div class="max-w-lg text-center">
            <div class="text-flowcore-accent font-bold tracking-[0.18em] mb-2">
              FLOWCORE · MARKETING SENSOR
            </div>
            <div
              class="text-6xl font-bold text-flowcore-text-primary mb-3"
              data-testid="error-status"
            >
              {status}
            </div>
            <h1 class="text-xl font-semibold mb-3">{title}</h1>
            <p
              class="text-flowcore-text-secondary mb-6"
              data-testid="error-message"
            >
              {message}
            </p>
            {requestId ? (
              <p class="text-flowcore-muted text-xs font-mono mb-4">
                request id: <span data-testid="error-request-id">{requestId}</span>
              </p>
            ) : null}
            <div class="flex items-center justify-center gap-3">
              <a href="/" class="btn-primary">
                Back to dashboard
              </a>
              <a
                href="javascript:history.back()"
                class="btn-ghost"
                data-testid="error-back"
              >
                Go back
              </a>
            </div>
            {stack ? (
              <details class="mt-8 text-left" data-testid="error-stack">
                <summary class="text-flowcore-text-secondary text-xs cursor-pointer">
                  Stack trace (development only)
                </summary>
                <pre class="mt-3 fc-pre text-xs bg-flowcore-surface p-4 rounded border border-flowcore-border overflow-auto">
                  {stack}
                </pre>
              </details>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
};
