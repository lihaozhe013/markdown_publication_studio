declare module 'js-yaml' {
  export function load(
    input: string,
    options?: { maxAliasCount?: number },
  ): unknown;
}
