// A sample family: the imperial Chola line, from Parantaka I down to
// Kulothunga I.
//
// The people and the links between them are the historical succession. The
// dates are not: every year here has been moved into the modern range so the
// sample reads like a family somebody alive today would be entering, which is
// what the app is for. Ages, elder and younger, and the order of brothers and
// sisters all follow from these invented dates rather than from the real ones.
//
// Where a queen's name is not recorded, the child simply hangs from the one
// parent that is known, which the app allows.
//
// The file holds primitive facts only: who the parents are, who married whom,
// each person's sex and when they were born. No relationship is written down
// anywhere, because the app works all of them out.

export const SAMPLE = {
  format: "heritrac",
  version: 1,
  meta: { name: "The Chola line", sample: true },
  settings: { ego: "rajaraja", pack: "english" },
  people: [
    { id: "parantaka",    name: "Parantaka I",     sex: "M", birth: { year: 1880 }, death: { year: 1955 } },
    { id: "kokkilan",     name: "Kokkilanadigal",  sex: "F", birth: { year: 1884 }, death: { year: 1962 } },

    { id: "rajaditya",    name: "Rajaditya",       sex: "M", birth: { year: 1904 }, death: { year: 1949 } },
    { id: "gandaraditya", name: "Gandaraditya",    sex: "M", birth: { year: 1907 }, death: { year: 1971 } },
    { id: "sembiyan",     name: "Sembiyan Mahadevi", sex: "F", birth: { year: 1913 }, death: { year: 2003 } },
    { id: "arinjaya",     name: "Arinjaya Chola",  sex: "M", birth: { year: 1911 }, death: { year: 1974 } },
    { id: "kalyani",      name: "Kalyani",         sex: "F", birth: { year: 1915 }, death: { year: 1998 } },

    { id: "uttama",       name: "Uttama Chola",    sex: "M", birth: { year: 1929 }, death: { year: 1992 } },
    { id: "sundara",      name: "Sundara Chola",   sex: "M", birth: { year: 1931, month: 2, day: 18 }, death: { year: 1986 } },
    { id: "vanavan",      name: "Vanavan Mahadevi", sex: "F", birth: { year: 1934 }, death: { year: 2001 } },

    { id: "gandaradittan", name: "Gandaradittan",  sex: "M", birth: { year: 1955 } },

    { id: "kundavai",     name: "Kundavai",        sex: "F", birth: { year: 1952 } },
    { id: "vandiyadevan", name: "Vandiyadevan",    sex: "M", birth: { year: 1949 } },
    { id: "aditya2",      name: "Aditya Karikalan", sex: "M", birth: { year: 1954 }, death: { year: 1981 } },
    { id: "rajaraja",     name: "Rajaraja Chola I", sex: "M", birth: { year: 1957, month: 10, day: 23 } },
    { id: "lokamahadevi", name: "Lokamahadevi",    sex: "F", birth: { year: 1960 } },

    { id: "rajendra",     name: "Rajendra Chola I", sex: "M", birth: { year: 1982, month: 7, day: 4 } },
    { id: "viramahadevi", name: "Viramahadevi",    sex: "F", birth: { year: 1984 } },
    { id: "mukkokilan",   name: "Mukkokilan",      sex: "F", birth: { year: 1987 } },
    { id: "kundavai2",    name: "Kundavai Pirattiyar", sex: "F", birth: { year: 1985 } },
    { id: "vimaladitya",  name: "Vimaladitya",     sex: "M", birth: { year: 1980 } },

    { id: "rajadhiraja",  name: "Rajadhiraja I",   sex: "M", birth: { year: 2003 } },
    { id: "narendra",     name: "Rajaraja Narendra", sex: "M", birth: { year: 2003 } },
    { id: "ammangadevi",  name: "Ammangadevi",     sex: "F", birth: { year: 2004, month: 1, day: 30 } },
    { id: "rajendra2",    name: "Rajendra II",     sex: "M", birth: { year: 2005 } },
    { id: "virarajendra", name: "Virarajendra",    sex: "M", birth: { year: 2006 } },

    { id: "kulothunga",   name: "Kulothunga I",    sex: "M", birth: { year: 2026, month: 3, day: 11 } },
    { id: "madhurantaki", name: "Madhurantaki",    sex: "F", birth: { year: 2026 } }
  ],
  unions: [
    { id: "u-parantaka",   spouses: ["parantaka", "kokkilan"],    children: ["rajaditya", "gandaraditya", "arinjaya"] },

    // Two of Parantaka's sons carry the line on, which is why Uttama and
    // Sundara are cousins rather than brothers.
    { id: "u-gandaraditya", spouses: ["gandaraditya", "sembiyan"], children: ["uttama"] },
    { id: "u-arinjaya",    spouses: ["arinjaya", "kalyani"],      children: ["sundara"] },

    { id: "u-uttama",      spouses: ["uttama"],                   children: ["gandaradittan"] },
    { id: "u-sundara",     spouses: ["sundara", "vanavan"],       children: ["kundavai", "aditya2", "rajaraja"] },
    { id: "u-kundavai",    spouses: ["kundavai", "vandiyadevan"], children: [] },

    { id: "u-rajaraja",    spouses: ["rajaraja", "lokamahadevi"], children: ["rajendra", "kundavai2"] },

    // Rajendra's children come from two queens, so Virarajendra is a half
    // brother to the other three and Mukkokilan is their stepmother.
    { id: "u-rajendra-1",  spouses: ["rajendra", "viramahadevi"], children: ["rajadhiraja", "ammangadevi", "rajendra2"] },
    { id: "u-rajendra-2",  spouses: ["rajendra", "mukkokilan"],   children: ["virarajendra"] },

    // Kundavai married into the Vengi line, so her son Narendra belongs to
    // both houses.
    { id: "u-kundavai2",   spouses: ["kundavai2", "vimaladitya"], children: ["narendra"] },

    // Ammangadevi married Narendra, who is already her first cousin. One
    // person, two correct answers, which is the case most family tree apps
    // get wrong.
    { id: "u-ammangadevi", spouses: ["ammangadevi", "narendra"],  children: ["kulothunga"] },

    { id: "u-virarajendra", spouses: ["virarajendra"],            children: ["madhurantaki"] }
  ]
};
