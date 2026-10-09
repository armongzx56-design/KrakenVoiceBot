const {
    Client,
    GatewayIntentBits,
    ChannelType,
    ActivityType,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const {
    joinVoiceChannel,
    VoiceConnectionStatus
} = require("@discordjs/voice");

require("dotenv").config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

const startedAt = Date.now();
// Voice state is isolated per Discord server (guild).
const voiceConnections = new Map();
const reconnectTimers = new Map();
const reconnectingGuilds = new Set();
const intentionalVoiceChanges = new Set();
const DATA_DIR = path.join(__dirname, "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, "{}");
function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; } }
function saveConfig(c) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2)); }
const config = loadConfig();

const commands = [
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("ดูคำสั่งทั้งหมดของ KrakenVoiceBot"),
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("เช็กความเร็วตอบสนองของบอท"),
    new SlashCommandBuilder()
        .setName("announce").setDescription("ส่งประกาศไปยังห้องที่เลือก")
        .addChannelOption(o => o.setName("channel").setDescription("ห้องที่จะส่งประกาศ").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(o => o.setName("message").setDescription("ข้อความประกาศ").setRequired(true))
        .addStringOption(o => o.setName("title").setDescription("หัวข้อประกาศ").setRequired(false)),
    new SlashCommandBuilder()
        .setName("autopost").setDescription("ตั้งข้อความส่งอัตโนมัติตามช่วงเวลาที่เลือก")
        .addSubcommand(sub => sub.setName("setup").setDescription("ตั้งห้อง ข้อความ และช่วงเวลาส่งอัตโนมัติ")
            .addChannelOption(o => o.setName("channel").setDescription("ห้องที่จะส่งข้อความ").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addStringOption(o => o.setName("message").setDescription("ข้อความที่จะส่งซ้ำ").setRequired(true))
            .addIntegerOption(o => o.setName("minutes").setDescription("ส่งซ้ำทุกกี่นาที เช่น 120 = 2 ชั่วโมง").setMinValue(1).setMaxValue(10080).setRequired(true)))
        .addSubcommand(sub => sub.setName("stop").setDescription("ปิดการส่งข้อความอัตโนมัติ"))
        .addSubcommand(sub => sub.setName("status").setDescription("ตรวจสอบการตั้งค่าข้อความอัตโนมัติ")),
    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("ดูสถานะและสถิติของบอท"),
    new SlashCommandBuilder()
        .setName("status").setDescription("ตั้งสถานะบอท")
        .addSubcommand(s => s.setName("set").setDescription("ตั้งสถานะ")
            .addStringOption(o => o.setName("type").setDescription("ประเภท").setRequired(true)
                .addChoices({name:"Playing",value:"Playing"},{name:"Watching",value:"Watching"},{name:"Listening",value:"Listening"},{name:"Competing",value:"Competing"}))
            .addStringOption(o => o.setName("text").setDescription("ข้อความ").setRequired(true)))
        .addSubcommand(s => s.setName("clear").setDescription("ล้างสถานะ")),
    new SlashCommandBuilder()
        .setName("ticket").setDescription("ระบบ Ticket")
        .addSubcommand(s => s.setName("setup").setDescription("ตั้ง Ticket Panel")
            .addChannelOption(o => o.setName("channel").setDescription("ห้อง Panel").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addChannelOption(o => o.setName("category").setDescription("หมวดหมู่ Ticket").addChannelTypes(ChannelType.GuildCategory))
            .addRoleOption(o => o.setName("staff").setDescription("ยศทีมงาน")))
        .addSubcommand(s => s.setName("panel").setDescription("ส่ง Panel ใหม่")),
    new SlashCommandBuilder()
        .setName("247").setDescription("ให้บอทอยู่ในห้องเสียง 24/7")
        .addChannelOption(o => o.setName("channel").setDescription("เลือกห้องเสียงที่ให้บอทเข้า").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setRequired(true)),
    new SlashCommandBuilder()
        .setName("roblox").setDescription("ระบบแจ้งเตือน Roblox")
        .addSubcommand(s => s.setName("setup").setDescription("ตั้งห้องแจ้งเตือน")
            .addChannelOption(o => o.setName("channel").setDescription("ห้องข่าว").addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(s => s.setName("test").setDescription("ทดสอบระบบ"))
].map(command => command.toJSON());
// ==================== SERVER WHITELIST ====================
function getAllowedGuildIds() {
    // These three servers are permanently supported.
    // Render environment variables may add more servers, but can never remove these.
    const configured = (process.env.ALLOWED_GUILDS || process.env.GUILD_ID || "")
        .split(",").map(id => id.trim()).filter(Boolean);
    return [...new Set([...DEFAULT_ALLOWED_GUILD_IDS, ...configured])];
}
function isGuildAllowed(guildId) {
    return getAllowedGuildIds().includes(guildId);
}
async function syncGuildCommands(guild) {
    if (!guild || !client.user) return;
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    const body = isGuildAllowed(guild.id) ? commands : [];
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body });
    console.log(`[WHITELIST] ${isGuildAllowed(guild.id) ? "ENABLED" : "DISABLED"}: ${guild.name} (${guild.id})`);
}
async function syncAllGuildCommands() {
    for (const guild of client.guilds.cache.values()) {
        try { await syncGuildCommands(guild); }
        catch (error) { console.log(`[WHITELIST ERROR] ${guild.name}: ${error.message}`); }
    }
}

const PRIMARY_GUILD_ID = "1550132569432137903";
const DEFAULT_ALLOWED_GUILD_IDS = ["1550132569432137903", "1528076742994952202", "1351064921802149939"];
// Durable 24/7 voice fallback for Kraken Community.
// This survives Render restarts/deploys even when data/config.json is reset.
const DEFAULT_VOICE_CHANNEL_ID = "1550132569985777670";

function updateMemberActivity(guild) {
    if (!guild || guild.id !== PRIMARY_GUILD_ID || !client.user) return;

    const memberCount = guild.memberCount;
    client.user.setActivity(`${memberCount} Members`, {
        type: ActivityType.Watching
    });
    console.log(`[MEMBERS] ${guild.name}: ${memberCount} Members`);
}

const autoPostTimers = new Map();

function startAutoPost(guildId) {
    const previous = autoPostTimers.get(guildId);
    if (previous) clearInterval(previous);
    autoPostTimers.delete(guildId);

    const setting = config[guildId]?.autopost;
    if (!setting?.enabled || !setting.channelId || !setting.message) return;

    // ส่งครั้งแรกหลังตั้งค่า/หลังข้อความล่าสุดครบ 1 ชั่วโมง
    const timer = setInterval(async () => {
        const current = config[guildId]?.autopost;
        if (!current?.enabled) {
            clearInterval(timer);
            autoPostTimers.delete(guildId);
            return;
        }
        const intervalMinutes = Math.min(10080, Math.max(1, Number(current.intervalMinutes) || 60));
        const lastSentAt = Number(current.lastSentAt || Date.now());
        if (Date.now() - lastSentAt < intervalMinutes * 60 * 1000) return;

        try {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
            const channel = guild.channels.cache.get(current.channelId) || await guild.channels.fetch(current.channelId);
            if (!channel || !channel.isTextBased() || !channel.send) {
                console.log(`[AUTOPOST] Invalid text channel for guild ${guildId}`);
                return;
            }
            await channel.send({
                content: current.message,
                allowedMentions: { parse: [] }
            });
            current.lastSentAt = Date.now();
            saveConfig(config);
            console.log(`[AUTOPOST] Sent to ${guild.name} / #${channel.name}`);
        } catch (error) {
            console.log(`[AUTOPOST ERROR] ${guildId}: ${error.message}`);
        }
    }, 30 * 1000);
    autoPostTimers.set(guildId, timer);
}

function startConfiguredAutoPosts() {
    for (const [guildId, settings] of Object.entries(config)) {
        if (settings?.autopost?.enabled) startAutoPost(guildId);
    }
}

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
    if (!client.user) return;
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    // Remove global commands; all commands are controlled per-server by the whitelist.
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    await syncAllGuildCommands();
    console.log("[COMMANDS] Whitelist sync complete");
}

async function connectToVoice(guildId, onReady) {
    if (!guildId || reconnectingGuilds.has(guildId)) return;
    try {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
        const configuredChannelId =
            config[guild.id]?.voice247?.channelId ||
            (guild.id === PRIMARY_GUILD_ID ? DEFAULT_VOICE_CHANNEL_ID : null) ||
            (guild.id === process.env.GUILD_ID ? process.env.VOICE_CHANNEL_ID : null);
        if (!configuredChannelId) { console.log(`[VOICE] No 24/7 channel configured for ${guild.name}`); return; }
        const channel = guild.channels.cache.get(configuredChannelId) || await guild.channels.fetch(configuredChannelId);
        if (!channel) { console.log(`[VOICE ERROR] Voice channel not found in ${guild.name}`); scheduleReconnect(guildId, 750); return; }
        if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) { console.log(`[VOICE ERROR] Target is not a voice channel in ${guild.name}`); return; }
        const oldConnection = voiceConnections.get(guildId);
        if (oldConnection) {
            // Prevent our own connection replacement from triggering the watchdog.
            intentionalVoiceChanges.add(guildId);
            setTimeout(() => intentionalVoiceChanges.delete(guildId), 1500);
            try { oldConnection.destroy(); } catch {}
        }
        const connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfMute: true, selfDeaf: true });
        voiceConnections.set(guildId, connection);
        console.log(`[VOICE] ${guild.name} -> ${channel.name}`);
        connection.on(VoiceConnectionStatus.Signalling, () => console.log(`[VOICE] Signalling: ${guild.name}`));
        connection.on(VoiceConnectionStatus.Connecting, () => console.log(`[VOICE] Connecting: ${guild.name}`));
        connection.on(VoiceConnectionStatus.Ready, () => {
            reconnectingGuilds.delete(guildId);
            console.log(`[VOICE] CONNECTED: ${guild.name} / ${channel.name}`);
            if (typeof onReady === "function") {
                try { onReady(channel); } catch (error) { console.log("[VOICE READY CALLBACK ERROR]", error.message); }
            }
        });
        connection.on(VoiceConnectionStatus.Disconnected, () => { console.log(`[VOICE] Disconnected: ${guild.name}. Reconnecting in 300ms...`); scheduleReconnect(guildId, 300); });
        connection.on(VoiceConnectionStatus.Destroyed, () => console.log(`[VOICE] Connection destroyed: ${guild.name}`));
        connection.on("error", error => { console.log(`[VOICE ERROR] ${guild.name}: ${error.message}`); scheduleReconnect(guildId, 300); });
    } catch (error) { console.log(`[VOICE ERROR] ${guildId}: ${error.message}`); scheduleReconnect(guildId, 750); }
}

