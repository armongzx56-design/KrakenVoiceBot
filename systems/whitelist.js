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

function ensureFile(f, def = "{}") {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(f)) fs.writeFileSync(f, def, "utf8");
}

ensureFile(USERS_FILE, "{}");
ensureFile(KEYS_FILE, "[]");
ensureFile(HWID_LOGS_FILE, "{}");

function loadJSON(f, def = {}) {
    try {
        return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
        return def;
    }
}

function saveJSON(f, data) {
    fs.writeFileSync(f, JSON.stringify(data, null, 2), "utf8");
}

function getSettings(config, guildId) {
    config[guildId] ??= {};
    config[guildId].whitelist ??= {
        enabled: true,
        panelTitle: "KrakenHub | Script Whitelist",
        panelDesc:
            "🔑 **Redeem Key** | เอาคีย์ที่สั่งซื้อหรือรับมา รีดึมแล้วกดยืนยันได้เลย\n" +
            "📥 **Get Script** | รับตัวสคริปต์ Loader สำหรับนำไปรันในเกม\n" +
            "👤 **Get Role** | รับยศ Buyer ประจำเซิร์ฟเวอร์\n" +
            "🔄 **Reset HWID** | รีเซ็ต HWID กรณีเปลี่ยนคอมพิวเตอร์หรือ VPS\n" +
            "📊 **Get Stats** | ตรวจสอบสถานะคีย์และวันหมดอายุการใช้งาน",
        scriptLoader: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/armongzx56-design/KrakenHub/main/KrakenHub_Loader.luau"))()',
        buyerRoleId: null,
        logChannelId: null,
        resetHwidCooldownHours: 24,
        allowUserHwidReset: true
    };
    return config[guildId].whitelist;
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
            .setLabel("Get Role")
            .setEmoji("👤")
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

        // ตรวจสอบคีย์ใน local database
        let foundKeyIndex = keys.findIndex(k => k.key === inputKey || k.key.toUpperCase() === inputKey.toUpperCase());
        let keyInfo = foundKeyIndex !== -1 ? keys[foundKeyIndex] : null;

        // ถ้าไม่มีในระบบ local ให้รองรับ Platoboost format หรือสร้าง record อัตโนมัติหากตั้งค่า
        if (!keyInfo) {
            // ถ้าระบบอนุญาตคีย์ Platoboost / Luarmor
            const isCustomValid = inputKey.length >= 8;
            if (isCustomValid) {
                keyInfo = {
                    key: inputKey,
                    durationDays: 30, // ค่าเริ่มต้น 30 วันถ้าไม่มีในระบบ
                    createdAt: Date.now(),
                    used: false
                };
            }
        }

        if (!keyInfo) {
            return interaction.editReply({
                content: "❌ ไม่พบคีย์นี้ในระบบ หรือรูปแบบคีย์ไม่ถูกต้อง กรุณาติดต่อแอดมินหรือตรวจสอบอีกครั้ง"
            });
        }

        if (keyInfo.used && keyInfo.discordId !== interaction.user.id) {
            return interaction.editReply({
                content: "❌ คีย์นี้ถูกใช้งานไปแล้วโดยผู้ใช้อื่น!"
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
            saveJSON(KEYS_FILE, keys);
        }
        saveJSON(USERS_FILE, users);

        // ให้ยศ Buyer อัตโนมัติถ้าตั้งค่าไว้
        let roleMsg = "";
        if (settings.buyerRoleId) {
            try {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                if (member && !member.roles.cache.has(settings.buyerRoleId)) {
                    await member.roles.add(settings.buyerRoleId);
                    roleMsg = "\n🎖️ เพิ่มยศ <@&" + settings.buyerRoleId + "> ให้เรียบร้อยแล้ว";
                }
            } catch (err) {
                console.log("[WHITELIST ROLE ERROR]", err.message);
            }
        }

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

        const loaderCode = settings.scriptLoader || 'loadstring(game:HttpGet("https://raw.githubusercontent.com/armongzx56-design/KrakenHub/main/KrakenHub_Loader.luau"))()';
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

        if (!settings.buyerRoleId) {
            return interaction.editReply({
                content: "ℹ️ แอดมินยังไม่ได้ตั้งค่ายศ Buyer สำหรับเซิร์ฟเวอร์นี้ (ให้แอดมินใช้ `/whitelist role` เพื่อตั้งค่า)"
            });
        }

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (member.roles.cache.has(settings.buyerRoleId)) {
                return interaction.editReply({
                    content: "✅ คุณมียศ <@&" + settings.buyerRoleId + "> อยู่แล้วครับ"
                });
            }
            await member.roles.add(settings.buyerRoleId);
            return interaction.editReply({
                content: "🎉 เพิ่มยศ <@&" + settings.buyerRoleId + "> ให้เรียบร้อยแล้ว!"
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
    makeWhitelistPanel,
    handleWhitelistInteraction,
    loadJSON,
    saveJSON,
    USERS_FILE,
    KEYS_FILE
};
