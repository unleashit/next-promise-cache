import { NextPromiseCacheError } from "./NextPromiseCacheError";
import { type GetHandlerArgs, type HandlerArgs, ResponseTypes } from "./types";

const cache = Symbol("cache");
const handler = Symbol("mutate");
const handleResp = Symbol("handleResp");
const handleError = Symbol("handleError");
const shouldUseCache = Symbol("shouldUseCache");
const validate = Symbol("validate");
const setCache = Symbol("setCache");

let getCallsTotal = 0;

/*
 * Isomorphic promise cache for fetch and React.cache (when on the server). Compatible with
 * React Server Components and the NextJS 13 app directory.
 * Promises from `get` and `memo` are always cached on the server for the lifecycle of each request (cacheTime param is ignored)
 * Promises from `get` and `memo` on the client can be cached for a designated time (not cached by default)
 * @param API.baseurl Base url for the api
 * @param API.debug Debug output (cache hits, etc.)
 * @param API.maxValues Maximum number of values to be stored in cache
 * @returns Instance of API with standard fetch and other methods
 * */
export default class API {
  private readonly _baseurl;

  private readonly _defaultCacheTime;

  private readonly _maxCacheSize;

  private readonly _isNextJSFetch;

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
    // Detect a patched fetch. Leaving in for now for possible future use...
    this._isNextJSFetch = (fetch as typeof fetch & { __nextPatched: boolean }).__nextPatched;

    if (this._debug) {
      console.log("[npc] New Fetch Cache instantiated");
    }
    if (this._debug === "verbose" && this._isNextJSFetch) {
      console.log("[npc] Next.JS patched Fetch detected");
    }
  }

  async get<T>(path: string): Promise<T>;

  async get<T>(getOpts: GetHandlerArgs): Promise<T>;

  async get<T>(arg: string | GetHandlerArgs) {
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

    const encodedPath = pathName;
    const responseType = opts?.responseType || "json";

    // throw error if user is using JS and provides wrong responseType
    this[validate](responseType);

    this._getCalls++;
    getCallsTotal++;

    // return from cache if exits and not expired and is running on client
    if (this[shouldUseCache](encodedPath, cacheTime)) {
      this._debug && console.log("[npc] Fetch cache hit");
      this._debug && this.logCache();

      return this[cache].get(encodedPath)?.promise as Promise<T>;
    }

    // otherwise, make a new request
    const defaultOpts: RequestInit = {
      headers: new Headers({ "Content-Type": "application/json" }),
      method: "get",
    };
    const finalOpts = {
      ...defaultOpts,
      ...(opts && { ...opts }),
    };

    const { href } = new URL(pathName, this._baseurl);

    const promise = fetch(href, finalOpts)
      .then((resp) => this[handleResp]<T>(resp, responseType))
      .catch((e) => {
        this[handleError](e);
      });

    this[setCache](encodedPath, promise);

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

  async memo<T>(
    key: string,
    fn: () => Promise<T>,
    cacheTime = this._defaultCacheTime
  ) {
    this._getCalls++;
    getCallsTotal++;
    const encodedPath = key;

    if (this[shouldUseCache](encodedPath, cacheTime)) {
      this._debug && console.log("[npc] Fetch cache hit");
      this._debug && this.logCache();

      return this[cache].get(encodedPath)?.promise as Promise<T>;
    }

    const promise = fn();

    this[setCache](encodedPath, promise);

    return promise;
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
    const responseType = opts?.responseType || "json";

    // throw error if user is using JS and provided wrong responseType
    this[validate](responseType);

    try {
      const resp = await fetch(href, finalOpts);

      return await this[handleResp](resp, responseType);
    } catch (e) {
      this[handleError](e);
    }
  }

  async [handleResp]<T>(resp: Response, responseType: ResponseTypes) {
    if (!resp.ok) {
      this._debug === "verbose" && console.error(resp);
      throw new NextPromiseCacheError(
        new Error(`Server responded with status ${resp.status}`),
        resp
      );
    }

    // if client expects JSON, check for empty or invalid response
    // if invalid JSON, try to parse as text
    if (responseType === 'json' && resp.status > 200 && resp.status < 300) {
      let clone: Response | undefined;
      try {
        clone = resp.clone();
        return await resp.json() as Promise<T>;
      } catch(e) {
        this._debug && console.log('[npc] received empty or invalid JSON response, attempting to parse as text');
        try {
          return clone?.text() as Promise<T>;
        } catch(e) {
          this._debug && console.log('[npc] attempt failed to parse response as text')
          throw e;
        }
      }
    }

    return responseType === "json"
      ? (resp.json() as Promise<T>)
      : responseType === "text"
      ? (resp.text() as Promise<T>)
      : responseType === "blob"
      ? (resp.blob() as Promise<T>)
      : responseType === "arrayBuffer"
      ? (resp.arrayBuffer() as Promise<T>)
      : // must be formData
        (resp.formData() as Promise<T>);
  }

  [handleError](e: unknown) {
    this._debug === "verbose" && console.error(e);

    // if (e instanceof Error || (e as Error)?.message) {
    //   throw new NextPromiseCacheError(e as Error, 500);
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
    return new Date().getTime() - value.timestamp < cacheTime * 1000; // convert secs to ms;
  }

  [setCache]<T>(path: string, promise: Promise<T>) {
    // check if path exists then purge, since it will be stale
    this.invalidate(path);

    // purge first in value when cache is full
    if (this._maxCacheSize !== -1 && this[cache].size === this._maxCacheSize) {
      this.invalidate(this[cache].keys().next().value);
    }

    this[cache].set(path, {
      promise,
      timestamp: new Date().getTime(),
    });

    this._debug && this.logCache();
  }

  [validate](responseType: ResponseTypes) {
    if (
      !["json", "text", "blob", "arraybuffer", "formData"].includes(
        responseType
      )
    ) {
      throw new Error(
        "Unrecognized responseType. Options are json, text, blob, arrayBuffer or formData"
      );
    }
  }

  // base64Encode(str: string) {
  //   return typeof window !== 'undefined'
  //     ? window.btoa(unescape(encodeURIComponent(str)))
  //     : Buffer.from(str, 'utf8').toString('base64');
  // }

  invalidate(key: string) {
    if (key === "*") {
      this[cache] = new Map();
      this._debug && console.log("[npc] cache cleared");
    } else if (this[cache].has(key)) {
      this[cache].delete(key);
      this._debug && console.log(`[npc] ${key} invalidated`);
    }
  }

  getCacheStats() {
    return {
      values: this[cache],
      cacheSize: this[cache].size,
    };
  }

  logCache() {
    console.log('[npc]', {
      getCallsInstance: this._getCalls,
      getCallsTotal,
      size:
        this._debug === "verbose"
          ? Object.fromEntries(this[cache])
          : this[cache].size,
    });
  }
}
