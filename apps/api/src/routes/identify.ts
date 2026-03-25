import { FastifyPluginAsync } from "fastify";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

interface IdentificationResult {
  nom_commun?: string;
  nom_latin?: string;
  famille?: string;
  description?: string;
  arrosage?: string;
  arrosage_freq_par_mois?: number[];
  fertilisation?: string;
  fertilisation_freq_par_mois?: number[];
  lumiere?: string;
  temperature?: string;
  toxicite?: string;
  conseils?: string;
  raw?: string;
}

function buildNotes(result: IdentificationResult) {
  return [
    result.description ?? null,
    result.nom_latin ? `Nom latin : ${result.nom_latin}` : null,
    result.famille ? `Famille : ${result.famille}` : null,
    result.arrosage ? `💧 Arrosage : ${result.arrosage}` : null,
    result.fertilisation ? `🌿 Fertilisation : ${result.fertilisation}` : null,
    result.lumiere ? `☀️ Lumière : ${result.lumiere}` : null,
    result.temperature ? `🌡️ Température : ${result.temperature}` : null,
    result.toxicite ? `⚠️ Toxicité : ${result.toxicite}` : null,
    result.conseils ? `💡 Conseils : ${result.conseils}` : null,
  ].filter(Boolean).join("\n\n");
}

function buildPlanningUpdate(result: IdentificationResult) {
  const updateData: Record<string, unknown> = {};

  const waterFreq = result.arrosage_freq_par_mois;
  if (Array.isArray(waterFreq) && waterFreq.length === 12) {
    updateData.wateringFreqByMonth = JSON.stringify(waterFreq);
    const nonZero = waterFreq.filter((value) => value > 0);
    updateData.wateringFreqDays =
      nonZero.length > 0
        ? Math.round(nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length)
        : null;
  }

  const fertFreq = result.fertilisation_freq_par_mois;
  if (Array.isArray(fertFreq) && fertFreq.length === 12) {
    updateData.fertilizingFreqByMonth = JSON.stringify(fertFreq);
    const nonZero = fertFreq.filter((value) => value > 0);
    updateData.fertilizingFreqDays =
      nonZero.length > 0
        ? Math.round(nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length)
        : null;
  }

  return updateData;
}

function summarizeAvailableUpdates(result: IdentificationResult) {
  const details = Boolean(
    result.description ||
      result.nom_latin ||
      result.famille ||
      result.arrosage ||
      result.fertilisation ||
      result.lumiere ||
      result.temperature ||
      result.toxicite ||
      result.conseils
  );

  return {
    name: Boolean(result.nom_commun),
    details,
    planning: Boolean(
      (Array.isArray(result.arrosage_freq_par_mois) && result.arrosage_freq_par_mois.length === 12) ||
        (Array.isArray(result.fertilisation_freq_par_mois) &&
          result.fertilisation_freq_par_mois.length === 12)
    ),
  };
}

const identifyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { plantId: string } }>(
    "/:plantId",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({ error: "OpenAI API key not configured" });
      }

      const plant = await fastify.prisma.plant.findUnique({
        where: { id: req.params.plantId },
      });
      if (!plant) return reply.status(404).send({ error: "Plant not found" });

      const member = await fastify.prisma.gardenMember.findUnique({
        where: { userId_gardenId: { userId: req.userId, gardenId: plant.gardenId } },
      });
      if (!member) return reply.status(403).send({ error: "Forbidden" });

      if (!plant.photoUrl) {
        return reply.status(400).send({ error: "Plant has no photo" });
      }

      // Read the image from disk and encode as base64
      const filename = path.basename(plant.photoUrl);
      const filepath = path.join(UPLOAD_DIR, filename);
      let imageData: string;
      try {
        const buffer = await fs.readFile(filepath);
        imageData = buffer.toString("base64");
      } catch {
        return reply.status(404).send({ error: "Photo file not found" });
      }

      const openai = new OpenAI({ apiKey });
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

      const response = await openai.chat.completions.create({
        model,
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0"),
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageData}`,
                  detail: "low",
                },
              },
              {
                type: "text",
                text: `Identifie cette plante et réponds en JSON avec les champs suivants:
{
  "nom_commun": "...",
  "nom_latin": "...",
  "famille": "...",
  "description": "...",
  "arrosage": "description textuelle de l'arrosage",
  "arrosage_freq_par_mois": [7,7,6,5,4,4,4,4,5,6,7,7],
  "fertilisation": "description textuelle de la fertilisation",
  "fertilisation_freq_par_mois": [0,0,30,21,21,14,14,21,30,0,0,0],
  "lumiere": "...",
  "temperature": "...",
  "toxicite": "...",
  "conseils": "..."
}
Pour les tableaux de fréquences: 12 valeurs entières (Jan à Déc), en nombre de JOURS entre chaque soin. Mettre 0 si le soin n'est pas recommandé ce mois-ci (ex: pas de fertilisation en hiver).
Réponds UNIQUEMENT en JSON, sans aucun texte autour.`,
              },
            ],
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";

      let parsed: IdentificationResult;
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      } catch {
        parsed = { raw };
      }

      reply.send({
        identification: parsed,
        availableUpdates: summarizeAvailableUpdates(parsed),
      });
    }
  );

  fastify.patch<{
    Params: { plantId: string };
    Body: {
      identification: IdentificationResult;
      apply: {
        name?: boolean;
        details?: boolean;
        planning?: boolean;
      };
    };
  }>(
    "/:plantId",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const plant = await fastify.prisma.plant.findUnique({
        where: { id: req.params.plantId },
      });
      if (!plant) return reply.status(404).send({ error: "Plant not found" });

      const member = await fastify.prisma.gardenMember.findUnique({
        where: { userId_gardenId: { userId: req.userId, gardenId: plant.gardenId } },
      });
      if (!member) return reply.status(403).send({ error: "Forbidden" });

      const { identification, apply } = req.body;
      const updateData: Record<string, unknown> = {};

      if (apply.name && identification.nom_commun) {
        updateData.name = identification.nom_commun;
      }

      if (apply.details) {
        const notes = buildNotes(identification);
        if (notes) {
          updateData.notes = notes;
        }
      }

      if (apply.planning) {
        Object.assign(updateData, buildPlanningUpdate(identification));
      }

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({ error: "Nothing to apply" });
      }

      const updatedPlant = await fastify.prisma.plant.update({
        where: { id: plant.id },
        data: updateData,
      });

      reply.send({
        ok: true,
        applied: apply,
        plantId: updatedPlant.id,
      });
    }
  );
};

export default identifyRoutes;
