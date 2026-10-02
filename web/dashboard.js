const express = require("express");
const crypto = require("crypto");

const sessions = new Map();
const oauthStates = new Map();

function startDashboard({ client, config, saveConfig, formatUptime }) {
    const app = express();
    const PORT = process.env.PORT || 3000;

    app.use(express.json({ limit: "32kb" }));
    app.use(express.urlencoded({ extended: false }));

    const oauthReady = Boolean(
        process.env.DISCORD_CLIENT_ID &&
        process.env.DISCORD_CLIENT_SECRET &&
        process.env.DISCORD_REDIRECT_URI
    );

    function baseUrl() {
        return process.env.DISCORD_REDIRECT_URI
            ? process.env.DISCORD_REDIRECT_URI.replace(/\/oauth2\/callback\/?$/, "")
            : "";
    }

    function sessionFrom(req) {
        const raw = req.headers.cookie || "";
        const match = raw.match(/(?:^|; )kraken_session=([^;]+)/);
        return match ? sessions.get(decodeURIComponent(match[1])) : null;
    }

    function requireSession(req, res, next) {
        const session = sessionFrom(req);
        if (!session) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบด้วย Discord ก่อน" });
        req.session = session;
        next();
    }

    function hasManageGuild(guild) {
        try {
            return (BigInt(guild.permissions || "0") & 0x20n) === 0x20n || guild.owner;
        } catch {
            return Boolean(guild.owner);
        }
    }

    function getBotGuild(id) {
        return client.guilds.cache.get(id);
    }

    function safeName(name) {
        return String(name || "").replace(/[<>]/g, "");
    }

    app.get("/", (req, res) => {
        const session = sessionFrom(req);
        if (!oauthReady) {
            return res.send(renderSetup());
        }
        if (session) return res.send(renderDashboard());
        res.send(renderLogin());
    });

    app.get("/login", (req, res) => {
        if (!oauthReady) return res.status(503).send(renderSetup());
        const state = crypto.randomBytes(24).toString("hex");
        oauthStates.set(state, Date.now() + 5 * 60 * 1000);
        const params = new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            redirect_uri: process.env.DISCORD_REDIRECT_URI,
            response_type: "code",
            scope: "identify guilds"
        });
        res.redirect("https://discord.com/oauth2/authorize?" + params.toString() + "&state=" + state);
    });

    app.get("/oauth2/callback", async (req, res) => {
        try {
            const state = String(req.query.state || "");
            const expires = oauthStates.get(state);
            oauthStates.delete(state);
            if (!expires || expires < Date.now()) return res.status(400).send("OAuth state หมดอายุ กรุณาลองใหม่");
            const code = String(req.query.code || "");
            if (!code) return res.status(400).send("ไม่พบ OAuth code");

            const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: process.env.DISCORD_CLIENT_ID,
                    client_secret: process.env.DISCORD_CLIENT_SECRET,
                    grant_type: "authorization_code",
                    code,
                    redirect_uri: process.env.DISCORD_REDIRECT_URI
                })
            });
            if (!tokenResponse.ok) throw new Error("Discord OAuth token exchange failed");
            const token = await tokenResponse.json();

            const headers = { Authorization: "Bearer " + token.access_token };
            const [userResponse, guildResponse] = await Promise.all([
                fetch("https://discord.com/api/users/@me", { headers }),
                fetch("https://discord.com/api/users/@me/guilds", { headers })
            ]);
            if (!userResponse.ok || !guildResponse.ok) throw new Error("Discord OAuth user request failed");

            const user = await userResponse.json();
            const guilds = await guildResponse.json();
            const sessionId = crypto.randomBytes(32).toString("hex");
            sessions.set(sessionId, {
                user,
                guilds,
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
            });
            res.setHeader("Set-Cookie", "kraken_session=" + encodeURIComponent(sessionId) + "; Path=/; HttpOnly; SameSite=Lax; Secure");
            res.redirect("/");
        } catch (error) {
            console.error("[WEB OAUTH ERROR]", error.message);
            res.status(500).send("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
        }
    });

    app.get("/logout", (req, res) => {
        const raw = req.headers.cookie || "";
        const match = raw.match(/(?:^|; )kraken_session=([^;]+)/);
        if (match) sessions.delete(decodeURIComponent(match[1]));
        res.setHeader("Set-Cookie", "kraken_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
        res.redirect("/");
    });

    app.get("/api/me", requireSession, (req, res) => {
        res.json({
            user: {
                id: req.session.user.id,
                username: req.session.user.username,
                avatar: req.session.user.avatar
            }
        });
    });

    app.get("/api/guilds", requireSession, (req, res) => {
        const list = req.session.guilds
            .filter(hasManageGuild)
            .map(g => {
                const botGuild = getBotGuild(g.id);
                return {
                    id: g.id,
                    name: safeName(g.name),
                    icon: g.icon,
                    owner: Boolean(g.owner),
                    botPresent: Boolean(botGuild)
                };
            })
            .filter(g => g.botPresent);
        res.json(list);
    });

    app.get("/api/guilds/:id", requireSession, (req, res) => {
        const oauthGuild = req.session.guilds.find(g => g.id === req.params.id);
        const guild = getBotGuild(req.params.id);
        if (!oauthGuild || !hasManageGuild(oauthGuild) || !guild) return res.status(403).json({ error: "ไม่มีสิทธิ์จัดการเซิร์ฟเวอร์นี้ หรือบอทยังไม่ได้เข้าเซิร์ฟเวอร์" });
        const gc = config[guild.id] || {};
        res.json({
            guild: { id: guild.id, name: safeName(guild.name), memberCount: guild.memberCount },
            bot: {
                online: client.isReady(),
                voice: client.voice?.connections?.get?.(guild.id)?.state?.status || "ดูจากบอท",
                uptime: formatUptime(Date.now() - client.readyAt?.getTime?.() || Date.now())
            },
            status: gc.status || null,
            ticket: gc.ticket || null,
            roblox: gc.roblox || null
        });
    });

    app.get("/api/guilds/:id/channels", requireSession, async (req, res) => {
        const oauthGuild = req.session.guilds.find(g => g.id === req.params.id);
        const guild = getBotGuild(req.params.id);
        if (!oauthGuild || !hasManageGuild(oauthGuild) || !guild) return res.status(403).json({ error: "ไม่มีสิทธิ์" });
        const channels = await guild.channels.fetch();
        res.json(channels.filter(c => c && (c.isTextBased?.() || c.type === 4)).map(c => ({
            id: c.id,
            name: safeName(c.name),
            type: c.type,
            parentId: c.parentId || null
        })));
    });

    app.post("/api/guilds/:id/status", requireSession, (req, res) => {
        const oauthGuild = req.session.guilds.find(g => g.id === req.params.id);
        if (!oauthGuild || !hasManageGuild(oauthGuild) || !getBotGuild(req.params.id)) return res.status(403).json({ error: "ไม่มีสิทธิ์" });
        const type = String(req.body.type || "");
        const text = String(req.body.text || "").trim();
        const allowed = { Playing: 0, Watching: 3, Listening: 2, Competing: 5 };
        if (!(type in allowed) || !text || text.length > 128) return res.status(400).json({ error: "ข้อมูลสถานะไม่ถูกต้อง" });
        client.user.setActivity(text, { type: allowed[type] });
        config[req.params.id] ??= {};
        config[req.params.id].status = { type, text };
        saveConfig(config);
        res.json({ ok: true, message: "อัปเดตสถานะแล้ว" });
    });

    app.delete("/api/guilds/:id/status", requireSession, (req, res) => {
        const oauthGuild = req.session.guilds.find(g => g.id === req.params.id);
        if (!oauthGuild || !hasManageGuild(oauthGuild) || !getBotGuild(req.params.id)) return res.status(403).json({ error: "ไม่มีสิทธิ์" });
        client.user.setActivity(null);
        if (config[req.params.id]) delete config[req.params.id].status;
        saveConfig(config);
        res.json({ ok: true, message: "ล้างสถานะแล้ว" });
    });

    app.post("/api/guilds/:id/ticket", requireSession, async (req, res) => {
        const oauthGuild = req.session.guilds.find(g => g.id === req.params.id);
        const guild = getBotGuild(req.params.id);
        if (!oauthGuild || !hasManageGuild(oauthGuild) || !guild) return res.status(403).json({ error: "ไม่มีสิทธิ์" });
        const panelChannelId = String(req.body.panelChannelId || "");
        const categoryId = req.body.categoryId ? String(req.body.categoryId) : null;
        const staffRoleId = req.body.staffRoleId ? String(req.body.staffRoleId) : null;
        const channel = guild.channels.cache.get(panelChannelId);
        if (!channel || !channel.isTextBased?.()) return res.status(400).json({ error: "ไม่พบห้อง Panel" });
        config[guild.id] ??= {};
        config[guild.id].ticket = { panelChannelId, categoryId, staffRoleId };
        saveConfig(config);
        res.json({ ok: true, message: "บันทึก Ticket แล้ว" });
    });

    app.post("/api/guilds/:id/roblox", requireSession, async (req, res) => {
        const oauthGuild = req.session.guilds.find(g => g.id === req.params.id);
        const guild = getBotGuild(req.params.id);
        if (!oauthGuild || !hasManageGuild(oauthGuild) || !guild) return res.status(403).json({ error: "ไม่มีสิทธิ์" });
        const channelId = String(req.body.channelId || "");
        const channel = guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased?.()) return res.status(400).json({ error: "ไม่พบห้องแจ้งเตือน" });
        config[guild.id] ??= {};
        config[guild.id].roblox = { channelId, enabled: true };
        saveConfig(config);
        res.json({ ok: true, message: "บันทึก Roblox Update แล้ว" });
    });

    app.get("/health", (req, res) => {
        res.json({
            bot: "KrakenVoiceBot",
            status: client.isReady() ? "online" : "starting",
            uptime: formatUptime(Date.now() - client.readyAt?.getTime?.() || Date.now())
        });
    });

    app.listen(PORT, () => console.log("[WEB] Kraken Control Panel listening on port " + PORT));
}

