/**
 * Master data per Mobile App SRS2 (25-08-26) + "Data List" Excel workbooks
 * (Master List.xls, Price List.xls, Store Inventory List Main Stores.xls,
 *  Store Inventory Groups & Categories.xls).
 * Used by local mode and to generate the Supabase seed.
 *
 * NOTE on item codes: the Price List workbook contains a few typo'd codes
 * (PCSTHM→PCSHHM, PCSTCT→PCSHCT, FWBTHM→FWHMBT, FWBTGP→FEGPBT and a duplicated
 * PCTRHM0001 that is clearly size 36 = PCTRHM0004). They are normalised here
 * to the Item Master codes.
 */

/* Product photos are NOT stored here or in the database — they live in
   ./item-images.js and are merged in by the middleware when it serves the
   catalog. That keeps the master data (and supabase/seed.sql) small. */

const items = [
  // ---- Head Protection ----
  { code: "HPHTPE0001", name: "Hart Hat, Green",                                   uom: "PCS", group: "HP", cat: "HT", pic: "⛑️" },
  { code: "HPHTPE0002", name: "Hart Hat, Red",                                     uom: "PCS", group: "HP", cat: "HT", pic: "⛑️" },
  { code: "HPHTPE0003", name: "Hart Hat, Blue",                                    uom: "PCS", group: "HP", cat: "HT", pic: "⛑️" },
  // ---- Eye & Face ----
  { code: "EFSPPC0001", name: "Safety Spectacle, Clear",                           uom: "PCS", group: "EF", cat: "SP", pic: "🥽" },
  { code: "EFSPPC0002", name: "Safety Spectacle, Grey",                            uom: "PCS", group: "EF", cat: "SP", pic: "🥽" },
  { code: "EFGGNY0001", name: "Impact Goggle",                                     uom: "PCS", group: "EF", cat: "GG", pic: "🥽" },
  // ---- Respiratory ----
  { code: "RPDM950001", name: "N95 Dust Mask, 20 pcs/pkt",                         uom: "PKT", group: "RP", cat: "DM", pic: "😷" },
  // ---- Protective Clothing ----
  { code: "PCCVCT0001", name: "100% Cotton Coverall, Royal Blue, Size - Medium",   uom: "PCS", group: "PC", cat: "CV", pic: "🦺" },
  { code: "PCCVCT0002", name: "100% Cotton Coverall, Royal Blue, Size - Large",    uom: "PCS", group: "PC", cat: "CV", pic: "🦺" },
  { code: "PCCVCT0003", name: "100% Cotton Coverall, Royal Blue, Size - X Large",  uom: "PCS", group: "PC", cat: "CV", pic: "🦺" },
  { code: "PCSHHM0001", name: "Hot Metal Shirt, Medium Blue, Size - Medium",       uom: "PCS", group: "PC", cat: "ST", pic: "👕" },
  { code: "PCSHHM0002", name: "Hot Metal Shirt, Medium Blue, Size - Large",        uom: "PCS", group: "PC", cat: "ST", pic: "👕" },
  { code: "PCSHHM0003", name: "Hot Metal Shirt, Medium Blue, Size - X Large",      uom: "PCS", group: "PC", cat: "ST", pic: "👕" },
  { code: "PCSHCT0001", name: "Poly Cotton Work Shirt, Khaki, Size - Medium",      uom: "PCS", group: "PC", cat: "ST", pic: "👕" },
  { code: "PCSHCT0002", name: "Poly Cotton Work Shirt, Khaki, Size - Large",       uom: "PCS", group: "PC", cat: "ST", pic: "👕" },
  { code: "PCSHCT0003", name: "Poly Cotton Work Shirt, Khaki, Size - X Large",     uom: "PCS", group: "PC", cat: "ST", pic: "👕" },
  { code: "PCTRHM0001", name: "Hot Metal Trouser, Grey, Size - 30",         uom: "PCS", group: "PC", cat: "TR", pic: "👖" },
  { code: "PCTRHM0002", name: "Hot Metal Trouser, Grey, Size - 32",         uom: "PCS", group: "PC", cat: "TR", pic: "👖" },
  { code: "PCTRHM0003", name: "Hot Metal Trouser, Grey, Size - 34",         uom: "PCS", group: "PC", cat: "TR", pic: "👖" },
  { code: "PCTRHM0004", name: "Hot Metal Trouser, Grey, Size - 36",         uom: "PCS", group: "PC", cat: "TR", pic: "👖" },
  { code: "PCTRCT0001", name: "Poly Cotton Work Trouser, Navy Blue, Size - 30",    uom: "PCS", group: "PC", cat: "TR", pic: "👖" },
  { code: "PCTRCT0002", name: "Poly Cotton Work Trouser, Navy Blue, Size - 32",    uom: "PCS", group: "PC", cat: "TR", pic: "👖" },
  { code: "PCTRCT0003", name: "Poly Cotton Work Trouser, Navy Blue, Size - 34",    uom: "PCS", group: "PC", cat: "TR", pic: "👖" },
  { code: "PCTRCT0004", name: "Poly Cotton Work Trouser, Navy Blue, Size - 36",    uom: "PCS", group: "PC", cat: "TR", pic: "👖" },
  { code: "PCVSPE0001", name: "Hi-Viz Vest, Yellow, Size - Medium",                uom: "PRS", group: "PC", cat: "VS", pic: "🦺" },
  { code: "PCVSPE0002", name: "Hi-Viz Vest, Yellow, Size - Large",                 uom: "PRS", group: "PC", cat: "VS", pic: "🦺" },
  { code: "PCVSPE0003", name: "Hi-Viz Vest, Yellow, Size - X Large",               uom: "PRS", group: "PC", cat: "VS", pic: "🦺" },
  // ---- Gloves ----
  { code: "GLHMCT0001", name: "Heat Resistant Gloves",                             uom: "PRS", group: "GL", cat: "HR", pic: "🧤" },
  { code: "GLGPCT0001", name: "General Purpose Gloves, 12 prs/dp",                 uom: "DP",  group: "GL", cat: "GP", pic: "🧤" },
  // ---- Foot Wear ----
  { code: "FWHMBT0001", name: "Hot Metal Boots, Black, Size - 40",                 uom: "PRS", group: "FW", cat: "HM", pic: "🥾" },
  { code: "FWHMBT0002", name: "Hot Metal Boots, Black, Size - 41",                 uom: "PRS", group: "FW", cat: "HM", pic: "🥾" },
  { code: "FWHMBT0003", name: "Hot Metal Boots, Black, Size - 42",                 uom: "PRS", group: "FW", cat: "HM", pic: "🥾" },
  { code: "FWHMBT0004", name: "Hot Metal Boots, Black, Size - 43",                 uom: "PRS", group: "FW", cat: "HM", pic: "🥾" },
  { code: "FWHMBT0005", name: "Hot Metal Boots, Black, Size - 44",                 uom: "PRS", group: "FW", cat: "HM", pic: "🥾" },
  { code: "FEGPBT0001", name: "General Purpose Safety Boots, Brown, Size - 40",    uom: "PRS", group: "FW", cat: "GP", pic: "🥾" },
  { code: "FEGPBT0002", name: "General Purpose Safety Boots, Brown, Size - 41",    uom: "PRS", group: "FW", cat: "GP", pic: "🥾" },
  { code: "FEGPBT0003", name: "General Purpose Safety Boots, Brown, Size - 42",    uom: "PRS", group: "FW", cat: "GP", pic: "🥾" },
  { code: "FEGPBT0004", name: "General Purpose Safety Boots, Brown, Size - 43",    uom: "PRS", group: "FW", cat: "GP", pic: "🥾" },
  { code: "FEGPBT0005", name: "General Purpose Safety Boots, Brown, Size - 44",    uom: "PRS", group: "FW", cat: "GP", pic: "🥾" }
].map(i => ({ desc: i.name, alias: i.name, ...i }));

