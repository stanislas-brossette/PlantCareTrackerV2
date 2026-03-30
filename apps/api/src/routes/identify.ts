import { FastifyPluginAsync } from "fastify";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { recordChanges } from "../utils/changes.js";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads"));

interface IdentificationResult {
  nom_commun?: string;
  nom_latin?: string;
  famille?: string;
  confidence?: number;
  care_confidence?: number;
  needs_confirmation?: boolean;
  alternatives?: Array<{
    nom_commun?: string;
    nom_latin?: string;
    confidence?: number;
  }>;
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

interface RetryContext {
  reason?: string;
  hints?: string[];
  freeText?: string;
  previousIdentification?: Partial<IdentificationResult>;
}

const MIN_NAME_CONFIDENCE = 0.65;
const MIN_DETAILS_CONFIDENCE = 0.55;
const MIN_PLANNING_CONFIDENCE = 0.78;
const MIN_CARE_CONFIDENCE = 0.72;

const LOW_WATER_KEYWORDS = [
  "zamioculcas",
  "zamiifolia",
  "zz plant",
  "sansevieria",
  "snake plant",
  "succulent",
  "succulente",
  "cactus",
  "crassula",
  "haworthia",
  "aloe",
  "tolere la secheresse",
  "tolere la sécheresse",
  "peu d'eau",
  "peu d eau",
  "sol sec",
  "laisser secher",
  "laisser sécher",
  "completement sec",
  "complètement sec",
  "dry between waterings",
  "drought",
];

const LOW_WATER_WATERING_FLOOR = [28, 28, 21, 18, 14, 14, 14, 14, 18, 21, 28, 28];
const LOW_WATER_FERTILIZING_MONTHS = new Set([2, 3, 4, 5, 6, 7, 8]);

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

function normalizeMonthlyFrequency(
  values: unknown,
  { max }: { max: number }
): number[] | undefined {
  if (!Array.isArray(values) || values.length !== 12) return undefined;

  return values.map((value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(max, Math.round(value)));
  });
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function normalizeAlternatives(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const normalized = value
    .slice(0, 3)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const alternative = item as Record<string, unknown>;

      return {
        nom_commun:
          typeof alternative.nom_commun === "string" ? alternative.nom_commun.trim() : undefined,
        nom_latin:
          typeof alternative.nom_latin === "string" ? alternative.nom_latin.trim() : undefined,
        confidence: normalizeConfidence(alternative.confidence),
      };
    })
    .filter((item) => Boolean(item && (item.nom_commun || item.nom_latin)));

  return normalized as Array<{
    nom_commun?: string;
    nom_latin?: string;
    confidence?: number;
  }>;
}

