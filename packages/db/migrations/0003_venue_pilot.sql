-- Pilot sources stay disabled until real output is reviewed. Bounded venue
-- crawls never claim complete coverage and cannot retire missing records.
INSERT INTO sources (slug, name, homepage, kind, enabled, attribution, config) VALUES
('spark-arena', 'Spark Arena', 'https://www.sparkarena.co.nz/', 'jsonld', false, 'Event information from Spark Arena', '{"pilot":true}'),
('auckland-town-hall', 'Auckland Town Hall', 'https://www.aucklandlive.co.nz/venue/auckland-town-hall', 'jsonld', false, 'Event information from Auckland Live', '{"pilot":true}'),
('asb-waterfront', 'ASB Waterfront Theatre', 'https://www.atc.co.nz/asb-waterfront-theatre', 'jsonld', false, 'Event information from Auckland Theatre Company', '{"pilot":true}'),
('auckland-art-gallery', 'Auckland Art Gallery', 'https://www.aucklandartgallery.com/visit/exhibitions', 'jsonld', false, 'Event information from Auckland Art Gallery', '{"pilot":true}')
ON CONFLICT (slug) DO NOTHING;
