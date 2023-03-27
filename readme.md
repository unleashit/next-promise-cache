# next-promise-cache

[![NPM](https://img.shields.io/npm/l/next-promise-cache.svg)](https://github.com/unleashit/next-promise-cache/blob/master/LICENSE)
[![npm (scoped)](https://img.shields.io/npm/v/next-promise-cache.svg)](https://www.npmjs.com/package/next-promise-cache)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/next-promise-cache.svg)](https://bundlephobia.com/result?p=next-promise-cache)

Wasn't satisfied with the black boxed and inconsistent way of data fetching in the new [Next JS 13 app directory](https://nextjs.org/blog/next-13#new-app-directory-beta), so I made this. This is an attempt to combine a [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch) wrapper similar to the one provided by Next.Js with other data fetching methods like raw DB queries or anything that returns a promise, into a single deduping/caching api. In addition, it is browser compatible and offers a bit more control and insight into what is being cached.

> This is an experimental package that is geared towards Next.JS and React server components (but not a requirement). Yes, it does in part reinvent the wheel of Next's fetch deduping, but it also allows for better consistency and adds some interesting features. There is a small caveat. If you use this with Next 13 RSCs, Next's patched fetch isn't prevented from also memoizing its values underneath this cache. While that may "feel" a bit ugly, it shouldn't have any measurable drawbacks and all of your Next options (including route segment configs) will be respected. Ideally they wouldn't have overwritten the native fetch, but it is what it is.   

# Features

- Like Next JS Fetch deduping it caches promises, not values, avoiding race conditions and extra network requests
- On the server in RSCs or elsewhere, it can be made to cache for the full request/response lifetime (when instantiated in a `React.cache`)
- Optional time based cache on client
- Can debug, access or invalidate values or entire cache
- Configurable cache size (FIFO when full) 
- All HTTP methods are available plus a `memo` method to cache any other type of promise
- Only `get` requests or the provided `memo` can be cached. Other HTTP verbs are pass through.
- Handles the fetch double promise, basic error conditions and adds common headers
- Types include the Next extensions to fetch, so you can add for example Next's revalidate options as usual
- Customize/override most things

## Install

```
npm install next-promise-cache
```

## Requirements

- Node >= 16.8 in a Next JS 13 app directory environment
- Node v18+ (or 17.5 with experimental flag) for other environments without a patched Fetch

In Next JS 13 (app directory enabled), Fetch is patched to work down to 16.8. `React.cache` is currently only available in experimental or Next 13 builds.

## Setting up

If you are using this with Next JS and React Server Components, it's suggested to initialize `next-promise-cache` within `React.cache` and import from a separate file. Since Next.Js has decided not to provide full access to the Request/Response objects (a mini tragedy if you ask me), React provides this helper which makes use of Async Context. You can for example use it to cache an instance of `next-promise-cache` for the lifetime of each request (and throw out after).

```typescript
// services.ts

import PromiseCache from "next-promise-cache";
import { cache } from "react";

const baseurl = "https://amazing-products.com";

export const api = cache(() => new PromiseCache({ baseurl }));

```
To use isomorphically, the setup can be a bit particular because you only want to wrap `next-promise-cache` in `React.cache` on the server. One option is to create separate files for client and server. But you can manage within a single file like this:

```typescript
const clientInstance =
    typeof window !== "undefined" &&
    // to use cache on the client, you can set a default as shown here
    // and/or override in individual GET requests
    new PromiseCache({ baseurl, defaultCacheTime: 1800 });

export const api = typeof window === "undefined"
    ? cache(() => new PromiseCache({ baseurl }))
    : () => clientInstance;
```

> Keep in mind `React.cache` returns a function. The reason for also exporting the client instance as a function is just to maintain consistent calling syntax in both environments. A workaround to prevent the client function from creating a new instance each time is to initialize it in a separate variable. Unfortunately, simply memoizing both with `React.cache` won't work on the client since it would reinstantiate on page changes.

Of course if you're not using Next 13 or React or want it only on the client, the above doesn't apply. If you have a custom server and want a fresh cache with each request, either add the instance to your request context or reset the cache in an early middleware with `api.invalidate('*')`.

## Using

Retrieving data is similar to how Next recommends using fetch. If you need the same data in multiple places, rather than prop drilling, just await the promise in each place you need it. Thanks to the cache, it will only actually be called once.

As a convenience, `next-promise-cache` handles the double promise and error states. By default it will assume and attempt to return JSON, but you can specify whatever format you need (text, blob, etc.). If the response contains a non-2xx status code, a `NextPromiseCacheError` is thrown with the original `Response` and `status`. A general failure like a network issue throws the standard error.

>  Don't forget if you've exported a _function that returns the instance_, you have to call it first, either in advance or inline with each use.

```typescript jsx
import api from './services';

// React Server Component example. On the client (or server without RSCs), 
// call inside a use hook (once stable) or useEffect.
async function Page() {
    // Notice the api().get syntax. This is because api is exported as a function
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

// pass fetch options as normal, including Next's caching params
async function Page() {
    const products = await api<Products[]>()
        .get('/products', { cache: "force-cache", next: { revalidate: 60 } });
    
    // ...
}

```

## Api

> Keep in mind passing `opts` to fetch methods will be shallowly merged with defaults. For example, if you pass any custom headers, be sure to also include `Content-Type: application/json` if you need it.

### `new NextPromiseCache(options)`

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

Calls `fetch` with the `get` method. If sent an `opts` object, it will be shallow merged over some common defaults and passed to fetch.

By default, fetch will call and return `response.json()` after the initial response. Set the `responseType` property if you expect another data type. 


### `api.post(options)` `api.put(options)` `api.patch(options)` `api.delete(options)` `api.head(options)` `api.options(options)` 

```typescript
type OtherMethodArgs = [
    pathName: string,
    opts?: FetchOpts // same as get request (see above)
];
```

Same as GET except the other methods use a second argument for the options (and no cacheTime). Expects a JSON response by default, but can changed (see`api.get`). 

### `api.memo(options)`

```typescript
type options = [key: string, fn: <T>() => Promise<T>, cacheTime?: number]; // cacheTime defaults to `defaultCacheTime` or 0
```

Accepts and optionally caches any type of promise. You can for example use it to memoize a database request, or anything else that returns a promise. The behavior is otherwise the same as `api.get()`. Both methods always cache on the server. So as with fetch, you can await the same memoed promise in different parts of the app and they will be deduped as long as they share the same `key` name. On the client (also like fetch), memoed promises are only actually cached if `cacheTime` is set. You can set it as a default when you initialze `next-promise-cache`, and/or provide as a third argument in `api.memo()`. The latter overrides any default.

```typescript jsx
async function Page() {
    // Notice the api().memo syntax. This is because api is exported as a function
    const result = await api<{ rows: { message: string }[] }>()
        .memo(() => client.query('SELECT $1::text as message', ['Hello world!']));
    
    return (
        <div>The message for today is: {result.rows[0].message}</div>
    )
}
```

> Note that any cache is shared between `api.memo()` and `api.get()`. A name collision is unlikely since the key names created by `api.get()` are URL paths, but good to keep in mind.   

### `api.invalidate(key)`

Purges the specified key (pathname) from cache. Clears entire cache when passed an asterisk (*), 

```typescript
type key = string;
```

### `api.getCacheStats()`

Returns object with two properties: `values` (Map object of the current cache) and `size` (cache size).

### `api.logCache()`

Logs cache stats to stdout for debugging. Will output more verbose if API was instantiated with `debug: verbose'`.