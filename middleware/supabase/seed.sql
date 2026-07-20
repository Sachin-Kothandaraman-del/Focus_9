-- Generated from store/seed-data.js — run AFTER schema.sql

insert into customers (id, name, address, phone, email) values
  ('C01', 'Dubal', 'Jebel Ali, Dubai, UAE', '+971-4-8021111', 'stores@dubal.ae'),
  ('C02', 'DXB Power Plant', 'Al Aweer, Dubai, UAE', '+971-4-6081234', 'procurement@dxbpower.ae'),
  ('C03', 'Emal', 'Al Taweelah, Abu Dhabi, UAE', '+971-2-5092000', 'stores@emal.ae'),
  ('C04', 'TWA Power Plant', 'Taweelah, Abu Dhabi, UAE', '+971-2-5093500', 'power.stores@twa.ae'),
  ('C05', 'TWA Refinery', 'Taweelah, Abu Dhabi, UAE', '+971-2-5094100', 'refinery.stores@twa.ae')
on conflict (id) do nothing;

insert into departments (name) values ('Pot Line'), ('Engg Dept'), ('Maintenance'), ('Reduction'), ('Smelting') on conflict do nothing;
insert into locations (name) values ('Location 1'), ('Location 2'), ('Location 3'), ('Location 4') on conflict do nothing;
insert into uoms (name) values ('PCS'), ('PKT'), ('PRS'), ('DOZ') on conflict do nothing;

insert into items (code, name, descr, alias, uom, grp, cat, pic) values
  ('PPE-SHOE-42', 'Safety Shoes Size 42', 'Steel-toe leather safety shoes, S3 SRC, size 42', 'Safety boots 42', 'PRS', 'Foot Protection', 'Safety Shoes', '🥾'),
  ('PPE-SHOE-44', 'Safety Shoes Size 44', 'Steel-toe leather safety shoes, S3 SRC, size 44', 'Safety boots 44', 'PRS', 'Foot Protection', 'Safety Shoes', '🥾'),
  ('PPE-GBOOT-43', 'Gum Boots Size 43', 'PVC chemical-resistant gum boots, size 43', 'Wellington 43', 'PRS', 'Foot Protection', 'Gum Boots', '👢'),
  ('PPE-HAT-GRN', 'Hard Hat, Green', 'HDPE safety helmet, ratchet suspension — green', 'Helmet green', 'PCS', 'Head Protection', 'Hard Hats', '⛑️'),
  ('PPE-HAT-WHT', 'Hard Hat, White', 'HDPE safety helmet, ratchet suspension — white', 'Helmet white', 'PCS', 'Head Protection', 'Hard Hats', '⛑️'),
  ('PPE-CHINSTRAP', 'Helmet Chin Strap', 'Elastic chin strap for hard hats', 'Chin strap', 'PCS', 'Head Protection', 'Accessories', '🪢'),
  ('PPE-GLV-GP', 'General Purpose Gloves', 'Cotton-polyester knitted work gloves', 'GP gloves', 'PRS', 'Hand Protection', 'General Gloves', '🧤'),
  ('PPE-GLV-HEAT', 'Heat Resistant Gloves', 'Aluminised heat-resistant gloves up to 500°C', 'Furnace gloves', 'PRS', 'Hand Protection', 'Specialty Gloves', '🧤'),
  ('PPE-GLV-CHEM', 'Chemical Resistant Gloves', 'Nitrile chemical-resistant gauntlet gloves', 'Nitrile gauntlet', 'PRS', 'Hand Protection', 'Specialty Gloves', '🧤'),
  ('PPE-GOG-CLR', 'Safety Goggles, Clear', 'Anti-fog clear polycarbonate goggles', 'Clear goggles', 'PCS', 'Eye & Face', 'Goggles', '🥽'),
  ('PPE-FSHIELD', 'Face Shield', 'Full face shield with browguard', 'Visor', 'PCS', 'Eye & Face', 'Face Shields', '🛡️'),
  ('PPE-COV-L', 'Coverall, Large', 'Flame-retardant cotton coverall — large', 'Boiler suit L', 'PCS', 'Body Protection', 'Coveralls', '🦺'),
  ('PPE-COV-XL', 'Coverall, X-Large', 'Flame-retardant cotton coverall — XL', 'Boiler suit XL', 'PCS', 'Body Protection', 'Coveralls', '🦺'),
  ('PPE-VEST-HV', 'Hi-Vis Vest, Orange', 'High-visibility reflective vest — orange', 'Reflective vest', 'PCS', 'Body Protection', 'Hi-Vis', '🦺'),
  ('PPE-MASK-DUST', 'Dust Masks (Pack of 10)', 'FFP2 disposable dust masks, pack of 10', 'FFP2 pack', 'PKT', 'Respiratory', 'Masks', '😷'),
  ('PPE-RESP-HALF', 'Half-Face Respirator', 'Reusable half-face respirator, A2P3 filters', 'Half mask', 'PCS', 'Respiratory', 'Respirators', '😷'),
  ('PPE-EPLUG-DOZ', 'Ear Plugs (Dozen)', 'Foam ear plugs SNR 37 dB — dozen pairs', 'Foam plugs', 'DOZ', 'Hearing', 'Ear Plugs', '🎧'),
  ('PPE-EMUFF', 'Ear Muffs', 'Over-head ear muffs SNR 31 dB', 'Ear defenders', 'PCS', 'Hearing', 'Ear Muffs', '🎧')
