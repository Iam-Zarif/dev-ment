import type { RequestHandler } from "express";
import { AppError } from "../errors/index.js";

export const notFound: RequestHandler = (req, _res, next) => {
	next(new AppError(404, `Route ${req.method} ${req.originalUrl} not found`));
};
