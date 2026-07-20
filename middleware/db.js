/**
 * Simple JSON-file datastore with seed data (per Mobile App SRS1 08-07-26).
 * Pilot-grade persistence — swap for PostgreSQL/MySQL in full production.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const SEED = {
  customers: [
    { id: "C01", name: "Dubal",           address: "Jebel Ali, Dubai, UAE",       phone: "+971-4-8021111", email: "stores@dubal.ae" },
    { id: "C02", name: "DXB Power Plant", address: "Al Aweer, Dubai, UAE",        phone: "+971-4-6081234", email: "procurement@dxbpower.ae" },
    { id: "C03", name: "Emal",            address: "Al Taweelah, Abu Dhabi, UAE", phone: "+971-2-5092000", email: "stores@emal.ae" },
    { id: "C04", name: "TWA Power Plant", address: "Taweelah, Abu Dhabi, UAE",    phone: "+971-2-5093500", email: "power.stores@twa.ae" },
    { id: "C05", name: "TWA Refinery",    address: "Taweelah, Abu Dhabi, UAE",    phone: "+971-2-5094100", email: "refinery.stores@twa.ae" }
  ],
  departments: ["Pot Line", "Engg Dept", "Maintenance", "Reduction", "Smelting"],
  locations: ["Location 1", "Location 2", "Location 3", "Location 4"],
  uoms: ["PCS", "PKT", "PRS", "DOZ"],
  items: [
    { code: "PPE-SHOE-42",   name: "Safety Shoes Size 42",      desc: "Steel-toe leather safety shoes, S3 SRC, size 42",  alias: "Safety boots 42",  uom: "PRS", group: "Foot Protection", cat: "Safety Shoes",     pic: "🥾" },
    { code: "PPE-SHOE-44",   name: "Safety Shoes Size 44",      desc: "Steel-toe leather safety shoes, S3 SRC, size 44",  alias: "Safety boots 44",  uom: "PRS", group: "Foot Protection", cat: "Safety Shoes",     pic: "🥾" },
    { code: "PPE-GBOOT-43",  name: "Gum Boots Size 43",         desc: "PVC chemical-resistant gum boots, size 43",        alias: "Wellington 43",    uom: "PRS", group: "Foot Protection", cat: "Gum Boots",        pic: "👢" },
    { code: "PPE-HAT-GRN",   name: "Hard Hat, Green",           desc: "HDPE safety helmet, ratchet suspension — green",   alias: "Helmet green",     uom: "PCS", group: "Head Protection", cat: "Hard Hats",        pic: "⛑️" },
    { code: "PPE-HAT-WHT",   name: "Hard Hat, White",           desc: "HDPE safety helmet, ratchet suspension — white",   alias: "Helmet white",     uom: "PCS", group: "Head Protection", cat: "Hard Hats",        pic: "⛑️" },
    { code: "PPE-CHINSTRAP", name: "Helmet Chin Strap",         desc: "Elastic chin strap for hard hats",                 alias: "Chin strap",       uom: "PCS", group: "Head Protection", cat: "Accessories",      pic: "🪢" },
    { code: "PPE-GLV-GP",    name: "General Purpose Gloves",    desc: "Cotton-polyester knitted work gloves",             alias: "GP gloves",        uom: "PRS", group: "Hand Protection", cat: "General Gloves",   pic: "🧤" },
    { code: "PPE-GLV-HEAT",  name: "Heat Resistant Gloves",     desc: "Aluminised heat-resistant gloves up to 500°C",     alias: "Furnace gloves",   uom: "PRS", group: "Hand Protection", cat: "Specialty Gloves", pic: "🧤" },
    { code: "PPE-GLV-CHEM",  name: "Chemical Resistant Gloves", desc: "Nitrile chemical-resistant gauntlet gloves",       alias: "Nitrile gauntlet", uom: "PRS", group: "Hand Protection", cat: "Specialty Gloves", pic: "🧤" },
    { code: "PPE-GOG-CLR",   name: "Safety Goggles, Clear",     desc: "Anti-fog clear polycarbonate goggles",             alias: "Clear goggles",    uom: "PCS", group: "Eye & Face",      cat: "Goggles",          pic: "🥽" },
    { code: "PPE-FSHIELD",   name: "Face Shield",               desc: "Full face shield with browguard",                  alias: "Visor",            uom: "PCS", group: "Eye & Face",      cat: "Face Shields",     pic: "🛡️" },
    { code: "PPE-COV-L",     name: "Coverall, Large",           desc: "Flame-retardant cotton coverall — large",          alias: "Boiler suit L",    uom: "PCS", group: "Body Protection", cat: "Coveralls",        pic: "🦺" },
    { code: "PPE-COV-XL",    name: "Coverall, X-Large",         desc: "Flame-retardant cotton coverall — XL",             alias: "Boiler suit XL",   uom: "PCS", group: "Body Protection", cat: "Coveralls",        pic: "🦺" },
    { code: "PPE-VEST-HV",   name: "Hi-Vis Vest, Orange",       desc: "High-visibility reflective vest — orange",         alias: "Reflective vest",  uom: "PCS", group: "Body Protection", cat: "Hi-Vis",           pic: "🦺" },
    { code: "PPE-MASK-DUST", name: "Dust Masks (Pack of 10)",   desc: "FFP2 disposable dust masks, pack of 10",           alias: "FFP2 pack",        uom: "PKT", group: "Respiratory",     cat: "Masks",            pic: "😷" },
    { code: "PPE-RESP-HALF", name: "Half-Face Respirator",      desc: "Reusable half-face respirator, A2P3 filters",      alias: "Half mask",        uom: "PCS", group: "Respiratory",     cat: "Respirators",      pic: "😷" },
    { code: "PPE-EPLUG-DOZ", name: "Ear Plugs (Dozen)",         desc: "Foam ear plugs SNR 37 dB — dozen pairs",           alias: "Foam plugs",       uom: "DOZ", group: "Hearing",         cat: "Ear Plugs",        pic: "🎧" },
    { code: "PPE-EMUFF",     name: "Ear Muffs",                 desc: "Over-head ear muffs SNR 31 dB",                    alias: "Ear defenders",    uom: "PCS", group: "Hearing",         cat: "Ear Muffs",        pic: "🎧" }
  ],
  priceLists: [
    { id: "PL1", name: "Price List 1", contract: "600024", customer: "C01", validFrom: "2026-01-01", validTill: "2026-12-31", lines: [
      { code: "PPE-SHOE-42",   price: 150.0, alloc: 2,  restricted: false },
      { code: "PPE-SHOE-44",   price: 150.0, alloc: 2,  restricted: false },
      { code: "PPE-HAT-GRN",   price: 50.0,  alloc: 2,  restricted: false },
      { code: "PPE-GLV-GP",    price: 5.0,   alloc: 12, restricted: false },
      { code: "PPE-GLV-HEAT",  price: 85.0,  alloc: 2,  restricted: true  },
      { code: "PPE-GOG-CLR",   price: 18.0,  alloc: 4,  restricted: false },
      { code: "PPE-COV-L",     price: 95.0,  alloc: 4,  restricted: false },
      { code: "PPE-MASK-DUST", price: 35.0,  alloc: 6,  restricted: false },
      { code: "PPE-EPLUG-DOZ", price: 22.0,  alloc: 4,  restricted: false },
      { code: "PPE-VEST-HV",   price: 28.0,  alloc: 2,  restricted: false }
    ]},
    { id: "PL2", name: "Price List 2", contract: "700050", customer: "C03", validFrom: "2026-03-01", validTill: "2027-02-28", lines: [
      { code: "PPE-SHOE-44",   price: 145.0, alloc: 2, restricted: false },
      { code: "PPE-GBOOT-43",  price: 75.0,  alloc: 2, restricted: false },
      { code: "PPE-HAT-WHT",   price: 48.0,  alloc: 2, restricted: false },
      { code: "PPE-CHINSTRAP", price: 8.0,   alloc: 4, restricted: false },
      { code: "PPE-GLV-CHEM",  price: 32.0,  alloc: 6, restricted: false },
      { code: "PPE-FSHIELD",   price: 45.0,  alloc: 2, restricted: true  },
      { code: "PPE-COV-XL",    price: 95.0,  alloc: 4, restricted: false },
      { code: "PPE-RESP-HALF", price: 120.0, alloc: 1, restricted: true  },
      { code: "PPE-EMUFF",     price: 55.0,  alloc: 2, restricted: false }
    ]},
    { id: "PL3", name: "Price List 3", contract: "800075", customer: "C04", validFrom: "2026-05-01", validTill: "2027-04-30", lines: [
      { code: "PPE-SHOE-42",   price: 148.0, alloc: 2,  restricted: false },
      { code: "PPE-HAT-GRN",   price: 50.0,  alloc: 2,  restricted: false },
      { code: "PPE-GLV-GP",    price: 5.5,   alloc: 12, restricted: false },
      { code: "PPE-GOG-CLR",   price: 18.5,  alloc: 4,  restricted: false },
      { code: "PPE-VEST-HV",   price: 28.0,  alloc: 3,  restricted: false },
      { code: "PPE-MASK-DUST", price: 36.0,  alloc: 6,  restricted: false }
    ]},
    { id: "PL4", name: "Price List 4", contract: "900010", customer: "C05", validFrom: "2026-06-01", validTill: "2027-05-31", lines: [
      { code: "PPE-SHOE-44",   price: 150.0, alloc: 2, restricted: false },
      { code: "PPE-HAT-WHT",   price: 52.0,  alloc: 2, restricted: false },
      { code: "PPE-GLV-CHEM",  price: 33.0,  alloc: 6, restricted: false },
      { code: "PPE-COV-L",     price: 98.0,  alloc: 4, restricted: false },
      { code: "PPE-EPLUG-DOZ", price: 23.0,  alloc: 4, restricted: false }
    ]}
  ],
  /* PINs are demo values — replace with proper credential management before go-live */
  employees: [
    { id: "E1001", name: "Ahmed Al Mansoori", pin: "1111", phone: "+971-50-1234567", email: "ahmed.m@dubal.ae",  customer: "C01", dept: "Pot Line",    priceList: "PL1", role: "employee" },
    { id: "E1002", name: "Ravi Kumar",        pin: "2222", phone: "+971-55-2345678", email: "ravi.k@emal.ae",    customer: "C03", dept: "Maintenance", priceList: "PL2", role: "employee" },
    { id: "E1003", name: "Sara Khan",         pin: "3333", phone: "+971-56-3456789", email: "sara.k@twa.ae",     customer: "C04", dept: "Engg Dept",   priceList: "PL3", role: "employee" },
    { id: "A2001", name: "Mohammed Hassan",   pin: "4444", phone: "+971-50-9876543", email: "m.hassan@ega.ae",   customer: "C03", dept: "Engg Dept",   priceList: null,  role: "approver" },
    { id: "S3001", name: "PROSAFE Stores",    pin: "5555", phone: "+971-4-3334455",  email: "stores@prosafe.ae", customer: null,  dept: null,          priceList: null,  role: "admin" }
  ],
  consumption: {},   // consumption[empId][itemCode] = qty counted against allocation
  extraAlloc: {},    // extraAlloc[empId][itemCode] = approved qty beyond price-list allocation
  orders: [],
  erp: { so: [], dn: [], inv: [], ret: [], log: [] },
  seq: { or: 1000, so: 5000, dn: 3000, inv: 9000, ret: 7000 }
};

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    db = JSON.parse(JSON.stringify(SEED));
    save();
  }
  return db;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE); // atomic-ish write
}

