interface NextFetchRequestConfig {
  revalidate?: number | false;
}
type NextExtendedFetchConfig = RequestInit & {
  next?: NextFetchRequestConfig | undefined;
};

export type ResponseTypes =
  | "json"
  | "text"
  | "blob"
  | "arrayBuffer"
  | "formData";

type FetchOpts = NextExtendedFetchConfig & { responseType?: ResponseTypes };

export type HandlerArgs = [pathName: string, opts?: FetchOpts];
export type GetHandlerArgs = {
  pathName: string;
  opts?: FetchOpts;
  cacheTime?: number; // milliseconds
};
