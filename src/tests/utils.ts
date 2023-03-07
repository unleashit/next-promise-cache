import { vi } from "vitest";

export const nextTick = (time = 0): Promise<void> => {
  vi.useRealTimers();
  return new Promise((resolve): void => {
    setTimeout((): void => {
      resolve();
    }, time);
  });
};
