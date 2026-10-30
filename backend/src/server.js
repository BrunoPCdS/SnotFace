require("dotenv/config");

const cors = require("cors");
const express = require("express");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const Replicate = require("replicate");
const { PrismaClient } = require("./generated/prisma");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const port = Number(process.env.PORT || 3001);
const maxImageBytes = 8 * 1024 * 1024;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "12mb" }));

function imageFromDataUrl(value) {
  if (typeof value !== "string") {
    throw new Error("Imagem ausente.");
  }

  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Envie uma imagem JPEG, PNG ou WebP válida.");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > maxImageBytes) {
    throw new Error("A imagem deve ter entre 1 byte e 8 MB.");
  }

  return { buffer, mimeType: match[1] };
}

async function createMeme(image, mimeType, age) {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN n�o est� configurada no backend.");
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const choose = (items, count) => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled.slice(0, count);
  };
  const distortions = choose([
    "a comically oversized, crooked nose",
    "one eye much larger than the other, with a wandering gaze",
    "a runny, snotty nose with a visible mucus drip",
    "huge protruding ears",
    "an enormous overbite with goofy buck teeth",
    "wild, uneven eyebrows and a deeply furrowed brow",
    "a lopsided grin and one puffed cheek",
    "an exaggerated double chin and squashed cheeks",
    "a very long face with a tiny chin",
    "a tiny nose and comically wide nostrils",
    "messy hair sticking out in absurd directions",
    "uneven, crossed eyes and a slack-jawed expression",
    "a crooked smile with a few exaggerated crooked teeth",
    "one raised eyebrow and a wrinkled, scrunched-up forehead",
  ], 2 + Math.floor(Math.random() * 2));
  const visualStyle = choose([
    "rough editorial caricature with loose ink lines and watercolor washes",
    "rubber-hose cartoon with bold shapes and flat colors",
    "expressive hand-drawn comic illustration with scratchy outlines",
    "clay-like 3D cartoon with soft studio lighting",
    "retro newspaper caricature with limited colors and halftone texture",
    "playful digital painting with painterly brush strokes",
    "crude, intentionally wonky doodle with uneven outlines",
    "polished Saturday-morning animation cel with dramatic shadows",
  ], 1)[0];
  const framing = choose([
    "tight face close-up, looking straight at the viewer",
    "three-quarter view from slightly below, shoulders visible",
    "profile view with an exaggerated silhouette",
    "off-center head-and-shoulders portrait, tilted slightly",
    "wide composition with the person making a ridiculous pose",
  ], 1)[0];
  const output = await replicate.run("black-forest-labs/flux-kontext-pro", {
    input: {
      prompt: `Create a deliberately unflattering, ridiculous caricature of the person in the uploaded photo. The joke should be at the person's expense: make them look goofy, awkward, and a little ugly in a playful roast, not attractive or heroic. Keep enough core facial identity (hair, skin tone, facial hair, and recognizable face shape) that friends can still recognize them, but distort the face boldly.

For this generation, exaggerate these specific traits: ${distortions.join("; ")}. Do not add other random facial deformities. Avoid the familiar default of just making a round face with a big red nose and drool.

Expression: ${choose(["a smug, lopsided grin", "a confused squint", "an awkward open-mouthed grimace", "an overconfident smirk", "a startled, slack-jawed stare", "a strained fake smile"], 1)[0]}.
Composition: ${framing}.
Art direction: ${visualStyle}. Make this look clearly different from a generic glossy meme avatar. Vary line quality, palette, texture, and composition according to the chosen art direction. No text, captions, logos, or watermark.`,
      input_image: `data:${mimeType};base64,${image.toString("base64")}`,
      output_format: "jpg",
    },
  });

  const outputUrl = typeof output?.url === "function" ? output.url() : null;
  if (!outputUrl) throw new Error("O Replicate n�o retornou a imagem gerada.");
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error("N�o foi poss�vel baixar a imagem gerada pelo Replicate.");
  return Buffer.from(await response.arrayBuffer());
}
async function removeExpiredScans() {
  await prisma.scan.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/google", async (req, res, next) => {
  try {
    const { googleId, email, name, picture } = req.body;
    if (!googleId || !email) return res.status(400).json({ error: "Dados do Google incompletos." });
    const user = await prisma.user.upsert({
      where: { googleId: String(googleId) },
      update: { email: String(email), name: name || null, picture: picture || null },
      create: { googleId: String(googleId), email: String(email), name: name || null, picture: picture || null },
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/api/analyze", async (req, res, next) => {
  try {
    const userId = Number(req.body.userId);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "Usuário inválido." });
    const { buffer, mimeType } = imageFromDataUrl(req.body.imageBase64);
    const age = Number(req.body.age);
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      return res.status(400).json({ error: "Nao foi possivel estimar a idade localmente. Tente outra foto." });
    }
    let meme = null;
    try {
      meme = await createMeme(buffer, mimeType, age);
    } catch (error) {
      console.error("Falha ao gerar meme; salvando a estimativa de idade mesmo assim:", error.message);
    }
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const scan = await prisma.scan.create({
      data: {
        userId,
        age,
        imageData: buffer,
        imageMimeType: mimeType,
        memeData: meme,
        memeMimeType: meme ? "image/jpeg" : null,
        expiresAt,
      },
    });
    res.status(201).json({ id: scan.id, age, expiresAt, memeAvailable: Boolean(meme) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/scans", async (req, res, next) => {
  try {
    await removeExpiredScans();
    const userId = Number(req.query.userId);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "Usuário inválido." });
    const scans = await prisma.scan.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true, age: true, createdAt: true, expiresAt: true, memeMimeType: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ scans });
  } catch (error) {
    next(error);
  }
});

app.get("/api/scans/:id/:kind", async (req, res, next) => {
  try {
    await removeExpiredScans();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !["image", "meme"].includes(req.params.kind)) {
      return res.status(400).json({ error: "Recurso inválido." });
    }
    const scan = await prisma.scan.findUnique({ where: { id } });
    if (!scan || scan.expiresAt <= new Date()) return res.status(404).json({ error: "Imagem expirada ou não encontrada." });
    const data = req.params.kind === "meme" ? scan.memeData : scan.imageData;
    const mimeType = req.params.kind === "meme" ? scan.memeMimeType : scan.imageMimeType;
    if (!data || !mimeType) return res.status(404).json({ error: "Imagem não disponível." });
    res.type(mimeType).send(data);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/scans/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.query.userId || req.body?.userId);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Identificador inválido." });
    }

    const where = { id };
    if (Number.isInteger(userId)) {
      where.userId = userId;
    }

    const scan = await prisma.scan.findFirst({ where });
    if (!scan) {
      return res.status(404).json({ error: "Meme não encontrado ou já excluído." });
    }

    await prisma.scan.delete({ where: { id: scan.id } });
    res.json({ success: true, id: scan.id });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/scans", async (req, res, next) => {
  try {
    const userId = Number(req.query.userId || req.body?.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: "Usuário inválido." });
    }

    const result = await prisma.scan.deleteMany({ where: { userId } });
    res.json({ success: true, count: result.count });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Erro interno do servidor." });
});

app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));

setInterval(() => {
  removeExpiredScans().catch((error) => console.error("Falha ao remover imagens expiradas:", error));
}, 6 * 60 * 60 * 1000).unref();
