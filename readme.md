## fetch-cache

Wasn't satisfied with the black boxed way of data fetching in the new [Next JS 13 app directory](https://nextjs.org/blog/next-13#new-app-directory-beta), so I made this. This is also a wrapper around [fetch](https://developer.mozilla.org/en-US/docs/Web/API/fetch), but with a bit more control and insight into what is being cached. It's also browser compatible.

### Features

- Like Next JS Fetch deduping it caches promises, not values, avoiding race conditions and extra network requests
- On the server, it always caches for full request lifecycle (when instantiated in a React.cache)
- Can manually invalidate values or entire cache
- Configurable cache size (FIFO when full) 
- Optional time based cache on client
- Handles the fetch `ok` and error conditions
- Types include the Next extensions to fetch, so you can add for example `{ next: { revalidate: 10 } }` as normal
- All HTTP methods are available but caches GET requests only
- Can debug cache with a flag

### Install

```
npm install @unleashit/fetch-cache
```

### Requirements
Fetch on node requires Node v18+ (or 17.5 with experimental flag).

### Setting up

If you are using this with Next JS and React Server Components, `fetch-cache` should be wrapped with `React.cache` (provided by Next) and imported from a separate file. This will cache the instance for the lifecycle of the request (and recreate for each new request).

```typescript
// services.ts

import API from "./api";
import { cache } from "react";

const host = "https://amazing-products.com";

export const api = cache(() => new API(host));

```
```typescript
// if you want to  use on the client, don't wrap in cache() since React.cache currently only works on the servewr

export const api = typeof window === "undefined"
    ? cache(() => new API(host))
    : () => new API(host);

```
### Using

Retrieving data is similar to how Next recomends using fetch. If you need the same data in multiple places, rather than prop drilling, just await the promise in each place you need it. Thanks to the cache, it will only actually be called once. As a convenience, `fetch-cache` handles the double promise and error states. `FetchCacheError` extends Error and includes the `status` code when available. 

```typescript jsx
import api from './services';

async function Page() {
    const products = await api<Products[]>.get('/products');
    
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


