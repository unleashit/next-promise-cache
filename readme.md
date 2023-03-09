# fetch-cache

[![NPM](https://img.shields.io/npm/l/@unleashit/fetch-cache.svg)](https://github.com/unleashit/fetch-cache/blob/master/LICENSE)
[![npm (scoped)](https://img.shields.io/npm/v/@unleashit/fetch-cache.svg)](https://www.npmjs.com/package/@unleashit/fetch-cache)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@unleashit/fetch-cache.svg)](https://bundlephobia.com/result?p=@unleashit/fetch-cache)

Wasn't satisfied with the black boxed way of data fetching in the new [Next JS 13 app directory](https://nextjs.org/blog/next-13#new-app-directory-beta), so I made this. This is also a wrapper around [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch), but stightly higher level and with a bit more control and insight into what is being cached. It's also browser compatible.

# Features

- Like Next JS Fetch deduping it caches promises, not values, avoiding race conditions and extra network requests
- On the server in RSCs or elsewhere, it can be made to cache for the full request/response lifetime (when instantiated in a `React.cache`)
- Optional time based cache on client
- Can debug, access or invalidate values or entire cache
- Configurable cache size (FIFO when full) 
- All HTTP methods are available but caches GET requests only
- Handles the fetch double promise, basic error conditions and adds common headers
- Types include the Next extensions to fetch, so you can add for example Next's revalidate options as usual
- Customize/override most things

## Install

```
npm install @unleashit/fetch-cache
```

## Requirements
Fetch on Node requires Node v18+ (or 17.5 with experimental flag).

## Setting up

If you are using this with Next JS and React Server Components, `fetch-cache` should be wrapped within `React.cache` (provided by Next) and imported from a separate file. This will cache the instance for the lifetime of the request (and throw out on each new request).

```typescript
// services.ts

import API from "./api";
import { cache } from "react";

const baseurl = "https://amazing-products.com";

export const api = cache(() => new API({ baseurl }));

```
If you want to  use on the client, don't wrap in `React.cache`. It only works on the server and isn't needed on the client.

```typescript
export const api = typeof window === "undefined"
    ? cache(() => new API({ baseurl }))
    : () => new API({ baseurl });

```

> **_NOTE:_**  Keep in mind `React.cache` takes a function. So being consistent between client and server will maintain the same calling syntax. 

Of course if you're not using RSCs or want it only on the client, you don't need the above. Just instantiate and use as normal. If you have a custom server and want a fresh cache with each request, either create a new instance per request or reset the cache with `api.invalidate('*')`.

## Using

Retrieving data is similar to how Next recommends using fetch. If you need the same data in multiple places, rather than prop drilling, just await the promise in each place you need it. Thanks to the cache, it will only actually be called once. As a convenience, `fetch-cache` handles the double promise and error states. It returns data in whatever format is received (json, text, blob, etc). Otherwise, a `FetchCacheError` is thrown in both general failure and non-2xx response conditions containing the `Response` and `status` code when available. 

> **_NOTE:_**  Don't forget if you've exported a _function that returns the instance_, you have to call it first, either in advance or inline with each use.


```typescript jsx
import api from './services';

async function Page() {
    const products = await api<Products[]>().get('/products');
    
    return (
        <>
            { 
                products.map(product => (
                    <h3>{product.title}</h3>
                    // ...
                ))
            }
        </>
    )
}

```

## Api

> **_NOTE:_**  Keep in mind passing `opts` to fetch methods will be shallowly merged with defaults. For example, if you pass any custom headers, be sure to also include `Content-Type: application/json` if you need it.

### `new API(options)`

Creates a new instance of fetch cache. Note that by default, `defaultCacheTime` is set to `0`. This is only for the client (server is always cached per request), so if you want a cache on the client, you need to either specify a default here and/or override in individual fetches.

```typescript
type options = {
    baseurl: string;
    debug?: boolean | 'verbose'// false,
    defaultCacheTime?: number // 0 (milliseconds)
    maxCacheSize?: number // 200 (-1 for no limit)
}
```

### `api.get(options)`

```typescript
type options = string // pathname
 | {
  pathName: string;
  opts?: NextExtendedFetchConfig; // intersection of standard fetch options with Next's
  cacheTime?: number; // defaultCacheTime
};
```

### `api.post(options)` `api.put(options)` `api.patch(options)` `api.delete(options)` `api.head(options)` `api.options(options)` 

```typescript
type options = {
  pathName: string;
  opts?: Response;
};
```

### `api.invalidate(key)`

Purges the specified key (pathname) from cache. Clears entire cache when passed an asterisk (*), 

```typescript
type key = string;
```

### `api.getCacheStats()`

Returns object with two properties: `values` (Map object of the current cache) and `cacheSize` (size).

### `api.logCache()`

Logs cache stats to stdout for debugging. Will output more verbose if API was instantiated with `debug: verbose'`.