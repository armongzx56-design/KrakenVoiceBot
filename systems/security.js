const { EmbedBuilder, PermissionsBitField, AuditLogEvent } = require("discord.js");

const joinWindows = new Map();
const messageWindows = new Map();
const recentMessages = new Map();

// Webhook anti-spam tracking
const webhookWindows = new Map();
const recentWebhookMessages = new Map();
const terminatingWebhooks = new Set();

// Cache recent messages in memory to preserve author & content even if Discord purges the message from cache or fires partial
const messageCache = new Map();
function cacheMessage(msg) {
    if (!msg || !msg.id) return;
    messageCache.set(msg.id, {
        authorId: msg.author?.id,
        authorTag: msg.author?.tag,
        content: msg.content,
        channelId: msg.channel?.id,
        createdAt: msg.createdAt,
        guildId: msg.guild?.id
    });
    if (messageCache.size > 3000) {
        const firstKey = messageCache.keys().next().value;
        messageCache.delete(firstKey);
    }
}

// Track messages deleted by the bot so we know who deleted it (Bot) and the exact reason
const botDeletedMessages = new Map();
function trackBotDelete(messageId, reason, extra = {}) {
    botDeletedMessages.set(messageId, {
        reason,
        timestamp: Date.now(),
        ...extra
    });
    setTimeout(() => {
        botDeletedMessages.delete(messageId);
    }, 120000);
}

// Regex to detect Discord server invites (discord.gg, discord.com/invite, discordapp.com/invite, dsc.gg, discord.me, etc.)
const DISCORD_INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li|link)|discord(?:app)?\.com\/invite|dsc\.gg|invite\.gg)\/([a-zA-Z0-9_\-]+)/gi;

function settingsFor(config, guildId) {
    config[guildId] ??= {};
    const defaultLogChannel = guildId === "1550132569432137903" ? "1563869910474428449" : null;
    config[guildId].security ??= {
        enabled: true,
        antiRaid: true,
        antiSpam: true,
        antiWebhookSpam: true,
        antiEveryoneBan: true,
        antiDiscordLink: true,
        webhookSpamLimit: 3,
        webhookWindowSeconds: 5,
        autoDeleteSpamWebhook: true,
        blockMassMentions: true,
        raidJoinLimit: 8,
        raidWindowSeconds: 10,
        spamMessageLimit: 5,
        spamWindowSeconds: 6,
        spamTimeoutSeconds: 60,
        raidTimeoutSeconds: 300,
        logChannelId: defaultLogChannel
    };
    if (guildId === "1550132569432137903" && !config[guildId].security.logChannelId) {
        config[guildId].security.logChannelId = "1563869910474428449";
    }
    const sec = config[guildId].security;
    sec.antiWebhookSpam ??= true;
    sec.antiEveryoneBan ??= true;
    sec.antiDiscordLink ??= true;
    sec.webhookSpamLimit ??= 3;
    sec.webhookWindowSeconds ??= 5;
    sec.autoDeleteSpamWebhook ??= true;
    sec.blockMassMentions ??= true;

    return sec;
}

async function sendLog(guild, config, title, description, color = 0x5865F2, fields = [], saveConfig) {
    if (!Array.isArray(fields)) fields = [];
    const s = settingsFor(config, guild.id);
    s.logs ??= [];
    s.logs.unshift({ title, description: String(description || "").slice(0, 500), color, createdAt: Date.now(), fields: fields.slice(0, 10).map(f => ({ name: f.name, value: String(f.value).slice(0, 900) })) });
    s.logs = s.logs.slice(0, 200);
    if (saveConfig) saveConfig(config);
    const id = s.logChannelId;
    if (!id) return;
    const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    if (!channel?.isTextBased?.() || !channel.send) return;
    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description || "ไม่มีรายละเอียด")
        .addFields(fields.slice(0, 10)).setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(e => console.log("[SECURITY LOG ERROR]", e.message));
}

