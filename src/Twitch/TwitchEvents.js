const TwitchApi = require("twitch-lib");
const sha1 = require("sha1");
const uuidv1 = require("uuidv1");
const TPS = require("twitchps");

// get functions used to do things like strip html and replace custom discord emojis with the url to the image
const { formatMessage } = require("../utils/messageManipulation");

// the admin app has already been initialized in routes/index.js
const admin = require("firebase-admin");

// TODO: move to firebase db
const ranks = require("../ranks.json");
const { default: fetch } = require("node-fetch");

// intialize the twitch api class from the twitch-lib package
const Api = new TwitchApi({
	clientId: process.env.TWITCH_CLIENT_ID,
	authorizationToken: process.env.TWITCH_ACCESS_TOKEN,
});

const CommandHandler = require("./CommandHandler")

const DisTwitchChatProfile = "https://media.discordapp.net/attachments/710157323456348210/710185505391902810/discotwitch_.png?width=100&height=100";

const getBadges = async (channelName, tags) => {
	// get custom badges from twitch api

	const badges = {};
	if (tags.badges) {
		const channelBadgeJSON = await Api.getBadgesByUsername(channelName);
		const globalBadges = await Api.getGlobalBadges();

		// TODO: improve by doing channel badges first

		// get all global badges
		for (let [key, value] of Object.entries(tags.badges)) {
			if (key === "subscriber") value = 0; // global subscriber badges only have two keys 0 and 1. 0 is for any subscriber above 1 month

			let badgeInfo = globalBadges[key].versions[value];
			if (badgeInfo) {
				const badgeImage = badgeInfo[`image_url_1x`];
				const badgeTitle = badgeInfo["title"];
				badges[key] = { image: badgeImage, title: badgeTitle };
			}
		}

		if (channelBadgeJSON.hasOwnProperty("subscriber") && tags.badges.subscriber != undefined) {
			const customSubBadges = channelBadgeJSON.subscriber.versions;
			const subLevel = tags.badges.subscriber;
			if (customSubBadges.hasOwnProperty(subLevel)) {
				const subBadge = customSubBadges[subLevel][`image_url_1x`];
				const subTitle = customSubBadges[subLevel]["title"];
				badges["subscriber"] = { image: subBadge, title: subTitle };
			}
		}

		if (channelBadgeJSON.hasOwnProperty("bits") && tags.badges.bits != undefined) {
			const customCheerBadges = channelBadgeJSON.bits.versions;
			const cheerLevel = tags.badges.bits;
			if (customCheerBadges.hasOwnProperty(cheerLevel)) {
				const cheerBadge = customCheerBadges[cheerLevel][`image_url_1x`];
				const customCheerTitle = customCheerBadges[cheerLevel]["title"];
				badges["bits"] = { image: cheerBadge, title: customCheerTitle };
			}
		}
	}
	return badges;
};

