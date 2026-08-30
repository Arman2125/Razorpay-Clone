export function success(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  notFound: (entity = 'Resource') =>
    new ApiError(404, `${entity.toUpperCase()}_NOT_FOUND`, `${entity} not found`),
  badRequest: (message, code = 'BAD_REQUEST') => new ApiError(400, code, message),
  unauthorized: (message = 'Authentication required') =>
    new ApiError(401, 'UNAUTHORIZED', message),
  conflict: (message, code = 'CONFLICT') => new ApiError(409, code, message),
  ambiguous: (
    candidates,
    message = 'Multiple payments match this request. Ask which one before proceeding.',
    code = 'AMBIGUOUS_PAYMENT'
  ) => new ApiError(409, code, message, { candidates }),
};