function reset() {
  db = JSON.parse(JSON.stringify(SEED));
  save();
  return db;
}

/* ---------- helpers ---------- */
const item     = code => load().items.find(i => i.code === code);
const cust     = id   => load().customers.find(c => c.id === id);
const emp      = id   => load().employees.find(e => e.id === id);
const pl       = id   => load().priceLists.find(p => p.id === id);
const plLine   = (plId, code) => { const p = pl(plId); return p ? p.lines.find(l => l.code === code) : null; };
const consumed = (empId, code) => (load().consumption[empId] || {})[code] || 0;
const extra    = (empId, code) => (load().extraAlloc[empId] || {})[code] || 0;

function allocFor(empId, code) {
  const e = emp(empId);
  const l = e && e.priceList ? plLine(e.priceList, code) : null;
  return (l ? l.alloc : 0) + extra(empId, code);
}
const balanceFor = (empId, code) => allocFor(empId, code) - consumed(empId, code);

function addConsumption(empId, code, qty) {
  const d = load();
  d.consumption[empId] = d.consumption[empId] || {};
  d.consumption[empId][code] = (d.consumption[empId][code] || 0) + qty;
}
function addExtra(empId, code, qty) {
  const d = load();
  d.extraAlloc[empId] = d.extraAlloc[empId] || {};
  d.extraAlloc[empId][code] = (d.extraAlloc[empId][code] || 0) + qty;
}
function nextSeq(key, prefix) {
  const d = load();
  d.seq[key]++;
  return prefix + d.seq[key];
}
function erpLog(msg) {
  load().erp.log.unshift({ at: new Date().toISOString(), msg });
}

module.exports = {
  load, save, reset, item, cust, emp, pl, plLine,
  consumed, extra, allocFor, balanceFor,
  addConsumption, addExtra, nextSeq, erpLog
};
