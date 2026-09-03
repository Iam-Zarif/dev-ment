import type { ApiErrorDetail } from "../types/index.js";

type PrismaLikeError = Error & {
	code?: string;
	meta?: {
		target?: unknown;
		field_name?: unknown;
		modelName?: unknown;
	};
};

export type HandledDatabaseError = {
	statusCode: number;
	message: string;
	errors: ApiErrorDetail[];
};

const getTarget = (target: unknown): string | undefined => {
	if (Array.isArray(target)) {
		return target.map(String).join(", ");
	}

	if (typeof target === "string") {
		return target;
	}

	return undefined;
};

export const handlePrismaError = (
	error: PrismaLikeError,
): HandledDatabaseError | null => {
	if (!error.code) {
		return null;
	}

	if (error.code === "P2002") {
		const target = getTarget(error.meta?.target);

		return {
			statusCode: 409,
			message: "Duplicate value already exists",
			errors: [
				{
					path: target,
					message: target
						? `${target} already exists`
						: "Unique constraint violation",
					code: error.code,
				},
			],
		};
	}

	if (error.code === "P2025") {
		return {
			statusCode: 404,
			message: "Requested resource was not found",
			errors: [
				{
					message: "Database record not found",
					code: error.code,
				},
			],
		};
	}

	if (error.code === "P2003") {
		return {
			statusCode: 409,
			message: "Operation violates a database relationship",
			errors: [
				{
					message: "Foreign key constraint violation",
					code: error.code,
				},
			],
		};
	}

	if (error.code === "P2000") {
		return {
			statusCode: 400,
			message: "Provided value is too long",
			errors: [
				{
					message: "Database field value exceeds the allowed length",
					code: error.code,
				},
			],
		};
	}

	if (error.code === "P2011") {
		return {
			statusCode: 400,
			message: "Required value cannot be null",
			errors: [
				{
					message: "Null constraint violation",
					code: error.code,
				},
			],
		};
	}

	return null;
};
