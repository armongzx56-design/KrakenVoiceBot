const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    AttachmentBuilder,
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const MAPS_FILE = path.join(DATA_DIR, "scripthub_maps.json");
const PANELS_FILE = path.join(DATA_DIR, "scripthub_panels.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// เอฟเฟคเคลื่อนไหว (Animated Emojis ประจำบ็อต)
const ANIMATED = {
    glitch: "<a:312312:1570844178684846211>",
    leftWing: "<a:633625leftangleallwhitewing:1569102297487773696>",
    rightWing: "<a:602393rightangleallwhitewing:1569102295738884217>",
    arrow: "<a:998057pinkarrow:1569102319105089637>",
    sparkle: "<a:2659tadapurple:1569102206798397571>",
    coin: "<a:933416goldenspincoin:1569102317305860226>",
    catPaw: "<a:785173catpaw:1569102307155779649>",
    redCard: "<a:22247redcard:1569102233981685840>",
    fire: "<a:1310107692995706900:1570844182317113364>"
};

function setOptionEmoji(opt, emojiStr) {
    if (!emojiStr) return opt.setEmoji("🎮");
    const mAnim = emojiStr.match(/<a:([^:]+):(\d+)>/);
    if (mAnim) return opt.setEmoji({ name: mAnim[1], id: mAnim[2], animated: true });
    const mStatic = emojiStr.match(/<:([^:]+):(\d+)>/);
    if (mStatic) return opt.setEmoji({ name: mStatic[1], id: mStatic[2], animated: false });
    try {
        return opt.setEmoji(emojiStr);
    } catch {
        return opt.setEmoji("🎮");
    }
}

// ข้อมูลแมพเริ่มต้น (ใช้เป็นฐานข้อมูลเริ่มต้นเมื่อยังไม่มีไฟล์)
const DEFAULT_MAPS = {
    mahanakhon: {
        id: "mahanakhon",
        name: "MAHANAKHON RACING",
        title: "แมพ MAHANAKHON RACING",
        emoji: "<a:933416goldenspincoin:1569102317305860226>",
        description: "สคริปต์แมพมหานคร เรซซิ่ง (ออโต้ฟาร์ม, จูนรถ, วาร์ปส่งของ)",
        imagePath: path.join(ASSETS_DIR, "mahanakhon_cover.jpg"),
        imageUrl: null,
        script: 'loadstring(game:HttpGet("https://gist.githubusercontent.com/MacHub09/76ea573e3e472a8854d4f2dea5944d01/raw/c2175ee3808e846c9baa6c96c5e2a19a2b7e194b/Loaders"))()'
    },
    sailueat: {
        id: "sailueat",
        name: "SAI LUEAT ARCHIWA",
        title: "แมพ SAI LUEAT ARCHIWA (สายเลือดอาชีวะ)",
        emoji: "<a:22247redcard:1569102233981685840>",
        description: "สคริปต์แมพสายเลือดอาชีวะ (Aimbot, Hitbox, Silent Aim, Auto Farm)",
        imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
        imageUrl: null,
        script: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/KrakenHub/sailueat/main/loader.lua"))()'
    },
    voxel: {
        id: "voxel",
        name: "VOXEL WARS",
        title: "แมพ VOXEL WARS",
        emoji: "<a:312312:1570844178684846211>",
        description: "สคริปต์แมพว็อกเซล วอร์ส (Silent Aim, ESP, God Mode)",
        imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
        imageUrl: null,
        script: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/KrakenHub/voxel/main/loader.lua"))()'
    }
};

let cachedMaps = null;

function loadMaps() {
    try {
        if (!fs.existsSync(MAPS_FILE)) {
            fs.writeFileSync(MAPS_FILE, JSON.stringify(DEFAULT_MAPS, null, 2), "utf8");
            cachedMaps = JSON.parse(JSON.stringify(DEFAULT_MAPS));
            return cachedMaps;
        }
        const raw = fs.readFileSync(MAPS_FILE, "utf8");
        const data = JSON.parse(raw);
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
            cachedMaps = data;
            return cachedMaps;
        }
        cachedMaps = JSON.parse(JSON.stringify(DEFAULT_MAPS));
        return cachedMaps;
    } catch (e) {
        console.error("[SCRIPTHUB LOAD MAPS ERR]", e.message);
        return cachedMaps || JSON.parse(JSON.stringify(DEFAULT_MAPS));
    }
}

function saveMaps(maps) {
    try {
        cachedMaps = maps;
        fs.writeFileSync(MAPS_FILE, JSON.stringify(maps, null, 2), "utf8");
    } catch (e) {
        console.error("[SCRIPTHUB SAVE MAPS ERR]", e.message);
    }
}

// ระบบจดจำข้อความที่ส่งไปในห้องดิสคอร์ด เพื่ออัปเดตแบบ Realtime
function loadPanels() {
    try {
        if (!fs.existsSync(PANELS_FILE)) return [];
        return JSON.parse(fs.readFileSync(PANELS_FILE, "utf8")) || [];
    } catch {
        return [];
    }
}

function savePanels(panels) {
    try {
        fs.writeFileSync(PANELS_FILE, JSON.stringify(panels, null, 2), "utf8");
    } catch (e) {
        console.error("[SCRIPTHUB SAVE PANELS ERR]", e.message);
    }
}

