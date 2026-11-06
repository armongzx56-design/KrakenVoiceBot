const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");

// Cache for tracking invites: guildId -> Map<code, { uses, inviterTag, inviterId }>
const guildInvitesCache = new Map();
// Cache for joined members: userId -> { inviterTag, inviteCode, inviteUses }
const memberInviteMap = new Map();

function formatThaiDate(date = new Date()) {
    const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const d = date.getDate();
    const m = months[date.getMonth()];
    const y = date.getFullYear() + 543;
    const hours = String(date.getHours()).padStart(2, "0");
    const mins = String(date.getMinutes()).padStart(2, "0");
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

function startVerify(client) {
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

function makeVerifyPanel(options = {}) {
    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({ name: "• Powered by Kraken Hub" })
        .setTitle("🪽 ยืนยันตัวตนด้วยปุ่ม 🪽")
        .setDescription("➡️ คลิกปุ่มด้านล่างเพื่อเริ่มการยืนยันตัวตนและเข้าสู่เซิร์ฟเวอร์ครับ ❕");

    if (options.bannerUrl) {
        embed.setImage(options.bannerUrl);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_btn")
            .setLabel("ยืนยันตัวตน")
            .setEmoji("✔️")
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
    const payload = makeVerifyPanel(options);
    return await channel.send(payload);
}

async function handleVerifyInteraction(interaction, config, saveConfig) {
    const guildId = interaction.guildId;
    const verifyConfig = config[guildId]?.verify || {};

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

                const logEmbed = new EmbedBuilder()
                    .setColor(0x9B59B6)
                    .setTitle(`🔮 ${interaction.user.username} ผ่านการยืนยันตัวตนแล้วค่ะ!`)
                    .setDescription(
                        `• 👤 **ผู้เชิญ:** ${inviteInfo.inviterTag} ( \`${inviteInfo.code}\` )\n` +
                        `• 🟢 **จำนวนการใช้:** ${inviteInfo.uses} ครั้ง`
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
    formatThaiDate
};

