import { listRankingSets } from "@/lib/rankings";
import { PageTitle } from "@/components/ui";
import NewRankingForm from "./NewRankingForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New Rankings" };

export default async function NewRankingPage() {
  const sets = await listRankingSets();
  return (
    <>
      <PageTitle
        title="Create your rankings"
        sub="No account needed. You'll get a private edit link, so bookmark it."
      />
      <NewRankingForm sets={sets.map((s) => ({ slug: s.slug, name: s.name, author: s.author }))} />
    </>
  );
}
