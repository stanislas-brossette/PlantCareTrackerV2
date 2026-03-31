module.exports = {
  apps: [
    {
      name: "plantCareTrackerV2",
      script: "dist/server.js",
      cwd: "/home/mirror/PlantCareTrackerV2/apps/api",
      interpreter: "/usr/bin/node",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 5000,
      autorestart: true,
      time: true,
    },
  ],
};
