export const pick = <T extends Record<string, unknown>, K extends keyof T>(
	source: T,
	keys: readonly K[],
): Pick<T, K> => {
	const result = {} as Pick<T, K>;

	for (const key of keys) {
		if (source[key] !== undefined) {
			result[key] = source[key];
		}
	}

	return result;
};