function isLowWaterPlant(result: IdentificationResult) {
  const haystack = [
    result.nom_commun,
    result.nom_latin,
    result.description,
    result.arrosage,
    result.conseils,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return LOW_WATER_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function normalizeIdentificationResult(result: IdentificationResult): IdentificationResult {
  const normalized: IdentificationResult = { ...result };

  normalized.confidence = normalizeConfidence(result.confidence);
  normalized.care_confidence = normalizeConfidence(result.care_confidence);
  normalized.alternatives = normalizeAlternatives(result.alternatives);
  normalized.needs_confirmation =
    typeof result.needs_confirmation === "boolean"
      ? result.needs_confirmation
      : (normalized.confidence ?? 0) < MIN_NAME_CONFIDENCE;

  const watering = normalizeMonthlyFrequency(result.arrosage_freq_par_mois, { max: 90 });
  const fertilizing = normalizeMonthlyFrequency(result.fertilisation_freq_par_mois, { max: 120 });

  if (watering) {
    normalized.arrosage_freq_par_mois = watering;
  }

  if (fertilizing) {
    normalized.fertilisation_freq_par_mois = fertilizing;
  }

  if (isLowWaterPlant(normalized)) {
    if (normalized.arrosage_freq_par_mois) {
      normalized.arrosage_freq_par_mois = normalized.arrosage_freq_par_mois.map((value, month) =>
        value === 0 ? 0 : Math.max(value, LOW_WATER_WATERING_FLOOR[month])
      );
    }

    if (normalized.fertilisation_freq_par_mois) {
      normalized.fertilisation_freq_par_mois = normalized.fertilisation_freq_par_mois.map(
        (value, month) => {
          if (!LOW_WATER_FERTILIZING_MONTHS.has(month)) return 0;
          if (value === 0) return 0;
          return Math.max(value, 30);
        }
      );
    }
  }

  return normalized;
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

function buildRetryPromptSection(retryContext?: RetryContext) {
  if (!retryContext) return "";

  const parts = [
    retryContext.reason ? `Raison du doute utilisateur : ${retryContext.reason}` : null,
    retryContext.hints?.length ? `Indices utilisateur : ${retryContext.hints.join(", ")}` : null,
    retryContext.freeText ? `Texte libre utilisateur : ${retryContext.freeText}` : null,
    retryContext.previousIdentification
      ? `Première proposition probablement erronée : ${JSON.stringify(retryContext.previousIdentification)}`
      : null,
  ].filter(Boolean);

  if (parts.length === 0) return "";

  return `\nContexte supplémentaire fourni par l'utilisateur :
${parts.join("\n")}

La première identification peut être fausse. Réévalue l'image en tenant fortement compte de ces indices.`;
}

async function analyzeImageBuffer(imageBuffer: Buffer, retryContext?: RetryContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const imageData = imageBuffer.toString("base64");

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
              detail: "high",
            },
          },
          {
            type: "text",
            text: `Identifie cette plante et réponds en JSON avec les champs suivants:
{
  "nom_commun": "...",
  "nom_latin": "...",
  "famille": "...",
  "confidence": 0.0,
  "care_confidence": 0.0,
  "needs_confirmation": true,
  "alternatives": [
    { "nom_commun": "...", "nom_latin": "...", "confidence": 0.0 }
  ],
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
Les champs "confidence" et "care_confidence" doivent être entre 0 et 1.
"confidence" = confiance sur l'identification botanique.
"care_confidence" = confiance sur la fiabilité des conseils d'entretien.
"needs_confirmation" doit valoir true si l'identification n'est pas assez sûre pour être considérée comme fiable.
Le tableau "alternatives" doit contenir jusqu'à 3 possibilités si tu hésites.
Pour les tableaux de fréquences: 12 valeurs entières (Jan à Déc), en nombre de JOURS ENTRE CHAQUE SOIN. Plus le nombre est grand, moins le soin est fréquent. Mettre 0 si le soin n'est pas recommandé ce mois-ci.
Sois réaliste et plutôt conservateur. Pour les plantes d'intérieur sobres en eau ou tolérantes à la sécheresse (par ex. Zamioculcas, Sansevieria, succulentes, cactus), évite les fréquences trop agressives:
- arrosage souvent de l'ordre de 14 à 30+ jours selon la saison, plus espacé en hiver
- fertilisation généralement absente en hiver, puis espacée au printemps/été
N'utilise des arrosages tous les 4 à 7 jours que pour des plantes qui en ont réellement besoin.
Si l'identification est incertaine, préfère une réponse honnête avec alternatives plutôt qu'une espèce précise inventée.
Si les conseils d'entretien sont trop incertains, laisse les tableaux absents ou vides au lieu d'inventer un planning précis.
Réponds UNIQUEMENT en JSON, sans aucun texte autour.${buildRetryPromptSection(retryContext)}`,
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  try {
    return normalizeIdentificationResult(
      JSON.parse(raw.replace(/```json|```/g, "").trim()) as IdentificationResult
    );
  } catch {
    return { raw } satisfies IdentificationResult;
  }
}

function readRetryContextField(rawField: unknown) {
  const field = Array.isArray(rawField) ? rawField[0] : rawField;
  if (!field || typeof field !== "object" || !("value" in field)) {
    return undefined;
  }

  const value = (field as { value?: unknown }).value;
  if (typeof value !== "string") {
    return undefined;
  }

  return value;
}

const identifyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/preview",
    async (req, reply) => {
      const file = await req.file();
      if (!file) return reply.status(400).send({ error: "No file uploaded" });
      const retryContextRaw = readRetryContextField(file.fields.retryContext);
      let retryContext: RetryContext | undefined;
      if (retryContextRaw) {
        try {
          retryContext = JSON.parse(retryContextRaw) as RetryContext;
        } catch {
          return reply.status(400).send({ error: "Invalid retry context" });
        }
      }

      try {
        const parsed = await analyzeImageBuffer(await file.toBuffer(), retryContext);
        reply.send({
          identification: parsed,
          availableUpdates: summarizeAvailableUpdates(parsed),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erreur lors de l'identification";
        const statusCode = message === "OpenAI API key not configured" ? 503 : 500;
        reply.status(statusCode).send({ error: message });
      }
    }
  );

  fastify.post<{ Params: { plantId: string }; Body: { retryContext?: RetryContext } }>(
    "/:plantId",
    async (req, reply) => {
      const plant = await fastify.prisma.plant.findUnique({
        where: { id: req.params.plantId },
      });
      if (!plant) return reply.status(404).send({ error: "Plant not found" });

      if (!plant.photoUrl) {
        return reply.status(400).send({ error: "Plant has no photo" });
      }

      // Read the image from disk and encode as base64
      const filename = path.basename(plant.photoUrl);
      const filepath = path.join(UPLOAD_DIR, filename);
      let buffer: Buffer;
      try {
        buffer = await fs.readFile(filepath);
      } catch {
        return reply.status(404).send({ error: "Photo file not found" });
      }

      try {
        const parsed = await analyzeImageBuffer(buffer, req.body?.retryContext);
        return reply.send({
          identification: parsed,
          availableUpdates: summarizeAvailableUpdates(parsed),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erreur lors de l'identification";
        const statusCode = message === "OpenAI API key not configured" ? 503 : 500;
        return reply.status(statusCode).send({ error: message });
      }
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
    async (req, reply) => {
      const plant = await fastify.prisma.plant.findUnique({
        where: { id: req.params.plantId },
      });
      if (!plant) return reply.status(404).send({ error: "Plant not found" });

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
      await recordChanges(fastify, plant.gardenId, [
        { entityType: "PLANT", entityId: updatedPlant.id, changeType: "UPSERT" },
      ]);

      reply.send({
        ok: true,
        applied: apply,
        plantId: updatedPlant.id,
      });
    }
  );
};

export default identifyRoutes;
