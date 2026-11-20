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
    TextInputStyle
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const MAPS_FILE = path.join(DATA_DIR, "scripthub_maps.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ข้อมูลแมพเริ่มต้น
const DEFAULT_MAPS = {
    mahanakhon: {
        id: "mahanakhon",
        name: "MAHANAKHON RACING",
        title: "แมพ MAHANAKHON RACING",
        emoji: "🏎️",
        description: "สคริปต์แมพมหานคร เรซซิ่ง (ออโต้ฟาร์ม, จูนรถ, วาร์ปส่งของ)",
        imagePath: path.join(ASSETS_DIR, "mahanakhon_cover.jpg"),
        script: 'loadstring(game:HttpGet("https://gist.githubusercontent.com/MacHub09/76ea573e3e472a8854d4f2dea5944d01/raw/c2175ee3808e846c9baa6c96c5e2a19a2b7e194b/Loaders"))()'
    },
    sailueat: {
        id: "sailueat",
        name: "SAI LUEAT ARCHIWA",
        title: "แมพ SAI LUEAT ARCHIWA (สายเลือดอาชีวะ)",
        emoji: "🥊",
        description: "สคริปต์แมพสายเลือดอาชีวะ (Aimbot, Hitbox, Silent Aim, Auto Farm)",
        imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
        script: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/KrakenHub/sailueat/main/loader.lua"))()'
    },
    voxel: {
        id: "voxel",
        name: "VOXEL WARS",
        title: "แมพ VOXEL WARS",
        emoji: "🔫",
        description: "สคริปต์แมพว็อกเซล วอร์ส (Silent Aim, ESP, God Mode)",
        imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
        script: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/KrakenHub/voxel/main/loader.lua"))()'
    }
};

function loadMaps() {
    try {
        if (!fs.existsSync(MAPS_FILE)) {
            fs.writeFileSync(MAPS_FILE, JSON.stringify(DEFAULT_MAPS, null, 2), "utf8");
            return { ...DEFAULT_MAPS };
        }
        const data = JSON.parse(fs.readFileSync(MAPS_FILE, "utf8"));
        return { ...DEFAULT_MAPS, ...data };
    } catch (e) {
        console.error("[SCRIPTHUB LOAD MAPS ERR]", e.message);
        return { ...DEFAULT_MAPS };
    }
}

function saveMaps(maps) {
    try {
        fs.writeFileSync(MAPS_FILE, JSON.stringify(maps, null, 2), "utf8");
    } catch (e) {
        console.error("[SCRIPTHUB SAVE MAPS ERR]", e.message);
    }
}

/**
 * 1. แผงเลือกแมพหลัก: KRAKEN HUB SCRIPT COLLECTION + Dropdown Menu (รูปที่ 1)
 */
function makeHubPanel(maps = null) {
    maps ??= loadMaps();
    const mapList = Object.values(maps);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("scripthub_select_map")
        .setPlaceholder("🔍 แตะที่นี่เพื่อเลื่อนเลือกแมพ...")
        .addOptions(
            mapList.map(m =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(m.name.slice(0, 100))
                    .setDescription((m.description || `สคริปต์แมพ ${m.name}`).slice(0, 100))
                    .setValue(m.id)
                    .setEmoji(m.emoji || "🎮")
            )
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const hubImagePath = path.join(ASSETS_DIR, "krakenhub_hub.jpg");
    const files = [];
    if (fs.existsSync(hubImagePath)) {
        files.push(new AttachmentBuilder(hubImagePath, { name: "hub.jpg" }));
    }

    return {
        content: "# 🔴 KRAKEN HUB | SCRIPT COLLECTION\n*กรุณาเลื่อนเลือกแมพที่ต้องการรับสคริปต์ด้านล่างนี้*",
        files: files,
        components: [row]
    };
}

/**
 * 2. หน้ารับสคริปต์ของแต่ละแมพ: ข้อความตัวใหญ่ + ปกรูปเกม + ปุ่มคัดลอก (รูปที่ 2)
 */
function makeMapDeliveryPanel(mapId, showBackBtn = true) {
    const maps = loadMaps();
    const map = maps[mapId] || maps.mahanakhon || Object.values(maps)[0];
    if (!map) return null;

    const buttons = [
        new ButtonBuilder()
            .setCustomId(`scripthub_copy_${map.id}`)
            .setLabel("คัดลอกสคริปต์")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Primary)
    ];

    if (showBackBtn) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId("scripthub_back_to_hub")
                .setLabel("เลือกแมพอื่น")
                .setEmoji("🔙")
                .setStyle(ButtonStyle.Secondary)
        );
    }

    const row = new ActionRowBuilder().addComponents(buttons);

    const files = [];
    if (map.imagePath && fs.existsSync(map.imagePath)) {
        files.push(new AttachmentBuilder(map.imagePath, { name: "cover.jpg" }));
    } else {
        const defaultCover = path.join(ASSETS_DIR, "mahanakhon_cover.jpg");
        if (fs.existsSync(defaultCover)) {
            files.push(new AttachmentBuilder(defaultCover, { name: "cover.jpg" }));
        }
    }

    return {
        content: `# ${map.title || `แมพ ${map.name}`}`,
        files: files,
        components: [row]
    };
}

