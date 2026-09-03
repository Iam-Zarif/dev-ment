import { seedAdmin } from "./seedAdmin.js";

export const ensureSeedData = async () => {
	await seedAdmin();
};