function registerPanel(channelId, messageId, mode) {
    const panels = loadPanels();
    const existing = panels.find(p => p.messageId === messageId);
    if (!existing) {
        panels.push({ channelId, messageId, mode, createdAt: Date.now() });
        savePanels(panels);
    }
}

/**
 * ฟังก์ชันอัปเดตข้อความใน Discord ทุกห้องแบบ Realtime ทันทีเมื่อมีการแก้ไข
 */
async function updateAllLivePanels(client) {
    if (!client) return 0;
    const panels = loadPanels();
    const maps = loadMaps();
    const validPanels = [];
    let updatedCount = 0;

    for (const p of panels) {
        try {
            const channel = client.channels.cache.get(p.channelId) || await client.channels.fetch(p.channelId).catch(() => null);
            if (!channel || !channel.isTextBased?.()) continue;

            const msg = await channel.messages.fetch(p.messageId).catch(() => null);
            if (!msg) continue;

            if (p.mode === "hub") {
                const hub = makeHubPanel(maps);
                await msg.edit({
                    content: null, // ลบข้อความตัวหนังสือนอก Embed ที่ซ้ำซ้อนออกถาวร
                    embeds: hub.embeds,
                    files: hub.files,
                    components: hub.components
                });
                validPanels.push(p);
                updatedCount++;
            } else if (maps[p.mode]) {
                const panel = makeMapDeliveryPanel(p.mode, false);
                await msg.edit({
                    content: null,
                    embeds: panel.embeds,
                    files: panel.files,
                    components: panel.components
                });
                validPanels.push(p);
                updatedCount++;
            }
        } catch (err) {
            console.error(`[SCRIPTHUB REALTIME EDIT ERR ${p.messageId}]:`, err.message);
        }
    }

    savePanels(validPanels);
    return updatedCount;
}

async function downloadAndSaveImage(url, destPath) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(destPath, buffer);
        return true;
    } catch (err) {
        console.error("[SCRIPTHUB DOWNLOAD IMAGE ERR]", err.message);
        return false;
    }
}

/**
 * 1. แผงเลือกแมพหลัก: KRAKEN HUB SCRIPT COLLECTION + Dropdown Menu (ขอบแดง + เอฟเฟคเคลื่อนไหว)
 */
function makeHubPanel(maps = null) {
    maps ??= loadMaps();
    const mapList = Object.values(maps);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("scripthub_select_map")
        .setPlaceholder("🔍 แตะที่นี่เพื่อเลื่อนเลือกแมพ...")
        .addOptions(
            mapList.map(m => {
                const opt = new StringSelectMenuOptionBuilder()
                    .setLabel((m.name || m.id).slice(0, 100))
                    .setDescription((m.description || `สคริปต์แมพ ${m.name || m.id}`).slice(0, 100))
                    .setValue(m.id);
                setOptionEmoji(opt, m.emoji || ANIMATED.glitch);
                return opt;
            })
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const resetRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("scripthub_reset_menu")
            .setLabel("รีเซ็ตเมนู / ล้างการเลือก")
            .setEmoji(ANIMATED.glitch)
            .setStyle(ButtonStyle.Secondary)
    );

    const hubImagePath = path.join(ASSETS_DIR, "krakenhub_hub.jpg");
    const files = [];
    const embed = new EmbedBuilder()
        .setColor(0xED4245) // ขอบ Embed สีแดง
        .setTitle(`${ANIMATED.leftWing} KRAKEN HUB | SCRIPT COLLECTION ${ANIMATED.rightWing}`)
        .setDescription(`${ANIMATED.arrow} **กรุณาเลื่อนเลือกแมพที่ต้องการรับสคริปต์ด้านล่างนี้:**`);

    if (fs.existsSync(hubImagePath)) {
        files.push(new AttachmentBuilder(hubImagePath, { name: "hub.jpg" }));
        embed.setImage("attachment://hub.jpg");
    }

    return {
        content: null, // ป้องกันข้อความซ้ำซ้อนเหนือ Embed
        embeds: [embed],
        files: files,
        components: [row, resetRow]
    };
}

/**
 * 2. หน้ารับสคริปต์ของแต่ละแมพ: ข้อความตัวใหญ่ + ปกรูปเกม + ปุ่มคัดลอก (ขอบแดง + เอฟเฟคเคลื่อนไหว)
 */