on conflict (code) do nothing;

insert into price_lists (id, name, contract, customer, valid_from, valid_till) values
  ('PL1', 'Price List 1', '600024', 'C01', '2026-01-01', '2026-12-31'),
  ('PL2', 'Price List 2', '700050', 'C03', '2026-03-01', '2027-02-28'),
  ('PL3', 'Price List 3', '800075', 'C04', '2026-05-01', '2027-04-30'),
  ('PL4', 'Price List 4', '900010', 'C05', '2026-06-01', '2027-05-31')
on conflict (id) do nothing;

insert into price_list_lines (pl, code, price, alloc, restricted) values
  ('PL1', 'PPE-SHOE-42', 150, 2, false),
  ('PL1', 'PPE-SHOE-44', 150, 2, false),
  ('PL1', 'PPE-HAT-GRN', 50, 2, false),
  ('PL1', 'PPE-GLV-GP', 5, 12, false),
  ('PL1', 'PPE-GLV-HEAT', 85, 2, true),
  ('PL1', 'PPE-GOG-CLR', 18, 4, false),
  ('PL1', 'PPE-COV-L', 95, 4, false),
  ('PL1', 'PPE-MASK-DUST', 35, 6, false),
  ('PL1', 'PPE-EPLUG-DOZ', 22, 4, false),
  ('PL1', 'PPE-VEST-HV', 28, 2, false),
  ('PL2', 'PPE-SHOE-44', 145, 2, false),
  ('PL2', 'PPE-GBOOT-43', 75, 2, false),
  ('PL2', 'PPE-HAT-WHT', 48, 2, false),
  ('PL2', 'PPE-CHINSTRAP', 8, 4, false),
  ('PL2', 'PPE-GLV-CHEM', 32, 6, false),
  ('PL2', 'PPE-FSHIELD', 45, 2, true),
  ('PL2', 'PPE-COV-XL', 95, 4, false),
  ('PL2', 'PPE-RESP-HALF', 120, 1, true),
  ('PL2', 'PPE-EMUFF', 55, 2, false),
  ('PL3', 'PPE-SHOE-42', 148, 2, false),
  ('PL3', 'PPE-HAT-GRN', 50, 2, false),
  ('PL3', 'PPE-GLV-GP', 5.5, 12, false),
  ('PL3', 'PPE-GOG-CLR', 18.5, 4, false),
  ('PL3', 'PPE-VEST-HV', 28, 3, false),
  ('PL3', 'PPE-MASK-DUST', 36, 6, false),
  ('PL4', 'PPE-SHOE-44', 150, 2, false),
  ('PL4', 'PPE-HAT-WHT', 52, 2, false),
  ('PL4', 'PPE-GLV-CHEM', 33, 6, false),
  ('PL4', 'PPE-COV-L', 98, 4, false),
  ('PL4', 'PPE-EPLUG-DOZ', 23, 4, false)
on conflict (pl, code) do nothing;

insert into sequences (key, val) values ('or', 1000), ('so', 5000), ('dn', 3000), ('inv', 9000), ('ret', 7000), ('emp', 1003) on conflict (key) do nothing;
