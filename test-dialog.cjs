const { app, dialog } = require("electron");

app.whenReady().then(async () => {
  console.log("App ready, opening dialog...");
  try {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    console.log("Dialog result:", result);
  } catch (err) {
    console.error("Error:", err);
  }
  app.quit();
});
