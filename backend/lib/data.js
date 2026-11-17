// Real latitude/longitude of Pune areas (approximate area centres), and the main roads that connect them.
// Road distances are NOT typed here: graph.js fetches real driving distances from OpenStreetMap routing.
// Every name used in EDGES must exist in AREAS (backend/test.js checks this, plus connectivity).
const AREAS = {
  // original 16
  'Hinjewadi':[18.5912,73.7389], 'Wakad':[18.5984,73.7608], 'Baner':[18.5590,73.7868],
  'Pashan':[18.5340,73.7910], 'Aundh':[18.5580,73.8075], 'Kothrud':[18.5074,73.8077],
  'Shivajinagar':[18.5308,73.8475], 'Deccan':[18.5167,73.8412], 'Pune Station':[18.5286,73.8742],
  'Koregaon Park':[18.5362,73.8940], 'Swargate':[18.5018,73.8636], 'Katraj':[18.4575,73.8677],
  'Kondhwa':[18.4630,73.8930], 'Hadapsar':[18.5089,73.9260], 'Viman Nagar':[18.5679,73.9143],
  'Kharadi':[18.5515,73.9430],

  // North / Northeast
  'Lohegaon':[18.5937,73.9167], 'Dhanori':[18.5963,73.9097], 'Kalyani Nagar':[18.5463,73.9029],
  'Yerwada':[18.5535,73.8869], 'Wadgaon Sheri':[18.5503,73.9235], 'Vishrantwadi':[18.5762,73.8794],
  'Tingre Nagar':[18.5885,73.9005], 'Wagholi':[18.5808,73.9787], 'Kesnand':[18.6122,74.0050],
  'Mundhwa':[18.5314,73.9319], 'Magarpatta':[18.5146,73.9279], 'Kharadi EON':[18.5513,73.9475],

  // Ajeenkya DY Patil University area (Lohegaon / Charholi side)
  'Ajeenkya DY Patil University':[18.6210,73.9118],
  'Charholi Budruk':[18.6236,73.9039], 'Pune Airport':[18.5821,73.9197],
  'Alandi Road':[18.5990,73.8830], 'Alandi':[18.6770,73.8970], 'Moshi':[18.6745,73.8479],

  // PCMC / Pimpri-Chinchwad
  'Pimpri':[18.6279,73.7997], 'Chinchwad':[18.6448,73.7799], 'Akurdi':[18.6485,73.7703],
  'Nigdi':[18.6489,73.7716], 'Bhosari':[18.6469,73.8480], 'Pimple Saudagar':[18.5963,73.7977],
  'Pimple Nilakh':[18.5892,73.7864], 'Pimple Gurav':[18.5993,73.8143], 'Sangvi':[18.5798,73.8130],
  'Dapodi':[18.5779,73.8372], 'Kasarwadi':[18.6099,73.8221], 'Thergaon':[18.6197,73.7767],
  'Ravet':[18.6481,73.7390], 'Tathawade':[18.6139,73.7568], 'Punawale':[18.6249,73.7441],
  'Talwade':[18.6942,73.8056], 'Chikhli':[18.6743,73.8073],

  // West
  'Balewadi':[18.5742,73.7799], 'Sus':[18.5434,73.7594], 'Mahalunge':[18.5688,73.7660],
  'Bavdhan':[18.5148,73.7790], 'Chandni Chowk':[18.5088,73.7898], 'Warje':[18.4850,73.8034],
  'Karve Nagar':[18.4888,73.8183], 'Hingne':[18.4801,73.8216], 'Sinhagad Road':[18.4752,73.8114],
  'Vadgaon Budruk':[18.4727,73.8268], 'Dhayari':[18.4504,73.8057], 'Nanded City':[18.4616,73.8100],
  'Erandwane':[18.5088,73.8286], 'Paud Road':[18.5093,73.8106], 'Kothrud Depot':[18.5059,73.8191],

  // Central Pune
  'Camp':[18.5122,73.8786], 'Sadashiv Peth':[18.5115,73.8523], 'Shaniwar Wada':[18.5195,73.8553],
  'Laxmi Road':[18.5123,73.8560], 'FC Road':[18.5236,73.8410], 'JM Road':[18.5206,73.8470],
  'Model Colony':[18.5352,73.8353], 'Bhandarkar Road':[18.5179,73.8302],
  'Senapati Bapat Road':[18.5362,73.8292], 'University of Pune':[18.5524,73.8247],
  'Khadki':[18.5646,73.8470], 'Bopodi':[18.5663,73.8236], 'Ghorpadi':[18.5266,73.9049],
  'Bund Garden':[18.5385,73.8803], 'Parvati':[18.4975,73.8445], 'Sahakar Nagar':[18.4893,73.8581],
  'Bibwewadi':[18.4731,73.8604], 'Market Yard':[18.4887,73.8663], 'Dhankawadi':[18.4574,73.8554],
  'Ambegaon':[18.4381,73.8429],

  // South / Southeast
  'Undri':[18.4607,73.9096], 'Pisoli':[18.4512,73.9193], 'NIBM Road':[18.4793,73.8965],
  'Wanowrie':[18.4962,73.8987], 'Fatima Nagar':[18.5059,73.8964], 'Salunke Vihar':[18.4730,73.8999],
  'Mohammadwadi':[18.4740,73.9100], 'Manjri':[18.5100,73.9700], 'Loni Kalbhor':[18.4940,74.0280],
  'Uruli Kanchan':[18.4777,74.1427], 'Kondhwa Budruk':[18.4570,73.8860], 'Katraj Dairy':[18.4501,73.8590],
  'Bhugaon':[18.5090,73.7480], 'Pirangut':[18.5160,73.6830],

  // Hinjewadi phases (Phase 1 = 'Hinjewadi')
  'Hinjewadi Phase 2':[18.5855,73.7220], 'Hinjewadi Phase 3':[18.5805,73.6900],
  'Maan':[18.5880,73.6980], 'Marunji':[18.6040,73.7060]
};

