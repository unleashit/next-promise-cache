# fetch-cache

[![NPM](https://img.shields.io/npm/l/@unleashit/fetch-cache.svg)](https://github.com/unleashit/fetch-cache/blob/master/LICENSE)
[![npm (scoped)](https://img.shields.io/npm/v/@unleashit/fetch-cache.svg)](https://www.npmjs.com/package/@unleashit/fetch-cache)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@unleashit/fetch-cache.svg)](https://bundlephobia.com/result?p=@unleashit/fetch-cache)

Wasn't satisfied with the black boxed way of data fetching in the new [Next JS 13 app directory](https://nextjs.org/blog/next-13#new-app-directory-beta), so I made this. This is also a wrapper around [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch), but slightly higher level and with a bit more control and insight into what is being cached. It's also browser compatible.

> This is an experimental package. Yes, it does basically reinvent the wheel of Next's fetch deduping but with some new features. There is a small caveat. If you use this with Next 13 RSCs and static rendering (the default), Next's patched fetch isn't prevented from also memoizing their values underneath this cache. This doesn't affect SSR (`no-store`, `force-dynamic`, etc.) and while it "feels" a bit ugly, it shouldn't have a negative effect on SSG or ISR. Ideally, they wouldn't have overwritten the native fetch, but it is what it is.   

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

- Node >= 16.8 in a Next JS 13 app directory environment
- Node v18+ (or 17.5 with experimental flag) for other environments without a patched Fetch

In Next JS 13 (app directory enabled), Fetch is patched to work down to 16.8.

## Setting up

If you are using this with Next JS and React Server Components, it's suggested to initialize `fetch-cache` within `React.cache` (provided by React) and import from a separate file. Since Next.Js has decided not to provide full access to the Request/Response objects (a mini tragedy if you ask me), React provides this helper which makes use of Async Context. You can for example use it to cache an instance of `fetch-cache` for the lifetime of each request (and throw out after).

```typescript
// services.ts

import API from "./api";
import { cache } from "react";

const baseurl = "https://amazing-products.com";

export const api = cache(() => new API({ baseurl }));

```
If you want to use on the client, don't wrap in `React.cache`. It only works on the server and isn't needed on the client.

```typescript
export const api = typeof window === "undefined"
    ? cache(() => new API({ baseurl }))
    : () => new API({ baseurl });

```

> Keep in mind `React.cache` takes a function. So being consistent between client and server will maintain the same calling syntax. 

Of course if you're not using Next 13 or React or want it only on the client, you don't need the above. If you have a custom server and want a fresh cache with each request, either add the instance to your request context or reset the cache in an early middleware with `api.invalidate('*')`.

## Using

Retrieving data is similar to how Next recommends using fetch. If you need the same data in multiple places, rather than prop drilling, just await the promise in each place you need it. Thanks to the cache, it will only actually be called once.

As a convenience, `fetch-cache` handles the double promise and error states. By default it will assume and attempt to return JSON, but you can specifify whatever format you need (text, blob, etc.). If the response contains a non-2xx status code, a `FetchCacheError` is thrown with the original `Response` and `status`. A general failure like a network issue throws the standard error.

>  Don't forget if you've exported a _function that returns the instance_, you have to call it first, either in advance or inline with each use.

```typescript jsx
import api from './services';

// React Server Component example. On the client (or server without RSCs), 
// call inside a use (once stable) or useEffect hook
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

// pass cache,revalidate or any other fetch options as normal
async function Page() {
    const products = await api<Products[]>()
        .get('/products', { cache: "force-cache", next: { revalidate: 60 } });
    
    // ...
}

```

## Api

> Keep in mind passing `opts` to fetch methods will be shallowly merged with defaults. For example, if you pass any custom headers, be sure to also include `Content-Type: application/json` if you need it.

### `new API(options)`

Creates a new instance of fetch cache. Note that by default, `defaultCacheTime` is set to `0`. This is only for the client (server is always cached per request), so if you want a cache on the client, you need to either specify a default here and/or override in individual fetches.

```typescript
type options = {
    baseurl: string;
    debug?: boolean | 'verbose'// false,
    defaultCacheTime?: number // 0 (seconds)
    maxCacheSize?: number // 200 (-1 for no limit)
}
```

### `api.get(options)`

```typescript
type ResponseTypes = "json" | "text" | "blob" | "arrayBuffer" | "formData"; // default is "json"

// NextExtendedFetchConfig is intersection of standard fetch request options with Next's
type FetchOpts = NextExtendedFetchConfig & { responseType?: ResponseTypes };

type GetHandlerArgs = string // pathname
    | {
    pathName: string;
    opts?: FetchOpts;
    cacheTime?: number; // seconds
};
```

If sent an `opts` object, it will be shallow merged over some common defaults and passed to Fetch.

By default, fetch will call and return `response.json()` after the initial response. Set the `responseType` property if you expect another data type. 


### `api.post(options)` `api.put(options)` `api.patch(options)` `api.delete(options)` `api.head(options)` `api.options(options)` 

```typescript
type OtherMethodArgs = [
    pathName: string,
    opts?: FetchOpts // same as get request (see above)
];
```

Same as GET except the other methods use a second argument for the options (and no cacheTime). Expects a JSON response by default, but can changed (see`api.get`). 

### `api.invalidate(key)`

Purges the specified key (pathname) from cache. Clears entire cache when passed an asterisk (*), 

```typescript
type key = string;
```

### `api.getCacheStats()`

Returns object with two properties: `values` (Map object of the current cache) and `cacheSize` (size).

### `api.logCache()`

Logs cache stats to stdout for debugging. Will output more verbose if API was instantiated with `debug: verbose'`.