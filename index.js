const {
    Client,
    GatewayIntentBits,
    ChannelType
} = require("discord.js");

const {
    joinVoiceChannel,
    VoiceConnectionStatus
} = require("@discordjs/voice");

require("dotenv").config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

let connection = null;
let reconnectTimer = null;

async function connectToVoice() {
    try {
        console.log("[1] Fetching server...");

        const guild = await client.guilds.fetch(process.env.GUILD_ID);

        console.log(`[2] Server found: ${guild.name}`);
        console.log("[3] Fetching voice channel...");

        const channel = await guild.channels.fetch(
            process.env.VOICE_CHANNEL_ID
        );

        if (!channel) {
            console.log("[ERROR] Voice channel not found");
            return;
        }

        console.log(`[4] Channel found: ${channel.name}`);
        console.log(`[5] Channel type: ${channel.type}`);

        if (
            channel.type !== ChannelType.GuildVoice &&
            channel.type !== ChannelType.GuildStageVoice
        ) {
            console.log("[ERROR] This is not a voice channel");
            return;
        }

        console.log("[6] Joining voice...");

        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: true,
            selfDeaf: true
        });

        connection.on(VoiceConnectionStatus.Signalling, () => {
            console.log("[VOICE] Signalling...");
        });

        connection.on(VoiceConnectionStatus.Connecting, () => {
            console.log("[VOICE] Connecting...");
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log("[VOICE] CONNECTED SUCCESSFULLY!");
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log("[VOICE] Disconnected. Reconnecting in 5 seconds...");

            clearTimeout(reconnectTimer);

            reconnectTimer = setTimeout(() => {
                connectToVoice();
            }, 5000);
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log("[VOICE] Connection destroyed");
        });

        connection.on("error", (error) => {
            console.log("[VOICE ERROR]", error.message);
        });

    } catch (error) {
        console.log("[ERROR]", error.message);

        clearTimeout(reconnectTimer);

        reconnectTimer = setTimeout(() => {
            connectToVoice();
        }, 10000);
    }
}

client.once("clientReady", async () => {
    console.log(`[BOT] Online: ${client.user.tag}`);
    await connectToVoice();
});

client.login(process.env.BOT_TOKEN);