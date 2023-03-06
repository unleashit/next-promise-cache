export const nextTick = (time = 0): Promise<void> => {
  jest.useRealTimers();
  return new Promise((resolve): void => {
    setTimeout((): void => {
      resolve();
    }, time);
  });
};
