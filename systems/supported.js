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
const SUPPORTED_FILE = path.join(DATA_DIR, "supported_maps.json");
const SUPPORTED_STORE_FILE = path.join(DATA_DIR, "supported_store.json");
const PANELS_FILE = path.join(DATA_DIR, "supported_panels.json");
const STORE_PANELS_FILE = path.join(DATA_DIR, "supported_store_panels.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

function safeReadJSON(filepath, def = null) {
    try {
        if (fs.existsSync(filepath)) {
            const raw = fs.readFileSync(filepath, "utf8");
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error(`[SUPPORTED READ ERR ${path.basename(filepath)}]`, e.message);
    }
    return def;
}

function safeWriteJSON(filepath, data) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = filepath + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(tmp, filepath);
    } catch (e) {
        try { fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8"); }
        catch (err) { console.error(`[SUPPORTED WRITE ERR ${path.basename(filepath)}]`, err.message); }
    }
}

function resolveImagePath(rawPath) {
    if (!rawPath) return null;
    if (fs.existsSync(rawPath)) return rawPath;
    const base = path.basename(rawPath);
    const inAssets = path.join(ASSETS_DIR, base);
    if (fs.existsSync(inAssets)) return inAssets;
    return rawPath;
}

// เอฟเฟคเคลื่อนไหว (Animated Emojis ประจำบ็อต)
const ANIMATED = {
    glitch: "<a:312312:1570844178684846211>",
    leftWing: "<a:633625leftangleallwhitewing:1569102297487773696>",
    rightWing: "<a:602393rightangleallwhitewing:1569102295738884217>",
    arrow: "<a:998057pinkarrow:1569102319105089637>",
    sparkle: "<a:2659tadapurple:1569102206798397571>",
    coin: "<a:933416goldenspincoin:1569102317305860226>",
    fire: "<a:1310107692995706900:1570844182317113364>"
};

const DEFAULT_DATA = {
    banner: {
        imagePath: path.join(ASSETS_DIR, "krakenhub_hub.jpg"),
        imageUrl: null
    },
    maps: {
        mahanakhon: { id: "mahanakhon", name: "MAHANAKHON RACING", status: "online" },
        voxel: { id: "voxel", name: "VOXEL WARS", status: "online" },
        sailueat: { id: "sailueat", name: "SAI LUEAT ARCHIWA", status: "updating" },
        bloxfruits: { id: "bloxfruits", name: "BLOX FRUITS", status: "offline" }
    }
};

let cachedData = null;

function loadSupportedData() {
    let data = safeReadJSON(SUPPORTED_STORE_FILE, null);
    if (!data || typeof data !== "object" || !data.maps) {
        data = safeReadJSON(SUPPORTED_FILE, null);
    }
    if (!data || typeof data !== "object" || !data.maps) {
        data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }

    if (data.banner && data.banner.imagePath) {
        data.banner.imagePath = resolveImagePath(data.banner.imagePath);
    }

    cachedData = data;
    return cachedData;
}

function saveSupportedData(data) {
    cachedData = data;
    safeWriteJSON(SUPPORTED_STORE_FILE, data);
    safeWriteJSON(SUPPORTED_FILE, data);
}

function loadSupportedPanels() {
    let panels = safeReadJSON(STORE_PANELS_FILE, null);
    if (!panels || !Array.isArray(panels) || panels.length === 0) {
        panels = safeReadJSON(PANELS_FILE, []);
    }
    return Array.isArray(panels) ? panels : [];
}

function saveSupportedPanels(panels) {
    safeWriteJSON(STORE_PANELS_FILE, panels);
    safeWriteJSON(PANELS_FILE, panels);
}

function registerSupportedPanel(channelId, messageId) {
    const panels = loadSupportedPanels();
    const existing = panels.find(p => p.messageId === messageId);
    if (!existing) {
        panels.push({ channelId, messageId, createdAt: Date.now() });
        saveSupportedPanels(panels);
    }
}

async function updateAllSupportedPanels(client) {
    if (!client) return 0;
    const panels = loadSupportedPanels();
    const data = loadSupportedData();
    const validPanels = [];
    let updatedCount = 0;

    for (const p of panels) {
        try {
            const channel = client.channels.cache.get(p.channelId) || await client.channels.fetch(p.channelId).catch(() => null);
            if (!channel || !channel.isTextBased?.()) continue;

            const msg = await channel.messages.fetch(p.messageId).catch(() => null);
            if (!msg) continue;

            const panel = makeSupportedPanel(data);
            await msg.edit({
                content: null,
                embeds: panel.embeds,
                files: panel.files,
                components: panel.components
            });
            validPanels.push(p);
            updatedCount++;
        } catch (err) {
            console.error(`[SUPPORTED REALTIME EDIT ERR ${p.messageId}]:`, err.message);
        }
    }

    saveSupportedPanels(validPanels);
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
        console.error("[SUPPORTED DOWNLOAD IMAGE ERR]", err.message);
        return false;
    }
}

