export type ApiErrorDetail = {
	path?: string;
	message: string;
	code?: string;
};

export type PaginationMeta = {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

export type SortOrder = "asc" | "desc";

export type PaginationOptions = {
	page?: number;
	limit?: number;
	sortBy?: string;
	sortOrder?: SortOrder;
};
