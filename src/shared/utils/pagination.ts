import { APP_CONSTANTS } from "../constants/index.js";
import type {
	PaginationMeta,
	PaginationOptions,
	SortOrder,
} from "../types/index.js";

export type CalculatedPagination = {
	page: number;
	limit: number;
	skip: number;
	sortBy: string;
	sortOrder: SortOrder;
};

export const calculatePagination = (
	options: PaginationOptions,
): CalculatedPagination => {
	const page = Math.max(options.page ?? APP_CONSTANTS.DEFAULT_PAGE, 1);

	const limit = Math.min(
		Math.max(options.limit ?? APP_CONSTANTS.DEFAULT_LIMIT, 1),
		APP_CONSTANTS.MAX_LIMIT,
	);

	const sortOrder: SortOrder = options.sortOrder === "asc" ? "asc" : "desc";

	return {
		page,
		limit,
		skip: (page - 1) * limit,
		sortBy: options.sortBy ?? "createdAt",
		sortOrder,
	};
};

export const createPaginationMeta = (
	page: number,
	limit: number,
	total: number,
): PaginationMeta => {
	return {
		page,
		limit,
		total,
		totalPages: Math.ceil(total / limit),
	};
};