module.exports = (TwitchClient, sockets, app) => {
	TwitchClient.on("messagedeleted", (channel, username, deletedMessage, tags) => {
		// remove the "#" form the begginning of the channel name
		const channelName = channel.slice(1).toLowerCase();

		// don't waste time with all the next stuff if there isn't a socket connection to that channel
		if (!sockets.hasOwnProperty(channelName)) return;

		// send a message to all connected sockets for this channel to delete that message
		const _ = [...sockets[channelName]].forEach(async s => await s.emit("deletemessage", tags["target-msg-id"]));
	});

	TwitchClient.on("ban", (channel, username, reason, userstate) => {
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;
		const _ = [...sockets[channelName]].forEach(async s => await s.emit("purgeuser", username));
	});

	TwitchClient.on("timeout", (channel, username, reason, duration, userstate) => {
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;
		const _ = [...sockets[channelName]].forEach(async s => await s.emit("purgeuser", username));
	});

	TwitchClient.on("raided", async (channel, username, viewers) => {
		console.log("raided");
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;
		const theMessage = `${username} has raided with ${viewers} viewer${viewers > 1 ? "s" : ""}`;
		const messageObject = {
			displayName: "DisStreamChat",
			avatar: DisTwitchChatProfile,
			body: theMessage,
			platform: "twitch",
			messageId: "raid",
			uuid: uuidv1(),
			id: uuidv1(),
			badges: {},
			sentAt: Date.now(),
			userColor: "#ff0029",
		};
		if (messageObject.body.length <= 0) return;
		const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject));
	});

	// currently doesn't work
	TwitchClient.on("hosted", async (channel, username, viewers, autohost) => {
		if (autohost) return;
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;
		const theMessage = `${username} is hosting with ${viewers} viewer${viewers > 1 ? "s" : ""}`;
		const messageObject = {
			displayName: "DisStreamChat",
			avatar: DisTwitchChatProfile,
			body: theMessage,
			platform: "twitch",
			messageId: "raid",
			uuid: uuidv1(),
			id: uuidv1(),
			badges: {},
			sentAt: Date.now(),
			userColor: "#ff0029",
		};
		if (messageObject.body.length <= 0) return;
		const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject));
	});

	TwitchClient.on("message", async (channel, tags, message, self) => {
        // Ignore echoed messages and commands.
		if (!["chat", "action"].includes(tags["message-type"])) return;
        
    
        

		// remove the "#" form the begginning of the channel name
        const channelName = channel.slice(1).toLowerCase();
        
        if(channelName === "dav1dsnyder404"){
            CommandHandler(message, TwitchClient, channelName)
        }

		// don't waste time with all the next stuff if there isn't a socket connection to that channel
		if (!sockets.hasOwnProperty(channelName)) return;

		// get all possible versions of the message with all variations of the message filters
		// const plainMessage = await formatMessage(message, "twitch", tags);
		let HTMLCleanMessage = await formatMessage(message, "twitch", tags, { HTMLClean: true, channelName });
		// const censoredMessage = await formatMessage(message, "twitch", tags, { censor: true });
		// const HTMLCensoredMessage = await formatMessage(message, "twitch", tags, { HTMLClean: true, censor: true });

		// get all badges for the user that sent the messages put them in an object
		const badges = await getBadges(channelName, tags);

		// TODO: improve
		// append a badge if there is a developer
		if (ranks.twitch.developers.includes(tags["user-id"])) {
			badges["developer"] = {
				image: "https://cdn.discordapp.com/attachments/699812263670055052/722630142987468900/icon_18x18.png",
				title: "DisStreamchat Staff",
			};
		}

		// the messageId is currently only used for higlighted messages
		let messageId = tags["msg-id"] || "";

		// ping the twitch api for user data, currently only used for profile picture
		const userData = await Api.getUserInfo(tags.username);

		// this is all the data that gets sent to the frontend
		const messageObject = {
			displayName: tags["display-name"],
			avatar: userData.profile_image_url, // long term TODO: look into caching profile picture
			body: HTMLCleanMessage,
			// HTMLCleanMessage,
			// censoredMessage,
			// HTMLCensoredMessage,
			platform: "twitch",
			messageId: messageId,
			uuid: tags.id, // TODO: remove
			id: tags.id,
			badges,
			sentAt: +tags["tmi-sent-ts"],
			userColor: tags.color,
			messageType: tags["message-type"],
		};

		if (messageObject.body.length <= 0) return;

		// send the message object to all sockets connected to this channel
		const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject));
	});

    const AllcheerMotes = {}
    const getCheerMotes = async () => {
        const streamersRef = await admin.firestore().collection("Streamers").get()
        const streamers = streamersRef.docs.map(doc => doc.data())
        const twitchNames = streamers.map(streamer => streamer.TwitchName).filter(name => name)
        for(const name of twitchNames){
            try{
                const userInfo = await Api.getUserInfo(name)
                if(userInfo && userInfo.id){
                    AllcheerMotes[name] = (await Api.fetch(`https://api.twitch.tv/helix/bits/cheermotes?broadcaster_id=${userInfo.id}`)).data
                }
                else{
                    AllcheerMotes[name] = (await Api.fetch(`https://api.twitch.tv/helix/bits/cheermotes`)).data
                }
            }catch(err){
                console.log(err.message)
            }
        }
        // console.log(streamers)
    }
    getCheerMotes()
    setInterval(getCheerMotes, 3600000);

	TwitchClient.on("cheer", async (channel, tags, message, self) => {
		const channelName = channel.slice(1).toLowerCase();
		// TODO: improve Regex
		// TODO: improve by splitting by spaces
		const cheerMoteRegex = /([0-9]*[a-zA-Z]*)([0-9]*)/gi;

		if (!sockets.hasOwnProperty(channelName)) return;

		const badges = {};

        let cheerMotes = AllcheerMotes[channelName]
        if(!cheerMotes) cheerMotes = (await Api.fetch(`https://api.twitch.tv/helix/bits/cheermotes`)).data

		const cheerMatches = [...message.matchAll(cheerMoteRegex)];
		const cheerMoteMatches = cheerMatches.map(match => ({ bits: +match[2], ...cheerMotes.find(cheer => cheer.prefix.toLowerCase() === match[1].toLowerCase()) }));


		const cheerMoteMatchTiers = cheerMoteMatches
			.map(cheerMote => {
				const tiers = cheerMote.tiers;
				const bits = cheerMote.bits;
				if (!tiers || !bits || !cheerMote.prefix) return;
				const cheeredTier = tiers.reduce((acc, tier) => (tier["min_bits"] <= bits ? tier : acc));
				return {
					prefix: cheerMote.prefix,
					id: cheerMote.prefix.toLowerCase() + bits,
					tier: cheeredTier,
					image: cheeredTier.images.dark.animated["4"],
					bits,
				};
			})
			.filter(c => !!c);
        
		let messageId = tags["msg-id"] || "";
		let bits = tags.bits;


		let HTMLCleanMessage = await formatMessage(message, "twitch", tags, { HTMLClean: true, channelName });


		HTMLCleanMessage = HTMLCleanMessage.replace(cheerMoteRegex, (match, prefix, number) => {
			const cheerMote = cheerMoteMatchTiers.find(cheer => cheer.id == match.toLowerCase());
			if (!cheerMote) return match;
			return `<img src="${cheerMote.image}" title="${cheerMote.prefix}" class="emote"> ${number}`;
		});

		const theMessage = `${tags["display-name"]} cheered ${bits} bit${bits > 1 ? "s" : ""}!\n${HTMLCleanMessage}`;

		const messageObject = {
			displayName: "DisStreamChat",
			avatar: DisTwitchChatProfile,
			body: theMessage,
			// HTMLCleanMessage,
			// censoredMessage,
			// HTMLCensoredMessage,
			platform: "twitch",
			messageId: "cheer",
			uuid: tags.id,
			id: tags.id,
			badges,
			sentAt: +tags["tmi-sent-ts"],
			userColor: "#ff0029",
			bits, // << added this to the messageObject
		};

		const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject)); 
	});

	TwitchClient.on("anongiftpaidupgrade", async (channel, username, sender, tags) => {
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;

		const badges = {};

		const theMessage = `${username}, upgraded their subscription! (Originally from Anonymous)`;

		let HTMLCleanMessage = await formatMessage(theMessage, "twitch", tags, {
			HTMLClean: true,
		});


		const messageObject = {
			displayName: "DisStreamChat",
			avatar: DisTwitchChatProfile,
			body: theMessage,
			platform: "twitch",
			messageId: "subscription",
			uuid: tags.id,
			id: tags.id,
			badges,
			sentAt: +tags["tmi-sent-ts"],
			userColor: "#ff0029",
		};

		const _ = [...sockets[channelName]].forEach(async s => await s.emit("twitchanonupgrade", messageObject)); 
	});

	const subTypes = {
		"2000": "Tier 2",
		"3000": "Tier 3",
	};

	TwitchClient.on("giftpaidupgrade", async (channel, username, sender, tags) => {
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;

		const badges = {};

		const theMessage = `${username}, upgraded their subscription! (Originally from ${sender}).`;

		let HTMLCleanMessage = await formatMessage(theMessage, "twitch", tags, {
			HTMLClean: true,
		});

		const messageObject = {
			displayName: "DisStreamChat",
			avatar: DisTwitchChatProfile,
			body: theMessage,
			platform: "twitch",
			messageId: "subscription",
			uuid: tags.id,
			id: tags.id,
			badges,
			sentAt: +tags["tmi-sent-ts"],
			userColor: "#ff0029",
		};

		const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject)); 
	});

	let giftTimeout = null;
	let lastGifter = "";
	let lastGiftAmount = 0;
	let allRecipients = ``;

	TwitchClient.on("subgift", async (channel, username, streakMonths, recipient, { prime, plan, planName }, tags) => {
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;

		const badges = {};

		if (username == lastGifter) {
			clearTimeout(giftTimeout);
			lastGiftAmount++;
			allRecipients += `, @${recipient}`;
		} else {
			lastGifter = username;
			lastGiftAmount = 1;
			allRecipients = `@${recipient}`;
		}
		giftTimeout = setTimeout(async () => {
			let theMessage = ``;

			if (subTypes[plan]) {
				theMessage = `${username} has gifted ${lastGiftAmount} ${subTypes[plan]} subscription(s) to ${allRecipients}!`;
			} else {
				theMessage = `${username} has gifted ${lastGiftAmount} subscription(s) to ${allRecipients}!`;
			}

			const messageObject = {
				displayName: "DisStreamChat",
				avatar: DisTwitchChatProfile,
				body: theMessage,
				platform: "twitch",
				messageId: "subgift",
				uuid: tags.id,
				id: tags.id,
				badges,
				sentAt: +tags["tmi-sent-ts"],
				userColor: "#ff0029",
			};

			const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject)); 

			lastGiftAmount = 0;
			allRecipients = ``;
		}, 1500);
	});

	TwitchClient.on("resub", async (channel, username, months, message, tags, { prime, plan, planName }) => {
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;

		const badges = {};

		let theMessage = "";

		let cumulativeMonths = ~~tags["msg-param-cumulative-months"];
		
		if ((tags["msg-param-should-share-streak"] = true)) {
			if (prime) {
				theMessage = `Thanks for the Twitch Prime re-sub for ${cumulativeMonths} months @${username}!`;
			} else if (subTypes[plan]) {
				theMessage = `Thanks for the ${subTypes[plan]} resub for ${cumulativeMonths} months @${username}!`;
			} else {
				theMessage = `Thanks for the resub for ${cumulativeMonths} months @${username}!`;
			}
		} else {
			if (prime) {
				theMessage = `Thanks for the Twitch Prime re-sub @${username}!`;
			} else if (subTypes[plan]) {
				theMessage = `Thanks for the ${subTypes[plan]} resub @${username}!`;
			} else {
				theMessage = `Thanks for the resub @${username}!`;
			}
		}
		const messageObject = {
			displayName: "DisStreamChat",
			avatar: DisTwitchChatProfile,
			body: theMessage,
			platform: "twitch",
			messageId: "subscription",
			uuid: tags.id,
			id: tags.id,
			badges,
			sentAt: +tags["tmi-sent-ts"],
			userColor: "#ff0029",
		};

		const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject)); 
	});

	TwitchClient.on("subscription", async (channel, username, { prime, plan, planName }, msg, tags) => {
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;

		let messageId = tags["msg-id"] || "";

		const badges = {};

		let theMessage = "";
		if (prime) {
			theMessage = `Thanks for subscribing with Twitch Prime @${username}!`;
		} else if (subTypes[plan]) {
			theMessage = `Thanks for the ${subTypes[plan]} subscription @${username}!`;
		} else {
			theMessage = `Thanks for subscribing @${username}!`;
		}

		let HTMLCleanMessage = await formatMessage(theMessage, "twitch", tags, { HTMLClean: true });

		const messageObject = {
			displayName: "DisStreamChat",
			avatar: DisTwitchChatProfile,
			body: theMessage,
			platform: "twitch",
			messageId: "subscription",
			uuid: tags.id,
			id: tags.id,
			badges,
			sentAt: +tags["tmi-sent-ts"],
			userColor: "#ff0029",
		};

		if (messageObject.body.length <= 0) return;
		const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject)); 
	});

	TwitchClient.on("primepaidupgrade", async (channel, username, { prime, plan, planName }, tags) => {
		const channelName = channel.slice(1).toLowerCase();
		if (!sockets.hasOwnProperty(channelName)) return;

		let messageId = tags["msg-id"] || "";

		const badges = {};

		let theMessage = "";
		if (subTypes[plan]) {
			theMessage = `@${username} has upgraded from a Twitch Prime Sub to a  ${subTypes[plan]} subscription!`;
		} else {
			theMessage = `@${username} has upgraded from a Twitch Prime to a Tier 1 subscription!`;
		}

		let HTMLCleanMessage = await formatMessage(theMessage, "twitch", tags, { HTMLClean: true });

		const messageObject = {
			displayName: "DisStreamChat",
			avatar: DisTwitchChatProfile,
			body: theMessage,
			platform: "twitch",
			messageId: "subscription",
			uuid: tags.id,
			id: tags.id,
			badges,
			sentAt: +tags["tmi-sent-ts"],
			userColor: "#ff0029",
		};

		if (messageObject.body.length <= 0) return;
		const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject)); 
	});

	// TODO: move to separate file
	app.post("/webhooks/twitch", async (req, res, next) => {
		if (req.twitch_hub && req.twitch_hex == req.twitch_signature) {
			// it's from twitch
			const data = req.body.data;
			if (data) {
				const body = data[0];
				const streamer = body.to_name.toLowerCase();
				const follower = body.from_name;
				const followerId = body.from_id;
				const followedAt = body.followed_at;

				console.log(`${follower} followed ${streamer}`);

				// long term TODO: add follower count/goal overlay
				if (!sockets.hasOwnProperty(streamer)) return res.status(200).json("no socket connection");

				const streamerDatabaseId = sha1(body.to_id);

				const db = admin.firestore();
				const streamerRef = await db.collection("Streamers").doc(streamerDatabaseId).get();
				const streamerData = streamerRef.data();
				const previouslyNotified = streamerData.previouslyNotified || [];

				if (new Set(previouslyNotified).has(followerId)) return res.status(200).json("already notified");

				previouslyNotified.push(followerId);
				await db.collection("Streamers").doc(streamerDatabaseId).update({
					previouslyNotified,
				});

				const badges = {};

				// TODO add custom message handler in seperate file
				const theMessage = `Thanks for following ${follower}!`;

				const messageObject = {
					displayName: "DisStreamChat",
					avatar: DisTwitchChatProfile,
					body: theMessage,
					platform: "twitch",
					messageId: "follow",
					uuid: uuidv1(),
					id: uuidv1(),
					badges,
					sentAt: new Date(followedAt).getTime(),
					userColor: "#ff0029",
				};

				const _ = [...sockets[streamer]].forEach(async s => await s.emit("chatmessage", messageObject));
			}
			res.json("success");
		} else {
			res.status("401").json("Looks like You aren't twitch");
			// it's not from twitch
		}
	});

    // TODO: refactor so it doesn't fire on follow
    // get channel point redemptions for each channel
    pubsubbedChannels = [];
	(async () => {
		admin.firestore().collection("Streamers").onSnapshot(async allStreamersRef => {
            const allStreamersTwitchData = await (await Promise.all(allStreamersRef.docs.map(async doc => await doc.ref.collection("twitch").doc("data").get()))).map(doc => doc.data());
            const authorizedStreamers = allStreamersTwitchData.filter(s => s);
            pubsubbedChannels.forEach(channel => {
                channel.listener.removeTopic([{topic: `channel-points-channel-v1.${channel.id}`}]);
            })
            authorizedStreamers.forEach(async streamer => {
                const res = await fetch(`https://api.disstreamchat.com/twitch/token/refresh/?token=${streamer.refresh_token}`);
                const json = await res.json();
                const access_token = json.access_token;
                const init_topics = [
                    {
                        topic: `channel-points-channel-v1.${streamer.user_id}`,
                        token: access_token,
                    },
                ];
                const pubSub = new TPS({
                    init_topics,
                    reconnect: false,
                    debug: false,
                });
                pubsubbedChannels.push({listener: pubSub, id: streamer.user_id})
                pubSub.on("channel-points", async data => {
                    try {
                        const { redemption, channel_id } = data;
                        const firebaseId = sha1(channel_id)
                        const user = await (await admin.firestore().collection("Streamers").doc(firebaseId).get()).data()
                        const channelName = user.name
                        if (!sockets.hasOwnProperty(channelName)) return
                        const message = `${redemption.user.display_name || redemption.user.login} has redeemed: ${
                            redemption.reward.title
                        } - ${redemption.reward.prompt}`;
                        const messageObject = {
                            displayName: "DisStreamChat",
                            avatar: DisTwitchChatProfile,
                            body: message,
                            platform: "twitch",
                            messageId: "subscription",
                            messageType: "channel-points",
                            uuid: uuidv1(),
                            id: uuidv1(),
                            badges: {},
                            sentAt: new Date().getTime(),
                            userColor: "#ff0029",
                        };
                        const _ = [...sockets[channelName]].forEach(async s => await s.emit("chatmessage", messageObject)); 
    
                    } catch (error) {
                        console.log("error sending redemption message", data, error.message);
                    }
                });
            });
        })
    
	})();
};