const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SETTINGS_FILE = path.join(DATA_DIR, "verify_settings.json");

// Durable default fallback for KrakenHub Community Server (1550132569432137903)
// Survives all reboots, container redeploys, or config wipes
const DEFAULT_VERIFY_SETTINGS = {
    "1550132569432137903": {
        enabled: true,
        panelChannelId: "1554230452435554387", // #📍・ยืนยันตัว
        roleId: "1554224738665107538",         // Member
        logChannelId: "1554230453702238212",   // #✅・ยืนยันเสร็จ
        bannerUrl: "https://cdn.discordapp.com/attachments/1533249866724020304/1568328403260543046/Gemini_Generated_Gif_59k6rr59k6rr59k6.gif?ex=6af16565&is=6af013e5&hm=308c09cee5361b075ccf1d6e59e8e576b1bf1a17f0b404fd5b6d8e1ce43a061e&"
    }
};

function ensureVerifySettingsFile() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(SETTINGS_FILE)) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_VERIFY_SETTINGS, null, 2), "utf8");
        }
    } catch (e) {
        console.error("[VERIFY SETTINGS FILE ENSURE ERR]", e.message);
    }
}

function loadVerifySettings() {
    ensureVerifySettingsFile();
    try {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_VERIFY_SETTINGS, ...parsed };
    } catch {
        return { ...DEFAULT_VERIFY_SETTINGS };
    }
}

function saveVerifySettings(guildId, settings, config = null, saveConfig = null) {
    ensureVerifySettingsFile();
    try {
        const current = loadVerifySettings();
        current[guildId] = {
            ...(DEFAULT_VERIFY_SETTINGS[guildId] || {}),
            ...(current[guildId] || {}),
            ...settings
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf8");
    } catch (e) {
        console.error("[VERIFY SETTINGS SAVE ERR]", e.message);
    }

    if (config && guildId) {
        config[guildId] ??= {};
        config[guildId].verify = {
            ...(config[guildId].verify || {}),
            ...settings
        };
        if (typeof saveConfig === "function") {
            try { saveConfig(config); } catch (e) {}
        }
    }
}

function getVerifyConfig(config, guildId) {
    const fileSettings = loadVerifySettings();
    const fromFile = fileSettings[guildId] || {};
    const fromConfig = config?.[guildId]?.verify || {};
    const fallback = DEFAULT_VERIFY_SETTINGS[guildId] || {};

    const merged = {
        enabled: true,
        ...fallback,
        ...fromConfig,
        ...fromFile
    };

    if (config && guildId) {
        config[guildId] ??= {};
        config[guildId].verify = merged;
    }

    return merged;
}

// Cache for tracking invites: guildId -> Map<code, { uses, inviterTag, inviterId }>
const guildInvitesCache = new Map();
// Cache for joined members: userId -> { inviterTag, inviteCode, inviteUses }
const memberInviteMap = new Map();

function formatThaiDate(date = new Date()) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        date = new Date();
    }
    const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
    const parts = {};
    for (const p of dtf.formatToParts(date)) {
        parts[p.type] = p.value;
    }
    const d = parts.day;
    const m = months[parseInt(parts.month, 10) - 1];
    const y = parseInt(parts.year, 10) + 543;
    const hours = parts.hour === "24" ? "00" : parts.hour;
    const mins = parts.minute;
    return `${d} ${m} ${y} ${hours}:${mins}`;
}

async function cacheGuildInvites(guild) {
    if (!guild) return;
    try {
        const invites = await guild.invites.fetch().catch(() => null);
        if (!invites) return;
        const codeMap = new Map();
        for (const inv of invites.values()) {
            codeMap.set(inv.code, {
                uses: inv.uses || 0,
                inviterTag: inv.inviter ? (inv.inviter.tag || inv.inviter.username) : "ไม่ทราบผู้เชิญ",
                inviterId: inv.inviter?.id || null
            });
        }
        guildInvitesCache.set(guild.id, codeMap);
    } catch (err) {
        // Missing Manage Server / Invites permission
    }
}

