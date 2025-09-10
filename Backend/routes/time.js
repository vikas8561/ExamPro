const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  const serverTime = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  res.json({
    serverTime: serverTime.toISOString(),
    timeZone,
  });
});

module.exports = router;