function scheduleReconnect(guildId, delay) {
    if (!guildId || reconnectTimers.has(guildId)) return;
    reconnectingGuilds.add(guildId);
    const timer = setTimeout(async () => {
        reconnectTimers.delete(guildId);
        reconnectingGuilds.delete(guildId);
        try {
            await connectToVoice(guildId);
        } catch (error) {
            console.log("[VOICE RECONNECT ERROR]", error.message);
            scheduleReconnect(guildId, 1000);
        }
    }, delay);
    reconnectTimers.set(guildId, timer);
}

function stopVoiceForGuild(guildId) {
    const connection = voiceConnections.get(guildId);
    if (connection) {
        intentionalVoiceChanges.add(guildId);
        setTimeout(() => intentionalVoiceChanges.delete(guildId), 1500);
        try { connection.destroy(); } catch {}
        voiceConnections.delete(guildId);
    }
    const timer = reconnectTimers.get(guildId);
    if (timer) { clearTimeout(timer); reconnectTimers.delete(guildId); }
    reconnectingGuilds.delete(guildId);
}

async function connectConfiguredVoices() {
    for (const guild of client.guilds.cache.values()) {
        if (!isGuildAllowed(guild.id)) continue;
        if (guild.id === PRIMARY_GUILD_ID || config[guild.id]?.voice247?.enabled) await connectToVoice(guild.id);
    }
}
client.on("voiceStateUpdate", async (oldState, newState) => {
    if (!client.user || newState.id !== client.user.id) return;
    if (!isGuildAllowed(newState.guild.id)) return;

    const configured = newState.guild.id === PRIMARY_GUILD_ID ||
        config[newState.guild.id]?.voice247?.enabled;
    if (!configured) return;

    const configuredChannelId =
        config[newState.guild.id]?.voice247?.channelId ||
        (newState.guild.id === PRIMARY_GUILD_ID ? DEFAULT_VOICE_CHANNEL_ID : null);

    if (!configuredChannelId) return;

    // ถ้าบอทถูกเตะ/หลุดจากห้องเสียง ให้เข้าใหม่ทันที
    if (!newState.channelId || newState.channelId !== configuredChannelId) {
        if (intentionalVoiceChanges.has(newState.guild.id)) {
            console.log(`[VOICE WATCHDOG] Ignoring intentional voice change in ${newState.guild.name}`);
            return;
        }
        console.log(`[VOICE WATCHDOG] Bot left voice in ${newState.guild.name}. Reconnecting...`);
        scheduleReconnect(newState.guild.id, 1000);
    }
});

