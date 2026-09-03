import { seedAdmin } from "./seedAdmin.js";
import { seedDemoUsers } from "./seedDemoUsers.js";
import { seedPlans } from "./seedPlans.js";

export const ensureSeedData = async () => {
	await seedPlans();
	await seedAdmin();
	await seedDemoUsers();
};