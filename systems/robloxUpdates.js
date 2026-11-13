const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const WEAO_VERSION_URLS = [
    "https://weao.xyz/api/versions/current",
    "https://whatexpsare.online/api/versions/current",
    "https://weao.gg/api/versions/current"
];

const WEAO_EXPLOIT_URLS = [
    "https://weao.xyz/api/status/exploits",
    "https://whatexpsare.online/api/status/exploits",
    "https://weao.gg/api/status/exploits"
];

const POLL_MS = 3 * 60 * 1000; // เช็คทุก 3 นาที

const EMOJIS = {
    leftWing: "<a:633625leftangleallwhitewing:1569102297487773696>",
    rightWing: "<a:602393rightangleallwhitewing:1569102295738884217>",
    pinkArrow: "<a:998057pinkarrow:1569102319105089637>",
    catPaw: "<a:785173catpaw:1569102307155779649>",
    ticket: "<a:437007ticket:1569102283067621499>",
    goldCoin: "<a:933416goldenspincoin:1569102317305860226>",
    thumbsUp: "<:460044catthumbsup:1569102289090912346>"
};

const POPULAR_EXECUTORS = [
    "Delta",
    "Wave",
    "Solara",
    "Xeno",
    "Potassium",
    "Matcha",
    "MacSploit",
    "Vega X",
    "SirHurt"
];

async function fetchFromEndpoints(urls, errorMsg) {
    let lastError = null;
    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "WEAO-3PService",
                    "Accept": "application/json"
                },
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            if (data) return data;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error(errorMsg);
}

async function fetchRobloxVersions() {
    return await fetchFromEndpoints(WEAO_VERSION_URLS, "ไม่สามารถติดต่อ WEAO Version API ได้");
}

async function fetchExploitStatuses() {
    return await fetchFromEndpoints(WEAO_EXPLOIT_URLS, "ไม่สามารถติดต่อ WEAO Exploits API ได้");
}

