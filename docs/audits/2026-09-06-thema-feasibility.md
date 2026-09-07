# Production book categorization feasibility audit

Date: 2026-09-06. Production reads only; no application, schema, configuration, or production data changes.

**Finding:** Thema is a workable shared vocabulary for this catalog. ISBN-matched retailer categories plus descriptions support a useful first pass. Direct, authoritative Thema assignments for every ISBN were not established.

## Scope and measured coverage

- 29 stored editions; 34 catalog copies including archived copies; **26 active editions** (one active copy each). Three editions have no active copy.
- Active catalog metadata includes per-copy overrides. All pagination followed the returned next offsets; no truncated cells were accepted.
- Edition-language audit: 20 Korean editions and 6 English editions. Two active English editions are stored as Korean.
- Existing descriptions: **22/26**. Four active books have no description.
- Aladin public pages: **25/26** exact ISBNs with category paths after four known product-page fallbacks. This is page availability, not tested Aladin API coverage.
- The remaining book, *The First Man*, has exact-ISBN category evidence on the Google Books public page. Thus **26/26 have some external category evidence** in this assisted audit.
- Open Library: **10/26** exact edition records; **7/26** with edition or linked-work subjects after one retry for transport failures. Status counts: `{'200': 10, '404': 16}`. Subjects are heterogeneous and are not Thema assignments.
- Unauthenticated Google Books API: 29 attempts returned HTTP 429. Treat API coverage as **unmeasured**, not zero. The production Google Books credential exists but its value is not exposed by Sites. The existing production resolver strips category fields, so this audit did not test the authenticated category response.
- Production has Google Books and Kakao metadata credentials configured; no Aladin, NLK, or Naver credentials were listed. No secrets were read or changed.

## How to interpret the proposed results

**21 broad placements look routine; 5 should receive editorial review.** These are judgments from a small, assisted audit, not classifier accuracy, calibrated confidence, or a promised automation rate. No automatic classification model was trained or evaluated.

Every proposed code was checked against the official English and Korean Thema 1.6 browser. Sources generally supply retailer categories rather than Thema, so most code assignments below are audit mappings. Simple UI labels are ours, separate from official labels. The JSON preserves official labels verbatim (including an apparent Korean typo in FBC).

Retailer-reported Thema headings were found for the exact English ISBNs of *Small Things Like These* (contemporary fiction), *Eichmann in Jerusalem* (Holocaust), *Homo Deus* (evolution), and *The Stranger* (general/literary fiction). This does not prove publisher origin, completeness, or agreement across retailers.

## All active editions

