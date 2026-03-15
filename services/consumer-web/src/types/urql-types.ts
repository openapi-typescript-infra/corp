export interface SerializedCombinedError<T = unknown> {
  name: string;
  message?: string;
  graphQLErrors?: {
    message: string;
    extensions?: {
      code?: string;
    };
  }[];
  networkError?: {
    cause?: {
      code: string;
    };
  };
  response?: T;
}