function makeVersionEmbed(data, exploits = [], changedPlatforms = [], isTest = false) {
    const embed = new EmbedBuilder();

    const isUpdate = changedPlatforms.length > 0;
    const color = isTest ? 0x5865F2 : (isUpdate ? 0xFF3366 : 0x00F0FF);
    embed.setColor(color);

    if (isTest) {
        embed.setTitle(`${EMOJIS.leftWing} [TEST] ทดสอบระบบแจ้งเตือนเวอร์ชัน Roblox ${EMOJIS.rightWing}`);
        embed.setDescription(
            `🧪 **นี่คือข้อความทดสอบระบบแจ้งเตือนเวอร์ชัน Roblox**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${EMOJIS.pinkArrow} ข้อมูล Realtime เชื่อมต่อผ่าน **WEAO Version & Exploit API**`
        );
    } else if (isUpdate) {
        const platformText = changedPlatforms.join(", ");
        embed.setTitle(`🚨 ตรวจพบการอัปเดตเวอร์ชันใหม่ของ Roblox!`);
        embed.setDescription(
            `⚡ **Roblox มีการปล่อยแพตช์ใหม่สำหรับ: ${platformText}**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `⚠️ **คำเตือน:** ตัวรันสคริปต์ส่วนใหญ่อาจหยุดทำงานชั่วคราว เพื่อความปลอดภัยโปรดหลีกเลี่ยงการใช้อีดิหลักจนกว่าตัวรันจะอัปเดตครับ`
        );
    } else {
        embed.setTitle(`${EMOJIS.leftWing} ตรวจสอบเวอร์ชัน Roblox & ตัวรัน Realtime ${EMOJIS.rightWing}`);
        embed.setDescription(
            `🌐 **ข้อมูลเวอร์ชัน Roblox และสถานะตัวรันล่าสุดทุกแพลตฟอร์ม**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    const winMark = changedPlatforms.some(p => p.includes("Windows")) ? " ⭐ (UPDATED)" : "";
    const macMark = changedPlatforms.some(p => p.includes("Mac")) ? " ⭐ (UPDATED)" : "";
    const mobileMark = changedPlatforms.some(p => p.includes("Android") || p.includes("iOS")) ? " ⭐ (UPDATED)" : "";

    const winVer = data.WindowsResponse?.version || "N/A";
    const winHash = data.Windows || "N/A";
    const winDate = data.WindowsDate || "N/A";

    const macVer = data.MacResponse?.version || "N/A";
    const macHash = data.Mac || "N/A";

    const androidVer = data.Android || "N/A";
    const iosVer = data.iOS || "N/A";

    embed.addFields(
        {
            name: `╭── 🖥️ Windows Client (PC)${winMark}`,
            value: `>>> • **Version:** \`${winVer}\`\n• **Deploy Hash:** \`${winHash}\`\n• **Deploy Date:** ${winDate}`,
            inline: false
        },
        {
            name: `╭── 📱 Mobile Client${mobileMark}`,
            value: `>>> • **Android:** \`${androidVer}\`\n• **iOS:** \`${iosVer}\``,
            inline: true
        },
        {
            name: `╭── 🍎 macOS Client${macMark}`,
            value: `>>> • **Version:** \`${macVer}\`\n• **Deploy Hash:** \`${macHash}\``,
            inline: true
        }
    );

    // ถ้ามีข้อมูล Exploits ให้สรุปสถานะตัวรันยอดนิยม (พร้อมลิงก์หน้าดาวน์โหลด)
    if (Array.isArray(exploits) && exploits.length > 0) {
        const total = exploits.length;
        const updated = exploits.filter(x => x.updateStatus).length;
        const undetected = exploits.filter(x => !x.detected).length;

        const popularList = exploits.filter(x => POPULAR_EXECUTORS.includes(x.title));
        const popularLines = popularList.map(x => {
            const url = x.websitelink || x.discordlink || "https://whatexpsare.online/";
            const statusBadge = x.updateStatus ? "🟢" : "🔴";
            const detectBadge = x.detected ? "⚠️" : "🛡️";
            const costBadge = x.free ? "🆓" : "💵";
            const rawScore = x.suncPercentage ?? x.uncPercentage;
            const suncBadge = rawScore !== undefined && rawScore !== null ? ` \`${rawScore}%\`` : "";
            const cleanVer = (x.version || "").replace(/^v+/i, "").trim();
            const ver = cleanVer ? ` \`v${cleanVer}\`` : "";
            const plat = (x.platform === "Android" || x.platform === "iOS") ? ` [${x.platform}]` : "";
            return `${statusBadge} ${detectBadge} [**${x.title}**](${url})${plat}${ver} ─ ${costBadge}${suncBadge}`;
        });

        embed.addFields(
            {
                name: "╭── ⚡ สถานะตัวรันยอดนิยม (Popular Executors)",
                value: `>>> ${popularLines.join("\n")}\n\n💡 *คลิกที่ชื่อตัวรัน เพื่อเปิดหน้าดาวน์โหลด / เว็บไซต์ได้ทันที*`,
                inline: false
            },
            {
                name: "╭── 📊 สรุปสถิติตัวรันทั้งหมด (31 ตัว)",
                value: `>>> • 🟢 **พร้อมใช้งาน:** \`${updated}/${total}\` ตัว | 🛡️ **ปลอดภัย:** \`${undetected}/${total}\` ตัว\n• 🔍 ดูตัวรันทั้งหมด 31 ตัว ใช้คำสั่ง \`/roblox executors\`\n• 🌐 เว็บไซต์รวม: [whatexpsare.online](https://whatexpsare.online/)`,
                inline: false
            }
        );
    }

    embed.addFields({
        name: "╭── 💡 คำแนะนำสำหรับสมาชิก KrakenHub",
        value: ">>> 1. หาก Roblox เพิ่งอัปเดต กรุณารอตัวรันอัปเดตสถานะเป็น 🟢 ก่อนเข้าเกม\n2. ตัวรันที่มีสถานะ ⚠️ ควรใช้งานบนไอดีสำรองเพื่อความปลอดภัย\n3. ติดตามข่าวสารการอัปเดตแบบอัตโนมัติ 24 ชม. ผ่าน KrakenVoiceBot",
        inline: false
    });

    embed.setFooter({
        text: "WEAO Realtime Tracker • whatexpsare.online • KrakenHub System"
    }).setTimestamp();

    return embed;
}

function makeExecutorActionRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("🌐 เปิดหน้าเว็บ WhatExpsAre.Online")
            .setStyle(ButtonStyle.Link)
            .setURL("https://whatexpsare.online/"),
        new ButtonBuilder()
            .setLabel("⚡ WEAO Tracker")
            .setStyle(ButtonStyle.Link)
            .setURL("https://weao.xyz/")
    );
}