client.on("guildCreate", async guild => {
    console.log(`[GUILD] Joined: ${guild.name} (${guild.id})`);
    try { await syncGuildCommands(guild); }
    catch (error) { console.log("[WHITELIST JOIN ERROR]", error.message); }
});

client.once("clientReady", async () => {
    console.log(`[BOT] Online: ${client.user.tag}`);

    // Discord Activity is global for the bot account, so member count must come
    // from one designated server only. Use GUILD_ID, or the first whitelist server.
    // KrakenHub primary server for member count.
    // Do NOT use GUILD_ID here because it may point to another bot/server.
    const memberCountGuildId = PRIMARY_GUILD_ID;
    const memberCountGuild = client.guilds.cache.get(memberCountGuildId);
    if (memberCountGuild) updateMemberActivity(memberCountGuild);
    connectConfiguredVoices().catch(error => {
        console.log("[VOICE START ERROR]", error.message);
    });

    // งานที่ไม่จำเป็นต่อการเข้า Voice ทำต่อแบบแยกกัน
    registerCommands().catch(error => {
        console.log("[COMMANDS ERROR]", error.message);
    });

    startConfiguredAutoPosts();

    startRobloxUpdates(client, config, saveConfig);
});

async function sendTicketPanel(channel) {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle("🎫 Kraken Support")
        .setDescription("กดปุ่มด้านล่างเพื่อเปิด Ticket ส่วนตัวกับทีมงาน")
        .addFields(
            {name:"🛠️ Support",value:"สอบถามหรือขอความช่วยเหลือ",inline:true},
            {name:"🐛 Bug Report",value:"แจ้งบั๊กหรือปัญหา",inline:true},
            {name:"💡 Suggestion",value:"เสนอแนะระบบ",inline:true}
        ).setFooter({text:"Kraken Community • Support"});
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_open").setLabel("เปิด Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary)
    );
    await channel.send({embeds:[embed],components:[row]});
}
async function createTicket(interaction) {
    const guild = interaction.guild;
    const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === "kraken-ticket:" + interaction.user.id);
    if (existing) return interaction.reply({content:"🎫 มึงมี Ticket เปิดอยู่แล้ว: " + existing,ephemeral:true});
    const tc = (config[guild.id] || {}).ticket || {};
    const category = tc.categoryId ? guild.channels.cache.get(tc.categoryId) : null;
    const staff = tc.staffRoleId ? guild.roles.cache.get(tc.staffRoleId) : null;
    const overwrites = [
        {id:guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},
        {id:interaction.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},
        {id:client.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ManageChannels,PermissionsBitField.Flags.ReadMessageHistory]}
    ];
    if (staff) overwrites.push({id:staff.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]});
    const channel = await guild.channels.create({
        name:"ticket-" + interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,20) || "ticket-user",
        type:ChannelType.GuildText,parent:category ? category.id : undefined,
        topic:"kraken-ticket:" + interaction.user.id,permissionOverwrites:overwrites
    });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_close").setLabel("ปิด Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger));
    await channel.send({content:"👋 <@" + interaction.user.id + ">" + (staff ? " <@&" + staff.id + ">" : ""),
        embeds:[new EmbedBuilder().setColor(0x57F287).setTitle("🎫 Ticket เปิดแล้ว").setDescription("อธิบายปัญหาหรือสิ่งที่ต้องการได้เลย")],
        components:[row]});
    await interaction.reply({content:"✅ เปิด Ticket ให้แล้ว: " + channel,ephemeral:true});
}
client.on("interactionCreate", async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === "ticket_open") return createTicket(interaction);
        if (interaction.customId === "ticket_close") {
            await interaction.reply({content:"🔒 กำลังปิด Ticket...",ephemeral:true});
            return setTimeout(() => interaction.channel && interaction.channel.delete().catch(()=>{}),1500);
        }
        return;
    }
    if (!interaction.isChatInputCommand()) return;

    if (!interaction.guild || !isGuildAllowed(interaction.guild.id)) {
        return interaction.reply({ content: "❌ KrakenHub ยังไม่ได้เปิดใช้งานในเซิร์ฟเวอร์นี้", ephemeral: true });
    }

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
                    value: "`/help` — ดูคำสั่ง\n`/ping` — เช็ก latency\n`/announce` — ส่งประกาศ\n`/stats` — ดูสถานะบอท"
                }
            )
            .setFooter({ text: "KrakenVoiceBot" });

        await interaction.reply({ embeds: [embed] });
        return;
    }

    if (interaction.commandName === "autopost") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "❌ ต้องมีสิทธิ์ Manage Server", ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        config[interaction.guild.id] ??= {};

        if (sub === "setup") {
            const channel = interaction.options.getChannel("channel", true);
            const message = interaction.options.getString("message", true).trim();
            const intervalMinutes = interaction.options.getInteger("minutes", true);
            if (!message) return interaction.reply({ content: "❌ กรุณาระบุข้อความ", ephemeral: true });
            if (intervalMinutes < 1 || intervalMinutes > 10080) return interaction.reply({ content: "❌ ตั้งเวลาได้ตั้งแต่ 1 ถึง 10080 นาที (7 วัน)", ephemeral: true });

            config[interaction.guild.id].autopost = {
                enabled: true,
                channelId: channel.id,
                message,
                intervalMinutes,
                lastSentAt: Date.now()
            };
            saveConfig(config);
            startAutoPost(interaction.guild.id);
            return interaction.reply({
                content: "✅ ตั้งข้อความอัตโนมัติสำเร็จแล้ว\n📍 ห้อง: " + channel + "\n⏰ จะส่งครั้งแรกใน 1 ชั่วโมง และส่งซ้ำทุก 1 ชั่วโมง\n🛑 ใช้ `/autopost stop` เพื่อปิด",
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
        }

        if (sub === "stop") {
            const timer = autoPostTimers.get(interaction.guild.id);
            if (timer) clearInterval(timer);
            autoPostTimers.delete(interaction.guild.id);
            if (config[interaction.guild.id].autopost) config[interaction.guild.id].autopost.enabled = false;
            saveConfig(config);
            return interaction.reply({ content: "🛑 ปิดข้อความอัตโนมัติแล้ว", ephemeral: true });
        }

        const setting = config[interaction.guild.id]?.autopost;
        if (!setting?.enabled) {
            return interaction.reply({ content: "ℹ️ ยังไม่ได้เปิดใช้ ใช้ `/autopost setup` เพื่อตั้งค่า", ephemeral: true });
        }
        return interaction.reply({
            content: "✅ เปิดใช้งานอยู่\n📍 ห้อง: <#" + setting.channelId + ">\n⏰ ส่งทุก 1 ชั่วโมง",
            ephemeral: true
        });
    }

    if (interaction.commandName === "status") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        const sub = interaction.options.getSubcommand();
        if (sub === "clear") { client.user.setActivity(null); return interaction.reply({content:"✅ ล้างสถานะแล้ว",ephemeral:true}); }
        const type = interaction.options.getString("type",true); const text = interaction.options.getString("text",true);
        const map = {Playing:ActivityType.Playing,Watching:ActivityType.Watching,Listening:ActivityType.Listening,Competing:ActivityType.Competing};
        client.user.setActivity(text,{type:map[type]}); config[interaction.guild.id] ??= {}; config[interaction.guild.id].status={type,text}; saveConfig(config);
        return interaction.reply({content:"✅ ตั้งสถานะ " + type + " " + text + " แล้ว",ephemeral:true});
    }
    if (interaction.commandName === "ticket") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        const sub=interaction.options.getSubcommand();
        if (sub === "setup") {
            const ch=interaction.options.getChannel("channel",true), cat=interaction.options.getChannel("category"), role=interaction.options.getRole("staff");
            config[interaction.guild.id] ??= {}; config[interaction.guild.id].ticket={panelChannelId:ch.id,categoryId:cat?.id || null,staffRoleId:role?.id || null}; saveConfig(config);
            await interaction.deferReply({ephemeral:true});
            try {
                await sendTicketPanel(ch);
                return interaction.editReply({content:"✅ ตั้ง Ticket สำเร็จที่ " + ch,allowedMentions:{parse:["channels"]}});
            } catch (error) {
                console.log("[TICKET SETUP ERROR]", error.message);
                return interaction.editReply("❌ ตั้ง Ticket ไม่สำเร็จ: " + error.message);
            }
        }
        const id=config[interaction.guild.id]?.ticket?.panelChannelId, ch=id ? interaction.guild.channels.cache.get(id) : null;
        if (!ch) return interaction.reply({content:"❌ ใช้ /ticket setup ก่อน",ephemeral:true}); await sendTicketPanel(ch); return interaction.reply({content:"✅ ส่ง Panel ใหม่แล้ว",ephemeral:true});
    }
    if (interaction.commandName === "247") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        }
        const channel = interaction.options.getChannel("channel", true);
        if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
            return interaction.reply({content:"❌ กรุณาเลือกห้องเสียงเท่านั้น",ephemeral:true});
        }

        // สำคัญ: ตอบ Discord ก่อนทุกอย่าง เพื่อให้ /247 ไม่ค้างที่ "กำลังคิด…"
        await interaction.reply({
            content:"✅ ตั้งโหมด 24/7 แล้ว\n🎧 ห้อง: <#" + channel.id + ">\n\n🔄 กำลังเชื่อมต่อห้องเสียง…",
            ephemeral:true
        });

        // งานทั้งหมดหลังจากตอบ Interaction แล้ว
        setImmediate(() => {
            try {
                config[interaction.guild.id] ??= {};
                config[interaction.guild.id].voice247 = {
                    enabled: true,
                    channelId: channel.id,
                    channelName: channel.name
                };
                saveConfig(config);

                stopVoiceForGuild(interaction.guild.id);

                connectToVoice(interaction.guild.id, async readyChannel => {
                    try {
                        await interaction.editReply({
                            content:"✅ เชื่อมต่อห้องเสียงสำเร็จแล้ว\n🎧 ห้อง: <#" + readyChannel.id + ">\n\n🟢 สถานะ: **เชื่อมต่ออยู่ 24/7**"
                        });
                    } catch (error) {
                        console.log("[247 STATUS UPDATE ERROR]", error.message);
                    }
                })
                    .then(() => console.log("[247] Background voice connect started"))
                    .catch(async error => {
                        console.log("[247 ERROR]", error.message);
                        try {
                            await interaction.editReply({
                                content:"❌ เชื่อมต่อห้องเสียงไม่สำเร็จ\n🎧 ห้อง: <#" + channel.id + ">\n\n🔴 สถานะ: **เชื่อมต่อไม่สำเร็จ**"
                            });
                        } catch (editError) {
                            console.log("[247 ERROR STATUS UPDATE]", editError.message);
                        }
                    });
            } catch (error) {
                console.log("[247 BACKGROUND ERROR]", error.message);
            }
        });

        return;
    }

    if (interaction.commandName === "roblox") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        const sub=interaction.options.getSubcommand();
        if (sub === "setup") { const ch=interaction.options.getChannel("channel",true); config[interaction.guild.id] ??= {}; config[interaction.guild.id].roblox={channelId:ch.id,enabled:true}; saveConfig(config); return interaction.reply({content:"✅ ตั้งแจ้งเตือน Roblox ที่ " + ch,ephemeral:true}); }
        if (!config[interaction.guild.id]?.roblox?.channelId) return interaction.reply({content:"❌ ใช้ /roblox setup ก่อน",ephemeral:true});
        await interaction.deferReply({ephemeral:true});
        try {
            await sendTestUpdate(client, config, interaction.guild.id);
            return interaction.editReply("✅ ส่งข้อความทดสอบ Roblox Update ไปยังห้องที่ตั้งค่าไว้แล้ว");
        } catch (error) {
            console.log("[ROBLOX TEST ERROR]", error.message);
            return interaction.editReply("❌ ทดสอบไม่สำเร็จ: " + error.message);
        }
    }

    if (interaction.commandName === "announce") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        }
        const channel = interaction.options.getChannel("channel", true);
        const message = interaction.options.getString("message", true);
        const title = interaction.options.getString("title") || "📢 ประกาศ";
        // แยกลิงก์ออกจากข้อความ เพื่อให้ Discord สร้าง Link Preview/Video Preview ได้
        const urls = message.match(/https?:\/\/[^\s<>]+/g) || [];
        const cleanMessage = message.replace(/https?:\/\/[^\s<>]+/g, "").trim();

        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(cleanMessage || "📺 ดูคลิปรีวิวด้านล่าง")
            .setFooter({text:"Kraken Community • Announcement"}).setTimestamp();
        try {
            // ส่งเป็นข้อความธรรมดาในโพสต์เดียว เพื่อให้ Discord สร้าง YouTube Video Preview
            // การใส่ EmbedBuilder ในข้อความเดียวกันอาจทำให้ Discord ไม่แสดง native video preview
            const announcementContent = [
                title ? `**${title}**` : null,
                cleanMessage || null,
                urls.length ? urls.join("\n") : null
            ].filter(Boolean).join("\n\n");

            await interaction.deferReply({ephemeral:true});

            await channel.send({
                content: announcementContent || "📢 ประกาศ"
            });

            return interaction.editReply({
                content:"✅ ส่งประกาศไปที่ <#" + channel.id + "> เรียบร้อยแล้ว",
                allowedMentions:{parse:["channels"]}
            });
        } catch (error) {
            console.log("[ANNOUNCE ERROR]", error.message);
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply("❌ ส่งประกาศไม่สำเร็จ: " + error.message);
            }
            return interaction.reply({content:"❌ ส่งประกาศไม่สำเร็จ: " + error.message,ephemeral:true});
        }
    }

    if (interaction.commandName === "stats") {
        const guildConnection = voiceConnections.get(interaction.guild.id);
        const voiceStatus = guildConnection?.state?.status || "Not connected";
        const guildReconnecting = reconnectingGuilds.has(interaction.guild.id);
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
                    value: guildReconnecting ? "กำลังเชื่อมต่อ..." : "พร้อมใช้งาน",
                    inline: true
                }
            )
            .setFooter({ text: "KrakenVoiceBot • 24/7" });

        await interaction.reply({ embeds: [embed] });
    }
});

client.on("guildMemberAdd", member => {
    const targetGuildId = PRIMARY_GUILD_ID
    if (targetGuildId && member.guild.id === targetGuildId) {
        updateMemberActivity(member.guild);
    }
});

client.on("guildMemberRemove", member => {
    const targetGuildId = PRIMARY_GUILD_ID;
    if (targetGuildId && member.guild.id === targetGuildId) {
        updateMemberActivity(member.guild);
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

const { startDashboard } = require("./web/dashboard");
const { startRobloxUpdates, sendTestUpdate } = require("./systems/robloxUpdates");
startDashboard({ client, config, saveConfig, formatUptime });

client.login(process.env.BOT_TOKEN);
