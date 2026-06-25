-- StudyPal: chapter-tagged concepts + Tavus video-tutor interviews.
--
-- 1) Concepts now carry the chapter/section they came from, so interviews,
--    quizzes and the concept list can be scoped per chapter.
-- 2) Interviews record the chapter, mode, the Tavus conversation, and the
--    post-call AI summary + webcam focus/integrity signals (for the parent).

alter table study_cards
  add column if not exists chapter text;

create index if not exists study_cards_topic_chapter_idx
  on study_cards(topic_id, chapter);

alter table study_interviews
  add column if not exists chapter text,
  add column if not exists mode text not null default 'chapter', -- 'chapter' | 'concept' | 'viva'
  add column if not exists tavus_conversation_id text,
  add column if not exists tavus_conversation_url text,
  add column if not exists summary text,
  add column if not exists keep_practising jsonb not null default '[]'::jsonb,
  add column if not exists focus jsonb; -- { lookingPct, flags: string[], notes }

create index if not exists study_interviews_tavus_idx
  on study_interviews(tavus_conversation_id);