function getMapStatusInfo(status) {
    const s = String(status || "").toLowerCase().trim();
    if (s === "updating" || s === "yellow" || s === "update" || s === "maintenance") {
        return { icon: "🟡", tag: "กำลังอัปเดต", code: "updating" };
    }
    if (s === "offline" || s === "red" || s === "disabled" || s === "patched") {
        return { icon: "🔴", tag: "ปิดปรับปรุง", code: "offline" };
    }
    return { icon: "🟢", tag: "ใช้งานได้ปกติ", code: "online" };
}

/**
 * 1. แผงแสดงรายชื่อแมพที่รองรับ & สถานะ (Public Supported Maps Board)
 */
function makeSupportedPanel(data = null) {
    data ??= loadSupportedData();
    const mapList = Object.values(data.maps || {});

    const statusLines = mapList.map(m => {
        const info = getMapStatusInfo(m.status);
        return `> ${info.icon} **${m.name.toUpperCase()}**  \` ${info.tag} \``;
    }).join("\n");

    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`${ANIMATED.leftWing} KRAKEN HUB | SUPPORTED MAPS ${ANIMATED.rightWing}`)
        .setDescription(statusLines || "> 🟢 **ยังไม่มีรายชื่อแมพในระบบ**");

    const files = [];
    const banner = data.banner || {};
    const bannerPath = banner.imagePath || path.join(ASSETS_DIR, "krakenhub_hub.jpg");

    if (bannerPath && fs.existsSync(bannerPath)) {
        files.push(new AttachmentBuilder(bannerPath, { name: "banner.jpg" }));
        embed.setImage("attachment://banner.jpg");
    } else if (banner.imageUrl) {
        embed.setImage(banner.imageUrl);
    }

    return {
        content: null,
        embeds: [embed],
        files: files,
        components: []
    };
}

/**
 * 2. แผงควบคุมระบบหลังบ้านแบบ Interactive Dashboard สำหรับแผงแมพที่รองรับ
 */
