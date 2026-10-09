const express = require("express");
const router = express.Router();

// The browser's clock sync (Frontend/src/utils/serverClock.js) calls this at
// startup and whenever the page returns to view. The `X-Server-Time` header
// is the precise figure; the body carries the same instant for a client that
// cannot read headers. Unauthenticated: knowing the time gives nothing away,
// and the login page needs it too.
router.get("/", (req, res) => {
  const serverTime = new Date();
  res.set("Cache-Control", "no-store");
  res.json({
    serverTime: serverTime.toISOString(),
    serverNow: serverTime.getTime(),
    // Every date the platform shows is in this zone, whatever the server's
    // or the student's own clock is set to.
    timeZone: "Asia/Kolkata",
  });
});

module.exports = router;
