import { FastifyPluginAsync } from "fastify";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

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

      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      } catch {
        parsed = { raw };
      }

      // Auto-rename if plant still has a default name
      const defaultNamePattern = /^plant\s*\d*$/i;
      const updateData: Record<string, unknown> = {};

      if (
        parsed.nom_commun &&
        (defaultNamePattern.test(plant.name) || plant.name === "Nouvelle plante")
      ) {
        updateData.name = parsed.nom_commun;
      }

      // Apply monthly frequencies if returned by AI
      const waterFreq = parsed.arrosage_freq_par_mois;
      console.log("[identify] arrosage_freq_par_mois:", waterFreq, "isArray:", Array.isArray(waterFreq), "length:", Array.isArray(waterFreq) ? (waterFreq as unknown as number[]).length : "N/A");
      if (Array.isArray(waterFreq) && (waterFreq as unknown as number[]).length === 12) {
        updateData.wateringFreqByMonth = JSON.stringify(waterFreq);
        const nonZero = (waterFreq as unknown as number[]).filter((v) => v > 0);
        if (nonZero.length > 0) {
          updateData.wateringFreqDays = Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length);
        }
      }

      const fertFreq = parsed.fertilisation_freq_par_mois;
      console.log("[identify] fertilisation_freq_par_mois:", fertFreq, "isArray:", Array.isArray(fertFreq), "length:", Array.isArray(fertFreq) ? (fertFreq as unknown as number[]).length : "N/A");
      if (Array.isArray(fertFreq) && (fertFreq as unknown as number[]).length === 12) {
        updateData.fertilizingFreqByMonth = JSON.stringify(fertFreq);
        const nonZero = (fertFreq as unknown as number[]).filter((v) => v > 0);
        if (nonZero.length > 0) {
          updateData.fertilizingFreqDays = Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length);
        }
      }

      // Save description to notes if not already set (independent of name/frequency changes)
      if (parsed.description && !plant.notes) {
        updateData.notes = [
          parsed.description,
          parsed.arrosage ? `💧 Arrosage: ${parsed.arrosage}` : null,
          parsed.lumiere ? `☀️ Lumière: ${parsed.lumiere}` : null,
          parsed.temperature ? `🌡️ Température: ${parsed.temperature}` : null,
          parsed.toxicite ? `⚠️ Toxicité: ${parsed.toxicite}` : null,
          parsed.conseils ? `💡 Conseils: ${parsed.conseils}` : null,
        ].filter(Boolean).join("\n");
      }

      console.log("[identify] updateData keys:", Object.keys(updateData));
      if (Object.keys(updateData).length > 0) {
        await fastify.prisma.plant.update({
          where: { id: plant.id },
          data: updateData,
        });
        console.log("[identify] plant updated successfully");
      } else {
        console.log("[identify] nothing to update");
      }

      reply.send({ identification: parsed });
    }
  );
};

export default identifyRoutes;
