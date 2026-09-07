ALTER TABLE `book_editions` ADD `is_youth_book` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780525582199' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780525582199')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780545206945' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780545206945')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780545886215' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780545886215')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780545886222' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780545886222')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780553522778' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780553522778')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780593310229' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780593310229')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780736431095' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780736431095')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781338067613' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781338067613')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781368064224' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781368064224')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781368081467' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781368081467')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781368095099' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781368095099')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781368112420' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781368112420')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781484720974' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781484720974')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781684376421' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781684376421')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781772754629' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781772754629')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9798217024445' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9798217024445')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9798217032617' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9798217032617')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780545813891' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780545813891')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9780593089781' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9780593089781')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
--> statement-breakpoint
UPDATE book_editions SET is_youth_book = 1,
    field_provenance_json = json_set(field_provenance_json, '$.isYouthBook', 'audience-reviewed')
    WHERE isbn13 = '9781606852545' AND COALESCE(json_extract(field_provenance_json, '$.isYouthBook'), '') <> 'member';
--> statement-breakpoint
UPDATE catalog_items SET metadata_overrides_json = json_set(metadata_overrides_json, '$.isYouthBook', json('true'), '$.youthSource', 'audience-reviewed'),
    version = version + 1, updated_at = unixepoch() * 1000
    WHERE edition_id IN (SELECT id FROM book_editions WHERE isbn13 = '9781606852545')
    AND archived_at IS NULL AND status <> 'archived'
    AND COALESCE(json_extract(metadata_overrides_json, '$.youthSource'), '') <> 'member'
    AND json_type(metadata_overrides_json, '$.isYouthBook') IS NOT NULL
    AND COALESCE(json_extract(metadata_overrides_json, '$.isYouthBook'), 0) <> 1;
