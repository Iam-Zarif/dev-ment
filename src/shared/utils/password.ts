import bcrypt from "bcryptjs";
import { config } from "../../config/index.js";

export const hashPassword = async (password: string): Promise<string> => {
	return bcrypt.hash(password, config.bcrypt.saltRounds);
};

export const comparePassword = async (
	password: string,
	hashedPassword: string,
): Promise<boolean> => {
	return bcrypt.compare(password, hashedPassword);
};
