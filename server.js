const express = require("express");
const fetch   = require("node-fetch");

const app = express();
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
//     WEBHOOK CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const WEBHOOK_LOGS       = "";
const WEBHOOK_HIGHLIGHTS = "";
const WEBHOOK_1M_10M     = "https://discord.com/api/webhooks/1480499923110854696/wwW1o8McgmD89hAJJGU441ishm8aHyBXdTTrEREYXSj_kfQX6btXcbHIEETrDlXE44pj";
const WEBHOOK_10M_100M   = "https://discord.com/api/webhooks/1480500317606121544/Obrp9AVOXE5OmUNvLS3TlLdx2F6Lt9U0niI8LLRGQ2Pfyb2Np4gsatfSEAc0RO148klU";
const WEBHOOK_100M_400M  = "https://discord.com/api/webhooks/1480500373243433054/r78pLePj1cqwzW16D0J015StXrboftAZJAC6EjMhIlCmY4G5vOb1mNplfxIyydFbZIao";
const WEBHOOK_400M_1B    = "https://discord.com/api/webhooks/1480500468454002731/5IW9_2Rk2yNO5qLGalc6ag7WBs875Y1bUm_q7YgYambPRClmAKw42r47o2ZkLn0ogkUl";
const WEBHOOK_1B_PLUS    = "";

const MIN_THRESHOLD  = 1;  // global minimum M/s to process anything
const MIN_HIGHLIGHTS = 30; // M/s threshold to also send to highlights

// ═══════════════════════════════════════════════════════════════
//     PRIORITY LIST
// ═══════════════════════════════════════════════════════════════

const PRIORITY_LIST = [
    "Headless Horseman",
    "Skibidi Toilet",
    "Meowl",
    "Strawberry Elephant",
    "Dragon Gingerini",
    "Dragon Cannelloni",
    "Cerberus",
    "Capitano Moby",
    "La Casa Boo",
    "Cooki and Milki",
    "Spooky and Pumpky",
    "Guest 666",
    "Fragrama and Chocrama",
    "Ginger Gerat",
    "Garama and Madundung",
];

// ═══════════════════════════════════════════════════════════════
//     RATE LIMIT QUEUE
// ═══════════════════════════════════════════════════════════════

const webhookQueues = new Map();

function getQueue(url) {
    if (!webhookQueues.has(url)) {
        webhookQueues.set(url, { queue: [], processing: false });
    }
    return webhookQueues.get(url);
}

async function enqueueWebhook(url, payload, logType = "UNKNOWN") {
    if (!url || url === "") return;
    const q = getQueue(url);
    q.queue.push({ payload, logType });
    if (!q.processing) {
        q.processing = true;
        processQueue(url);
    }
}

async function processQueue(url) {
    const q = getQueue(url);
    while (q.queue.length > 0) {
        const { payload, logType } = q.queue.shift();
        try {
            const res = await fetch(url, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(payload),
            });

            if (res.status === 429) {
                const body       = await res.json().catch(() => ({}));
                const retryAfter = (body.retry_after || 1) * 1000;
                console.log(`[RATE LIMITED] ${logType} → retry in ${retryAfter}ms`);
                q.queue.unshift({ payload, logType });
                await sleep(retryAfter);
            } else if (!res.ok) {
                console.log(`[WEBHOOK ERR] ${logType} → ${res.status}`);
                await sleep(500);
            } else {
                const name  = payload.embeds?.[0]?.title?.replace(/\*/g, "") || "unknown";
                const value = payload.embeds?.[0]?.fields?.find(f => f.name === "Money/s")?.value || "";
                console.log(`[SENT] ${logType} → ${name} ${value}`);
                await sleep(400);
            }
        } catch (err) {
            console.error(`[WEBHOOK FAIL] ${logType} → ${err.message}`);
            await sleep(1000);
        }
    }
    q.processing = false;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════
//     HELPERS
// ═══════════════════════════════════════════════════════════════

