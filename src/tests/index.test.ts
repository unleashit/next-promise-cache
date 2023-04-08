import { mockPromise, nextTick } from "./utils";
import API from "../index";
import { users, User, newUser } from "./fixtures";
import { mockFetch } from "./mockFetch";
import { NextPromiseCacheError } from "../NextPromiseCacheError";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

let api: API;

vi.stubGlobal("fetch", vi.fn());

beforeEach(() => {
  mockFetch();
  // if window is undefined, it is assumed running on server
  (global as any).window = undefined;
  api = new API({ baseurl: "https://example.com", defaultCacheTime: 5 });
});

afterEach(() => {
  (fetch as Mock).mockClear();
});

describe("GET requests", () => {
  it("makes a get request and returns data", async () => {
    const resp = await api.get<User[]>("/users");

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/users",
      expect.any(Object)
    );
    expect(resp[0].name).toEqual(users[0].name);
    expect(resp[1].id).toEqual(users[1].id);
  });

  it("makes parallel GET requests and returns data", async () => {
    const [user1, user2, user3] = await Promise.all([
      api.get<User>("/users/1"),
      api.get<User>("/users/2"),
      api.get<User>("/users/3"),
    ]);

    expect(user1).toEqual(users[0]);
    expect(user2).toEqual(users[1]);
    expect(user3).toEqual(users[2]);
  });

  it("can be called with or without base url", async () => {
    // without base url case has already been proven above
    await api.get<User[]>("https://example.com/users");
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/users",
      expect.any(Object)
    );
  });

  it("throws NextPromiseCacheError with 404 status and fetch's Response when sent to bad url", async () => {
    let thrownError;
    try {
      await api.get("/users/bling");
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(NextPromiseCacheError);
    expect((thrownError as NextPromiseCacheError).message).toEqual(
      "Server responded with status 404"
    );
    // ensure fetch response is included in error
    expect((thrownError as NextPromiseCacheError).response).toHaveProperty(
      "ok"
    );
    // expect(async () => await api.get("/users/bling")).rejects.toThrow(
    //   NextPromiseCacheError
    // );
  });

  describe("Cache tests (server)", () => {
    it("cached promise is always returned on repeat requests, cacheTime is ignored", async () => {
      await api.get<User[]>("/users");
      await api.get<User[]>("/users");
      await api.get<User[]>("/users");

      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/users",
        expect.any(Object)
      );
      expect((fetch as Mock).mock.calls).toHaveLength(1);
    });

    it.skip("default fetch cache property set in NextJS 13 env", async () => {
      await api.get<User[]>("/users");

      expect(fetch).toHaveBeenCalledWith("https://example.com/users", {
        method: "get",
        headers: expect.any(Object),
      });

      Object.defineProperty(fetch, "__nextPatched", {
        value: true,
        enumerable: true,
        writable: true,
        configurable: true,
      });

      api = new API({ baseurl: "https://example.com" });

      await api.get<User[]>("/users");

      expect(fetch).toHaveBeenCalledWith("https://example.com/users", {
        method: "get",
        headers: expect.any(Object),
        cache: "no-store",
      });

      delete (fetch as any).__nextPatched;
    });
  });

  describe("Cache tests (browser)", () => {
    it("in browser env, promises are not cached by default", async () => {
      // simulate a browser env
      (global as any).window = {};
      // reinstantiate here since beforeEach() adds a cacheTime
      api = new API({ baseurl: "https://example.com" });

      await api.get<User[]>("/users");
      await api.get<User[]>("/users");
      expect((fetch as Mock).mock.calls).toHaveLength(2);
    });

    it("promises are cached for the designated time", async () => {
      // simulate a browser env
      (global as any).window = {};

      await api.get<User[]>({ pathName: "/users", cacheTime: 1 });
      await nextTick(500);
      await api.get<User[]>({ pathName: "/users", cacheTime: 1 });

      expect((fetch as Mock).mock.calls).toHaveLength(1);

      await nextTick(2000);
      await api.get<User[]>({ pathName: "/users", cacheTime: 1 });
      await api.get<User[]>({ pathName: "/users", cacheTime: 1 });
      await api.get<User[]>({ pathName: "/users", cacheTime: 1 });

      expect((fetch as Mock).mock.calls).toHaveLength(2);
    });

    it("respects max cache size and invalidates FIFO", async () => {
      (global as any).window = {};
      // api with max cache size 10
      api = new API({ baseurl: "https://example.com", maxCacheSize: 10 });
      const promises = Array(10)
        .fill(undefined)
        .map((_, i) => api.get({ pathName: `/users/${i + 1}`, cacheTime: 30 }));

      await Promise.all(promises);
      expect(api.getCacheStats().cacheSize).toEqual(10);

      await api.get<User>({ pathName: "/users/11", cacheTime: 30 });
      await api.get<User>({ pathName: "/users/12", cacheTime: 30 });

      const { values, cacheSize } = api.getCacheStats() as any;
      expect(cacheSize).toEqual(10);

      // first two values (user 1 and 2) should be evicted
      expect(values.keys().next().value).toEqual("/users/3");

      // verify value is still returned from cache when expected
      expect((fetch as Mock).mock.calls).toHaveLength(12);
      await api.get<User>({ pathName: "/users/12", cacheTime: 30 });
      expect((fetch as Mock).mock.calls).toHaveLength(12);
    });
  });

  it("cache can be invalidated by key or in full", async () => {
    (global as any).window = {};

    await api.get<User>("/users/1");
    await api.get<User>("/users/2");
    api.invalidate("/users/1");
    await api.get<User>("/users/1");
    await api.get<User>("/users/2");
    expect((fetch as Mock).mock.calls).toHaveLength(3);

    // cache is emptied after passing a `*` flag
    api.invalidate("*");
    expect(api.getCacheStats().cacheSize).toEqual(0);
  });
});

