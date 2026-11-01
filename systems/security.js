const { EmbedBuilder, PermissionsBitField } = require("discord.js");

const joinWindows = new Map();
const messageWindows = new Map();
const recentMessages = new Map();

function settingsFor(config, guildId) {
    config[guildId] ??= {};
    config[guildId].security ??= {
        enabled: true, antiRaid: true, antiSpam: true,
        raidJoinLimit: 8, raidWindowSeconds: 10,
        spamMessageLimit: 5, spamWindowSeconds: 6,
        spamTimeoutSeconds: 60, raidTimeoutSeconds: 300,
        logChannelId: null
    };
    return config[guildId].security;
}

async function sendLog(guild, config, title, description, color = 0x5865F2, fields = [], saveConfig) {
    const s = settingsFor(config, guild.id);
    s.logs ??= [];
    s.logs.unshift({ title, description: String(description || "").slice(0, 500), color, createdAt: Date.now(), fields: fields.slice(0, 10).map(f => ({ name: f.name, value: String(f.value).slice(0, 900) })) });
    s.logs = s.logs.slice(0, 200);
    if (saveConfig) saveConfig(config);
    const id = s.logChannelId || config[guild.id]?.ticket?.notifyChannelId || config[guild.id]?.ticket?.panelChannelId;
    if (!id) return;
    const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    if (!channel?.isTextBased?.() || !channel.send) return;
    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description || "ไม่มีรายละเอียด")
        .addFields(fields.slice(0, 10)).setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(e => console.log("[SECURITY LOG ERROR]", e.message));
}

function startSecurity(client, config, saveConfig) {
    const log = (...args) => sendLog(...args, saveConfig);
    client.on("guildMemberAdd", async member => {
        const s = settingsFor(config, member.guild.id);
        if (!s.enabled || !s.antiRaid) return;
        const now = Date.now(), windowMs = Math.max(5, Number(s.raidWindowSeconds) || 10) * 1000;
        const arr = (joinWindows.get(member.guild.id) || []).filter(t => now - t < windowMs);
        arr.push(now); joinWindows.set(member.guild.id, arr);
        if (arr.length >= Math.max(3, Number(s.raidJoinLimit) || 8)) {
            await log(member.guild, config, "🚨 ตรวจพบเหตุการณ์ Raid", "มีสมาชิกเข้ามาจำนวนมากในช่วงเวลาสั้น ๆ", 0xED4245, [
                { name: "จำนวนสมาชิก", value: String(arr.length), inline: true },
                { name: "ช่วงเวลา", value: (windowMs / 1000) + " วินาที", inline: true }
            ]);
            // During a detected raid, temporarily timeout only newly joined human accounts.
            if (!member.user.bot && member.moderatable && !member.permissions.has(PermissionsBitField.Flags.Administrator) && !member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                const seconds = Math.min(3600, Math.max(60, Number(s.raidTimeoutSeconds) || 300));
                await member.timeout(seconds * 1000, "Kraken Anti-Raid: join burst detected").catch(() => null);
            }
        }
    });

    client.on("messageCreate", async message => {
        if (!message.guild || message.author.bot || !message.member) return;
        if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages) || message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
        const s = settingsFor(config, message.guild.id);
        if (!s.enabled || !s.antiSpam) return;
        const now = Date.now(), windowMs = Math.max(3, Number(s.spamWindowSeconds) || 6) * 1000;
        const key = message.guild.id + ":" + message.author.id;
        const arr = (messageWindows.get(key) || []).filter(t => now - t < windowMs);
        arr.push(now); messageWindows.set(key, arr);
        const normalized = String(message.content || "").trim().toLowerCase();
        const duplicateKey = key + ":" + normalized.slice(0, 180);
        const dup = recentMessages.get(duplicateKey) || 0;
        recentMessages.set(duplicateKey, now);
        const duplicate = normalized.length >= 4 && now - dup < 15000;
        if (arr.length < Math.max(3, Number(s.spamMessageLimit) || 5) && !duplicate) return;

        await message.delete().catch(() => null);
        if (message.member.moderatable) {
            const seconds = Math.min(3600, Math.max(10, Number(s.spamTimeoutSeconds) || 60));
            await message.member.timeout(seconds * 1000, "Kraken Anti-Spam").catch(() => null);
        }
        await log(message.guild, config, "⚠️ ตรวจพบ Spam", "ระบบลบข้อความและพยายาม Timeout สมาชิก", 0xFEE75C, [
            { name: "สมาชิก", value: "<@" + message.author.id + ">", inline: true },
            { name: "จำนวนข้อความ", value: String(arr.length), inline: true },
            { name: "ห้อง", value: "<#" + message.channel.id + ">", inline: true }
        ]);
        messageWindows.delete(key);
    });

    client.on("messageDelete", async message => {
        if (!message.guild || message.author?.bot) return;
        await sendLog(message.guild, config, "🗑️ มีข้อความถูกลบ", "ข้อความจาก " + (message.author?.tag || "ไม่ทราบผู้ใช้"), 0xED4245, [
            { name: "ห้อง", value: "<#" + message.channel.id + ">", inline: true },
            { name: "เนื้อหา", value: String(message.content || "[ไม่มีเนื้อหา/ไม่อยู่ในแคช]").slice(0, 900), inline: false }
        ]);
    });

    client.on("messageUpdate", async (before, after) => {
        if (!after.guild || after.author?.bot || before.content === after.content) return;
        await sendLog(after.guild, config, "✏️ มีการแก้ไขข้อความ", "สมาชิก " + (after.author?.tag || "ไม่ทราบผู้ใช้"), 0xFEE75C, [
            { name: "ห้อง", value: "<#" + after.channel.id + ">", inline: true },
            { name: "ก่อนแก้ไข", value: String(before.content || "[ไม่มีเนื้อหา]").slice(0, 700), inline: false },
            { name: "หลังแก้ไข", value: String(after.content || "[ไม่มีเนื้อหา]").slice(0, 700), inline: false }
        ]);
    });

    client.on("guildMemberRemove", member => {
        void log(member.guild, config, "🚪 สมาชิกออกจากเซิร์ฟเวอร์", member.user.tag + " (" + member.id + ")", 0x747F8D);
    });

    console.log("[SECURITY] Anti-Raid / Anti-Spam / audit logs loaded");
}