function makeSupportedAdminDashboard(data = null) {
    data ??= loadSupportedData();
    const mapList = Object.values(data.maps || {});

    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`${ANIMATED.glitch} KRAKEN HUB | แผงควบคุมแมพที่รองรับ (Realtime Status)`)
        .setDescription(
            `${ANIMATED.arrow} **ศูนย์ควบคุมสถานะแมพที่รองรับ (Supported Maps)**\n` +
            `🚦 *เลือกจากเมนูด้านล่างนี้เพื่อสลับสถานะ 🟢 เปิด / 🟡 อัปเดต / 🔴 ปิด ได้ทันทีในคลิกเดียว:*`
        )
        .setTimestamp();

    for (const m of mapList) {
        const info = getMapStatusInfo(m.status);
        embed.addFields({
            name: `${info.icon} ${m.name} (\`ID: ${m.id}\`)`,
            value: `• **สถานะปัจจุบัน:** ${info.icon} \`${info.tag}\``,
            inline: true
        });
    }

    const rows = [];

    // Row 0: Quick Status Dropdown (คลิกเลือกสลับสถานะ 1 คลิก มีผลสดทันที)
    const statusOptions = [];
    for (const m of mapList) {
        if (m.status !== "online") {
            statusOptions.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`🟢 เปิดใช้งาน: ${m.name}`.slice(0, 100))
                    .setDescription(`สลับเป็นสถานะ ใช้งานได้ปกติ`)
                    .setValue(`${m.id}__online`)
                    .setEmoji("🟢")
            );
        }
        if (m.status !== "updating") {
            statusOptions.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`🟡 ตั้งอัปเดต: ${m.name}`.slice(0, 100))
                    .setDescription(`สลับเป็นสถานะ อยู่ระหว่างอัปเดต`)
                    .setValue(`${m.id}__updating`)
                    .setEmoji("🟡")
            );
        }
        if (m.status !== "offline") {
            statusOptions.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`🔴 ปิดปรับปรุง: ${m.name}`.slice(0, 100))
                    .setDescription(`สลับเป็นสถานะ ปิดปรับปรุง`)
                    .setValue(`${m.id}__offline`)
                    .setEmoji("🔴")
            );
        }
    }

    if (statusOptions.length > 0) {
        const quickMenu = new StringSelectMenuBuilder()
            .setCustomId("supported_admin_quick_status")
            .setPlaceholder("🚦 คลิกที่นี่เพื่อสลับสถานะ เปิด/ปิด/อัปเดต ทันที...")
            .addOptions(statusOptions.slice(0, 25));
        rows.push(new ActionRowBuilder().addComponents(quickMenu));
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("supported_admin_send")
            .setLabel("ส่งแผงสถานะเข้าห้อง")
            .setEmoji(ANIMATED.glitch)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("supported_admin_open_add")
            .setLabel("เพิ่มแมพใหม่")
            .setEmoji(ANIMATED.sparkle)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("supported_admin_open_image")
            .setLabel("เปลี่ยนรูปแบนเนอร์")
            .setEmoji("🖼️")
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("supported_admin_open_remove")
            .setLabel("ลบแมพ")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("supported_admin_refresh")
            .setLabel("รีเฟรช")
            .setEmoji(ANIMATED.glitch)
            .setStyle(ButtonStyle.Secondary)
    );

    rows.push(row1, row2);
    return { embeds: [embed], components: rows };
}

/**
 * 3. ตัวประมวลผล Autocomplete สำหรับคำสั่ง /supported
 */
async function handleSupportedAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const data = loadSupportedData();
    const query = (focused.value || "").toLowerCase().trim();

    if (focused.name === "map") {
        const choices = Object.values(data.maps || {})
            .filter(m => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
            .slice(0, 25)
            .map(m => {
                const info = getMapStatusInfo(m.status);
                return {
                    name: `${info.icon} ${m.name} (${m.id})`.slice(0, 100),
                    value: m.id
                };
            });
        return interaction.respond(choices).catch(() => {});
    }
}

/**
 * 4. ตัวประมวลผล Interaction สำหรับ /supported
 */