function makeMapDeliveryPanel(mapId, showBackBtn = true) {
    const maps = loadMaps();
    const map = maps[mapId] || maps.mahanakhon || Object.values(maps)[0];
    if (!map) return null;

    const buttons = [
        new ButtonBuilder()
            .setCustomId(`scripthub_copy_${map.id}`)
            .setLabel("คัดลอกสคริปต์")
            .setEmoji(ANIMATED.coin)
            .setStyle(ButtonStyle.Primary)
    ];

    if (showBackBtn) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId("scripthub_back_to_hub")
                .setLabel("ย้อนกลับ / เลือกแมพอื่น")
                .setEmoji(ANIMATED.arrow)
                .setStyle(ButtonStyle.Secondary)
        );
    }

    const row = new ActionRowBuilder().addComponents(buttons);

    const embed = new EmbedBuilder()
        .setColor(0xED4245) // ขอบ Embed สีแดง
        .setTitle(`${ANIMATED.leftWing} ${map.title || "แมพ " + (map.name || map.id)} ${ANIMATED.rightWing}`)
        .setDescription(`${ANIMATED.arrow} **กดปุ่มด้านล่างเพื่อคัดลอกโค้ดสคริปต์ไปใช้งานได้ทันที:**`);

    const files = [];

    // ป้องกันรูปภาพขึ้นซ้ำซ้อน 2 รูป (ให้รูปไปอยู่ใน Embed เท่านั้น ไม่โชว์ไฟล์แนบลอยด้านบน)
    if (map.imagePath && fs.existsSync(map.imagePath)) {
        files.push(new AttachmentBuilder(map.imagePath, { name: "cover.jpg" }));
        embed.setImage("attachment://cover.jpg");
    } else if (map.imageUrl) {
        embed.setImage(map.imageUrl);
    } else {
        const defaultCover = path.join(ASSETS_DIR, "mahanakhon_cover.jpg");
        if (fs.existsSync(defaultCover)) {
            files.push(new AttachmentBuilder(defaultCover, { name: "cover.jpg" }));
            embed.setImage("attachment://cover.jpg");
        }
    }

    return {
        content: null,
        embeds: [embed],
        files: files,
        components: [row]
    };
}

/**
 * 3. แผงควบคุมระบบหลังบ้านแบบ Interactive Control Dashboard
 */
function makeAdminDashboard(maps = null) {
    maps ??= loadMaps();

    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`${ANIMATED.glitch} KRAKENHUB | แผงควบคุมระบบแจกสคริปต์ (Realtime Sync)`)
        .setDescription(
            `${ANIMATED.arrow} ศูนย์ควบคุมระบบแจกสคริปต์และแก้ไขข้อมูลแมพแบบเรียลไทม์\n` +
            `ทุกการแก้ไขจะถูกเซฟและอัปเดตลงแผงในห้อง Discord ทันทีโดยไม่ต้องรีบ็อต:`
        )
        .setTimestamp();

    for (const [id, m] of Object.entries(maps)) {
        const hasImg = (m.imagePath && fs.existsSync(m.imagePath)) || m.imageUrl;
        embed.addFields({
            name: `${m.emoji || ANIMATED.glitch} ${m.name || id} (\`ID: ${id}\`)`,
            value: `• **หัวข้อ:** ${m.title || m.name || id}\n• **คำอธิบาย:** ${m.description || "-"}\n• **รูปปก:** ${hasImg ? "✅ มีรูปปก" : "❌ ไม่มีรูป"}\n• **โค้ดสคริปต์:** \`${(m.script || "").slice(0, 50)}...\``,
            inline: false
        });
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("scripthub_admin_send_hub")
            .setLabel("ส่งแผงเลือกแมพรวม (Hub)")
            .setEmoji(ANIMATED.glitch)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("scripthub_admin_send_mhnk")
            .setLabel("ส่งโพสต์แมพ Mahanakhon")
            .setEmoji(ANIMATED.coin)
            .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("scripthub_admin_open_add")
            .setLabel("เพิ่มแมพใหม่")
            .setEmoji(ANIMATED.sparkle)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("scripthub_admin_open_edit")
            .setLabel("แก้ไขสคริปต์")
            .setEmoji(ANIMATED.arrow)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("scripthub_admin_open_desc")
            .setLabel("แก้ไขคำอธิบาย")
            .setEmoji(ANIMATED.catPaw)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("scripthub_admin_refresh")
            .setLabel("รีเฟรช")
            .setEmoji(ANIMATED.glitch)
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

/**
 * 4. ตัวประมวลผล Autocomplete แบบ Realtime
 */
async function handleScriptHubAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const maps = loadMaps();
    const query = (focused.value || "").toLowerCase().trim();

    if (focused.name === "map") {
        const choices = Object.values(maps)
            .filter(m => (m.name && m.name.toLowerCase().includes(query)) || m.id.toLowerCase().includes(query))
            .slice(0, 25)
            .map(m => ({
                name: `${m.emoji || "🎮"} ${m.name || m.id} (${m.id})`.slice(0, 100),
                value: m.id
            }));
        return interaction.respond(choices).catch(() => {});
    }

    if (focused.name === "mode") {
        const choices = [
            { name: "🌐 แผงเลือกแมพรวม (Hub Selector - ปกแดง มีตัวเลื่อนเลือกแมพ)", value: "hub" }
        ];

        for (const m of Object.values(maps)) {
            if ((m.name && m.name.toLowerCase().includes(query)) || m.id.toLowerCase().includes(query)) {
                choices.push({
                    name: `${m.emoji || "🎮"} ${m.name || m.id} (เฉพาะแมพนี้ตรงๆ)`.slice(0, 100),
                    value: m.id
                });
            }
        }
        return interaction.respond(choices.slice(0, 25)).catch(() => {});
    }
}

/**
 * 5. ตัวประมวลผล Interaction สำหรับ ScriptHub (Select Menu, Buttons & Modals)
 */
