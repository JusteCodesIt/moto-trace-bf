const path = require("path");
const APP_DIR = "C:\\Users\\dell\\Downloads\\Files_AutoTrack_Firmware\\webapp";

module.exports = {
  apps: [
    {
      name: "autotrack",
      script: path.join(APP_DIR, ".output", "server", "index.mjs"),
      cwd: APP_DIR,
      interpreter: "node",
      interpreter_args: `--env-file=${path.join(APP_DIR, ".env")}`,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOST: "0.0.0.0",
      },
    },
  ],
};