async function handleSupportedInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === "supported_admin_quick_status") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบเท่านั้น", ephemeral: true });
        }
        const val = interaction.values[0];
        const [targetMapId, newStatus] = val.split("__");
        const data = loadSupportedData();

        if (!data.maps[targetMapId]) {
            return interaction.reply({ content: `❌ ไม่พบแมพ \`${targetMapId}\` ในระบบ`, ephemeral: true });
        }

        data.maps[targetMapId].status = newStatus;
        saveSupportedData(data);

        const updated = await updateAllSupportedPanels(interaction.client);
        const dash = makeSupportedAdminDashboard(data);
        const info = getMapStatusInfo(newStatus);

        return interaction.update({
            embeds: dash.embeds,
            components: dash.components
        }).then(async () => {
            await interaction.followUp({
                content: `✅ สลับสถานะแมพ **${data.maps[targetMapId].name}** เป็น ${info.icon} **${info.tag}** สำเร็จ! (ซิงก์แผงสด: ${updated} จุด)`,
                ephemeral: true
            }).catch(() => {});
        }).catch(err => console.error("[SUPPORTED QUICK STATUS ERR]", err.message));
    }

    if (interaction.isButton() && interaction.customId === "supported_admin_send") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบเท่านั้น", ephemeral: true });
        }
        const panel = makeSupportedPanel();
        const msg = await interaction.channel.send({
            content: null,
            embeds: panel.embeds,
            files: panel.files,
            components: panel.components
        });
        registerSupportedPanel(interaction.channelId, msg.id);
        return interaction.reply({ content: `✅ ส่งแผงแสดงแมพที่รองรับลงในห้องนี้เรียบร้อยแล้ว! (เชื่อมโยง Realtime Live Update)`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "supported_admin_refresh") {
        const dash = makeSupportedAdminDashboard();
        return interaction.update({ embeds: dash.embeds, components: dash.components });
    }

    if (interaction.isButton() && interaction.customId === "supported_admin_open_image") {
        const modal = new ModalBuilder()
            .setCustomId("supported_modal_image")
            .setTitle("🖼️ เปลี่ยนรูปแบนเนอร์แผงแมพที่รองรับ");

        const urlInput = new TextInputBuilder()
            .setCustomId("banner_url")
            .setLabel("ลิงก์ URL รูปภาพใหม่ (.jpg/.png):")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("https://example.com/banner.jpg")
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
        return interaction.showModal(modal);
    }

    if (interaction.isButton() && interaction.customId === "supported_admin_open_add") {
        const modal = new ModalBuilder()
            .setCustomId("supported_modal_add")
            .setTitle("➕ เพิ่มแมพที่รองรับใหม่");

        const idInput = new TextInputBuilder()
            .setCustomId("map_id")
            .setLabel("รหัสแมพ (ภาษาอังกฤษ เช่น bloxfruits):")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const nameInput = new TextInputBuilder()
            .setCustomId("map_name")
            .setLabel("ชื่อแมพ (เช่น BLOX FRUITS):")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const statusInput = new TextInputBuilder()
            .setCustomId("map_status")
            .setLabel("สถานะเริ่มต้น (online / updating / offline):")
            .setStyle(TextInputStyle.Short)
            .setValue("online")
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(idInput),
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(statusInput)
        );
        return interaction.showModal(modal);
    }

    if (interaction.isButton() && interaction.customId === "supported_admin_open_remove") {
        const modal = new ModalBuilder()
            .setCustomId("supported_modal_remove")
            .setTitle("🗑️ ลบแมพออกจากแผงที่รองรับ");

        const idInput = new TextInputBuilder()
            .setCustomId("remove_id")
            .setLabel("รหัสแมพที่ต้องการลบ (เช่น bloxfruits):")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(idInput));
        return interaction.showModal(modal);
    }

    // Modal Submits
    if (interaction.isModalSubmit() && interaction.customId === "supported_modal_image") {
        await interaction.deferReply({ ephemeral: true });
        const url = interaction.fields.getTextInputValue("banner_url").trim();
        const data = loadSupportedData();

        const destPath = path.join(ASSETS_DIR, "supported_banner.jpg");
        const ok = await downloadAndSaveImage(url, destPath);
        if (ok) {
            data.banner.imagePath = destPath;
            data.banner.imageUrl = null;
        } else {
            data.banner.imageUrl = url;
        }
        saveSupportedData(data);

        const updated = await updateAllSupportedPanels(interaction.client);
        return interaction.editReply({
            content: `✅ อัปเดตรูปแบนเนอร์ของแผงแมพที่รองรับสำเร็จแล้ว! 🖼️\n🔄 ซิงก์แผงข้อความทุกห้องแบบ Realtime: **${updated}** จุด`
        });
    }

    if (interaction.isModalSubmit() && interaction.customId === "supported_modal_add") {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.fields.getTextInputValue("map_id").toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
        const name = interaction.fields.getTextInputValue("map_name").trim();
        const status = interaction.fields.getTextInputValue("map_status").toLowerCase().trim() || "online";

        const data = loadSupportedData();
        data.maps[id] = { id, name, status };
        saveSupportedData(data);

        const updated = await updateAllSupportedPanels(interaction.client);
        return interaction.editReply({
            content: `✅ เพิ่มแมพ **${name}** (\`ID: ${id}\`) เข้าระบบสำเร็จ!\n🔄 ซิงก์แผงข้อความทุกห้องแบบ Realtime: **${updated}** จุด`
        });
    }

    if (interaction.isModalSubmit() && interaction.customId === "supported_modal_remove") {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.fields.getTextInputValue("remove_id").toLowerCase().trim();
        const data = loadSupportedData();

        if (!data.maps[id]) {
            return interaction.editReply({ content: `❌ ไม่พบแมพ \`${id}\` ในระบบ` });
        }

        const name = data.maps[id].name;
        delete data.maps[id];
        saveSupportedData(data);

        const updated = await updateAllSupportedPanels(interaction.client);
        return interaction.editReply({
            content: `🗑️ ลบแมพ **${name}** ออกจากแผงเรียบร้อยแล้ว!\n🔄 ซิงก์แผงข้อความทุกห้อง: **${updated}** จุด`
        });
    }
}

