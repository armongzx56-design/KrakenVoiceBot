const { EmbedBuilder } = require("discord.js");

const WEAO_URLS = [
    "https://weao.xyz/api/versions/current",
    "https://whatexpsare.online/api/versions/current",
    "https://weao.gg/api/versions/current"
];
const POLL_MS = 3 * 60 * 1000; // เช็คทุก 3 นาที

async function fetchRobloxVersions() {
    let lastError = null;
    for (const url of WEAO_URLS) {
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
            if (!response.ok) throw new Error("WEAO API HTTP " + response.status);
            const data = await response.json();
            if (data && (data.Windows || data.Android || data.iOS || data.Mac)) {
                return data;
            }
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("ไม่สามารถติดต่อ WEAO Version API ได้");
}

function makeVersionEmbed(data, changedPlatforms = [], isTest = false) {
    const embed = new EmbedBuilder();

    if (isTest) {
        embed.setColor(0x5865F2)
            .setTitle("🧪 [TEST] ทดสอบระบบแจ้งเตือนเวอร์ชันใหม่ของ Roblox")
            .setDescription("นี่คือตัวอย่างข้อความแจ้งเตือนเมื่อระบบตรวจพบการปล่อยเวอร์ชันใหม่ของ Roblox (ดึงข้อมูลสดจาก WEAO Tracker)");
    } else {
        const platformText = changedPlatforms.length > 0 ? changedPlatforms.join(", ") : "Roblox Client";
        embed.setColor(0xFF3366)
            .setTitle("🚨 ตรวจพบการอัปเดตเวอร์ชันใหม่ของ Roblox!")
            .setDescription(`ระบบตรวจพบว่า Roblox มีการปล่อยเวอร์ชัน/แพตช์ใหม่สำหรับ: **${platformText}**`);
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
            name: `🖥️ Windows (PC)${winMark}`,
            value: `• **Version:** \`${winVer}\`\n• **Deploy Hash:** \`${winHash}\`\n• **Deploy Date:** ${winDate}`,
            inline: false
        },
        {
            name: `📱 Mobile (Android / iOS)${mobileMark}`,
            value: `• **Android:** \`${androidVer}\`\n• **iOS:** \`${iosVer}\``,
            inline: true
        },
        {
            name: `🍎 macOS${macMark}`,
            value: `• **Version:** \`${macVer}\`\n• **Deploy Hash:** \`${macHash}\``,
            inline: true
        },
        {
            name: "⚠️ คำแนะนำสำหรับผู้ใช้สคริปต์ & ตัวรัน (Executor)",
            value: "เมื่อ Roblox มีการอัปเดตเวอร์ชันใหม่ โปรแกรมรันสคริปต์ส่วนใหญ่อาจไม่สามารถใช้งานได้ชั่วคราว จนกว่าผู้พัฒนาตัวรันจะอัปเดต Signature/Offsets ให้ตรงกับเวอร์ชันนี้",
            inline: false
        }
    );

    embed.setFooter({ text: "WEAO Version Tracker • KrakenHub" }).setTimestamp();
    return embed;
}

async function sendTestUpdate(client, config, guildId) {
    const rb = config[guildId]?.roblox;
    if (!rb?.enabled || !rb.channelId) throw new Error("ยังไม่ได้ตั้งห้องแจ้งเตือนเวอร์ชัน Roblox (ใช้ /roblox setup ก่อน)");
    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(rb.channelId);
    if (!channel?.isTextBased()) throw new Error("ไม่พบห้องแจ้งเตือน หรือบอทไม่มีสิทธิ์เข้าถึงห้องนี้");

    const data = await fetchRobloxVersions();
    const embed = makeVersionEmbed(data, ["Windows (PC)"], true);
    await channel.send({ embeds: [embed] });
    return data;
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
            const embed = makeVersionEmbed(data, changedPlatforms, false);
            await channel.send({ embeds: [embed] }).catch(e => console.log("[ROBLOX SEND ERROR]", e.message));

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
    makeVersionEmbed
};
