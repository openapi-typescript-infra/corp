import openapiCreateClient from 'openapi-fetch';
import type { expect } from 'vitest';
import { test } from 'vitest';
import type { TestAPI } from '@vitest/runner';
import type { ServiceUnderTest } from '@openapi-typescript-infra/service-tester';
import { getReusableApp } from '@openapi-typescript-infra/service-tester';
import type { HSConfigurationSchema, HSServiceLocals } from '@justtellme/service';

type AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>;

export type PathSpec = object;

export interface ServiceUnderTestFixtures<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
> {
  app: ServiceUnderTest<SLocals>;
  client: ReturnType<typeof createClient<SLocals, Paths>>;
  locals: SLocals;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FixtureType = Record<string, any>;

type Fixtures<F extends FixtureType> = Parameters<typeof test.extend<F>>[0];
type Use<T> = (value: T) => Promise<void>;
interface Useless {
  expect: typeof expect;
}

function getApp<SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>>() {
  return getReusableApp<SLocals>();
}

export function createClient<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
>(app: ServiceUnderTest<SLocals>) {
  return openapiCreateClient<Paths>({
    baseUrl: `http://localhost:${app.locals.config.server.port}`,
  });
}

function extendServiceTest<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
>(fixtures?: Fixtures<Record<string, never>>): TestAPI<ServiceUnderTestFixtures<SLocals, Paths>>;
function extendServiceTest<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
  AdditionalFixtures extends FixtureType = FixtureType,
>(
  fixtures: Fixtures<AdditionalFixtures>,
): TestAPI<ServiceUnderTestFixtures<SLocals, Paths> & AdditionalFixtures>;
function extendServiceTest<
  SLocals extends AnyHSServiceLocals = HSServiceLocals<HSConfigurationSchema>,
  Paths extends PathSpec = PathSpec,
  AdditionalFixtures extends FixtureType = FixtureType,
>(
  fixtures: Fixtures<AdditionalFixtures> = {} as unknown as Fixtures<AdditionalFixtures>,
): TestAPI<ServiceUnderTestFixtures<SLocals, Paths> & AdditionalFixtures> {
  const fixturesWithAppLocals = {
    app: async ({ expect }: Useless, use: Use<ServiceUnderTest<SLocals>>) => {
      const testApp = await getApp<SLocals>();
      expect(testApp).toBeTruthy();
      await use(testApp as ServiceUnderTest<SLocals>);
    },
    locals: async ({ expect }: Useless, use: Use<SLocals>) => {
      const testApp = await getApp<SLocals>();
      expect(testApp).toBeTruthy();
      await use(testApp.locals as SLocals);
    },
    client: async (
      { expect }: Useless,
      use: Use<ReturnType<typeof createClient<SLocals, Paths>>>,
    ) => {
      const testApp = await getApp<SLocals>();
      expect(testApp).toBeTruthy();
      const client = createClient<SLocals, Paths>(testApp);
      await use(client);
    },
    ...fixtures,
  };

  return test.extend<ServiceUnderTestFixtures<SLocals, Paths> & AdditionalFixtures>(
    fixturesWithAppLocals as Fixtures<
      ServiceUnderTestFixtures<SLocals, Paths> & AdditionalFixtures
    >,
  );
}

export const serviceTest = {
  extend: extendServiceTest,
};