describe("Mutate requests", () => {
  const user4 = JSON.stringify(newUser);

  it("makes a POST request with correct data", async () => {
    const resp = await api.post<User[]>("/users/post", {
      body: user4,
    });
    const calledWith = (fetch as Mock).mock.calls[0][1];
    expect(calledWith.body).toEqual(user4);
    expect(resp).toEqual({ success: true });
  });
  it("makes a POST request with default headers", async () => {
    await api.post<User[]>("/users/post", {
      body: user4,
    });
    const calledWith = (fetch as Mock).mock.calls[0][1];

    expect(calledWith.method).toEqual("post");
    expect(Object.fromEntries(calledWith.headers)).toEqual({
      "content-type": "application/json",
    });
  });

  it("handles PUT, PATCH and DELETE http verbs", async () => {
    const resp = await api.put<User[]>("/users/put", {
      body: user4,
    });

    const calledWith = (fetch as Mock).mock.calls[0][1];
    expect(calledWith.method).toEqual("put");
    expect(resp).toEqual({ success: true });

    const resp2 = await api.patch<User[]>("/users/patch", {
      body: user4,
    });

    const calledWith2 = (fetch as Mock).mock.calls[1][1];
    expect(calledWith2.method).toEqual("patch");
    expect(resp2).toEqual({ success: true });

    const resp3 = await api.delete<User[]>("/users/delete", {
      body: user4,
    });

    const calledWith3 = (fetch as Mock).mock.calls[2][1];
    expect(calledWith3.method).toEqual("delete");
    expect(resp3).toEqual({ success: true });
  });
});

describe("memo", () => {
  it("memoed promises return expected values", async () => {
    const num1 = await api.memo("num1", () => Promise.resolve(1));
    const num2 = await api.memo("num2", () => Promise.resolve(2));
    // TODO: mock this so fragile network call not needed
    const user = await api.memo<User>("user", () =>
      fetch("https://jsonplaceholder.typicode.com/users/1").then((r) =>
        r.json()
      )
    );

    expect(num1).toEqual(1);
    expect(num2).toEqual(2);
    expect(user.id).toEqual("1");
  });

  it("in a *server* (always cached) env, multiple memos with same key return the first promise", async () => {
    await api.memo("test", () => mockPromise("one"));
    await api.memo("test", () => mockPromise("two"));
    const test = await api.memo("test", () => mockPromise("three"));
    expect(test).toEqual("one");
  });

  it("in a *browser* env with no cache, memos with same key return the latest promise", async () => {
    // simulate a browser env
    (global as any).window = {};

    await api.memo("pet", () => mockPromise("cat"), 0);
    await api.memo("pet", () => mockPromise("dog"), 0);
    const call2 = await api.memo("pet", () => mockPromise("mouse"), 0);

    expect(call2).toEqual("mouse");
  });

  it("in a *browser* env, cached memos with same key return the original promise", async () => {
    // simulate a browser env
    (global as any).window = {};

    // with cache (defaultCacheTime set above to 5 secs)
    await api.memo("pet", () => mockPromise("cat"));
    await api.memo("pet", () => mockPromise("dog"));
    const pet = await api.memo("pet", () => mockPromise("mouse"));
    expect(pet).toEqual("cat");
  });

  it("in a *browser* env, cached memos with same key expire properly", async () => {
    // simulate a browser env
    (global as any).window = {};

    // with cache and enough time passing to invalidate first call
    await api.memo("pet", () => mockPromise("cat"), 1);
    await nextTick(1250);
    await api.memo("pet", () => mockPromise("dog"), 1);
    const pet2 = await api.memo("pet", () => mockPromise("mouse"), 1);
    expect(pet2).toEqual("dog");
  });
});

describe("other", () => {
  it("handles OPTIONS and HEAD http verbs", async () => {
    const resp = await api.options("/users/options");

    const calledWith = (fetch as Mock).mock.calls[0][1];
    expect(calledWith.method).toEqual("options");
    expect(resp).toEqual("'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD'");

    await api.head<User[]>("/users/head");

    const calledWith2 = (fetch as Mock).mock.calls[1][1];
    expect(calledWith2.method).toEqual("head");
  });

  // it('throws when fetch fails', async () => {
  //   jest.resetAllMocks();
  //   api = new API('https:///bad-url');
  //   expect(async () => await api.get('/users')).rejects.toThrow(
  //     "Couldn't fetch. Status: 404",
  //   );
  // });
});
