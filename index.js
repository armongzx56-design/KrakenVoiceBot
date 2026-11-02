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
    StringSelectMenuBuilder,
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
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
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
                .addChoices({name:"Playing",value:"Playing"},{name:"Watching",value:"Watching"},{name:"Listening",value:"Listening"},{name:"Competing",value:"Competing"},{name:"Streaming",value:"Streaming"}))
            .addStringOption(o => o.setName("text").setDescription("ข้อความ").setRequired(true))
            .addStringOption(o => o.setName("url").setDescription("ลิงก์ Twitch หรือ YouTube สำหรับสถานะ Streaming").setRequired(false)))
        .addSubcommand(s => s.setName("clear").setDescription("ล้างสถานะ")),
    new SlashCommandBuilder()
        .setName("ticket").setDescription("ระบบ Ticket")
        .addSubcommand(s => s.setName("setup").setDescription("ตั้ง Ticket Panel")
            .addChannelOption(o => o.setName("channel").setDescription("ห้อง Panel").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addChannelOption(o => o.setName("category").setDescription("หมวดหมู่ Ticket").addChannelTypes(ChannelType.GuildCategory))
            .addRoleOption(o => o.setName("staff").setDescription("ยศทีมงาน"))
            .addChannelOption(o => o.setName("notify").setDescription("ห้องแจ้งเตือนทีมงานเมื่อมี Ticket ใหม่").addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName("panel").setDescription("ส่ง Panel ใหม่")),
    new SlashCommandBuilder()
        .setName("247").setDescription("ให้บอทอยู่ในห้องเสียง 24/7")
        .addChannelOption(o => o.setName("channel").setDescription("เลือกห้องเสียงที่ให้บอทเข้า").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setRequired(true)),
    new SlashCommandBuilder()
        .setName("roblox").setDescription("ระบบแจ้งเตือน Roblox")
        .addSubcommand(s => s.setName("setup").setDescription("ตั้งห้องแจ้งเตือน")
            .addChannelOption(o => o.setName("channel").setDescription("ห้องข่าว").addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(s => s.setName("test").setDescription("ทดสอบระบบ")),
    new SlashCommandBuilder()
        .setName("mod").setDescription("คำสั่งจัดการสมาชิก")
        .addSubcommand(x => x.setName("warn").setDescription("เตือนสมาชิก").addUserOption(o=>o.setName("member").setDescription("สมาชิก").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false)))
        .addSubcommand(x => x.setName("timeout").setDescription("พักสมาชิก").addUserOption(o=>o.setName("member").setDescription("สมาชิก").setRequired(true)).addIntegerOption(o=>o.setName("minutes").setDescription("นาที").setMinValue(1).setMaxValue(10080).setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false)))
        .addSubcommand(x => x.setName("kick").setDescription("เตะสมาชิก").addUserOption(o=>o.setName("member").setDescription("สมาชิก").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false)))
        .addSubcommand(x => x.setName("ban").setDescription("แบนสมาชิก").addUserOption(o=>o.setName("member").setDescription("สมาชิก").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false)))
        .addSubcommand(x => x.setName("unban").setDescription("ปลดแบนด้วย User ID").addStringOption(o=>o.setName("user_id").setDescription("Discord User ID").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false))),
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

const trackedMemberCounts = new Map();
const memberRefreshTimers = new Map();

function publishMemberCount(guild, memberCount) {
    if (!guild || guild.id !== PRIMARY_GUILD_ID || !client.user) return;
    const count = Math.max(0, Number(memberCount) || 0);
    trackedMemberCounts.set(guild.id, count);
    // Keep the configured custom status instead of overwriting it with the member count.
    if (Object.values(config).some(settings => settings?.status)) return;
    client.user.setActivity(`${count} Members`, {
        type: ActivityType.Watching
    });
    console.log(`[MEMBERS] ${guild.name}: ${count} Members`);
}