/* EGA Main Store opening stock — "Store Inventory List Main Stores.xls" */
const mainStoreQty = {
  HPHTPE0001: 25, HPHTPE0002: 25, HPHTPE0003: 25,
  EFSPPC0001: 25, EFSPPC0002: 25, EFGGNY0001: 10,
  RPDM950001: 50,
  PCCVCT0001: 50, PCCVCT0002: 50, PCCVCT0003: 50,
  PCSHHM0001: 50, PCSHHM0002: 50, PCSHHM0003: 50,
  PCSHCT0001: 50, PCSHCT0002: 50, PCSHCT0003: 50,
  PCTRHM0001: 50, PCTRHM0002: 50, PCTRHM0003: 50, PCTRHM0004: 50,
  PCTRCT0001: 50, PCTRCT0002: 50, PCTRCT0003: 50, PCTRCT0004: 50,
  PCVSPE0001: 50, PCVSPE0002: 50, PCVSPE0003: 50,
  GLHMCT0001: 50, GLGPCT0001: 100,
  FWHMBT0001: 20, FWHMBT0002: 20, FWHMBT0003: 20, FWHMBT0004: 20, FWHMBT0005: 20,
  FEGPBT0001: 20, FEGPBT0002: 20, FEGPBT0003: 20, FEGPBT0004: 20, FEGPBT0005: 20
};

