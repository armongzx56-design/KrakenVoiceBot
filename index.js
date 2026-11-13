process.env.TZ = "Asia/Bangkok";

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
    PermissionsBitField,
    WebhookClient
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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites
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
const AUTOPOST_FILE = path.join(DATA_DIR, "autopost_settings.json");
const VOICE_FILE = path.join(DATA_DIR, "voice_settings.json");
const STATUS_FILE = path.join(DATA_DIR, "status_settings.json");
const YOUTUBE_FILE = path.join(DATA_DIR, "youtube_settings.json");
const ROBLOX_FILE = path.join(DATA_DIR, "roblox_settings.json");
const SECURITY_FILE = path.join(DATA_DIR, "security_settings.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function safeReadJSON(filepath, def = {}) {
    try {
        if (fs.existsSync(filepath)) return JSON.parse(fs.readFileSync(filepath, "utf8"));
    } catch (e) {
        console.error(`[PERSISTENCE READ ERR ${path.basename(filepath)}]`, e.message);
    }
    return def;
}

function safeWriteJSON(filepath, data) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = filepath + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(tmp, filepath);
    } catch (e) {
        try { fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8"); }
        catch (err) { console.error(`[PERSISTENCE WRITE ERR ${path.basename(filepath)}]`, err.message); }
    }
}

function loadConfig() {
    let main = safeReadJSON(CONFIG_FILE, {});
    const autoposts = safeReadJSON(AUTOPOST_FILE, {});
    const voices = safeReadJSON(VOICE_FILE, {});
    const statuses = safeReadJSON(STATUS_FILE, {});
    const youtubes = safeReadJSON(YOUTUBE_FILE, {});
    const robloxes = safeReadJSON(ROBLOX_FILE, {});
    const securities = safeReadJSON(SECURITY_FILE, {});

    const allGuildIds = new Set([
        ...Object.keys(main),
        ...Object.keys(autoposts),
        ...Object.keys(voices),
        ...Object.keys(statuses),
        ...Object.keys(youtubes),
        ...Object.keys(robloxes),
        ...Object.keys(securities)
    ]);

    for (const gid of allGuildIds) {
        main[gid] ??= {};
        if (autoposts[gid]) main[gid].autopost = { ...(main[gid].autopost || {}), ...autoposts[gid] };
        if (voices[gid]) main[gid].voice247 = { ...(main[gid].voice247 || {}), ...voices[gid] };
        if (statuses[gid]) main[gid].status = { ...(main[gid].status || {}), ...statuses[gid] };
        if (youtubes[gid]) main[gid].youtube = { ...(main[gid].youtube || {}), ...youtubes[gid] };
        if (robloxes[gid]) main[gid].roblox = { ...(main[gid].roblox || {}), ...robloxes[gid] };
        if (securities[gid]) main[gid].security = { ...(main[gid].security || {}), ...securities[gid] };
    }
    return main;
}

function saveConfig(c) {
    if (!c || typeof c !== "object") return;
    safeWriteJSON(CONFIG_FILE, c);
    try {
        const autoposts = safeReadJSON(AUTOPOST_FILE, {});
        const voices = safeReadJSON(VOICE_FILE, {});
        const statuses = safeReadJSON(STATUS_FILE, {});
        const youtubes = safeReadJSON(YOUTUBE_FILE, {});
        const robloxes = safeReadJSON(ROBLOX_FILE, {});
        const securities = safeReadJSON(SECURITY_FILE, {});

        for (const [gid, gdata] of Object.entries(c)) {
            if (gdata.autopost) autoposts[gid] = gdata.autopost;
            if (gdata.voice247) voices[gid] = gdata.voice247;
            if (gdata.status) statuses[gid] = gdata.status;
            if (gdata.youtube) youtubes[gid] = gdata.youtube;
            if (gdata.roblox) robloxes[gid] = gdata.roblox;
            if (gdata.security) securities[gid] = gdata.security;
        }

        safeWriteJSON(AUTOPOST_FILE, autoposts);
        safeWriteJSON(VOICE_FILE, voices);
        safeWriteJSON(STATUS_FILE, statuses);
        safeWriteJSON(YOUTUBE_FILE, youtubes);
        safeWriteJSON(ROBLOX_FILE, robloxes);
        safeWriteJSON(SECURITY_FILE, securities);
    } catch (e) {
        console.error("[SYNC DEDICATED FILES ERR]", e.message);
    }
}

const config = loadConfig();

