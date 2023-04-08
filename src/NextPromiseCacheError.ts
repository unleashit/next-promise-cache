export class NextPromiseCacheError extends Error {
  status: number;
  response: Response;

  constructor(err: Error, fetchResponse: Response) {
    super(err.message || "Fetch Cache error");

    // Set the prototype explicitly for builtin objs when using <= ES5 target
    // https://www.typescriptlang.org/docs/handbook/2/classes.html
    Object.setPrototypeOf(this, NextPromiseCacheError.prototype);

    this.name = err.name || "Fetch Cache error";
    this.status = fetchResponse.status || 500;
    this.response = fetchResponse;
    if (err.stack) {
      this.stack = err.stack;
    }
  }
}