| Book | Proposed browsing category | Thema proposal | Assessment | Evidence / reason |
|---|---|---|---|---|
| [A Woman's Story](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=5575034) | Memoir / biography · 회고록 / 전기 | [DNC](https://ns.editeur.org/thema/en/DNC) + [DNB](https://ns.editeur.org/thema/en/DNB) | Review primary | Memoir and biography categories overlap. Publisher describes the author reconstructing her mother’s life; review which should be primary. |
| [Eichmann in Jerusalem (Penguin Modern Classics)](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=277587913) | History · 역사 | [NHTZ1](https://ns.editeur.org/thema/en/NHTZ1) | Supported broad placement | Exact-ISBN Aladin Holocaust category and Donner Thema heading agree. Catalog language is ko, while the edition is English. |
| [작별인사](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=292816855) | Science fiction; literary fiction · SF; 문학소설 | [FL](https://ns.editeur.org/thema/en/FL) + [FBA](https://ns.editeur.org/thema/en/FBA) | Supported broad placement | Aladin supplies contemporary Korean fiction. SF is an audit inference from its humanoid narrative and the stored future-set synopsis; not a supplied Thema code. |
| [결혼 건축가](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=271456) | Christian living · 기독교 신앙생활 | [QRMP](https://ns.editeur.org/thema/en/QRMP) | Supported broad placement | Exact-ISBN category is Christian faith / love and marriage; stored description is absent. Not architecture. |
| [너라는 우주를 만나](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=135020666) | Christian living; memoir · 신앙생활; 회고록 | [QRMP](https://ns.editeur.org/thema/en/QRMP) + [DNC](https://ns.editeur.org/thema/en/DNC) | Review primary | Retailer classifies faith and parenting; stored synopsis explicitly describes an adoption memoir/essay collection. Review main placement. |
| [유럽 도시 기행 3](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=397155927) | Travel writing; history · 기행문; 역사 | [WTL](https://ns.editeur.org/thema/en/WTL) + [NHTB](https://ns.editeur.org/thema/en/NHTB) | Supported broad placement | Category paths include travel and cultural/historical journeys; synopsis agrees. General humanities is too vague. |
| [이처럼 사소한 것들](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=329386807) | Literary fiction · 문학소설 | [FBA](https://ns.editeur.org/thema/en/FBA) | Supported broad placement | Irish fiction category plus synopsis. KOBIC identifies original title Small Things Like These, matching the English edition; FBA is a mapped proposal. |
| [할매](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=379665189) | Literary fiction · 문학소설 | [FBA](https://ns.editeur.org/thema/en/FBA) | Supported broad placement | Contemporary Korean fiction category and stored synopsis agree. |
| [The First Man](https://books.google.com/books/about/The_First_Man.html?id=rooMAAAACAAJ) | Classic literary fiction · 고전 문학소설 | [FBC](https://ns.editeur.org/thema/en/FBC) | Supported broad placement | No exact Aladin page resolved. Exact-ISBN Google Books public page lists Fiction / Classics and Fiction / Literary. |
| [라면을 끓이며](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=66904730) | Essays · 에세이 | [DNL](https://ns.editeur.org/thema/en/DNL) | Supported broad placement | Korean essays / writer essays category; Open Library edition subjects also say Korean essays. Not cooking. |
| [인간 실격](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=147875518) | Classic literary fiction · 고전 문학소설 | [FBC](https://ns.editeur.org/thema/en/FBC) | Supported broad placement | Pre-1950 Japanese fiction; stored synopsis identifies the original 1948 novel. Reprint year must not imply contemporary fiction. |
| [밥 먹다가, 울컥](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=333159417) | Essays · 에세이 | [DNL](https://ns.editeur.org/thema/en/DNL) | Supported broad placement | Korean essays / food essays category. The food topic does not make this a recipe book. |
| [나는 그림을 보며 어른이 되었다](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=352246550) | Art; essays · 미술; 에세이 | [AB](https://ns.editeur.org/thema/en/AB) + [DNL](https://ns.editeur.org/thema/en/DNL) | Review primary | Retailer category is only general humanities. Art and essays are inferred from the description; review primary and a more specific art code. |
| [Homo Deus](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=85962547) | History / society / science · 역사 / 사회 / 과학 | [NHTB](https://ns.editeur.org/thema/en/NHTB) + [PSAJ](https://ns.editeur.org/thema/en/PSAJ) | Review primary | Aladin spans evolution, technology, library science, civilization, social history and futures. Donner reports Thema evolution. Select primary after review rather than copying every category. |
| [Small Things Like These](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=298360043) | Literary fiction · 문학소설 | [FBA](https://ns.editeur.org/thema/en/FBA) | Supported broad placement | Donner explicitly reports contemporary fiction as Thema for this ISBN; Aladin agrees. Active copy override incorrectly labels this English edition ko. |
| [작별하지 않는다](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=278770576) | Literary fiction · 문학소설 | [FBA](https://ns.editeur.org/thema/en/FBA) | Supported broad placement | Contemporary Korean fiction category fills the missing stored description; historical themes do not by themselves determine a primary genre. |
| [소년과 두더지와 여우와 말](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=236826464) | Illustrated reflections · 그림 에세이 | [DNL](https://ns.editeur.org/thema/en/DNL) + [XQ](https://ns.editeur.org/thema/en/XQ) | Review primary | Aladin has both illustrated essays and graphic novels. Libraries disagree between art and literature. These are candidates only; do not infer children’s audience from illustrations. |
| [모순](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=25843736) | Literary fiction · 문학소설 | [FB](https://ns.editeur.org/thema/en/FB) | Supported broad placement | Pre-2000 Korean fiction; use broader FB pending any classic/contemporary policy. Open Library homicide is a topic, not evidence of mystery genre. |
| [The Stranger](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=923737) | Classic literary fiction · 고전 문학소설 | [FBC](https://ns.editeur.org/thema/en/FBC) | Supported broad placement | Aladin classic fiction and publisher description support FBC. Retailer Thema detail varies between FB and FBA; preserve source differences. |
| [하늘과 바람과 별과 시](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=101846869) | Poetry · 시 | [DCF](https://ns.editeur.org/thema/en/DCF) | Supported broad placement | Korean poetry / posthumous poems and stored single-author collection support DCF. Not DCQ, which is for multiple poets. |
| [안녕이라 그랬어(집에디션 리커버)](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=396563626) | Literary fiction; short stories · 문학소설; 단편 | [FBA](https://ns.editeur.org/thema/en/FBA) + [FYB](https://ns.editeur.org/thema/en/FYB) | Supported broad placement | Exact-ISBN house-edition Aladin page identifies contemporary Korean fiction and a story collection. FYB is additional, never primary. |
| [경이라는 세계](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=329560299) | Christianity; essays · 기독교; 에세이 | [QRM](https://ns.editeur.org/thema/en/QRM) + [DNL](https://ns.editeur.org/thema/en/DNL) | Supported broad placement | Retailer Christianity and humanities essays categories; National Assembly Library class 230 corroborates religion. |
| [정원에서 길을 물었다](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=347965601) | Christian living · 기독교 신앙생활 | [QRMP](https://ns.editeur.org/thema/en/QRMP) | Supported broad placement | Exact-ISBN category is Christian faith. Full subtitle and description concern plants and spirituality. Do not place under practical gardening solely from title. |
| [괴테는 모든 것을 말했다(여름 에디션)](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=376765918) | Literary fiction · 문학소설 | [FBA](https://ns.editeur.org/thema/en/FBA) | Supported broad placement | Japanese fiction category and 2025 publication; the protagonist is a Goethe scholar. Not a Goethe biography or philosophy textbook. |
| [성을 알면 달라지는 것들](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=255075355) | Christian living · 기독교 신앙생활 | [QRMP](https://ns.editeur.org/thema/en/QRMP) | Supported broad placement | Faith/parenting categories and biblical perspective support broad religious placement. Sexuality and parenting need additional topic mapping before finer filters. |
| [중력과 은총](https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=284318019) | Philosophy; essays · 철학; 에세이 | [QD](https://ns.editeur.org/thema/en/QD) + [DNL](https://ns.editeur.org/thema/en/DNL) | Supported broad placement | French philosophy / popular philosophy / philosophy of religion and humanities essays. Not physics despite the title. |

## What the bilingual test showed

The Korean *이처럼 사소한 것들* (9791130646381) and English *Small Things Like These* (9780571368709) converge on **FBA**, displayed as Literary fiction / 문학소설. KOBIC explicitly identifies the Korean book’s original title, and the exact English edition has a retailer-reported Thema heading. The Korean code is an audit mapping, not a publisher-supplied code. This is one successful translation pair, not a general validation of cross-edition matching.

## Failure modes that matter

- **Language cannot select the taxonomy.** *Eichmann in Jerusalem* is ko at edition and active-copy level; *Small Things Like These* is en at edition level but its active copy overrides it to ko. Genre must be independent of those fields.
- **Titles and author reputation are insufficient.** *라면을 끓이며* and *밥 먹다가, 울컥* are essays; *중력과 은총* is philosophy; *괴테는 모든 것을 말했다* is fiction; *정원에서 길을 물었다* is placed in Christian living by its retailer.
- **A topic is not a genre.** Open Library lists homicide for *모순*. That does not justify Mystery. The current corpus contains no clearly verified mystery example, so mystery classification remains untested.
- **Retailer shelving is inconsistent.** *Homo Deus* spans unrelated-looking shelves, and *소년과 두더지와 여우와 말* spans essays and graphic novels. Do not copy all source categories as genres.
- **Age and format must be separate.** Illustration, school recommendations, Lexile levels and awards are not reliable evidence that a book’s primary audience is children. Exclude recommendation/award shelves from genre mapping.
- **Store provenance and preserve corrections.** Category mappings, synopsis-assisted inferences, retailer-reported Thema headings, and human approvals need distinct source labels. A new lookup must not silently overwrite an approved classification.

## Recommended next experiment

1. Use exact ISBN matching and a versioned bilingual taxonomy. Store official codes and original source categories separately. Start with broad browsing groups and support more than one group when warranted.
2. Add an authenticated Aladin metadata adapter locally and verify its category fields for these same 26 ISBNs. Also test Google Books categories using its configured credential through an authorized runtime path. The public-page audit suggests coverage; it does not establish API access or response equivalence.
3. Write a small deterministic mapping for unambiguous category paths. Use synopsis-assisted suggestions for missing detail (for example SF), with an abstain/review path for ambiguity. Do not equate every national-fiction shelf with literary fiction without checking for a genre signal.
4. Review the five marked books, then validate against a larger, separately reviewed set containing mystery, romance, fantasy, children’s books, nonfiction and more translation pairs. Measure category availability, automatic assignment coverage and accuracy separately.
5. Only after that evaluation, plan a reviewed production backfill. This audit makes no production changes.

## Evidence and reproducibility

- Companion JSON: [all proposals, raw category paths, subject evidence, source URLs and counts](2026-09-06-thema-feasibility.json). ISBNs are strings; no owners, members, contact information, circulation histories or private notes are included.
- [Thema English browser](https://ns.editeur.org/thema/en) and [Korean browser](https://ns.editeur.org/thema/ko). Verified candidate codes and labels are included in the JSON.
- [Aladin API documentation and category directory](https://blog.aladin.co.kr/openapi/popup/6695306). Public product-page evidence is linked per row; no Aladin API credential was available in this audit.
- [Google Books volume schema](https://developers.google.com/books/docs/v1/reference/volumes) describes categories. [Exact-ISBN public page for The First Man](https://books.google.com/books/about/The_First_Man.html?id=rooMAAAACAAJ) supplies the fallback evidence.
- Local raw book-only snapshots, retrieval scripts and response evidence used during this session are in `/private/tmp/hanalib-thema-audit/`. They are working files, not application code or a durable production export.

The catalog and provider responses are point-in-time observations. The small corpus is literature-heavy, and sources can change. Every nontrivial assignment remains a proposal until reviewed.
