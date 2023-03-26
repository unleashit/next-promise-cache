import { vi } from "vitest";

export const nextTick = (time = 0): Promise<void> => {
  vi.useRealTimers();
  return new Promise((resolve): void => {
    setTimeout((): void => {
      resolve();
    }, time);
  });
};

export const mockPromise = (data: string, delay = 0) => {
  vi.useRealTimers();
  return new Promise((res) => {
    setTimeout(() => {
      res(data);
    }, delay);
  });
};
