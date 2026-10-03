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
let connection = null;
let reconnectTimer = null;
let reconnecting = false;
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

function updateMemberActivity(guild) {
    if (!guild || !client.user) return;

    const memberCount = guild.memberCount;
    client.user.setActivity(`${memberCount} Members`, {
        type: ActivityType.Watching
    });
    console.log(`[MEMBERS] ${guild.name}: ${memberCount} Members`);
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
        const configuredChannelId = config[guild.id]?.voice247?.channelId || process.env.VOICE_CHANNEL_ID;
        const channel = await guild.channels.fetch(configuredChannelId);

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

    // แสดงจำนวนสมาชิกในเซิร์ฟเวอร์เป็นสถานะของบอท
    const targetGuild = client.guilds.cache.get(process.env.GUILD_ID) || client.guilds.cache.first();
    updateMemberActivity(targetGuild);

    await registerCommands();
    await connectToVoice();
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
            config[interaction.guild.id] ??= {}; config[interaction.guild.id].ticket={panelChannelId:ch.id,categoryId:cat?.id || null,staffRoleId:role?.id || null}; saveConfig(config); await sendTicketPanel(ch);
            return interaction.reply({content:"✅ ตั้ง Ticket สำเร็จที่ " + ch,ephemeral:true});
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

        config[interaction.guild.id] ??= {};
        config[interaction.guild.id].voice247 = {
            enabled: true,
            channelId: channel.id,
            channelName: channel.name
        };
        saveConfig(config);

        process.env.GUILD_ID = interaction.guild.id;
        process.env.VOICE_CHANNEL_ID = channel.id;

        if (connection) {
            try { connection.destroy(); } catch {}
            connection = null;
        }
        reconnecting = false;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        await connectToVoice();
        return interaction.reply({
            content:"✅ ตั้งโหมด 24/7 แล้ว\n🎧 ห้อง: " + channel + "\n\nบอทจะพยายามกลับเข้าห้องนี้อัตโนมัติเมื่อหลุด",
            ephemeral:true
        });
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
        const urls = message.match(/https?:\\/\\/[^\\s<>]+/g) || [];
        const cleanMessage = message.replace(/https?:\\/\\/[^\\s<>]+/g, "").trim();

        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(cleanMessage || "📺 ดูคลิปรีวิวด้านล่าง")
            .setFooter({text:"Kraken Community • Announcement"}).setTimestamp();
        try {
            await channel.send({
                content: urls.length ? urls.join("\\n") : undefined,
                embeds:[embed]
            });
            return interaction.reply({content:"✅ ส่งประกาศไปที่ " + channel + " เรียบร้อยแล้ว",ephemeral:true});
        } catch (error) {
            console.log("[ANNOUNCE ERROR]", error.message);
            return interaction.reply({content:"❌ ส่งประกาศไม่สำเร็จ: " + error.message,ephemeral:true});
        }
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

client.on("guildMemberAdd", member => {
    const targetGuildId = process.env.GUILD_ID;
    if (!targetGuildId || member.guild.id === targetGuildId) {
        updateMemberActivity(member.guild);
    }
});

client.on("guildMemberRemove", member => {
    const targetGuildId = process.env.GUILD_ID;
    if (!targetGuildId || member.guild.id === targetGuildId) {
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
