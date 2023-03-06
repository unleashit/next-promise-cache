import { users, notFound } from './fixtures';

const routes = {
  '/users': users,
  '/users/1': users[0],
  '/users/2': users[1],
  '/users/3': users[2],
  '/users/4': users[3],
  '/users/5': users[4],
  '/users/6': users[5],
  '/users/7': users[6],
  '/users/8': users[7],
  '/users/9': users[8],
  '/users/10': users[9],
  '/users/11': users[10],
  '/users/12': users[11],
  '/users/post': { success: true },
  '/users/put': { success: true },
  '/users/patch': { success: true },
  '/users/delete': { success: true },
  '/users/head': { success: true },
  '/users/options': "'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD'",
} as Record<string, any>;

export function mockFetch(status = 200) {
  (fetch as jest.Mock).mockImplementation((url: string) => {
    const { pathname } = new URL(url);
    const res = routes[pathname] || notFound;
    const finalStatus = res === notFound ? 404 : status;

    return Promise.resolve({
      json: async () => Promise.resolve(res),
      ok: finalStatus >= 200 && finalStatus <= 299,
      status: finalStatus,
    });
  });
}

export function mockFetchWith<T>(val?: T, status = 200) {
  return (fetch as jest.Mock).mockImplementation(() => {
    const ok = status >= 200 && status <= 299;
    return Promise.resolve({
      json: async () => (ok ? (Promise.resolve(val) as T) : Promise.resolve()),
      ok,
      status,
    });
  });
}