async function handleScriptHubInteraction(interaction) {
    // 5.1 สมาชิกเลือกแมพจาก Dropdown Menu -> ส่งหน้ารับสคริปต์แบบ Ephemeral (เห็นเฉพาะคนที่กดคนเดียว)
    if (interaction.isStringSelectMenu() && interaction.customId === "scripthub_select_map") {
        const selectedId = interaction.values[0];
        const panel = makeMapDeliveryPanel(selectedId, true); // มีปุ่มย้อนกลับให้กดเสมอ

        if (!panel) {
            return interaction.reply({ content: "❌ ไม่พบข้อมูลแมพที่เลือก", ephemeral: true });
        }

        // กรณีเลือกแมพจากในหน้าต่างส่วนตัว (Ephemeral) ที่เคยกดย้อนกลับมา ให้ Update หน้านั้นทันที
        const isEphemeral = interaction.message?.flags?.has(MessageFlags.Ephemeral) || Boolean(interaction.message?.flags?.bitfield & 64);
        if (isEphemeral) {
            return interaction.update({
                content: null,
                embeds: panel.embeds,
                files: panel.files,
                attachments: [],
                components: panel.components
            }).catch(err => console.error("[SCRIPTHUB EPHEMERAL UPDATE ERR]", err.message));
        }

        // กรณีเลือกจากแผงหลักในห้อง: ตอบกลับส่วนตัว (Ephemeral) ให้เฉพาะคนที่กดเห็น
        await interaction.reply({
            content: null,
            embeds: panel.embeds,
            files: panel.files,
            components: panel.components,
            ephemeral: true
        }).catch(err => console.error("[SCRIPTHUB EPHEMERAL REPLY ERR]", err.message));

        // รีเซ็ต Dropdown บนแผงรวมในห้องทันที เพื่อล้างเครื่องหมายถูก (Checkmark) ฝั่ง Discord Client
        // ทำให้สมาชิกไม่ต้องไปกดแมพอื่นก่อน สามารถกดเลือกแมพเดิมซ้ำได้ทันที
        if (interaction.message && interaction.message.editable) {
            try {
                const hub = makeHubPanel();
                await interaction.message.edit({
                    content: null,
                    embeds: hub.embeds,
                    components: hub.components
                });
            } catch (editErr) {
                // ข้ามหากติด discord rate limit
            }
        }
        return;
    }

    // สมาชิกกดปุ่ม "รีเซ็ตเมนู / ล้างการเลือก" เพื่อล้างการเลือกใน Dropdown
    if (interaction.isButton() && interaction.customId === "scripthub_reset_menu") {
        const hubPanel = makeHubPanel();
        return interaction.update({
            content: null,
            embeds: hubPanel.embeds,
            files: hubPanel.files,
            attachments: [],
            components: hubPanel.components
        }).catch(err => console.error("[SCRIPTHUB RESET MENU ERR]", err.message));
    }

    // 5.2 สมาชิกกดปุ่ม "คัดลอกสคริปต์"
    if (interaction.isButton() && interaction.customId.startsWith("scripthub_copy_")) {
        const mapId = interaction.customId.replace("scripthub_copy_", "");
        const maps = loadMaps();
        const map = maps[mapId] || maps.mahanakhon;

        if (!map || !map.script) {
            return interaction.reply({ content: "❌ ไม่พบโค้ดสคริปต์ในระบบ", ephemeral: true });
        }

        return interaction.reply({
            content: `${ANIMATED.sparkle} **คัดลอกโค้ดสคริปต์ ${map.name} สำเร็จ!** ${ANIMATED.glitch}\n${ANIMATED.arrow} *นำโค้ดด้านล่างนี้ไปวางในตัวรันเกม Roblox ได้ทันที:*\n\`\`\`lua\n${map.script}\n\`\`\``,
            ephemeral: true
        });
    }

    // 5.3 สมาชิกกดปุ่ม "ย้อนกลับ / เลือกแมพอื่น" (จากหน้ารับสคริปต์ Ephemeral)
    if (interaction.isButton() && interaction.customId === "scripthub_back_to_hub") {
        const hubPanel = makeHubPanel();
        return interaction.update({
            content: null,
            embeds: hubPanel.embeds,
            files: hubPanel.files,
            attachments: [],
            components: hubPanel.components
        }).catch(err => console.error("[SCRIPTHUB BACK ERR]", err.message));
    }

    // ==================== ADMIN ACTIONS ====================

    if (interaction.isButton() && interaction.customId === "scripthub_admin_send_hub") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบเท่านั้น", ephemeral: true });
        }
        const hubPanel = makeHubPanel();
        const msg = await interaction.channel.send({
            content: null,
            embeds: hubPanel.embeds,
            files: hubPanel.files,
            components: hubPanel.components
        });
        registerPanel(interaction.channelId, msg.id, "hub");
        return interaction.reply({ content: `✅ ส่งแผงเลือกแมพรวมลงในห้องนี้และลงทะเบียนซิงก์ Realtime เรียบร้อยแล้ว! ${ANIMATED.glitch}`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "scripthub_admin_send_mhnk") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบเท่านั้น", ephemeral: true });
        }
        const panel = makeMapDeliveryPanel("mahanakhon", false);
        const msg = await interaction.channel.send({
            content: null,
            embeds: panel.embeds,
            files: panel.files,
            components: panel.components
        });
        registerPanel(interaction.channelId, msg.id, "mahanakhon");
        return interaction.reply({ content: `✅ ส่งโพสต์แจกสคริปต์แมพ MAHANAKHON RACING เรียบร้อยแล้ว! ${ANIMATED.coin}`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "scripthub_admin_refresh") {
        const dash = makeAdminDashboard();
        return interaction.update({ embeds: dash.embeds, components: dash.components });
    }

    if (interaction.isButton() && interaction.customId === "scripthub_admin_open_add") {
        const modal = new ModalBuilder()
            .setCustomId("scripthub_modal_add")
            .setTitle("➕ เพิ่มแมพแจกสคริปต์ใหม่");

        const idInput = new TextInputBuilder()
            .setCustomId("id_input")
            .setLabel("รหัสย่อแมพ (ID ภาษาอังกฤษ เช่น bloxfruits):")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const nameInput = new TextInputBuilder()
            .setCustomId("name_input")
            .setLabel("ชื่อแมพ (เช่น BLOX FRUITS):")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const emojiInput = new TextInputBuilder()
            .setCustomId("emoji_input")
            .setLabel("อีโมจิประจำแมพ (เช่น 🍎 หรือ 🏎️):")
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const scriptInput = new TextInputBuilder()
            .setCustomId("script_input")
            .setLabel("โค้ด loadstring ของแมพ:")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(idInput),
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(emojiInput),
            new ActionRowBuilder().addComponents(scriptInput)
        );

        return interaction.showModal(modal);
    }

    if (interaction.isButton() && interaction.customId === "scripthub_admin_open_edit") {
        const modal = new ModalBuilder()
            .setCustomId("scripthub_modal_edit")
            .setTitle("✏️ แก้ไขโค้ดสคริปต์แมพ");

        const mapInput = new TextInputBuilder()
            .setCustomId("edit_map_id")
            .setLabel("รหัสแมพที่จะแก้ไข (เช่น mahanakhon):")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const scriptInput = new TextInputBuilder()
            .setCustomId("edit_script_code")
            .setLabel("โค้ด loadstring ใหม่:")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(mapInput),
            new ActionRowBuilder().addComponents(scriptInput)
        );

        return interaction.showModal(modal);
    }

    if (interaction.isButton() && interaction.customId === "scripthub_admin_open_desc") {
        const modal = new ModalBuilder()
            .setCustomId("scripthub_modal_desc")
            .setTitle("📝 แก้ไขคำอธิบายใต้ชื่อแมพ");

        const mapInput = new TextInputBuilder()
            .setCustomId("desc_map_id")
            .setLabel("รหัสแมพที่จะแก้ไข (เช่น mahanakhon):")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descInput = new TextInputBuilder()
            .setCustomId("desc_new_text")
            .setLabel("ข้อความคำอธิบายใหม่ใต้ชื่อแมพ:")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("เช่น สคริปต์แมพมหานคร เรซซิ่ง (ออโต้ฟาร์ม, จูนรถ, วาร์ปส่งของ)")
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(mapInput),
            new ActionRowBuilder().addComponents(descInput)
        );

        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "scripthub_modal_add") {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.fields.getTextInputValue("id_input").toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
        const name = interaction.fields.getTextInputValue("name_input").trim();
        const emoji = interaction.fields.getTextInputValue("emoji_input")?.trim() || "🎮";
        const script = interaction.fields.getTextInputValue("script_input").trim();

        const maps = loadMaps();
        maps[id] = {
            id,
            name,
            title: `แมพ ${name}`,
            emoji,
            description: `สคริปต์สำหรับ ${name}`,
            imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
            imageUrl: null,
            script
        };
        saveMaps(maps);

        // อัปเดตแผงที่มีอยู่ในห้อง Discord แบบ Realtime ทันที!
        const updated = await updateAllLivePanels(interaction.client);

        return interaction.editReply({
            content: `✅ เพิ่มแมพ **${name}** (\`ID: ${id}\`) เรียบร้อยแล้ว!\n🔄 ซิงก์แผงข้อความในดิสคอร์ดอัตโนมัติ: **${updated}** จุด`
        });
    }

    if (interaction.isModalSubmit() && interaction.customId === "scripthub_modal_edit") {
        await interaction.deferReply({ ephemeral: true });
        const mapId = interaction.fields.getTextInputValue("edit_map_id").toLowerCase().trim();
        const newCode = interaction.fields.getTextInputValue("edit_script_code").trim();

        const maps = loadMaps();
        if (!maps[mapId]) {
            return interaction.editReply({ content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ` });
        }

        maps[mapId].script = newCode;
        saveMaps(maps);

        // อัปเดตแผงในห้องแบบ Realtime ทันที
        const updated = await updateAllLivePanels(interaction.client);

        return interaction.editReply({
            content: `✅ อัปเดตสคริปต์แมพ **${maps[mapId].name}** เรียบร้อยแล้ว (เซฟและมีผลทันทีไม่ต้องรีบ็อต)!\n🔄 ซิงก์แผงข้อความในดิสคอร์ด: **${updated}** จุด`
        });
    }

    if (interaction.isModalSubmit() && interaction.customId === "scripthub_modal_desc") {
        await interaction.deferReply({ ephemeral: true });
        const mapId = interaction.fields.getTextInputValue("desc_map_id").toLowerCase().trim();
        const newDesc = interaction.fields.getTextInputValue("desc_new_text").trim();

        const maps = loadMaps();
        if (!maps[mapId]) {
            return interaction.editReply({ content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ` });
        }

        maps[mapId].description = newDesc;
        saveMaps(maps);

        // อัปเดตแผงในห้องแบบ Realtime ทันที
        const updated = await updateAllLivePanels(interaction.client);

        return interaction.editReply({
            content: `✅ อัปเดตคำอธิบายใต้ชื่อแมพ **${maps[mapId].name}** เรียบร้อยแล้ว (เซฟทันทีไม่ต้องรีบ็อต)!\n📝 **คำอธิบายใหม่:** \`${newDesc}\`\n🔄 ซิงก์แผงข้อความในดิสคอร์ด: **${updated}** จุด`
        });
    }
}

