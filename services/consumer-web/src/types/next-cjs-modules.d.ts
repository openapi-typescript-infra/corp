/**
 * Type declarations for Next.js CJS modules imported with .js extensions.
 *
 * Next.js ships CommonJS modules whose package.json does not include an
 * "exports" map that covers the `.js` suffix. When our ESM code uses
 * `import ... from 'next/router.js'` (required by Node 22+ `--experimental-
 * strip-types`), TypeScript cannot find the declarations. Re-exporting from
 * the bare specifier keeps type-checking happy.
 */

declare module 'next/router.js' {
  export * from 'next/router';
  export { useRouter } from 'next/router';
}

declare module 'next/head.js' {
  export { default } from 'next/head';
}

declare module 'next/document.js' {
  export * from 'next/document';
  export type { DocumentProps } from 'next/document';
  export { default, Head, Html, Main, NextScript } from 'next/document';
}

declare module 'next/app.js' {
  export type { AppProps } from 'next/app';
  export * from 'next/app';
}

declare module 'next/navigation.js' {
  export * from 'next/navigation';
  export { usePathname, useRouter, useSearchParams } from 'next/navigation';
}
