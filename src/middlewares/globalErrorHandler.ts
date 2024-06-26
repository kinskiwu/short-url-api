import { Request, Response } from 'express';
import { CustomError } from '../config/errors';
import { logger } from '../config/winston';

/**
 * Global error handler for Express that intercepts and standardizes error responses.
 * Logs error details for internal review and returns a structured error message to the client.
 * This handler ensures a consistent response format for all errors.
 *
 * @param err - Error object potentially containing `status` and `message`.
 * @param req - Express Request object, not directly used here.
 * @param res - Express Response object for sending the error response.
 */
type ErrorHandlerError = Error | CustomError;

export const globalErrorHandler = (
  err: ErrorHandlerError | null | undefined,
  req: Request,
  res: Response
) => {
  if (err instanceof CustomError) {
    logger.error(`${err.constructor.name}: ${err.message}`);
    return res.status(err.status).json({ err: err.message });
  } else if (err) {
    logger.error(`Unexpected error: ${err.message}`);
    return res.status(500).json({ err: 'An unexpected error occurred.' });
  } else {
    logger.error('Unexpected error: Error object is null or undefined');
    return res.status(500).json({ err: 'An unexpected error occurred.' });
  }
};