function renderSetup() {
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kraken Control Panel</title><style>${css()}</style></head><body><main class="center"><div class="card"><div class="brand"><span class="logo">K</span><div><b>Kraken</b><small>Control Panel</small></div></div><h1>ตั้งค่า Discord OAuth ก่อน</h1><p>เพิ่ม DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET และ DISCORD_REDIRECT_URI ใน Render Environment Variables แล้วรีสตาร์ตบริการ</p></div></main></body></html>`;
}

function renderLogin() {
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kraken Control Panel</title><style>${css()}</style></head><body><main class="center"><div class="card login"><div class="brand"><span class="logo">K</span><div><b>Kraken</b><small>Control Panel</small></div></div><h1>จัดการบอทของคุณ</h1><p>ตั้งค่า Status, Ticket และระบบแจ้งเตือน Roblox ได้จากที่เดียว</p><a class="btn primary" href="/login">เข้าสู่ระบบด้วย Discord</a><div class="muted">🔐 ใช้สิทธิ์ Manage Server เท่านั้น</div></div></main></body></html>`;
}

function renderDashboard() {
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kraken Control Panel</title><style>${css()}</style></head><body><div id="app"><aside><div class="brand"><span class="logo">K</span><div><b>Kraken</b><small>Control Panel</small></div></div><div class="side-title">เซิร์ฟเวอร์ของคุณ</div><select id="guildSelect"></select><nav><button data-tab="overview" class="active">⌂ ภาพรวม</button><button data-tab="status">◉ สถานะบอท</button><button data-tab="ticket">🎫 Ticket</button><button data-tab="roblox">◈ Roblox</button></nav><a class="logout" href="/logout">ออกจากระบบ</a></aside><main><header><div><span class="eyebrow">KRAKEN CONTROL</span><h1 id="pageTitle">ภาพรวม</h1></div><div id="userBox"></div></header><section id="content"></section></main></div><script>${js()}</script></body></html>`;
}

function css() {
    return `
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080a0f;color:#f4f6fb}button,input,select{font:inherit}a{text-decoration:none;color:inherit}.center{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0,#172033 0,#080a0f 48%)}.card{width:min(520px,100%);padding:34px;border:1px solid #202634;background:#0d1017;border-radius:24px;box-shadow:0 24px 80px #0008}.brand{display:flex;align-items:center;gap:12px;margin-bottom:28px}.logo{width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:linear-gradient(135deg,#fff,#aeb8ca);color:#080a0f;font-weight:900;font-size:23px}.brand b{display:block;font-size:18px;letter-spacing:.2px}.brand small{display:block;color:#7e8799;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-top:2px}.card h1{font-size:30px;margin:0 0 10px}.card p{color:#8f98aa;line-height:1.7;margin:0 0 24px}.btn{display:flex;justify-content:center;align-items:center;min-height:48px;border-radius:12px;font-weight:700}.primary{background:#fff;color:#080a0f}.muted{color:#697386;text-align:center;font-size:12px;margin-top:14px}#app{min-height:100vh;display:grid;grid-template-columns:260px 1fr}aside{border-right:1px solid #1b202b;background:#0a0c11;padding:24px 16px;display:flex;flex-direction:column;gap:20px}.side-title,.eyebrow{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#687285}.side-title{margin-top:10px}select{width:100%;background:#11151e;color:#eef1f7;border:1px solid #252c39;border-radius:10px;padding:11px}nav{display:grid;gap:6px}nav button{border:0;background:transparent;color:#858ea0;text-align:left;padding:11px 12px;border-radius:10px;cursor:pointer}nav button:hover,nav button.active{background:#151a23;color:#fff}.logout{margin-top:auto;color:#737c8e;font-size:13px;padding:10px 12px}main{padding:36px;max-width:1250px;width:100%;margin:auto}header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}h1{font-size:34px;margin:7px 0 0}.user{display:flex;gap:10px;align-items:center;color:#9aa3b3;font-size:13px}.avatar{width:34px;height:34px;border-radius:50%;background:#1a202c}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.panel{background:#0d1118;border:1px solid #1d2430;border-radius:18px;padding:20px}.panel h2{font-size:15px;margin:0 0 8px}.panel p{color:#7f899b;line-height:1.6;font-size:13px}.value{font-size:26px;font-weight:800;margin-top:10px}.form{display:grid;gap:14px;max-width:650px}.field label{display:block;color:#8c96a8;font-size:12px;margin-bottom:7px}.field input,.field select{width:100%;background:#0c1017;border:1px solid #252d3b;color:#fff;border-radius:11px;padding:12px}.actions{display:flex;gap:9px;flex-wrap:wrap}.save{border:0;background:#fff;color:#080a0f;padding:11px 18px;border-radius:10px;font-weight:800;cursor:pointer}.danger{border:1px solid #382128;background:#171015;color:#ff9aa8;padding:11px 18px;border-radius:10px;cursor:pointer}.hint{font-size:12px;color:#697386}.toast{position:fixed;right:22px;bottom:22px;background:#f4f6fb;color:#080a0f;padding:12px 16px;border-radius:11px;font-weight:700;box-shadow:0 12px 40px #0008}@media(max-width:800px){#app{grid-template-columns:1fr}aside{position:relative;border-right:0;border-bottom:1px solid #1b202b}nav{grid-template-columns:repeat(2,1fr)}main{padding:22px}.grid{grid-template-columns:1fr 1fr}header{gap:12px}.user{display:none}}@media(max-width:520px){.grid{grid-template-columns:1fr}.card{padding:26px}}`;
}

