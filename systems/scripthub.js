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
    EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const MAPS_FILE = path.join(DATA_DIR, "scripthub_maps.json");

// ตรวจสอบและสร้างโฟลเดอร์ data
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
        imageUrl: null,
        script: 'loadstring(game:HttpGet("https://gist.githubusercontent.com/MacHub09/76ea573e3e472a8854d4f2dea5944d01/raw/c2175ee3808e846c9baa6c96c5e2a19a2b7e194b/Loaders"))()'
    },
    sailueat: {
        id: "sailueat",
        name: "SAI LUEAT ARCHIWA",
        title: "แมพ SAI LUEAT ARCHIWA (สายเลือดอาชีวะ)",
        emoji: "🥊",
        description: "สคริปต์แมพสายเลือดอาชีวะ (Aimbot, Hitbox, Silent Aim, Auto Farm)",
        imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
        imageUrl: null,
        script: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/KrakenHub/sailueat/main/loader.lua"))()'
    },
    voxel: {
        id: "voxel",
        name: "VOXEL WARS",
        title: "แมพ VOXEL WARS",
        emoji: "🔫",
        description: "สคริปต์แมพว็อกเซล วอร์ส (Silent Aim, ESP, God Mode)",
        imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
        imageUrl: null,
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
 * 1. สร้างหน้าแรก: Kraken Hub Script Collection + Select Menu (รูปที่ 1)
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
 * 2. สร้างหน้ารับสคริปต์ของแต่ละแมพ: ข้อความตัวใหญ่ + ปกรูปเกม + ปุ่มคัดลอก (รูปที่ 2)
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
 * 3. ตัวประมวลผล Interaction สำหรับ ScriptHub (Select Menu & Buttons)
 */
async function handleScriptHubInteraction(interaction) {
    // 3.1 ผู้ใช้เลือกแมพจาก Dropdown Menu -> เปลี่ยนหน้าจอเป็นรูปที่ 2
    if (interaction.isStringSelectMenu() && interaction.customId === "scripthub_select_map") {
        const selectedId = interaction.values[0];
        const panel = makeMapDeliveryPanel(selectedId, true);

        if (!panel) {
            return interaction.reply({ content: "❌ ไม่พบข้อมูลแมพที่เลือก", ephemeral: true });
        }

        // อัปเดตข้อความเดิมให้กลายเป็นหน้ารับสคริปต์ของแมพนั้น
        return interaction.update({
            content: panel.content,
            files: panel.files,
            components: panel.components
        }).catch(err => {
            console.error("[SCRIPTHUB UPDATE ERR]", err.message);
        });
    }

    // 3.2 ผู้ใช้กดปุ่ม "คัดลอกสคริปต์"
    if (interaction.isButton() && interaction.customId.startsWith("scripthub_copy_")) {
        const mapId = interaction.customId.replace("scripthub_copy_", "");
        const maps = loadMaps();
        const map = maps[mapId] || maps.mahanakhon;

        if (!map || !map.script) {
            return interaction.reply({
                content: "❌ ไม่พบโค้ดสคริปต์สำหรับแมพนี้ในระบบ",
                ephemeral: true
            });
        }

        // ส่งโค้ดแบบ raw text ให้แตะ copy ง่ายสุดๆ ในมือถือและคอม
        return interaction.reply({
            content: map.script,
            ephemeral: true
        });
    }

    // 3.3 ผู้ใช้กดปุ่ม "เลือกแมพอื่น" (ย้อนกลับหน้าแรก)
    if (interaction.isButton() && interaction.customId === "scripthub_back_to_hub") {
        const hubPanel = makeHubPanel();
        return interaction.update({
            content: hubPanel.content,
            files: hubPanel.files,
            components: hubPanel.components
        }).catch(err => {
            console.error("[SCRIPTHUB BACK ERR]", err.message);
        });
    }
}

/**
 * 4. นิยาม Slash Command หลังบ้าน (/scripthub) - รวมเหลือคำสั่ง setup ตัวเดียว
 */
const scripthubSlashCommand = new SlashCommandBuilder()
    .setName("scripthub")
    .setDescription("[ 🏎️ ] ระบบจัดการแผงเลือกแมพและแจกสคริปต์ KrakenHub")
    .addSubcommand(sub =>
        sub.setName("setup")
            .setDescription("[ ⚙️ ] ตั้งค่าและส่งแผงแจกสคริปต์เข้าห้องที่เลือก")
            .addChannelOption(o =>
                o.setName("channel")
                    .setDescription("ห้องที่จะส่งแผงแจกสคริปต์")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
            .addStringOption(o =>
                o.setName("map")
                    .setDescription("เลือกรูปแบบแผงแจก (ค่าเริ่มต้น: แผงเลือกแมพรวมทุกเกม)")
                    .setRequired(false)
                    .addChoices(
                        { name: "🌐 แผงเลือกแมพรวม (Hub Selector - ปกแดง มีตัวเลื่อนเลือกแมพ)", value: "all" },
                        { name: "🏎️ แมพ MAHANAKHON RACING (เฉพาะแมพนี้ตรงๆ)", value: "mahanakhon" },
                        { name: "🥊 แมพ SAI LUEAT ARCHIWA (เฉพาะแมพนี้ตรงๆ)", value: "sailueat" },
                        { name: "🔫 แมพ VOXEL WARS (เฉพาะแมพนี้ตรงๆ)", value: "voxel" }
                    )
            )
    );

/**
 * 5. ฟังก์ชันประมวลผลคำสั่ง Slash Command (/scripthub setup)
 */
async function handleScriptHubCommand(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบ (Administrator) เท่านั้นที่ใช้คำสั่งนี้ได้", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const maps = loadMaps();

    // /scripthub setup channel:#ห้อง [map:all/mahanakhon/...]
    if (sub === "setup") {
        const targetChannel = interaction.options.getChannel("channel");
        const mapChoice = interaction.options.getString("map") || "all";
        await interaction.deferReply({ ephemeral: true });

        try {
            if (mapChoice === "all") {
                // ส่งแผงเลือกแมพรวม (รูปที่ 1: ปกแดง KRAKEN HUB + Dropdown)
                const hubPanel = makeHubPanel(maps);
                await targetChannel.send({
                    content: hubPanel.content,
                    files: hubPanel.files,
                    components: hubPanel.components
                });
                return interaction.editReply({
                    content: `✅ ส่งแผงเลือกแมพรวม **KrakenHub Script Collection** ไปยังห้อง <#${targetChannel.id}> เรียบร้อยแล้ว!`
                });
            } else {
                // ส่งโพสต์แจกสคริปต์เฉพาะแมพที่เลือกเดี่ยวๆ (รูปที่ 2: ปกเกม + หัวข้อใหญ่ + ปุ่มคัดลอก)
                const panel = makeMapDeliveryPanel(mapChoice, false);
                if (!panel) {
                    return interaction.editReply({
                        content: `❌ ไม่พบข้อมูลแมพ \`${mapChoice}\` ในระบบ`
                    });
                }
                await targetChannel.send({
                    content: panel.content,
                    files: panel.files,
                    components: panel.components
                });
                return interaction.editReply({
                    content: `✅ ส่งโพสต์แจกสคริปต์แมพ **${mapChoice.toUpperCase()}** ไปยังห้อง <#${targetChannel.id}> เรียบร้อยแล้ว!`
                });
            }
        } catch (err) {
            return interaction.editReply({
                content: `❌ ส่งข้อความไม่สำเร็จ: ${err.message}`
            });
        }
    }
}

module.exports = {
    loadMaps,
    saveMaps,
    makeHubPanel,
    makeMapDeliveryPanel,
    handleScriptHubInteraction,
    handleScriptHubCommand,
    scripthubSlashCommand
};

