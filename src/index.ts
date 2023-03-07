import { FetchCacheError } from "./FetchCacheError";
import { type GetOpts, type HandlerArgs } from "./types";

const cache = Symbol("cache");
const handler = Symbol("mutate");
const handleResp = Symbol("handleResp");
const handleError = Symbol("handleError");
const shouldUseCache = Symbol("shouldUseCache");

const removeUndefined = (val: unknown[]) => val.filter((v) => v !== undefined);

let getCallsTotal = 0;

/*
 * Isomorphic promise cache for fetch and React.cache (when on the server). Compatible with
 * React Server Components and the NextJS 13 app directory.
 * Promises from GET requests are always cached on the server for the lifecycle of each request (cacheTime param is ignored)
 * Promises from GET requests on the client can be cached for a designated time (not cached by default)
 * @param baseurl - Base url for the api
 * @param debug - Debug output (cache hits, etc.)
 * @param maxValues - Maximum number of values to be stored in cache
 * @returns Instance of API with standard fetch methods
 * */
export default class API {
  private readonly _baseurl;

  private readonly _defaultCacheTime;

  private readonly _maxCacheSize;

  private readonly _debug;

  private _getCalls = 0;

  [cache]: Map<string, { promise: Promise<unknown>; timestamp: number }> =
    new Map();

  constructor({
    baseurl,
    debug = false,
    defaultCacheTime = 0,
    maxCacheSize = 200,
  }: {
    baseurl: string;
    defaultCacheTime?: number;
    maxCacheSize?: number;
    debug?: boolean | "verbose";
  }) {
    this._baseurl = baseurl;
    this._defaultCacheTime = defaultCacheTime;
    this._maxCacheSize = maxCacheSize;
    this._debug = debug;

    this._debug && console.log("-- New Fetch Cache instantiated --");
  }

  async get<T>(path: string): Promise<T>;

  async get<T>(getOpts: GetOpts): Promise<T>;

  async get<T>(arg: string | GetOpts) {
    const {
      pathName,
      opts,
      cacheTime = this._defaultCacheTime,
    } = typeof arg === "string"
      ? {
          pathName: arg,
          opts: undefined,
          cacheTime: undefined,
        }
      : arg;

    this._getCalls++;
    getCallsTotal++;
    const encodedPath = pathName;

    // return from cache if exits and not expired and is running on client
    if (this[shouldUseCache](encodedPath, cacheTime)) {
      this._debug && console.log("-- Fetch cache hit --");
      this._debug && this.logCache();

      return this[cache].get(encodedPath)?.promise as Promise<T>;
    }

    // otherwise, make a new request
    const { href } = new URL(pathName, this._baseurl);

    const promise = fetch(
      ...(removeUndefined([href, opts]) as Parameters<typeof fetch>)
    )
      .then((resp) => this[handleResp]<T>(resp))
      .catch((e) => {
        this[handleError](e);
      });

    // check if path exists then purge, since it will be stale
    this.invalidate(encodedPath);

    // purge first in value when cache is full
    if (this._maxCacheSize !== -1 && this[cache].size === this._maxCacheSize) {
      this.invalidate(this[cache].keys().next().value);
    }

    this[cache].set(encodedPath, {
      promise,
      timestamp: new Date().getTime(),
    });

    this._debug && this.logCache();

    return promise;
  }

  async post<T>(...args: HandlerArgs) {
    return this[handler]("post", ...args) as Promise<T>;
  }

  async put<T>(...args: HandlerArgs) {
    return this[handler]("put", ...args) as Promise<T>;
  }

  async patch<T>(...args: HandlerArgs) {
    return this[handler]("patch", ...args) as Promise<T>;
  }

  async delete<T>(...args: HandlerArgs) {
    return this[handler]("delete", ...args) as Promise<T>;
  }

  async head<T>(...args: HandlerArgs) {
    return this[handler]("head", ...args) as Promise<T>;
  }

  async options<T>(...args: HandlerArgs) {
    return this[handler]("options", ...args) as Promise<T>;
  }

  async [handler](
    method: string,
    pathName: HandlerArgs[0],
    opts?: HandlerArgs[1]
  ) {
    const defaultOpts = {
      headers: new Headers({ "Content-Type": "application/json" }),
      method,
    };
    const finalOpts = {
      ...defaultOpts,
      ...(opts && { ...opts }),
    };
    const { href } = new URL(pathName, this._baseurl);

    try {
      const resp = await fetch(href, finalOpts);

      return await this[handleResp](resp);
    } catch (e) {
      this[handleError](e);
    }
  }

  async [handleResp]<T>(resp: Response) {
    if (!resp.ok) {
      this._debug === "verbose" && console.error(resp);
      throw new FetchCacheError(
        new Error(`Problem fetching. Status: ${resp.status}`),
        resp
      );
    }
    return resp.json() as Promise<T>;
  }

  [handleError](e: unknown) {
    this._debug === "verbose" && console.error(e);

    // if (e instanceof Error || (e as Error)?.message) {
    //   throw new FetchCacheError(e as Error, 500);
    // }

    throw e;
  }

  [shouldUseCache](encodedPath: string, cacheTime: number) {
    const value = this[cache].get(encodedPath);
    if (!value) return false;

    /**
     * if value exists on server, always return from cache
     * since its assumed the cache lifetime is per request
     * TODO: consider allowing cache expiration on server for longer lived/shareable use cases?
     */
    if (typeof window === "undefined") return true;

    // on the client, invalidate cache on expiration
    return new Date().getTime() - value.timestamp < cacheTime;
  }

  // base64Encode(str: string) {
  //   return typeof window !== 'undefined'
  //     ? window.btoa(unescape(encodeURIComponent(str)))
  //     : Buffer.from(str, 'utf8').toString('base64');
  // }

  invalidate(key: string) {
    if (key === "*") {
      this[cache] = new Map();
      this._debug && console.log("-- Cache cleared --");
    } else if (this[cache].has(key)) {
      this[cache].delete(key);
      this._debug && console.log(`-- ${key} invalidated --`);
    }
  }

  getCacheStats() {
    return {
      values: this[cache],
      cacheSize: this[cache].size,
    };
  }

  logCache() {
    console.log({
      getCallsInstance: this._getCalls,
      getCallsTotal,
      cache:
        this._debug === "verbose"
          ? Object.fromEntries(this[cache])
          : this[cache].size,
    });
  }
}
