// One error type for every "expected" failure: bad input, sold out, not found...
// The `code` is stable and machine-readable. The `message` is for humans.
// Later builds map each code to an HTTP status in one place.
export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