// Fetch the full member list instead of trusting a possibly stale gateway cache.
// Requires Server Members Intent to be enabled in the Discord Developer Portal.
async function refreshMemberActivity(guild) {
    if (!guild || guild.id !== PRIMARY_GUILD_ID || !client.user) return;
    try {
        const members = await guild.members.fetch({ force: true });
        publishMemberCount(guild, members.size);
    } catch (error) {
        console.log(`[MEMBERS REFRESH ERROR] ${guild.name}: ${error.message}`);
        // Keep the last known count if Discord refuses the full member fetch.
        if (!trackedMemberCounts.has(guild.id)) publishMemberCount(guild, guild.memberCount);
    }
}

function updateMemberActivity(guild, delta = null) {
    if (!guild || guild.id !== PRIMARY_GUILD_ID || !client.user) return;
    if (delta === null) {
        void refreshMemberActivity(guild);
        return;
    }
    const previous = trackedMemberCounts.has(guild.id)
        ? trackedMemberCounts.get(guild.id)
        : guild.memberCount;
    publishMemberCount(guild, previous + delta);
}

// Periodically reconcile missed events and stale counts against Discord's full member list.
function startMemberCountRefresh(guild) {
    if (!guild || guild.id !== PRIMARY_GUILD_ID) return;
    const oldTimer = memberRefreshTimers.get(guild.id);
    if (oldTimer) clearInterval(oldTimer);
    const timer = setInterval(() => void refreshMemberActivity(guild), 10 * 60 * 1000);
    memberRefreshTimers.set(guild.id, timer);
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
    if (memberCountGuild) {
        await refreshMemberActivity(memberCountGuild);
        startMemberCountRefresh(memberCountGuild);
    }
    // Restore the saved custom status after startup/member-count initialization.
    const savedStatus = Object.values(config).map(settings => settings?.status).find(Boolean);
    if (savedStatus) {
        const statusTypes = {Playing:ActivityType.Playing,Watching:ActivityType.Watching,Listening:ActivityType.Listening,Competing:ActivityType.Competing,Streaming:ActivityType.Streaming};
        client.user.setPresence({
            activities: [{ name: savedStatus.text, type: statusTypes[savedStatus.type] ?? ActivityType.Playing, ...(savedStatus.type === "Streaming" && savedStatus.url ? { url: savedStatus.url } : {}) }],
            status: "online"
        });
    }
    connectConfiguredVoices().catch(error => {
        console.log("[VOICE START ERROR]", error.message);
    });

    // งานที่ไม่จำเป็นต่อการเข้า Voice ทำต่อแบบแยกกัน
    registerCommands().catch(error => {
        console.log("[COMMANDS ERROR]", error.message);
    });

    startConfiguredAutoPosts();

    startRobloxUpdates(client, config, saveConfig);
    startSecurity(client, config, saveConfig);
});

const TICKET_TYPES = {
    support: { label: "ติดต่อสอบถาม", emoji: "💬" },
    purchase: { label: "ซื้อขาย / เติมเงิน", emoji: "🛒" },
    report: { label: "แจ้งเรื่องร้องเรียน", emoji: "📢" },
    bug: { label: "แจ้งบั๊ก / ปัญหาระบบ", emoji: "🐛" }
};

function escapeTranscriptHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}
async function buildTicketTranscript(channel) {
    const messages = [];
    let before;
    for (let page = 0; page < 50; page++) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!batch.size) break;
        messages.push(...batch.values());
        before = batch.last()?.id;
        if (batch.size < 100 || !before) break;
    }
    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const body = messages.map(message => {
        const author = escapeTranscriptHtml(message.author?.tag || "Unknown");
        const uid = escapeTranscriptHtml(message.author?.id || "");
        const time = escapeTranscriptHtml(new Date(message.createdTimestamp).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }));
        const content = escapeTranscriptHtml(message.content || "").replace(/\r?\n/g, "<br>");
        const files = [...message.attachments.values()].map(file =>
            '<p>📎 <a href="' + escapeTranscriptHtml(file.url) + '">' + escapeTranscriptHtml(file.name || "ไฟล์แนบ") + '</a></p>'
        ).join("");
        const embeds = message.embeds.map(embed => {
            const details = [embed.title, embed.description, ...(embed.fields || []).map(field => field.name + ": " + field.value)].filter(Boolean).join("\n");
            return details ? '<blockquote>' + escapeTranscriptHtml(details).replace(/\r?\n/g, "<br>") + '</blockquote>' : "";
        }).join("");
        return '<article><b>' + author + '</b> <small>(' + uid + ') · ' + time + '</small><p>' +
            (content || "<i>[ไม่มีข้อความ]</i>") + '</p>' + files + embeds + '</article>';
    }).join("");
    const html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Ticket Transcript</title>' +
        '<style>body{font:14px Arial;background:#f4f5f7;padding:24px;color:#23272a}.wrap{max-width:900px;margin:auto;background:white;padding:24px;border-radius:12px}article{padding:12px 0;border-bottom:1px solid #ddd}small{color:#777}p{overflow-wrap:anywhere}a{color:#5865f2}</style>' +
        '</head><body><main class="wrap"><h1>Kraken Ticket #' +
        escapeTranscriptHtml(channel.topic?.split(":")[2] || "ไม่ระบุ") + '</h1><p>ห้อง: ' +
        escapeTranscriptHtml(channel.name) + ' · ข้อความทั้งหมด ' + messages.length + '</p>' +
        (body || "<p>ไม่มีข้อความใน Ticket</p>") + '</main></body></html>';
    return Buffer.from(html, "utf8");
}

