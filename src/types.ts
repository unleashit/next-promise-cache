interface NextFetchRequestConfig {
  revalidate?: number | false;
}
type NextExtendedFetchConfig = RequestInit & {
  next?: NextFetchRequestConfig | undefined;
};
export type HandlerArgs = [pathName: string, opts?: NextExtendedFetchConfig];
export type GetOpts = {
  pathName: string;
  opts?: NextExtendedFetchConfig;
  cacheTime?: number; // milliseconds
};
