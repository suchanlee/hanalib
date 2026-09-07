UPDATE catalog_items
SET metadata_overrides_json = json_set(metadata_overrides_json, '$.description', '성 이야기, 그 낯설고 아름다운 세계 속으로 우리는 궁금한 게 생기면 질문한다. 하지만 성에 대해서는 몰라도 질문하지 않는다. 경험으로 추측하거나 나중으로 미룬다. 그러나 성은 우리 일상의 이야기다. 우리는 모두 성적 존재이기 때문이다. 이 책은 현재까지 발견되고 발전한 과학적 정보를 포괄하여 성을 쉽게 설명해 주고, 성경적 관점에 대한 통찰력 있는 고민의 흔적들을 나눔으로써, 부모라면 가정에서 자연스럽게 성교육까지 연결되도록 돕고, 싱글이라면 개인의 내적 고민과 더불어 데이트에도 도움을 주는 최신의 성 안내서다.', '$.descriptionProvenance', json_object('description', 'yes24-reviewed', 'descriptionUrl', 'https://www.yes24.com/Product/Goods/94971414')),
version = version + 1, updated_at = unixepoch() * 1000
WHERE archived_at IS NULL AND status <> 'archived'
AND COALESCE(json_extract(metadata_overrides_json, '$.descriptionEdited'), 0) = 0
AND json_extract(metadata_overrides_json, '$.description') = '성 이야기, 그 낯설고 아름다운 세계 속으로 우리는 궁금한 게 생기면 질문한다. 하지만 성에 대해서는 몰라도 질문하지 않는다. 경험으로 추측하거나 나중으로 미룬다. 그러나 성은 우리 일상의 이야기다. 우리는 모두 성적 존재이기 때문이다. 이 책은 현재까지 발견되고 발전한 과학적 정보를 포괄하여 성을 쉽게 설명해 주고, 성경적 관점에 대한 통찰력 있는 고민의 흔적들을 나눔으로써, 부모라면 가정에서 자연스럽게 성교육까지 연결되도록 돕고, 싱글이라면'
AND edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9788932817842' AND description = '성 이야기, 그 낯설고 아름다운 세계 속으로 우리는 궁금한 게 생기면 질문한다. 하지만 성에 대해서는 몰라도 질문하지 않는다. 경험으로 추측하거나 나중으로 미룬다. 그러나 성은 우리 일상의 이야기다. 우리는 모두 성적 존재이기 때문이다. 이 책은 현재까지 발견되고 발전한 과학적 정보를 포괄하여 성을 쉽게 설명해 주고, 성경적 관점에 대한 통찰력 있는 고민의 흔적들을 나눔으로써, 부모라면 가정에서 자연스럽게 성교육까지 연결되도록 돕고, 싱글이라면'
AND json_extract(field_provenance_json, '$.description') = 'kakao-books');
--> statement-breakpoint
UPDATE book_editions
SET description = '성 이야기, 그 낯설고 아름다운 세계 속으로 우리는 궁금한 게 생기면 질문한다. 하지만 성에 대해서는 몰라도 질문하지 않는다. 경험으로 추측하거나 나중으로 미룬다. 그러나 성은 우리 일상의 이야기다. 우리는 모두 성적 존재이기 때문이다. 이 책은 현재까지 발견되고 발전한 과학적 정보를 포괄하여 성을 쉽게 설명해 주고, 성경적 관점에 대한 통찰력 있는 고민의 흔적들을 나눔으로써, 부모라면 가정에서 자연스럽게 성교육까지 연결되도록 돕고, 싱글이라면 개인의 내적 고민과 더불어 데이트에도 도움을 주는 최신의 성 안내서다.',
field_provenance_json = json_set(field_provenance_json, '$.description', 'yes24-reviewed', '$.descriptionUrl', 'https://www.yes24.com/Product/Goods/94971414')
WHERE isbn13 = '9788932817842' AND description = '성 이야기, 그 낯설고 아름다운 세계 속으로 우리는 궁금한 게 생기면 질문한다. 하지만 성에 대해서는 몰라도 질문하지 않는다. 경험으로 추측하거나 나중으로 미룬다. 그러나 성은 우리 일상의 이야기다. 우리는 모두 성적 존재이기 때문이다. 이 책은 현재까지 발견되고 발전한 과학적 정보를 포괄하여 성을 쉽게 설명해 주고, 성경적 관점에 대한 통찰력 있는 고민의 흔적들을 나눔으로써, 부모라면 가정에서 자연스럽게 성교육까지 연결되도록 돕고, 싱글이라면'
AND json_extract(field_provenance_json, '$.description') = 'kakao-books'
AND EXISTS (SELECT 1 FROM catalog_items WHERE edition_id = book_editions.id AND archived_at IS NULL AND status <> 'archived');
