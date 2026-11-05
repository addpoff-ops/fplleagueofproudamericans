// Loads data/official-rankings-2026-27.json (built from the FWD/MID/DEF/GK (A)
// sheets of FPL_26-27_Analysis_Sheet.xlsx, with names matched to Sleeper player
// IDs) and makes it the site's official rankings.
//
//   npm run import:official            # always creates a fresh official list
//   tsx scripts/import-official.ts --if-empty   # only if no official list exists
//
// The deploy build runs the --if-empty form, so a new site starts with these
// rankings. After that, edit them on the website (Edit button + ADMIN_KEY).
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { hashKey, newEditKey, slugify } from "../src/lib/keys";

interface Data {
  name: string;
  author: string;
  source: string;
  positions: Record<string, { playerId: string; tier: string }[]>;
}

async function main() {
  const prisma = new PrismaClient();
  if (process.argv.includes("--if-empty") && (await prisma.rankingSet.count({ where: { isOfficial: true } })) > 0) {
    console.log("Official rankings already exist, skipping import.");
    await prisma.$disconnect();
    return;
  }
  const data: Data = JSON.parse(readFileSync(new URL("../data/official-rankings-2026-27.json", import.meta.url), "utf8"));
  const editKey = newEditKey();
  const entries = Object.entries(data.positions).flatMap(([pos, list]) =>
    list.map((e, i) => ({ playerId: e.playerId, pos, rank: i + 1, tier: e.tier })),
  );
  const set = await prisma.$transaction(async (tx) => {
    await tx.rankingSet.updateMany({ where: { isOfficial: true }, data: { isOfficial: false } });
    return tx.rankingSet.create({
      data: {
        slug: slugify(data.name),
        name: data.name,
        author: data.author,
        description: `Imported from ${data.source}.`,
        isOfficial: true,
        editKeyHash: await hashKey(editKey),
        entries: { create: entries },
      },
    });
  });
  console.log(`Imported ${entries.length} players into "${set.name}".`);
  console.log(`Edit with your ADMIN_KEY, or this private link: /rankings/${set.slug}?key=${editKey}`);
  await prisma.$disconnect();
}

main();