const EDGES = [
  // Original edges
  ['Hinjewadi','Wakad'],['Hinjewadi','Baner'],['Wakad','Baner'],['Wakad','Aundh'],['Baner','Aundh'],
  ['Baner','Pashan'],['Pashan','Kothrud'],['Pashan','Shivajinagar'],['Aundh','Shivajinagar'],['Aundh','Kothrud'],
  ['Kothrud','Deccan'],['Shivajinagar','Deccan'],['Shivajinagar','Pune Station'],['Deccan','Swargate'],
  ['Pune Station','Swargate'],['Pune Station','Koregaon Park'],['Pune Station','Viman Nagar'],
  ['Koregaon Park','Viman Nagar'],['Koregaon Park','Hadapsar'],['Koregaon Park','Kharadi'],
  ['Viman Nagar','Kharadi'],['Swargate','Katraj'],['Swargate','Kondhwa'],['Katraj','Kondhwa'],
  ['Kondhwa','Hadapsar'],['Swargate','Hadapsar'],['Hadapsar','Kharadi'],

  // Lohegaon / Ajeenkya DY Patil / Airport
  ['Viman Nagar','Pune Airport'],['Viman Nagar','Lohegaon'],['Pune Airport','Lohegaon'],
  ['Lohegaon','Dhanori'],['Lohegaon','Ajeenkya DY Patil University'],['Lohegaon','Wagholi'],
  ['Ajeenkya DY Patil University','Charholi Budruk'],['Ajeenkya DY Patil University','Pune Airport'],
  ['Charholi Budruk','Alandi'],['Charholi Budruk','Moshi'],
  ['Charholi Budruk','Dhanori'],['Pune Airport','Tingre Nagar'],['Tingre Nagar','Dhanori'],
  ['Tingre Nagar','Vishrantwadi'],['Tingre Nagar','Viman Nagar'],['Dhanori','Vishrantwadi'],
  ['Vishrantwadi','Alandi Road'],['Vishrantwadi','Yerwada'],['Alandi Road','Bhosari'],
  ['Alandi Road','Alandi'],['Alandi','Moshi'],['Wagholi','Kesnand'],['Wagholi','Kharadi'],

  // East / Northeast
  ['Yerwada','Pune Station'],['Yerwada','Kalyani Nagar'],['Yerwada','Viman Nagar'],['Yerwada','Bund Garden'],
  ['Kalyani Nagar','Koregaon Park'],['Kalyani Nagar','Viman Nagar'],['Kalyani Nagar','Wadgaon Sheri'],
  ['Wadgaon Sheri','Kharadi'],['Wadgaon Sheri','Viman Nagar'],['Kharadi','Kharadi EON'],
  ['Mundhwa','Koregaon Park'],['Mundhwa','Magarpatta'],['Mundhwa','Kharadi'],['Mundhwa','Hadapsar'],
  ['Mundhwa','Ghorpadi'],['Magarpatta','Hadapsar'],['Bund Garden','Koregaon Park'],
  ['Bund Garden','Pune Station'],['Ghorpadi','Koregaon Park'],['Ghorpadi','Hadapsar'],['Ghorpadi','Camp'],
  ['Hadapsar','Manjri'],['Manjri','Loni Kalbhor'],['Loni Kalbhor','Uruli Kanchan'],

  // Pimpri-Chinchwad (PCMC)
  ['Pimpri','Chinchwad'],['Pimpri','Pimple Saudagar'],['Pimpri','Kasarwadi'],['Pimpri','Sangvi'],
  ['Pimpri','Dapodi'],['Chinchwad','Akurdi'],['Chinchwad','Thergaon'],['Akurdi','Nigdi'],['Akurdi','Ravet'],
  ['Nigdi','Bhosari'],['Kasarwadi','Bhosari'],['Kasarwadi','Pimple Gurav'],['Bhosari','Moshi'],
  ['Moshi','Chikhli'],['Chikhli','Talwade'],['Sangvi','Aundh'],['Sangvi','Pimple Gurav'],['Sangvi','Dapodi'],
  ['Dapodi','Khadki'],['Dapodi','Bopodi'],['Pimple Gurav','Pimple Saudagar'],
  ['Pimple Saudagar','Wakad'],['Pimple Saudagar','Pimple Nilakh'],['Pimple Nilakh','Wakad'],
  ['Pimple Nilakh','Baner'],['Thergaon','Wakad'],['Thergaon','Tathawade'],['Tathawade','Wakad'],
  ['Tathawade','Punawale'],['Tathawade','Ravet'],['Punawale','Ravet'],['Punawale','Hinjewadi'],

  // West (Baner / Balewadi / Bavdhan / Hinjewadi side)
  ['Balewadi','Baner'],['Balewadi','Wakad'],['Balewadi','Hinjewadi'],['Balewadi','Mahalunge'],
  ['Mahalunge','Hinjewadi'],['Sus','Baner'],['Sus','Pashan'],['Bavdhan','Pashan'],
  ['Bavdhan','Chandni Chowk'],['Bavdhan','Bhugaon'],['Chandni Chowk','Kothrud'],
  ['Chandni Chowk','Bhugaon'],['Bhugaon','Pirangut'],

  // Hinjewadi phases
  ['Hinjewadi','Hinjewadi Phase 2'],['Hinjewadi Phase 2','Hinjewadi Phase 3'],
  ['Hinjewadi Phase 2','Maan'],['Hinjewadi Phase 2','Marunji'],['Maan','Hinjewadi Phase 3'],
  ['Maan','Marunji'],['Marunji','Hinjewadi'],

  // Southwest (Kothrud / Warje / Sinhagad Road)
  ['Kothrud','Kothrud Depot'],['Kothrud','Warje'],['Kothrud','Karve Nagar'],['Kothrud','Paud Road'],
  ['Kothrud','Erandwane'],['Kothrud Depot','Karve Nagar'],['Kothrud Depot','Erandwane'],
  ['Erandwane','Deccan'],['Erandwane','Paud Road'],['Erandwane','Bhandarkar Road'],
  ['Warje','Karve Nagar'],['Warje','Hingne'],['Warje','Dhayari'],['Karve Nagar','Hingne'],
  ['Hingne','Sinhagad Road'],['Sinhagad Road','Vadgaon Budruk'],['Sinhagad Road','Dhayari'],
  ['Sinhagad Road','Parvati'],['Vadgaon Budruk','Nanded City'],['Nanded City','Dhayari'],

  // Central Pune
  ['Deccan','FC Road'],['Deccan','JM Road'],['Deccan','Bhandarkar Road'],['Deccan','Shaniwar Wada'],
  ['FC Road','JM Road'],['FC Road','Shivajinagar'],['FC Road','Model Colony'],['JM Road','Shivajinagar'],
  ['Model Colony','Shivajinagar'],['Model Colony','Senapati Bapat Road'],
  ['Senapati Bapat Road','University of Pune'],['University of Pune','Aundh'],
  ['University of Pune','Bopodi'],['University of Pune','Shivajinagar'],['Bopodi','Aundh'],
  ['Bopodi','Khadki'],['Khadki','Shivajinagar'],['Shaniwar Wada','Shivajinagar'],
  ['Shaniwar Wada','Sadashiv Peth'],['Shaniwar Wada','Laxmi Road'],['Sadashiv Peth','Laxmi Road'],
  ['Sadashiv Peth','Swargate'],['Laxmi Road','Swargate'],['Laxmi Road','Camp'],
  ['Camp','Pune Station'],['Camp','Swargate'],['Camp','Wanowrie'],['Camp','Fatima Nagar'],

  // South Pune
  ['Parvati','Swargate'],['Parvati','Sahakar Nagar'],['Sahakar Nagar','Swargate'],
  ['Sahakar Nagar','Bibwewadi'],['Bibwewadi','Swargate'],['Bibwewadi','Market Yard'],
  ['Bibwewadi','Dhankawadi'],['Market Yard','Swargate'],['Market Yard','Kondhwa'],
  ['Dhankawadi','Katraj'],['Dhankawadi','Ambegaon'],['Ambegaon','Katraj'],['Katraj','Katraj Dairy'],
  ['Katraj','Kondhwa Budruk'],['Kondhwa Budruk','Kondhwa'],

  // Southeast
  ['Kondhwa','NIBM Road'],['Kondhwa','Undri'],['NIBM Road','Undri'],['NIBM Road','Wanowrie'],
  ['NIBM Road','Salunke Vihar'],['Salunke Vihar','Mohammadwadi'],['Salunke Vihar','Wanowrie'],
  ['Mohammadwadi','Undri'],['Mohammadwadi','Hadapsar'],['Undri','Pisoli'],['Pisoli','Mohammadwadi'],
  ['Wanowrie','Fatima Nagar'],['Wanowrie','Hadapsar'],['Fatima Nagar','Hadapsar']
];
module.exports = { AREAS, EDGES };
