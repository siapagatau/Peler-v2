const {
  RankCardBuilder,
  Font,
  Builder,
  JSX,
  loadImage,
  LeaderboardBuilder,
} = require("canvacord");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const axios = require("axios");
const { PassThrough } = require("stream");
const path = require("path");

// Set path ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

Font.loadDefault();

// ---------- Custom Greetings Card (tidak berubah) ----------
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
    const image = await loadImage(
      avatar || "https://cdn.discordapp.com/embed/avatars/0.png"
    );
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
            message ||
              (type === "welcome"
                ? "Thanks for joining!"
                : "See you later!")
          )
        )
      )
    );
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Konversi media (gambar/GIF/video) ke WebP menggunakan ffmpeg
 * @param {string} url - URL file media
 * @param {number} quality - Kualitas WebP (0-100)
 * @returns {Promise<Buffer>} - Buffer hasil konversi WebP
 */
async function convertToWebP1(url, quality = 80) {
  const response = await axios({
    method: "GET",
    url: url,
    responseType: "stream",
  });

  const inputStream = response.data;
  const outputStream = new PassThrough();
  const chunks = [];

  return new Promise((resolve, reject) => {
    outputStream.on("data", (chunk) => chunks.push(chunk));
    outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    outputStream.on("error", reject);

    ffmpeg(inputStream)
      .inputOptions(["-analyzeduration 10M", "-probesize 10M"])
      // 🔽 Tambahkan filter scale untuk stretch ke 512x512
      .videoFilter("scale=512:512") 
      .outputOptions([
        "-c:v libwebp",
        `-quality ${quality}`,
        "-loop 0",
        "-preset default",
        "-an", // hapus audio
      ])
      .format("webp")
      .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .pipe(outputStream, { end: true });
  });
}

async function convertToWebP(url, quality = 80) {
  const response = await axios({ method: "GET", url, responseType: "stream" });
  const inputStream = response.data;
  const outputStream = new PassThrough();
  const chunks = [];

  return new Promise((resolve, reject) => {
    outputStream.on("data", (chunk) => chunks.push(chunk));
    outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    outputStream.on("error", reject);

    ffmpeg(inputStream)
      .inputOptions(["-analyzeduration 10M", "-probesize 10M"])
      .videoFilter("scale=512:512") // stretch tetap dipertahankan
      .outputOptions([
        "-c:v libwebp_anim",      // gunakan encoder animasi
        `-quality ${quality}`,
        "-loop 0",                // looping tak terbatas
        "-vsync 0",               // pertahankan timing asli
        "-g 1",                   // keyframe tiap frame (animasi lancar)
        "-pix_fmt yuv420p",       // kompatibilitas maksimal
        "-an"                     // hapus audio
      ])
      .format("webp")
      .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .pipe(outputStream, { end: true });
  });
}

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { type } = req.query;

  // --- CONVERT MEDIA TO WEBP (GET dengan URL) ---
  if (type === "convert") {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Convert hanya mendukung metode GET." });
    }

    const { url, quality } = req.query;
    if (!url) {
      return res.status(400).json({ error: "Parameter 'url' wajib diisi." });
    }

    // Validasi URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "URL tidak valid." });
    }

    const q = parseInt(quality) || 80;
    if (q < 0 || q > 100) {
      return res.status(400).json({ error: "Quality harus antara 0-100." });
    }

    try {
      const webpBuffer = await convertToWebP(url, q);
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(webpBuffer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Gagal konversi ke WebP", detail: err.message });
    }
    return;
  }

  // --- LEADERBOARD (POST) ---
  if (type === "leaderboard") {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Leaderboard requires POST method." });
    }

    try {
      const { header, players, background, variant } = req.body;

      if (!players || !Array.isArray(players)) {
        return res.status(400).json({ error: "Missing players array." });
      }

      const safeHeader = {
        title: header?.title || "Leaderboard",
        image: header?.image || "https://github.com/neplextech.png",
        subtitle: header?.subtitle || "0 members",
      };

      const limitedPlayers = players.slice(0, 10);
      const lb = new LeaderboardBuilder()
        .setHeader(safeHeader)
        .setPlayers(limitedPlayers);

      if (background) lb.setBackground(background);
      if (variant === "horizontal") lb.setVariant("horizontal");
      else lb.setVariant("default");

      const imageBuffer = await lb.build({ format: "png" });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.send(imageBuffer);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to generate leaderboard", detail: err.message });
    }
  }

  // --- RANK, WELCOME, GOODBYE (GET) ---
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET for rank/welcome/goodbye, or POST for leaderboard." });
  }

  if (!type) {
    return res.status(400).json({ error: "Missing 'type' parameter." });
  }

  try {
    let imageBuffer;

    if (type === "rank") {
      const { username, displayName, avatar, currentXP, requiredXP, level, rank, status, background } = req.query;
      const card = new RankCardBuilder()
        .setDisplayName(displayName || username || "User")
        .setUsername(username ? `@${username}` : undefined)
        .setAvatar(avatar || "https://cdn.discordapp.com/embed/avatars/0.png")
        .setCurrentXP(parseInt(currentXP) || 0)
        .setRequiredXP(parseInt(requiredXP) || 100)
        .setLevel(parseInt(level) || 1)
        .setRank(parseInt(rank) || 1)
        .setOverlay(90);
      if (status && ["online", "idle", "dnd", "offline"].includes(status)) card.setStatus(status);
      if (background) card.setBackground(background);
      else card.setBackground("#2C2F33");
      imageBuffer = await card.build({ format: "png" });
    } 
    else if (type === "welcome" || type === "goodbye") {
      const { displayName, avatar, message } = req.query;
      const card = new GreetingsCard()
        .setType(type)
        .setDisplayName(displayName || "User")
        .setAvatar(avatar || "https://cdn.discordapp.com/embed/avatars/0.png")
        .setMessage(message || (type === "welcome" ? "Welcome to the server!" : "We'll miss you!"));
      imageBuffer = await card.build({ format: "png" });
    } 
    else {
      return res.status(400).json({ error: "Invalid type. Use 'welcome', 'goodbye', 'rank', or 'leaderboard'." });
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(imageBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate image", detail: err.message });
  }
};
