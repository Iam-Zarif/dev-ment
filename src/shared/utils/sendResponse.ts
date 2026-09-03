import type { Response } from "express";

type SendResponseOptions<T> = {
	statusCode: number;
	message: string;
	data: T;
};

export const sendResponse = <T>(
	res: Response,
	options: SendResponseOptions<T>,
): Response => {
	return res.status(options.statusCode).json({
		success: true,
		message: options.message,
		data: options.data,
	});
};
