const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionsBitField
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SETTINGS_FILE = path.join(DATA_DIR, "ticket_settings.json");

const DEFAULT_TICKET_SETTINGS = {
    "1550132569432137903": {
        panelChannelId: "1566085837270159371", // #🎫・ticket
        categoryId: "1566085930807332944",     // 📂 Tickets Category
        staffRoleId: "1554242619259748463",    // Staff
        bannerUrl: "https://i.imgur.com/hmmLOly.jpeg"
    }
};

function ensureTicketSettingsFile() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(SETTINGS_FILE)) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_TICKET_SETTINGS, null, 2), "utf8");
        }
    } catch (e) {
        console.error("[TICKET SETTINGS FILE ENSURE ERR]", e.message);
    }
}

function loadTicketSettings() {
    ensureTicketSettingsFile();
    try {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_TICKET_SETTINGS, ...parsed };
    } catch {
        return { ...DEFAULT_TICKET_SETTINGS };
    }
}

function saveTicketSettings(guildId, settings, config = null, saveConfig = null) {
    ensureTicketSettingsFile();
    try {
        const current = loadTicketSettings();
        current[guildId] = {
            ...(DEFAULT_TICKET_SETTINGS[guildId] || {}),
            ...(current[guildId] || {}),
            ...settings
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf8");
    } catch (e) {
        console.error("[TICKET SETTINGS SAVE ERR]", e.message);
    }

    if (config && guildId) {
        config[guildId] ??= {};
        config[guildId].ticket = {
            ...(config[guildId].ticket || {}),
            ...settings
        };
        if (typeof saveConfig === "function") {
            try { saveConfig(config); } catch (e) {}
        }
    }
}

function getTicketConfig(config, guildId) {
    const fileSettings = loadTicketSettings();
    const fromFile = fileSettings[guildId] || {};
    const fromConfig = config?.[guildId]?.ticket || {};
    const fallback = DEFAULT_TICKET_SETTINGS[guildId] || {};

    const merged = {
        ...fallback,
        ...fromConfig,
        ...fromFile
    };

    if (config && guildId) {
        config[guildId] ??= {};
        config[guildId].ticket = merged;
    }

    return merged;
}

function makeTicketPanel(options = {}) {
    const leftWing = "<a:633625leftangleallwhitewing:1569102297487773696>";
    const rightWing = "<a:602393rightangleallwhitewing:1569102295738884217>";
    const pinkArrow = "<a:998057pinkarrow:1569102319105089637>";

    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle(`${leftWing} Ticket Support ${rightWing}`)
        .setDescription(`${pinkArrow} **กดปุ่มด้านล่างเพื่อเปิด Ticket และติดต่อทีมงาน**`);

    if (options.bannerUrl) {
        embed.setImage(options.bannerUrl);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_open_btn")
            .setLabel("เปิด Ticket")
            .setEmoji({ id: "1569102283067621499", name: "437007ticket", animated: true })
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

async function sendTicketPanel(channel, options = {}) {
    const payload = makeTicketPanel(options);
    return await channel.send(payload);
}

async function buildTicketTranscript(channel) {
    let messages = [];
    try {
        const fetched = await channel.messages.fetch({ limit: 100 });
        messages = Array.from(fetched.values()).reverse();
    } catch (e) {
        console.log("[TRANSCRIPT FETCH ERROR]", e.message);
    }

    const body = messages.map(m => {
        const time = new Date(m.createdTimestamp).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
        const user = m.author ? `${m.author.tag} (${m.author.id})` : "Unknown";
        const content = m.content ? m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
        const attachments = m.attachments.map(a => `<a href="${a.url}" target="_blank">[ไฟล์แนบ: ${a.name}]</a>`).join(" ");
        return `<div class="msg"><span class="meta"><b>${user}</b> • ${time}</span><p>${content} ${attachments}</p></div>`;
    }).join("\n");

    return Buffer.from(`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>Ticket Transcript - ${channel.name}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0f1117;color:#e3e5e8;padding:24px;margin:0;}
.wrap{max-width:800px;margin:0 auto;}
h1{font-size:22px;color:#5865F2;border-bottom:1px solid #2B2D31;padding-bottom:12px;}
.msg{margin-bottom:14px;padding:8px 12px;background:#1e1f22;border-radius:8px;}
.meta{font-size:12px;color:#949ba4;}
p{margin:6px 0 0;white-space:pre-wrap;word-break:break-word;}
a{color:#00a8fc;}
</style>
</head>
<body>
<div class="wrap">
<h1>Kraken Ticket • ${channel.name}</h1>
${body || "<p>ไม่มีข้อความใน Ticket</p>"}
</div>
</body>
</html>`, "utf8");
}

async function handleTicketInteraction(interaction, config, saveConfig) {
    const guild = interaction.guild;
    const guildId = guild.id;
    const tc = getTicketConfig(config, guildId);

    // 1. User clicks "เปิด Ticket" Button -> Show Modal
    if (interaction.isButton() && interaction.customId === "ticket_open_btn") {
        const modal = new ModalBuilder()
            .setCustomId("ticket_modal_create")
            .setTitle("เปิด Ticket ติดต่อทีมงาน");

        const problemInput = new TextInputBuilder()
            .setCustomId("ticket_problem_detail")
            .setLabel("รายละเอียดปัญหา")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("เช่น ซื้อของ, ติดต่อสอบถาม, แจ้งปัญหา...")
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(problemInput));
        return interaction.showModal(modal);
    }

    // 2. User submits Create Ticket Modal
    if (interaction.isModalSubmit() && interaction.customId === "ticket_modal_create") {
        const reason = interaction.fields.getTextInputValue("ticket_problem_detail").trim();
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check existing open ticket for user
            const existing = guild.channels.cache.find(c =>
                c.type === ChannelType.GuildText &&
                c.topic?.startsWith("kraken-ticket:" + interaction.user.id + ":")
            );

            if (existing) {
                return interaction.editReply({
                    content: `🎫 คุณมีห้อง Ticket ที่ยังเปิดอยู่แล้ว: ${existing}`
                });
            }

            // Next counter number (เริ่มขั้นต่ำที่ 500 เพื่อความน่าเชื่อถือระดับมือโปร)
            const baseCounter = Math.max(Number(tc.ticketCounter || 0), 499);
            const currentCounter = baseCounter + 1;
            tc.ticketCounter = currentCounter;
            saveTicketSettings(guildId, { ticketCounter: currentCounter }, config, saveConfig);

            const channelName = `│・Tickets-${currentCounter}`;
            const categoryId = tc.categoryId;
            const staffRoleId = tc.staffRoleId;
            const category = categoryId ? guild.channels.cache.get(categoryId) : null;
            const staffRole = staffRoleId ? guild.roles.cache.get(staffRoleId) : null;

            const overwrites = [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.EmbedLinks
                    ]
                },
                {
                    id: interaction.client.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.EmbedLinks
                    ]
                }
            ];

            if (staffRole) {
                overwrites.push({
                    id: staffRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.EmbedLinks
                    ]
                });
            }

            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category?.id || null,
                topic: `kraken-ticket:${interaction.user.id}:${currentCounter}:${reason.slice(0, 100)}`,
                permissionOverwrites: overwrites
            });

            // Embed inside ticket channel (Matching Screenshot 5)
            const openTimestamp = Math.floor(Date.now() / 1000);
            const staffMention = staffRole ? `<@&${staffRole.id}>` : "@admin";

            const pinkArrow = "<a:998057pinkarrow:1569102319105089637>";
            const ticketEmbed = new EmbedBuilder()
                .setColor(0x2B2D31)
                .setTitle(`<a:437007ticket:1569102283067621499> Ticket #${currentCounter}`)
                .setDescription(
                    `ผู้เปิดตั๋ว: <@${interaction.user.id}>\n` +
                    `เวลาเปิด: <t:${openTimestamp}:R>\n` +
                    `${pinkArrow} แจ้งเตือนทีมงาน: ${staffMention}\n\n` +
                    `รายละเอียดปัญหา:\n` +
                    `┃ ${reason}\n\n` +
                    `ขอบคุณที่ติดต่อเรา กรุณาอธิบายปัญหาของคุณ ทีมงานจะเข้ามาช่วยเหลือโดยเร็วที่สุดครับ`
                );

            const buttonsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("ticket_close_btn")
                    .setLabel("ปิด Ticket")
                    .setEmoji({ id: "1569102233981685840", name: "22247redcard", animated: true })
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId("ticket_invite_btn")
                    .setLabel("Invite")
                    .setEmoji({ id: "1569102307155779649", name: "785173catpaw", animated: true })
                    .setStyle(ButtonStyle.Success)
            );

            await channel.send({
                content: `<@${interaction.user.id}> ${staffMention}`,
                embeds: [ticketEmbed],
                components: [buttonsRow],
                allowedMentions: {
                    users: [interaction.user.id],
                    roles: staffRole ? [staffRole.id] : []
                }
            });

            // Optional notice to notify channel
            const notifyId = tc.notifyChannelId;
            if (notifyId) {
                const notify = guild.channels.cache.get(notifyId) ||
                    await guild.channels.fetch(notifyId).catch(() => null);

                if (notify && notify.isTextBased() && notify.send) {
                    const noticeEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle("🔔 มี Ticket ใหม่เข้ามา!")
                        .addFields(
                            { name: "เลขตั๋ว", value: `#${currentCounter}`, inline: true },
                            { name: "ผู้เปิด", value: `<@${interaction.user.id}>`, inline: true },
                            { name: "ห้อง", value: channel.toString(), inline: true },
                            { name: "รายละเอียด", value: reason || "ไม่มีรายละเอียด", inline: false }
                        )
                        .setTimestamp();

                    await notify.send({
                        content: staffRole ? `<@&${staffRole.id}> มี Ticket ใหม่เข้ามา` : undefined,
                        embeds: [noticeEmbed],
                        allowedMentions: { roles: staffRole ? [staffRole.id] : [] }
                    }).catch(() => null);
                }
            }

            return interaction.editReply({
                content: `✅ เปิด Ticket สำเร็จแล้วค่ะ: ${channel}`
            });
        } catch (error) {
            console.log("[TICKET CREATE ERROR]", error.message);
            return interaction.editReply({
                content: `❌ เปิด Ticket ไม่สำเร็จ: ${error.message}`
            });
        }
    }

    // 3. User clicks "Invite" Button -> Show Modal
    if (interaction.isButton() && interaction.customId === "ticket_invite_btn") {
        const modal = new ModalBuilder()
            .setCustomId("ticket_modal_invite")
            .setTitle("Invite สมาชิกเข้าสู่ Ticket");

        const userInput = new TextInputBuilder()
            .setCustomId("ticket_invite_user_id")
            .setLabel("Discord User ID ของผู้ใช้ที่ต้องการเชิญ")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("เช่น 123456789012345678")
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(userInput));
        return interaction.showModal(modal);
    }

    // 4. User submits Invite Modal
    if (interaction.isModalSubmit() && interaction.customId === "ticket_modal_invite") {
        const raw = interaction.fields.getTextInputValue("ticket_invite_user_id").trim();
        const userId = raw.replace(/[^0-9]/g, "");

        if (!userId) {
            return interaction.reply({
                content: "❌ รูปแบบ User ID ไม่ถูกต้อง",
                ephemeral: true
            });
        }

        try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return interaction.reply({
                    content: "❌ ไม่พบสมาชิกคนนี้ในเซิร์ฟเวอร์",
                    ephemeral: true
                });
            }

            await interaction.channel.permissionOverwrites.edit(member, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                EmbedLinks: true
            });

            await interaction.reply({
                content: `✅ เชิญ <@${member.id}> เข้าสู่ Ticket เรียบร้อยแล้วค่ะ`,
                ephemeral: true
            });

            return interaction.channel.send({
                content: `👥 <@${member.id}> ได้รับเชิญเข้าสู่ Ticket โดย <@${interaction.user.id}>`,
                allowedMentions: { users: [member.id] }
            });
        } catch (err) {
            console.log("[TICKET INVITE ERROR]", err.message);
            return interaction.reply({
                content: `❌ ไม่สามารถเชิญสมาชิกได้: ${err.message}`,
                ephemeral: true
            });
        }
    }

    // 5. User clicks "ปิด Ticket" Button
    if (interaction.isButton() && interaction.customId === "ticket_close_btn") {
        const topicParts = interaction.channel?.topic?.split(":") || [];
        const ownerId = topicParts[1];
        const ticketNum = topicParts[2] || "0";
        const staffRoleId = tc.staffRoleId;

        const isOwner = ownerId === interaction.user.id;
        const isStaff = staffRoleId && interaction.member?.roles?.cache?.has(staffRoleId);
        const canManage = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);

        if (!isOwner && !isStaff && !canManage) {
            return interaction.reply({
                content: "❌ เฉพาะผู้เปิด Ticket หรือทีมงานเท่านั้นที่สามารถปิดห้องนี้ได้",
                ephemeral: true
            });
        }

        await interaction.reply({
            content: "🔒 กำลังปิด Ticket ห้องนี้จะถูกลบใน 5 วินาที..."
        });

        return setTimeout(() => {
            interaction.channel?.delete().catch(err => console.log("[TICKET DELETE ERROR]", err.message));
        }, 5000);
    }
}

module.exports = {
    sendTicketPanel,
    makeTicketPanel,
    handleTicketInteraction,
    buildTicketTranscript,
    getTicketConfig,
    saveTicketSettings,
    loadTicketSettings,
    DEFAULT_TICKET_SETTINGS
};