function js() {
    return `
const state={guild:null,data:null,channels:[]};
const $=s=>document.querySelector(s);
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"เกิดข้อผิดพลาด");return d}
async function init(){const me=await api("/api/me");$("#userBox").innerHTML='<div class="user"><img class="avatar" src="'+(me.user.avatar?"https://cdn.discordapp.com/avatars/"+me.user.id+"/"+me.user.avatar+".png?size=64":"")+'"><span>'+esc(me.user.username)+'</span></div>';const gs=await api("/api/guilds");const sel=$("#guildSelect");sel.innerHTML=gs.length?gs.map(g=>'<option value="'+g.id+'">'+esc(g.name)+'</option>').join(""):'<option>ไม่พบเซิร์ฟเวอร์</option>';if(gs.length){state.guild=gs[0].id;await load()}sel.onchange=async()=>{state.guild=sel.value;await load()};document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>tab(b.dataset.tab));tab("overview")}
async function load(){state.data=await api("/api/guilds/"+state.guild);state.channels=await api("/api/guilds/"+state.guild+"/channels");renderOverview()}
function tab(name){document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));$("#pageTitle").textContent={overview:"ภาพรวม",status:"สถานะบอท",ticket:"Ticket",roblox:"Roblox"}[name];({overview:renderOverview,status:renderStatus,ticket:renderTicket,roblox:renderRoblox}[name])()}
function renderOverview(){const d=state.data||{};$("#content").innerHTML='<div class="grid"><div class="panel"><h2>🟢 บอท</h2><div class="value">'+(d.bot?.online?"ออนไลน์":"กำลังเริ่ม")+'</div><p>KrakenVoiceBot พร้อมรับคำสั่ง</p></div><div class="panel"><h2>🎫 Ticket</h2><div class="value">'+(d.ticket?"เปิดใช้งาน":"ยังไม่ตั้งค่า")+'</div><p>ระบบเปิด Ticket สำหรับสมาชิก</p></div><div class="panel"><h2>◈ Roblox</h2><div class="value">'+(d.roblox?.enabled?"เปิด":"ปิด")+'</div><p>แจ้งเตือนประกาศ Roblox</p></div></div><div class="panel" style="margin-top:14px"><h2>เซิร์ฟเวอร์</h2><p>'+esc(d.guild?.name||"")+' • สมาชิก '+(d.guild?.memberCount||0)+' คน</p></div>'}
function renderStatus(){const s=state.data?.status||{};$("#content").innerHTML='<div class="panel form"><div><h2>◉ ตั้งสถานะบอท</h2><p>สถานะจะแสดงบน Discord ของบอท</p></div><div class="field"><label>ประเภท</label><select id="stype"><option '+(s.type==="Playing"?"selected":"")+' >Playing</option><option '+(s.type==="Watching"?"selected":"")+'>Watching</option><option '+(s.type==="Listening"?"selected":"")+'>Listening</option><option '+(s.type==="Competing"?"selected":"")+'>Competing</option></select></div><div class="field"><label>ข้อความ</label><input id="stext" maxlength="128" placeholder="เช่น Kraken Community" value="'+esc(s.text||"")+'"></div><div class="actions"><button class="save" onclick="saveStatus()">บันทึกสถานะ</button><button class="danger" onclick="clearStatus()">ล้างสถานะ</button></div><div class="hint">💡 ตั้งจากหน้าเว็บได้เลย ไม่ต้องใช้คำสั่ง Discord</div></div>'}
async function saveStatus(){try{await api("/api/guilds/"+state.guild+"/status",{method:"POST",body:JSON.stringify({type:$("#stype").value,text:$("#stext").value})});toast("บันทึกสถานะแล้ว");await load();renderStatus()}catch(e){toast(e.message)}}
async function clearStatus(){try{await api("/api/guilds/"+state.guild+"/status",{method:"DELETE"});toast("ล้างสถานะแล้ว");await load();renderStatus()}catch(e){toast(e.message)}}
const textChannels=()=>state.channels.filter(c=>c.type===0);
const cats=()=>state.channels.filter(c=>c.type===4);
function opts(list,selected){return '<option value="">— ไม่เลือก —</option>'+list.map(c=>'<option value="'+c.id+'" '+(c.id===selected?"selected":"")+'>'+esc(c.name)+'</option>').join("")}
function renderTicket(){const t=state.data?.ticket||{};$("#content").innerHTML='<div class="panel form"><div><h2>🎫 ตั้งค่าระบบ Ticket</h2><p>เลือกห้อง Panel, หมวดหมู่ และยศทีมงาน</p></div><div class="field"><label>ห้อง Ticket Panel</label><select id="tpanel">'+opts(textChannels(),t.panelChannelId)+'</select></div><div class="field"><label>หมวดหมู่ Ticket</label><select id="tcat">'+opts(cats(),t.categoryId)+'</select></div><div class="field"><label>ID ยศทีมงาน (Staff Role)</label><input id="trole" placeholder="ใส่ Role ID ถ้าต้องการ" value="'+esc(t.staffRoleId||"")+'"></div><div class="actions"><button class="save" onclick="saveTicket()">บันทึก Ticket</button></div></div>'}
async function saveTicket(){try{await api("/api/guilds/"+state.guild+"/ticket",{method:"POST",body:JSON.stringify({panelChannelId:$("#tpanel").value,categoryId:$("#tcat").value||null,staffRoleId:$("#trole").value.trim()||null})});toast("บันทึก Ticket แล้ว");await load();renderTicket()}catch(e){toast(e.message)}}
function renderRoblox(){const r=state.data?.roblox||{};$("#content").innerHTML='<div class="panel form"><div><h2>◈ Roblox Update</h2><p>ส่งประกาศใหม่จาก Roblox Developer Forum เข้า Discord อัตโนมัติทุก 5 นาที</p></div><div class="field"><label>ห้องแจ้งเตือน</label><select id="rchannel">'+opts(textChannels(),r.channelId)+'</select></div><div class="actions"><button class="save" onclick="saveRoblox()">เปิดใช้งานและบันทึก</button></div><div class="hint">แหล่งข้อมูล: Roblox Developer Forum</div></div>'}
async function saveRoblox(){try{await api("/api/guilds/"+state.guild+"/roblox",{method:"POST",body:JSON.stringify({channelId:$("#rchannel").value})});toast("เปิด Roblox Update แล้ว");await load();renderRoblox()}catch(e){toast(e.message)}}
function toast(t){const x=document.createElement("div");x.className="toast";x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),2600)}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
init().catch(e=>{$("#content").innerHTML='<div class="panel"><h2>โหลดไม่สำเร็จ</h2><p>'+esc(e.message)+'</p></div>'});
`;
}

module.exports = { startDashboard };
