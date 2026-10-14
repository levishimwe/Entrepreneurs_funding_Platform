const { ZodError } = require('zod');
const multer = require('multer');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const forbidden = (message = 'You do not have permission to do that.') => new HttpError(403, message);
const notFound = (message = 'Not found.') => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 10 MB or smaller.' : `Upload error: ${err.message}`;
    return res.status(400).json({ error: message });
  }
  if (err instanceof HttpError) {
    const { fields, ...details } = err.details || {};
    return res.status(err.status).json({
      error: err.message,
      ...(fields ? { fields } : {}),
      ...(Object.keys(details).length ? { details } : {}),
    });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'A record with these details already exists.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

module.exports = { HttpError, badRequest, forbidden, notFound, conflict, notFoundHandler, errorHandler };