function startVerify(client, config = null, saveConfig = null) {
    ensureVerifySettingsFile();
    const allSettings = loadVerifySettings();
    if (config) {
        for (const [gid, vcfg] of Object.entries(allSettings)) {
            config[gid] ??= {};
            config[gid].verify = {
                ...(config[gid].verify || {}),
                ...vcfg
            };
        }
        if (typeof saveConfig === "function") {
            try { saveConfig(config); } catch (e) {}
        }
    }
    client.on("guildMemberAdd", async member => {
        try {
            const guild = member.guild;
            const oldInvites = guildInvitesCache.get(guild.id);
            const newInvites = await guild.invites.fetch().catch(() => null);

            let usedInvite = null;
            if (oldInvites && newInvites) {
                for (const inv of newInvites.values()) {
                    const old = oldInvites.get(inv.code);
                    if (old && (inv.uses || 0) > old.uses) {
                        usedInvite = {
                            code: inv.code,
                            uses: inv.uses || 0,
                            inviterTag: inv.inviter ? (inv.inviter.tag || inv.inviter.username) : old.inviterTag
                        };
                        break;
                    }
                }
            }

            if (usedInvite) {
                memberInviteMap.set(member.id, usedInvite);
            }

            if (newInvites) {
                const updatedMap = new Map();
                for (const inv of newInvites.values()) {
                    updatedMap.set(inv.code, {
                        uses: inv.uses || 0,
                        inviterTag: inv.inviter ? (inv.inviter.tag || inv.inviter.username) : "ไม่ทราบผู้เชิญ",
                        inviterId: inv.inviter?.id || null
                    });
                }
                guildInvitesCache.set(guild.id, updatedMap);
            }
        } catch (err) {
            console.log("[VERIFY INVITE TRACK ERROR]", err.message);
        }
    });

    client.on("guildMemberRemove", member => {
        memberInviteMap.delete(member.id);
    });

    // Populate invite caches for all guilds on start
    for (const guild of client.guilds.cache.values()) {
        cacheGuildInvites(guild);
    }
}

function resolveEmoji(client, configVal, nameCandidates, fallback) {
    if (configVal) {
        if (/^<(a)?:[\w~]+:\d+>$/.test(configVal)) return configVal;
        const idMatch = String(configVal).match(/\d{15,22}/);
        if (idMatch && client) {
            const found = client.application?.emojis?.cache?.get(idMatch[0]) || client.emojis?.cache?.get(idMatch[0]);
            if (found) return `<${found.animated ? 'a' : ''}:${found.name}:${found.id}>`;
            return configVal;
        }
    }
    if (!client) return fallback;
    const candidates = Array.isArray(nameCandidates) ? nameCandidates : [nameCandidates];
    if (client.application?.emojis?.cache) {
        for (const name of candidates) {
            const found = client.application.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
            if (found) return `<${found.animated ? 'a' : ''}:${found.name}:${found.id}>`;
        }
    }
    if (client.emojis?.cache) {
        for (const name of candidates) {
            const found = client.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
            if (found) return `<${found.animated ? 'a' : ''}:${found.name}:${found.id}>`;
        }
    }
    return fallback;
}

function resolveButtonEmoji(client, configVal, nameCandidates, fallback) {
    if (configVal) {
        const idMatch = String(configVal).match(/\d{15,22}/);
        if (idMatch && client) {
            const id = idMatch[0];
            const found = client.application?.emojis?.cache?.get(id) || client.emojis?.cache?.get(id);
            if (found) return found.id;
        } else if (!/^\d+$/.test(configVal)) {
            return configVal;
        }
    }
    if (!client) return fallback;
    const candidates = Array.isArray(nameCandidates) ? nameCandidates : [nameCandidates];
    if (client.application?.emojis?.cache) {
        for (const name of candidates) {
            const found = client.application.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
            if (found) return found.id;
        }
    }
    if (client.emojis?.cache) {
        for (const name of candidates) {
            const found = client.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
            if (found) return found.id;
        }
    }
    return fallback;
}