function startSecurity(client, config, saveConfig) {
    const log = (g, c, title, desc, color = 0x5865F2, fields = []) => sendLog(g, c, title, desc, color, Array.isArray(fields) ? fields : [], saveConfig);

    async function handleAntiEveryone(message, isEdit = false) {
        if (!message || !message.guild || !message.author) return false;
        if (message.author.id === client.user?.id) return false;

        const s = settingsFor(config, message.guild.id);
        if (!s.enabled || s.antiEveryoneBan === false) return false;

        // ตรวจสอบหัวดิส (Guild Owner) - ได้รับการยกเว้นเพียงคนเดียวเท่านั้น
        let ownerId = message.guild.ownerId;
        if (!ownerId && message.guild.fetch) {
            try {
                const fetched = await message.guild.fetch().catch(() => null);
                ownerId = fetched?.ownerId;
            } catch {}
        }
        if (ownerId && message.author.id === ownerId) {
            return false;
        }

        // ตรวจจับการแท็ก @everyone (ทั้งตัวพิมพ์ตรง, อักษร zero-width หรือ Mentions จากระบบ)
        const content = String(message.content || "");
        const hasEveryoneTag =
            /@[\u200B-\u200D\uFEFF]*everyone/i.test(content) ||
            (message.mentions?.everyone && !/@[\u200B-\u200D\uFEFF]*here/i.test(content));

        if (!hasEveryoneTag) return false;

        const guild = message.guild;
        const channel = message.channel;
        const author = message.author;
        const contentSnippet = content.slice(0, 500) || "[ไม่มีเนื้อหา]";

        // 1. กรณีเป็น Webhook แท็ก @everyone
        if (message.webhookId) {
            trackBotDelete(message.id, "🚨 ระบบลบอัตโนมัติ: Webhook แท็ก @everyone (Anti-Everyone Guard)");
            await message.delete().catch(() => null);
            let webhookObj = null;
            try {
                webhookObj = await client.fetchWebhook(message.webhookId).catch(() => null);
                if (!webhookObj && channel.fetchWebhooks) {
                    const hooks = await channel.fetchWebhooks().catch(() => null);
                    webhookObj = hooks?.get(message.webhookId);
                }
                if (webhookObj?.delete) {
                    await webhookObj.delete("Kraken Anti-Everyone: Webhook tagged @everyone (Only guild owner permitted)");
                }
            } catch (err) {
                console.log("[ANTI-EVERYONE WEBHOOK DEL ERR]", err.message);
            }

            await log(guild, config, "🚨 ตรวจพบ Webhook แท็ก @everyone (ระงับทันที)", "ระบบได้ลบข้อความและเพิกถอน Webhook เรียบร้อยแล้ว (สงวนสิทธิ์เฉพาะหัวดิส)", 0xED4245, [
                { name: "ชื่อ Webhook", value: String(author.username || webhookObj?.name || "ไม่ทราบชื่อ"), inline: true },
                { name: "Webhook ID", value: String(message.webhookId), inline: true },
                { name: "ห้องที่เกิดเหตุ", value: `<#${channel.id}>`, inline: true },
                { name: "การดำเนินการ", value: "🛡️ **ลบข้อความ + ลบ Webhook ถาวรทันที**", inline: false },
                { name: "ตัวอย่างข้อความ", value: contentSnippet, inline: false }
            ]);
            return true;
        }

        // 2. กรณีเป็นสมาชิกทั่วไป / บอทอื่น / แอดมิน ที่ไม่ใช่หัวดิส -> ลบข้อความ + แบนถาวรทันที
        trackBotDelete(message.id, "🔨 ระบบลบอัตโนมัติ: สมาชิกแท็ก @everyone (Anti-Everyone Guard)");
        await message.delete().catch(() => null);

        // ส่งข้อความแจ้งเตือนทาง DM ก่อนทำการแบน
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle(`🔨 คุณถูกแบนจาก ${guild.name}`)
                .setDescription(`คุณถูกแบนออกจากเซิร์ฟเวอร์ทันทีเนื่องจากทำการแท็ก **@everyone**\n\n🛡️ **นโยบายความปลอดภัย:** สงวนสิทธิ์การแท็ก **@everyone** ไว้สำหรับ **หัวดิส (เจ้าของเซิร์ฟเวอร์)** เท่านั้น`)
                .addFields(
                    { name: "🏠 เซิร์ฟเวอร์", value: guild.name, inline: true },
                    { name: "⚠️ สาเหตุ", value: "แท็ก @everyone โดยไม่ได้รับอนุญาต (Anti-Everyone Guard)", inline: true },
                    { name: "💬 ข้อความของคุณ", value: contentSnippet, inline: false }
                )
                .setTimestamp();
            await author.send({ embeds: [dmEmbed] }).catch(() => null);
        } catch {}

        let banSuccess = false;
        let banError = null;
        const banReason = "Kraken Anti-Everyone: แท็ก @everyone โดยไม่ได้รับอนุญาต (สงวนสิทธิ์เฉพาะหัวดิสเท่านั้น)";

        try {
            await guild.members.ban(author.id, {
                reason: banReason,
                deleteMessageSeconds: 86400
            });
            banSuccess = true;
        } catch (err) {
            banError = err.message;
            console.error(`[ANTI-EVERYONE] Failed to ban ${author.tag || author.id}:`, err.message);

            // Fallback: หากแบนไม่สำเร็จเพราะติดลำดับยศ (Role Hierarchy) ให้ Timeout ฉุกเฉิน 28 วัน
            try {
                if (message.member?.moderatable) {
                    await message.member.timeout(28 * 24 * 60 * 60 * 1000, banReason).catch(() => null);
                }
            } catch {}
        }

        // แจ้งเตือนในห้องที่เกิดเหตุ (ลบตัวเองอัตโนมัติใน 15 วินาที เพื่อไม่ให้รกห้อง)
        try {
            const alertEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("🛡️ Kraken Security • Anti-Everyone Guard")
                .setDescription(
                    banSuccess
                        ? `🔨 **แบน <@${author.id}> (\`${author.tag || author.id}\`) ออกจากเซิร์ฟเวอร์เรียบร้อย**\n\n⚠️ *ไม่อนุญาตให้ผู้ใดแท็ก @everyone เด็ดขาด (สงวนสิทธิ์เฉพาะหัวดิสเท่านั้น)*`
                        : `⚠️ ตรวจพบ <@${author.id}> แท็ก @everyone แต่บอทไม่สามารถแบนได้เนื่องจากยศสูงกว่าบอท!\nกรุณาให้หัวดิสดำเนินการด้วยตนเองและจัดลำดับยศบอทให้อยู่สูงสุด`
                )
                .setTimestamp();

            const notice = await channel.send({ embeds: [alertEmbed] }).catch(() => null);
            if (notice) setTimeout(() => notice.delete().catch(() => null), 15000);
        } catch {}

        // บันทึก Log เข้าห้อง Security Log
        await log(guild, config, "🔨 แบนสมาชิก (Anti-Everyone)", `ตรวจพบการแท็ก @everyone ${isEdit ? "(ผ่านการแก้ไขข้อความ)" : ""}`, 0xED4245, [
            { name: "สมาชิกที่ถูกแบน", value: `<@${author.id}> (${author.tag || author.id})`, inline: true },
            { name: "User ID", value: author.id, inline: true },
            { name: "ห้องที่เกิดเหตุ", value: `<#${channel.id}>`, inline: true },
            { name: "สถานะการแบน", value: banSuccess ? "✅ แบนออกจากเซิร์ฟเวอร์เรียบร้อย (ลบข้อความย้อนหลัง 24 ชม.)" : `⚠️ แบนไม่สำเร็จ (${banError || "ยศสูงกว่าบอท / ติด Role Hierarchy"})`, inline: false },
            { name: "ข้อความ", value: contentSnippet, inline: false }
        ]);

        return true;
    }

    async function handleAntiDiscordLink(message, isEdit = false) {
        if (!message || !message.guild || !message.author) return false;
        if (message.author.id === client.user?.id) return false;

        const s = settingsFor(config, message.guild.id);
        if (!s.enabled || s.antiDiscordLink === false) return false;

        // หากตั้งค่าให้ยกเว้นทีมงาน (ค่าเริ่มต้นไม่ยกเว้น เพื่อป้องกันการแอบส่งหรือโดนแฮกไอดี/ทดสอบระบบ)
        if (s.exemptStaff) {
            let isOwner = message.guild.ownerId === message.author.id;
            if (!isOwner && message.guild.fetch) {
                try {
                    const fetched = await message.guild.fetch().catch(() => null);
                    isOwner = fetched?.ownerId === message.author.id;
                } catch {}
            }
            if (isOwner) return false;

            if (message.member?.permissions) {
                if (
                    message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    message.member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                    message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
                ) {
                    return false;
                }
            }
        }

        const rawContent = String(message.content || "");
        if (!rawContent) return false;

        // ล้างอักขระพิเศษ / zero-width characters ที่อาจใช้หลบเลี่ยงการตรวจจับ
        const cleanContent = rawContent.replace(/[\u200B-\u200D\uFEFF]/g, "");

        DISCORD_INVITE_REGEX.lastIndex = 0;
        const matches = [...cleanContent.matchAll(DISCORD_INVITE_REGEX)];
        if (!matches || matches.length === 0) return false;

        // ดึง Vanity URL และ Invites ของเซิร์ฟเวอร์ตนเอง เพื่ออนุญาตให้แชร์ลิงก์ของเซิร์ฟเวอร์นี้ได้
        const guildVanity = message.guild.vanityURLCode?.toLowerCase();
        const guildInviteCodes = new Set();
        if (guildVanity) guildInviteCodes.add(guildVanity);

        try {
            if (message.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                const invites = await message.guild.invites.fetch().catch(() => null);
                if (invites) {
                    for (const inv of invites.values()) {
                        if (inv.code) guildInviteCodes.add(inv.code.toLowerCase());
                    }
                }
            }
        } catch {}

        // คัดกรองเฉพาะลิงก์ที่เป็น Discord คำเชิญภายนอก (ไม่ใช่ของเซิร์ฟเวอร์นี้)
        const externalMatches = matches.filter(m => {
            const code = (m[1] || "").toLowerCase();
            return !guildInviteCodes.has(code);
        });

        if (externalMatches.length === 0) return false;

        const detectedLinks = externalMatches.map(m => m[0]);

        // บันทึกการลบโดยบอท เพื่อให้ event messageDelete สามารถระบุผู้ลบและเหตุผลได้อย่างแม่นยำ
        trackBotDelete(message.id, "🛡️ ระบบลบอัตโนมัติ: ป้องกันการส่งลิงก์ Discord (Anti-Discord Link)", {
            detectedLinks,
            targetId: message.author.id,
            targetTag: message.author.tag
        });

        // ลบข้อความที่มีลิงก์ดิสทันที
        await message.delete().catch(() => null);

        // ส่งข้อความเตือนในห้องชั่วคราว (ลบตัวเองใน 6 วินาที)
        try {
            const warnEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("🛡️ Kraken Security • Anti-Discord Link")
                .setDescription(`⚠️ <@${message.author.id}> **ไม่อนุญาตให้ส่งลิงก์ Discord / คำเชิญเซิร์ฟเวอร์อื่นในห้องนี้!**\n*(ระบบได้ทำการลบข้อความของคุณเรียบร้อยแล้ว)*`)
                .setTimestamp();

            const warnNotice = await message.channel.send({ embeds: [warnEmbed] }).catch(() => null);
            if (warnNotice) setTimeout(() => warnNotice.delete().catch(() => null), 6000);
        } catch {}

        return true;
    }

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
        if (!message.guild) return;

        // บันทึกข้อความลงแคชชั่วคราว เพื่อให้ระบุผู้ส่งและเนื้อหาได้แม้ Discord จะไม่แคชตอนถูกลบ
        cacheMessage(message);

        // 0. ANTI-EVERYONE TAG BAN (สงวนสิทธิ์เฉพาะหัวดิสเท่านั้น)
        const everyoneBlocked = await handleAntiEveryone(message, false);
        if (everyoneBlocked) return;

        // 0.5. ANTI-DISCORD LINK (ระบบป้องกันส่งลิงก์ดิส & บอทลบอัตโนมัติ)
        const linkBlocked = await handleAntiDiscordLink(message, false);
        if (linkBlocked) return;

        // 1. WEBHOOK ANTI-SPAM
        if (message.webhookId) {
            const s = settingsFor(config, message.guild.id);
            if (!s.enabled || !s.antiWebhookSpam) return;

            const webhookId = message.webhookId;
            const now = Date.now();
            const windowMs = Math.max(2, Number(s.webhookWindowSeconds) || 5) * 1000;
            const spamLimit = Math.max(2, Number(s.webhookSpamLimit) || 3);
            const key = `${message.guild.id}:${webhookId}`;

            const arr = (webhookWindows.get(key) || []).filter(t => now - t < windowMs);
            arr.push(now);
            webhookWindows.set(key, arr);

            const normalized = String(message.content || "").trim().toLowerCase();
            const dupKey = `${key}:${normalized.slice(0, 180)}`;
            const lastDup = recentWebhookMessages.get(dupKey) || 0;
            recentWebhookMessages.set(dupKey, now);
            const isDuplicate = normalized.length >= 4 && (now - lastDup < 10000);

            const hasForbiddenMentions = s.blockMassMentions && (message.mentions.everyone || normalized.includes("@everyone") || normalized.includes("@here"));

            const isSpam = arr.length >= spamLimit || (arr.length >= 2 && isDuplicate) || hasForbiddenMentions;

            if (isSpam) {
                if (terminatingWebhooks.has(webhookId)) {
                    await message.delete().catch(() => null);
                    return;
                }
                terminatingWebhooks.add(webhookId);
                setTimeout(() => terminatingWebhooks.delete(webhookId), 30000);

                trackBotDelete(message.id, "🚨 ระบบลบอัตโนมัติ: Webhook Spam (Rate Limit / Duplicate)");
                await message.delete().catch(() => null);

                let actionTaken = "ลบข้อความสแปมเรียบร้อย";
                let webhookObj = null;

                if (s.autoDeleteSpamWebhook) {
                    try {
                        webhookObj = await client.fetchWebhook(webhookId).catch(() => null);
                        if (!webhookObj && message.channel.fetchWebhooks) {
                            const hooks = await message.channel.fetchWebhooks().catch(() => null);
                            webhookObj = hooks?.get(webhookId);
                        }
                        if (webhookObj && webhookObj.delete) {
                            await webhookObj.delete("Kraken Anti-Webhook-Spam: Rate limit exceeded or mass ping detected");
                            actionTaken = "ลบข้อความสแปม + สั่งเพิกถอน/ลบ Webhook ถาวรเรียบร้อย (Revoked Token)";
                        } else {
                            actionTaken = "ลบข้อความสแปม (Webhook ถูกลบไปแล้วหรือไม่พบในเซิร์ฟเวอร์)";
                        }
                    } catch (err) {
                        console.log("[ANTI-WEBHOOK ERROR] Failed to delete webhook:", err.message);
                        actionTaken = `ลบข้อความสแปม (ไม่สามารถลบ Webhook: ${err.message})`;
                    }
                }

                const reason = hasForbiddenMentions
                    ? "🚨 มีการพยายามแท็ก @everyone / @here ผ่าน Webhook"
                    : (isDuplicate ? "⚠️ ส่งข้อความซ้ำรัวผิดปกติ (Burst Duplicate Spam)" : `⚠️ ส่งข้อความเกินอัตราที่กำหนด (${arr.length} ข้อความ/${windowMs / 1000} วิ)`);

                await log(message.guild, config, "🚨 ตรวจพบ Webhook Spam / ดำเนินการระงับทันที", reason, 0xED4245, [
                    { name: "ชื่อ Webhook", value: String(message.author.username || webhookObj?.name || "ไม่ทราบชื่อ"), inline: true },
                    { name: "Webhook ID", value: String(webhookId), inline: true },
                    { name: "ห้องที่เกิดเหตุ", value: `<#${message.channel.id}>`, inline: true },
                    { name: "จำนวนข้อความสแปม", value: `${arr.length} ข้อความ ภายใน ${windowMs / 1000} วิ`, inline: true },
                    { name: "การดำเนินการ", value: `🛡️ **${actionTaken}**`, inline: false },
                    { name: "ตัวอย่างข้อความ", value: String(message.content || "[ข้อความว่างหรือ Embed]").slice(0, 500), inline: false }
                ]);

                webhookWindows.delete(key);
            }
            return;
        }

        // 2. REGULAR USER ANTI-SPAM
        if (message.author.bot || !message.member) return;
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

        trackBotDelete(message.id, "⚠️ ระบบลบอัตโนมัติ: ส่งข้อความสแปมรัวผิดปกติ (Anti-Spam)");
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

    client.on("webhookUpdate", async channel => {
        if (!channel || !channel.guild) return;
        const s = settingsFor(config, channel.guild.id);
        if (!s.enabled || !s.antiWebhookSpam) return;

        try {
            if (channel.guild.members.me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
                const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
                const entry = auditLogs?.entries.first();
                if (entry && (Date.now() - entry.createdTimestamp < 8000)) {
                    // Action 50 = WebhookCreate, 51 = WebhookUpdate, 52 = WebhookDelete
                    const actionName = entry.action === 50 ? "สร้าง Webhook ใหม่" : entry.action === 51 ? "แก้ไข Webhook" : entry.action === 52 ? "ลบ Webhook" : null;
                    if (actionName && entry.executor?.id !== client.user?.id) {
                        await log(channel.guild, config, `🔔 มีการ${actionName}`, `ตรวจพบการเปลี่ยนแปลง Webhook ในห้อง <#${channel.id}>`, 0x5865F2, [
                            { name: "ผู้ดำเนินการ", value: `<@${entry.executor.id}> (${entry.executor.tag})`, inline: true },
                            { name: "ห้อง", value: `<#${channel.id}>`, inline: true },
                            { name: "Webhook Name", value: String(entry.target?.name || "Webhook"), inline: true }
                        ]);
                    }
                }
            }
        } catch (e) {
            console.log("[WEBHOOK AUDIT ERROR]", e.message);
        }
    });

    client.on("messageDelete", async message => {
        if (!message.guild) return;

        // ดึงข้อมูลจากแคชในกรณีที่ข้อความเป็น Partial หรือ Discord ไม่ได้แคชไว้
        const cached = messageCache.get(message.id);
        const authorId = message.author?.id || cached?.authorId;
        const authorTag = message.author?.tag || cached?.authorTag || "ไม่ทราบผู้ใช้";
        const content = message.content || cached?.content || "[ไม่มีเนื้อหา/ไม่อยู่ในแคช]";
        const isAuthorBot = message.author ? message.author.bot : false;

        // ถ้าข้อความที่ลบเป็นของบอทเอง และไม่ได้อยู่ในรายการที่ระบบความปลอดภัยสั่งลบ ให้ข้ามเพื่อไม่ให้ Log ล้น
        if (isAuthorBot && !botDeletedMessages.has(message.id)) return;

        let deletedByText = "❓ ไม่สามารถระบุได้";
        let deleteReason = null;
        let detectedLinks = null;

        // 1. ตรวจสอบว่าระบบความปลอดภัยของบอทเองเป็นผู้สั่งลบข้อความนี้หรือไม่
        if (botDeletedMessages.has(message.id)) {
            const info = botDeletedMessages.get(message.id);
            botDeletedMessages.delete(message.id);
            deletedByText = `🤖 <@${client.user.id}> (${client.user.username})`;
            if (info.reason) deleteReason = info.reason;
            if (info.detectedLinks) detectedLinks = info.detectedLinks;
        } else {
            // 2. หน่วงเวลา 600ms เพื่อรอให้ Audit Log ของ Discord ซิงค์ข้อมูลผู้สั่งลบ
            await new Promise(r => setTimeout(r, 600));

            try {
                if (message.guild.members.me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
                    const auditLogs = await message.guild.fetchAuditLogs({
                        type: AuditLogEvent.MessageDelete,
                        limit: 3
                    }).catch(() => null);

                    const entry = auditLogs?.entries.find(e => {
                        const isTarget = !authorId || e.target?.id === authorId;
                        const isChannel = !message.channel || e.extra?.channel?.id === message.channel.id;
                        const isRecent = (Date.now() - e.createdTimestamp) < 10000;
                        return isTarget && isChannel && isRecent;
                    });

                    if (entry && entry.executor) {
                        if (entry.executor.id === client.user.id) {
                            deletedByText = `🤖 <@${entry.executor.id}> (${entry.executor.tag || "บอท"})`;
                        } else {
                            deletedByText = `🛡️ <@${entry.executor.id}> (${entry.executor.tag || entry.executor.username})`;
                        }
                        if (entry.reason) deleteReason = entry.reason;
                    } else {
                        // ใน Discord หากเจ้าของข้อความลบข้อความของตนเอง Discord จะไม่สร้าง Audit Log เด็ดขาด
                        if (authorId) {
                            deletedByText = `👤 <@${authorId}> (เจ้าของข้อความลบเอง)`;
                        } else {
                            deletedByText = `👤 เจ้าของข้อความลบเอง หรือ ตรวจสอบไม่ได้`;
                        }
                    }
                } else {
                    if (authorId) {
                        deletedByText = `👤 <@${authorId}> (เจ้าของข้อความลบเอง / บอทขาดสิทธิ์ View Audit Log)`;
                    } else {
                        deletedByText = `❓ ไม่ทราบ (ต้องการสิทธิ์ View Audit Log)`;
                    }
                }
            } catch (err) {
                console.log("[MESSAGE DELETE AUDIT ERROR]", err.message);
                if (authorId) {
                    deletedByText = `👤 <@${authorId}> (เจ้าของข้อความลบเอง)`;
                }
            }
        }

        const fields = [
            { name: "ห้อง", value: `<#${message.channel.id}>`, inline: true }
        ];

        if (authorId) {
            fields.push({ name: "เจ้าของข้อความ", value: `<@${authorId}> (${authorTag})`, inline: true });
        }

        fields.push({ name: "ผู้ลบข้อความ", value: deletedByText, inline: true });

        if (deleteReason) {
            fields.push({ name: "สาเหตุ / การดำเนินการ", value: String(deleteReason), inline: false });
        }

        if (detectedLinks && detectedLinks.length > 0) {
            fields.push({ name: "🔗 ลิงก์ที่ตรวจพบ", value: detectedLinks.join("\n").slice(0, 500), inline: false });
        }

        fields.push({
            name: "เนื้อหา",
            value: String(content).slice(0, 900) || "[ไม่มีเนื้อหา]",
            inline: false
        });

        await log(
            message.guild,
            config,
            "🗑️ มีข้อความถูกลบ",
            `ข้อความจาก ${authorTag}`,
            0xED4245,
            fields
        );
    });

    client.on("messageDeleteBulk", async messages => {
        const first = messages.first();
        if (!first || !first.guild) return;

        await new Promise(r => setTimeout(r, 600));
        let deleterText = "❓ ไม่สามารถระบุได้";
        try {
            if (first.guild.members.me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
                const auditLogs = await first.guild.fetchAuditLogs({
                    type: AuditLogEvent.MessageBulkDelete,
                    limit: 1
                }).catch(() => null);
                const entry = auditLogs?.entries.first();
                if (entry && (Date.now() - entry.createdTimestamp < 10000)) {
                    deleterText = `🛡️ <@${entry.executor.id}> (${entry.executor.tag || entry.executor.username})`;
                }
            }
        } catch {}

        await log(first.guild, config, "🗑️ มีการลบข้อความจำนวนมาก (Bulk Delete)", `มีการลบข้อความทั้งหมด ${messages.size} ข้อความพร้อมกัน`, 0xED4245, [
            { name: "ห้อง", value: `<#${first.channel.id}>`, inline: true },
            { name: "ผู้ลบข้อความ", value: deleterText, inline: true },
            { name: "จำนวนข้อความ", value: `${messages.size} ข้อความ`, inline: true }
        ]);
    });

    client.on("messageUpdate", async (before, after) => {
        if (!after || !after.guild) return;
        if (after.partial) {
            try { after = await after.fetch(); } catch {}
        }

        // แคชข้อความที่แก้ไข
        cacheMessage(after);

        // 0. ANTI-EVERYONE TAG BAN ON EDIT (ป้องกันการแก้ไขข้อความเพื่อแท็ก @everyone)
        const everyoneBlocked = await handleAntiEveryone(after, true);
        if (everyoneBlocked) return;

        // 0.5. ANTI-DISCORD LINK ON EDIT (ลบข้อความแก้ไขที่มีลิงก์ Discord อัตโนมัติ)
        const linkBlocked = await handleAntiDiscordLink(after, true);
        if (linkBlocked) return;

        if (after.author?.bot || before?.content === after?.content) return;
        await sendLog(after.guild, config, "✏️ มีการแก้ไขข้อความ", "สมาชิก " + (after.author?.tag || "ไม่ทราบผู้ใช้"), 0xFEE75C, [
            { name: "ห้อง", value: "<#" + after.channel.id + ">", inline: true },
            { name: "ก่อนแก้ไข", value: String(before?.content || "[ไม่มีเนื้อหา]").slice(0, 700), inline: false },
            { name: "หลังแก้ไข", value: String(after.content || "[ไม่มีเนื้อหา]").slice(0, 700), inline: false }
        ]);
    });

    console.log("[SECURITY] Anti-Raid / Anti-Spam / Anti-Discord-Link / audit logs loaded");
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