const commands = [
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("[ 📖 ] ดูคำสั่งทั้งหมดของ KrakenVoiceBot"),
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("[ ⚡ ] เช็กความเร็วตอบสนองของบอท"),
    new SlashCommandBuilder()
        .setName("announce").setDescription("[ 📢 ] ส่งประกาศไปยังห้องที่เลือก")
        .addChannelOption(o => o.setName("channel").setDescription("ห้องที่จะส่งประกาศ").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(o => o.setName("message").setDescription("ข้อความประกาศ").setRequired(true))
        .addStringOption(o => o.setName("title").setDescription("หัวข้อประกาศ").setRequired(false)),
    new SlashCommandBuilder()
        .setName("autopost").setDescription("[ 🔄 ] ตั้งข้อความส่งอัตโนมัติตามช่วงเวลาที่เลือก")
        .addSubcommand(sub => sub.setName("setup").setDescription("[ ⚙️ ] ตั้งห้อง ข้อความ และช่วงเวลาส่งอัตโนมัติ")
            .addChannelOption(o => o.setName("channel").setDescription("ห้องที่จะส่งข้อความ").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addStringOption(o => o.setName("message").setDescription("ข้อความที่จะส่งซ้ำ").setRequired(true))
            .addIntegerOption(o => o.setName("minutes").setDescription("ส่งซ้ำทุกกี่นาที เช่น 120 = 2 ชั่วโมง").setMinValue(1).setMaxValue(10080).setRequired(true))
            .addStringOption(o => o.setName("webhook").setDescription("ลิงก์ Webhook URL ของห้อง (เพื่อให้อีโมจิ Nitro แสดงผล 100%)").setRequired(false)))
        .addSubcommand(sub => sub.setName("webhook").setDescription("[ 🪝 ] ตั้งค่า Webhook URL สำหรับส่งข้อความ (เพื่อให้อีโมจิ Nitro แสดงผล 100%)")
            .addStringOption(o => o.setName("url").setDescription("ลิงก์ Webhook URL จากการตั้งค่าห้อง").setRequired(true)))
        .addSubcommand(sub => sub.setName("stop").setDescription("[ 🛑 ] ปิดการส่งข้อความอัตโนมัติ"))
        .addSubcommand(sub => sub.setName("status").setDescription("[ 📊 ] ตรวจสอบการตั้งค่าข้อความอัตโนมัติ")),
    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("[ 📈 ] ดูสถานะและสถิติของบอท"),
    new SlashCommandBuilder()
        .setName("status").setDescription("[ 🏷️ ] ตั้งสถานะการทำงานของบอท")
        .addSubcommand(s => s.setName("set").setDescription("[ ✍️ ] ตั้งสถานะ")
            .addStringOption(o => o.setName("type").setDescription("ประเภท").setRequired(true)
                .addChoices({name:"Playing",value:"Playing"},{name:"Watching",value:"Watching"},{name:"Listening",value:"Listening"},{name:"Competing",value:"Competing"},{name:"Streaming",value:"Streaming"}))
            .addStringOption(o => o.setName("text").setDescription("ข้อความ").setRequired(true))
            .addStringOption(o => o.setName("url").setDescription("ลิงก์ Twitch หรือ YouTube สำหรับสถานะ Streaming").setRequired(false)))
        .addSubcommand(s => s.setName("clear").setDescription("[ 🗑️ ] ล้างสถานะ")),
    new SlashCommandBuilder()
        .setName("ticket").setDescription("[ 🎫 ] ระบบจัดการตั๋วช่วยเหลือ (Ticket)")
        .addSubcommand(s => s.setName("setup").setDescription("[ ⚙️ ] ตั้งค่า Ticket Panel")
            .addChannelOption(o => o.setName("channel").setDescription("ห้อง Panel").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addChannelOption(o => o.setName("category").setDescription("หมวดหมู่ Ticket").addChannelTypes(ChannelType.GuildCategory))
            .addRoleOption(o => o.setName("staff").setDescription("ยศทีมงาน"))
            .addChannelOption(o => o.setName("notify").setDescription("ห้องแจ้งเตือนทีมงานเมื่อมี Ticket ใหม่").addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName("panel").setDescription("[ 📨 ] ส่ง Panel ใหม่")),
    new SlashCommandBuilder()
        .setName("247").setDescription("[ 🎧 ] ให้บอทอยู่ในห้องเสียง 24/7")
        .addChannelOption(o => o.setName("channel").setDescription("เลือกห้องเสียงที่ให้บอทเข้า").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setRequired(true)),
    new SlashCommandBuilder()
        .setName("youtube").setDescription("[ 🔴 ] ระบบแจ้งเตือนคลิปใหม่จาก YouTube")
        .addSubcommand(sub => sub.setName("setup").setDescription("[ ⚙️ ] ตั้งห้องแจ้งเตือน YouTube")
            .addChannelOption(o => o.setName("channel").setDescription("ห้องที่จะรับแจ้งเตือน").addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(sub => sub.setName("add").setDescription("[ ➕ ] เพิ่มช่อง YouTube ที่ต้องการติดตาม")
            .addStringOption(o => o.setName("channel_id").setDescription("YouTube Channel ID (ขึ้นต้นด้วย UC)").setRequired(true)))
        .addSubcommand(sub => sub.setName("remove").setDescription("[ ➖ ] เลิกติดตามช่อง YouTube")
            .addStringOption(o => o.setName("channel_id").setDescription("YouTube Channel ID ที่ต้องการลบ").setRequired(true)))
        .addSubcommand(sub => sub.setName("list").setDescription("[ 📜 ] ดูช่อง YouTube ที่ติดตาม"))
        .addSubcommand(sub => sub.setName("test").setDescription("[ 🧪 ] ทดสอบการแจ้งเตือน YouTube")),
    new SlashCommandBuilder()
        .setName("roblox").setDescription("[ 🤖 ] ระบบแจ้งเตือนเวอร์ชัน Roblox & เช็กสถานะตัวรัน")
        .addSubcommand(s => s.setName("setup").setDescription("[ ⚙️ ] ตั้งห้องแจ้งเตือนเวอร์ชันใหม่")
            .addChannelOption(o => o.setName("channel").setDescription("ห้องแจ้งเตือน").addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(s => s.setName("test").setDescription("[ 🧪 ] ทดสอบระบบแจ้งเตือน"))
        .addSubcommand(s => s.setName("check").setDescription("[ 🔍 ] ดูเวอร์ชันปัจจุบันของ Roblox & ตัวรันยอดนิยม"))
        .addSubcommand(s => s.setName("executors").setDescription("[ ⚡ ] เช็กสถานะตัวรันสคริปต์ 31 ตัวแบบ Realtime")
            .addStringOption(o => o.setName("platform").setDescription("เลือกแพลตฟอร์มที่ต้องการดู").setRequired(false)
                .addChoices(
                    { name: "🌐 ทั้งหมด (All)", value: "all" },
                    { name: "🖥️ Windows (PC)", value: "Windows" },
                    { name: "📱 Mobile (Android / iOS)", value: "Mobile" },
                    { name: "🍎 macOS", value: "Mac" }
                )))
        .addSubcommand(s => s.setName("stop").setDescription("[ 🛑 ] ปิดการแจ้งเตือนเวอร์ชัน Roblox")),
    new SlashCommandBuilder()
        .setName("mod").setDescription("[ 🛡️ ] คำสั่งสำหรับทีมงานดูแลและจัดการสมาชิก")
        .addSubcommand(x => x.setName("warn").setDescription("[ ⚠️ ] เตือนสมาชิก").addUserOption(o=>o.setName("member").setDescription("สมาชิก").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false)))
        .addSubcommand(x => x.setName("timeout").setDescription("[ ⏳ ] พักสมาชิก").addUserOption(o=>o.setName("member").setDescription("สมาชิก").setRequired(true)).addIntegerOption(o=>o.setName("minutes").setDescription("นาที").setMinValue(1).setMaxValue(10080).setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false)))
        .addSubcommand(x => x.setName("kick").setDescription("[ 👢 ] เตะสมาชิก").addUserOption(o=>o.setName("member").setDescription("สมาชิก").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false)))
        .addSubcommand(x => x.setName("ban").setDescription("[ 🔨 ] แบนสมาชิก").addUserOption(o=>o.setName("member").setDescription("สมาชิก").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false)))
        .addSubcommand(x => x.setName("unban").setDescription("[ 🔓 ] ปลดแบนด้วย User ID").addStringOption(o=>o.setName("user_id").setDescription("Discord User ID").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("เหตุผล").setRequired(false))),
    new SlashCommandBuilder()
        .setName("whitelist").setDescription("[ 🔑 ] ระบบจัดการ Whitelist / คีย์สคริปต์")
        .addSubcommand(s => s.setName("setup").setDescription("[ ⚙️ ] ส่ง Whitelist Panel เข้าห้องที่ต้องการ")
            .addChannelOption(o => o.setName("channel").setDescription("ห้องที่จะส่ง Panel").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addRoleOption(o => o.setName("role").setDescription("ยศ VIP / Buyer ที่จะได้รับเมื่อรีดึมคีย์").setRequired(false))
            .addChannelOption(o => o.setName("log").setDescription("ห้องสำหรับบันทึก Log การใช้คีย์").addChannelTypes(ChannelType.GuildText).setRequired(false))
            .addStringOption(o => o.setName("title").setDescription("หัวข้อ Embed Panel").setRequired(false))
            .addStringOption(o => o.setName("description").setDescription("รายละเอียด Embed Panel").setRequired(false)))
        .addSubcommand(s => s.setName("panel").setDescription("[ 📨 ] ส่ง Whitelist Panel ใหม่ลงในห้องปัจจุบัน"))
        .addSubcommand(s => s.setName("genkey").setDescription("[ 🎟️ ] สร้างคีย์ใหม่สำหรับสคริปต์")
            .addIntegerOption(o => o.setName("days").setDescription("จำนวนวันที่ใช้งานได้ (เช่น 30 หรือ 3650 สำหรับตลอดชีพ)").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("จำนวนคีย์ที่ต้องการสร้าง (1-20)").setMinValue(1).setMaxValue(20).setRequired(false)))
        .addSubcommand(s => s.setName("vip").setDescription("[ 👑 ] ตั้งค่ายศ VIP สำหรับผู้ใช้งานที่รีดีมคีย์ผ่าน")
            .addRoleOption(o => o.setName("role").setDescription("เลือกยศ VIP").setRequired(true)))
        .addSubcommand(s => s.setName("role").setDescription("[ 👤 ] ตั้งค่ายศ VIP / Buyer สำหรับผู้ใช้งาน")
            .addRoleOption(o => o.setName("role").setDescription("เลือกยศ").setRequired(true)))
        .addSubcommand(s => s.setName("log").setDescription("[ 📜 ] ตั้งค่าห้องสำหรับบันทึก Log การใช้คีย์ / Reset HWID")
            .addChannelOption(o => o.setName("channel").setDescription("เลือกห้องบันทึก Log").addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(s => s.setName("script").setDescription("[ 💻 ] ตั้งค่าข้อความ Script Loader")
            .addStringOption(o => o.setName("code").setDescription("โค้ด loadstring หรือลิงก์").setRequired(true))),
    new SlashCommandBuilder()
        .setName("setup-verify")
        .setDescription("[ ✅ ] ตั้งค่าระบบยืนยันตัวตนรับยศ (สไตล์ Satou)")
        .addChannelOption(o => o.setName("channel").setDescription("ห้องที่จะส่งแผง Verify").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption(o => o.setName("role").setDescription("ยศที่จะได้รับเมื่อยืนยันตัวตนสำเร็จ").setRequired(true))
        .addChannelOption(o => o.setName("log").setDescription("ห้องสำหรับส่งแจ้งเตือนการยืนยันตัวตน (#ยืนยันเสร็จ)").addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption(o => o.setName("image").setDescription("ลิงก์รูปภาพ Banner ใน Embed").setRequired(false)),
    new SlashCommandBuilder()
        .setName("setup-ticket")
        .setDescription("[ 📩 ] ตั้งค่าระบบ Ticket Support (สไตล์ Satou)")
        .addChannelOption(o => o.setName("channel").setDescription("ห้องที่จะส่งแผงเปิด Ticket").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addChannelOption(o => o.setName("category").setDescription("หมวดหมู่สำหรับห้อง Ticket").addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addRoleOption(o => o.setName("staff").setDescription("ยศทีมงานที่จะเห็น Ticket").setRequired(false))
        .addChannelOption(o => o.setName("notify").setDescription("ห้องสำหรับบันทึก Log / Transcript").addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption(o => o.setName("image").setDescription("ลิงก์รูปภาพ Banner ใน Embed").setRequired(false)),
    new SlashCommandBuilder()
        .setName("security").setDescription("[ 🔒 ] จัดการระบบความปลอดภัย Anti-Raid / Anti-Spam / Anti-Webhook")
        .addSubcommand(s => s.setName("status").setDescription("[ 📊 ] ดูสถานะการตั้งค่าความปลอดภัยของเซิร์ฟเวอร์"))
        .addSubcommand(s => s.setName("webhook").setDescription("[ 🛡️ ] ตั้งค่าระบบป้องกันสแปม Webhook (Anti-Webhook Spam)")
            .addBooleanOption(o => o.setName("enabled").setDescription("เปิด/ปิดระบบป้องกันสแปม Webhook").setRequired(true))
            .addIntegerOption(o => o.setName("limit").setDescription("จำนวนข้อความสแปมสูงสุดที่ยอมรับได้ (เช่น 3)").setMinValue(2).setMaxValue(20).setRequired(false))
            .addIntegerOption(o => o.setName("seconds").setDescription("กรอบเวลาตรวจจับ (วินาที เช่น 5)").setMinValue(2).setMaxValue(30).setRequired(false))
            .addBooleanOption(o => o.setName("auto_delete").setDescription("ลบ/เพิกถอน Webhook อัตโนมัติเมื่อตรวจพบสแปม (แนะนำเปิด)").setRequired(false))
            .addBooleanOption(o => o.setName("block_mass_mentions").setDescription("บล็อก Webhook ที่แท็ก @everyone/@here").setRequired(false)))
        .addSubcommand(s => s.setName("log").setDescription("[ 📜 ] ตั้งค่าห้องสำหรับบันทึก Security Logs")
            .addChannelOption(o => o.setName("channel").setDescription("เลือกห้อง Log").addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(s => s.setName("test").setDescription("[ 🧪 ] ทดสอบส่ง Log ความปลอดภัย")),
].map(command => command.toJSON());
// ==================== SERVER WHITELIST ====================
function getAllowedGuildIds() {
    const configured = (process.env.ALLOWED_GUILDS || process.env.GUILD_ID || "")
        .split(",").map(id => id.trim()).filter(Boolean);
    return [...new Set([...DEFAULT_ALLOWED_GUILD_IDS, ...configured])];
}
function isGuildAllowed(guildId) {
    // หากไม่มีการระบุ ALLOWED_GUILDS เจาะจง ให้เปิดใช้งานทุกเซิร์ฟเวอร์ที่บอทอยู่
    const allowed = getAllowedGuildIds();
    if (!process.env.ALLOWED_GUILDS) return true;
    return allowed.includes(guildId);
}
async function syncGuildCommands(guild) {
    if (!guild || !client.user) return;
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    const body = isGuildAllowed(guild.id) ? commands : [];
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body });
    console.log(`[COMMANDS SYNC] ${guild.name} (${guild.id}): Registered ${body.length} commands`);
}
async function syncAllGuildCommands() {
    for (const guild of client.guilds.cache.values()) {
        try { await syncGuildCommands(guild); }
        catch (error) { console.log(`[COMMANDS ERROR] ${guild.name}: ${error.message}`); }
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

// ==================== EMOJI & MESSAGE FORMATTING ====================
const COMMON_EMOJI_SHORTCODES = {
    "star": "⭐", "glove": "🥊", "boxing_glove": "🥊", "fire": "🔥",
    "zap": "⚡", "lightning": "⚡", "check": "✅", "cross": "❌",
    "x": "❌", "white_check_mark": "✅", "sparkles": "✨",
    "key": "🔑", "link": "🔗", "bell": "🔔", "loudspeaker": "📢",
    "mega": "📢", "shield": "🛡️", "lock": "🔒", "unlock": "🔓",
    "ticket": "🎫", "warning": "⚠️", "gear": "⚙️", "tada": "🎉",
    "robot": "🤖", "gem": "💎", "money": "💰", "moneybag": "💰",
    "crown": "👑", "headphone": "🎧", "stop": "🛑", "pin": "📌",
    "pushpin": "📌", "memo": "📝", "bulb": "💡", "arrow_right": "➡️",
    "heart": "❤️", "skull": "💀", "rocket": "🚀", "eyes": "👀"
};

function resolveMessageEmojisAndFormatting(text, guild = null) {
    if (!text || typeof text !== "string") return text;

    // แปลง \n ให้ขึ้นบรรทัดใหม่จริง
    let formatted = text.replace(/\\n/g, "\n");

    // ตรวจหา :emoji_name: และแปลงเป็น Discord Custom Emoji (<:name:id> หรือ <a:name:id>) หรือ Unicode Emoji
    formatted = formatted.replace(/(?<!<a?:):([a-zA-Z0-9_~]+):(?!\d+>)/g, (match, name) => {
        const lowerName = name.toLowerCase();

        if (guild && guild.emojis?.cache) {
            const guildEmoji = guild.emojis.cache.find(e => e.name.toLowerCase() === lowerName);
            if (guildEmoji) return `<${guildEmoji.animated ? "a" : ""}:${guildEmoji.name}:${guildEmoji.id}>`;
        }

        if (client?.application?.emojis?.cache) {
            const appEmoji = client.application.emojis.cache.find(e => e.name.toLowerCase() === lowerName);
            if (appEmoji) return `<${appEmoji.animated ? "a" : ""}:${appEmoji.name}:${appEmoji.id}>`;
        }

        if (client?.emojis?.cache) {
            const clientEmoji = client.emojis.cache.find(e => e.name.toLowerCase() === lowerName);
            if (clientEmoji) return `<${clientEmoji.animated ? "a" : ""}:${clientEmoji.name}:${clientEmoji.id}>`;
        }

        if (COMMON_EMOJI_SHORTCODES[lowerName]) {
            return COMMON_EMOJI_SHORTCODES[lowerName];
        }

        return match;
    });

    return formatted;
}

// นำเข้าอีโมจิ Nitro ภายนอกเข้าสู่เซิร์ฟเวอร์อัตโนมัติ เพื่อให้แสดงผลได้ทั้งในข้อความบอทและการดูตัวอย่าง
async function autoImportExternalEmojis(text, guild) {
    if (!text || !guild || !guild.emojis) return text;

    const matches = [...text.matchAll(/<(a)?:([a-zA-Z0-9_~]+):(\d+)>/g)];
    if (!matches.length) return text;

    let updatedText = text;

    for (const match of matches) {
        const fullTag = match[0];
        const isAnimated = match[1] === "a";
        const name = match[2];
        const id = match[3];

        if (guild.emojis.cache.has(id)) continue;
        if (client.application?.emojis?.cache?.has(id)) continue;
        if (client.emojis?.cache?.has(id)) continue;

        const alreadyImported = guild.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
        if (alreadyImported) {
            updatedText = updatedText.replaceAll(fullTag, `<${alreadyImported.animated ? "a" : ""}:${alreadyImported.name}:${alreadyImported.id}>`);
            continue;
        }

        try {
            const extUrl = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? "gif" : "png"}`;
            const cleanName = name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
            const created = await guild.emojis.create({
                attachment: extUrl,
                name: cleanName,
                reason: "Auto-imported by KrakenVoiceBot for Autopost"
            });
            console.log(`[EMOJI AUTO-IMPORTED] ${name} -> <${created.animated ? "a" : ""}:${created.name}:${created.id}>`);
            updatedText = updatedText.replaceAll(fullTag, `<${created.animated ? "a" : ""}:${created.name}:${created.id}>`);
        } catch (err) {
            console.log(`[EMOJI AUTO-IMPORT NOTE] ${name} (${id}): ${err.message}`);
        }
    }

    return updatedText;
}

// ส่งข้อความผ่าน Webhook เพื่อให้ Discord เรนเดอร์อีโมจิ Nitro จากทุกเซิร์ฟเวอร์ได้ 100%
async function sendChannelMessage(channel, content, webhookUrl = null, allowedMentions = { parse: [] }) {
    if (!channel || !channel.isTextBased()) return null;

    // 1. ถ้ามีลิงก์ Webhook URL ที่ระบุไว้ ให้ยิงผ่าน WebhookClient ทันที (รองรับอีโมจิ Nitro 100% ไม่สนสิทธิ์บอท)
    if (webhookUrl && /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i.test(webhookUrl)) {
        try {
            const hook = new WebhookClient({ url: webhookUrl });
            return await hook.send({
                content,
                username: client.user.username,
                avatarURL: client.user.displayAvatarURL({ dynamic: true }),
                allowedMentions
            });
        } catch (hookErr) {
            console.log("[CUSTOM WEBHOOK SEND ERR]", hookErr.message);
        }
    }

    const hasCustomEmojis = /<a?:[a-zA-Z0-9_~]+:\d+>/.test(content);

    // 2. ถ้าข้อความมีอีโมจิและไม่ได้ใส่ Webhook URL ให้ลองสร้าง/ค้นหา Webhook ของบอทอัตโนมัติ
    if (hasCustomEmojis && channel.fetchWebhooks && channel.guild) {
        try {
            const botMember = channel.guild.members.me || channel.guild.members.cache.get(client.user.id);
            const canManageWebhooks = botMember ? channel.permissionsFor(botMember)?.has(PermissionsBitField.Flags.ManageWebhooks) : true;

            if (canManageWebhooks) {
                const webhooks = await channel.fetchWebhooks().catch(() => null);
                let webhook = webhooks?.find(wh => wh.owner?.id === client.user.id && wh.token);

                if (!webhook) {
                    webhook = await channel.createWebhook({
                        name: client.user.username,
                        avatar: client.user.displayAvatarURL({ dynamic: true }),
                        reason: "Autopost Webhook for Nitro Emojis"
                    }).catch(err => {
                        console.log("[AUTO WEBHOOK CREATE ERR]", err.message);
                        return null;
                    });
                }

                if (webhook) {
                    return await webhook.send({
                        content,
                        username: client.user.username,
                        avatarURL: client.user.displayAvatarURL({ dynamic: true }),
                        allowedMentions
                    });
                }
            }
        } catch (err) {
            console.log("[AUTO WEBHOOK DISPATCH ERR]", err.message);
        }
    }

    return await channel.send({
        content,
        allowedMentions
    });
}

const autoPostTimers = new Map();
const autoPostLocks = new Set();

async function executeAutoPost(guildId, force = false) {
    if (autoPostLocks.has(guildId)) return;
    autoPostLocks.add(guildId);

    try {
        const current = config[guildId]?.autopost;
        if (!current?.enabled || !current.channelId || !current.message) return;

        const intervalMinutes = Math.min(10080, Math.max(1, Number(current.intervalMinutes) || 60));
        const intervalMs = intervalMinutes * 60 * 1000;
        const lastSentAt = Number(current.lastSentAt || 0);
        const elapsed = Date.now() - lastSentAt;

        // ถ้าไม่ใช่ force และยังไม่ถึงรอบเวลา (หักเผื่อคลาดเคลื่อน 10 วินาที) ให้ข้าม ป้องกันการส่งถี่เกินกำหนด
        if (!force && lastSentAt > 0 && elapsed < (intervalMs - 10000)) {
            const waitMin = Math.ceil((intervalMs - elapsed) / 60000);
            console.log(`[AUTOPOST] Skipped guild ${guildId}: only ${Math.round(elapsed / 60000)}m elapsed. Next in ~${waitMin}m`);
            return;
        }

        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;
        const channel = guild.channels.cache.get(current.channelId) || await guild.channels.fetch(current.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            console.log(`[AUTOPOST] Invalid text channel for guild ${guildId}`);
            return;
        }

        let finalContent = resolveMessageEmojisAndFormatting(current.message, guild);

        try {
            const importedContent = await autoImportExternalEmojis(finalContent, guild);
            if (importedContent !== finalContent) {
                finalContent = importedContent;
                current.message = importedContent;
            }
        } catch (importErr) {
            console.log("[AUTOPOST IMPORT ERR]", importErr.message);
        }

        // บันทึกเวลาที่ส่งทันทีก่อนยิงข้อความ เพื่อป้องกัน race condition
        current.lastSentAt = Date.now();
        saveConfig(config);

        await sendChannelMessage(channel, finalContent, current.webhookUrl, { parse: [] });
        console.log(`[AUTOPOST] Sent to ${guild.name} / #${channel.name}${current.webhookUrl ? " via Webhook" : ""}. Next in ${intervalMinutes}m`);
    } catch (error) {
        console.log(`[AUTOPOST ERROR] ${guildId}: ${error.message}`);
    } finally {
        // ถือ lock ไว้ 5 วินาที เพื่อป้องกัน duplicate execution
        setTimeout(() => autoPostLocks.delete(guildId), 5000);
    }
}

function startAutoPost(guildId) {
    const previous = autoPostTimers.get(guildId);
    if (previous) clearInterval(previous);
    autoPostTimers.delete(guildId);

    const setting = config[guildId]?.autopost;
    if (!setting?.enabled || !setting.channelId || !setting.message) return;

    const intervalMinutes = Math.min(10080, Math.max(1, Number(setting.intervalMinutes) || 60));
    const intervalMs = intervalMinutes * 60 * 1000;
    const lastSentAt = Number(setting.lastSentAt || 0);

    // ตรวจสอบเวลาเมื่อบอทสตาร์ท
    if (lastSentAt === 0) {
        // ไม่เคยส่งเลย -> ส่งรอบแรกทันทีหลังออนไลน์ 3 วินาที
        setTimeout(() => {
            executeAutoPost(guildId, true).catch(() => {});
        }, 3000);
    } else {
        const elapsed = Date.now() - lastSentAt;
        if (elapsed >= intervalMs) {
            // เลยกำหนดส่งไประหว่างบอทออฟไลน์ -> ส่งรอบตกค้าง
            setTimeout(() => {
                executeAutoPost(guildId).catch(() => {});
            }, 3000);
        } else {
            // ยังไม่ถึงรอบเวลา -> ห้ามส่งซ้ำ ให้รอจนกว่าจะครบกำหนด
            const remainingMinutes = Math.ceil((intervalMs - elapsed) / 60000);
            console.log(`[AUTOPOST] Guild ${guildId} next post scheduled in ${remainingMinutes}m (last sent ${Math.round(elapsed / 60000)}m ago)`);
        }
    }

    // ลูปตรวจสอบทุก 15 วินาที
    const timer = setInterval(() => {
        const current = config[guildId]?.autopost;
        if (!current?.enabled) {
            clearInterval(timer);
            autoPostTimers.delete(guildId);
            return;
        }
        const curIntervalMs = Math.min(10080, Math.max(1, Number(current.intervalMinutes) || 60)) * 60 * 1000;
        const curLastSent = Number(current.lastSentAt || 0);
        if (curLastSent > 0 && (Date.now() - curLastSent) >= curIntervalMs) {
            executeAutoPost(guildId).catch(() => {});
        }
    }, 15 * 1000);

    autoPostTimers.set(guildId, timer);
}

function startConfiguredAutoPosts() {
    for (const [guildId, settings] of Object.entries(config)) {
        if (settings?.autopost?.enabled) {
            console.log(`[AUTOPOST] Resuming persistent auto-post for guild ${guildId} (every ${settings.autopost.intervalMinutes}m)`);
            startAutoPost(guildId);
        }
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
    // Clear global application commands so they do not duplicate with guild-level commands
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        console.log(`[COMMANDS] Successfully cleared global application commands to prevent duplicate entries`);
    } catch (err) {
        console.log("[COMMANDS GLOBAL ERROR]", err.message);
    }
    await syncAllGuildCommands();
    console.log("[COMMANDS] Command sync complete");
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
    try {
        const appEmojis = await client.application.emojis.fetch();
        console.log(`[APP EMOJIS COUNT] ${appEmojis.size}`);
        appEmojis.forEach(e => console.log(`[APP EMOJI] <${e.animated ? 'a' : ''}:${e.name}:${e.id}>`));
    } catch(err) {
        console.log(`[APP EMOJIS ERROR] ${err.message}`);
    }

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
    startYouTubeNotifications(client, config, saveConfig);
    startSecurity(client, config, saveConfig);
    startVerify(client, config, saveConfig);
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

const {
    getSettings: getWhitelistSettings,
    saveSettings: saveWhitelistSettings,
    makeWhitelistPanel,
    handleWhitelistInteraction,
    sendWhitelistLog,
    sendFailedRedeemLog,
    loadJSON: loadWhitelistJSON,
    saveJSON: saveWhitelistJSON,
    KEYS_FILE: WHITELIST_KEYS_FILE
} = require("./systems/whitelist");

const {
    startVerify,
    sendVerifyPanel,
    handleVerifyInteraction,
    saveVerifySettings
} = require("./systems/verify");

const {
    sendTicketPanel: sendSatouTicketPanel,
    handleTicketInteraction: handleSatouTicketInteraction,
    saveTicketSettings
} = require("./systems/ticket");

client.on("interactionCreate", async interaction => {
    // Whitelist buttons and modals
    if ((interaction.isButton() && interaction.customId.startsWith("wl_")) ||
        (interaction.isModalSubmit() && interaction.customId.startsWith("wl_"))) {
        return handleWhitelistInteraction(interaction, config, saveConfig);
    }

    // Verify system interactions
    if (interaction.isButton() && (interaction.customId === "verify_btn" || interaction.customId === "verify_why_btn")) {
        return handleVerifyInteraction(interaction, config, saveConfig);
    }

    // Satou Ticket system interactions
    if ((interaction.isButton() && (interaction.customId === "ticket_open_btn" || interaction.customId === "ticket_close_btn" || interaction.customId === "ticket_invite_btn")) ||
        (interaction.isModalSubmit() && (interaction.customId === "ticket_modal_create" || interaction.customId === "ticket_modal_invite"))) {
        return handleSatouTicketInteraction(interaction, config, saveConfig);
    }

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
            await interaction.reply({ content: "🔒 กำลังปิด Ticket ห้องนี้จะถูกลบใน 5 วินาที" });
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

    if (interaction.commandName === "security") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) && !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "❌ ต้องมีสิทธิ์ Manage Server หรือ Administrator ในการจัดการระบบความปลอดภัย", ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        const s = settingsFor(config, interaction.guild.id);

        if (sub === "status") {
            const embed = new EmbedBuilder()
                .setTitle("🛡️ Kraken Security Status")
                .setColor(0x5865F2)
                .setDescription(`สถานะระบบความปลอดภัยสำหรับเซิร์ฟเวอร์ **${interaction.guild.name}**`)
                .addFields(
                    { name: "🛡️ ระบบรวม", value: s.enabled ? "🟢 เปิดใช้งาน" : "🔴 ปิด", inline: true },
                    { name: "🚨 Anti-Raid", value: s.antiRaid ? "🟢 เปิด" : "🔴 ปิด", inline: true },
                    { name: "💬 Anti-Spam (สมาชิก)", value: s.antiSpam ? "🟢 เปิด" : "🔴 ปิด", inline: true },
                    { name: "🪝 Anti-Webhook Spam", value: s.antiWebhookSpam ? "🟢 เปิดใช้งาน (Active)" : "🔴 ปิด", inline: true },
                    { name: "⚡ Webhook Rate Limit", value: `${s.webhookSpamLimit || 3} ข้อความ / ${s.webhookWindowSeconds || 5} วินาที`, inline: true },
                    { name: "🗑️ Auto-Delete Rogue Webhook", value: s.autoDeleteSpamWebhook ? "🟢 ลบ Webhook ถาวรอัตโนมัติ" : "🔴 ปิด", inline: true },
                    { name: "🚫 บล็อก @everyone Webhook", value: s.blockMassMentions ? "🟢 เปิดบล็อก" : "🔴 ปิด", inline: true },
                    { name: "📜 ห้อง Security Log", value: s.logChannelId ? `<#${s.logChannelId}>` : "⚠️ ยังไม่ได้ตั้งค่า", inline: true }
                )
                .setFooter({ text: "Kraken Community • Security Guard" })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === "webhook") {
            s.antiWebhookSpam = interaction.options.getBoolean("enabled", true);
            const limit = interaction.options.getInteger("limit");
            const seconds = interaction.options.getInteger("seconds");
            const autoDel = interaction.options.getBoolean("auto_delete");
            const blockMentions = interaction.options.getBoolean("block_mass_mentions");

            if (limit !== null) s.webhookSpamLimit = limit;
            if (seconds !== null) s.webhookWindowSeconds = seconds;
            if (autoDel !== null) s.autoDeleteSpamWebhook = autoDel;
            if (blockMentions !== null) s.blockMassMentions = blockMentions;

            saveConfig(config);

            const embed = new EmbedBuilder()
                .setTitle("✅ บันทึกการตั้งค่า Anti-Webhook Spam สำเร็จ")
                .setColor(0x57F287)
                .setDescription(`อัปเดตระบบป้องกันสแปม Webhook สำหรับ **${interaction.guild.name}** เรียบร้อยแล้ว`)
                .addFields(
                    { name: "สถานะ", value: s.antiWebhookSpam ? "🟢 เปิดใช้งาน" : "🔴 ปิดใช้งาน", inline: true },
                    { name: "จำกัดความเร็ว", value: `${s.webhookSpamLimit} ข้อความ / ${s.webhookWindowSeconds} วินาที`, inline: true },
                    { name: "ลบ Webhook อัตโนมัติ", value: s.autoDeleteSpamWebhook ? "🟢 เปิด" : "🔴 ปิด", inline: true },
                    { name: "บล็อกแท็กหมู่", value: s.blockMassMentions ? "🟢 เปิด" : "🔴 ปิด", inline: true }
                )
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === "log") {
            const ch = interaction.options.getChannel("channel", true);
            s.logChannelId = ch.id;
            saveConfig(config);
            return interaction.reply({ content: `✅ ตั้งค่าห้อง Security Log ไปที่ ${ch} เรียบร้อยแล้ว`, ephemeral: true });
        }

        if (sub === "test") {
            await sendLog(interaction.guild, config, "🧪 ทดสอบ Security Log", "ระบบความปลอดภัยและระบบป้องกัน Webhook Spam ทำงานได้ตามปกติ", 0x57F287, [
                { name: "ผู้ทดสอบ", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Anti-Webhook Spam", value: s.antiWebhookSpam ? "🟢 Enabled" : "🔴 Disabled", inline: true },
                { name: "Webhook Spam Limit", value: `${s.webhookSpamLimit || 3} ข้อความ / ${s.webhookWindowSeconds || 5} วินาที`, inline: true }
            ], saveConfig);
            return interaction.reply({ content: "✅ ส่งข้อความทดสอบ Security Log ไปยังห้องที่ตั้งค่าไว้เรียบร้อยแล้ว", ephemeral: true });
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
            .setDescription("บอทเสียง 24/7 และระบบจัดการสำหรับ Kraken Community")
            .addFields(
                {
                    name: "🎧 Voice 24/7",
                    value: "`/247` — ให้บอทอยู่ในห้องเสียง 24/7\n`/stats` — ดูสถานะและสถิติของบอท"
                },
                {
                    name: "🔄 Automation & Messages",
                    value: "`/autopost` — ตั้งข้อความส่งอัตโนมัติ (รองรับอีโมจิ & ขึ้นบรรทัดใหม่ \\n)\n`/announce` — ส่งประกาศลงห้องที่เลือก\n`/ping` — เช็กความเร็วตอบสนองของบอท"
                },
                {
                    name: "🛡️ Server Management",
                    value: "`/mod` — จัดการสมาชิก\n`/security` — ระบบ Anti-Raid / Anti-Spam\n`/setup-verify` — ตั้งแผงยืนยันตัวตน\n`/setup-ticket` — ตั้งระบบ Ticket\n`/whitelist` — จัดการ Whitelist / Key"
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
            const rawMessage = interaction.options.getString("message", true).trim();
            const intervalMinutes = interaction.options.getInteger("minutes", true);
            const webhookUrl = interaction.options.getString("webhook")?.trim() || null;

            if (!rawMessage) return interaction.reply({ content: "❌ กรุณาระบุข้อความ", ephemeral: true });
            if (intervalMinutes < 1 || intervalMinutes > 10080) return interaction.reply({ content: "❌ ตั้งเวลาได้ตั้งแต่ 1 ถึง 10080 นาที (7 วัน)", ephemeral: true });

            if (webhookUrl && !/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i.test(webhookUrl)) {
                return interaction.reply({ content: "❌ ลิงก์ Webhook URL ไม่ถูกต้อง (ต้องเป็นลิงก์ `https://discord.com/api/webhooks/...`)", ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            if (interaction.guild.emojis.cache.size === 0) {
                await interaction.guild.emojis.fetch().catch(() => {});
            }

            let formattedMessage = resolveMessageEmojisAndFormatting(rawMessage, interaction.guild);

            try {
                formattedMessage = await autoImportExternalEmojis(formattedMessage, interaction.guild);
            } catch (importErr) {
                console.log("[AUTOPOST SETUP IMPORT ERR]", importErr.message);
            }

            config[interaction.guild.id].autopost = {
                enabled: true,
                channelId: channel.id,
                message: formattedMessage,
                intervalMinutes,
                webhookUrl: webhookUrl || config[interaction.guild.id].autopost?.webhookUrl || null,
                lastSentAt: Date.now()
            };
            saveConfig(config);
            startAutoPost(interaction.guild.id);
            executeAutoPost(interaction.guild.id, true).catch(() => {});
            return interaction.editReply({
                content: `✅ **ตั้งข้อความอัตโนมัติสำเร็จแล้ว**\n📍 **ห้อง:** ${channel}\n⏰ **ความถี่:** ส่งซ้ำทุก ${intervalMinutes} นาที${intervalMinutes % 60 === 0 ? ` (${intervalMinutes / 60} ชั่วโมง)` : ""}\n${webhookUrl ? `🪝 **ส่งผ่าน Webhook:** เปิดใช้งาน (เรนเดอร์อีโมจิ Nitro 100%)\n` : `ℹ️ **โหมดส่ง:** ข้อความบอทอัตโนมัติ\n`}\n💬 **ตัวอย่างข้อความ:**\n${formattedMessage}\n\n🛑 ใช้ \`/autopost stop\` เพื่อปิดการทำงาน`,
                allowedMentions: { parse: [] }
            });
        }

        if (sub === "webhook") {
            const url = interaction.options.getString("url", true).trim();
            if (!/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i.test(url)) {
                return interaction.reply({ content: "❌ ลิงก์ Webhook URL ไม่ถูกต้อง (ต้องเป็นลิงก์ `https://discord.com/api/webhooks/...`)", ephemeral: true });
            }
            if (!config[interaction.guild.id]?.autopost) {
                return interaction.reply({ content: "❌ กรุณาใช้ `/autopost setup` ตั้งค่าห้องและข้อความก่อน", ephemeral: true });
            }
            config[interaction.guild.id].autopost.webhookUrl = url;
            saveConfig(config);
            return interaction.reply({
                content: `✅ **บันทึก Webhook URL สำหรับ Autopost เรียบร้อยแล้ว!**\n🪝 รอบการส่งครั้งถัดไปจะส่งผ่าน Webhook อัตโนมัติ\n✨ อีโมจิ Nitro นอกเซิร์ฟเวอร์จะแสดงผลขยับได้ 100%`,
                ephemeral: true
            });
        }

        if (sub === "stop") {
            const timer = autoPostTimers.get(interaction.guild.id);
            if (timer) clearInterval(timer);
            autoPostTimers.delete(interaction.guild.id);
            if (config[interaction.guild.id].autopost) config[interaction.guild.id].autopost.enabled = false;
            saveConfig(config);
            return interaction.reply({ content: "🛑 ปิดข้อความอัตโนมัติเรียบร้อยแล้ว", ephemeral: true });
        }

        const setting = config[interaction.guild.id]?.autopost;
        if (!setting?.enabled) {
            return interaction.reply({ content: "ℹ️ ยังไม่ได้เปิดใช้ ใช้ `/autopost setup` เพื่อตั้งค่า", ephemeral: true });
        }
        const nextIn = setting.lastSentAt ? Math.max(0, Math.floor(((Number(setting.lastSentAt) + (Number(setting.intervalMinutes) * 60 * 1000)) - Date.now()) / 1000)) : 0;
        const nextMin = Math.ceil(nextIn / 60);
        return interaction.reply({
            content: `✅ **สถานะข้อความอัตโนมัติ: กำลังทำงาน**\n📍 **ห้อง:** <#${setting.channelId}>\n⏰ **ความถี่:** ทุก ${Number(setting.intervalMinutes) || 60} นาที\n⏳ **รอบถัดไป:** ในอีกประมาณ ${nextMin} นาที\n🔒 **สถานะความทนทาน:** ติดถาวร แม้บอทรีสตาร์ท\n💬 **ข้อความ:**\n>>> ${setting.message.slice(0, 500)}`,
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

    if (interaction.commandName === "setup-verify") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "❌ ต้องมีสิทธิ์ Manage Server ในการตั้งค่า", ephemeral: true });
        }
        const channel = interaction.options.getChannel("channel", true);
        const role = interaction.options.getRole("role", true);
        const logChannel = interaction.options.getChannel("log");
        const bannerUrl = interaction.options.getString("image");

        config[interaction.guild.id] ??= {};
        const verifyData = {
            enabled: true,
            panelChannelId: channel.id,
            roleId: role.id,
            logChannelId: logChannel?.id || null,
            bannerUrl: bannerUrl || null
        };
        config[interaction.guild.id].verify = verifyData;
        saveConfig(config);
        saveVerifySettings(interaction.guild.id, verifyData, config, saveConfig);

        await interaction.deferReply({ ephemeral: true });
        try {
            await sendVerifyPanel(channel, {
                bannerUrl,
                emojis: config[interaction.guild.id].verify.emojis
            });
            return interaction.editReply({
                content: `✅ ตั้งค่าระบบยืนยันตัวตนสำเร็จแล้ว!\n📍 ห้องส่ง Panel: ${channel}\n🏷️ ยศที่จะได้รับ: ${role}` +
                    (logChannel ? `\n📜 ห้องบันทึก Log: ${logChannel}` : "") +
                    (bannerUrl ? `\n🖼️ รูปแบนเนอร์: ${bannerUrl}` : "")
            });
        } catch (error) {
            console.log("[SETUP-VERIFY ERROR]", error.message);
            return interaction.editReply(`❌ ตั้งค่าไม่สำเร็จ: ${error.message}`);
        }
    }

    if (interaction.commandName === "setup-ticket") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "❌ ต้องมีสิทธิ์ Manage Server ในการตั้งค่า", ephemeral: true });
        }
        const channel = interaction.options.getChannel("channel", true);
        const category = interaction.options.getChannel("category");
        const staff = interaction.options.getRole("staff");
        const notify = interaction.options.getChannel("notify");
        const bannerUrl = interaction.options.getString("image");

        config[interaction.guild.id] ??= {};
        const previousTicket = config[interaction.guild.id].ticket || {};
        const newTicketSettings = {
            ...previousTicket,
            panelChannelId: channel.id,
            categoryId: category?.id || previousTicket.categoryId || null,
            staffRoleId: staff?.id || previousTicket.staffRoleId || null,
            notifyChannelId: notify?.id || previousTicket.notifyChannelId || null,
            bannerUrl: bannerUrl || previousTicket.bannerUrl || null
        };
        config[interaction.guild.id].ticket = newTicketSettings;
        saveConfig(config);
        saveTicketSettings(interaction.guild.id, newTicketSettings, config, saveConfig);

        await interaction.deferReply({ ephemeral: true });
        try {
            await sendSatouTicketPanel(channel, { bannerUrl });
            return interaction.editReply({
                content: `✅ ตั้งค่าระบบ Ticket Support สไตล์ Satou สำเร็จแล้ว!\n📍 ห้องส่ง Panel: ${channel}` +
                    (category ? `\n📂 หมวดหมู่: ${category}` : "") +
                    (staff ? `\n👮 ยศทีมงาน: ${staff}` : "") +
                    (notify ? `\n🔔 ห้องแจ้งเตือน/Log: ${notify}` : "")
            });
        } catch (error) {
            console.log("[SETUP-TICKET ERROR]", error.message);
            return interaction.editReply(`❌ ตั้งค่า Ticket ไม่สำเร็จ: ${error.message}`);
        }
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

    if (interaction.commandName === "youtube") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "❌ ต้องมีสิทธิ์ Manage Server", ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        config[guildId] ??= {};
        config[guildId].youtube ??= { enabled: true, sources: [] };
        const settings = config[guildId].youtube;

        if (sub === "setup") {
            const channel = interaction.options.getChannel("channel", true);
            settings.channelId = channel.id;
            settings.enabled = true;
            settings.sources ??= [];
            saveConfig(config);
            return interaction.reply({ content: "✅ ตั้งห้องแจ้งเตือน YouTube เป็น " + channel, ephemeral: true });
        }

        if (sub === "add") {
            const channelId = interaction.options.getString("channel_id", true).trim();
            await interaction.deferReply({ ephemeral: true });
            try {
                const video = await addYouTubeSource(config, guildId, channelId);
                saveConfig(config);
                return interaction.editReply("✅ เพิ่มช่อง **" + video.author + "** เรียบร้อยแล้ว\nระบบจะตรวจคลิปใหม่ทุก 2 นาที");
            } catch (error) {
                return interaction.editReply("❌ เพิ่มช่องไม่สำเร็จ: " + error.message);
            }
        }

        if (sub === "remove") {
            const channelId = interaction.options.getString("channel_id", true).trim();
            const removed = removeYouTubeSource(config, guildId, channelId);
            if (!removed) return interaction.reply({ content: "❌ ไม่พบ Channel ID นี้ในรายการติดตาม", ephemeral: true });
            saveConfig(config);
            return interaction.reply({ content: "✅ ลบช่อง YouTube ออกจากรายการติดตามแล้ว", ephemeral: true });
        }

        if (sub === "list") {
            const sources = settings.sources || [];
            const list = sources.length
                ? sources.map((source, index) => (index + 1) + ". **" + (source.channelName || "YouTube Channel") + "** — \`" + source.channelId + "\`").join("\n")
                : "ยังไม่มีช่อง YouTube ที่ติดตาม";
            return interaction.reply({ content: "📺 **ช่อง YouTube ที่ติดตาม**\n" + list + (settings.channelId ? "\n\n🔔 ห้องแจ้งเตือน: <#" + settings.channelId + ">" : "\n\n⚠️ ยังไม่ได้ตั้งห้อง ใช้ /youtube setup"), ephemeral: true });
        }

        if (sub === "test") {
            await interaction.deferReply({ ephemeral: true });
            try {
                await sendYouTubeTest(client, config, guildId);
                return interaction.editReply("✅ ส่งข้อความทดสอบไปยังห้องแจ้งเตือน YouTube แล้ว");
            } catch (error) {
                return interaction.editReply("❌ ทดสอบไม่สำเร็จ: " + error.message);
            }
        }
    }

    if (interaction.commandName === "roblox") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        const sub = interaction.options.getSubcommand();
        if (sub === "setup") {
            const ch = interaction.options.getChannel("channel", true);
            config[interaction.guild.id] ??= {};
            config[interaction.guild.id].roblox = {
                ...(config[interaction.guild.id].roblox || {}),
                channelId: ch.id,
                enabled: true
            };
            saveConfig(config);
            return interaction.reply({content: "✅ ตั้งห้องแจ้งเตือนเวอร์ชัน Roblox ที่ " + ch + " สำเร็จ\n(บอทจะแจ้งเตือนอัตโนมัติเฉพาะเมื่อมีเวอร์ชัน/แพตช์ใหม่ของ Roblox)", ephemeral: true});
        }
        if (sub === "stop") {
            if (config[interaction.guild.id]?.roblox) {
                config[interaction.guild.id].roblox.enabled = false;
                saveConfig(config);
            }
            return interaction.reply({content: "🛑 ปิดระบบแจ้งเตือนเวอร์ชัน Roblox สำเร็จ", ephemeral: true});
        }
        if (sub === "check") {
            await interaction.deferReply({ephemeral: false});
            try {
                const [data, exploits] = await Promise.all([
                    fetchRobloxVersions(),
                    fetchExploitStatuses().catch(() => [])
                ]);
                const embed = makeVersionEmbed(data, exploits, [], false);
                return interaction.editReply({embeds: [embed]});
            } catch (err) {
                return interaction.editReply("❌ ไม่สามารถดึงข้อมูลเวอร์ชันได้: " + err.message);
            }
        }
        if (sub === "executors") {
            await interaction.deferReply({ephemeral: false});
            try {
                const platform = interaction.options.getString("platform") || "all";
                const exploits = await fetchExploitStatuses();
                const embed = makeExecutorsEmbed(exploits, platform);
                return interaction.editReply({embeds: [embed]});
            } catch (err) {
                return interaction.editReply("❌ ไม่สามารถดึงข้อมูลสถานะตัวรันได้: " + err.message);
            }
        }
        if (sub === "test") {
            if (!config[interaction.guild.id]?.roblox?.channelId) return interaction.reply({content:"❌ ใช้ /roblox setup ก่อน",ephemeral:true});
            await interaction.deferReply({ephemeral:true});
            try {
                await sendTestUpdate(client, config, interaction.guild.id);
                return interaction.editReply("✅ ส่งข้อความทดสอบการแจ้งเตือนเวอร์ชันใหม่ของ Roblox ไปยังห้องที่ตั้งค่าไว้แล้ว");
            } catch (error) {
                console.log("[ROBLOX TEST ERROR]", error.message);
                return interaction.editReply("❌ ทดสอบไม่สำเร็จ: " + error.message);
            }
        }
    }

    if (interaction.commandName === "announce") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({content:"❌ ต้องมีสิทธิ์ Manage Server",ephemeral:true});
        }
        const channel = interaction.options.getChannel("channel", true);
        const rawMessage = interaction.options.getString("message", true);
        const rawTitle = interaction.options.getString("title") || "📢 ประกาศ";
        const message = resolveMessageEmojisAndFormatting(rawMessage, interaction.guild);
        const title = resolveMessageEmojisAndFormatting(rawTitle, interaction.guild);
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

            await sendChannelMessage(channel, announcementContent || "📢 ประกาศ", { parse: [] });

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
        return;
    }

    if (interaction.commandName === "whitelist") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "❌ ต้องมีสิทธิ์ Manage Server ในการจัดการ Whitelist", ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        const settings = getWhitelistSettings(config, interaction.guild.id);

        if (sub === "setup") {
            const ch = interaction.options.getChannel("channel", true);
            const role = interaction.options.getRole("role");
            const logCh = interaction.options.getChannel("log");
            const title = interaction.options.getString("title");
            const desc = interaction.options.getString("description");

            if (role) {
                settings.vipRoleId = role.id;
                settings.buyerRoleId = role.id;
            }
            if (logCh) settings.logChannelId = logCh.id;
            if (title) settings.panelTitle = title;
            if (desc) settings.panelDesc = desc;
            settings.panelChannelId = ch.id;
            saveWhitelistSettings(interaction.guild.id, settings, config, saveConfig);

            await interaction.deferReply({ ephemeral: true });
            try {
                const panelData = makeWhitelistPanel(settings);
                await ch.send(panelData);
                return interaction.editReply({
                    content: `✅ ส่ง Whitelist Panel ไปยังห้อง ${ch} สำเร็จเรียบร้อยแล้ว` + (role ? ` (ยศ VIP: <@&${role.id}>)` : "") + (logCh ? ` (ห้อง Log: <#${logCh.id}>)` : "")
                });
            } catch (err) {
                console.log("[WHITELIST SETUP ERROR]", err.message);
                return interaction.editReply("❌ ส่ง Panel ไม่สำเร็จ: " + err.message);
            }
        }

        if (sub === "panel") {
            await interaction.deferReply({ ephemeral: true });
            try {
                const panelData = makeWhitelistPanel(settings);
                await interaction.channel.send(panelData);
                return interaction.editReply("✅ ส่ง Whitelist Panel ลงในห้องนี้แล้ว");
            } catch (err) {
                return interaction.editReply("❌ เกิดข้อผิดพลาด: " + err.message);
            }
        }

        if (sub === "genkey") {
            const days = interaction.options.getInteger("days", true);
            const amount = interaction.options.getInteger("amount") || 1;
            const keys = loadWhitelistJSON(WHITELIST_KEYS_FILE, []);
            const crypto = require("crypto");
            const generated = [];

            for (let i = 0; i < amount; i++) {
                const rawHex = crypto.randomBytes(6).toString("hex").toUpperCase();
                const keyStr = `KRAKEN-${rawHex.slice(0, 4)}-${rawHex.slice(4, 8)}-${rawHex.slice(8, 12)}`;
                const keyObj = {
                    key: keyStr,
                    durationDays: days,
                    createdAt: Date.now(),
                    used: false,
                    createdBy: interaction.user.id
                };
                keys.push(keyObj);
                generated.push(keyStr);
            }
            saveWhitelistJSON(WHITELIST_KEYS_FILE, keys);

            const daysText = days >= 3650 ? "ตลอดชีพ" : `${days} วัน`;
            const keyListStr = generated.map(k => `• \`${k}\``).join("\n");

            // Log การสร้างคีย์ใหม่ลงในห้อง Log ของดิสคอร์ด
            const genLogEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("✨ มีการสร้างคีย์ใหม่โดยแอดมิน (Keys Generated)")
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: "👑 ผู้สร้าง (Admin)", value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                    { name: "🔢 จำนวน (Amount)", value: `${amount} คีย์`, inline: true },
                    { name: "⏳ อายุการใช้งาน (Duration)", value: daysText, inline: true }
                )
                .setFooter({ text: "KrakenHub Whitelist Security • Key Gen Logger" })
                .setTimestamp();

            sendWhitelistLog(client, interaction.guild, settings, genLogEmbed).catch(() => {});

            return interaction.reply({
                content: `🔑 **สร้างคีย์สำเร็จ (${amount} คีย์ | อายุ ${daysText})**:\n${keyListStr}\n\n💡 สมาชิกสามารถกดปุ่ม **Redeem Key** ที่ Panel เพื่อเปิดใช้งานได้ทันที`,
                ephemeral: true
            });
        }

        if (sub === "vip" || sub === "role") {
            const role = interaction.options.getRole("role", true);
            settings.vipRoleId = role.id;
            settings.buyerRoleId = role.id;
            saveWhitelistSettings(interaction.guild.id, settings, config, saveConfig);
            return interaction.reply({
                content: `✅ ตั้งค่ายศ VIP สำหรับ Whitelist เป็น <@&${role.id}> เรียบร้อยแล้ว (บันทึกถาวร)`,
                ephemeral: true
            });
        }

        if (sub === "log") {
            const logChannel = interaction.options.getChannel("channel", true);
            settings.logChannelId = logChannel.id;
            saveWhitelistSettings(interaction.guild.id, settings, config, saveConfig);
            return interaction.reply({
                content: `✅ ตั้งค่าห้องสำหรับบันทึก Log การใช้คีย์และรีเซ็ต HWID เป็น ${logChannel} เรียบร้อยแล้ว (บันทึกถาวร)`,
                ephemeral: true
            });
        }

        if (sub === "script") {
            const code = interaction.options.getString("code", true);
            settings.scriptLoader = code;
            saveWhitelistSettings(interaction.guild.id, settings, config, saveConfig);
            return interaction.reply({
                content: `✅ บันทึก Script Loader ใหม่เรียบร้อยแล้ว (บันทึกถาวร)`,
                ephemeral: true
            });
        }
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

const { startSecurity, moderate, sendLog, settingsFor } = require("./systems/security");
const { startDashboard } = require("./web/dashboard");
const { startRobloxUpdates, sendTestUpdate, fetchRobloxVersions, fetchExploitStatuses, makeVersionEmbed, makeExecutorsEmbed } = require("./systems/robloxUpdates");
const { addSource: addYouTubeSource, removeSource: removeYouTubeSource, sendTestUpdate: sendYouTubeTest, startYouTubeNotifications } = require("./systems/youtubeNotifications");
startDashboard({ client, config, saveConfig, formatUptime });

client.login(process.env.BOT_TOKEN);
