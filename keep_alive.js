// keep_alive.js
const express = require('express');
const app = express();

app.all("/", (req, res) => {
  res.send("✅ AFK Bot is alive!");
});

function keepAlive() {
  app.listen(3000, () => {
    console.log("✅ Server is running on port 3000");
  });
}

module.exports = keepAlive;