async function moderate(interaction, action) {
    const target = interaction.options.getMember("member");
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "ไม่ระบุเหตุผล";
    if (action === "unban") {
        const id = interaction.options.getString("user_id", true);
        await interaction.guild.members.unban(id, reason);
        return "ปลดแบน <@" + id + "> แล้ว";
    }
    if (!target) throw new Error("ไม่พบสมาชิกในเซิร์ฟเวอร์");
    if (target.id === interaction.user.id) throw new Error("ไม่สามารถใช้คำสั่งกับตัวเองได้");
    if (target.id === interaction.client.user.id) throw new Error("ไม่สามารถใช้คำสั่งกับบอทได้");
    if (target.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) throw new Error("ไม่สามารถจัดการสมาชิกที่มียศสูงกว่าหรือเท่ากันได้");
    if (action === "warn") {
        await target.send("คุณได้รับคำเตือนจาก " + interaction.guild.name + "\nเหตุผล: " + reason).catch(() => null);
        return "⚠️ Warn " + target.user.tag + " แล้ว";
    }
    if (action === "timeout") {
        const minutes = interaction.options.getInteger("minutes", true);
        if (!target.moderatable) throw new Error("บอทไม่มีสิทธิ์ Timeout สมาชิกนี้");
        await target.timeout(minutes * 60000, reason);
        return "⏳ Timeout " + target.user.tag + " เป็นเวลา " + minutes + " นาทีแล้ว";
    }
    if (action === "kick") {
        if (!target.kickable) throw new Error("บอทไม่มีสิทธิ์ Kick สมาชิกนี้");
        await target.kick(reason);
        return "👢 Kick " + target.user.tag + " แล้ว";
    }
    if (action === "ban") {
        if (!target.bannable) throw new Error("บอทไม่มีสิทธิ์ Ban สมาชิกนี้");
        await target.ban({ reason, deleteMessageSeconds: 0 });
        return "🔨 Ban " + target.user.tag + " แล้ว";
    }
    throw new Error("ไม่รู้จักคำสั่ง");
}

module.exports = { startSecurity, settingsFor, sendLog, moderate };
