import type { NextPageContext } from 'next';

interface ErrorPageProps {
  statusCode: number;
}

function ErrorPage({ statusCode }: ErrorPageProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '50vh',
      }}>
      <p>{statusCode === 404 ? 'Page not found' : `Server error (${statusCode})`}</p>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err, req }: NextPageContext): ErrorPageProps => {
  const statusCode = res?.statusCode ?? (err as { statusCode?: number })?.statusCode ?? 500;

  if (typeof window === 'undefined' && statusCode >= 500) {
    const expressReq = req as typeof req & {
      app?: {
        locals?: { logger?: { error: (obj: object, msg: string) => void } };
      };
    };
    const logger = expressReq?.app?.locals?.logger;

    if (err) {
      if (logger) {
        logger.error({ err, stack: (err as Error).stack }, `Next.js render error: ${err.message}`);
      } else {
        console.error('Next.js render error:', (err as Error).stack || err.message || err);
      }
    } else {
      // Next.js sometimes swallows the error before reaching _error in production.
      // Log a breadcrumb so we at least know this code path was hit.
      const url = req?.url ?? 'unknown';
      const msg = `Next.js returned ${statusCode} for ${url} but no error object was provided`;
      if (logger) {
        logger.error({ url, statusCode }, msg);
      } else {
        console.error(msg);
      }
    }
  }

  return { statusCode };
};

export default ErrorPage;
