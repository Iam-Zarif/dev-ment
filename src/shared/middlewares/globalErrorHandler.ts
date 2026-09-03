import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { config } from "../../config/index.js";
import { AppError, handlePrismaError } from "../errors/index.js";
import { logger } from "../utils/index.js";

export const globalErrorHandler: ErrorRequestHandler = (
	error,
	req,
	res,
	_next,
) => {
	let statusCode = 500;
	let message = "Something went wrong";
	let errors: Array<{
		path?: string;
		message: string;
		code?: string;
	}> = [];

	if (error instanceof AppError) {
		statusCode = error.statusCode;
		message = error.message;
		errors = error.errors;
	} else if (error instanceof ZodError) {
		statusCode = 400;
		message = "Validation failed";
		errors = error.issues.map((issue) => ({
			path: issue.path.map(String).join("."),
			message: issue.message,
			code: issue.code,
		}));
	} else if (error instanceof Error) {
		const databaseError = handlePrismaError(error);

		if (databaseError) {
			statusCode = databaseError.statusCode;
			message = databaseError.message;
			errors = databaseError.errors;
		} else if (!config.app.isProduction) {
			message = error.message;
		}
	}

	logger.error(
		{
			err: error,
			method: req.method,
			url: req.originalUrl,
			statusCode,
		},
		message,
	);

	res.status(statusCode).json({
		success: false,
		message,
		errors,
	});
};
