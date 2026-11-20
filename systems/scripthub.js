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
 * 4. นิยาม Slash Command หลังบ้าน (/scripthub)
 */
const scripthubSlashCommand = new SlashCommandBuilder()
    .setName("scripthub")
    .setDescription("[ 🏎️ ] ระบบจัดการแผงเลือกแมพและแจกสคริปต์ KrakenHub")
    .addSubcommand(sub =>
        sub.setName("send")
            .setDescription("[ 📨 ] ส่งแผงเลือกแมพ (Hub Selector) ไปยังห้องที่เลือก")
            .addChannelOption(o =>
                o.setName("channel")
                    .setDescription("ห้องที่จะส่งแผงเลือกแมพ")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName("direct")
            .setDescription("[ 🚀 ] ส่งโพสต์แจกสคริปต์ของแมพนั้นเดี่ยวๆ ลงห้องทันที")
            .addStringOption(o =>
                o.setName("map")
                    .setDescription("รหัสแมพ เช่น mahanakhon, sailueat, voxel")
                    .setRequired(true)
            )
            .addChannelOption(o =>
                o.setName("channel")
                    .setDescription("ห้องที่จะส่งโพสต์แจก")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName("list")
            .setDescription("[ 📋 ] ดูรายชื่อแมพและสคริปต์ทั้งหมดในหลังบ้าน")
    )
    .addSubcommand(sub =>
        sub.setName("setscript")
            .setDescription("[ ✏️ ] แก้ไขโค้ด loadstring ของแมพที่ต้องการ")
            .addStringOption(o =>
                o.setName("map")
                    .setDescription("รหัสแมพ เช่น mahanakhon")
                    .setRequired(true)
            )
            .addStringOption(o =>
                o.setName("code")
                    .setDescription("โค้ด loadstring ใหม่")
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName("add")
            .setDescription("[ ➕ ] เพิ่มแมพใหม่เข้าระบบแจกสคริปต์")
            .addStringOption(o => o.setName("id").setDescription("รหัสย่อภาษาอังกฤษ เช่น bloxfruits").setRequired(true))
            .addStringOption(o => o.setName("name").setDescription("ชื่อแมพ เช่น BLOX FRUITS").setRequired(true))
            .addStringOption(o => o.setName("script").setDescription("โค้ด loadstring ของแมพนี้").setRequired(true))
            .addStringOption(o => o.setName("emoji").setDescription("อีโมจิประจำแมพ เช่น 🍎 หรือ 🏎️").setRequired(false))
            .addStringOption(o => o.setName("description").setDescription("คำอธิบายสั้นๆ").setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName("remove")
            .setDescription("[ 🗑️ ] ลบแมพออกจากระบบ")
            .addStringOption(o => o.setName("id").setDescription("รหัสแมพที่ต้องการลบ").setRequired(true))
    );

/**
 * 5. ฟังก์ชันประมวลผลคำสั่ง Slash Command (/scripthub)
 */
async function handleScriptHubCommand(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบ (Administrator) เท่านั้นที่ใช้คำสั่งนี้ได้", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const maps = loadMaps();

    // /scripthub send [channel]
    if (sub === "send") {
        const targetChannel = interaction.options.getChannel("channel");
        await interaction.deferReply({ ephemeral: true });

        const hubPanel = makeHubPanel(maps);
        try {
            await targetChannel.send({
                content: hubPanel.content,
                files: hubPanel.files,
                components: hubPanel.components
            });
            return interaction.editReply({
                content: `✅ ส่งแผงเลือกแมพแจกสคริปต์ KrakenHub ไปยังห้อง <#${targetChannel.id}> เรียบร้อยแล้ว!`
            });
        } catch (err) {
            return interaction.editReply({
                content: `❌ ส่งข้อความไม่สำเร็จ: ${err.message}`
            });
        }
    }

    // /scripthub direct [map] [channel]
    if (sub === "direct") {
        const mapId = interaction.options.getString("map").toLowerCase().trim();
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
        await interaction.deferReply({ ephemeral: true });

        const panel = makeMapDeliveryPanel(mapId, false);
        if (!panel) {
            return interaction.editReply({
                content: `❌ ไม่พบรหัสแมพ \`${mapId}\` ในระบบ! กรุณาใช้ \`/scripthub list\` เพื่อดูรหัสที่มี`
            });
        }

        try {
            await targetChannel.send({
                content: panel.content,
                files: panel.files,
                components: panel.components
            });
            return interaction.editReply({
                content: `✅ ส่งโพสต์แจกสคริปต์แมพ **${mapId.toUpperCase()}** ไปยัง <#${targetChannel.id}> เรียบร้อยแล้ว!`
            });
        } catch (err) {
            return interaction.editReply({
                content: `❌ ส่งข้อความไม่สำเร็จ: ${err.message}`
            });
        }
    }

    // /scripthub list
    if (sub === "list") {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("🏎️ KrakenHub | รายการแมพและสคริปต์ในหลังบ้าน")
            .setDescription(`มีแมพในระบบทั้งหมด **${Object.keys(maps).length}** แมพ:`)
            .setTimestamp();

        for (const [id, m] of Object.entries(maps)) {
            embed.addFields({
                name: `${m.emoji || "🎮"} ${m.name} (\`ID: ${id}\`)`,
                value: `• **ชื่อหัวข้อ:** ${m.title || m.name}\n• **คำอธิบาย:** ${m.description || "ไม่มี"}\n• **โค้ดสคริปต์:** \`${(m.script || "").slice(0, 90)}...\``,
                inline: false
            });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /scripthub setscript [map] [code]
    if (sub === "setscript") {
        const mapId = interaction.options.getString("map").toLowerCase().trim();
        const newCode = interaction.options.getString("code").trim();

        if (!maps[mapId]) {
            return interaction.reply({
                content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ กรุณาใช้ \`/scripthub list\` เช็กชื่อแมพก่อน`,
                ephemeral: true
            });
        }

        maps[mapId].script = newCode;
        saveMaps(maps);

        return interaction.reply({
            content: `✅ อัปเดตสคริปต์สำหรับแมพ **${maps[mapId].name}** เรียบร้อยแล้ว!\n\`\`\`lua\n${newCode.slice(0, 300)}\n\`\`\``,
            ephemeral: true
        });
    }

    // /scripthub add [id] [name] [script] [emoji] [description]
    if (sub === "add") {
        const id = interaction.options.getString("id").toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
        const name = interaction.options.getString("name").trim();
        const script = interaction.options.getString("script").trim();
        const emoji = interaction.options.getString("emoji") || "🎮";
        const description = interaction.options.getString("description") || `สคริปต์สำหรับ ${name}`;

        if (!id) {
            return interaction.reply({ content: "❌ รหัส ID แมพต้องเป็นภาษาอังกฤษและตัวเลขเท่านั้น", ephemeral: true });
        }

        maps[id] = {
            id: id,
            name: name,
            title: `แมพ ${name}`,
            emoji: emoji,
            description: description,
            imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
            imageUrl: null,
            script: script
        };
        saveMaps(maps);

        return interaction.reply({
            content: `✅ เพิ่มแมพ **${name}** (\`ID: ${id}\`) เข้าระบบแจกสคริปต์เรียบร้อยแล้ว!`,
            ephemeral: true
        });
    }

    // /scripthub remove [id]
    if (sub === "remove") {
        const id = interaction.options.getString("id").toLowerCase().trim();
        if (!maps[id]) {
            return interaction.reply({ content: `❌ ไม่พบแมพ \`${id}\` ในระบบ`, ephemeral: true });
        }

        const name = maps[id].name;
        delete maps[id];
        saveMaps(maps);

        return interaction.reply({
            content: `🗑️ ลบแมพ **${name}** ออกจากระบบเรียบร้อยแล้ว`,
            ephemeral: true
        });
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

