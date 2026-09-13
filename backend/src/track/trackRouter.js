const express = require("express");
const { resolveTrack } = require("./resolve");

function createTrackRouter() {
    const router = express.Router();

    router.post("/track/resolve", async (req, res) => {
        const { url } = req.body || {};
        if (!url || typeof url !== "string") {
            return res.status(400).json({ error: "MISSING_URL" });
        }

        console.log("[solace:BE] track resolve", { url: url.slice(0, 120) });

        try {
            const result = await resolveTrack(url);
            console.log("[solace:BE] track resolved", { provider: result.provider, title: result.title });
            res.json(result);
        } catch (err) {
            console.log("[solace:BE] track resolve FAILED", { url: url.slice(0, 120), error: err.message });
            res.status(422).json({ error: "RESOLVE_FAILED", message: "Couldn't resolve track metadata" });
        }
    });

    return router;
}

module.exports = { createTrackRouter };
