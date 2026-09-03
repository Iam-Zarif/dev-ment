import type { RequestHandler } from "express";
import type { ZodType, ZodTypeAny } from "zod";
import { AppError } from "../errors/index.js";

type RequestValidationSchema = {
	body?: ZodTypeAny;
	params?: ZodTypeAny;
	query?: ZodTypeAny;
};

const formatIssues = (
	issues: Array<{
		path: PropertyKey[];
		message: string;
		code: string;
	}>,
) => {
	return issues.map((issue) => ({
		path: issue.path.map(String).join("."),
		message: issue.message,
		code: issue.code,
	}));
};

const validatePart = (schema: ZodType, value: unknown) => {
	return schema.safeParse(value);
};

export const validateRequest = (
	schemas: RequestValidationSchema,
): RequestHandler => {
	return (req, _res, next) => {
		if (schemas.body) {
			const result = validatePart(schemas.body, req.body);

			if (!result.success) {
				return next(
					new AppError(
						400,
						"Validation failed",
						formatIssues(result.error.issues),
					),
				);
			}

			req.body = result.data;
		}

		if (schemas.params) {
			const result = validatePart(schemas.params, req.params);

			if (!result.success) {
				return next(
					new AppError(
						400,
						"Validation failed",
						formatIssues(result.error.issues),
					),
				);
			}

			Object.assign(req.params, result.data);
		}

		if (schemas.query) {
			const result = validatePart(schemas.query, req.query);

			if (!result.success) {
				return next(
					new AppError(
						400,
						"Validation failed",
						formatIssues(result.error.issues),
					),
				);
			}

			Object.assign(req.query, result.data);
		}

		return next();
	};
};
