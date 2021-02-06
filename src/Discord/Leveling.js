// the admin app has already been initialized in routes/index.js
const { MessageEmbed } = require("discord.js");
const admin = require("firebase-admin");

const { Random, ArrayAny, getXp, getDiscordSettings, getLevelSettings, getRoleScaling } = require("../utils/functions");

module.exports = {
	handleLeveling: async (message, client) => {
		const settings = await getDiscordSettings({ client, guild: message.guild.id });
		if (!settings?.activePlugins?.leveling) return;
		const levelingRef = admin.firestore().collection("Leveling").doc(message.guild.id);
		const levelingDataRef = await levelingRef.get();
		const levelingData = levelingDataRef.data();
		const levelingSettings = await getLevelSettings(client, message.guild.id);
		if (levelingData) {
			const channel = message.channel;
			const channelsToIgnore = levelingSettings?.bannedItems?.channels || [];
			if (channelsToIgnore.includes(channel.id)) return;
			const rolesToIgnore = levelingSettings?.bannedItems?.roles || [];
			const member = message.member;
			if (
				ArrayAny(
					rolesToIgnore,
					member.roles.cache.array().map(role => role.id)
				)
			) {
				return;
			}
			const generalScaling = levelingSettings?.scaling?.general;
			const roleScaling = getRoleScaling(member.roles.cache.array(), levelingSettings?.scaling?.roles || {});
			const finalScaling = roleScaling ?? generalScaling ?? 1;
			const levelingChannelId = levelingData.type === 3 ? levelingData.notifications || message.channel.id : message.channel.id;
			let userLevelingData = (await levelingRef.collection("users").doc(message.author.id).get()).data();
			if (!userLevelingData) {
				userLevelingData = { xp: 0, level: 0, cooldown: 0 };
			}
			const now = new Date().getTime();
			const cooldownTime = 60000;
			const expireTime = userLevelingData.cooldown + cooldownTime;
			if (now > expireTime) {
				userLevelingData.cooldown = now;
				userLevelingData.xp += Random(10, 20) * finalScaling;
				userLevelingData.xp = Math.floor(userLevelingData.xp);
				let xpToNextLevel = getXp(userLevelingData.level + 1);
				if (userLevelingData.xp >= xpToNextLevel) {
					userLevelingData.level++;
					if (levelingData.type !== 1) {
						// TODO: replace with mustache
						const levelupMessage = (levelingData.message || "Congrats {player}, you leveled up to level {level}")
							.replace("{ping}", message.author)
							.replace("{player}", message.member.displayName)
							.replace("{level}", userLevelingData.level + 1);
						try {
							const levelingChannel = await message.guild.channels.resolve(levelingChannelId);
							if (levelingSettings?.general?.sendEmbed) {
								const levelEmbed = new MessageEmbed()
									.setAuthor(client.user.username, client.user.displayAvatarURL())
									.setTitle("🎉 Level up!")
									.setDescription(levelupMessage)
									.addField(":arrow_down: Previous Level", `**${userLevelingData.level}**`, true)
									.addField(":arrow_double_up: New Level", `**${userLevelingData.level+1}**`, true)
									.addField(":1234: total xp", `**${userLevelingData.xp}**`, true);
								levelingChannel.send(levelEmbed);
							} else {
								levelingChannel.send(levelupMessage);
							}
						} catch (err) {
							console.log(err.message)
							// message.channel.send(levelupMessage);
						}
					}
				}
				levelingData[message.author.id] = userLevelingData;
				await admin
					.firestore()
					.collection("Leveling")
					.doc(message.guild.id)
					.collection("users")
					.doc(message.author.id)
					.set({ ...userLevelingData, name: message.author.username, avatar: message.author.displayAvatarURL() });
			}
		} else {
			try {
				await admin.firestore().collection("Leveling").doc(message.guild.id).update({});
			} catch (err) {
				await admin.firestore().collection("Leveling").doc(message.guild.id).set({});
			}
		}
	},
};
