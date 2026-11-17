const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionsBitField
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SETTINGS_FILE = path.join(DATA_DIR, "vr_settings.json");
const USERS_FILE = path.join(DATA_DIR, "vr_users.json");

// Default VR Settings fallback
const DEFAULT_VR_SETTINGS = {
    "1550132569432137903": {
        enabled: true,
        panelChannelId: null,
        roleId: null,
        logChannelId: null,
        bannerUrl: null,
        customOAuthUrl: null
    }
};

function ensureFiles() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(SETTINGS_FILE)) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_VR_SETTINGS, null, 2), "utf8");
        }
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), "utf8");
        }
    } catch (e) {
        console.error("[VR SETTINGS FILE ENSURE ERR]", e.message);
    }
}

function loadVrSettings() {
    ensureFiles();
    try {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_VR_SETTINGS, ...parsed };
    } catch {
        return { ...DEFAULT_VR_SETTINGS };
    }
}

function saveVrSettings(guildId, settings, config = null, saveConfig = null) {
    ensureFiles();
    try {
        const current = loadVrSettings();
        current[guildId] = {
            ...(DEFAULT_VR_SETTINGS[guildId] || {}),
            ...(current[guildId] || {}),
            ...settings
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf8");
    } catch (e) {
        console.error("[VR SETTINGS SAVE ERR]", e.message);
    }

    if (config && guildId) {
        config[guildId] ??= {};
        config[guildId].vr = {
            ...(config[guildId].vr || {}),
            ...settings
        };
        if (typeof saveConfig === "function") {
            try { saveConfig(config); } catch (e) {}
        }
    }
}

function getVrConfig(config, guildId) {
    const fileSettings = loadVrSettings();
    const fromFile = fileSettings[guildId] || {};
    const fromConfig = config?.[guildId]?.vr || {};
    const fallback = DEFAULT_VR_SETTINGS[guildId] || {};

    const merged = {
        enabled: true,
        ...fallback,
        ...fromConfig,
        ...fromFile
    };

    if (config && guildId) {
        config[guildId] ??= {};
        config[guildId].vr = merged;
    }

    return merged;
}

function loadVrUsers() {
    ensureFiles();
    try {
        const raw = fs.readFileSync(USERS_FILE, "utf8");
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function saveVrUsers(users) {
    ensureFiles();
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    } catch (e) {
        console.error("[VR USERS SAVE ERR]", e.message);
    }
}

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

function buildOAuthUrl(guildId, options = {}, client = null) {
    if (options?.customOAuthUrl) return options.customOAuthUrl;
    const clientId = process.env.DISCORD_CLIENT_ID || client?.user?.id || "1090382348500201472";
    const redirectUri = process.env.DISCORD_REDIRECT_URI || "http://127.0.0.1/callback";
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=identify`;
}

function makeVrPanel(options = {}, client = null) {
    const authUrl = buildOAuthUrl(options.guildId, options, client);

    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({ name: "• Powered by Kraken Hub" })
        .setTitle("🥽 เปิด VR Badge")
        .setDescription(
            "1. กดปุ่ม **เปิดลิงก์ Authorize** ด้านล่าง\n" +
            "2. เลือกบัญชี Discord ของคุณ แล้วกด **Authorize**\n" +
            "3. หน้าเว็บจะขึ้น error ซึ่งเป็นเรื่องปกติ\n" +
            "4. คัดลอก URL ทั้งหมดจาก address bar\n" +
            "5. กลับมากด **ส่งลิงก์กลับ** แล้ววาง URL"
        );

    if (options.bannerUrl) {
        embed.setImage(options.bannerUrl);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("เปิดลิงก์ Authorize")
            .setStyle(ButtonStyle.Link)
            .setURL(authUrl)
            .setEmoji("🥽"),
        new ButtonBuilder()
            .setCustomId("vr_submit_link_btn")
            .setLabel("ส่งลิงก์กลับ")
            .setStyle(ButtonStyle.Success)
            .setEmoji("📩")
    );

    return { embeds: [embed], components: [row] };
}

async function sendVrPanel(channel, options = {}, client = null) {
    const panel = makeVrPanel({ ...options, guildId: channel.guild?.id }, client);
    return channel.send(panel);
}

async function handleVrInteraction(interaction, config = null, saveConfig = null) {
    const guildId = interaction.guildId;
    const settings = getVrConfig(config, guildId);

    // 1. User clicked "ส่งลิงก์กลับ" button -> Show Modal
    if (interaction.isButton() && interaction.customId === "vr_submit_link_btn") {
        const modal = new ModalBuilder()
            .setCustomId("vr_link_modal")
            .setTitle("ส่งลิงก์ Authorize กลับ");

        const linkInput = new TextInputBuilder()
            .setCustomId("vr_link_input")
            .setLabel("วาง URL ที่คัดลอกมาทั้งหมด")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("http://127.0.0.1/callback?code=... หรือ https://...")
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(linkInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
    }

    // 2. User submitted the Modal with the URL
    if (interaction.isModalSubmit() && interaction.customId === "vr_link_modal") {
        await interaction.deferReply({ ephemeral: true });

        const rawUrl = interaction.fields.getTextInputValue("vr_link_input").trim();

        // Extract code from URL query parameters
        let code = null;
        try {
            const parsed = new URL(rawUrl);
            code = parsed.searchParams.get("code");
        } catch {
            const match = rawUrl.match(/[?&]code=([a-zA-Z0-9_-]+)/);
            if (match) code = match[1];
        }

        if (!code) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("❌ ไม่พบรหัส Authorization Code")
                .setDescription(
                    "ลิงก์ที่คุณวางไม่ถูกต้อง หรือไม่มีรหัส `code` ใน URL ครับ\n\n" +
                    "**📌 ขั้นตอนที่ถูกต้อง:**\n" +
                    "1. กดปุ่ม **เปิดลิงก์ Authorize**\n" +
                    "2. เลือกบัญชี Discord แล้วกด **Authorize**\n" +
                    "3. หน้าเว็บจะขึ้น Error (ไม่ต้องตกใจ)\n" +
                    "4. คัดลอก **URL ทั้งหมดบน Address Bar** ด้านบนเบราว์เซอร์\n" +
                    "5. นำ URL นั้นมากด **ส่งลิงก์กลับ** แล้ววางลงในช่องนี้ครับ"
                );
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        // Save user record
        const vrUsers = loadVrUsers();
        const existing = vrUsers[interaction.user.id] || {};
        const now = Date.now();
        const thaiDate = formatThaiDate(new Date(now));

        vrUsers[interaction.user.id] = {
            userId: interaction.user.id,
            username: interaction.user.tag || interaction.user.username,
            guildId: interaction.guild?.id || guildId,
            code: code,
            rawUrl: rawUrl.slice(0, 500),
            activatedAt: now,
            activatedDate: thaiDate
        };
        saveVrUsers(vrUsers);

        // Assign role if configured
        let roleGiven = false;
        if (settings.roleId && interaction.guild) {
            try {
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member && !member.roles.cache.has(settings.roleId)) {
                    await member.roles.add(settings.roleId, "เปิดใช้งาน VR Badge สำเร็จ");
                    roleGiven = true;
                }
            } catch (roleErr) {
                console.error("[VR ROLE ASSIGN ERR]", roleErr.message);
            }
        }

        // Send log to logChannel if configured
        if (settings.logChannelId && interaction.guild) {
            try {
                const logChannel = interaction.guild.channels.cache.get(settings.logChannelId)
                    || await interaction.guild.channels.fetch(settings.logChannelId).catch(() => null);

                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setAuthor({
                            name: `🥽 เปิดใช้งาน VR Badge: ${interaction.user.tag || interaction.user.username}`,
                            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                        })
                        .addFields(
                            { name: "👤 สมาชิก", value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
                            { name: "⏰ เวลา", value: thaiDate, inline: true },
                            { name: "🏷️ ยศที่ได้รับ", value: roleGiven ? `<@&${settings.roleId}>` : (settings.roleId ? `<@&${settings.roleId}> (มีอยู่แล้ว)` : "ไม่ได้กำหนดยศ"), inline: true },
                            { name: "🔑 Code Preview", value: `\`${code.slice(0, 10)}...${code.slice(-6)}\``, inline: false }
                        )
                        .setTimestamp()
                        .setFooter({ text: "Kraken Hub • VR Badge System" });

                    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
                }
            } catch (logErr) {
                console.error("[VR LOG SEND ERR]", logErr.message);
            }
        }

        // Return sleek success embed to user
        const successEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("🥽 เปิดใช้งานสถานะ VR Badge สำเร็จ!")
            .setDescription(
                `ยินดีด้วยครับ <@${interaction.user.id}>!\n\n` +
                "✨ ระบบได้ทำการตรวจสอบและบันทึกการเปิดใช้งานสถานะ VR Badge ให้กับบัญชีของคุณเรียบร้อยแล้ว\n" +
                (roleGiven ? `🎉 คุณได้รับยศ <@&${settings.roleId}> ในเซิร์ฟเวอร์เรียบร้อยแล้วครับ!` : "")
            )
            .addFields(
                { name: "📅 วันที่เปิดใช้งาน", value: thaiDate, inline: true },
                { name: "🔒 รหัสการอนุมัติ", value: `\`${code.slice(0, 8)}...✅\``, inline: true }
            )
            .setFooter({ text: "Kraken Hub • VR System Active" });

        return interaction.editReply({ embeds: [successEmbed] });
    }
}

function startVrBadge(client, config = null, saveConfig = null) {
    ensureFiles();
    console.log("[VR BADGE] VR Badge System initialized successfully.");
}

module.exports = {
    startVrBadge,
    sendVrPanel,
    makeVrPanel,
    handleVrInteraction,
    getVrConfig,
    saveVrSettings,
    loadVrSettings,
    loadVrUsers,
    saveVrUsers
};

