/**
 * Stamp every response with the server's clock.
 *
 * The browser keeps one clock synced to this header (Frontend/src/utils/
 * serverClock.js) and decides every time-dependent thing with it -- whether a
 * test has opened, whether its window has closed, which button a card shows.
 * A student's device clock can be hours wrong; this one is the same for
 * everybody.
 *
 * The stamp is taken as the headers are written, not when the request
 * arrived, so a slow database query does not leave it stale by the time it
 * reaches the browser.
 */
const SERVER_TIME_HEADER = "X-Server-Time";

function stampServerTime(req, res, next) {
  const writeHead = res.writeHead;
  res.writeHead = function stampedWriteHead(...args) {
    if (!res.headersSent) res.setHeader(SERVER_TIME_HEADER, String(Date.now()));
    return writeHead.apply(this, args);
  };
  next();
}

module.exports = { stampServerTime, SERVER_TIME_HEADER };
