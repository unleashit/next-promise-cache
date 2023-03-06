export class FetchCacheError extends Error {
  status: number;

  constructor(err: Error, status = 500) {
    super(err.message || 'Fetch Cache error');

    // Set the prototype explicitly for builtin objs when using <= ES5 target
    // https://www.typescriptlang.org/docs/handbook/2/classes.html
    Object.setPrototypeOf(this, FetchCacheError.prototype);

    this.name = err.name || 'Fetch Cache error';
    this.status = status;
    if (err.stack) {
      this.stack = err.stack;
    }
  }
}