const TICKET_SUBTYPES = {
    support: [{id:"general",label:"สอบถามทั่วไป",emoji:"💬"},{id:"server",label:"สอบถามเกี่ยวกับเซิร์ฟเวอร์",emoji:"🏠"},{id:"other",label:"เรื่องอื่น ๆ",emoji:"❔"}],
    purchase: [{id:"order",label:"สอบถามคำสั่งซื้อ",emoji:"🛒"},{id:"payment",label:"แจ้งปัญหาการชำระเงิน",emoji:"💳"},{id:"product",label:"ปัญหาสินค้า / บริการ",emoji:"📦"}],
    report: [{id:"player",label:"แจ้งผู้เล่น",emoji:"👤"},{id:"staff",label:"ร้องเรียนทีมงาน",emoji:"🛡️"},{id:"other",label:"ร้องเรียนเรื่องอื่น",emoji:"📢"}],
    bug: [{id:"technical",label:"ปัญหาทางเทคนิค",emoji:"⚙️"},{id:"error",label:"พบข้อผิดพลาด / บั๊ก",emoji:"🐛"},{id:"other",label:"ปัญหาอื่น ๆ",emoji:"❔"}]
};
async function sendTicketPanel(channel) {
    const embed=new EmbedBuilder().setColor(0x5865F2).setTitle("🎫 KRAKEN SUPPORT CENTER").setDescription("**ศูนย์ช่วยเหลือ Kraken Community**\nเลือกหมวดหมู่ จากนั้นเลือกหัวข้อย่อย ระบบจะเปิดห้อง Ticket ส่วนตัวให้โดยอัตโนมัติ\n\n🔒 ข้อมูลเห็นได้เฉพาะคุณและทีมงาน");
    const rows=[], entries=Object.entries(TICKET_TYPES);
    for(let i=0;i<entries.length;i+=2) {
        const row=new ActionRowBuilder();
        for(const [key,item] of entries.slice(i,i+2)) row.addComponents(new ButtonBuilder().setCustomId("ticket_parent_"+key).setLabel(item.label).setEmoji(item.emoji).setStyle(ButtonStyle.Primary));
        rows.push(row);
    }
    await channel.send({embeds:[embed],components:rows});
}
async function createTicket(interaction,ticketType,subType) {
    const guild=interaction.guild, type=TICKET_TYPES[ticketType], sub=TICKET_SUBTYPES[ticketType]?.find(item=>item.id===subType);
    if(!guild||!type||!sub) return interaction.reply({content:"❌ ไม่พบหัวข้อ Ticket ที่เลือก",ephemeral:true});
    await interaction.deferReply({ephemeral:true});
    try {
        const existing=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.topic?.startsWith("kraken-ticket:"+interaction.user.id+":"));
        if(existing) return interaction.editReply({content:"🎫 คุณมี Ticket ที่ยังเปิดอยู่แล้ว: "+existing});
        const tc=(config[guild.id]||{}).ticket||{};
        const n=BigInt(tc.ticketCounter||"0").toString();
        tc.ticketCounter=(BigInt(n)+1n).toString(); config[guild.id]??={}; config[guild.id].ticket=tc; saveConfig(config);
        const number=n.padStart(6,"0"), category=tc.categoryId?guild.channels.cache.get(tc.categoryId):null, staff=tc.staffRoleId?guild.roles.cache.get(tc.staffRoleId):null;
        const overwrites=[
            {id:guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},
            {id:interaction.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory,PermissionsBitField.Flags.AttachFiles,PermissionsBitField.Flags.EmbedLinks]},
            {id:client.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ManageChannels,PermissionsBitField.Flags.ReadMessageHistory]}
        ];
        if(staff) overwrites.push({id:staff.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory,PermissionsBitField.Flags.AttachFiles]});
        const channel=await guild.channels.create({name:"ticket-"+number,type:ChannelType.GuildText,parent:category?.id,topic:"kraken-ticket:"+interaction.user.id+":"+number+":"+ticketType+":"+subType,permissionOverwrites:overwrites});
        const closeRow=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_close").setLabel("ปิด Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger));
        const ticketEmbed=new EmbedBuilder().setColor(0x57F287).setTitle("🎫 Ticket #"+number+" • "+type.label)
            .setDescription("สวัสดีคุณ <@"+interaction.user.id+"> 👋\nทีมงานจะเข้ามาดูแลโดยเร็วที่สุด\n\n**หัวข้อที่เลือก:** "+sub.label+"\nกรุณาระบุรายละเอียดและแนบหลักฐานที่เกี่ยวข้อง")
            .addFields({name:"เลขตั๋ว",value:"#"+number,inline:true},{name:"สถานะ",value:"🟢 เปิดใช้งาน",inline:true}).setTimestamp();
        await channel.send({content:"<@"+interaction.user.id+">"+(staff?" <@&"+staff.id+">":""),embeds:[ticketEmbed],components:[closeRow],allowedMentions:{users:[interaction.user.id],roles:staff?[staff.id]:[]}});
        const notifyId=tc.notifyChannelId||tc.panelChannelId, notify=notifyId?(guild.channels.cache.get(notifyId)||await guild.channels.fetch(notifyId).catch(()=>null)):null;
        if(notify?.isTextBased()&&notify.send) {
            const notice=new EmbedBuilder().setColor(0x5865F2).setTitle("🔔 มี Ticket ใหม่เข้ามา!")
                .addFields({name:"เลขตั๋ว",value:"#"+number,inline:true},{name:"ผู้เปิด Ticket",value:"<@"+interaction.user.id+">",inline:true},{name:"หมวดหมู่",value:type.label,inline:true},{name:"หัวข้อย่อย",value:sub.label,inline:true},{name:"ห้อง Ticket",value:channel.toString(),inline:true},{name:"เวลาเปิด",value:"<t:"+Math.floor(Date.now()/1000)+":F> (<t:"+Math.floor(Date.now()/1000)+":R>)",inline:false})
            await notify.send({content:staff?"<@&"+staff.id+"> มี Ticket ใหม่รอรับเรื่อง":"มี Ticket ใหม่รอรับเรื่อง",embeds:[notice],allowedMentions:{roles:staff?[staff.id]:[]}});
        }
        return interaction.editReply({content:"✅ เปิด Ticket ให้แล้ว: "+channel,allowedMentions:{parse:[]}});
    } catch(error) {
        console.log("[TICKET CREATE ERROR]",error.message);
        return interaction.editReply({content:"❌ เปิด Ticket ไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Manage Channels ของบอท\nรายละเอียด: "+error.message});
    }
}
async function showTicketSubtypes(interaction,ticketType) {
    const type=TICKET_TYPES[ticketType], subs=TICKET_SUBTYPES[ticketType];
    if(!type||!subs) return interaction.reply({content:"❌ ไม่พบหมวดหมู่ที่เลือก",ephemeral:true});
    const row=new ActionRowBuilder();
    for(const item of subs) row.addComponents(new ButtonBuilder().setCustomId("ticket_sub_"+ticketType+"_"+item.id).setLabel(item.label).setEmoji(item.emoji).setStyle(ButtonStyle.Secondary));
    return interaction.reply({content:type.emoji+" **"+type.label+"**\nเลือกหัวข้อย่อยที่ต้องการติดต่อ:",components:[row],ephemeral:true});
}