function makeExecutorsEmbed(exploits, platformFilter = "all") {
    const totalUpdated = exploits.filter(x => x.updateStatus).length;
    const totalSafe = exploits.filter(x => !x.detected).length;
    const totalFree = exploits.filter(x => x.free).length;

    const embed = new EmbedBuilder()
        .setColor(0x00F0FF)
        .setTitle(`${EMOJIS.leftWing} สถานะตัวรัน Roblox ทั้งหมด (Realtime Tracker) ${EMOJIS.rightWing}`)
        .setDescription(
            `📡 **ระบบตรวจสอบสถานะตัวรัน (Executors) แบบเรียลไทม์**\n` +
            `🔗 **เว็บไซต์หลัก:** [whatexpsare.online](https://whatexpsare.online/)\n` +
            `<a:pinkarrow:1310107692995706900> **คลิกที่ชื่อตัวรัน เพื่อเปิดหน้าดาวน์โหลด / เว็บไซต์ทางการทันที**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        );

    let filtered = exploits;
    if (platformFilter && platformFilter !== "all") {
        if (platformFilter.toLowerCase() === "mobile") {
            filtered = exploits.filter(x => x.platform === "Android" || x.platform === "iOS");
        } else {
            filtered = exploits.filter(x => x.platform.toLowerCase() === platformFilter.toLowerCase());
        }
    }

    const formatItem = (x) => {
        const url = x.websitelink || x.discordlink || "https://whatexpsare.online/";
        const status = x.updateStatus ? "🟢" : "🔴";
        const detect = x.detected ? "⚠️" : "🛡️";
        const price = x.free ? "🆓" : "💵";
        const rawScore = x.suncPercentage ?? x.uncPercentage;
        const score = rawScore !== undefined && rawScore !== null ? ` \`${rawScore}%\`` : "";
        const cleanVer = (x.version || "").replace(/^v+/i, "").trim();
        const ver = cleanVer ? ` \`v${cleanVer}\`` : "";
        const plat = (x.platform === "Android" || x.platform === "iOS") ? ` [${x.platform}]` : "";
        return `${status} ${detect} [**${x.title}**](${url})${plat}${ver} ─ ${price}${score}`;
    };

    const addChunkedFields = (titlePrefix, icon, list) => {
        if (!list || list.length === 0) return;
        const chunkSize = 13;
        if (list.length <= chunkSize) {
            embed.addFields({
                name: `╭── ${icon} ${titlePrefix} (${list.length} ตัว)`,
                value: `>>> ${list.map(formatItem).join("\n")}`,
                inline: false
            });
        } else {
            const totalParts = Math.ceil(list.length / chunkSize);
            for (let i = 0; i < list.length; i += chunkSize) {
                const chunk = list.slice(i, i + chunkSize);
                const partNum = Math.floor(i / chunkSize) + 1;
                embed.addFields({
                    name: `╭── ${icon} ${titlePrefix} (${partNum}/${totalParts}) • [${chunk.length} ตัว]`,
                    value: `>>> ${chunk.map(formatItem).join("\n")}`,
                    inline: false
                });
            }
        }
    };

    const windows = filtered.filter(x => x.platform === "Windows");
    const mobile = filtered.filter(x => x.platform === "Android" || x.platform === "iOS");
    const mac = filtered.filter(x => x.platform === "Mac");

    if (platformFilter === "all" || platformFilter.toLowerCase() === "windows") {
        addChunkedFields("Windows Executors", "🖥️", windows);
    }
    if (platformFilter === "all" || platformFilter.toLowerCase() === "mobile") {
        addChunkedFields("Mobile Executors (Android & iOS)", "📱", mobile);
    }
    if (platformFilter === "all" || platformFilter.toLowerCase() === "mac") {
        addChunkedFields("macOS Executors", "🍎", mac);
    }

    embed.addFields({
        name: "╭── 📌 คำอธิบายสัญลักษณ์ & สถิติรวม",
        value: `>>> 🟢 = อัปเดตพร้อมใช้งาน | 🔴 = ยังไม่อัปเดต (รอแก้)\n🛡️ = ปลอดภัย (Undetected) | ⚠️ = ตรวจจับ (Detected/เสี่ยง)\n🆓 = ฟรี (${totalFree} ตัว) | 💵 = มีค่าบริการ\n**สถิติรวม 31 ตัว:** 🟢 \`${totalUpdated}/${exploits.length}\` ตัวรันอัปเดตแล้ว | 🛡️ \`${totalSafe}/${exploits.length}\` ปลอดภัย`,
        inline: false
    });

    embed.setFooter({ text: "WEAO Realtime Tracker • whatexpsare.online • KrakenHub System" }).setTimestamp();
    return embed;
}