module.exports = {
  customers: [
    { id: "C01", name: "Dubai Aluminum",    address: "P. O. Box 1234, Dubai - UAE",     phone: "+971 4 223xxxx", fax: "+971 4 414xxxx", email: "dubal@gmail.com" },
    { id: "C02", name: "Emirates Aluminum", address: "P. O. Box 5678, Abu Dhabi - UAE", phone: "+971 2 323xxxx", fax: "+971 4 512xxxx", email: "emal@gmail.com" }
  ],

  /* Employee Master (SRS2) — the source of truth for who may register.
     Self-registration validates TWO data points (Employee ID + Mobile Phone)
     against this master and auto-fills the rest of the profile from it. */
  employees: [
    { empId: "ID001", name: "Ahmed Al Mansoori", customer: "C01", dept: "PLDA", location: "DA001", phone: "+971 50 xxxxxx1", telephone: "+971 4 8011001", email: "ahmed.m@dubal.ae" },
    { empId: "ID002", name: "Khalid Al Suwaidi",  customer: "C01", dept: "MNDA", location: "DA003", phone: "+971 50 xxxxxx2", telephone: "+971 4 8011002", email: "khalid.s@dubal.ae" },
    { empId: "ID003", name: "Sara Khan",          customer: "C01", dept: "EGDA", location: "DA002", phone: "+971 50 xxxxxx3", telephone: "+971 4 8011003", email: "sara.k@twa.ae" },
    { empId: "ID004", name: "Imran Sheikh",       customer: "C01", dept: "PLDA", location: "DA001", phone: "+971 50 xxxxxx4", telephone: "+971 4 8011004", email: "imran.s@dubal.ae" },
    { empId: "ID005", name: "Fatima Al Ali",      customer: "C02", dept: "EGEA", location: "EA002", phone: "+971 50 xxxxxx5", telephone: "+971 2 8012005", email: "fatima.a@emal.ae" },
    { empId: "ID006", name: "Joseph Mathew",      customer: "C02", dept: "MNEA", location: "EA003", phone: "+971 50 xxxxxx6", telephone: "+971 2 8012006", email: "joseph.m@emal.ae" },
    { empId: "ID007", name: "Ravi Kumar",         customer: "C02", dept: "PLEA", location: "EA001", phone: "+971 50 xxxxxx7", telephone: "+971 2 8012007", email: "ravi.k@emal.ae" },
    { empId: "ID008", name: "Mariam Al Zaabi",    customer: "C02", dept: "PLEA", location: "EA001", phone: "+971 50 xxxxxx8", telephone: "+971 2 8012008", email: "mariam.z@emal.ae" }
  ],

  contracts: [
    { ref: "50002834", customer: "C01", value: 500000.0, start: "2026-08-10", end: "2027-08-09" },
    { ref: "60008792", customer: "C02", value: 450000.0, start: "2026-08-20", end: "2027-08-19" }
  ],

  departments: [
    { code: "PLDA", name: "Pot Line Dubal" },
    { code: "EGDA", name: "Engineering Dubal" },
    { code: "MNDA", name: "Maintenance Dubal" },
    { code: "PLEA", name: "Pot Line Emal" },
    { code: "EGEA", name: "Engineering Emal" },
    { code: "MNEA", name: "Maintenance Emal" }
  ],

  locations: [
    { code: "DA001", name: "Dubal1" }, { code: "DA002", name: "Dubal2" }, { code: "DA003", name: "Dubal3" },
    { code: "EA001", name: "Emal1" },  { code: "EA002", name: "Emal2" },  { code: "EA003", name: "Emal3" }
  ],

  divisions: [
    { code: "PSSEGA", name: "Prosafe EGA" },
    { code: "PSSGNS", name: "Prosafe General" }
  ],

  /* Each Division has multiple stores. type: main | reservation.
     Orders reserve stock by transferring Main → Reservation (Issue+Receipt vouchers);
     Delivery Notes are issued from the Reservation store. */
  stores: [
    { code: "EGAMS", name: "EGA Main Store",           division: "PSSEGA", type: "main" },
    { code: "EGADR", name: "Dubal Reservation Store",  division: "PSSEGA", type: "reservation" },
    { code: "EGAER", name: "Emal Reservation Store",   division: "PSSEGA", type: "reservation" }
  ],

  groups: [
    { code: "HP", name: "Head Protection" },
    { code: "EF", name: "Eye & Face Protection" },
    { code: "RP", name: "Respiratory Protection" },
    { code: "PC", name: "Protective Clothing" },
    { code: "GL", name: "Gloves" },
    { code: "FW", name: "Foot Wear" }
  ],

  categories: [
    { code: "HT", name: "Hard Hat" },       { code: "SP", name: "Spectacle" },
    { code: "GG", name: "Goggle" },         { code: "DM", name: "Dust Mask" },
    { code: "CV", name: "Coverall" },       { code: "ST", name: "Shirt" },
    { code: "TR", name: "Trouser" },        { code: "VS", name: "Vest" },
    { code: "HR", name: "Heat Resistant" }, { code: "GP", name: "General Purpose" },
    { code: "HM", name: "Hot Metal" }
  ],

  uoms: ["PCS", "PKT", "PRS", "DOZ", "DP"],

  items,

  /* Opening inventory per store (reservation stores start empty and are filled
     by order-time stock transfers from the Main store). */
  inventory: {
    EGAMS: mainStoreQty,
    EGADR: {},
    EGAER: {}
  },

  /* Price List Master — header per SRS2 (code, description, start/end date,
     delivery period in days) + table as in the "Price list" Excel sheet.
     A line may carry several item codes (size variants sharing one allocation);
     `restricted: true` = the allocated qty limit is enforced ("Qty Restricted -
     Yes"): within limit → Order Cart, beyond limit → Approval Cart. */
  priceLists: [
    { id: "PL1", name: "PPE Price List1", desc: "Supply of PPE", contract: "50002834", customer: "C01",
      validFrom: "2026-08-10", validTill: "2026-11-09", deliveryPeriod: 2, lines: [
      // Hard hat offered in Green / Red / Blue — the employee picks the colour on
      // the shopping screen; the allocated qty is shared across the colours.
      { sl: 1, codes: ["HPHTPE0001", "HPHTPE0002", "HPHTPE0003"], uom: "PCS", price: 15.0,  alloc: 2,  restricted: true },
      // Spectacle offered in Grey and Clear — one shared allocation, one price per
      // price list. Split into two lines in Masters if they need different prices.
      { sl: 2, codes: ["EFSPPC0002", "EFSPPC0001"], uom: "PCS", price: 30.0,  alloc: 3,  restricted: true },
      { sl: 3, codes: ["RPDM950001"], uom: "PKT", price: 50.0,  alloc: 5,  restricted: true },
      { sl: 4, codes: ["PCSHHM0001", "PCSHHM0002", "PCSHHM0003"], uom: "PCS", price: 225.0, alloc: 3, restricted: true },
      { sl: 5, codes: ["PCTRHM0001", "PCTRHM0002", "PCTRHM0003", "PCTRHM0004"], uom: "PCS", price: 230.0, alloc: 3, restricted: true },
      { sl: 6, codes: ["GLHMCT0001"], uom: "PRS", price: 20.0,  alloc: 10, restricted: true },
      { sl: 7, codes: ["GLGPCT0001"], uom: "DP",  price: 15.0,  alloc: 20, restricted: true },
      { sl: 8, codes: ["FWHMBT0001", "FWHMBT0002", "FWHMBT0003", "FWHMBT0004", "FWHMBT0005"], uom: "PRS", price: 600.0, alloc: 1, restricted: true }
    ]},
    { id: "PL2", name: "PPE Price List2", desc: "Supply of PPE", contract: "50002834", customer: "C01",
      validFrom: "2026-08-15", validTill: "2026-11-14", deliveryPeriod: 2, lines: [
      { sl: 1, codes: ["HPHTPE0002", "HPHTPE0001", "HPHTPE0003"], uom: "PCS", price: 15.0, alloc: 2, restricted: true },
      { sl: 2, codes: ["EFSPPC0001", "EFSPPC0002"], uom: "PCS", price: 10.0, alloc: 3, restricted: true },
      { sl: 3, codes: ["EFGGNY0001"], uom: "PCS", price: 15.0, alloc: 2, restricted: true },
      { sl: 4, codes: ["RPDM950001"], uom: "PKT", price: 50.0, alloc: 5, restricted: true },
      { sl: 5, codes: ["PCSHCT0001", "PCSHCT0002", "PCSHCT0003"], uom: "PCS", price: 85.0, alloc: 3, restricted: true },
      { sl: 6, codes: ["PCTRCT0001", "PCTRCT0002", "PCTRCT0003", "PCTRCT0004"], uom: "PCS", price: 80.0, alloc: 3, restricted: true },
      { sl: 7, codes: ["PCVSPE0001", "PCVSPE0002", "PCVSPE0003"], uom: "PRS", price: 25.0, alloc: 2, restricted: true },
      { sl: 8, codes: ["GLGPCT0001"], uom: "DP", price: 15.0, alloc: 10, restricted: true },
      { sl: 9, codes: ["FEGPBT0001", "FEGPBT0002", "FEGPBT0003", "FEGPBT0004", "FEGPBT0005"], uom: "PRS", price: 175.0, alloc: 2, restricted: true }
    ]},
    { id: "PL3", name: "PPE Price List3", desc: "Supply of PPE", contract: "60008792", customer: "C02",
      validFrom: "2026-08-20", validTill: "2026-11-19", deliveryPeriod: 2, lines: [
      { sl: 1, codes: ["HPHTPE0003", "HPHTPE0001", "HPHTPE0002"], uom: "PCS", price: 15.0, alloc: 0, restricted: true },
      { sl: 2, codes: ["EFSPPC0002", "EFSPPC0001"], uom: "PCS", price: 10.0, alloc: 3, restricted: true },
      { sl: 3, codes: ["EFGGNY0001"], uom: "PCS", price: 15.0, alloc: 2, restricted: true },
      { sl: 4, codes: ["RPDM950001"], uom: "PKT", price: 50.0, alloc: 5, restricted: true },
      { sl: 5, codes: ["PCCVCT0001", "PCCVCT0002", "PCCVCT0003"], uom: "PCS", price: 100.0, alloc: 3, restricted: true },
      { sl: 6, codes: ["PCVSPE0001", "PCVSPE0002", "PCVSPE0003"], uom: "PRS", price: 25.0, alloc: 2, restricted: true },
      { sl: 7, codes: ["GLGPCT0001"], uom: "DP", price: 15.0, alloc: 10, restricted: true },
      { sl: 8, codes: ["FEGPBT0001", "FEGPBT0002", "FEGPBT0003", "FEGPBT0004", "FEGPBT0005"], uom: "PRS", price: 175.0, alloc: 2, restricted: true }
    ]}
  ],

  /* Local-demo-mode logins only (password for all: prosafe1). In Supabase mode, users sign up themselves.
     Roles: employee · approver · store (Store Module) · admin (Store Module + administration). */
  demoUsers: [
    { id: "local-e1001", empId: "ID001", name: "Ahmed Al Mansoori", email: "ahmed.m@dubal.ae",  phone: "+971 50 xxxxxx1", customer: "C01", dept: "PLDA", location: "DA001", priceLists: ["PL1", "PL2"], fromStore: "EGAMS", toStore: "EGADR", role: "employee", roles: ["employee", "approver"], telephone: "+971 4 8011001", username: "ahmedm", active: true },
    { id: "local-e1002", empId: "ID007", name: "Ravi Kumar",        email: "ravi.k@emal.ae",    phone: "+971 50 xxxxxx7", customer: "C02", dept: "PLEA", location: "EA001", priceLists: ["PL3"],        fromStore: "EGAMS", toStore: "EGAER", role: "employee", roles: ["employee"], telephone: "+971 2 8012007", username: "ravik",  active: true },
    { id: "local-e1003", empId: "ID003", name: "Sara Khan",         email: "sara.k@twa.ae",     phone: "+971 50 xxxxxx3", customer: "C01", dept: "EGDA", location: "DA002", priceLists: ["PL2"],        fromStore: "EGAMS", toStore: "EGADR", role: "employee", roles: ["employee"], telephone: "+971 4 8011003", username: "sarak",  active: true },
    { id: "local-a2001", empId: "A2001", name: "Mohammed Hassan",   email: "m.hassan@ega.ae",   phone: "+971 50 9876543", customer: "C01", dept: "EGDA", location: null,    priceLists: [],             fromStore: null,    toStore: null,    role: "approver", roles: ["approver"], telephone: "+971 4 8010000", username: "mhassan", active: true },
    { id: "local-w4001", empId: "W4001", name: "EGA Store Keeper",  email: "storekeeper@prosafe.ae", phone: "+971 4 3334466", customer: null, dept: null, location: null, priceLists: [], fromStore: "EGAMS", toStore: "EGADR", role: "store",    roles: ["store"],    telephone: "+971 4 3334466", username: "keeper",  active: true },
    { id: "local-s3001", empId: "S3001", name: "PROSAFE Stores",    email: "stores@prosafe.ae", phone: "+971 4 3334455",  customer: null,  dept: null,   location: null,    priceLists: [],             fromStore: null,    toStore: null,    role: "admin",    roles: ["admin"],    telephone: "+971 4 3334455", username: "prosafe", active: true }
  ],

  seq: { or: 1000, so: 5000, dn: 3000, inv: 9000, ret: 7000, cn: 7500, stv: 6000, emp: 1003 }
};
