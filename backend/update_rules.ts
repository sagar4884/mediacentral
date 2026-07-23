import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rules = `1. Score higher for movies with high IMDB scores. Score lower for movies with poor IMDB scores.
2. Score higher for all media watched at least once on Tautulli, with a significant boost for frequently re-watched titles. Score lower for media that has zero views, especially if it has been available on the server for over a year.
3. Score higher for media requested by or tagged for specific users (e.g., 1-bladelight, 22-peshiepesh, 30-sneekie).
4. Score higher for content sourced from curated lists (e.g., TMDB, Most Watched) and automated retention tags (ai-keep, ai-tautulli-keep).
5. Score higher for international cinema, specifically Bollywood, Japanese, and Chinese films.
6. Score higher for seasonal and holiday content, such as romantic Christmas movies.
7. Score higher for stand-up comedy specials.
8. Score lower for media where a watch session was abandoned (e.g., a user stopped watching before 50% and hasn't resumed in weeks).
9. Score lower for content that has no user requests, belongs to no curated lists, and lacks any retention tags.`;

async function update() {
  await prisma.setting.upsert({
    where: { key: 'RadarrAIRules' },
    update: { value: rules },
    create: { key: 'RadarrAIRules', value: rules }
  });
  await prisma.setting.upsert({
    where: { key: 'SonarrAIRules' },
    update: { value: rules },
    create: { key: 'SonarrAIRules', value: rules }
  });
  console.log("Rules updated.");
  process.exit(0);
}

update();
