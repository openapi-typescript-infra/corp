export type Envs = 'development' | 'local' | 'production';

export interface LoginInfo {
  email: string;
  password: string;
  otpSecret: string;
}

export interface EnvConfig {
  type: 'development' | 'production';
  // Base time for QUICKLY, SLOWLY, GLACIAL. See waits.ts for how
  // this is transformed in CI and locally.
  timeBase: {
    QUICK: number;
    SLOW: number;
    GLACIAL: number;
  };
  api: string;
  graphqlApi: string;
  web: {
    host: string;
  };
  users: {
    default: LoginInfo;
  };
}