/**
 * 3. แผงควบคุมระบบหลังบ้านแบบ All-in-One Dashboard
 */
function makeAdminDashboard(maps = null) {
    maps ??= loadMaps();

    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("🏎️ KRAKENHUB | แผงควบคุมระบบแจกสคริปต์ (All-in-One)")
        .setDescription(
            "ศูนย์รวมคำสั่งและการจัดการสคริปต์ทั้งหมดในคำสั่งเดียว\n" +
            "สามารถกดปุ่มด้านล่างเพื่อส่งแผงแจก หรือจัดการสคริปต์ได้ทันที:"
        )
        .setTimestamp();

    for (const [id, m] of Object.entries(maps)) {
        embed.addFields({
            name: `${m.emoji || "🎮"} ${m.name} (\`ID: ${id}\`)`,
            value: `• **หัวข้อ:** ${m.title || m.name}\n• **โค้ด:** \`${(m.script || "").slice(0, 85)}...\``,
            inline: false
        });
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("scripthub_admin_send_hub")
            .setLabel("ส่งแผงเลือกแมพรวม (Hub)")
            .setEmoji("📨")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("scripthub_admin_send_mhnk")
            .setLabel("ส่งโพสต์แมพ Mahanakhon")
            .setEmoji("🏎️")
            .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("scripthub_admin_open_add")
            .setLabel("เพิ่มแมพใหม่")
            .setEmoji("➕")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("scripthub_admin_open_edit")
            .setLabel("แก้ไขสคริปต์")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("scripthub_admin_refresh")
            .setLabel("รีเฟรช")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

/**
 * 4. ตัวประมวลผล Interaction สำหรับ ScriptHub (Select Menu, Buttons & Modals)
 */
async function handleScriptHubInteraction(interaction) {
    // 4.1 สมาชิกเลือกแมพจาก Dropdown Menu -> เปลี่ยนเป็นรูปที่ 2
    if (interaction.isStringSelectMenu() && interaction.customId === "scripthub_select_map") {
        const selectedId = interaction.values[0];
        const panel = makeMapDeliveryPanel(selectedId, true);

        if (!panel) {
            return interaction.reply({ content: "❌ ไม่พบข้อมูลแมพที่เลือก", ephemeral: true });
        }

        return interaction.update({
            content: panel.content,
            files: panel.files,
            components: panel.components
        }).catch(err => console.error("[SCRIPTHUB UPDATE ERR]", err.message));
    }

    // 4.2 สมาชิกกดปุ่ม "คัดลอกสคริปต์"
    if (interaction.isButton() && interaction.customId.startsWith("scripthub_copy_")) {
        const mapId = interaction.customId.replace("scripthub_copy_", "");
        const maps = loadMaps();
        const map = maps[mapId] || maps.mahanakhon;

        if (!map || !map.script) {
            return interaction.reply({ content: "❌ ไม่พบโค้ดสคริปต์ในระบบ", ephemeral: true });
        }

        return interaction.reply({
            content: map.script,
            ephemeral: true
        });
    }

    // 4.3 สมาชิกกดปุ่ม "เลือกแมพอื่น" (ย้อนกลับหน้าแรก)
    if (interaction.isButton() && interaction.customId === "scripthub_back_to_hub") {
        const hubPanel = makeHubPanel();
        return interaction.update({
            content: hubPanel.content,
            files: hubPanel.files,
            components: hubPanel.components
        }).catch(err => console.error("[SCRIPTHUB BACK ERR]", err.message));
    }

    // ==================== ADMIN DASHBOARD ACTIONS ====================

    // แอดมินกดส่งแผงเลือกแมพรวม
    if (interaction.isButton() && interaction.customId === "scripthub_admin_send_hub") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบเท่านั้น", ephemeral: true });
        }
        const hubPanel = makeHubPanel();
        await interaction.channel.send({
            content: hubPanel.content,
            files: hubPanel.files,
            components: hubPanel.components
        });
        return interaction.reply({ content: "✅ ส่งแผงเลือกแมพรวมลงในห้องนี้เรียบร้อยแล้ว!", ephemeral: true });
    }

    // แอดมินกดส่งโพสต์แมพ Mahanakhon ตรงๆ
    if (interaction.isButton() && interaction.customId === "scripthub_admin_send_mhnk") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบเท่านั้น", ephemeral: true });
        }
        const panel = makeMapDeliveryPanel("mahanakhon", false);
        await interaction.channel.send({
            content: panel.content,
            files: panel.files,
            components: panel.components
        });
        return interaction.reply({ content: "✅ ส่งโพสต์แจกสคริปต์แมพ MAHANAKHON RACING เรียบร้อยแล้ว!", ephemeral: true });
    }

    // แอดมินกดรีเฟรช Dashboard
    if (interaction.isButton() && interaction.customId === "scripthub_admin_refresh") {
        const dash = makeAdminDashboard();
        return interaction.update({ embeds: dash.embeds, components: dash.components });
    }

    // แอดมินกดเปิด Modal เพิ่มแมพ
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

    // แอดมินกดเปิด Modal แก้ไขสคริปต์
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

    // เมื่อส่ง Modal เพิ่มแมพ
    if (interaction.isModalSubmit() && interaction.customId === "scripthub_modal_add") {
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
            script
        };
        saveMaps(maps);

        return interaction.reply({
            content: `✅ เพิ่มแมพ **${name}** (\`ID: ${id}\`) เรียบร้อยแล้ว!`,
            ephemeral: true
        });
    }

    // เมื่อส่ง Modal แก้ไขสคริปต์
    if (interaction.isModalSubmit() && interaction.customId === "scripthub_modal_edit") {
        const mapId = interaction.fields.getTextInputValue("edit_map_id").toLowerCase().trim();
        const newCode = interaction.fields.getTextInputValue("edit_script_code").trim();

        const maps = loadMaps();
        if (!maps[mapId]) {
            return interaction.reply({ content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ`, ephemeral: true });
        }

        maps[mapId].script = newCode;
        saveMaps(maps);

        return interaction.reply({
            content: `✅ อัปเดตสคริปต์แมพ **${maps[mapId].name}** เรียบร้อยแล้ว!`,
            ephemeral: true
        });
    }
}

/**
 * 5. คำสั่ง Slash Command รวมเดี่ยวตัวเดียว: /scripthub
 */
const scripthubSlashCommand = new SlashCommandBuilder()
    .setName("scripthub")
    .setDescription("[ 🏎️ ] แผงควบคุมระบบแจกสคริปต์ KrakenHub (รวมทุกฟังก์ชันในคำสั่งเดียว)")
    .addChannelOption(o =>
        o.setName("channel")
            .setDescription("เลือกห้องที่ต้องการส่งแผงแจกสคริปต์ (ถ้าไม่เลือกจะเปิดแผงควบคุมหลังบ้าน)")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
    )
    .addStringOption(o =>
        o.setName("mode")
            .setDescription("เลือกประเภทแผงแจกที่ต้องการส่งทันที")
            .setRequired(false)
            .addChoices(
                { name: "🌐 ส่งแผงเลือกแมพรวม (Hub Selector - ปกแดง มีตัวเลื่อนเลือกแมพ)", value: "hub" },
                { name: "🏎️ ส่งโพสต์แจกแมพ MAHANAKHON RACING (เฉพาะแมพนี้ตรงๆ)", value: "mahanakhon" },
                { name: "🥊 ส่งโพสต์แจกแมพ SAI LUEAT ARCHIWA (เฉพาะแมพนี้ตรงๆ)", value: "sailueat" },
                { name: "🔫 ส่งโพสต์แจกแมพ VOXEL WARS (เฉพาะแมพนี้ตรงๆ)", value: "voxel" }
            )
    );

/**
 * 6. ตัวจัดการคำสั่งเดี่ยว /scripthub
 */
async function handleScriptHubCommand(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบ (Administrator) เท่านั้นที่ใช้คำสั่งนี้ได้", ephemeral: true });
    }

    const targetChannel = interaction.options.getChannel("channel");
    const mode = interaction.options.getString("mode");
    const maps = loadMaps();

    // กรณีเลือกส่งเข้าห้องทันที
    if (targetChannel || mode) {
        const dest = targetChannel || interaction.channel;
        await interaction.deferReply({ ephemeral: true });

        try {
            if (!mode || mode === "hub") {
                const hubPanel = makeHubPanel(maps);
                await dest.send({
                    content: hubPanel.content,
                    files: hubPanel.files,
                    components: hubPanel.components
                });
                return interaction.editReply({
                    content: `✅ ส่งแผงเลือกแมพรวม **KrakenHub Script Collection** ไปยังห้อง <#${dest.id}> เรียบร้อยแล้ว!`
                });
            } else {
                const panel = makeMapDeliveryPanel(mode, false);
                if (!panel) {
                    return interaction.editReply({ content: `❌ ไม่พบแมพ \`${mode}\` ในระบบ` });
                }
                await dest.send({
                    content: panel.content,
                    files: panel.files,
                    components: panel.components
                });
                return interaction.editReply({
                    content: `✅ ส่งโพสต์แจกสคริปต์แมพ **${mode.toUpperCase()}** ไปยังห้อง <#${dest.id}> เรียบร้อยแล้ว!`
                });
            }
        } catch (err) {
            return interaction.editReply({ content: `❌ ส่งข้อความไม่สำเร็จ: ${err.message}` });
        }
    }

    // กรณีพิมพ์ /scripthub เพียวๆ -> เปิดแผงควบคุมหลังบ้านแบบ All-in-One Dashboard
    const dashboard = makeAdminDashboard(maps);
    return interaction.reply({
        embeds: dashboard.embeds,
        components: dashboard.components,
        ephemeral: true
    });
}

module.exports = {
    loadMaps,
    saveMaps,
    makeHubPanel,
    makeMapDeliveryPanel,
    makeAdminDashboard,
    handleScriptHubInteraction,
    handleScriptHubCommand,
    scripthubSlashCommand
};
