import "dotenv/config";
import { prisma } from "../index";

type SeedModel = {
  slug: string;
  name: string;
  companyName: string;
  minPlan?: "free" | "pro";
  providers: {
    providerName: string;
    inputTokenCost: number;
    outputTokenCost: number;
  }[];
};

const companies = [
  { name: "Google", website: "https://google.com" },
  { name: "Groq", website: "https://groq.com" },
  { name: "Cloudflare", website: "https://developers.cloudflare.com/workers-ai/" },
  { name: "OpenAI", website: "https://openai.com" },
  { name: "Anthropic", website: "https://anthropic.com" },
];

const providers = [
  { name: "Google API", website: "https://ai.google.dev" },
  { name: "Google Vertex", website: "https://cloud.google.com/vertex-ai" },
  { name: "Groq API", website: "https://console.groq.com" },
  { name: "Cloudflare Workers AI", website: "https://developers.cloudflare.com/workers-ai/" },
  { name: "OpenAI API", website: "https://platform.openai.com" },
  { name: "Claude API", website: "https://anthropic.com/claude" },
];

const models: SeedModel[] = [
  {
    slug: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    companyName: "Google",
    minPlan: "pro",
    providers: [
      { providerName: "Google API", inputTokenCost: 0.5, outputTokenCost: 3.0 },
      { providerName: "Google Vertex", inputTokenCost: 0.5, outputTokenCost: 3.0 },
    ],
  },
  {
    slug: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    companyName: "Google",
    providers: [
      { providerName: "Google API", inputTokenCost: 0.1, outputTokenCost: 0.4 },
      { providerName: "Google Vertex", inputTokenCost: 0.1, outputTokenCost: 0.4 },
    ],
  },
  {
    slug: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    companyName: "Google",
    providers: [
      { providerName: "Google API", inputTokenCost: 0.3, outputTokenCost: 2.5 },
      { providerName: "Google Vertex", inputTokenCost: 0.3, outputTokenCost: 2.5 },
    ],
  },
  {
    slug: "groq/llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant",
    companyName: "Groq",
    providers: [
      { providerName: "Groq API", inputTokenCost: 0.05, outputTokenCost: 0.08 },
    ],
  },
  {
    slug: "cloudflare/llama-3.1-8b-instruct",
    name: "Llama 3.1 8B Instruct",
    companyName: "Cloudflare",
    providers: [
      {
        providerName: "Cloudflare Workers AI",
        inputTokenCost: 0.2,
        outputTokenCost: 0.2,
      },
    ],
  },
  {
    slug: "cloudflare/llama-3.1-8b-instruct-fast",
    name: "Llama 3.1 8B Instruct Fast",
    companyName: "Cloudflare",
    providers: [
      {
        providerName: "Cloudflare Workers AI",
        inputTokenCost: 0.2,
        outputTokenCost: 0.2,
      },
    ],
  },
  {
    slug: "openai/gpt-5nano",
    name: "GPT-5 Nano",
    companyName: "OpenAI",
    minPlan: "pro",
    providers: [
      { providerName: "OpenAI API", inputTokenCost: 0.1, outputTokenCost: 0.4 },
    ],
  },
  {
    slug: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    companyName: "OpenAI",
    minPlan: "pro",
    providers: [
      { providerName: "OpenAI API", inputTokenCost: 0.4, outputTokenCost: 1.6 },
    ],
  },
  {
    slug: "anthropic/claude-3-5-haiku",
    name: "Claude 3.5 Haiku",
    companyName: "Anthropic",
    minPlan: "pro",
    providers: [
      { providerName: "Claude API", inputTokenCost: 0.8, outputTokenCost: 4.0 },
    ],
  },
];

async function ensureCompany(name: string, website: string) {
  return prisma.company.upsert({
    where: { name },
    update: { website },
    create: { name, website },
  });
}

async function ensureProvider(name: string, website: string) {
  return prisma.provider.upsert({
    where: { name },
    update: { website },
    create: { name, website },
  });
}

async function ensureModel(model: SeedModel) {
  const company = await prisma.company.findUnique({
    where: { name: model.companyName },
  });

  if (!company) {
    throw new Error(`Missing company for model seed: ${model.companyName}`);
  }

  return prisma.model.upsert({
    where: { slug: model.slug },
    update: {
      name: model.name,
      companyId: company.id,
      minPlan: model.minPlan ?? "free",
    },
    create: {
      slug: model.slug,
      name: model.name,
      companyId: company.id,
      minPlan: model.minPlan ?? "free",
    },
  });
}

async function ensureMapping(modelId: number, providerId: number, inputTokenCost: number, outputTokenCost: number) {
  const existingMapping = await prisma.modelProviderMapping.findFirst({
    where: {
      modelId,
      providerId,
    },
  });

  if (existingMapping) {
    return prisma.modelProviderMapping.update({
      where: { id: existingMapping.id },
      data: {
        inputTokenCost,
        outputTokenCost,
      },
    });
  }

  return prisma.modelProviderMapping.create({
    data: {
      modelId,
      providerId,
      inputTokenCost,
      outputTokenCost,
    },
  });
}

async function main() {
  for (const company of companies) {
    await ensureCompany(company.name, company.website);
  }

  for (const provider of providers) {
    await ensureProvider(provider.name, provider.website);
  }

  for (const model of models) {
    const modelRow = await ensureModel(model);

    for (const mapping of model.providers) {
      const providerRow = await prisma.provider.findUnique({
        where: { name: mapping.providerName },
      });

      if (!providerRow) {
        throw new Error(`Missing provider for mapping seed: ${mapping.providerName}`);
      }

      await ensureMapping(modelRow.id, providerRow.id, mapping.inputTokenCost, mapping.outputTokenCost);
    }
  }

  console.log(`Seeded ${companies.length} companies, ${providers.length} providers, and ${models.length} models.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
