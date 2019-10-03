export interface Options {
  camelCase?: CamelCaseOptions;
  customMatcher?: string;
  paths?: string[];
}

export type CamelCaseOptions =
  | true
  | 'dashes'
  | 'dashesOnly'
  | 'only'
  | undefined;