function formatMoney(valueInM) {
    const val       = (valueInM || 0) * 1_000_000;
    const formatted = Math.floor(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `$${formatted}/s`;
}

function getTieredWebhook(mps) {
    const val = (mps || 0) * 1e6;
    if (val >= 1e9)   return WEBHOOK_1B_PLUS;
    if (val >= 400e6) return WEBHOOK_400M_1B;
    if (val >= 100e6) return WEBHOOK_100M_400M;
    if (val >= 10e6)  return WEBHOOK_10M_100M;
    if (val >= 1e6)   return WEBHOOK_1M_10M;
    return null;
}

function isPriorityAnimal(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return PRIORITY_LIST.some(p => lower.includes(p.toLowerCase()));
}

function getPriorityIndex(name) {
    if (!name) return -1;
    const lower = name.toLowerCase();
    for (let i = 0; i < PRIORITY_LIST.length; i++) {
        if (lower.includes(PRIORITY_LIST[i].toLowerCase())) return i;
    }
    return -1;
}

// ═══════════════════════════════════════════════════════════════
//     BUILD EMBED
// ═══════════════════════════════════════════════════════════════

function buildEmbed(best, allBrainrots, color, extra = {}) {
    const others = allBrainrots
        .filter(b => b !== best && (b.value || 0) >= 1)
        .map(b => `${b.name} (${formatMoney(b.value)})`)
        .join("\n");

    const fields = [
        { name: "Money/s", value: "```" + formatMoney(best.value) + "```", inline: true },
    ];

    if (extra.players) fields.push({ name: "Players", value: "```" + extra.players + "```", inline: true });
    if (extra.botName) fields.push({ name: "Bot",     value: "```" + extra.botName  + "```", inline: true });

    fields.push({
        name:   "Other Brainrots",
        value:  others ? "```\n" + others + "\n```" : "```\nNone found\n```",
        inline: false,
    });

    if (extra.jobId) fields.push({ name: "Job ID", value: "```" + extra.jobId + "```", inline: false });
    if (best.mutation) fields.push({ name: "Mutation", value: "```" + best.mutation + "```", inline: true });
    if (best.traits)   fields.push({ name: "Traits",   value: "```" + best.traits   + "```", inline: true });
    if (best.inDuel)   fields.push({ name: "⚠️ Duel",  value: "```Owner is in a duel — may not be stealable```", inline: false });

    const embed = {
        title:     `**${best.name}**`,
        color:     color,
        fields:    fields,
        timestamp: new Date().toISOString(),
    };

    if (best.thumbnail) embed.thumbnail = { url: best.thumbnail };

    return embed;
}

// ═══════════════════════════════════════════════════════════════
//     MAIN WEBHOOK ENDPOINT
// ═══════════════════════════════════════════════════════════════

app.post("/webhook", async (req, res) => {
    const { brainrots, best, players, jobId, botName } = req.body;

    if (!brainrots || !Array.isArray(brainrots) || brainrots.length === 0) {
        return res.status(400).json({ error: "Send { brainrots, players, jobId, botName }" });
    }

    let bestFind = best ? brainrots.find(b => b.name === best) : null;

    if (!bestFind) {
        let bestPriority = -1, highestVal = -1, priorityPick = null, valuePick = null;
        for (const b of brainrots) {
            const pi = getPriorityIndex(b.name);
            if (pi !== -1 && (bestPriority === -1 || pi < bestPriority)) {
                bestPriority = pi;
                priorityPick = b;
            }
            if ((b.value || 0) > highestVal) {
                highestVal = b.value || 0;
                valuePick  = b;
            }
        }
        bestFind = priorityPick || valuePick;
    }

    if (!bestFind) return res.json({ success: false, reason: "no valid find" });

    if ((bestFind.value || 0) < MIN_THRESHOLD) {
        console.log(`[SKIPPED] ${bestFind.name} (${formatMoney(bestFind.value)}) from ${botName || "unknown"} - below ${MIN_THRESHOLD}M threshold`);
        return res.json({ success: true, skipped: true, reason: `below ${MIN_THRESHOLD}M threshold` });
    }

    console.log(`[RECV] ${bestFind.name} (${formatMoney(bestFind.value)}) from ${botName || "unknown"} | inDuel=${bestFind.inDuel || false}`);

    const extra = { players, jobId, botName };

    if (WEBHOOK_LOGS) {
        enqueueWebhook(WEBHOOK_LOGS, { embeds: [buildEmbed(bestFind, brainrots, 0x2ecc71, extra)] }, "LOGS");
    }

    const tieredUrl = getTieredWebhook(bestFind.value);
    if (tieredUrl) {
        enqueueWebhook(tieredUrl, { embeds: [buildEmbed(bestFind, brainrots, 0x008000, extra)] }, "TIERED");
    }

    const isHighValue  = (bestFind.value || 0) >= MIN_HIGHLIGHTS;
    const isPriority   = isPriorityAnimal(bestFind.name);
    if ((isHighValue || isPriority) && WEBHOOK_HIGHLIGHTS) {
        enqueueWebhook(WEBHOOK_HIGHLIGHTS, { embeds: [buildEmbed(bestFind, brainrots, 0x4b0082, extra)] }, "HIGHLIGHTS");
    }

    return res.json({ success: true, best: bestFind.name, inDuel: bestFind.inDuel || false });
});

// ═══════════════════════════════════════════════════════════════
//     HEALTH
// ═══════════════════════════════════════════════════════════════

const startTime = Date.now();

app.get("/", (req, res) => {
    const queued = [...webhookQueues.values()].reduce((s, q) => s + q.queue.length, 0);
    res.json({
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000) + "s",
        queued,
        channels: {
            logs:       !!WEBHOOK_LOGS,
            highlights: !!WEBHOOK_HIGHLIGHTS,
            "1m-10m":   !!WEBHOOK_1M_10M,
            "10m-100m": !!WEBHOOK_10M_100M,
            "100m-400m":!!WEBHOOK_100M_400M,
            "400m-1b":  !!WEBHOOK_400M_1B,
            "1b+":      !!WEBHOOK_1B_PLUS,
        },
    });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ═══════════════════════════════════════════════════════════════
//     START
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[SERVER] Running on port ${PORT}`);
    console.log(`[SERVER] Logs:       ${WEBHOOK_LOGS       ? "OK" : "NOT SET"}`);
    console.log(`[SERVER] Highlights: ${WEBHOOK_HIGHLIGHTS ? "OK" : "NOT SET"}`);
    console.log(`[SERVER] 1M-10M:     ${WEBHOOK_1M_10M    ? "OK" : "NOT SET"}`);
    console.log(`[SERVER] 10M-100M:   ${WEBHOOK_10M_100M  ? "OK" : "NOT SET"}`);
    console.log(`[SERVER] 100M-400M:  ${WEBHOOK_100M_400M ? "OK" : "NOT SET"}`);
    console.log(`[SERVER] 400M-1B:    ${WEBHOOK_400M_1B   ? "OK" : "NOT SET"}`);
    console.log(`[SERVER] 1B+:        ${WEBHOOK_1B_PLUS   ? "OK" : "NOT SET"}`);
});
