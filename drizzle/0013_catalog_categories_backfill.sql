UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF","XQ"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Previously reviewed Baby-Sitters Club graphic-novel edition; stored synopsis describes Stacey and the club."]}]}'
WHERE isbn13 = '9780545813891' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["NH"],"evidence":[{"source":"google-books","subjects":["History"]}]}'
WHERE isbn13 = '9780062410665' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"google-books","subjects":["Cooking"]}]}'
WHERE isbn13 = '9781580089777' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"google-books","subjects":["Cooking"]}]}'
WHERE isbn13 = '9788901140612' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["JUVENILE FICTION"]}]}'
WHERE isbn13 = '9780545886222' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FB"],"evidence":[{"source":"google-books","subjects":["Fiction"]}]}'
WHERE isbn13 = '9780553293357' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9798217032617' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM","PD"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis explicitly discusses Christian theology and its relationship with science."]}]}'
WHERE isbn13 = '9791161290157' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["DNC","DNB"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","외국도서 > 전기/자서전 > 여성","외국도서 > 가족/관계 > 일반","외국도서 > 소설/시/희곡 > 문학 > 문학일반","외국도서 > 전기/자서전 > 개인 회고록","외국도서 > 전기/자서전 > 문학","외국도서 > 전기/자서전 > 일반"]}]}'
WHERE isbn13 = '9781583225752' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["NHTZ1"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","외국도서 > 역사 > 유럽 > 일반","외국도서 > 역사 > 홀로코스트"]}]}'
WHERE isbn13 = '9780241552292' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FL","FBA"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 한국소설 > 2000년대 이후 한국소설","국내도서 > 소설/시/희곡 > 테마문학 > 영화소설"]}]}'
WHERE isbn13 = '9791191114225' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9781368095099' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["DNL"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes reflective personal readings of influential books by Yoo Si-min."]}]}'
WHERE isbn13 = '9788901101569' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBC"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description explicitly identifies this edition as Crime and Punishment, volume 1."]}]}'
WHERE isbn13 = '9788932907277' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["JUVENILE FICTION","Juvenile Fiction"]}]}'
WHERE isbn13 = '9780545886215' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 종교/역학 > 기독교(개신교) > 기독교(개신교) 신앙생활 > 사랑/결혼"]}]}'
WHERE isbn13 = '9788970089997' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["UB"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Manual review of exact-ISBN cached edition: John Ousterhout, A Philosophy of Software Design, Yaknyam Press, 2018; professional software design."]}]}'
WHERE isbn13 = '9781732102200' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["XQ"],"evidence":[{"source":"google-books","subjects":["Comics & Graphic Novels"]}]}'
WHERE isbn13 = '9780809051014' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes Chinese recipes and cooking techniques."]}]}'
WHERE isbn13 = '9788997686971' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WF"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description lists a hands-on activity collection with crafting, building and drawing."]}]}'
WHERE isbn13 = '9781684376421' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis identifies an introduction to emerging Christianity and spiritual renewal."]}]}'
WHERE isbn13 = '9788932821399' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP","DNC"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 종교/역학 > 기독교(개신교) > 기독교(개신교) 신앙생활 > 간증/영적성장","국내도서 > 종교/역학 > 기독교(개신교) > 기독교(개신교) 신앙생활 > 부부생활/자녀양육"]}]}'
WHERE isbn13 = '9788932816135' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes a practical exposition of the Lord''s Prayer."]}]}'
WHERE isbn13 = '9788932812946' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QR"],"evidence":[{"source":"google-books","subjects":["Religion"]}]}'
WHERE isbn13 = '9781601427564' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description explicitly describes biblical marriage guidance."]}]}'
WHERE isbn13 = '9781594631870' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM","JH"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis examines Christianity, sexual minorities and social discrimination."]}]}'
WHERE isbn13 = '9791187708827' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM","JH"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis examines feminism and Korean Christianity."]}]}'
WHERE isbn13 = '9788990928436' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WTL","NHTB"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 인문학 > 교양 인문학","국내도서 > 여행 > 테마여행 > 문화/역사기행","국내도서 > 역사 > 문화/역사기행 > 동서양 문화/역사기행"]}]}'
WHERE isbn13 = '9788965138310' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF","XQ"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description explicitly identifies the edition as a full-color graphic novel."]}]}'
WHERE isbn13 = '9781338067613' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["JH"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis identifies a sociological examination of suffering in Korean society."]}]}'
WHERE isbn13 = '9791187890126' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes the integration of Christian faith and psychological healing."]}]}'
WHERE isbn13 = '9788988042366' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["AB"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis identifies a collection of twelve composed songs with performance recordings."]}]}'
WHERE isbn13 = '9788959160631' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"review","codes":[],"evidence":[{"source":"google-books","subjects":["Medical"]}]}'
WHERE isbn13 = '9781324050629' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9781484720974' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description concerns Christian thought and a New Testament scholar''s spiritual experience."]}]}'
WHERE isbn13 = '9791161292526' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9780593310229' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QR"],"evidence":[{"source":"google-books","subjects":["Religion"]}]}'
WHERE isbn13 = '9781606089743' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"google-books","subjects":["Cooking"]}]}'
WHERE isbn13 = '9781615649983' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FB"],"evidence":[{"source":"google-books","subjects":["Fiction"]}]}'
WHERE isbn13 = '9780375704024' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["AB"],"evidence":[{"source":"google-books","subjects":["Photography"]}]}'
WHERE isbn13 = '9780817439392' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FB"],"evidence":[{"source":"google-books","subjects":["Fiction"]}]}'
WHERE isbn13 = '9781451673265' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBA"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 세계의 소설 > 아일랜드소설","국내도서 > 소설/시/희곡 > 세계의 문학 > 아일랜드문학","국내도서 > 소설/시/희곡 > 테마문학 > 영화소설","국내도서 > 추천도서 > 알라딘 독자 선정 올해의 책 > 2024년 > 올해의 책 TOP 10"]}]}'
WHERE isbn13 = '9791130646381' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Previously reviewed exact LeapReader Paw Patrol storybook edition; see youth-audience audit."]}]}'
WHERE isbn13 = '9781606852545' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes a story about two schoolchildren becoming friends."]}]}'
WHERE isbn13 = '9788955827965' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"google-books","subjects":["Cooking"]}]}'
WHERE isbn13 = '9788970906805' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBA"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 한국소설 > 2000년대 이후 한국소설"]}]}'
WHERE isbn13 = '9788936439880' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis identifies Tim Keller''s exposition of the prodigal-son parable."]}]}'
WHERE isbn13 = '9788953125780' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QR"],"evidence":[{"source":"google-books","subjects":["Religion"]}]}'
WHERE isbn13 = '9781587435171' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9781772754629' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9798217024445' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["KJ"],"evidence":[{"source":"google-books","subjects":["Business & Economics"]}]}'
WHERE isbn13 = '9780062661128' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9780553522778' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis frames the climate crisis through biblical creation and the church’s response."]}]}'
WHERE isbn13 = '9791161292311' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9781368081467' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes Christian spiritual life and relationships with self, others and God."]}]}'
WHERE isbn13 = '9788953108103' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBC"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Manual review of exact-ISBN stored author, publisher and volume metadata: Dostoevsky collected works, Crime and Punishment / Demons."]}]}'
WHERE isbn13 = '9788932907321' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9780545206945' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes Tim Keller''s teaching on Christian vocation and work."]}]}'
WHERE isbn13 = '9788953119901' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description explicitly identifies a guide to Bible reading and meditation."]}]}'
WHERE isbn13 = '9788932817583' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBC"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit"]}]}'
WHERE isbn13 = '9780676970050' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["DNL"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 에세이 > 한국에세이","국내도서 > 에세이 > 명사에세이 > 문인에세이","국내도서 > 추천도서 > 알라딘 독자 선정 올해의 책 > 2015년 > 올해의 책 Top 20"]}]}'
WHERE isbn13 = '9788954637770' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBC"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 일본소설 > 1950년대 이전 일본소설","국내도서 > 소설/시/희곡 > 세계의 문학 > 일본문학","국내도서 > 소설/시/희곡 > 테마문학 > 영화소설"]}]}'
WHERE isbn13 = '9788952790620' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["DNL"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 에세이 > 한국에세이","국내도서 > 에세이 > 음식에세이"]}]}'
WHERE isbn13 = '9788901279374' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["SC"],"evidence":[{"source":"google-books","subjects":["Marathon running"]}]}'
WHERE isbn13 = '9781937715489' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["PD"],"evidence":[{"source":"google-books","subjects":["Astronomy"]}]}'
WHERE isbn13 = '9781932974010' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["AB","DNL"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 인문학 > 교양 인문학"]}]}'
WHERE isbn13 = '9791193238455' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["NHTB","PSAJ"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","외국도서 > 과학/수학/생태 > 과학 > 생명과학 > 진화","외국도서 > 기술공학 > 기술공학 > 일반","외국도서 > 언어학 > 문헌정보학 > 일반","외국도서 > 역사 > 문명","외국도서 > 역사 > 사회사","외국도서 > 인문/사회 > 사회과학 > 미래학"]}]}'
WHERE isbn13 = '9780062464316' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["AB"],"evidence":[{"source":"google-books","subjects":["Art"]}]}'
WHERE isbn13 = '9780857687609' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["AB"],"evidence":[{"source":"google-books","subjects":["Photography"]}]}'
WHERE isbn13 = '9780817437381' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["DNC"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description explicitly identifies the young readers'' adaptation of Trevor Noah''s memoir."]}]}'
WHERE isbn13 = '9780525582199' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBA"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","외국도서 > 소설/시/희곡 > 소설 > 근현대","외국도서 > 소설/시/희곡 > 소설 > 역사"]}]}'
WHERE isbn13 = '9780571368709' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBA"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 한국소설 > 2000년대 이후 한국소설","국내도서 > 추천도서 > 알라딘 독자 선정 올해의 책 > 2021년 > 올해의 책 TOP 10","국내도서 > 추천도서 > 해외 문학상 > 메디치상","국내도서 > 추천도서 > 해외 문학상 > 노벨문학상","국내도서 > 추천도서 > 국내 문학상 > 대산문학상"]}]}'
WHERE isbn13 = '9788954682152' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9781368112420' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes espresso extraction, grinding, milk steaming and coffee recipes."]}]}'
WHERE isbn13 = '9788993461237' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis identifies introductory instruction in Christian faith."]}]}'
WHERE isbn13 = '9788963602370' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["DNL","XQ"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 에세이 > 사진/그림 에세이","국내도서 > 만화/라이트노벨 > 그래픽노블","국내도서 > 에세이 > 외국에세이","국내도서 > 추천도서 > 외부/전문기관 추천도서 > (사)행복한아침독서 추천도서 > 2021년 > 유초중등전체(공공도서관용)","국내도서 > 추천도서 > 외부/전문기관 추천도서 > (사)행복한아침독서 추천도서 > 2021년 > 영유아및어른그림책전체"]}]}'
WHERE isbn13 = '9788997381678' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["AB"],"evidence":[{"source":"google-books","subjects":["Photography"]}]}'
WHERE isbn13 = '9780817441814' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9780736431095' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes lectures on interpreting the Bible and living Christian faith."]}]}'
WHERE isbn13 = '9788932521237' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes biblical interpretation and its application to contemporary life."]}]}'
WHERE isbn13 = '9788932521220' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis examines work through the Bible and Christian tradition."]}]}'
WHERE isbn13 = '9788997760244' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WF"],"evidence":[{"source":"google-books","subjects":["Crafts & Hobbies"]}]}'
WHERE isbn13 = '9781785004919' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YFH"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes Belle, an enchanted castle and magical companions."]}]}'
WHERE isbn13 = '9781368047241' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["TB"],"evidence":[{"source":"google-books","subjects":["Technology & Engineering"]}]}'
WHERE isbn13 = '9781718502321' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBC"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Manual review of exact-ISBN stored author, publisher and volume metadata: Dostoevsky collected works, Crime and Punishment / Demons."]}]}'
WHERE isbn13 = '9788932907314' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FB"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 한국소설 > 2000년대 이전 한국소설"]}]}'
WHERE isbn13 = '9788998441012' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["PD"],"evidence":[{"source":"google-books","subjects":["Quantum theory"]}]}'
WHERE isbn13 = '9781400044177' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["YF"],"evidence":[{"source":"google-books","subjects":["Juvenile Fiction"]}]}'
WHERE isbn13 = '9781368064224' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"google-books","subjects":["Cooking"]}]}'
WHERE isbn13 = '9780393081084' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes a theological argument concerning salvation and fidelity to Christ."]}]}'
WHERE isbn13 = '9791161291734' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["DNB"],"evidence":[{"source":"google-books","subjects":["Biography & Autobiography"]}]}'
WHERE isbn13 = '9781400078431' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM","QD"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes a dialogue on Christian faith and philosophical questions of life, death and suffering."]}]}'
WHERE isbn13 = '9788936509484' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["PD"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis identifies a general-reader explanation of statistics and interpretation of data."]}]}'
WHERE isbn13 = '9788962605952' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QR","JH"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description examines faith-based responses to climate change and social justice."]}]}'
WHERE isbn13 = '9781538110690' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes a biblical theology of work and vocation."]}]}'
WHERE isbn13 = '9791157528547' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis identifies a collection of Christian sermons about revival."]}]}'
WHERE isbn13 = '9788990353627' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["XQ"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description explicitly identifies collected Peanuts newspaper comic strips."]}]}'
WHERE isbn13 = '9781847670311' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBC"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","외국도서 > 소설/시/희곡 > 소설 > 고전","외국도서 > 소설/시/희곡 > 소설 > 근현대","외국도서 > 소설/시/희곡 > 소설 > 문학","외국도서 > 소설/시/희곡 > 소설 > 심리소설","외국도서 > Lexile®지수 > 4학년(695L-910L)","외국도서 > Lexile®지수 > 5학년(805L-980L)"]}]}'
WHERE isbn13 = '9780679720201' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"google-books","subjects":["Cookbooks"]}]}'
WHERE isbn13 = '9788960530942' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"google-books","subjects":["Cooking"]}]}'
WHERE isbn13 = '9780307336798' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis discusses Christian discipleship, gospel and social participation."]}]}'
WHERE isbn13 = '9788932840536' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["DCF"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 시 > 한국시","국내도서 > 소설/시/희곡 > 시 > 유고시집"]}]}'
WHERE isbn13 = '9788994796734' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis explains the Christian gospel and the crucifixion."]}]}'
WHERE isbn13 = '9788925548913' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBC"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Manual review of exact-ISBN stored author, publisher and volume metadata: Dostoevsky collected works, Crime and Punishment / Demons."]}]}'
WHERE isbn13 = '9788932907284' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["NH","DNB"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Previously reviewed exact Who Was / What Is American history and biography boxed set; see youth-audience audit."]}]}'
WHERE isbn13 = '9780593089781' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["WB"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes Korean-style home brunch recipes."]}]}'
WHERE isbn13 = '9788952757418' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBA","FYB"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 한국소설 > 2000년대 이후 한국소설"]}]}'
WHERE isbn13 = '9791141602376' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description discusses Christian theology of divine love, judgment, heaven and hell."]}]}'
WHERE isbn13 = '9780062049643' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM","DNL"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 종교/역학 > 기독교(개신교) > 기독교 일반","국내도서 > 인문학 > 인문 에세이","국내도서 > 추천도서 > 외부/전문기관 추천도서 > 세종도서 교양부문 선정도서 > 2024년"]}]}'
WHERE isbn13 = '9791170830474' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["PD"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored description identifies a stargazing reference with star charts, planets and equipment."]}]}'
WHERE isbn13 = '9781554071470' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes Eugene Peterson''s biblical meditations on David and spirituality."]}]}'
WHERE isbn13 = '9788932816616' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 종교/역학 > 기독교(개신교) > 기독교(개신교) 신앙생활 > 신앙생활일반"]}]}'
WHERE isbn13 = '9791188887255' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["FBA"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 소설/시/희곡 > 일본소설 > 1950년대 이후 일본소설","국내도서 > 소설/시/희곡 > 세계의 문학 > 일본문학","국내도서 > 추천도서 > 해외 문학상 > 아쿠타가와상"]}]}'
WHERE isbn13 = '9791194530701' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRMP"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 종교/역학 > 기독교(개신교) > 기독교(개신교) 신앙생활 > 간증/영적성장","국내도서 > 종교/역학 > 기독교(개신교) > 기독교(개신교) 신앙생활 > 부부생활/자녀양육"]}]}'
WHERE isbn13 = '9788932817842' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QD","DNL"],"evidence":[{"source":"audit","subjects":["Reviewed 2026-09-06 exact-ISBN audit","국내도서 > 인문학 > 인문 에세이","국내도서 > 인문학 > 서양철학 > 프랑스철학","국내도서 > 인문학 > 철학 일반 > 교양 철학","국내도서 > 종교/역학 > 종교일반 > 종교철학"]}]}'
WHERE isbn13 = '9788932039244' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
--> statement-breakpoint
UPDATE book_editions SET categories_json = '{"version":1,"status":"suggested","codes":["QRM","DNC"],"evidence":[{"source":"audit","subjects":["2026-09-07: individual editorial review of stored metadata, not an automated title/description rule.","Stored synopsis describes the author''s personal life experiences and Christian testimony."]}]}'
WHERE isbn13 = '9788953117662' AND categories_json IS NULL
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
