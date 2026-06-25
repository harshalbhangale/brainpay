-- StudyPal: bookmark individual concept cards.
-- Kids can save important flashcards; bookmarked cards are preserved when a
-- topic's concepts are regenerated.

alter table study_cards
  add column if not exists bookmarked boolean not null default false;

create index if not exists study_cards_bookmark_idx
  on study_cards(account_id, bookmarked);

-- Persist source text on documents so concepts can be regenerated later
-- (inline-text docs have no fetchable fileUrl to re-extract from).
alter table study_documents
  add column if not exists raw_text text;