/**
 * 6. คำสั่ง Slash Command หลังบ้าน พร้อมระบบ Autocomplete Realtime
 */
const scripthubSlashCommand = new SlashCommandBuilder()
    .setName("scripthub")
    .setDescription("[ 🏎️ ] ระบบจัดการแผงเลือกแมพและแจกสคริปต์ KrakenHub (Realtime)")
    // 6.1 /scripthub setup
    .addSubcommand(sub =>
        sub.setName("setup")
            .setDescription("[ 📨 ] ส่งแผงแจกสคริปต์เข้าห้องที่เลือก (ซิงก์อัปเดตอัตโนมัติ)")
            .addChannelOption(o =>
                o.setName("channel")
                    .setDescription("ห้องที่จะส่งแผงแจกสคริปต์")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
            .addStringOption(o =>
                o.setName("mode")
                    .setDescription("เลือกรูปแบบแผงแจก (ค่าเริ่มต้น: แผงเลือกแมพรวมทุกเกม)")
                    .setRequired(false)
                    .setAutocomplete(true)
            )
    )
    // 6.2 /scripthub edit
    .addSubcommand(sub =>
        sub.setName("edit")
            .setDescription("[ ✏️ ] แก้ไขข้อมูลแมพ (เซฟทันที Realtime ไม่ต้องรีสตาร์ตบ็อต)")
            .addStringOption(o =>
                o.setName("map")
                    .setDescription("เลือกแมพที่ต้องการแก้ไข (มีระบบค้นหา Realtime)")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(o =>
                o.setName("script")
                    .setDescription("โค้ด loadstring ใหม่")
                    .setRequired(false)
            )
            .addAttachmentOption(o =>
                o.setName("image")
                    .setDescription("แนบไฟล์รูปภาพปกใหม่ (ลากรูปใส่ช่องนี้ได้เลย)")
                    .setRequired(false)
            )
            .addStringOption(o =>
                o.setName("image_url")
                    .setDescription("หรือใส่ลิงก์ URL รูปภาพใหม่")
                    .setRequired(false)
            )
            .addStringOption(o =>
                o.setName("title")
                    .setDescription("ข้อความหัวข้อใหม่ เช่น แมพ MAHANAKHON RACING")
                    .setRequired(false)
            )
            .addStringOption(o =>
                o.setName("name")
                    .setDescription("ชื่อแมพใหม่ เช่น MAHANAKHON RACING")
                    .setRequired(false)
            )
            .addStringOption(o =>
                o.setName("emoji")
                    .setDescription("อีโมจิประจำแมพ")
                    .setRequired(false)
            )
            .addStringOption(o =>
                o.setName("description")
                    .setDescription("คำอธิบายใน Dropdown")
                    .setRequired(false)
            )
    )
    // 6.3 /scripthub add
    .addSubcommand(sub =>
        sub.setName("add")
            .setDescription("[ ➕ ] เพิ่มแมพใหม่เข้าระบบแจกสคริปต์ (มีผลในดรอปดาวน์ทันที)")
            .addStringOption(o => o.setName("id").setDescription("รหัสย่อ ID เช่น bloxfruits").setRequired(true))
            .addStringOption(o => o.setName("name").setDescription("ชื่อแมพ เช่น BLOX FRUITS").setRequired(true))
            .addStringOption(o => o.setName("script").setDescription("โค้ด loadstring ของแมพนี้").setRequired(true))
            .addAttachmentOption(o => o.setName("image").setDescription("แนบไฟล์รูปภาพปกแมพ").setRequired(false))
            .addStringOption(o => o.setName("image_url").setDescription("หรือใส่ลิงก์ URL รูปปก").setRequired(false))
            .addStringOption(o => o.setName("emoji").setDescription("อีโมจิประจำแมพ เช่น 🍎 หรือ 🏎️").setRequired(false))
            .addStringOption(o => o.setName("description").setDescription("คำอธิบายสั้นๆ").setRequired(false))
    )
    // 6.4 /scripthub remove
    .addSubcommand(sub =>
        sub.setName("remove")
            .setDescription("[ 🗑️ ] ลบแมพออกจากระบบ")
            .addStringOption(o =>
                o.setName("map")
                    .setDescription("รหัสแมพที่ต้องการลบ")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    )
    // 6.5 /scripthub list
    .addSubcommand(sub =>
        sub.setName("list")
            .setDescription("[ 📋 ] ดูรายชื่อแมพ รูปภาพ และโค้ดสคริปต์ทั้งหมดในหลังบ้าน")
    )
    // 6.6 /scripthub desc
    .addSubcommand(sub =>
        sub.setName("desc")
            .setDescription("[ 📝 ] แก้ไขคำอธิบายใต้ชื่อแมพในเมนู Dropdown (Realtime ไม่ต้องรีบ็อต)")
            .addStringOption(o =>
                o.setName("map")
                    .setDescription("เลือกแมพที่ต้องการแก้ไขคำอธิบาย")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(o =>
                o.setName("text")
                    .setDescription("ข้อความคำอธิบายใหม่ใต้ชื่อแมพ (เช่น สคริปต์ออโต้ฟาร์ม, จูนรถ, วาร์ปส่งของ)")
                    .setRequired(true)
            )
    )
    // 6.7 /scripthub panel
    .addSubcommand(sub =>
        sub.setName("panel")
            .setDescription("[ 🎛️ ] เปิดแผงควบคุมหลังบ้านแบบ Interactive Buttons")
    );

/**
 * 7. ตัวจัดการคำสั่งหลังบ้าน /scripthub
 */
async function handleScriptHubCommand(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบ (Administrator) เท่านั้นที่ใช้คำสั่งนี้ได้", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const maps = loadMaps();

    // /scripthub setup
    if (sub === "setup") {
        const dest = interaction.options.getChannel("channel");
        const mode = interaction.options.getString("mode") || "hub";
        await interaction.deferReply({ ephemeral: true });

        try {
            if (mode === "hub") {
                const hubPanel = makeHubPanel(maps);
                const msg = await dest.send({
                    content: null,
                    embeds: hubPanel.embeds,
                    files: hubPanel.files,
                    components: hubPanel.components
                });
                registerPanel(dest.id, msg.id, "hub");
                return interaction.editReply({
                    content: `✅ ส่งแผงเลือกแมพรวม **KrakenHub Script Collection** ไปยังห้อง <#${dest.id}> เรียบร้อยแล้ว! ${ANIMATED.glitch}\n*(ระบบเชื่อมโยง Realtime Live Update พร้อมใช้งาน)*`
                });
            } else {
                const panel = makeMapDeliveryPanel(mode, false);
                if (!panel) {
                    return interaction.editReply({ content: `❌ ไม่พบแมพ \`${mode}\` ในระบบ` });
                }
                const msg = await dest.send({
                    content: null,
                    embeds: panel.embeds,
                    files: panel.files,
                    components: panel.components
                });
                registerPanel(dest.id, msg.id, mode);
                return interaction.editReply({
                    content: `✅ ส่งโพสต์แจกสคริปต์แมพ **${mode.toUpperCase()}** ไปยังห้อง <#${dest.id}> เรียบร้อยแล้ว! ${ANIMATED.coin}`
                });
            }
        } catch (err) {
            return interaction.editReply({ content: `❌ ส่งข้อความไม่สำเร็จ: ${err.message}` });
        }
    }

    // /scripthub edit (เซฟและมีผล Realtime ทันที)
    if (sub === "edit") {
        const mapId = interaction.options.getString("map");
        const newScript = interaction.options.getString("script");
        const imgAttachment = interaction.options.getAttachment("image");
        const imgUrl = interaction.options.getString("image_url");
        const newTitle = interaction.options.getString("title");
        const newName = interaction.options.getString("name");
        const newEmoji = interaction.options.getString("emoji");
        const newDesc = interaction.options.getString("description");

        if (!maps[mapId]) {
            return interaction.reply({ content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const changes = [];
        if (newScript) {
            maps[mapId].script = newScript.trim();
            changes.push("• โค้ดสคริปต์ loadstring (อัปเดตทันที)");
        }
        if (newName) {
            maps[mapId].name = newName.trim();
            changes.push(`• ชื่อแมพ: \`${newName.trim()}\``);
        }
        if (newTitle) {
            maps[mapId].title = newTitle.trim();
            changes.push(`• หัวข้อ Embed: \`${newTitle.trim()}\``);
        }
        if (newEmoji) {
            maps[mapId].emoji = newEmoji.trim();
            changes.push(`• อีโมจิ: ${newEmoji.trim()}`);
        }
        if (newDesc) {
            maps[mapId].description = newDesc.trim();
            changes.push(`• คำอธิบาย: ${newDesc.trim()}`);
        }

        if (imgAttachment && imgAttachment.url) {
            const ext = path.extname(imgAttachment.name) || ".jpg";
            const saveFileName = `${mapId}_cover${ext}`;
            const destPath = path.join(ASSETS_DIR, saveFileName);
            const ok = await downloadAndSaveImage(imgAttachment.url, destPath);
            if (ok) {
                maps[mapId].imagePath = destPath;
                maps[mapId].imageUrl = null; // ป้องกัน URL ซ้อนกับไฟล์แนบจนเกิดรูปเบิ้ล 2 อัน
                changes.push("• อัปเดตรูปภาพปกใหม่ (จากไฟล์แนบ)");
            }
        } else if (imgUrl) {
            const destPath = path.join(ASSETS_DIR, `${mapId}_cover.jpg`);
            const ok = await downloadAndSaveImage(imgUrl, destPath);
            if (ok) {
                maps[mapId].imagePath = destPath;
                maps[mapId].imageUrl = null;
                changes.push("• อัปเดตรูปภาพปกใหม่ (จาก URL)");
            } else {
                maps[mapId].imageUrl = imgUrl;
                changes.push("• ตั้งค่า URL รูปภาพปก");
            }
        }

        saveMaps(maps);

        // อัปเดตข้อความในดิสคอร์ดแบบ Realtime ทันที
        const updated = await updateAllLivePanels(interaction.client);

        return interaction.editReply({
            content: `✅ **อัปเดตข้อมูลแมพ ${maps[mapId].name} สำเร็จและเซฟแบบ Realtime เรียบร้อย!**\n${changes.length > 0 ? changes.join("\n") : "ไม่มีการเปลี่ยนแปลงข้อมูล"}\n\n🔄 **ผลการซิงก์:** แผงข้อความในดิสคอร์ดอัปเดตทันที **${updated}** จุด (ไม่ต้องรีสตาร์ตบ็อต)`
        });
    }

    // /scripthub add
    if (sub === "add") {
        const id = interaction.options.getString("id").toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
        const name = interaction.options.getString("name").trim();
        const script = interaction.options.getString("script").trim();
        const imgAttachment = interaction.options.getAttachment("image");
        const imgUrl = interaction.options.getString("image_url");
        const emoji = interaction.options.getString("emoji") || "🎮";
        const description = interaction.options.getString("description") || `สคริปต์สำหรับ ${name}`;

        await interaction.deferReply({ ephemeral: true });

        let imagePath = path.join(ASSETS_DIR, "krakenhub_hub.jpg");
        if (imgAttachment && imgAttachment.url) {
            const ext = path.extname(imgAttachment.name) || ".jpg";
            const dest = path.join(ASSETS_DIR, `${id}_cover${ext}`);
            const ok = await downloadAndSaveImage(imgAttachment.url, dest);
            if (ok) imagePath = dest;
        } else if (imgUrl) {
            const dest = path.join(ASSETS_DIR, `${id}_cover.jpg`);
            const ok = await downloadAndSaveImage(imgUrl, dest);
            if (ok) imagePath = dest;
        }

        maps[id] = {
            id,
            name,
            title: `แมพ ${name}`,
            emoji,
            description,
            imagePath,
            imageUrl: (imagePath && fs.existsSync(imagePath)) ? null : (imgUrl || imgAttachment?.url || null),
            script
        };
        saveMaps(maps);

        const updated = await updateAllLivePanels(interaction.client);

        return interaction.editReply({
            content: `✅ **เพิ่มแมพ ${name} (\`ID: ${id}\`) เข้าระบบสำเร็จ!**\nมีผลในดรอปดาวน์และแผงแจกทันทีแบบ Realtime (ซิงก์ข้อความ: ${updated} จุด)`
        });
    }

    // /scripthub desc
    if (sub === "desc") {
        const mapId = interaction.options.getString("map");
        const newDesc = interaction.options.getString("text").trim();

        if (!maps[mapId]) {
            return interaction.reply({ content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const oldDesc = maps[mapId].description || "ไม่มี";
        maps[mapId].description = newDesc;
        saveMaps(maps);

        const updated = await updateAllLivePanels(interaction.client);

        return interaction.editReply({
            content: `✅ **แก้ไขคำอธิบายใต้ชื่อแมพ ${maps[mapId].name} สำเร็จและเซฟแบบ Realtime ทันที!**\n\n📌 **แมพ:** \`${maps[mapId].name}\` (\`${mapId}\`)\n📝 **คำอธิบายเดิม:** \`${oldDesc}\`\n✨ **คำอธิบายใหม่:** \`${newDesc}\`\n\n🔄 **ผลการซิงก์:** แผงข้อความในดิสคอร์ดอัปเดตคำอธิบายใหม่ทันที **${updated}** จุด (ไม่ต้องรีสตาร์ตบ็อต)`
        });
    }

    // /scripthub remove
    if (sub === "remove") {
        const mapId = interaction.options.getString("map").toLowerCase().trim();
        if (!maps[mapId]) {
            return interaction.reply({ content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ`, ephemeral: true });
        }
        const name = maps[mapId].name;
        delete maps[mapId];
        saveMaps(maps);

        const updated = await updateAllLivePanels(interaction.client);

        return interaction.reply({
            content: `🗑️ ลบแมพ **${name}** ออกจากระบบเรียบร้อยแล้ว (อัปเดตแผงในห้อง: ${updated} จุด)`,
            ephemeral: true
        });
    }

    // /scripthub list
    if (sub === "list") {
        const dash = makeAdminDashboard(maps);
        return interaction.reply({ embeds: dash.embeds, ephemeral: true });
    }

    // /scripthub panel
    if (sub === "panel") {
        const dash = makeAdminDashboard(maps);
        return interaction.reply({ embeds: dash.embeds, components: dash.components, ephemeral: true });
    }
}

module.exports = {
    loadMaps,
    saveMaps,
    makeHubPanel,
    makeMapDeliveryPanel,
    makeAdminDashboard,
    handleScriptHubInteraction,
    handleScriptHubAutocomplete,
    handleScriptHubCommand,
    scripthubSlashCommand,
    updateAllLivePanels
};
