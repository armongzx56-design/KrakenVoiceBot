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
const USERS_FILE = path.join(DATA_DIR, "users.json");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const HWID_LOGS_FILE = path.join(DATA_DIR, "hwid_resets.json");
const SETTINGS_FILE = path.join(DATA_DIR, "whitelist_settings.json");

function ensureFile(f, def = "{}") {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(f)) fs.writeFileSync(f, def, "utf8");
}

ensureFile(USERS_FILE, "{}");
ensureFile(KEYS_FILE, "[]");
ensureFile(HWID_LOGS_FILE, "{}");
ensureFile(SETTINGS_FILE, "{}");

function loadJSON(f, def = {}) {
    try {
        return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
        return def;
    }
}

function saveJSON(f, data) {
    try {
        fs.writeFileSync(f, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error(`[WHITELIST SAVE ERR ${f}]`, e.message);
    }
}

function loadSettingsFile() {
    return loadJSON(SETTINGS_FILE, {});
}

function saveSettingsFile(data) {
    saveJSON(SETTINGS_FILE, data);
}

function getSettings(config, guildId) {
    const fileSettings = loadSettingsFile();
    const fromFile = fileSettings[guildId] || {};

    config ??= {};
    config[guildId] ??= {};
    config[guildId].whitelist ??= {};

    const existing = config[guildId].whitelist;
    const resolvedRoleId = fromFile.vipRoleId || fromFile.buyerRoleId || existing.vipRoleId || existing.buyerRoleId || null;

    const merged = {
        enabled: true,
        panelTitle: "KrakenHub | Script Whitelist",
        panelDesc:
            "🔑 **Redeem Key** | เอาคีย์ที่สั่งซื้อหรือรับมา รีดึมแล้วกดยืนยันได้เลย\n" +
            "📥 **Get Script** | รับตัวสคริปต์ Loader สำหรับนำไปรันในเกม\n" +
            "👑 **Get VIP Role** | รับยศ VIP ประจำเซิร์ฟเวอร์\n" +
            "🔄 **Reset HWID** | รีเซ็ต HWID กรณีเปลี่ยนคอมพิวเตอร์หรือ VPS\n" +
            "📊 **Get Stats** | ตรวจสอบสถานะคีย์และวันหมดอายุการใช้งาน",
        scriptLoader: 'loadstring(game:HttpGet("https://tinyurl.com/KrakenHubV2"))()',
        vipRoleId: resolvedRoleId,
        buyerRoleId: resolvedRoleId,
        logChannelId: fromFile.logChannelId || existing.logChannelId || null,
        panelChannelId: fromFile.panelChannelId || existing.panelChannelId || null,
        resetHwidCooldownHours: fromFile.resetHwidCooldownHours || existing.resetHwidCooldownHours || 24,
        allowUserHwidReset: true,
        ...existing,
        ...fromFile
    };

    config[guildId].whitelist = merged;
    return merged;
}

function saveSettings(guildId, settings, config, saveConfig) {
    if (!guildId) return;

    // 1. บันทึกลง data/whitelist_settings.json โดยตรง (ทนต่อการรีสตาร์ท)
    const fileSettings = loadSettingsFile();
    fileSettings[guildId] = settings;
    saveSettingsFile(fileSettings);

    // 2. บันทึกลง data/config.json
    if (config) {
        config[guildId] ??= {};
        config[guildId].whitelist = settings;
        if (typeof saveConfig === "function") {
            try {
                saveConfig(config);
            } catch (e) {
                console.log("[SAVE CONFIG ERR]", e.message);
            }
        }
    }
}

function makeWhitelistPanel(settings) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(settings.panelTitle || "KrakenHub | Script Whitelist")
        .setDescription(settings.panelDesc || "ระบบจัดการ Whitelist สคริปต์ KrakenHub")
        .setFooter({ text: "KrakenHub Security • System" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("wl_redeem_btn")
            .setLabel("Redeem Key")
            .setEmoji("🔑")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("wl_getscript_btn")
            .setLabel("Get Script")
            .setEmoji("📜")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("wl_getrole_btn")
            .setLabel("Get VIP Role")
            .setEmoji("👑")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("wl_resethwid_btn")
            .setLabel("Reset HWID")
            .setEmoji("⚙️")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("wl_stats_btn")
            .setLabel("Get Stats")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

async function resolveVipRole(guild, settings, config, saveConfig) {
    if (!guild) return null;
    let targetRoleId = settings.vipRoleId || settings.buyerRoleId;
    if (targetRoleId) {
        const existing = guild.roles.cache.get(targetRoleId);
        if (existing) return targetRoleId;
    }

    // ถ้ายังไม่มี หรือหาไม่เจอใน cache ให้ลอง fetch guild roles
    try {
        if (guild.roles.cache.size <= 2) {
            await guild.roles.fetch().catch(() => {});
        }
    } catch (_) {}

    // ค้นหายศ VIP / Buyer ในเซิร์ฟเวอร์
    const autoRole = guild.roles.cache.find(r => {
        const n = r.name.trim().toLowerCase();
        return n === "vip" || n === "buyer" || n === "kraken vip" || n === "krakenhub vip" || n.includes("vip") || n.includes("buyer");
    });

    if (autoRole) {
        settings.vipRoleId = autoRole.id;
        settings.buyerRoleId = autoRole.id;
        saveSettings(guild.id, settings, config, saveConfig);
        return autoRole.id;
    }

    return targetRoleId || null;
}

async function sendWhitelistLog(client, guild, settings, embed) {
    if (!guild) return;
    let targetChannel = null;

    if (settings?.logChannelId) {
        targetChannel = guild.channels.cache.get(settings.logChannelId) ||
            await guild.channels.fetch(settings.logChannelId).catch(() => null);
    }

    if (!targetChannel) {
        targetChannel = guild.channels.cache.find(c =>
            c.isTextBased?.() && (
                c.name.includes("key-log") ||
                c.name.includes("whitelist-log") ||
                c.name.includes("คีย์") ||
                c.name.includes("log-key") ||
                c.name.includes("whitelist") ||
                c.name.includes("log")
            )
        );

        if (!targetChannel) {
            try {
                const fetched = await guild.channels.fetch().catch(() => null);
                if (fetched) {
                    targetChannel = fetched.find(c =>
                        c && c.isTextBased?.() && (
                            c.name.includes("key-log") ||
                            c.name.includes("whitelist-log") ||
                            c.name.includes("คีย์") ||
                            c.name.includes("log-key") ||
                            c.name.includes("whitelist") ||
                            c.name.includes("log")
                        )
                    );
                }
            } catch (_) {}
        }

        if (targetChannel && (!settings.logChannelId || settings.logChannelId !== targetChannel.id)) {
            settings.logChannelId = targetChannel.id;
            saveSettings(guild.id, settings);
        }
    }

    if (targetChannel && targetChannel.isTextBased?.() && targetChannel.send) {
        try {
            await targetChannel.send({ embeds: [embed] });
        } catch (err) {
            console.log("[WHITELIST LOG ERROR]", err.message);
        }
    }
}

// ฟังก์ชั่นส่ง Log สำหรับคนที่รีดีมคีย์ไม่ผ่าน
async function sendFailedRedeemLog(client, guild, settings, user, attemptedKey, reason) {
    if (!guild) return;
    const failEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("❌ บันทึกการเปิดใช้งานคีย์ไม่สำเร็จ (Redeem Failed)")
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: "👤 สมาชิก (User)", value: `${user} (\`${user.tag}\`)`, inline: true },
            { name: "🆔 Discord ID", value: `\`${user.id}\``, inline: true },
            { name: "🔑 คีย์ที่กรอก (Attempted Key)", value: `\`${attemptedKey ? attemptedKey.slice(0, 45) : "ไม่ได้ระบุ"}\``, inline: true },
            { name: "⚠️ สาเหตุที่ไม่ผ่าน (Reason)", value: reason, inline: false },
            { name: "🕒 เวลาที่พยายาม (Attempted At)", value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false }
        )
        .setFooter({ text: "KrakenHub Whitelist Security • Failed Logger", iconURL: client?.user?.displayAvatarURL?.() })
        .setTimestamp();

    await sendWhitelistLog(client, guild, settings, failEmbed).catch(() => {});
}

async function handleWhitelistInteraction(interaction, config, saveConfig) {
    if (!interaction.guild) return;
    const settings = getSettings(config, interaction.guildId);

    // ==================== 1. REDEEM BUTTON -> MODAL ====================
    if (interaction.isButton() && interaction.customId === "wl_redeem_btn") {
        const modal = new ModalBuilder()
            .setCustomId("wl_modal_redeem")
            .setTitle("🔑 รีดึมคีย์ KrakenHub");

        const keyInput = new TextInputBuilder()
            .setCustomId("key_input")
            .setLabel("กรอกคีย์ของคุณ:")
            .setPlaceholder("เช่น KRAKEN-XXXX-XXXX-XXXX หรือ Platoboost Key")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
        return interaction.showModal(modal);
    }

    // ==================== 2. MODAL SUBMIT (REDEEM) ====================
    if (interaction.isModalSubmit() && interaction.customId === "wl_modal_redeem") {
        await interaction.deferReply({ ephemeral: true });
        const inputKey = interaction.fields.getTextInputValue("key_input").trim();
        const users = loadJSON(USERS_FILE, {});
        const keys = loadJSON(KEYS_FILE, []);

        // ตรวจสอบคีย์ใน database
        let foundKeyIndex = keys.findIndex(k => k.key === inputKey || k.key.toUpperCase() === inputKey.toUpperCase());
        let keyInfo = foundKeyIndex !== -1 ? keys[foundKeyIndex] : null;

        // ถ้าไม่มีในระบบ และไม่ตรงกับรูปแบบคีย์
        if (!keyInfo) {
            // เช็คว่ามีคีย์รูปแบบ Platoboost / Luarmor / KRAKEN หรือไม่
            const isCustomValid = inputKey.length >= 8 && (inputKey.startsWith("KRAKEN-") || inputKey.includes("-"));
            if (isCustomValid) {
                keyInfo = {
                    key: inputKey,
                    durationDays: 30,
                    createdAt: Date.now(),
                    used: false
                };
            }
        }

        // กรณีไม่พบคีย์ในระบบเลย
        if (!keyInfo) {
            const failReason = "❌ ไม่พบคีย์นี้ในระบบ หรือรูปแบบคีย์ไม่ถูกต้อง";
            await sendFailedRedeemLog(interaction.client, interaction.guild, settings, interaction.user, inputKey, failReason);
            return interaction.editReply({
                content: failReason + "\n💡 กรุณาตรวจสอบรหัสคีย์ที่ได้รับจากทางร้าน หรือติดต่อแอดมินเพื่อขอความช่วยเหลือ"
            });
        }

        // กรณีคีย์ถูกใช้งานไปแล้ว
        if (keyInfo.used) {
            if (keyInfo.discordId === interaction.user.id) {
                return interaction.editReply({
                    content: `ℹ️ คุณได้ทำการเปิดใช้งานคีย์นี้ไปแล้วครับ!\n🔑 **คีย์ของคุณ**: \`${keyInfo.key}\`\n💡 สามารถกดปุ่ม **Get Script** เพื่อรับโค้ดสคริปต์ หรือกด **Get VIP Role** เพื่อรับยศได้เลยครับ`
                });
            } else if (keyInfo.createdBy === interaction.user.id) {
                // ผู้สร้างคีย์ (แอดมิน) นำคีย์มาเคลมเป็นของตนเอง
                keyInfo.discordId = interaction.user.id;
            } else {
                const failReason = `⚠️ คีย์นี้ถูกใช้งานไปแล้วโดยผู้ใช้อื่น (<@${keyInfo.discordId || "Unknown"}>)`;
                await sendFailedRedeemLog(interaction.client, interaction.guild, settings, interaction.user, inputKey, failReason);
                return interaction.editReply({
                    content: "❌ คีย์นี้ถูกใช้งานไปแล้วโดยผู้ใช้อื่น! หากต้องการความช่วยเหลือกรุณาเปิด Ticket ติดต่อทีมงาน"
                });
            }
        }

        // กรณีคีย์หมดอายุ
        if (keyInfo.expiresAt && Date.now() > keyInfo.expiresAt) {
            const failReason = `⏳ คีย์นี้หมดอายุการใช้งานไปแล้วเมื่อ <t:${Math.floor(keyInfo.expiresAt / 1000)}:R>`;
            await sendFailedRedeemLog(interaction.client, interaction.guild, settings, interaction.user, inputKey, failReason);
            return interaction.editReply({
                content: "❌ คีย์นี้หมดอายุการใช้งานแล้ว กรุณาซื้อหรือขอรับคีย์ใหม่"
            });
        }

        const now = Date.now();
        const durationMs = (Number(keyInfo.durationDays) || 30) * 86400 * 1000;
        const expiresAt = now + durationMs;

        users[interaction.user.id] = {
            discordId: interaction.user.id,
            discordTag: interaction.user.tag,
            key: keyInfo.key,
            hwid: users[interaction.user.id]?.hwid || null,
            redeemedAt: now,
            expiresAt: expiresAt,
            lastResetHwidAt: users[interaction.user.id]?.lastResetHwidAt || 0,
            active: true
        };

        if (foundKeyIndex !== -1) {
            keys[foundKeyIndex].used = true;
            keys[foundKeyIndex].discordId = interaction.user.id;
            keys[foundKeyIndex].redeemedAt = now;
        } else {
            keyInfo.used = true;
            keyInfo.discordId = interaction.user.id;
            keyInfo.redeemedAt = now;
            keys.push(keyInfo);
        }
        saveJSON(KEYS_FILE, keys);
        saveJSON(USERS_FILE, users);

        // ค้นหาและตั้งค่ายศ VIP / Buyer อัตโนมัติถ้ายังไม่ได้เซ็ต
        let targetRoleId = await resolveVipRole(interaction.guild, settings, config, saveConfig);

        // มอบยศ VIP ให้สมาชิก
        let roleMsg = "";
        let roleName = "ไม่ได้ตั้งค่ายศ";
        if (targetRoleId) {
            roleName = `<@&${targetRoleId}>`;
            try {
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member) {
                    if (!member.roles.cache.has(targetRoleId)) {
                        await member.roles.add(targetRoleId);
                        roleMsg = `\n👑 เพิ่มยศ <@&${targetRoleId}> ให้เรียบร้อยแล้ว`;
                    } else {
                        roleMsg = `\n👑 คุณมียศ <@&${targetRoleId}> อยู่แล้ว`;
                    }
                }
            } catch (err) {
                console.log("[WHITELIST VIP ROLE ERROR]", err.message);
                roleMsg = `\n⚠️ ไม่สามารถเพิ่มยศ VIP ได้โดยอัตโนมัติ (กรุณาให้แอดมินลาก Role ของบอทให้อยู่สูงกว่า Role VIP)`;
            }
        }

        // ส่ง Log การใช้คีย์สำเร็จ
        const durationText = (Number(keyInfo.durationDays) || 30) >= 3650 ? "ตลอดชีพ (Lifetime)" : `${Number(keyInfo.durationDays) || 30} วัน`;
        const logEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("🔑 บันทึกการเปิดใช้งานคีย์ (Key Redeemed)")
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: "👤 สมาชิก (User)", value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: "🆔 Discord ID", value: `\`${interaction.user.id}\``, inline: true },
                { name: "🔑 คีย์ (Key)", value: `||${keyInfo.key}||`, inline: true },
                { name: "⏳ ระยะเวลา (Duration)", value: durationText, inline: true },
                { name: "📅 วันหมดอายุ (Expires)", value: `<t:${Math.floor(expiresAt / 1000)}:F>\n(<t:${Math.floor(expiresAt / 1000)}:R>)`, inline: true },
                { name: "🏷️ ยศที่ได้รับ (Role)", value: roleName, inline: true },
                { name: "💻 สถานะ HWID", value: "ยังไม่ผูกเครื่อง (จะผูกอัตโนมัติเมื่อรันในเกม)", inline: false }
            )
            .setFooter({ text: "KrakenHub Whitelist Security • Logger", iconURL: interaction.client?.user?.displayAvatarURL?.() })
            .setTimestamp();

        sendWhitelistLog(interaction.client, interaction.guild, settings, logEmbed).catch(() => {});

        const successEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("✅ รีดึมคีย์สำเร็จแล้ว!")
            .setDescription(
                `ยินดีต้อนรับสู่ **KrakenHub Script** 👋\n\n` +
                `🔑 **คีย์ของคุณ:** \`${keyInfo.key}\`\n` +
                `⏳ **วันหมดอายุ:** <t:${Math.floor(expiresAt / 1000)}:F> (<t:${Math.floor(expiresAt / 1000)}:R>)\n` +
                `💡 กดปุ่ม **Get Script** ด้านล่างเพื่อรับโค้ด Loader นำไปรันในเกมได้ทันที${roleMsg}`
            )
            .setFooter({ text: "KrakenHub Whitelist System" })
            .setTimestamp();

        return interaction.editReply({ embeds: [successEmbed] });
    }

    // ==================== 3. GET SCRIPT BUTTON ====================
    if (interaction.isButton() && interaction.customId === "wl_getscript_btn") {
        await interaction.deferReply({ ephemeral: true });
        const users = loadJSON(USERS_FILE, {});
        const user = users[interaction.user.id];

        if (!user || !user.active) {
            return interaction.editReply({
                content: "❌ คุณยังไม่ได้ทำการรีดึมคีย์ กรุณากดปุ่ม **Redeem Key** ก่อนครับ"
            });
        }

        if (user.expiresAt && Date.now() > user.expiresAt) {
            return interaction.editReply({
                content: `⚠️ คีย์ของคุณหมดอายุไปแล้วเมื่อ <t:${Math.floor(user.expiresAt / 1000)}:R> กรุณาต่ออายุคีย์ใหม่`
            });
        }

        let loaderCode = settings.scriptLoader || 'loadstring(game:HttpGet("https://tinyurl.com/KrakenHubV2"))()';
        if (loaderCode.includes("KrakenHub_Loader.luau")) {
            loaderCode = 'loadstring(game:HttpGet("https://tinyurl.com/KrakenHubV2"))()';
        }
        const executeExample = `-- [ KrakenHub Official Loader ]\n_G.KrakenKey = "${user.key}";\n${loaderCode}`;

        const scriptEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("📥 ตัวสคริปต์ KrakenHub Loader")
            .setDescription(
                "คัดลอกโค้ดด้านล่างนี้ไปรันใน Roblox Executor ของคุณได้เลยครับ:\n\n" +
                "```lua\n" + executeExample + "\n```\n" +
                "📌 **คำแนะนำ:**\n" +
                "• ตัวสคริปต์จะตรวจสอบคีย์และผูก HWID ของคุณโดยอัตโนมัติในการรันครั้งแรก\n" +
                "• หากเปลี่ยนคอมพิวเตอร์ สามารถกด **Reset HWID** บนเมนูได้"
            )
            .setFooter({ text: "KrakenHub • Keep your key safe" })
            .setTimestamp();

        return interaction.editReply({ embeds: [scriptEmbed] });
    }

    // ==================== 4. GET ROLE BUTTON ====================
    if (interaction.isButton() && interaction.customId === "wl_getrole_btn") {
        await interaction.deferReply({ ephemeral: true });
        const users = loadJSON(USERS_FILE, {});
        const user = users[interaction.user.id];

        if (!user || !user.active) {
            return interaction.editReply({
                content: "❌ ไม่พบคีย์ที่เปิดใช้งานของบัญชีนี้ กรุณากด **Redeem Key** ก่อนครับ"
            });
        }

        if (user.expiresAt && Date.now() > user.expiresAt) {
            return interaction.editReply({
                content: "⚠️ คีย์ของคุณหมดอายุแล้ว ไม่สามารถรับยศได้"
            });
        }

        let targetRoleId = await resolveVipRole(interaction.guild, settings, config, saveConfig);

        if (!targetRoleId) {
            return interaction.editReply({
                content: "ℹ️ แอดมินยังไม่ได้ตั้งค่ายศ VIP สำหรับเซิร์ฟเวอร์นี้ (ให้แอดมินใช้ `/whitelist role` หรือ `/whitelist vip` เพื่อตั้งค่า)"
            });
        }

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (member.roles.cache.has(targetRoleId)) {
                return interaction.editReply({
                    content: `✅ คุณมียศ <@&${targetRoleId}> อยู่แล้วครับ`
                });
            }
            await member.roles.add(targetRoleId);
            return interaction.editReply({
                content: `🎉 เพิ่มยศ <@&${targetRoleId}> ให้เรียบร้อยแล้ว!`
            });
        } catch (err) {
            return interaction.editReply({
                content: "❌ เพิ่มยศไม่สำเร็จ กรุณาแจ้งแอดมินให้ตรวจสอบตำแหน่ง Role ของบอท: " + err.message
            });
        }
    }

    // ==================== 5. RESET HWID BUTTON ====================
    if (interaction.isButton() && interaction.customId === "wl_resethwid_btn") {
        await interaction.deferReply({ ephemeral: true });
        const users = loadJSON(USERS_FILE, {});
        const user = users[interaction.user.id];

        if (!user || !user.active) {
            return interaction.editReply({
                content: "❌ คุณยังไม่มีคีย์ที่ผูกกับบัญชีนี้ กรุณารีดึมคีย์ก่อนครับ"
            });
        }

        const cooldownHours = Number(settings.resetHwidCooldownHours) || 24;
        const cooldownMs = cooldownHours * 3600 * 1000;
        const lastReset = user.lastResetHwidAt || 0;
        const diff = Date.now() - lastReset;

        if (diff < cooldownMs) {
            const availableAt = Math.floor((lastReset + cooldownMs) / 1000);
            return interaction.editReply({
                content: `⏳ คุณเพิ่งรีเซ็ต HWID ไป กรุณารออีก <t:${availableAt}:R> (รีเซ็ตได้ทุกๆ ${cooldownHours} ชั่วโมง)`
            });
        }

        user.hwid = null;
        user.lastResetHwidAt = Date.now();
        users[interaction.user.id] = user;
        saveJSON(USERS_FILE, users);

        const availableAt = Math.floor((Date.now() + cooldownMs) / 1000);
        const hwidLogEmbed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle("🔄 มีการรีเซ็ต HWID (HWID Reset)")
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: "👤 สมาชิก (User)", value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: "🆔 Discord ID", value: `\`${interaction.user.id}\``, inline: true },
                { name: "🔑 คีย์ (Key)", value: `||${user.key}||`, inline: true },
                { name: "⏳ คูลดาวน์ครั้งถัดไป (Next Reset)", value: `<t:${availableAt}:R> (${cooldownHours} ชม.)`, inline: true },
                { name: "💻 สถานะ HWID", value: "ปลดล็อคเครื่องเดิมแล้ว พร้อมผูกเครื่องใหม่ในเกม", inline: false }
            )
            .setFooter({ text: "KrakenHub Whitelist Security • HWID Logger", iconURL: interaction.client?.user?.displayAvatarURL?.() })
            .setTimestamp();

        sendWhitelistLog(interaction.client, interaction.guild, settings, hwidLogEmbed).catch(() => {});

        const resetEmbed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle("🔄 รีเซ็ต HWID สำเร็จแล้ว!")
            .setDescription(
                "ระบบได้ทำการปลดล็อคเครื่องเดิมเรียบร้อยแล้ว\n\n" +
                "💻 เมื่อคุณนำสคริปต์ไปรันบนคอมพิวเตอร์หรือ VPS เครื่องใหม่ ระบบจะทำการผูก HWID ใหม่ให้อัตโนมัติทันทีครับ"
            )
            .setFooter({ text: "KrakenHub HWID Security" })
            .setTimestamp();

        return interaction.editReply({ embeds: [resetEmbed] });
    }

    // ==================== 6. GET STATS BUTTON ====================
    if (interaction.isButton() && interaction.customId === "wl_stats_btn") {
        await interaction.deferReply({ ephemeral: true });
        const users = loadJSON(USERS_FILE, {});
        const user = users[interaction.user.id];

        if (!user || !user.active) {
            return interaction.editReply({
                content: "ℹ️ บัญชีของคุณยังไม่มีข้อมูลคีย์ในระบบ กรุณากด **Redeem Key** เพื่อเริ่มต้นใช้งาน"
            });
        }

        const isExpired = user.expiresAt && Date.now() > user.expiresAt;
        const statusEmoji = isExpired ? "🔴 หมดอายุ" : "🟢 ใช้งานได้";
        const maskedKey = user.key ? user.key.slice(0, 4) + "****-****-" + user.key.slice(-4) : "ไม่ระบุ";

        const statsEmbed = new EmbedBuilder()
            .setColor(isExpired ? 0xED4245 : 0x5865F2)
            .setTitle("📊 ข้อมูลและสถานะคีย์ของคุณ")
            .addFields(
                { name: "👤 สมาชิก", value: `<@${interaction.user.id}>`, inline: true },
                { name: "⚡ สถานะ", value: statusEmoji, inline: true },
                { name: "🔑 คีย์", value: `\`${maskedKey}\``, inline: true },
                { name: "💻 สถานะ HWID", value: user.hwid ? "🔒 ผูกเครื่องแล้ว" : "🔓 ยังไม่ผูกเครื่อง (พร้อมผูก)", inline: true },
                { name: "📅 วันที่รีดึม", value: `<t:${Math.floor(user.redeemedAt / 1000)}:f>`, inline: true },
                { name: "⏳ วันหมดอายุ", value: user.expiresAt ? `<t:${Math.floor(user.expiresAt / 1000)}:R>` : "ตลอดชีพ", inline: true }
            )
            .setFooter({ text: "KrakenHub Member Stats" })
            .setTimestamp();

        return interaction.editReply({ embeds: [statsEmbed] });
    }
}

module.exports = {
    getSettings,
    saveSettings,
    makeWhitelistPanel,
    handleWhitelistInteraction,
    sendWhitelistLog,
    sendFailedRedeemLog,
    loadJSON,
    saveJSON,
    USERS_FILE,
    KEYS_FILE,
    SETTINGS_FILE
};
