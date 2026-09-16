-- Candidate NZ sources, seeded DISABLED.
--
-- These sites were identified as likely event sources but have not been
-- verified — we do not know yet whether they publish schema.org Event markup,
-- whether their listings live on an index page or only on detail pages, or
-- whether they block bots.
--
-- Enabling an unverified source is how you get a crawl that silently produces
-- nothing, or worse, produces junk rows. Probe first:
--
--     pnpm probe https://www.aucklandnz.com/events/all-events --city auckland
--
-- The probe prints what it found and, if the source is usable, the exact
-- config to paste. Then:
--
--     UPDATE sources SET enabled = true, config = '{...}'::jsonb WHERE slug = '...';

INSERT INTO sources (slug, name, homepage, kind, enabled, attribution, config) VALUES
  ('aucklandnz', 'Auckland NZ (Tātaki Auckland Unlimited)', 'https://www.aucklandnz.com', 'jsonld', false,
   'Event data from aucklandnz.com',
   '{"seeds":["https://www.aucklandnz.com/events/all-events"],"defaultCity":"auckland"}'),

  ('heartofthecity', 'Heart of the City Auckland', 'https://heartofthecity.co.nz', 'jsonld', false,
   'Event data from Heart of the City',
   '{"seeds":["https://heartofthecity.co.nz/whats-on"],"defaultCity":"auckland"}'),

  ('urbanlist', 'The Urban List Auckland', 'https://www.theurbanlist.com', 'jsonld', false,
   'Event data from The Urban List',
   '{"seeds":["https://www.theurbanlist.com/auckland/a-list/whats-on-auckland"],"defaultCity":"auckland"}'),

  ('aucklandforkids', 'Auckland for Kids', 'https://www.aucklandforkids.co.nz', 'jsonld', false,
   'Event data from Auckland for Kids',
   '{"seeds":["https://www.aucklandforkids.co.nz/whats-on-this-weekend/"],"defaultCity":"auckland"}'),

  ('wellingtonnz', 'WellingtonNZ', 'https://www.wellingtonnz.com', 'jsonld', false,
   'Event data from WellingtonNZ',
   '{"seeds":["https://www.wellingtonnz.com/visit/whats-on"],"defaultCity":"wellington"}'),

  ('christchurchnz', 'ChristchurchNZ', 'https://www.christchurchnz.com', 'jsonld', false,
   'Event data from ChristchurchNZ',
   '{"seeds":["https://www.christchurchnz.com/explore/events"],"defaultCity":"christchurch"}'),

  ('queenstownnz', 'Destination Queenstown', 'https://www.queenstownnz.co.nz', 'jsonld', false,
   'Event data from Destination Queenstown',
   '{"seeds":["https://www.queenstownnz.co.nz/things-to-do/events/"],"defaultCity":"queenstown"}')
ON CONFLICT (slug) DO NOTHING;
