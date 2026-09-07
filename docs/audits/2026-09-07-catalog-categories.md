# Catalog category repair

Production inspection found all 120 editions had null `categories_json`; none of the 125 copies had category overrides. There are 116 active editions/copies. Migration 0009 added storage but did not apply the previously prepared 26-book audit. The recent audience migration populated only `is_youth_book`.

Migration 0013 fills null categories for the 116 active ISBNs: 115 suggestions, one review (`9781324050629`, Replaceable You). Archived-only editions and existing category data remain untouched. Copy overrides are never modified. SQL is generated from the adjacent audit by `scripts/backfill-catalog-categories.ts`; the regression test checks exact migration equality and repeat safety.

Evidence combines the original 26-book audit, cached exact-ISBN Google categories collected on September 7, and individual editorial review of stored descriptions/edition metadata. Editorial judgments are explicitly recorded as audit evidence, never attributed to publisher-assigned Thema or the automatic mapper. Fresh retrieval was blocked by automatic approval review; no new catalog lookup batch ran.

The mapper now retains explicit youth fiction/comics/fantasy categories independently of audience. Added browsing categories cover cooking, crafts, sports, technology and computing. The UI retains its existing bilingual group labels. These are browsing mappings, not full ONIX Thema records with main subjects and age qualifiers.

Vocabulary references: [food](https://ns.editeur.org/thema/en/WB), [crafts](https://ns.editeur.org/thema/en/W), [sports](https://ns.editeur.org/thema/en/SC), [technology](https://ns.editeur.org/thema/en/TB), [computing](https://ns.editeur.org/thema/en/UB), [youth fiction](https://ns.editeur.org/thema/en/YF), [youth fantasy](https://ns.editeur.org/thema/en/YFH).

Replaceable You remains review-only because the available category is Medical and the stored description is incomplete; this repair does not invent a more specific category. Missing future provider evidence can still produce an uncategorized book; lookup does not incur additional requests.
