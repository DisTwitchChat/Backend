import { MessageEmbed } from "discord.js";
import { DiscordClient } from "../../utils/initClients";

const getDmEmbed = ({ user, action, role }) =>
	new MessageEmbed()
		.setTitle(`Role ${action === "add" ? "Added" : "Removed"}`)
		.setAuthor(DiscordClient.user.tag, DiscordClient.user.displayAvatarURL())
		.setDescription(`${action === "add" ? "Added" : "Removed"} the Role **${role.name}**`)
		.setTimestamp(new Date());

const removeRole = async ({ member, role, DMuser }) => {
	await member.roles.remove(role);
	if (DMuser) {
		const embed = getDmEmbed({ user, role, action: "remove" });
		await member.user.send(embed);
	}
};

const addRole = async ({ member, role, DMuser }) => {
	await member.roles.add(role);
	if (DMuser) {
		const embed = getDmEmbed({ user, role, action: "add" });
		await member.user.send(embed);
	}
};

module.exports = {
	getDmEmbed,
	removeRole,
	addRole,
};