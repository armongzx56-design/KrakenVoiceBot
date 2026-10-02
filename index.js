const {
    Client,
    GatewayIntentBits,
    ChannelType,
    ActivityType,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder
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

const startedAt = Date.now();
let connection = null;
let reconnectTimer = null;
let reconnecting = false;

const commands = [
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("ดูคำสั่งทั้งหมดของ KrakenVoiceBot"),
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("เช็กความเร็วตอบสนองของบอท"),
    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("ดูสถานะและสถิติของบอท")
].map(command => command.toJSON());

function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
        days ? `${days}d` : "",
        hours ? `${hours}h` : "",
        minutes ? `${minutes}m` : "",
        `${seconds}s`
    ].filter(Boolean).join(" ");
}

async function registerCommands() {
    if (!process.env.GUILD_ID || !client.user) {
        console.log("[COMMANDS] Missing GUILD_ID or bot user");
        return;
    }

    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

    await rest.put(
        Routes.applicationGuildCommands(
            client.user.id,
            process.env.GUILD_ID
        ),
        { body: commands }
    );

    console.log("[COMMANDS] Slash commands registered successfully");
}

async function connectToVoice() {
    if (reconnecting) return;

    try {
        console.log("[VOICE] Fetching server...");

        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const channel = await guild.channels.fetch(
            process.env.VOICE_CHANNEL_ID
        );

        if (!channel) {
            console.log("[VOICE ERROR] Voice channel not found");
            scheduleReconnect(10000);
            return;
        }

        if (
            channel.type !== ChannelType.GuildVoice &&
            channel.type !== ChannelType.GuildStageVoice
        ) {
            console.log("[VOICE ERROR] Target is not a voice channel");
            scheduleReconnect(10000);
            return;
        }

        if (connection) {
            try {
                connection.destroy();
            } catch {}
        }

        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: true,
            selfDeaf: true
        });

        console.log(`[VOICE] Joining: ${guild.name} / ${channel.name}`);

        connection.on(VoiceConnectionStatus.Signalling, () => {
            console.log("[VOICE] Signalling...");
        });

        connection.on(VoiceConnectionStatus.Connecting, () => {
            console.log("[VOICE] Connecting...");
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            reconnecting = false;
            console.log("[VOICE] CONNECTED SUCCESSFULLY!");
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log("[VOICE] Disconnected. Reconnecting...");
            scheduleReconnect(5000);
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log("[VOICE] Connection destroyed");
        });

        connection.on("error", error => {
            console.log("[VOICE ERROR]", error.message);
            scheduleReconnect(5000);
        });

    } catch (error) {
        console.log("[VOICE ERROR]", error.message);
        scheduleReconnect(10000);
    }
}

function scheduleReconnect(delay) {
    if (reconnectTimer) return;

    reconnecting = true;

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        reconnecting = false;
        await connectToVoice();
    }, delay);
}

client.once("clientReady", async () => {
    console.log(`[BOT] Online: ${client.user.tag}`);

    client.user.setActivity("Kraken Community", {
        type: ActivityType.Watching
    });

    await registerCommands();
    await connectToVoice();
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
        const latency = Date.now() - interaction.createdTimestamp;

        await interaction.reply({
            content: `🏓 Pong! ${latency}ms | WebSocket: ${client.ws.ping}ms`,
            ephemeral: true
        });
        return;
    }

    if (interaction.commandName === "help") {
        const embed = new EmbedBuilder()
            .setTitle("🦑 KrakenVoiceBot")
            .setDescription("บอทเสียง 24/7 สำหรับ Kraken Community")
            .addFields(
                {
                    name: "🎧 Voice",
                    value: "เข้า Voice อัตโนมัติ และพยายาม reconnect เมื่อหลุด"
                },
                {
                    name: "⚡ Commands",
                    value: "`/help` — ดูคำสั่ง\n`/ping` — เช็ก latency\n`/stats` — ดูสถานะบอท"
                }
            )
            .setFooter({ text: "KrakenVoiceBot" });

        await interaction.reply({ embeds: [embed] });
        return;
    }

    if (interaction.commandName === "stats") {
        const voiceStatus = connection?.state?.status || "Unknown";
        const embed = new EmbedBuilder()
            .setTitle("📊 KrakenVoiceBot Stats")
            .addFields(
                {
                    name: "🟢 Status",
                    value: "Online",
                    inline: true
                },
                {
                    name: "🎧 Voice",
                    value: `\`${voiceStatus}\``,
                    inline: true
                },
                {
                    name: "🏠 Servers",
                    value: `${client.guilds.cache.size}`,
                    inline: true
                },
                {
                    name: "⏱️ Uptime",
                    value: formatUptime(Date.now() - startedAt),
                    inline: true
                },
                {
                    name: "📡 WebSocket",
                    value: `${client.ws.ping}ms`,
                    inline: true
                },
                {
                    name: "🔄 Reconnect",
                    value: reconnecting ? "กำลังเชื่อมต่อ..." : "พร้อมใช้งาน",
                    inline: true
                }
            )
            .setFooter({ text: "KrakenVoiceBot • 24/7" });

        await interaction.reply({ embeds: [embed] });
    }
});

client.on("error", error => {
    console.log("[CLIENT ERROR]", error.message);
});

process.on("unhandledRejection", error => {
    console.log("[UNHANDLED REJECTION]", error);
});

process.on("uncaughtException", error => {
    console.log("[UNCAUGHT EXCEPTION]", error);
});

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.json({
        bot: "KrakenVoiceBot",
        status: client.isReady() ? "online" : "starting",
        uptime: formatUptime(Date.now() - startedAt)
    });
});

app.listen(PORT, () => {
    console.log(`[WEB] Server listening on port ${PORT}`);
});

client.login(process.env.BOT_TOKEN);
