const { RankCardBuilder, Font, Builder, JSX, loadImage } = require("canvacord");

// Load default font (wajib)
Font.loadDefault();

// ---------- Custom Greetings Card (Welcome/Goodbye) ----------
class GreetingsCard extends Builder {
  constructor() {
    super(930, 280);
    this.bootstrap({
      displayName: "",
      type: "welcome",
      avatar: "",
      message: "",
    });
  }

  setDisplayName(value) {
    this.options.set("displayName", value);
    return this;
  }

  setType(value) {
    this.options.set("type", value);
    return this;
  }

  setAvatar(value) {
    this.options.set("avatar", value);
    return this;
  }

  setMessage(value) {
    this.options.set("message", value);
    return this;
  }

  async render() {
    const { type, displayName, avatar, message } = this.options.getOptions();
    const image = await loadImage(avatar || "https://cdn.discordapp.com/embed/avatars/0.png");

    return JSX.createElement(
      "div",
      {
        className:
          "h-full w-full flex flex-col items-center justify-center bg-[#23272A] rounded-xl",
      },
      JSX.createElement(
        "div",
        {
          className:
            "px-6 bg-[#2B2F35AA] w-[96%] h-[84%] rounded-lg flex items-center",
        },
        JSX.createElement("img", {
          src: image.toDataURL(),
          className: "flex h-24 w-24 rounded-full mr-6",
        }),
        JSX.createElement(
          "div",
          { className: "flex flex-col" },
          JSX.createElement(
            "h1",
            { className: "text-5xl text-white font-bold m-0" },
            type === "welcome" ? "Welcome" : "Goodbye",
            ",",
            " ",
            JSX.createElement(
              "span",
              { className: "text-blue-500" },
              displayName || "User",
              "!"
            )
          ),
          JSX.createElement(
            "p",
            { className: "text-gray-300 text-3xl m-0 mt-2" },
            message || (type === "welcome" ? "Thanks for joining!" : "See you later!")
          )
        )
      )
    );
  }
}

// ---------- Vercel Serverless Function ----------
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const { type, ...params } = req.query;

  if (!type) {
    return res.status(400).json({ error: "Missing 'type' parameter. Use 'welcome', 'goodbye', or 'rank'." });
  }

  try {
    let imageBuffer;

    if (type === "rank") {
      const {
        username,
        displayName,
        avatar,
        currentXP,
        requiredXP,
        level,
        rank,
        status,
        background,
      } = params;

      const card = new RankCardBuilder()
        .setDisplayName(displayName || username || "User")
        .setUsername(username ? `@${username}` : undefined)
        .setAvatar(avatar || "https://cdn.discordapp.com/embed/avatars/0.png")
        .setCurrentXP(parseInt(currentXP) || 0)
        .setRequiredXP(parseInt(requiredXP) || 100)
        .setLevel(parseInt(level) || 1)
        .setRank(parseInt(rank) || 1)
        .setOverlay(90);

      if (status && ["online", "idle", "dnd", "offline"].includes(status)) {
        card.setStatus(status);
      }

      if (background) {
        if (background.startsWith("#")) {
          card.setBackground(background);
        } else {
          card.setBackground(background); // URL atau path lokal
        }
      } else {
        card.setBackground("#2C2F33");
      }

      imageBuffer = await card.build({ format: "png" });
    } 
    else if (type === "welcome" || type === "goodbye") {
      const { displayName, avatar, message } = params;
      const card = new GreetingsCard()
        .setType(type)
        .setDisplayName(displayName || "User")
        .setAvatar(avatar || "https://cdn.discordapp.com/embed/avatars/0.png")
        .setMessage(message || (type === "welcome" ? "Welcome to the server!" : "We'll miss you!"));

      imageBuffer = await card.build({ format: "png" });
    }
    else {
      return res.status(400).json({ error: "Invalid type. Use 'welcome', 'goodbye', or 'rank'." });
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(imageBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate image", detail: err.message });
  }
};