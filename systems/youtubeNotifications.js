const { EmbedBuilder } = require("discord.js");

const POLL_MS = 2 * 60 * 1000;
const FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=";

function decodeXml(value = "") {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'");
}

function tag(entry, name) {
    const match = entry.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">"));
    return match ? decodeXml(match[1].trim()) : "";
}

async function fetchVideos(channelId) {
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
        throw new Error("Channel ID ไม่ถูกต้อง ต้องเป็น YouTube Channel ID ที่ขึ้นต้นด้วย UC");
    }

    const response = await fetch(FEED_URL + encodeURIComponent(channelId), {
        headers: { "User-Agent": "KrakenVoiceBot/1.0" },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("YouTube RSS ตอบกลับ HTTP " + response.status);

    const xml = await response.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => {
        const entry = match[1];
        const videoId = tag(entry, "yt:videoId");
        const title = tag(entry, "title");
        const author = tag(entry, "name");
        const published = tag(entry, "published");
        return videoId ? {
            videoId,
            title: title || "วิดีโอใหม่",
            author: author || "YouTube Creator",
            published,
            url: "https://www.youtube.com/watch?v=" + videoId,
            thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"
        } : null;
    }).filter(Boolean);

    if (!entries.length) throw new Error("ไม่พบวิดีโอในช่องนี้ หรือ Channel ID ไม่ถูกต้อง");
    return entries;
}

function makeEmbed(video, isTest = false) {
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle((isTest ? "🧪 ทดสอบแจ้งเตือน YouTube" : "🔴 คลิปใหม่จาก YouTube") + " | " + video.title)
        .setURL(video.url)
        .setDescription("**" + video.author + "** อัปโหลดวิดีโอใหม่แล้ว!\n[▶️ รับชมคลิปบน YouTube](" + video.url + ")")
        .setImage(video.thumbnail)
        .setFooter({ text: "Kraken Community • YouTube Notification" });

    if (video.published && !Number.isNaN(Date.parse(video.published))) {
        embed.setTimestamp(new Date(video.published));
    } else {
        embed.setTimestamp();
    }
    return embed;
}

async function addSource(config, guildId, channelId) {
    const videos = await fetchVideos(channelId);
    config[guildId] ??= {};
    config[guildId].youtube ??= { enabled: true, sources: [] };
    const settings = config[guildId].youtube;
    settings.enabled = true;
    settings.sources ??= [];

    if (settings.sources.some(source => source.channelId === channelId)) {
        throw new Error("ช่อง YouTube นี้ถูกเพิ่มไว้แล้ว");
    }

    settings.sources.push({
        channelId,
        channelName: videos[0].author,
        lastVideoId: videos[0].videoId
    });
    return videos[0];
}

function removeSource(config, guildId, channelId) {
    const settings = config[guildId]?.youtube;
    if (!settings?.sources?.length) return false;
    const before = settings.sources.length;
    settings.sources = settings.sources.filter(source => source.channelId !== channelId);
    if (!settings.sources.length) settings.enabled = false;
    return settings.sources.length !== before;
}

async function sendTestUpdate(client, config, guildId) {
    const settings = config[guildId]?.youtube;
    if (!settings?.enabled || !settings.channelId) {
        throw new Error("ยังไม่ได้ตั้งห้องแจ้งเตือน ใช้ /youtube setup ก่อน");
    }

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
    const channel = guild.channels.cache.get(settings.channelId) || await guild.channels.fetch(settings.channelId);
    if (!channel?.isTextBased() || !channel.send) {
        throw new Error("ไม่พบห้องแจ้งเตือน หรือบอทไม่มีสิทธิ์ส่งข้อความ");
    }

    // Allow testing the Discord destination even before a YouTube source is successfully added.
    if (!settings.sources?.length) {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle("🧪 ทดสอบระบบแจ้งเตือน YouTube")
            .setDescription("ส่งข้อความทดสอบสำเร็จ! ห้องแจ้งเตือนพร้อมใช้งานแล้ว\n\n⚠️ ยังไม่มีช่อง YouTube ในรายการติดตาม กรุณาใช้ /youtube add หลังแก้ไขการเชื่อมต่อ RSS")
            .setURL("https://www.youtube.com/channel/" + "UCR3Ns6RLG9DIIPnEOqXcD-g")
            .setFooter({ text: "Kraken Community • YouTube Notification" })
            .setTimestamp();
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        return { test: true };
    }

    const videos = await fetchVideos(settings.sources[0].channelId);
    await channel.send({ embeds: [makeEmbed(videos[0], true)], allowedMentions: { parse: [] } });
    return videos[0];
}

async function checkGuild(client, config, saveConfig, guildId, settings) {
    if (!settings?.enabled || !settings.channelId || !settings.sources?.length) return;

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const channel = guild.channels.cache.get(settings.channelId) || await guild.channels.fetch(settings.channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.send) return;

    for (const source of settings.sources) {
        try {
            const videos = await fetchVideos(source.channelId);
            if (!source.lastVideoId) {
                source.lastVideoId = videos[0].videoId;
                source.channelName = videos[0].author;
                saveConfig(config);
                continue;
            }

            const previousIndex = videos.findIndex(video => video.videoId === source.lastVideoId);
            const newVideos = previousIndex === -1
                ? [videos[0]]
                : videos.slice(0, previousIndex).reverse().slice(-5);

            for (const video of newVideos) {
                await channel.send({
                    embeds: [makeEmbed(video)],
                    allowedMentions: { parse: [] }
                });
            }

            if (newVideos.length) {
                source.lastVideoId = videos[0].videoId;
                source.channelName = videos[0].author;
                saveConfig(config);
                console.log("[YOUTUBE] Sent " + newVideos.length + " new video(s) from " + videoChannelName(source));
            }
        } catch (error) {
            console.log("[YOUTUBE ERROR] " + source.channelId + ": " + error.message);
        }
    }
}

function videoChannelName(source) {
    return source.channelName || source.channelId;
}

function startYouTubeNotifications(client, config, saveConfig) {
    console.log("[YOUTUBE] Notification watcher started (every 2 minutes)");
    const run = async () => {
        for (const [guildId, settings] of Object.entries(config)) {
            await checkGuild(client, config, saveConfig, guildId, settings.youtube);
        }
    };
    setTimeout(() => void run(), 15000);
    setInterval(() => void run(), POLL_MS);
}

module.exports = {
    addSource,
    removeSource,
    sendTestUpdate,
    startYouTubeNotifications
};