async function sendTestUpdate(client, config, guildId) {
    const rb = config[guildId]?.roblox;
    if (!rb?.enabled || !rb.channelId) throw new Error("ยังไม่ได้ตั้งห้องแจ้งเตือนเวอร์ชัน Roblox (ใช้ /roblox setup ก่อน)");
    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(rb.channelId);
    if (!channel?.isTextBased()) throw new Error("ไม่พบห้องแจ้งเตือน หรือบอทไม่มีสิทธิ์เข้าถึงห้องนี้");

    const [versions, exploits] = await Promise.all([
        fetchRobloxVersions(),
        fetchExploitStatuses().catch(() => [])
    ]);

    const embed = makeVersionEmbed(versions, exploits, ["Windows (PC)"], true);
    const row = makeExecutorActionRow();
    await channel.send({ embeds: [embed], components: [row] });
    return versions;
}

async function check(client, config, saveConfig) {
    let data;
    try {
        data = await fetchRobloxVersions();
    } catch (e) {
        console.log("[ROBLOX VERSION ERROR]", e.message);
        return;
    }

    if (!data) return;

    let configChanged = false;

    for (const [guildId, gc] of Object.entries(config)) {
        const rb = gc.roblox;
        if (!rb?.enabled || !rb.channelId) continue;

        const guild = client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(rb.channelId);
        if (!channel?.isTextBased()) continue;

        // ถ้ายังไม่มีเวอร์ชันบันทึกไว้ ให้บันทึกเวอร์ชันปัจจุบันเป็นค่าเริ่มต้น (ไม่ส่งสแปมตอนบอทเปิดครั้งแรก)
        if (!rb.versions) {
            rb.versions = {
                windows: data.Windows || "",
                mac: data.Mac || "",
                android: data.Android || "",
                ios: data.iOS || ""
            };
            configChanged = true;
            continue;
        }

        const changedPlatforms = [];
        if (data.Windows && rb.versions.windows && data.Windows !== rb.versions.windows) {
            changedPlatforms.push("Windows (PC)");
        }
        if (data.Mac && rb.versions.mac && data.Mac !== rb.versions.mac) {
            changedPlatforms.push("Mac");
        }
        if (data.Android && rb.versions.android && data.Android !== rb.versions.android) {
            changedPlatforms.push("Android");
        }
        if (data.iOS && rb.versions.ios && data.iOS !== rb.versions.ios) {
            changedPlatforms.push("iOS");
        }

        if (changedPlatforms.length > 0) {
            const exploits = await fetchExploitStatuses().catch(() => []);
            const embed = makeVersionEmbed(data, exploits, changedPlatforms, false);
            const row = makeExecutorActionRow();
            await channel.send({ embeds: [embed], components: [row] }).catch(e => console.log("[ROBLOX SEND ERROR]", e.message));

            // อัปเดตเวอร์ชันล่าสุดที่ตรวจพบ
            rb.versions = {
                windows: data.Windows || rb.versions.windows,
                mac: data.Mac || rb.versions.mac,
                android: data.Android || rb.versions.android,
                ios: data.iOS || rb.versions.ios
            };
            configChanged = true;
        }
    }

    if (configChanged) {
        saveConfig(config);
    }
}

function startRobloxUpdates(client, config, saveConfig) {
    console.log("[ROBLOX] Roblox Version Watcher started (Interval: 3m)");
    setTimeout(() => check(client, config, saveConfig), 5000);
    setInterval(() => check(client, config, saveConfig), POLL_MS);
}

module.exports = {
    startRobloxUpdates,
    sendTestUpdate,
    fetchRobloxVersions,
    fetchExploitStatuses,
    makeVersionEmbed,
    makeExecutorsEmbed,
    makeExecutorActionRow
};
