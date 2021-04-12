export const getRoleScaling = (roles, scaling) => {
	const sortedRoles = roles.sort((a, b) => -1 * a.comparePositionTo(b));
	for (const role of sortedRoles) {
		const scale = scaling?.[role.id];
		if (scale != undefined) return scale;
	}
};

export const getLevel = xp => Math.max(0, Math.floor(Math.log(xp - 100)));

export const getXp = level => (5 / 6) * level * (2 * level * level + 27 * level + 91);
