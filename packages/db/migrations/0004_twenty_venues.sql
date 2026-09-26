-- Expanded pilot directory. Sources require validation before enabling.
INSERT INTO sources (slug, name, homepage, kind, enabled, attribution, config) VALUES
('the-civic', 'The Civic', 'https://www.aucklandlive.co.nz/venue/the-civic', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('aotea-centre', 'Aotea Centre', 'https://www.aucklandlive.co.nz/venue/aotea-centre', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('bruce-mason', 'Bruce Mason Centre', 'https://www.aucklandlive.co.nz/venue/bruce-mason-centre', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('tuning-fork', 'The Tuning Fork', 'https://www.tuningfork.co.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('powerstation', 'Powerstation', 'https://www.powerstation.net.nz/shows/coming', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('basement-theatre', 'Basement Theatre', 'https://basementtheatre.co.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('q-theatre', 'Q Theatre', 'https://qtheatre.co.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('eden-park', 'Eden Park', 'https://edenpark.co.nz/events/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('go-media-stadium', 'Go Media Stadium', 'https://www.aucklandstadiums.co.nz/our-venues/go-media-stadium', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('western-springs', 'Western Springs Bowl', 'https://www.westernspringsbowl.co.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('eventfinda-stadium', 'Eventfinda Stadium', 'https://www.eventfindastadium.co.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('auckland-museum', 'Auckland Museum', 'https://www.aucklandmuseum.com/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('motat', 'MOTAT', 'https://motat.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('stardome', 'Stardome', 'https://www.stardome.org.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('auckland-zoo', 'Auckland Zoo', 'https://www.aucklandzoo.co.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}'),
('maritime-museum', 'New Zealand Maritime Museum', 'https://www.maritimemuseum.co.nz/', 'jsonld', false, 'Official venue website', '{"pilot":true}')
ON CONFLICT (slug) DO NOTHING;
