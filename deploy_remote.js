const { Client } = require("ssh2");
const fs = require("fs");
const path = require("path");
const https = require("https");

const API_KEY = "bhk_88ff8ca56c82b02cf47f6cb8f3c73f65d9ee5a0184ba8919";
const DEPLOYMENT_ID = "e142054a-8cb7-458c-b005-c4a1bfc60f0e";

function triggerPowerRestart() {
    return new Promise(resolve => {
        const payload = JSON.stringify({ action: "restart" });
        const req = https.request({
            hostname: "bot-hosting.net",
            path: "/api/v1/deployments/" + DEPLOYMENT_ID + "/power",
            method: "POST",
            headers: {
                "Authorization": "Bearer " + API_KEY,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            }
        }, res => {
            let body = "";
            res.on("data", c => body += c);
            res.on("end", () => {
                console.log(`  [POWER API] Restart response (${res.statusCode}): ${body}`);
                resolve(body);
            });
        });
        req.on("error", err => {
            console.error("  [POWER API ERR]", err.message);
            resolve(null);
        });
        req.write(payload);
        req.end();
    });
}

const REMOTE_CONFIG = {
    host: "fi7.bot-hosting.cloud",
    port: 2022,
    username: "e142054a-8cb7-458c-b005-c4a1bfc60f0e.rgeqjtsz",
    password: "vnXffXi4L7Ic3DRrty8VKQt-",
    readyTimeout: 15000
};

const LOCAL_ROOT = __dirname;

function uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        const rs = fs.createReadStream(localPath);
        const ws = sftp.createWriteStream(remotePath, { flags: "w" });
        ws.on("close", () => {
            console.log(`  [UPLOADED] ${path.relative(LOCAL_ROOT, localPath)} -> ${remotePath}`);
            resolve();
        });
        ws.on("error", err => reject(err));
        rs.on("error", err => reject(err));
        rs.pipe(ws);
    });
}

function ensureRemoteDir(sftp, remoteDir) {
    return new Promise(resolve => {
        sftp.mkdir(remoteDir, () => resolve());
    });
}

async function syncDir(sftp, localDir, remoteDir) {
    await ensureRemoteDir(sftp, remoteDir);
    const entries = fs.readdirSync(localDir, { withFileTypes: true });

    for (const entry of entries) {
        const localPath = path.join(localDir, entry.name);
        const remotePath = `${remoteDir}/${entry.name}`;

        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            await syncDir(sftp, localPath, remotePath);
        } else {
            // ข้ามไฟล์ชั่วคราวและ store ของบอทเพื่อไม่ให้ทับข้อมูลสดบนเซิร์ฟเวอร์
            if (entry.name.endsWith(".tmp") || entry.name.endsWith(".log") || entry.name.includes("_store")) continue;
            await uploadFile(sftp, localPath, remotePath);
        }
    }
}

async function deploy() {
    console.log("==================================================");
    console.log("🚀 KRAKENHUB BOT HOSTING AUTO DEPLOY & SYNC");
    console.log(`📡 Connecting to ${REMOTE_CONFIG.host}:${REMOTE_CONFIG.port}...`);
    console.log("==================================================");

    const conn = new Client();

    await new Promise((resolve, reject) => {
        conn.on("ready", resolve).on("error", reject).connect(REMOTE_CONFIG);
    });

    console.log("✅ SFTP Authenticated successfully!");

    const sftp = await new Promise((resolve, reject) => {
        conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
    });

    console.log("\n📦 Uploading core files...");
    // 1. Upload index.js
    await uploadFile(sftp, path.join(LOCAL_ROOT, "index.js"), "index.js");

    // 2. Upload systems/ & web/
    console.log("\n📁 Syncing systems/ folder...");
    await syncDir(sftp, path.join(LOCAL_ROOT, "systems"), "systems");
    console.log("\n📁 Syncing web/ folder...");
    await syncDir(sftp, path.join(LOCAL_ROOT, "web"), "web");

    // 3. Upload data definitions
    console.log("\n📄 Syncing data configurations...");
    const dataFiles = ["supported_maps.json"];
    for (const df of dataFiles) {
        const localF = path.join(LOCAL_ROOT, "data", df);
        if (fs.existsSync(localF)) {
            await ensureRemoteDir(sftp, "data");
            await uploadFile(sftp, localF, `data/${df}`);
        }
    }

    // 4. Trigger Auto-Reboot
    console.log("\n🔄 Triggering container restart via data/.reboot...");
    await ensureRemoteDir(sftp, "data");
    await new Promise((resolve, reject) => {
        const triggerContent = Buffer.from(JSON.stringify({ timestamp: Date.now(), reason: "deploy_update" }, null, 2));
        const wStream = sftp.createWriteStream("data/.reboot");
        wStream.on("close", resolve);
        wStream.on("error", reject);
        wStream.end(triggerContent);
    });
    console.log("  [TRIGGER SENT] data/.reboot written successfully.");

    conn.end();

    console.log("\n⚡ Sending Power Restart command via Bot-Hosting API...");
    await triggerPowerRestart();

    console.log("\n==================================================");
    console.log("🎉 DEPLOY COMPLETE! Bot is restarting on host...");
    console.log("==================================================");
}

if (require.main === module) {
    deploy().catch(err => {
        console.error("❌ Deploy failed:", err);
        process.exit(1);
    });
}

module.exports = { deploy };

