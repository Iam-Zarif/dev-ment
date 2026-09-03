import type { ApiErrorDetail } from "../types/index.js";

export class AppError extends Error {
	public readonly statusCode: number;
	public readonly errors: ApiErrorDetail[];
	public readonly isOperational: boolean;

	constructor(
		statusCode: number,
		message: string,
		errors: ApiErrorDetail[] = [],
		isOperational = true,
	) {
		super(message);

		this.name = "AppError";
		this.statusCode = statusCode;
		this.errors = errors;
		this.isOperational = isOperational;

		Error.captureStackTrace(this, this.constructor);
	}
}