function makeVerifyPanel(options = {}, client = null) {
    const leftWing = "<a:633625leftangleallwhitewing:1569102297487773696>";
    const rightWing = "<a:602393rightangleallwhitewing:1569102295738884217>";
    const pinkArrow = "<a:998057pinkarrow:1569102319105089637>";

    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({ name: "• Powered by Kraken Hub" })
        .setTitle(`${leftWing} ยืนยันตัวตนด้วยปุ่ม ${rightWing}`)
        .setDescription(`${pinkArrow} **คลิกปุ่มด้านล่างเพื่อเริ่มการยืนยันตัวตนและเข้าสู่เซิร์ฟเวอร์ครับ !**`);

    if (options.bannerUrl) {
        embed.setImage(options.bannerUrl);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_btn")
            .setLabel("ยืนยันตัวตน")
            .setEmoji({ id: "1569102307155779649", name: "785173catpaw", animated: true })
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("verify_why_btn")
            .setLabel("ทำไมต้องยืนยันตัวตน?")
            .setEmoji("❗")
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

async function sendVerifyPanel(channel, options = {}) {
    const payload = makeVerifyPanel(options, channel?.client);
    return await channel.send(payload);
}

async function handleVerifyInteraction(interaction, config, saveConfig) {
    const guildId = interaction.guildId;
    const verifyConfig = getVerifyConfig(config, guildId);

    // 1. Button: ทำไมต้องยืนยันตัวตน?
    if (interaction.customId === "verify_why_btn") {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🛡️ ทำไมต้องยืนยันตัวตน?")
            .setDescription(
                "**1. เพื่อความปลอดภัยของเซิร์ฟเวอร์**\n" +
                "ป้องกันบอทสแปมและบัญชีปลอมเข้ามาก่อกวนชุมชน\n\n" +
                "**2. เพื่อปลดล็อคห้องแชทและกิจกรรม**\n" +
                "เมื่อยืนยันตัวตนแล้ว คุณจะได้รับยศสมาชิกและเข้าใช้งานห้องต่างๆ ได้ทันที\n\n" +
                "**3. รวดเร็วและสะดวก**\n" +
                "เพียงกดปุ่ม **\"ยืนยันตัวตน\"** ระบบจะดำเนินการให้โดยอัตโนมัติ ไม่ต้องรอทีมงานอนุมัติ"
            )
            .setFooter({ text: "Kraken Community • Security" });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 2. Button: ยืนยันตัวตน
    if (interaction.customId === "verify_btn") {
        const member = interaction.member;
        const roleId = verifyConfig.roleId;

        if (!roleId) {
            return interaction.reply({
                content: "❌ ระบบยังไม่ได้ตั้งค่ายศยืนยันตัวตน กรุณาแจ้งผู้ดูแลเซิร์ฟเวอร์ให้ใช้คำสั่ง `/setup-verify`",
                ephemeral: true
            });
        }

        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
            return interaction.reply({
                content: "❌ ไม่พบยศที่กำหนดไว้ในเซิร์ฟเวอร์ (อาจถูกลบไปแล้ว)",
                ephemeral: true
            });
        }

        if (member.roles.cache.has(roleId)) {
            return interaction.reply({
                content: "ℹ️ คุณผ่านการยืนยันตัวตนเรียบร้อยแล้วค่ะ!",
                ephemeral: true
            });
        }

        try {
            await member.roles.add(role);
        } catch (err) {
            console.log("[VERIFY ROLE ADD ERROR]", err.message);
            return interaction.reply({
                content: "❌ ไม่สามารถเพิ่มยศให้ได้ กรุณาตรวจสอบว่าบอทมียศสูงกว่ายศที่ต้องการแจก",
                ephemeral: true
            });
        }

        // Ephemeral success to the user
        await interaction.reply({
            content: `✅ ผ่านการยืนยันตัวตนแล้วค่ะ! ยินดีต้อนรับเข้าสู่ **${interaction.guild.name}**`,
            ephemeral: true
        });

        // Send log embed to log channel (#ยืนยันเสร็จ)
        const logChannelId = verifyConfig.logChannelId;
        if (logChannelId) {
            const logChannel = interaction.guild.channels.cache.get(logChannelId) ||
                await interaction.guild.channels.fetch(logChannelId).catch(() => null);

            if (logChannel && logChannel.isTextBased() && logChannel.send) {
                const inviteInfo = memberInviteMap.get(interaction.user.id) || {
                    inviterTag: "ไม่ทราบผู้เชิญ",
                    code: "ลิงก์ตรง / Vanity",
                    uses: 1
                };

                const logTitleEmoji = "<a:2659tadapurple:1569102206798397571>";
                const logMemberEmoji = "<a:785173catpaw:1569102307155779649>";
                const logUsesEmoji = "<a:1643pixelcoin:1569102201937207306>";

                const logEmbed = new EmbedBuilder()
                    .setColor(0x9B59B6)
                    .setTitle(`${logTitleEmoji} ${interaction.user.username} ผ่านการยืนยันตัวตนแล้วค่ะ!`)
                    .setDescription(
                        `• ${logMemberEmoji} **ผู้เชิญ:** ${inviteInfo.inviterTag} ( \`${inviteInfo.code}\` )\n` +
                        `• ${logUsesEmoji} **จำนวนการใช้:** ${inviteInfo.uses} ครั้ง`
                    )
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setFooter({
                        text: `ยืนยันตัวตนเมื่อ ${formatThaiDate(new Date())}`
                    });

                await logChannel.send({
                    content: `<@${interaction.user.id}>`,
                    embeds: [logEmbed],
                    allowedMentions: { users: [interaction.user.id] }
                }).catch(e => console.log("[VERIFY LOG SEND ERROR]", e.message));
            }
        }
    }
}

module.exports = {
    startVerify,
    sendVerifyPanel,
    makeVerifyPanel,
    handleVerifyInteraction,
    cacheGuildInvites,
    formatThaiDate,
    saveVerifySettings,
    loadVerifySettings,
    getVerifyConfig,
    DEFAULT_VERIFY_SETTINGS
};