/**
 * 5. คำสั่ง Slash Command /supported
 */
const supportedSlashCommand = new SlashCommandBuilder()
    .setName("supported")
    .setDescription("[ 🎮 ] ระบบแสดงรายชื่อแมพที่ KrakenHub รองรับและสถานะ (Realtime)")
    .addSubcommand(sub =>
        sub.setName("setup")
            .setDescription("[ 📨 ] ส่งแผงแสดงแมพที่รองรับเข้าห้องที่เลือก (ซิงก์อัปเดตอัตโนมัติ)")
            .addChannelOption(o =>
                o.setName("channel")
                    .setDescription("ห้องที่จะส่งแผงสถานะ")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName("status")
            .setDescription("[ 🚦 ] สลับสถานะแมพ (🟢 ปกติ | 🟡 อัปเดต | 🔴 ปิด) แบบ Realtime")
            .addStringOption(o =>
                o.setName("map")
                    .setDescription("เลือกแมพที่ต้องการเปลี่ยนสถานะ")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(o =>
                o.setName("status")
                    .setDescription("เลือกสถานะใหม่")
                    .setRequired(true)
                    .addChoices(
                        { name: "🟢 ใช้งานได้ปกติ (Online)", value: "online" },
                        { name: "🟡 กำลังอัปเดต (Updating)", value: "updating" },
                        { name: "🔴 ปิดปรับปรุง (Offline)", value: "offline" }
                    )
            )
    )
    .addSubcommand(sub =>
        sub.setName("image")
            .setDescription("[ 🖼️ ] เปลี่ยนรูปแบนเนอร์ของแผงแมพที่รองรับ")
            .addAttachmentOption(o =>
                o.setName("file")
                    .setDescription("แนบไฟล์รูปภาพแบนเนอร์ใหม่ (ลากรูปใส่ช่องนี้ได้เลย)")
                    .setRequired(false)
            )
            .addStringOption(o =>
                o.setName("url")
                    .setDescription("หรือใส่ลิงก์ URL รูปภาพแบนเนอร์ใหม่")
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName("add")
            .setDescription("[ ➕ ] เพิ่มแมพที่รองรับใหม่")
            .addStringOption(o => o.setName("id").setDescription("รหัสย่อ ID เช่น bloxfruits").setRequired(true))
            .addStringOption(o => o.setName("name").setDescription("ชื่อแมพ เช่น BLOX FRUITS").setRequired(true))
            .addStringOption(o =>
                o.setName("status")
                    .setDescription("สถานะของแมพ")
                    .setRequired(false)
                    .addChoices(
                        { name: "🟢 ใช้งานได้ปกติ (Online)", value: "online" },
                        { name: "🟡 กำลังอัปเดต (Updating)", value: "updating" },
                        { name: "🔴 ปิดปรับปรุง (Offline)", value: "offline" }
                    )
            )
    )
    .addSubcommand(sub =>
        sub.setName("remove")
            .setDescription("[ 🗑️ ] ลบแมพออกจากแผง")
            .addStringOption(o =>
                o.setName("map")
                    .setDescription("รหัสแมพที่ต้องการลบ")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName("list")
            .setDescription("[ 📋 ] ดูรายชื่อแมพและสถานะปัจจุบันทั้งหมด")
    )
    .addSubcommand(sub =>
        sub.setName("panel")
            .setDescription("[ 🎛️ ] เปิดแผงควบคุมหลังบ้านแบบ Interactive พร้อมเมนู 1 คลิกสลับสถานะ")
    );

/**
 * 6. ตัวจัดการคำสั่ง Slash Command /supported
 */
async function handleSupportedCommand(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ เฉพาะผู้ดูแลระบบ (Administrator) เท่านั้นที่ใช้คำสั่งนี้ได้", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const data = loadSupportedData();

    if (sub === "setup") {
        const dest = interaction.options.getChannel("channel");
        await interaction.deferReply({ ephemeral: true });

        try {
            const panel = makeSupportedPanel(data);
            const msg = await dest.send({
                content: null,
                embeds: panel.embeds,
                files: panel.files,
                components: panel.components
            });
            registerSupportedPanel(dest.id, msg.id);
            return interaction.editReply({
                content: `✅ ส่งแผงแสดงแมพที่รองรับไปยังห้อง <#${dest.id}> เรียบร้อยแล้ว! ${ANIMATED.glitch}\n*(ระบบเชื่อมโยง Realtime Live Update พร้อมทำงานอัตโนมัติ)*`
            });
        } catch (err) {
            return interaction.editReply({ content: `❌ ส่งข้อความไม่สำเร็จ: ${err.message}` });
        }
    }

    if (sub === "status") {
        const mapId = interaction.options.getString("map");
        const newStatus = interaction.options.getString("status");

        if (!data.maps[mapId]) {
            return interaction.reply({ content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        data.maps[mapId].status = newStatus;
        saveSupportedData(data);

        const updated = await updateAllSupportedPanels(interaction.client);
        const info = getMapStatusInfo(newStatus);

        return interaction.editReply({
            content: `✅ ปรับเปลี่ยนสถานะแมพ **${data.maps[mapId].name}** เป็น ${info.icon} **${info.tag}** สำเร็จ! ${ANIMATED.sparkle}\n🔄 แผงข้อความทุกห้องอัปเดตแบบ Realtime ทันที: **${updated}** จุด`
        });
    }

    if (sub === "image") {
        const file = interaction.options.getAttachment("file");
        const url = interaction.options.getString("url");

        if (!file && !url) {
            return interaction.reply({ content: "❌ กรุณาแนบไฟล์รูปภาพในช่อง `file` หรือใส่ลิงก์ในช่อง `url`", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const targetUrl = file ? file.url : url;
        const destPath = path.join(ASSETS_DIR, "supported_banner.jpg");

        const ok = await downloadAndSaveImage(targetUrl, destPath);
        if (ok) {
            data.banner.imagePath = destPath;
            data.banner.imageUrl = null;
        } else {
            data.banner.imageUrl = targetUrl;
        }
        saveSupportedData(data);

        const updated = await updateAllSupportedPanels(interaction.client);
        return interaction.editReply({
            content: `✅ **อัปเดตแบนเนอร์แผงแมพที่รองรับสำเร็จแล้ว!** 🖼️\n🔄 ซิงก์แผงข้อความทุกห้องแบบ Realtime: **${updated}** จุด`
        });
    }

    if (sub === "add") {
        const id = interaction.options.getString("id").toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
        const name = interaction.options.getString("name").trim();
        const status = interaction.options.getString("status") || "online";

        await interaction.deferReply({ ephemeral: true });
        data.maps[id] = { id, name, status };
        saveSupportedData(data);

        const updated = await updateAllSupportedPanels(interaction.client);
        return interaction.editReply({
            content: `✅ **เพิ่มแมพ ${name} (\`ID: ${id}\`) เข้าระบบสำเร็จ!**\n🔄 ซิงก์แผงข้อความทุกห้อง: **${updated}** จุด`
        });
    }

    if (sub === "remove") {
        const mapId = interaction.options.getString("map").toLowerCase().trim();
        if (!data.maps[mapId]) {
            return interaction.reply({ content: `❌ ไม่พบแมพ \`${mapId}\` ในระบบ`, ephemeral: true });
        }
        const name = data.maps[mapId].name;
        delete data.maps[mapId];
        saveSupportedData(data);

        const updated = await updateAllSupportedPanels(interaction.client);
        return interaction.reply({
            content: `🗑️ ลบแมพ **${name}** ออกจากแผงเรียบร้อยแล้ว (อัปเดตแผงในห้อง: ${updated} จุด)`,
            ephemeral: true
        });
    }

    if (sub === "list") {
        const dash = makeSupportedAdminDashboard(data);
        return interaction.reply({ embeds: dash.embeds, ephemeral: true });
    }

    if (sub === "panel") {
        const dash = makeSupportedAdminDashboard(data);
        return interaction.reply({ embeds: dash.embeds, components: dash.components, ephemeral: true });
    }
}

module.exports = {
    loadSupportedData,
    saveSupportedData,
    makeSupportedPanel,
    makeSupportedAdminDashboard,
    handleSupportedInteraction,
    handleSupportedAutocomplete,
    handleSupportedCommand,
    supportedSlashCommand,
    updateAllSupportedPanels
};