// ==================== PAYMENT SHORTCUT ====================
// สมาชิกพิมพ์ !โอน แล้วบอทจะลบคำสั่งและส่งรายละเอียดการชำระเงิน
client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild || !isGuildAllowed(message.guild.id)) return;
    if (message.content.trim() !== "!โอน") return;

    try {
        await message.delete();
    } catch (error) {
        console.log("[PAYMENT] ลบคำสั่ง !โอนไม่สำเร็จ:", error.message);
    }

    const paymentEmbed = new EmbedBuilder()
        .setColor(0x168BFF)
        .setTitle("💸 ช่องทางโอนเงิน")
        .setDescription(
            "**🏦 บัญชีกสิกรไทย**\\n" +
            "เลขที่บัญชี: \`1548041194\`\\n\\n" +
            "**💚 TrueMoney Wallet**\\n" +
            "หมายเลข: \`0958722102\`\\n\\n" +
            "📄 **กรุณาแนบหลักฐานการโอน (สลิป)**"
        )
        .setFooter({ text: "Kraken Community • Payment" })
        .setTimestamp();

    try {
        await message.channel.send({
            embeds: [paymentEmbed],
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        console.log("[PAYMENT SEND ERROR]", error.message);
    }
});

client.on("interactionCreate", async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith("ticket_parent_")) return showTicketSubtypes(interaction,interaction.customId.slice("ticket_parent_".length));
        if (interaction.customId.startsWith("ticket_sub_")) {
            const parts=interaction.customId.slice("ticket_sub_".length).split("_");
            const subType=parts.pop(), ticketType=parts.join("_");
            return createTicket(interaction,ticketType,subType);
        }
        if (interaction.customId === "ticket_close") {
            const ownerId = interaction.channel?.topic?.split(":")[1];
            const staffRoleId = config[interaction.guildId]?.ticket?.staffRoleId;
            const isOwner = ownerId === interaction.user.id;
            const isStaff = staffRoleId && interaction.member?.roles?.cache?.has(staffRoleId);
            const canManage = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);
            if (!isOwner && !isStaff && !canManage) {
                return interaction.reply({ content: "❌ เฉพาะเจ้าของ Ticket หรือทีมงานเท่านั้นที่ปิดห้องนี้ได้", ephemeral: true });
            }
            const topicParts = interaction.channel?.topic?.split(":") || [];
            const ticketOwnerId = topicParts[1] || ownerId || "ไม่ระบุ";
            const ticketNumber = topicParts[2] || "ไม่ระบุ";
            const ticketType = TICKET_TYPES[topicParts[3]]?.label || topicParts[3] || "ไม่ระบุ";
            const ticketSubType = TICKET_SUBTYPES[topicParts[3]]?.find(item => item.id === topicParts[4])?.label || topicParts[4] || "ไม่ระบุ";
            const ticketConfig = config[interaction.guildId]?.ticket || {};
            const logChannelId = ticketConfig.notifyChannelId || ticketConfig.panelChannelId;
            const logChannel = logChannelId
                ? (interaction.guild.channels.cache.get(logChannelId) || await interaction.guild.channels.fetch(logChannelId).catch(() => null))
                : null;
            await interaction.deferReply({ ephemeral: true });
            const closedAt = Date.now();
            let transcriptFile = null;
            try {
                transcriptFile = {
                    attachment: await buildTicketTranscript(interaction.channel),
                    name: "Kraken-Ticket-" + ticketNumber + "-Transcript.html"
                };
            } catch (error) {
                console.log("[TICKET TRANSCRIPT ERROR]", error.message);
            }
            if (logChannel?.isTextBased() && logChannel.send) {
                const closeLog = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("🔒 Ticket ถูกปิดแล้ว")
                    .addFields(
                        { name: "แท็กห้อง", value: "<#" + interaction.channel.id + ">", inline: true },
                        { name: "ผู้เปิด Ticket", value: ticketOwnerId === "ไม่ระบุ" ? ticketOwnerId : "<@" + ticketOwnerId + ">", inline: true },
                        { name: "ผู้ปิด Ticket", value: "<@" + interaction.user.id + ">", inline: true },
                        { name: "หมวดหมู่", value: ticketType, inline: true },
                        { name: "หัวข้อย่อย", value: ticketSubType, inline: true },
                        { name: "ห้อง Ticket", value: interaction.channel.toString(), inline: true },
                        { name: "เวลาปิด", value: "<t:" + Math.floor(closedAt / 1000) + ":F> (<t:" + Math.floor(closedAt / 1000) + ":R>)", inline: false },
                        { name: "ประวัติแชท", value: transcriptFile ? "📄 แนบไฟล์ Transcript แล้ว" : "⚠️ สร้างไฟล์ Transcript ไม่สำเร็จ", inline: false }
                    )
                    .setTimestamp(closedAt);
                try {
                    await logChannel.send({
                        embeds: [closeLog],
                        files: transcriptFile ? [transcriptFile] : [],
                        allowedMentions: { parse: [] }
                    });
                } catch (error) {
                    console.log("[TICKET LOG ERROR]", error.message);
                }
            }
            await interaction.editReply({ content: "🔒 กำลังปิด Ticket ห้องนี้จะถูกลบใน 5 วินาที" });
            return setTimeout(() => interaction.channel?.delete().catch(error => console.log("[TICKET CLOSE ERROR]", error.message)), 5000);
        }
        return;
    }
    if (!interaction.isChatInputCommand()) return;

    if (!interaction.guild || !isGuildAllowed(interaction.guild.id)) {
        return interaction.reply({ content: "❌ KrakenHub ยังไม่ได้เปิดใช้งานในเซิร์ฟเวอร์นี้", ephemeral: true });
    }

    if (interaction.commandName === "mod") {
        const action = interaction.options.getSubcommand();
        const permission = action === "warn" ? PermissionsBitField.Flags.ModerateMembers : action === "timeout" ? PermissionsBitField.Flags.ModerateMembers : action === "kick" ? PermissionsBitField.Flags.KickMembers : PermissionsBitField.Flags.BanMembers;
        if (!interaction.memberPermissions?.has(permission)) return interaction.reply({ content: "❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        try {
            const result = await moderate(interaction, action);
            await sendLog(interaction.guild, config, "🛡️ Moderation: " + action.toUpperCase(), result, 0x5865F2, [
                { name: "ผู้ดำเนินการ", value: "<@" + interaction.user.id + ">", inline: true },
                { name: "เหตุผล", value: interaction.options.getString("reason") || "ไม่ระบุเหตุผล", inline: true }
            ], saveConfig);
            return interaction.editReply({ content: "✅ " + result });
        } catch (error) {
            return interaction.editReply({ content: "❌ " + error.message });
        }
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
                content: "✅ ตั้งข้อความอัตโนมัติสำเร็จแล้ว\\n📍 ห้อง: " + channel + "\\n⏰ ส่งซ้ำทุก " + intervalMinutes + " นาที" + (intervalMinutes % 60 === 0 ? " (" + (intervalMinutes / 60) + " ชั่วโมง)" : "") + "\\n📨 ส่งครั้งแรกเมื่อครบช่วงเวลาที่ตั้งไว้\\n🛑 ใช้ `/autopost stop` เพื่อปิด",
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
            content: "✅ เปิดใช้งานอยู่\\n📍 ห้อง: <#" + setting.channelId + ">\\n⏰ ส่งทุก " + (Number(setting.intervalMinutes) || 60) + " นาที",
            ephemeral: true
        });
    }

    if (interaction.commandName === "status") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        const sub = interaction.options.getSubcommand();
        if (sub === "clear") {
            for (const settings of Object.values(config)) delete settings.status;
            saveConfig(config);
            const primaryGuild = client.guilds.cache.get(PRIMARY_GUILD_ID);
            if (primaryGuild) await refreshMemberActivity(primaryGuild);
            else client.user.setActivity(null);
            return interaction.reply({content:"✅ ล้างสถานะแล้ว",ephemeral:true});
        }
        const type = interaction.options.getString("type",true);
        const text = interaction.options.getString("text",true);
        const url = interaction.options.getString("url");
        const map = {Playing:ActivityType.Playing,Watching:ActivityType.Watching,Listening:ActivityType.Listening,Competing:ActivityType.Competing,Streaming:ActivityType.Streaming};
        if (type === "Streaming" && (!url || !/^https?:\/\/(www\.)?(twitch\.tv|youtube\.com)\//i.test(url))) {
            return interaction.reply({content:"❌ โหมด Streaming ต้องใส่ลิงก์ Twitch หรือ YouTube ที่ถูกต้องในช่อง url",ephemeral:true});
        }
        client.user.setPresence({activities:[{name:text,type:map[type],...(type === "Streaming" ? {url} : {})}],status:"online"});
        config[interaction.guild.id] ??= {};
        config[interaction.guild.id].status = {type,text,...(type === "Streaming" ? {url} : {})};
        saveConfig(config);
        return interaction.reply({content:"✅ ตั้งสถานะ " + type + " " + text + " แล้ว" + (type === "Streaming" ? "\n🔗 " + url : ""),ephemeral:true});
    }
    if (interaction.commandName === "ticket") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        const sub=interaction.options.getSubcommand();
        if (sub === "setup") {
            const ch=interaction.options.getChannel("channel",true), cat=interaction.options.getChannel("category"), role=interaction.options.getRole("staff"), notify=interaction.options.getChannel("notify");
            config[interaction.guild.id] ??= {}; const previousTicket=config[interaction.guild.id].ticket || {}; config[interaction.guild.id].ticket={...previousTicket,panelChannelId:ch.id,categoryId:cat?.id || null,staffRoleId:role?.id || null,notifyChannelId:notify?.id || previousTicket.notifyChannelId || null}; saveConfig(config);
            await interaction.deferReply({ephemeral:true});
            try {
                await sendTicketPanel(ch);
                return interaction.editReply({content:"✅ ตั้ง Ticket สำเร็จที่ " + ch,allowedMentions:{parse:[]}});
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
                allowedMentions:{parse:[]}
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
        updateMemberActivity(member.guild, +1);
    }
});

client.on("guildMemberRemove", member => {
    const targetGuildId = PRIMARY_GUILD_ID;
    if (targetGuildId && member.guild.id === targetGuildId) {
        updateMemberActivity(member.guild, -1);
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

const { startSecurity, moderate, sendLog } = require("./systems/security");
const { startDashboard } = require("./web/dashboard");
const { startRobloxUpdates, sendTestUpdate } = require("./systems/robloxUpdates");
startDashboard({ client, config, saveConfig, formatUptime });

client.login(process.env.BOT_TOKEN);
