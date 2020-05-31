const express = require("express")
const router = express.Router()
const sha1 = require('sha1');

router.use("/oauth/twitch", express.static("public"))

router.get('/', (req, res) => {
    res.json({
        message: '📺 DisTwitchChat API 📺',
    });
});

router.get("/makecoffee", (req, res) => {
    res.status(418).json({
        status: 418,
        message: "I'm a Teapot ☕"
    })
})

router.get("/invite", (req, res) => {
    res.redirect("https://discord.com/api/oauth2/authorize?client_id=702929032601403482&permissions=8&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Flogin&scope=bot")
})

router.get("/discord", (req, res, next) => {
    res.redirect("https://discord.gg/sFpMKVX")
})


router.get("/token", async (req, res, next) => {
    try {
        const code = req.query.code
        const apiURL = `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_APP_CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${process.env.REDIRECT_URI}`
        const response = await fetch(apiURL, {
            method: "POST"
        })
        const json = await response.json()
        const validationResponse = await fetch("https://id.twitch.tv/oauth2/validate", {
            headers: {
                Authorization: `OAuth ${json.access_token}`
            }
        })
        const validationJson = await validationResponse.json()
        if (!validationResponse.ok) {
            res.status(validationJson.status)
            err = new Error(validationJson.message)
            next(err)
        } else {
            const { login, user_id } = validationJson
            const ModChannels = await Api.getUserModerationChannels(login)

            const uid = sha1(user_id)
            const token = await admin.auth().createCustomToken(uid)
            const userInfo = await Api.getUserInfo(login)
            res.json({
                token,
                displayName: userInfo.display_name,
                profilePicture: userInfo.profile_image_url,
                ModChannels
            })
        }
    } catch (err) {
        next(err)
    }
})

module.exports = router