import type { NextPage } from 'next';
import type { AppProps } from 'next/app.js';

export type NextPageProps<P = object, IP = P> = NextPage<P, IP>;

export type HSAppProps = AppProps<{ splitKey?: string }> & {
  Component: NextPageProps;
};
