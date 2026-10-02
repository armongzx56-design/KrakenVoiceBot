const { EmbedBuilder } = require("discord.js");
const SOURCE_URL = "https://devforum.roblox.com/c/updates/announcements/36.json";
const POLL_MS = 5 * 60 * 1000;
async function fetchLatest() {
    const response = await fetch(SOURCE_URL, {headers: {"User-Agent": "KrakenVoiceBot/2.0"}});
    if (!response.ok) throw new Error("Roblox source HTTP " + response.status);
    const data = await response.json();
    return data.topic_list?.topics?.[0] || null;
}
function makeEmbed(topic) {
    return new EmbedBuilder().setColor(0x5865F2).setTitle("🤖 " + topic.title)
        .setURL("https://devforum.roblox.com/t/" + topic.slug + "/" + topic.id)
        .setDescription("มีประกาศ Roblox ใหม่จาก Developer Forum")
        .addFields({name:"📅 วันที่",value:new Date(topic.created_at).toLocaleString("th-TH"),inline:true},{name:"💬 Replies",value:String(topic.reply_count ?? 0),inline:true})
        .setFooter({text:"Roblox Developer Forum • Kraken Community"}).setTimestamp(new Date(topic.created_at));
}
async function check(client, config, saveConfig) {
    let topic; try { topic = await fetchLatest(); } catch (e) { console.log("[ROBLOX ERROR]", e.message); return; }
    if (!topic) return;
    for (const [guildId, gc] of Object.entries(config)) {
        const rb=gc.roblox; if (!rb?.enabled || !rb.channelId) continue;
        const guild=client.guilds.cache.get(guildId), channel=guild?.channels.cache.get(rb.channelId);
        if (!channel?.isTextBased()) continue;
        if (rb.lastTopicId === topic.id) continue;
        if (rb.lastTopicId) await channel.send({embeds:[makeEmbed(topic)]}).catch(e=>console.log("[ROBLOX SEND ERROR]",e.message));
        rb.lastTopicId=topic.id;
    }
    saveConfig(config);
}
function startRobloxUpdates(client, config, saveConfig) {
    console.log("[ROBLOX] Update watcher started");
    setTimeout(() => check(client,config,saveConfig),10000);
    setInterval(() => check(client,config,saveConfig),POLL_MS);
}
module.exports={startRobloxUpdates};