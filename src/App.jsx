import { useState, useEffect, useMemo, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const PHASES = [
  { id:1, name:"BASE",          color:"#4ade80" },
  { id:2, name:"DÉVELOPPEMENT", color:"#60a5fa" },
  { id:3, name:"SPÉCIFIQUE",    color:"#f97316" },
  { id:4, name:"AFFÛTAGE",      color:"#e879f9" },
];
const DAY_LABELS = { MAR:"Mardi soir", VEN:"Vendredi soir", DIM:"Dimanche matin" };
const TYPE_STYLE = {
  easy:    { bg:"#0d1f14", border:"#4ade8033", dot:"#4ade80", tag:"FACILE",  tagBg:"#0d2a1a" },
  quality: { bg:"#1f140a", border:"#fb923c33", dot:"#fb923c", tag:"QUALITÉ", tagBg:"#2a1700" },
  long:    { bg:"#0a1420", border:"#60a5fa33", dot:"#60a5fa", tag:"LONGUE",  tagBg:"#0a1f35" },
  race:    { bg:"#1a0a2a", border:"#e879f955", dot:"#e879f9", tag:"COURSE",  tagBg:"#2a0a3a" },
};
const phaseColor = p => PHASES.find(ph=>ph.id===p)?.color ?? "#fff";

// ── CLIMAT SARAMON (32) — normales saisonnières région Gers/Auch ─────────────
const CLIMATE = {
  ete:         { label:"ÉTÉ CHAUD",     color:"#f87171", temp:"28-34°C",  icon:"🌡️" },
  find_ete:    { label:"FIN D'ÉTÉ",     color:"#fb923c", temp:"24-30°C",  icon:"☀️" },
  transition:  { label:"TRANSITION",    color:"#fbbf24", temp:"18-26°C",  icon:"🌤️" },
  automne:     { label:"AUTOMNE FRAIS", color:"#60a5fa", temp:"8-18°C",   icon:"🍂" },
};

const HYDRATION_TABLE = [
  { range:"< 10°C",  water:"400-500 ml/h", elec:"Eau pure suffit — recette maison optionnelle si sortie longue", note:"La soif est trompeuse par temps froid : bois quand même, même sans sensation de soif." },
  { range:"10-18°C", water:"500-600 ml/h", elec:"Recette maison standard dès 60 min d'effort",             note:"Conditions idéales. Hydrate-toi toutes les 20 min sur les sorties >1h." },
  { range:"18-24°C", water:"600-750 ml/h", elec:"Recette maison standard dès 45 min d'effort",             note:"Commence à t'hydrater dès le départ, ne pas attendre la soif." },
  { range:"24-30°C", water:"750-900 ml/h", elec:"Recette maison + variante orange (potassium)",            note:"Pré-hydrate 500ml dans les 2h avant le départ. Vêtements clairs et respirants." },
  { range:"> 30°C",  water:"900-1000 ml/h",elec:"Recette maison renforcée (+1/8 c.a.c. sel) — risque hyponatrémie si eau seule", note:"Privilégie les sorties tôt le matin ou tard le soir. Ombre si possible. Surveille les signes de coup de chaleur." },
];

// -- RECETTE MAISON -- modifiable ici, se repercute partout dans l'app
const RECIPE = {
  title: "Boisson d'effort maison",
  base: [
    { item:"Eau",                          qty:"750 ml" },
    { item:"Sel non raffine (Guerande/Himalaya)", qty:"1/4 c. a cafe" },
    { item:"Miel liquide",                 qty:"2 c. a soupe" },
    { item:"Jus de citron",                qty:"1/2 citron" },
  ],
  hotVariant: "Par forte chaleur (>25 degres) : ajoute le jus d'1/4 d'orange pressee pour plus de potassium.",
  veryHotVariant: "Par tres forte chaleur (>30 degres) : monte a 1/2 c. a cafe de sel pour 750 ml.",
  note: "Le sel non raffine apporte aussi magnesium et potassium en traces, contrairement au sel de table classique.",
};

// -- DEBIT HYDRIQUE PAR CLIMAT (ml/h) -- sert au calcul par seance
const HYDRATION_RATE = { ete:850, find_ete:750, transition:650, automne:500 };

function parsePaceToMin(pace) {
  if(!pace) return 6;
  const parts = pace.split(":").map(Number);
  return parts[0] + (parts[1]||0)/60;
}

function sessionDurationMin(session) {
  if(session.target.duration) return session.target.duration;
  if(session.target.distance) return session.target.distance * parsePaceToMin(session.target.pace);
  return 45;
}

function calcSessionHydration(session, climateKey) {
  const rate = HYDRATION_RATE[climateKey] || 600;
  const durationMin = sessionDurationMin(session);
  const raw = (durationMin/60) * rate;
  return Math.round(raw/50)*50;
}

function getHydrationTip(climate) {
  const tips = {
    ete:        "Sessions du soir en pleine chaleur (31°C déjà enregistré). Pré-hydrate-toi dès 16h, emporte de l'eau même sur les footings courts, privilégie l'ombre.",
    find_ete:   "Chaleur encore marquée en soirée. Continue le protocole été, surveille les vagues de chaleur tardives typiques du Gers fin août.",
    transition: "Météo plus clémente mais variable. Adapte ta tenue et ta gourde selon la météo du jour — vérifie la veille.",
    automne:    "Températures fraîches, parfait pour courir mais la soif se fait moins sentir : ne néglige pas l'hydratation sur les sorties longues.",
  };
  return tips[climate];
}

// ── RECORDS PERSONNELS (Garmin) — sert aux projections de course ────────────
const PERSONAL_RECORDS = [
  { label:"5 km",           timeSec: 22*60+59,        distKm:5,       date:"03/10/2024" },
  { label:"10 km",          timeSec: 49*60+3,         distKm:10,      date:"14/06/2024" },
  { label:"Semi-marathon",  timeSec: 1*3600+55*60+30, distKm:21.0975, date:"18/04/2024" },
];
const LONGEST_RUN_KM = 22.34;

function formatHMS(totalSec) {
  const s = Math.round(totalSec);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h>0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
}
function formatPaceSec(secPerKm) {
  const m = Math.floor(secPerKm/60), s = Math.round(secPerKm%60);
  return `${m}:${String(s).padStart(2,"0")}`;
}
// Formule de Riegel : prédit un temps sur une distance à partir d'un temps connu sur une autre
function riegelPredict(timeSec, fromKm, toKm) {
  return timeSec * Math.pow(toKm/fromKm, 1.06);
}

const MARATHON_DIST = 42.195;
const HALF_DIST = 21.0975;

// -- STRATÉGIE DE COURSE -- calcule les temps de passage selon une allure cible et une stratégie
function cumTimeAtKm(km, basePaceSec, strategy, offsetSec) {
  if(strategy!=="negative") return km*basePaceSec;
  if(km <= HALF_DIST) return km*(basePaceSec+offsetSec);
  return HALF_DIST*(basePaceSec+offsetSec) + (km-HALF_DIST)*(basePaceSec-offsetSec);
}
function computeSplits(totalTargetSec, strategy, offsetSec) {
  const basePaceSec = totalTargetSec / MARATHON_DIST;
  const markers = [5,10,15,20,HALF_DIST,25,30,35,40,MARATHON_DIST].filter((v,i,arr)=>arr.indexOf(v)===i).sort((a,b)=>a-b);
  let prevKm = 0, prevT = 0;
  return markers.map(km=>{
    const t = cumTimeAtKm(km, basePaceSec, strategy, offsetSec);
    const splitDist = km - prevKm;
    const splitTime = t - prevT;
    const paceHere = splitDist>0 ? splitTime/splitDist : basePaceSec;
    const gelCount = Math.floor(t/2700); // 1 gel toutes les ~45 min
    const sodium = km >= 25;
    const row = { km, cumTimeSec:t, splitTimeSec:splitTime, splitDist, paceSec:paceHere, gelCount, sodium, isHalf: Math.abs(km-HALF_DIST)<0.001 };
    prevKm = km; prevT = t;
    return row;
  });
}

// ── PLAN — 16 SEMAINES — DÉPART 14 JUILLET 2026 — COURSE 1er NOV. 2026 ───────
const PLAN = [
  { week:1,  date:"14 juil.",  phase:1, climate:"ete",        recovery:false, total:32, sessions:[
    { day:"MAR", label:"Footing",         detail:"45 min — ~7 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:45} },
    { day:"VEN", label:"Footing",         detail:"50 min — ~7,5 km",         pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:50} },
    { day:"DIM", label:"Sortie longue",   detail:"17 km",                    pace:"Zone 2 — 7:30/km max 148bpm",           type:"long",    target:{pace:"7:30",hrMax:148,distance:17} }]},
  { week:2,  date:"21 juil.",  phase:1, climate:"ete",        recovery:false, total:35, sessions:[
    { day:"MAR", label:"Tempo + Test FC max", detail:"65 min — 20 min à 5:55/km + test FC max", pace:"Échauff.15' + 20' tempo 5:55/km + 3×30'' accél. (récup 1') + 2-3' effort MAX + retour 12'", type:"quality", target:{pace:"5:55",hrMax:192,duration:65}, note:"🎯 Test FC max en fin de séance : après le tempo, enchaîne 3×30'' d'accélérations progressives (récup 1' trot), puis un effort maximal de 2-3 min à fond, aux sensations (ne regarde pas la montre pendant l'effort). Regarde la FC atteinte après coup sur Garmin." },
    { day:"VEN", label:"Footing",         detail:"50 min — ~7,5 km",         pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:50} },
    { day:"DIM", label:"Sortie longue",   detail:"19 km",                    pace:"Zone 2 — 7:20/km max 148bpm",           type:"long",    target:{pace:"7:20",hrMax:148,distance:19} }]},
  { week:3,  date:"28 juil.",  phase:2, climate:"ete",        recovery:false, total:39, sessions:[
    { day:"MAR", label:"Fractionné",      detail:"3×8 min à 5:45/km",        pace:"Échauff.15' + 3×8' récup 90'' + retour 10'", type:"quality", target:{pace:"5:45",hrMax:170,duration:55} },
    { day:"VEN", label:"Footing",         detail:"55 min — ~8,5 km",         pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:55} },
    { day:"DIM", label:"Sortie longue",   detail:"21 km",                    pace:"Zone 2 — 7:15/km max 148bpm",           type:"long",    target:{pace:"7:15",hrMax:148,distance:21} }]},
  { week:4,  date:"4 août",    phase:2, climate:"ete",        recovery:false, total:42, sessions:[
    { day:"MAR", label:"Fractionné",      detail:"4×8 min à 5:45/km",        pace:"Échauff.15' + 4×8' récup 90'' + retour 10'", type:"quality", target:{pace:"5:45",hrMax:170,duration:60} },
    { day:"VEN", label:"Footing",         detail:"55 min — ~8,5 km",         pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:55} },
    { day:"DIM", label:"Sortie longue",   detail:"23 km",                    pace:"Zone 2 — 7:15/km max 148bpm",           type:"long",    target:{pace:"7:15",hrMax:148,distance:23} }]},
  { week:5,  date:"11 août",   phase:2, climate:"ete",        recovery:false, total:45, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"70 min — 6 km à 6:31/km",  pace:"Échauff.15' + 6 km AM + retour 10'",    type:"quality", target:{pace:"6:31",hrMax:162,duration:70,mpKm:6} },
    { day:"VEN", label:"Footing",         detail:"60 min — ~9 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:60} },
    { day:"DIM", label:"Sortie longue",   detail:"25 km (8 km AM)",          pace:"17 km Z2 → 8 km à 6:31/km",            type:"long",    target:{pace:"6:31",hrMax:162,distance:25,mpKm:8} }]},
  { week:6,  date:"18 août",   phase:2, climate:"ete",        recovery:true,  total:36, sessions:[
    { day:"MAR", label:"Footing léger",   detail:"45 min — ~7 km",           pace:"Très facile 8:05/km",                   type:"easy",    target:{pace:"8:05",hrMax:135,duration:45} },
    { day:"VEN", label:"Footing",         detail:"55 min — ~8,5 km",         pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:55} },
    { day:"DIM", label:"Sortie longue",   detail:"20 km",                    pace:"Zone 2 — 7:20/km max 148bpm",           type:"long",    target:{pace:"7:20",hrMax:148,distance:20} }]},
  { week:7,  date:"25 août",   phase:2, climate:"find_ete",   recovery:false, total:48, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"80 min — 9 km à 6:31/km",  pace:"Échauff.15' + 9 km AM + retour 10'",    type:"quality", target:{pace:"6:31",hrMax:162,duration:80,mpKm:9} },
    { day:"VEN", label:"Footing",         detail:"60 min — ~9 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:60} },
    { day:"DIM", label:"Sortie longue",   detail:"27 km (10 km AM)",         pace:"17 km Z2 → 10 km à 6:31/km",           type:"long",    target:{pace:"6:31",hrMax:162,distance:27,mpKm:10} }]},
  { week:8,  date:"1 sept.",   phase:2, climate:"find_ete",   recovery:false, total:50, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"85 min — 10 km à 6:31/km", pace:"Échauff.15' + 10 km AM + retour 10'",   type:"quality", target:{pace:"6:31",hrMax:162,duration:85,mpKm:10} },
    { day:"VEN", label:"Footing",         detail:"60 min — ~9 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:60} },
    { day:"DIM", label:"Sortie longue",   detail:"28 km (10 km AM)",         pace:"18 km Z2 → 10 km à 6:31/km",           type:"long",    target:{pace:"6:31",hrMax:162,distance:28,mpKm:10} }]},
  { week:9,  date:"8 sept.",   phase:3, climate:"find_ete",   recovery:false, total:52, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"85 min — 11 km à 6:31/km", pace:"Échauff.15' + 11 km AM + retour 10'",   type:"quality", target:{pace:"6:31",hrMax:162,duration:85,mpKm:11} },
    { day:"VEN", label:"Footing",         detail:"60 min — ~9 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:60} },
    { day:"DIM", label:"Sortie longue",   detail:"29 km (12 km AM)",         pace:"17 km Z2 → 12 km à 6:31/km",           type:"long",    target:{pace:"6:31",hrMax:162,distance:29,mpKm:12} }]},
  { week:10, date:"15 sept.",  phase:3, climate:"transition", recovery:false, total:54, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"90 min — 12 km à 6:31/km", pace:"Échauff.10' + 12 km AM + retour 10'",   type:"quality", target:{pace:"6:31",hrMax:162,duration:90,mpKm:12} },
    { day:"VEN", label:"Footing",         detail:"60 min — ~9 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:60} },
    { day:"DIM", label:"Sortie longue",   detail:"30 km (12 km AM)",         pace:"18 km Z2 → 12 km à 6:31/km",           type:"long",    target:{pace:"6:31",hrMax:162,distance:30,mpKm:12} }]},
  { week:11, date:"22 sept.",  phase:3, climate:"transition", recovery:true,  total:42, sessions:[
    { day:"MAR", label:"Footing léger",   detail:"45 min — ~7 km",           pace:"Très facile 8:05/km",                   type:"easy",    target:{pace:"8:05",hrMax:135,duration:45} },
    { day:"VEN", label:"Footing",         detail:"60 min — ~9 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:60} },
    { day:"DIM", label:"Sortie longue",   detail:"23 km",                    pace:"Zone 2 — 7:15/km max 148bpm",           type:"long",    target:{pace:"7:15",hrMax:148,distance:23} }]},
  { week:12, date:"29 sept.",  phase:3, climate:"transition", recovery:false, total:58, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"90 min — 13 km à 6:31/km", pace:"Échauff.10' + 13 km AM + retour 10'",   type:"quality", target:{pace:"6:31",hrMax:162,duration:90,mpKm:13} },
    { day:"VEN", label:"Footing",         detail:"60 min — ~9 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:60} },
    { day:"DIM", label:"Sortie longue ⭐",detail:"33 km (14 km AM)",         pace:"19 km Z2 → 14 km à 6:31/km",           type:"long",    target:{pace:"6:31",hrMax:162,distance:33,mpKm:14} }]},
  { week:13, date:"6 oct.",    phase:3, climate:"automne",    recovery:false, total:50, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"80 min — 10 km à 6:31/km", pace:"Échauff.15' + 10 km AM + retour 10'",   type:"quality", target:{pace:"6:31",hrMax:162,duration:80,mpKm:10} },
    { day:"VEN", label:"Footing",         detail:"55 min — ~8,5 km",         pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:55} },
    { day:"DIM", label:"Sortie longue",   detail:"28 km (8 km AM)",          pace:"20 km Z2 → 8 km à 6:31/km",            type:"long",    target:{pace:"6:31",hrMax:162,distance:28,mpKm:8} }]},
  { week:14, date:"13 oct.",   phase:4, climate:"automne",    recovery:false, total:40, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"65 min — 6 km à 6:31/km",  pace:"Échauff.15' + 6 km AM + retour 10'",    type:"quality", target:{pace:"6:31",hrMax:160,duration:65,mpKm:6} },
    { day:"VEN", label:"Footing",         detail:"50 min — ~8 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:50} },
    { day:"DIM", label:"Sortie longue",   detail:"22 km",                    pace:"Zone 2 — 7:10/km",                      type:"long",    target:{pace:"7:10",hrMax:148,distance:22} }]},
  { week:15, date:"20 oct.",   phase:4, climate:"automne",    recovery:false, total:32, sessions:[
    { day:"MAR", label:"Allure marathon", detail:"55 min — 4 km à 6:31/km",  pace:"Échauff.15' + 4 km AM + retour 10'",    type:"quality", target:{pace:"6:31",hrMax:158,duration:55,mpKm:4} },
    { day:"VEN", label:"Footing",         detail:"45 min — ~7 km",           pace:"Allure facile 7:45/km",                 type:"easy",    target:{pace:"7:45",hrMax:145,duration:45} },
    { day:"DIM", label:"Sortie longue",   detail:"16 km",                    pace:"Zone 2 — 7:10/km",                      type:"long",    target:{pace:"7:10",hrMax:148,distance:16} }]},
  { week:16, date:"27 oct.",   phase:4, climate:"automne",    recovery:false, total:20, raceWeek:true, sessions:[
    { day:"MAR", label:"Footing léger",   detail:"35 min — ~5 km",           pace:"Très facile, jambes légères",           type:"easy",    target:{pace:"8:05",hrMax:130,duration:35} },
    { day:"VEN", label:"Activation",      detail:"25 min + 3×1 km à 6:31",   pace:"Échauff.10' + 3×1 km AM + retour 5'",   type:"quality", target:{pace:"6:31",hrMax:155,duration:25} },
    { day:"DIM", label:"🏁 MARATHON",     detail:"42,195 km — Objectif 4:35:00", pace:"6:31/km — le grand jour !",         type:"race",    target:{pace:"6:31",hrMax:165,distance:42.195} }]},
];

const totalSessions = PLAN.reduce((a,w)=>a+w.sessions.length,0);

// -- BILANS RÉCUPÉRÉS DE LA V11 -- injectés au premier chargement si absents du store
const SEED_ANALYSES = {
  "1-0": {
    label: "Footing",
    date: "14/07/2026",
    stats: { pace:"6:12", hrMoy:"177", hrMax:"190", distance:"7.23", duration:"45.04", cadence:"153", temp:"23", hydration:"650ml eau", feeling:"4" },
    analysis: `✅ POINTS POSITIFS
Distance et durée respectées. Cadence à 153 ppm correcte pour un footing, tu peux viser 160+ à terme. Tu as reconnu l'erreur en course — c'est déjà de la lucidité tactique.

---

⚠️ POINTS D'ATTENTION
Départ trop rapide : 6:12/km au lieu de 6:45, soit 33 sec/km de trop. À 23°C, ça fait exploser la FC immédiatement. 177 bpm en moyenne pour un footing censé rester aérobie bas, c'est une séance de tempo subie, pas récupératrice. Ressenti à 4/10 confirme que tu as puisé dans des réserves que tu n'aurais pas dû toucher.

---

💧 HYDRATATION
650 ml sur 45 min à 23°C et à haute intensité cardiaque, c'est dans la fourchette basse. Acceptable si tu étais bien hydraté avant, mais avec une FC aussi élevée et un ressenti difficile, viser 750–900 ml aurait été plus prudent. Pour les prochaines séances chaudes : boire 500 ml dans les 2h avant le départ, et ne pas attendre la soif en course.

---

📊 SYNTHÈSE
Allure : 6:12/km vs 6:45/km cible (écart de 33 sec/km, trop rapide)
FC moyenne : 177 bpm vs 145 bpm cible (écart de +32 bpm — zone rouge)
FC max : 190 bpm — effort quasi-maximal atteint
Distance : 7,23 km vs ~7 km (légèrement au-dessus, OK)
Durée : 45:04 — parfait

---

🎯 CONSEIL POUR LA PROCHAINE SÉANCE
Bride-toi sur les 10 premières minutes. Lance avec une alarme FC à 140 bpm sur ta Garmin — si elle sonne, ralentis, point. À 23°C+ le corps chauffe plus vite, la FC monte plus tôt : partir à 6:45 réel dès le km 1 n'est pas une option, c'est la discipline de base du footing. Objectif prochain run : terminer avec un ressenti 6-7/10 et une FC moyenne sous 150.`
  },
  "1-1": {
    label: "Footing",
    date: "17/07/2026",
    stats: { pace:"6:40", hrMoy:"172", hrMax:"187", distance:"7.52", duration:"50", cadence:"151", temp:"30", hydration:"750ml eau", feeling:"4" },
    analysis: `✅ POINTS POSITIFS
Distance et durée parfaitement respectées (7,52 km / 50 min). Allure très proche de la cible. Cadence à 151 ppm correcte pour un footing. Bon effort de se tenir à la séance malgré la chaleur.

---

⚠️ POINTS D'ATTENTION
La FC est le vrai problème : 172 bpm en moyenne pour une séance censée rester à 145 max, c'est une zone cardio d'effort intense, pas un footing récupération. À 30°C, le cœur monte naturellement de 10 à 15 bpm — mais là l'écart est de +27 bpm. La lourdeur des jambes à 30 min en est la conséquence directe, pas la cause. Le ressenti à 4/10 confirme que le corps a souffert.

---

💧 HYDRATATION
750 ml pour 50 min à 30°C, c'est insuffisant. Par forte chaleur, les pertes sudorales atteignent 800 ml à 1,2 L par heure à l'effort. Il aurait fallu viser 1 L minimum, idéalement avec un électrolyte léger (sodium) pour compenser les pertes en sel. Prévoir une gourde plus grande ou un point d'eau sur le parcours.

---

📊 SYNTHÈSE
Allure : 6:40/km vs 6:45/km cible (écart de 5 s/km — acceptable)
FC moyenne : 172 bpm vs 145 bpm cible (écart de +27 bpm — critique)
FC max : 187 bpm — franchement élevé pour un footing
Distance / Durée : conformes ✅

---

🎯 CONSEIL POUR LA PROCHAINE SÉANCE
Par chaleur ≥ 28°C, ralentis d'emblée à 7:10–7:20/km pour rester sous 145 bpm — l'allure ne compte plus, la FC est la seule boussole. Si le cœur dépasse 148 bpm, marche 60 secondes sans négocier. La prochaine séance identique doit se faire tôt le matin (avant 8h) ou en soirée, sinon elle ne remplit pas son rôle de footing récupération.`
  },
};
const SEED_DONE = { "1-0": true, "1-1": true };
const KEY_DONE       = "marathon-done-v10";
const KEY_ANALYSIS   = "marathon-analysis-v10";
const KEY_OVERRIDES  = "marathon-overrides-v1";
const KEY_SEEN_VER   = "marathon-seen-version";
const APP_VERSION    = "v21";
const CHANGELOG = [
  { v:"v21", items:[
    "🩹 Correctif d'affichage mobile : le haut des fenêtres (saisie de stats, modification de séance) était inaccessible quand le contenu dépassait la hauteur de l'écran",
  ]},
  { v:"v20", items:[
    "🎯 Objectif ajusté à 4:35:00 (6:31/km) — toutes les allures du plan recalculées",
    "🚀 Nouvelle architecture : l'app se met à jour toute seule, plus besoin de réinstaller ni de vider le cache",
    "🔗 Strava passe par l'API officielle (plus fiable) avec reconnexion automatique",
  ]},
  { v:"v19", items:[
    "🩹 Diagnostic Strava amélioré : le bouton affiche maintenant la vraie raison de l'échec au lieu d'un message générique, pour comprendre enfin pourquoi ça ne marchait pas",
    "🩹 Augmentation de la limite de réponse (max_tokens) pour la requête Strava — la réponse était probablement tronquée avant",
    "🗑️ Retrait du bouton « Forcer le rafraîchissement » — il cassait la page au lieu de la réparer",
  ]},
  { v:"v18", items:[
    "🎯 Objectif ralenti à 4:45:00 (6:45/km) — toutes les allures du plan ont été recalculées en conséquence (footings, fractionnés, sorties longues, allure marathon)",
  ]},
  { v:"v17", items:[
    "💾 Export/Import simplifié : un fichier à télécharger et à sélectionner en un tap, au lieu de copier-coller du texte (le copier-coller reste disponible en secours)",
  ]},
  { v:"v16", items:[
    "🔗 Bouton « Récupérer ma dernière sortie Strava » dans la saisie de stats — remplit automatiquement allure, FC, distance, durée, cadence via ton compte Strava connecté",
  ]},
  { v:"v15", items:[
    "🔔 Bannière automatique quand une nouvelle version est ouverte, avec le détail de ce qui a changé",
    "🔄 Bouton pour forcer le rafraîchissement si Chrome/MIUI affiche une version périmée",
    "🩹 Correctif : les séances modifiées sont maintenant incluses dans l'Export/Import (elles ne l'étaient pas avant)",
  ]},
  { v:"v14", items:[
    "✏️ Modification des séances directement dans l'app (allure, distance, FC, notes…) sans attendre une nouvelle version",
    "🗓️ Modification rapide des infos de semaine (climat, km total, récup)",
    "🏁 Nouvel onglet Course : stratégie de pacing jour J, temps de passage, projection à partir de tes records",
    "📈 Nouvel onglet Progrès : graphiques d'évolution allure / FC / ressenti au fil des séances",
  ]},
];
function versionNum(v) { return parseInt(String(v||"").replace(/[^0-9]/g,""),10) || 0; }

// Stockage local du navigateur — persiste sur l'appareil et survit aux mises à jour de l'app
async function loadStore(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : {}; }catch{ return {}; } }
async function saveStore(k,d){ try{ localStorage.setItem(k, JSON.stringify(d)); }catch{} }

// Adresse du petit service qui garde les clés secrètes (défini au build, voir README)
const API_BASE = import.meta.env.VITE_API_BASE || "";

// -- OVERRIDES -- permet de modifier une séance ou une semaine sans toucher au code / republier
function getEffectiveSession(weekNum, idx, base, overrides) {
  const o = overrides?.sessions?.[`${weekNum}-${idx}`];
  if(!o) return base;
  return { ...base, ...o, target: { ...base.target, ...(o.target||{}) } };
}
function getEffectiveWeek(base, overrides) {
  const o = overrides?.weeks?.[base.week];
  if(!o) return base;
  return { ...base, ...o };
}

async function analyzeStats(stats, session) {
  const t = session.target;
  const prompt = `Tu es coach de course à pied expert. Voici les stats Garmin d'une séance.

SÉANCE PRÉVUE : ${session.label} — ${session.detail}
CIBLES :
- Allure cible : ${t.pace}/km
- FC max cible : ${t.hrMax} bpm
${t.distance ? `- Distance prévue : ${t.distance} km` : `- Durée prévue : ${t.duration} min`}
${t.mpKm ? `- Bloc allure marathon : ${t.mpKm} km` : ""}

STATS RÉELLES GARMIN :
- Allure moyenne : ${stats.pace || "—"} /km
- FC moyenne : ${stats.hrMoy || "—"} bpm
- FC maximale : ${stats.hrMax || "—"} bpm
- Distance : ${stats.distance || "—"} km
- Durée : ${stats.duration || "—"} min
- Cadence moyenne : ${stats.cadence || "—"} ppm
- Température ressentie : ${stats.temp || "—"} °C
- Hydratation prise : ${stats.hydration || "—"}
- Ressenti (1-10) : ${stats.feeling || "—"}
${stats.notes ? `- Notes : ${stats.notes}` : ""}

Réponds en 5 blocs courts :
✅ POINTS POSITIFS
⚠️ POINTS D'ATTENTION
💧 HYDRATATION (était-elle adaptée à la météo/effort ? sinon quoi corriger)
📊 SYNTHÈSE — commence OBLIGATOIREMENT par une ligne "Allure : [réelle] vs [cible]/km (écart de Xs)", puis les autres écarts (FC, distance/durée)
🎯 CONSEIL POUR LA PROCHAINE SÉANCE

Sois direct, coach, concis.`;

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Réponse illisible du service (code ${res.status}).`); }

  if (!res.ok) throw new Error(data?.error || `Erreur du service (${res.status}).`);
  return data.text || "Analyse indisponible.";
}

// -- STRAVA -- appelle directement l'API officielle Strava via notre service
// (plus fiable que de passer par une IA : les données arrivent déjà structurées)
async function fetchLatestStravaRun() {
  const res = await fetch(`${API_BASE}/api/strava/latest-run`, { credentials: "include" });

  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Réponse illisible du service (code ${res.status}).`); }

  if (res.status === 401) {
    const err = new Error("Strava non connecté.");
    err.needsAuth = true;
    throw err;
  }
  if (!res.ok) throw new Error(data?.error || `Erreur du service (${res.status}).`);
  if (!data.activity) throw new Error("Aucune course trouvée dans tes activités Strava récentes.");

  return data.activity;
}

// Statut de connexion Strava (pour afficher le bon bouton)
async function checkStravaStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/strava/status`, { credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.connected;
  } catch { return false; }
}

function startStravaAuth() {
  window.location.href = `${API_BASE}/api/strava/auth`;
}

function Field({ label, value, onChange, placeholder, unit, keyboardType }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,color:"#64748b",marginBottom:5,fontWeight:600}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",background:"#1e293b",borderRadius:10,border:"1px solid #334155",overflow:"hidden"}}>
        <input type={keyboardType||"text"} inputMode={keyboardType==="number"?"decimal":"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{flex:1,padding:"13px 14px",background:"transparent",border:"none",color:"#f1f5f9",fontSize:15,outline:"none",minWidth:0}} />
        {unit && <span style={{paddingRight:14,color:"#475569",fontSize:13,flexShrink:0}}>{unit}</span>}
      </div>
    </div>
  );
}

function EditSessionModal({ session, sessionKey, hasOverride, onClose, onSave, onReset }) {
  const t = session.target || {};
  const [form, setForm] = useState({
    type: session.type,
    label: session.label || "",
    detail: session.detail || "",
    pace: session.pace || "",
    note: session.note || "",
    tPace: t.pace || "",
    tHrMax: t.hrMax!=null ? String(t.hrMax) : "",
    tDuration: t.duration!=null ? String(t.duration) : "",
    tDistance: t.distance!=null ? String(t.distance) : "",
    tMpKm: t.mpKm!=null ? String(t.mpKm) : "",
  });
  const set = (k,v) => setForm(prev=>({...prev,[k]:v}));
  const dot = TYPE_STYLE[form.type].dot;

  const save = () => {
    const override = {
      type: form.type,
      label: form.label,
      detail: form.detail,
      pace: form.pace,
      note: form.note || undefined,
      target: {
        pace: form.tPace || undefined,
        hrMax: form.tHrMax!=="" ? Number(form.tHrMax) : undefined,
        duration: form.tDuration!=="" ? Number(form.tDuration) : undefined,
        distance: form.tDistance!=="" ? Number(form.tDistance) : undefined,
        mpKm: form.tMpKm!=="" ? Number(form.tMpKm) : undefined,
      }
    };
    onSave(sessionKey, override);
    onClose();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:350,display:"flex",alignItems:"flex-end",justifyContent:"center",overflowY:"hidden"}}>
      <div style={{background:"#0f172a",borderRadius:"20px 20px 0 0",border:`1px solid ${dot}44`,width:"100%",maxWidth:520,padding:"20px 18px 40px",paddingBottom:"calc(40px + env(safe-area-inset-bottom, 0px))",maxHeight:"90vh",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{width:40,height:4,background:"#334155",borderRadius:2,margin:"0 auto 20px"}} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:700,color:"#f1f5f9"}}>✏️ Modifier la séance</div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",borderRadius:10,color:"#64748b",width:36,height:36,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
        </div>

        <div style={{fontSize:12,color:"#64748b",marginBottom:8,fontWeight:600}}>Type de séance</div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {Object.entries(TYPE_STYLE).map(([key,ts])=>(
            <button key={key} onClick={()=>set("type",key)} style={{flex:1,padding:"10px 0",borderRadius:10,background:form.type===key?ts.dot+"33":"#1e293b",border:`1.5px solid ${form.type===key?ts.dot:"#334155"}`,color:form.type===key?ts.dot:"#475569",fontSize:11,fontWeight:700,cursor:"pointer"}}>{ts.tag}</button>
          ))}
        </div>

        <Field label="Titre" value={form.label} onChange={v=>set("label",v)} placeholder="ex: Sortie longue" />
        <Field label="Détail (affiché sous le titre)" value={form.detail} onChange={v=>set("detail",v)} placeholder="ex: 25 km (8 km AM)" />
        <Field label="Description de l'allure / consigne" value={form.pace} onChange={v=>set("pace",v)} placeholder="ex: Zone 2 — 6:30/km max 148bpm" />

        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}><Field label="Allure cible" value={form.tPace} onChange={v=>set("tPace",v)} placeholder="ex: 5:41" unit="/km" /></div>
          <div style={{flex:1}}><Field label="FC max cible" value={form.tHrMax} onChange={v=>set("tHrMax",v)} placeholder="ex: 162" unit="bpm" keyboardType="number" /></div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}><Field label="Durée" value={form.tDuration} onChange={v=>set("tDuration",v)} placeholder="ex: 70" unit="min" keyboardType="number" /></div>
          <div style={{flex:1}}><Field label="Distance" value={form.tDistance} onChange={v=>set("tDistance",v)} placeholder="ex: 25" unit="km" keyboardType="number" /></div>
        </div>
        <Field label="Bloc allure marathon (optionnel)" value={form.tMpKm} onChange={v=>set("tMpKm",v)} placeholder="ex: 8" unit="km" keyboardType="number" />
        <Field label="Note visible sur la séance (optionnel)" value={form.note} onChange={v=>set("note",v)} placeholder="ex: précisions, consignes spécifiques…" />

        <div style={{fontSize:11,color:"#334155",marginBottom:16,lineHeight:1.6}}>💡 Ces modifications sont enregistrées sur cet appareil et s'appliquent immédiatement, sans nouvelle version de l'app.</div>

        <button onClick={save} style={{width:"100%",padding:"16px",borderRadius:14,background:`linear-gradient(135deg,${dot}bb,${dot})`,border:"none",color:"#080810",fontSize:16,fontWeight:700,cursor:"pointer",marginBottom:hasOverride?8:0}}>
          💾 Enregistrer les modifications
        </button>
        {hasOverride && (
          <button onClick={()=>{ onReset(sessionKey); onClose(); }} style={{width:"100%",padding:"12px",borderRadius:12,background:"#1e293b",border:"1px solid #33415588",color:"#f87171",fontSize:13,cursor:"pointer"}}>
            ↩️ Revenir à la séance d'origine du plan
          </button>
        )}
      </div>
    </div>
  );
}

function EditWeekModal({ week, hasOverride, onClose, onSave, onReset }) {
  const [form, setForm] = useState({
    date: week.date || "",
    total: week.total!=null ? String(week.total) : "",
    climate: week.climate,
    recovery: !!week.recovery,
  });
  const set = (k,v) => setForm(prev=>({...prev,[k]:v}));
  const pc = phaseColor(week.phase);

  const save = () => {
    onSave(week.week, {
      date: form.date,
      total: form.total!=="" ? Number(form.total) : undefined,
      climate: form.climate,
      recovery: form.recovery,
    });
    onClose();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:350,display:"flex",alignItems:"flex-end",justifyContent:"center",overflowY:"hidden"}}>
      <div style={{background:"#0f172a",borderRadius:"20px 20px 0 0",border:`1px solid ${pc}44`,width:"100%",maxWidth:520,padding:"20px 18px 40px",paddingBottom:"calc(40px + env(safe-area-inset-bottom, 0px))",maxHeight:"90vh",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{width:40,height:4,background:"#334155",borderRadius:2,margin:"0 auto 20px"}} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:700,color:"#f1f5f9"}}>✏️ Modifier la semaine {week.week}</div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",borderRadius:10,color:"#64748b",width:36,height:36,cursor:"pointer",fontSize:16,flexShrink:0}}>✕</button>
        </div>

        <Field label="Date affichée" value={form.date} onChange={v=>set("date",v)} placeholder="ex: 14 juil." />
        <Field label="Total km (affichage)" value={form.total} onChange={v=>set("total",v)} placeholder="ex: 32" unit="km" keyboardType="number" />

        <div style={{fontSize:12,color:"#64748b",marginBottom:8,fontWeight:600}}>Climat de la semaine</div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {Object.entries(CLIMATE).map(([key,c])=>(
            <button key={key} onClick={()=>set("climate",key)} style={{flex:"1 1 45%",padding:"10px 6px",borderRadius:10,background:form.climate===key?c.color+"22":"#1e293b",border:`1.5px solid ${form.climate===key?c.color:"#334155"}`,color:form.climate===key?c.color:"#475569",fontSize:11,fontWeight:700,cursor:"pointer"}}>{c.icon} {c.label}</button>
          ))}
        </div>

        <button onClick={()=>set("recovery",!form.recovery)} style={{width:"100%",padding:"12px 16px",borderRadius:12,background:form.recovery?"#2a120022":"#1e293b",border:`1.5px solid ${form.recovery?"#fb923c":"#334155"}`,color:form.recovery?"#fb923c":"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:20,textAlign:"left"}}>
          {form.recovery ? "✓ " : ""}Semaine de récupération
        </button>

        <button onClick={save} style={{width:"100%",padding:"16px",borderRadius:14,background:`linear-gradient(135deg,${pc}bb,${pc})`,border:"none",color:"#080810",fontSize:16,fontWeight:700,cursor:"pointer",marginBottom:hasOverride?8:0}}>
          💾 Enregistrer les modifications
        </button>
        {hasOverride && (
          <button onClick={()=>{ onReset(week.week); onClose(); }} style={{width:"100%",padding:"12px",borderRadius:12,background:"#1e293b",border:"1px solid #33415588",color:"#f87171",fontSize:13,cursor:"pointer"}}>
            ↩️ Revenir aux réglages d'origine du plan
          </button>
        )}
      </div>
    </div>
  );
}

function StatsModal({ session, sessionKey, onClose, onSaved }) {
  const [stats, setStats] = useState({ pace:"", hrMoy:"", hrMax:"", distance:"", duration:"", cadence:"", temp:"", hydration:"", feeling:"", notes:"" });
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaError,   setStravaError]   = useState(null);
  const [stravaInfo,    setStravaInfo]    = useState(null); // {name, date} de la dernière activité récupérée
  const [stravaNeedsAuth, setStravaNeedsAuth] = useState(false);
  const set = (k,v) => setStats(prev=>({...prev,[k]:v}));
  const dot = TYPE_STYLE[session.type].dot;
  const canAnalyze = stats.pace || stats.hrMoy || stats.distance || stats.duration;

  const fetchStrava = async () => {
    setStravaLoading(true); setStravaError(null); setStravaNeedsAuth(false);
    try {
      const activity = await fetchLatestStravaRun();
      setStats(prev => ({
        ...prev,
        pace:     activity.pace     || prev.pace,
        hrMoy:    activity.hrMoy    || prev.hrMoy,
        hrMax:    activity.hrMax    || prev.hrMax,
        distance: activity.distance || prev.distance,
        duration: activity.duration || prev.duration,
        cadence:  activity.cadence  || prev.cadence,
        temp:     activity.temp     || prev.temp,
      }));
      setStravaInfo({ name: activity.name, date: activity.date });
    } catch (err) {
      if (err?.needsAuth) {
        setStravaNeedsAuth(true);
      } else {
        setStravaError(`Échec : ${err?.message || "erreur inconnue"} — tu peux saisir tes stats manuellement en attendant.`);
      }
    }
    setStravaLoading(false);
  };

  const analyze = async () => {
    setLoading(true); setError(null);
    try { setResult(await analyzeStats(stats, session)); }
    catch { setError("Erreur réseau. Réessaie."); }
    setLoading(false);
  };
  const save = async () => {
    const entry = { analysis:result, stats, date:new Date().toLocaleDateString("fr-FR"), label:session.label };
    const all = await loadStore(KEY_ANALYSIS);
    all[sessionKey] = entry;
    await saveStore(KEY_ANALYSIS, all);
    onSaved(sessionKey, entry);
    onClose();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",overflowY:"hidden"}}>
      <div style={{background:"#0f172a",borderRadius:"20px 20px 0 0",border:`1px solid ${dot}44`,width:"100%",maxWidth:520,padding:"20px 18px 40px",paddingBottom:"calc(40px + env(safe-area-inset-bottom, 0px))",maxHeight:"90vh",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{width:40,height:4,background:"#334155",borderRadius:2,margin:"0 auto 20px"}} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:700,color:"#f1f5f9"}}>{session.label}</div>
            <div style={{fontSize:13,color:"#64748b",marginTop:2}}>{session.detail}</div>
          </div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",borderRadius:10,color:"#64748b",width:36,height:36,cursor:"pointer",fontSize:16,marginLeft:12,flexShrink:0}}>✕</button>
        </div>
        <div style={{padding:"10px 14px",background:"#1e293b",borderRadius:12,marginBottom:20,borderLeft:`3px solid ${dot}`}}>
          <div style={{fontSize:11,letterSpacing:2,color:dot,marginBottom:4}}>CIBLES DU PLAN</div>
          <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.8}}>{session.pace}</div>
        </div>
        {!result ? (
          <>
            <div style={{fontSize:12,color:"#475569",marginBottom:16,lineHeight:1.6}}>Saisis les stats depuis l'écran Garmin — au moins 1 champ suffit.</div>

            {/* Récupération automatique via Strava */}
            <button onClick={fetchStrava} disabled={stravaLoading} style={{width:"100%",padding:"13px",borderRadius:12,background:stravaLoading?"#1e293b":"#fc4c0222",border:`1.5px solid ${stravaLoading?"#334155":"#fc4c0266"}`,color:stravaLoading?"#475569":"#fc4c02",fontSize:13,fontWeight:700,cursor:stravaLoading?"not-allowed":"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {stravaLoading ? "⏳ Récupération en cours…" : "🔗 Récupérer ma dernière sortie Strava"}
            </button>
            {stravaInfo && (
              <div style={{marginBottom:14,padding:"10px 12px",background:"#0d2218",border:"1px solid #4ade8044",borderRadius:10,fontSize:12,color:"#4ade80",lineHeight:1.6}}>✅ Récupéré : {stravaInfo.name}{stravaInfo.date?` · ${stravaInfo.date}`:""} — vérifie les champs ci-dessous avant d'analyser.</div>
            )}
            {stravaNeedsAuth && (
              <div style={{marginBottom:14,padding:"12px",background:"#1f140a",border:"1px solid #fc4c0244",borderRadius:10}}>
                <div style={{fontSize:12,color:"#fed7aa",lineHeight:1.6,marginBottom:10}}>Ton compte Strava n'est pas encore relié à l'app. Une seule autorisation suffit, ensuite ce sera automatique.</div>
                <button onClick={startStravaAuth} style={{width:"100%",padding:"12px",borderRadius:10,background:"#fc4c02",border:"none",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Connecter mon compte Strava</button>
              </div>
            )}
            {stravaError && (
              <div style={{marginBottom:14,padding:"10px 12px",background:"#200a0a",border:"1px solid #f8717144",borderRadius:10,fontSize:12,color:"#f87171",lineHeight:1.6}}>{stravaError}</div>
            )}

            {/* Allure — champ mis en avant, toujours visible en premier */}
            <div style={{marginBottom:16,padding:"14px 16px",background:`${dot}14`,border:`2px solid ${dot}66`,borderRadius:14}}>
              <div style={{fontSize:12,color:dot,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>🏃 ALLURE MOYENNE <span style={{color:"#475569",fontWeight:400,fontSize:11}}>(métrique clé)</span></div>
              <div style={{display:"flex",alignItems:"center",background:"#0f172a",borderRadius:10,border:`1px solid ${dot}44`,overflow:"hidden"}}>
                <input type="text" value={stats.pace} onChange={e=>set("pace",e.target.value)} placeholder="ex: 5:41"
                  style={{flex:1,padding:"14px 16px",background:"transparent",border:"none",color:"#f1f5f9",fontSize:20,fontWeight:800,outline:"none",minWidth:0}} />
                <span style={{paddingRight:16,color:"#475569",fontSize:14,flexShrink:0}}>/km</span>
              </div>
            </div>

            <Field label="FC moyenne" value={stats.hrMoy} onChange={v=>set("hrMoy",v)} placeholder="ex: 155" unit="bpm" keyboardType="number" />
            <Field label="FC maximale" value={stats.hrMax} onChange={v=>set("hrMax",v)} placeholder="ex: 174" unit="bpm" keyboardType="number" />
            <Field label="Distance" value={stats.distance} onChange={v=>set("distance",v)} placeholder="ex: 8.43" unit="km" keyboardType="number" />
            <Field label="Durée" value={stats.duration} onChange={v=>set("duration",v)} placeholder="ex: 54" unit="min" keyboardType="number" />
            <Field label="Cadence moyenne" value={stats.cadence} onChange={v=>set("cadence",v)} placeholder="ex: 151" unit="ppm" keyboardType="number" />
            <Field label="Température ressentie" value={stats.temp} onChange={v=>set("temp",v)} placeholder="ex: 28" unit="°C" keyboardType="number" />
            <Field label="Hydratation prise" value={stats.hydration} onChange={v=>set("hydration",v)} placeholder="ex: 500ml eau + 1 pastille" />
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"#64748b",marginBottom:8,fontWeight:600}}>Ressenti global</div>
              <div style={{display:"flex",gap:6}}>
                {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                  <button key={n} onClick={()=>set("feeling",n)} style={{flex:1,padding:"10px 0",borderRadius:8,background:stats.feeling===n?dot+"33":"#1e293b",border:`1.5px solid ${stats.feeling===n?dot:"#334155"}`,color:stats.feeling===n?dot:"#475569",fontSize:13,fontWeight:700,cursor:"pointer"}}>{n}</button>
                ))}
              </div>
            </div>
            <Field label="Notes libres (optionnel)" value={stats.notes} onChange={v=>set("notes",v)} placeholder="météo, terrain, sensations…" />
            {error && <div style={{marginBottom:14,padding:"12px",background:"#200a0a",border:"1px solid #f8717144",borderRadius:10,fontSize:13,color:"#f87171"}}>{error}</div>}
            <button onClick={analyze} disabled={!canAnalyze||loading} style={{width:"100%",padding:"16px",borderRadius:14,background:!canAnalyze||loading?"#1e293b":`linear-gradient(135deg,${dot}bb,${dot})`,border:"none",color:!canAnalyze||loading?"#475569":"#080810",fontSize:16,fontWeight:700,cursor:!canAnalyze||loading?"not-allowed":"pointer"}}>
              {loading ? "⏳ Analyse en cours…" : "🤖 Analyser avec Claude"}
            </button>
          </>
        ) : (
          <>
            {stats.pace && (
              <div style={{padding:"12px 16px",background:`${dot}18`,border:`1.5px solid ${dot}55`,borderRadius:12,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,color:dot,fontWeight:700}}>🏃 ALLURE MOYENNE</span>
                <span style={{fontSize:20,color:"#f1f5f9",fontWeight:800}}>{stats.pace}<span style={{fontSize:13,color:"#94a3b8",fontWeight:400}}>/km</span></span>
              </div>
            )}
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {[
                stats.hrMoy    && {l:"FC moy.",  v:`${stats.hrMoy} bpm`},
                stats.hrMax    && {l:"FC max",   v:`${stats.hrMax} bpm`},
                stats.distance && {l:"Distance", v:`${stats.distance} km`},
                stats.duration && {l:"Durée",    v:`${stats.duration} min`},
                stats.temp     && {l:"Météo",    v:`${stats.temp}°C`},
                stats.feeling  && {l:"Ressenti", v:`${stats.feeling}/10`},
              ].filter(Boolean).map((item,i)=>(
                <div key={i} style={{padding:"6px 12px",background:"#1e293b",borderRadius:8}}>
                  <span style={{fontSize:10,color:"#475569"}}>{item.l} </span>
                  <span style={{fontSize:13,color:"#f1f5f9",fontWeight:700}}>{item.v}</span>
                </div>
              ))}
            </div>
            <div style={{padding:"16px",background:"#1e293b",borderRadius:12,border:`1px solid ${dot}33`,fontSize:14,color:"#cbd5e1",lineHeight:2,whiteSpace:"pre-wrap",marginBottom:12}}>{result}</div>
            <button onClick={()=>setResult(null)} style={{width:"100%",padding:"12px",borderRadius:12,background:"#1e293b",border:"1px solid #334155",color:"#64748b",fontSize:13,cursor:"pointer",marginBottom:8}}>✏️ Modifier les stats</button>
            <button onClick={save} style={{width:"100%",padding:"16px",borderRadius:14,background:"linear-gradient(135deg,#4ade80bb,#4ade80)",border:"none",color:"#080810",fontSize:16,fontWeight:700,cursor:"pointer"}}>💾 Enregistrer le bilan</button>
          </>
        )}
      </div>
    </div>
  );
}

function BilanModal({ entry, onClose }) {
  const statItems = entry.stats ? [
    entry.stats.hrMoy    && {l:"FC moy.",  v:`${entry.stats.hrMoy} bpm`},
    entry.stats.hrMax    && {l:"FC max",   v:`${entry.stats.hrMax} bpm`},
    entry.stats.distance && {l:"Distance", v:`${entry.stats.distance} km`},
    entry.stats.duration && {l:"Durée",    v:`${entry.stats.duration} min`},
    entry.stats.temp     && {l:"Météo",    v:`${entry.stats.temp}°C`},
    entry.stats.feeling  && {l:"Ressenti", v:`${entry.stats.feeling}/10`},
  ].filter(Boolean) : [];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#0f172a",borderRadius:"20px 20px 0 0",border:"1px solid #4ade8044",width:"100%",maxWidth:520,maxHeight:"88vh",overflowY:"auto",padding:"20px 18px 36px"}}>
        <div style={{width:40,height:4,background:"#334155",borderRadius:2,margin:"0 auto 20px"}} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:17,fontWeight:700,color:"#f1f5f9"}}>{entry.label}</div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",borderRadius:10,color:"#64748b",width:36,height:36,cursor:"pointer",fontSize:16}}>✕</button>
        </div>
        <div style={{fontSize:12,color:"#4ade80",marginBottom:14}}>Bilan du {entry.date}</div>
        {entry.stats?.pace && (
          <div style={{padding:"12px 16px",background:"#4ade8018",border:"1.5px solid #4ade8055",borderRadius:12,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:12,color:"#4ade80",fontWeight:700}}>🏃 ALLURE MOYENNE</span>
            <span style={{fontSize:20,color:"#f1f5f9",fontWeight:800}}>{entry.stats.pace}<span style={{fontSize:13,color:"#94a3b8",fontWeight:400}}>/km</span></span>
          </div>
        )}
        {statItems.length > 0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
            {statItems.map((item,i)=>(
              <div key={i} style={{padding:"6px 12px",background:"#1e293b",borderRadius:8}}>
                <span style={{fontSize:10,color:"#475569"}}>{item.l} </span>
                <span style={{fontSize:13,color:"#f1f5f9",fontWeight:700}}>{item.v}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{padding:"16px",background:"#1e293b",borderRadius:12,fontSize:14,color:"#cbd5e1",lineHeight:2,whiteSpace:"pre-wrap"}}>{entry.analysis}</div>
      </div>
    </div>
  );
}

// ── TAB HYDRATATION ────────────────────────────────────────────────────────────
function HydrationTab() {
  return (
    <div style={{padding:"16px 14px 80px"}}>
      <div style={{padding:"16px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:14,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:6}}>💧 Plan d'hydratation — Saramon, Gers</div>
        <div style={{fontSize:12,color:"#64748b",lineHeight:1.8}}>
          Le Gers a des étés très chauds (tu as déjà enregistré <span style={{color:"#f87171",fontWeight:700}}>31°C</span> sur une sortie du soir) et des automnes frais et humides. Ton plan traverse les deux saisons — adapte ton hydratation à chaque phase.
        </div>
      </div>

      {/* Recette maison */}
      <div style={{marginBottom:20,background:"#0f172a",border:"1px solid #fbbf2444",borderRadius:14,padding:"16px"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#fbbf24",marginBottom:10}}>🍯 {RECIPE.title}</div>
        <div style={{fontSize:11,color:"#475569",marginBottom:10}}>Pour une gourde de 750 ml</div>
        {RECIPE.base.map((r,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<RECIPE.base.length-1?"1px solid #1e293b":"none"}}>
            <span style={{fontSize:13,color:"#e2e8f0"}}>{r.item}</span>
            <span style={{fontSize:13,color:"#fbbf24",fontWeight:700}}>{r.qty}</span>
          </div>
        ))}
        <div style={{marginTop:12,padding:"10px 12px",background:"#1e293b",borderRadius:8,fontSize:11,color:"#94a3b8",lineHeight:1.7}}>☀️ {RECIPE.hotVariant}</div>
        <div style={{marginTop:8,padding:"10px 12px",background:"#1e293b",borderRadius:8,fontSize:11,color:"#94a3b8",lineHeight:1.7}}>🔥 {RECIPE.veryHotVariant}</div>
        <div style={{marginTop:10,fontSize:11,color:"#475569",lineHeight:1.7}}>💡 {RECIPE.note}</div>
      </div>

      {/* Timeline saisons */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,letterSpacing:2,color:"#475569",marginBottom:10}}>ÉVOLUTION SUR TON PLAN</div>
        {Object.entries(CLIMATE).map(([key,c])=>{
          const weeksInClimate = PLAN.filter(w=>w.climate===key);
          if(!weeksInClimate.length) return null;
          const first = weeksInClimate[0], last = weeksInClimate[weeksInClimate.length-1];
          return (
            <div key={key} style={{display:"flex",gap:12,padding:"12px 14px",background:c.color+"11",border:`1px solid ${c.color}33`,borderRadius:12,marginBottom:8,alignItems:"center"}}>
              <span style={{fontSize:22}}>{c.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:c.color}}>{c.label} <span style={{color:"#475569",fontWeight:400}}>· {c.temp}</span></div>
                <div style={{fontSize:11,color:"#64748b",marginTop:1}}>Semaines {first.week} à {last.week} · {first.date} → {last.date}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table hydratation */}
      <div style={{fontSize:11,letterSpacing:2,color:"#475569",marginBottom:10}}>APPORTS PAR TEMPÉRATURE</div>
      {HYDRATION_TABLE.map((row,i)=>(
        <div key={i} style={{marginBottom:10,background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{row.range}</span>
            <span style={{fontSize:13,fontWeight:700,color:"#60a5fa"}}>{row.water}</span>
          </div>
          <div style={{fontSize:12,color:"#94a3b8",marginBottom:4}}>🧂 {row.elec}</div>
          <div style={{fontSize:11,color:"#475569",lineHeight:1.6}}>{row.note}</div>
        </div>
      ))}

      {/* Checklist avant/pendant/après */}
      <div style={{marginTop:20,fontSize:11,letterSpacing:2,color:"#475569",marginBottom:10}}>CHECKLIST PAR SÉANCE</div>
      {[
        { t:"AVANT (2h avant le départ)", items:["500 ml d'eau minimum","Repas léger si sortie longue","Vérifie la météo du jour (chaleur = pré-hydrate plus)"] },
        { t:"PENDANT", items:["Gourde/ceinture dès 45 min d'effort ou >18°C","Gel énergétique toutes les 40-45 min sur sorties longues","Pastille électrolytes selon tableau ci-dessus"] },
        { t:"APRÈS", items:["500-750 ml dans les 30 min post-effort","Réhydrate en fonction de la perte de poids si forte chaleur","Sodium (bouillon, eau salée) après sorties >2h en été"] },
      ].map((block,i)=>(
        <div key={i} style={{marginBottom:10,padding:"12px 14px",background:"#1e293b",borderRadius:12}}>
          <div style={{fontSize:12,fontWeight:700,color:"#f97316",marginBottom:6}}>{block.t}</div>
          {block.items.map((it,j)=>(
            <div key={j} style={{fontSize:12,color:"#94a3b8",marginBottom:4,lineHeight:1.6}}>• {it}</div>
          ))}
        </div>
      ))}

      {/* Race day */}
      <div style={{marginTop:16,padding:"16px",background:"linear-gradient(135deg,#1a0a2e,#0a1a2e)",border:"1px solid #e879f955",borderRadius:14}}>
        <div style={{fontSize:13,fontWeight:700,color:"#e879f9",marginBottom:8}}>🏁 Jour J — 1er novembre</div>
        <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.8}}>
          Météo attendue en novembre dans le Gers : <span style={{color:"#f1f5f9",fontWeight:700}}>8-14°C</span> le matin. Frais, donc la soif sera moins marquée — ne néglige pas les ravitos malgré tout. Vise ~500-600 ml/h, 1 gel toutes les 45 min, sodium dès le 25ᵉ km. Teste ta stratégie de course pendant les sorties longues à blocs AM (semaines 5 à 13) pour ne rien découvrir le jour J.
        </div>
      </div>
    </div>
  );
}

// ── TAB COURSE — STRATÉGIE DE PACING JOUR J ─────────────────────────────────
const TIME_PRESETS = [
  { label:"4:20", sec:4*3600+20*60 },
  { label:"4:25", sec:4*3600+25*60 },
  { label:"4:30", sec:4*3600+30*60 },
  { label:"4:35", sec:4*3600+35*60 },
  { label:"4:40", sec:4*3600+40*60 },
  { label:"4:45", sec:4*3600+45*60 },
];
function CourseTab() {
  const [targetSec, setTargetSec] = useState(4*3600+35*60);
  const [customMin, setCustomMin] = useState("");
  const [strategy, setStrategy]   = useState("even");
  const [offset, setOffset]       = useState(8);

  const applyCustom = () => {
    const m = Number(customMin);
    if(m>0) setTargetSec(Math.round(m*60));
  };

  const basePaceSec = targetSec / MARATHON_DIST;
  const splits = useMemo(()=>computeSplits(targetSec, strategy, offset), [targetSec, strategy, offset]);

  const predictions = PERSONAL_RECORDS.map(r=>({
    ...r,
    predictedSec: riegelPredict(r.timeSec, r.distKm, MARATHON_DIST),
  }));
  const halfPrediction = predictions.find(p=>p.label==="Semi-marathon");
  const deltaVsGoal = halfPrediction ? halfPrediction.predictedSec - targetSec : null;

  return (
    <div style={{padding:"16px 14px 80px"}}>
      {/* Objectif */}
      <div style={{padding:"16px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:14,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:12}}>🎯 Temps visé</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {TIME_PRESETS.map(p=>(
            <button key={p.label} onClick={()=>{setTargetSec(p.sec); setCustomMin("");}} style={{padding:"9px 14px",borderRadius:10,border:`1.5px solid ${targetSec===p.sec?"#f97316":"#334155"}`,background:targetSec===p.sec?"#f9731622":"transparent",color:targetSec===p.sec?"#f97316":"#64748b",fontSize:13,fontWeight:700,cursor:"pointer"}}>{p.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="text" inputMode="decimal" value={customMin} onChange={e=>setCustomMin(e.target.value)} placeholder="Temps perso (en minutes)"
            style={{flex:1,padding:"11px 14px",background:"#1e293b",border:"1px solid #334155",borderRadius:10,color:"#f1f5f9",fontSize:13,outline:"none"}} />
          <button onClick={applyCustom} style={{padding:"11px 16px",borderRadius:10,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:13,fontWeight:700,cursor:"pointer"}}>OK</button>
        </div>
        <div style={{marginTop:14,textAlign:"center"}}>
          <div style={{fontSize:30,fontWeight:800,color:"#f97316"}}>{formatHMS(targetSec)}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:2}}>soit {formatPaceSec(basePaceSec)} /km en moyenne</div>
        </div>
      </div>

      {/* Stratégie */}
      <div style={{padding:"16px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:14,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:12}}>📐 Stratégie d'allure</div>
        <div style={{display:"flex",gap:8,marginBottom:strategy==="negative"?14:0}}>
          <button onClick={()=>setStrategy("even")} style={{flex:1,padding:"12px",borderRadius:10,border:`1.5px solid ${strategy==="even"?"#60a5fa":"#334155"}`,background:strategy==="even"?"#60a5fa18":"transparent",color:strategy==="even"?"#60a5fa":"#64748b",fontSize:13,fontWeight:700,cursor:"pointer"}}>Régulier</button>
          <button onClick={()=>setStrategy("negative")} style={{flex:1,padding:"12px",borderRadius:10,border:`1.5px solid ${strategy==="negative"?"#4ade80":"#334155"}`,background:strategy==="negative"?"#4ade8018":"transparent",color:strategy==="negative"?"#4ade80":"#64748b",fontSize:13,fontWeight:700,cursor:"pointer"}}>Négatif (fin plus rapide)</button>
        </div>
        {strategy==="negative" && (
          <>
            <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Écart par rapport à l'allure moyenne</div>
            <div style={{display:"flex",gap:6}}>
              {[5,8,10,15].map(o=>(
                <button key={o} onClick={()=>setOffset(o)} style={{flex:1,padding:"9px 0",borderRadius:8,border:`1.5px solid ${offset===o?"#4ade80":"#334155"}`,background:offset===o?"#4ade8018":"transparent",color:offset===o?"#4ade80":"#475569",fontSize:12,fontWeight:700,cursor:"pointer"}}>±{o}s/km</button>
              ))}
            </div>
            <div style={{marginTop:10,fontSize:11,color:"#475569",lineHeight:1.6}}>1ère moitié à {formatPaceSec(basePaceSec+offset)}/km, 2ème moitié à {formatPaceSec(basePaceSec-offset)}/km — même temps total, départ maîtrisé.</div>
          </>
        )}
      </div>

      {/* Prédiction Riegel */}
      {halfPrediction && (
        <div style={{padding:"16px",background:Math.abs(deltaVsGoal)<300?"#0d1f0d":"#1f140a",border:`1px solid ${Math.abs(deltaVsGoal)<300?"#4ade8044":"#fb923c44"}`,borderRadius:14,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:8}}>📊 Projection à partir de ton record</div>
          <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.8}}>
            Sur la base de ton semi-marathon en <span style={{color:"#f1f5f9",fontWeight:700}}>{formatHMS(halfPrediction.timeSec)}</span> ({halfPrediction.date}), la formule de Riegel projette un marathon en <span style={{color:"#f1f5f9",fontWeight:700}}>~{formatHMS(halfPrediction.predictedSec)}</span>.
            {" "}{deltaVsGoal<0
              ? `C'est ${formatHMS(Math.abs(deltaVsGoal))} plus rapide que ton objectif — la marge existe, à condition que l'endurance spécifique (les sorties longues à blocs AM) suive.`
              : `C'est ${formatHMS(Math.abs(deltaVsGoal))} plus lent que ton objectif — reste un temps ambitieux mais cohérent, à confirmer sur les sorties longues à blocs allure marathon.`}
          </div>
          <div style={{marginTop:10,fontSize:11,color:"#475569",lineHeight:1.6}}>⚠️ Ces projections sont indicatives — elles ne tiennent pas compte de la météo du jour J ni de la gestion d'effort sur 42 km. Ta plus longue sortie à ce jour : {LONGEST_RUN_KM} km — le plan t'amène progressivement au-delà.</div>
        </div>
      )}

      {/* Table des passages */}
      <div style={{fontSize:11,letterSpacing:2,color:"#475569",marginBottom:10}}>TEMPS DE PASSAGE</div>
      <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <div style={{display:"flex",padding:"10px 14px",background:"#1e293b",fontSize:11,color:"#64748b",fontWeight:700}}>
          <div style={{flex:1}}>KM</div>
          <div style={{flex:1.2}}>ALLURE</div>
          <div style={{flex:1.4,textAlign:"right"}}>TEMPS CUMULÉ</div>
        </div>
        {splits.map((row,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderTop:"1px solid #1e293b",background:row.isHalf?"#0a1a2822":"transparent"}}>
            <div style={{flex:1,fontSize:13,fontWeight:700,color:row.isHalf?"#60a5fa":"#f1f5f9"}}>{row.isHalf?"21,1 (mi)":`${row.km}`}</div>
            <div style={{flex:1.2,fontSize:12,color:"#94a3b8"}}>{formatPaceSec(row.paceSec)}/km</div>
            <div style={{flex:1.4,textAlign:"right"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{formatHMS(row.cumTimeSec)}</span>
              <span style={{marginLeft:8}}>
                {row.gelCount>0 && "⚡".repeat(Math.min(row.gelCount,4))}
                {row.sodium && " 🧂"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{fontSize:11,color:"#334155",lineHeight:1.7,marginBottom:16}}>⚡ = repère gel (~toutes les 45 min) · 🧂 = pense au sodium à partir du 25ᵉ km. Détails complets dans l'onglet Hydratation.</div>

      {/* Records de référence */}
      <div style={{fontSize:11,letterSpacing:2,color:"#475569",marginBottom:10}}>TES RECORDS (GARMIN)</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {PERSONAL_RECORDS.map((r,i)=>(
          <div key={i} style={{flex:"1 1 30%",padding:"12px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,textAlign:"center"}}>
            <div style={{fontSize:11,color:"#475569"}}>{r.label}</div>
            <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9",marginTop:2}}>{formatHMS(r.timeSec)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TAB PROGRESSION — GRAPHIQUES ─────────────────────────────────────────────
function buildProgressionRows(analyses, overrides) {
  const rows = [];
  PLAN.forEach(rawWeek=>{
    rawWeek.sessions.forEach((rawSession,i)=>{
      const key = `${rawWeek.week}-${i}`;
      const a = analyses[key];
      if(a && a.stats) {
        const s = getEffectiveSession(rawWeek.week, i, rawSession, overrides);
        const st = a.stats;
        rows.push({
          key,
          name: `S${rawWeek.week} ${s.day}`,
          type: s.type,
          date: a.date,
          pace: st.pace ? parsePaceToMin(st.pace) : null,
          targetPace: s.target?.pace ? parsePaceToMin(s.target.pace) : null,
          hrMoy: st.hrMoy ? Number(st.hrMoy) : null,
          hrMax: st.hrMax ? Number(st.hrMax) : null,
          targetHrMax: s.target?.hrMax || null,
          feeling: st.feeling ? Number(st.feeling) : null,
          temp: st.temp ? Number(st.temp) : null,
        });
      }
    });
  });
  return rows;
}
function ChartCard({ title, color, children }) {
  return (
    <div style={{padding:"16px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:14,marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",marginBottom:14}}>{title}</div>
      <div style={{height:220}}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
function ProgressionTab({ analyses, overrides }) {
  const rows = useMemo(()=>buildProgressionRows(analyses, overrides), [analyses, overrides]);

  if(rows.length===0) {
    return (
      <div style={{padding:"16px 14px 80px",textAlign:"center"}}>
        <div style={{fontSize:48,marginTop:40,marginBottom:16}}>📈</div>
        <div style={{fontSize:16,color:"#64748b",fontWeight:600}}>Pas encore de données</div>
        <div style={{fontSize:13,color:"#334155",marginTop:8,lineHeight:1.7}}>Dès que tu auras saisi les stats de quelques séances, tes courbes de progression apparaîtront ici.</div>
      </div>
    );
  }

  const paceRows = rows.filter(r=>r.pace!=null);
  const hrRows   = rows.filter(r=>r.hrMoy!=null);
  const feelRows = rows.filter(r=>r.feeling!=null);
  const avgPace  = paceRows.length ? paceRows.reduce((a,r)=>a+r.pace,0)/paceRows.length : null;
  const avgHr    = hrRows.length ? Math.round(hrRows.reduce((a,r)=>a+r.hrMoy,0)/hrRows.length) : null;

  const tooltipStyle = { background:"#1e293b", border:"1px solid #334155", borderRadius:8, fontSize:12, color:"#e2e8f0" };
  const paceTick = v => `${Math.floor(v)}:${String(Math.round((v%1)*60)).padStart(2,"0")}`;

  return (
    <div style={{padding:"16px 14px 80px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <div style={{flex:1,padding:"12px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:800,color:"#60a5fa"}}>{rows.length}</div>
          <div style={{fontSize:10,color:"#475569"}}>séances analysées</div>
        </div>
        <div style={{flex:1,padding:"12px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:800,color:"#4ade80"}}>{avgPace?paceTick(avgPace):"—"}</div>
          <div style={{fontSize:10,color:"#475569"}}>allure moy. réelle</div>
        </div>
        <div style={{flex:1,padding:"12px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:800,color:"#f97316"}}>{avgHr??"—"}</div>
          <div style={{fontSize:10,color:"#475569"}}>bpm moy.</div>
        </div>
      </div>

      {paceRows.length>0 && (
        <ChartCard title="🏃 Allure réelle vs allure cible">
          <LineChart data={paceRows} margin={{top:5,right:5,left:0,bottom:5}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={{fontSize:10,fill:"#475569"}} interval="preserveStartEnd" />
            <YAxis tick={{fontSize:10,fill:"#475569"}} tickFormatter={paceTick} width={36} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v,n)=>[`${paceTick(v)}/km`, n==="pace"?"Réelle":"Cible"]} />
            <Line type="monotone" dataKey="targetPace" stroke="#475569" strokeDasharray="4 4" dot={false} name="Cible" isAnimationActive={false} />
            <Line type="monotone" dataKey="pace" stroke="#4ade80" strokeWidth={2} dot={{r:3}} name="Réelle" isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      )}

      {hrRows.length>0 && (
        <ChartCard title="❤️ Fréquence cardiaque moyenne vs FC max cible">
          <LineChart data={hrRows} margin={{top:5,right:5,left:0,bottom:5}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={{fontSize:10,fill:"#475569"}} interval="preserveStartEnd" />
            <YAxis tick={{fontSize:10,fill:"#475569"}} width={30} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="targetHrMax" stroke="#475569" strokeDasharray="4 4" dot={false} name="FC max cible" isAnimationActive={false} />
            <Line type="monotone" dataKey="hrMoy" stroke="#f87171" strokeWidth={2} dot={{r:3}} name="FC moyenne" isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      )}

      {feelRows.length>0 && (
        <ChartCard title="😓 Ressenti par séance (1-10)">
          <BarChart data={feelRows} margin={{top:5,right:5,left:0,bottom:5}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={{fontSize:10,fill:"#475569"}} interval="preserveStartEnd" />
            <YAxis tick={{fontSize:10,fill:"#475569"}} domain={[0,10]} width={20} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="feeling" fill="#60a5fa" radius={[4,4,0,0]} name="Ressenti" isAnimationActive={false} />
          </BarChart>
        </ChartCard>
      )}
    </div>
  );
}

function ExportImportModal({ done, analyses, overrides, onClose, onImport }) {
  const [mode, setMode] = useState("export");
  const [importText, setImportText] = useState("");
  const [copyLabel, setCopyLabel] = useState("📋 Copier le texte");
  const [downloadMsg, setDownloadMsg] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const [showManualExport, setShowManualExport] = useState(false);
  const [showManualImportPanel, setShowManualImportPanel] = useState(false);
  const fileInputRef = useRef(null);
  const exportData = JSON.stringify({ done, analyses, overrides }, null, 2);

  const copy = async () => {
    try { await navigator.clipboard.writeText(exportData); setCopyLabel("✅ Copié !"); setTimeout(()=>setCopyLabel("📋 Copier le texte"),2000); }
    catch { setCopyLabel("Sélectionne et copie manuellement"); }
  };

  const download = () => {
    try {
      const blob = new Blob([exportData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0,10);
      a.href = url; a.download = `marathon-sauvegarde-${stamp}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadMsg({ ok:true, text:"Fichier téléchargé — retrouve-le dans tes téléchargements pour l'importer dans la prochaine version." });
    } catch {
      setDownloadMsg({ ok:false, text:"Le téléchargement direct n'a pas fonctionné sur ce navigateur — utilise le copier-coller ci-dessous à la place." });
      setShowManualExport(true);
    }
  };

  const applyImportedJson = (jsonText) => {
    try {
      const parsed = JSON.parse(jsonText);
      if(!parsed.done && !parsed.analyses && !parsed.overrides) throw new Error("format");
      onImport(parsed.done||{}, parsed.analyses||{}, parsed.overrides||{ sessions:{}, weeks:{} });
      setImportMsg({ ok:true, text:"Import réussi ! Tes données sont fusionnées." });
    } catch { setImportMsg({ ok:false, text:"Fichier ou texte invalide — vérifie que c'est bien un export de l'app." }); }
  };

  const onFilePicked = (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImportedJson(String(reader.result||""));
    reader.onerror = () => setImportMsg({ ok:false, text:"Impossible de lire ce fichier — essaie le copier-coller ci-dessous." });
    reader.readAsText(file);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#0f172a",borderRadius:"20px 20px 0 0",border:"1px solid #33415588",width:"100%",maxWidth:520,maxHeight:"88vh",overflowY:"auto",padding:"20px 18px 36px"}}>
        <div style={{width:40,height:4,background:"#334155",borderRadius:2,margin:"0 auto 20px"}} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:700,color:"#f1f5f9"}}>🔄 Export / Import</div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",borderRadius:10,color:"#64748b",width:36,height:36,cursor:"pointer",fontSize:16}}>✕</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          <button onClick={()=>setMode("export")} style={{flex:1,padding:"10px 0",borderRadius:10,border:`1.5px solid ${mode==="export"?"#60a5fa":"#334155"}`,background:mode==="export"?"#60a5fa22":"transparent",color:mode==="export"?"#60a5fa":"#64748b",fontSize:13,fontWeight:700,cursor:"pointer"}}>📤 Exporter</button>
          <button onClick={()=>setMode("import")} style={{flex:1,padding:"10px 0",borderRadius:10,border:`1.5px solid ${mode==="import"?"#4ade80":"#334155"}`,background:mode==="import"?"#4ade8022":"transparent",color:mode==="import"?"#4ade80":"#64748b",fontSize:13,fontWeight:700,cursor:"pointer"}}>📥 Importer</button>
        </div>

        {mode==="export" ? (
          <>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12,lineHeight:1.6}}>Télécharge un fichier de sauvegarde. Tu n'as qu'à le sélectionner dans l'onglet "Importer" de la prochaine version pour tout récupérer.</div>
            <button onClick={download} style={{width:"100%",padding:16,borderRadius:14,background:"linear-gradient(135deg,#60a5fabb,#60a5fa)",border:"none",color:"#080810",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10}}>💾 Télécharger le fichier de sauvegarde</button>
            {downloadMsg && (
              <div style={{marginBottom:12,padding:12,background:downloadMsg.ok?"#0d2218":"#200a0a",border:`1px solid ${downloadMsg.ok?"#4ade8044":"#f8717144"}`,borderRadius:10,fontSize:12,color:downloadMsg.ok?"#4ade80":"#f87171",lineHeight:1.6}}>{downloadMsg.text}</div>
            )}
            <button onClick={()=>setShowManualExport(v=>!v)} style={{background:"transparent",border:"none",color:"#334155",fontSize:11,cursor:"pointer",padding:"4px 0",marginBottom:showManualExport?10:0}}>{showManualExport?"▾":"▸"} Le téléchargement ne marche pas ? Copier le texte à la place</button>
            {showManualExport && (
              <>
                <textarea readOnly value={exportData} onFocus={e=>e.target.select()} style={{width:"100%",height:140,padding:12,background:"#0a0f1a",border:"1px solid #334155",borderRadius:10,color:"#94a3b8",fontSize:11,fontFamily:"monospace",marginBottom:10,resize:"vertical"}} />
                <button onClick={copy} style={{width:"100%",padding:12,borderRadius:12,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",fontSize:13,fontWeight:700,cursor:"pointer"}}>{copyLabel}</button>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12,lineHeight:1.6}}>Sélectionne le fichier de sauvegarde téléchargé depuis une version précédente.</div>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={onFilePicked} style={{display:"none"}} />
            <button onClick={()=>fileInputRef.current?.click()} style={{width:"100%",padding:16,borderRadius:14,background:"linear-gradient(135deg,#4ade80bb,#4ade80)",border:"none",color:"#080810",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10}}>📁 Choisir le fichier de sauvegarde</button>
            {importMsg && (
              <div style={{marginBottom:12,padding:12,background:importMsg.ok?"#0d2218":"#200a0a",border:`1px solid ${importMsg.ok?"#4ade8044":"#f8717144"}`,borderRadius:10,fontSize:13,color:importMsg.ok?"#4ade80":"#f87171"}}>{importMsg.text}</div>
            )}
            <button onClick={()=>setShowManualImportPanel(v=>!v)} style={{background:"transparent",border:"none",color:"#334155",fontSize:11,cursor:"pointer",padding:"4px 0",marginBottom:showManualImportPanel?10:0}}>{showManualImportPanel?"▾":"▸"} Pas de fichier ? Coller le texte à la place</button>
            {showManualImportPanel && (
              <>
                <textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder='{"done": {...}, "analyses": {...}, "overrides": {...}}' style={{width:"100%",height:140,padding:12,background:"#0a0f1a",border:"1px solid #334155",borderRadius:10,color:"#e2e8f0",fontSize:12,fontFamily:"monospace",marginBottom:10,resize:"vertical"}} />
                <button onClick={()=>applyImportedJson(importText)} disabled={!importText.trim()} style={{width:"100%",padding:12,borderRadius:12,background:!importText.trim()?"#1e293b":"#1e293b",border:"1px solid #334155",color:!importText.trim()?"#475569":"#94a3b8",fontSize:13,fontWeight:700,cursor:!importText.trim()?"not-allowed":"pointer"}}>Importer ce texte</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [done,        setDone]        = useState({});
  const [analyses,    setAnalyses]    = useState({});
  const [openWeek,    setOpenWeek]    = useState(null);
  const [phaseFilter, setPhaseFilter] = useState(null);
  const [tab,         setTab]         = useState("plan");
  const [statsModal,  setStatsModal]  = useState(null);
  const [bilanModal,  setBilanModal]  = useState(null);
  const [loaded,      setLoaded]      = useState(false);
  const [exportOpen,  setExportOpen]  = useState(false);
  const [overrides,   setOverrides]   = useState({ sessions:{}, weeks:{} });
  const [editSession, setEditSession] = useState(null); // {weekNum, idx, session}
  const [editWeek,    setEditWeek]    = useState(null); // week object
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [newItems, setNewItems] = useState([]);
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(()=>{
    Promise.all([loadStore(KEY_DONE),loadStore(KEY_ANALYSIS),loadStore(KEY_OVERRIDES),loadStore(KEY_SEEN_VER)]).then(([d,a,o,seenRaw])=>{
      const mergedAnalyses = {...SEED_ANALYSES, ...a}; // les vraies données locales priment sur le seed
      const mergedDone = {...SEED_DONE, ...d};
      const mergedOverrides = { sessions:{}, weeks:{}, ...o };
      setDone(mergedDone); setAnalyses(mergedAnalyses); setOverrides(mergedOverrides); setLoaded(true);
      // persiste la fusion pour que le seed ne dépende plus du code après ce chargement
      saveStore(KEY_DONE, mergedDone);
      saveStore(KEY_ANALYSIS, mergedAnalyses);

      // détection de nouvelle version
      const seenVersion = typeof seenRaw === "string" ? seenRaw : null;
      if(seenVersion === null) {
        saveStore(KEY_SEEN_VER, APP_VERSION); // première ouverture connue : rien à annoncer, on enregistre juste le repère
      } else if(seenVersion !== APP_VERSION) {
        const items = CHANGELOG.filter(c=>versionNum(c.v) > versionNum(seenVersion));
        setNewItems(items.length ? items : CHANGELOG.slice(0,1));
        setShowUpdateBanner(true);
      }
    }).catch(()=>setStorageWarning(true));
  },[]);

  const dismissUpdateBanner = async () => {
    setShowUpdateBanner(false);
    await saveStore(KEY_SEEN_VER, APP_VERSION);
  };
  // (bouton "forcer le rafraîchissement" retiré — window.location.reload() cassait la page dans ce contexte au lieu de la réparer)

  const toggleDone = async key => {
    const next={...done,[key]:!done[key]};
    if(!next[key]) delete next[key];
    setDone(next); await saveStore(KEY_DONE,next);
  };
  const onSaved = (key,entry) => setAnalyses(prev=>({...prev,[key]:entry}));
  const onImport = async (importedDone, importedAnalyses, importedOverrides) => {
    const nextDone = {...done, ...importedDone};
    const nextAnalyses = {...analyses, ...importedAnalyses};
    const nextOverrides = {
      sessions: {...overrides.sessions, ...(importedOverrides?.sessions||{})},
      weeks:    {...overrides.weeks,    ...(importedOverrides?.weeks||{})},
    };
    setDone(nextDone); setAnalyses(nextAnalyses); setOverrides(nextOverrides);
    await saveStore(KEY_DONE, nextDone);
    await saveStore(KEY_ANALYSIS, nextAnalyses);
    await saveStore(KEY_OVERRIDES, nextOverrides);
  };

  const saveSessionOverride = async (key, override) => {
    const next = { ...overrides, sessions:{ ...overrides.sessions, [key]:override } };
    setOverrides(next); await saveStore(KEY_OVERRIDES, next);
  };
  const resetSessionOverride = async key => {
    const nextSessions = { ...overrides.sessions }; delete nextSessions[key];
    const next = { ...overrides, sessions:nextSessions };
    setOverrides(next); await saveStore(KEY_OVERRIDES, next);
  };
  const saveWeekOverride = async (weekNum, override) => {
    const next = { ...overrides, weeks:{ ...overrides.weeks, [weekNum]:override } };
    setOverrides(next); await saveStore(KEY_OVERRIDES, next);
  };
  const resetWeekOverride = async weekNum => {
    const nextWeeks = { ...overrides.weeks }; delete nextWeeks[weekNum];
    const next = { ...overrides, weeks:nextWeeks };
    setOverrides(next); await saveStore(KEY_OVERRIDES, next);
  };

  const doneCount     = Object.values(done).filter(Boolean).length;
  const pct           = Math.round((doneCount/totalSessions)*100);
  const filtered      = phaseFilter ? PLAN.filter(w=>w.phase===phaseFilter) : PLAN;
  const analyzedCount = Object.keys(analyses).length;

  if(!loaded) return (
    <div style={{background:"#080810",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontSize:15}}>Chargement…</div>
  );

  return (
    <div style={{background:"#080810",minHeight:"100vh",color:"#e2e8f0",fontFamily:"system-ui,-apple-system,sans-serif"}}>
      {statsModal && <StatsModal session={statsModal.session} sessionKey={statsModal.key} onClose={()=>setStatsModal(null)} onSaved={onSaved} />}
      {bilanModal && <BilanModal entry={bilanModal} onClose={()=>setBilanModal(null)} />}
      {exportOpen && <ExportImportModal done={done} analyses={analyses} overrides={overrides} onClose={()=>setExportOpen(false)} onImport={onImport} />}
      {editSession && <EditSessionModal session={editSession.session} sessionKey={editSession.key} hasOverride={!!overrides.sessions[editSession.key]} onClose={()=>setEditSession(null)} onSave={saveSessionOverride} onReset={resetSessionOverride} />}
      {editWeek && <EditWeekModal week={editWeek} hasOverride={!!overrides.weeks[editWeek.week]} onClose={()=>setEditWeek(null)} onSave={saveWeekOverride} onReset={resetWeekOverride} />}

      {showUpdateBanner && (
        <div style={{background:"linear-gradient(135deg,#0a2018,#0d1f0d)",borderBottom:"1.5px solid #4ade8055",padding:"14px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"#4ade80",marginBottom:6}}>🔔 App mise à jour · {APP_VERSION}</div>
              {newItems.flatMap(c=>c.items).map((it,i)=>(
                <div key={i} style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:2}}>{it}</div>
              ))}
            </div>
            <button onClick={dismissUpdateBanner} style={{background:"#1e293b",border:"none",borderRadius:8,color:"#64748b",width:30,height:30,cursor:"pointer",fontSize:14,flexShrink:0}}>✕</button>
          </div>
        </div>
      )}

      {storageWarning && (
        <div style={{background:"#1f140a",borderBottom:"1.5px solid #fb923c55",padding:"12px 16px"}}>
          <div style={{fontSize:12,color:"#fed7aa",lineHeight:1.6}}>⚠️ Le stockage de l'app n'a pas répondu correctement — tes séances cochées, bilans et modifications pourraient ne pas être sauvegardés cette session. Pense à faire un Export après tes prochaines saisies, par précaution.</div>
        </div>
      )}

      <div style={{background:"#0c1220",borderBottom:"1px solid #1e293b",padding:"20px 16px 0",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:11,letterSpacing:3,color:"#475569",marginBottom:4}}>MARATHON · DIM 1er NOV. 2026</div>
            <div style={{fontSize:22,fontWeight:800,color:"#f1f5f9",letterSpacing:-0.5}}>
              4:35:00 <span style={{color:"#f97316",fontSize:16}}>· 6:31/km</span>
            </div>
            <div style={{fontSize:11,color:"#334155",marginTop:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span>16 sem · Saramon (32) · départ 14 juil.</span>
              <button onClick={()=>setChangelogOpen(o=>!o)} style={{background:"#1e293b",border:"none",borderRadius:6,color:"#475569",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>{APP_VERSION}</button>
            </div>
            {changelogOpen && (
              <div style={{marginTop:8,padding:"10px 12px",background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,maxWidth:280}}>
                {CHANGELOG.map((c,i)=>(
                  <div key={i} style={{marginBottom:i<CHANGELOG.length-1?8:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#f97316",marginBottom:4}}>{c.v}</div>
                    {c.items.map((it,j)=><div key={j} style={{fontSize:11,color:"#94a3b8",lineHeight:1.6}}>{it}</div>)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:26,fontWeight:800,color:"#f97316"}}>{pct}%</div>
            <div style={{fontSize:11,color:"#475569"}}>{doneCount}/{totalSessions} séances</div>
          </div>
        </div>
        <div style={{height:3,background:"#1e293b",borderRadius:2,marginBottom:14}}>
          <div style={{height:"100%",borderRadius:2,background:"linear-gradient(90deg,#4ade80,#f97316)",width:`${pct}%`,transition:"width 0.5s"}} />
        </div>
        <button onClick={()=>setExportOpen(true)} style={{background:"transparent",border:"none",color:"#334155",fontSize:11,cursor:"pointer",padding:"0 0 10px",display:"flex",alignItems:"center",gap:4}}>🔄 Export / Import des données</button>
        <div style={{display:"flex",borderTop:"1px solid #1e293b",marginLeft:-16,marginRight:-16,overflowX:"auto"}}>
          {[["plan","📋 Plan"],["hydra","💧 Hydra"],["course","🏁 Course"],["progress","📈 Progrès"],["bilans","📊 Bilans"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:"0 0 auto",minWidth:78,padding:"13px 6px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===id?"#f97316":"transparent"}`,color:tab===id?"#f97316":"#475569",fontSize:12,fontWeight:tab===id?700:400,cursor:"pointer",whiteSpace:"nowrap"}}>
              {lbl}{id==="bilans"&&analyzedCount>0?` (${analyzedCount})`:""}
            </button>
          ))}
        </div>
      </div>

      {tab==="plan" && (
        <div style={{padding:"14px 14px 80px"}}>
          <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
            <button onClick={()=>setPhaseFilter(null)} style={{padding:"8px 16px",borderRadius:20,border:`1.5px solid ${!phaseFilter?"#f1f5f9":"#334155"}`,background:!phaseFilter?"#f1f5f9":"transparent",color:!phaseFilter?"#080810":"#475569",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>Tout</button>
            {PHASES.map(ph=>(
              <button key={ph.id} onClick={()=>setPhaseFilter(ph.id===phaseFilter?null:ph.id)} style={{padding:"8px 16px",borderRadius:20,border:`1.5px solid ${phaseFilter===ph.id?ph.color:"#334155"}`,background:phaseFilter===ph.id?ph.color+"22":"transparent",color:phaseFilter===ph.id?ph.color:"#475569",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{ph.name}</button>
            ))}
          </div>

          {filtered.map(rawWeek=>{
            const week      = getEffectiveWeek(rawWeek, overrides);
            const isOpen    = openWeek===week.week;
            const pc        = phaseColor(week.phase);
            const cl        = CLIMATE[week.climate];
            const wDone     = week.sessions.filter((_,i)=>done[`${week.week}-${i}`]).length;
            const allDone   = wDone===week.sessions.length;
            const hasAnal   = week.sessions.some((_,i)=>analyses[`${week.week}-${i}`]);
            const phaseName = PHASES.find(p=>p.id===week.phase)?.name;
            return (
              <div key={week.week} style={{marginBottom:8}}>
                <div role="button" tabIndex={0} onClick={()=>setOpenWeek(isOpen?null:week.week)} onKeyDown={e=>{ if(e.key==="Enter"||e.key===" ") setOpenWeek(isOpen?null:week.week); }} style={{width:"100%",textAlign:"left",background:week.raceWeek?"#1a0a2a":allDone?"#0d1f0d":"#0f172a",border:`1.5px solid ${isOpen?pc+"99":week.raceWeek?"#e879f966":allDone?"#4ade8055":"#1e293b"}`,borderRadius:isOpen?"14px 14px 0 0":14,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:10,background:week.raceWeek?"#e879f922":allDone?"#4ade8022":pc+"18",border:`1.5px solid ${week.raceWeek?"#e879f966":allDone?"#4ade8055":pc+"44"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:week.raceWeek?"#e879f9":allDone?"#4ade80":pc,flexShrink:0}}>
                    {week.raceWeek ? "🏁" : allDone?"✓":week.week}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontSize:15,fontWeight:700,color:"#f1f5f9"}}>Semaine {week.week}</span>
                      {week.recovery && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"#2a1200",color:"#fb923c",fontWeight:600}}>RÉCUP</span>}
                      {week.raceWeek && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"#1a0a2a",color:"#e879f9",fontWeight:600}}>SEMAINE COURSE</span>}
                      {hasAnal && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"#0a2018",color:"#4ade80",fontWeight:600}}>📊</span>}
                    </div>
                    <div style={{fontSize:12,color:"#475569",marginTop:2,display:"flex",alignItems:"center",gap:5}}>
                      <span>{week.date} · {week.total} km · {phaseName}</span>
                      <span style={{color:cl.color}}>{cl.icon} {cl.temp}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {week.sessions.map((_,i)=>{
                      const k=`${week.week}-${i}`;
                      return <div key={i} style={{width:9,height:9,borderRadius:3,background:analyses[k]?"#60a5fa":done[k]?"#4ade80":"#334155"}} />;
                    })}
                  </div>
                  <button onClick={e=>{ e.stopPropagation(); setEditWeek(week); }} style={{background:overrides.weeks[week.week]?pc+"22":"#1e293b",border:`1px solid ${overrides.weeks[week.week]?pc+"66":"#334155"}`,borderRadius:8,color:overrides.weeks[week.week]?pc:"#475569",width:30,height:30,cursor:"pointer",fontSize:13,flexShrink:0}}>✏️</button>
                  <span style={{color:"#475569",fontSize:20,transform:isOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s"}}>›</span>
                </div>

                {isOpen && (
                  <div style={{background:"#0a1020",border:`1.5px solid ${pc}44`,borderTop:"none",borderRadius:"0 0 14px 14px",padding:"8px 12px 14px"}}>
                    {/* Hydratation tip semaine */}
                    <div style={{margin:"8px 2px 4px",padding:"10px 12px",background:cl.color+"11",border:`1px solid ${cl.color}33`,borderRadius:10,fontSize:12,color:"#94a3b8",lineHeight:1.7}}>
                      <span style={{color:cl.color,fontWeight:700}}>{cl.icon} {cl.label} ({cl.temp})</span> — {getHydrationTip(week.climate)}
                    </div>
                    {week.sessions.map((rawSession,i)=>{
                      const key   = `${week.week}-${i}`;
                      const s     = getEffectiveSession(week.week, i, rawSession, overrides);
                      const isDone= !!done[key];
                      const anal  = analyses[key];
                      const ts    = TYPE_STYLE[s.type];
                      const hasSessionOverride = !!overrides.sessions[key];
                      return (
                        <div key={i} style={{marginTop:10,background:isDone?"#0d1f0d":ts.bg,border:`1.5px solid ${anal?"#60a5fa55":isDone?"#4ade8044":ts.border}`,borderRadius:12,overflow:"hidden"}}>
                          <div style={{padding:"12px 14px",display:"flex",gap:10,alignItems:"center"}}>
                            <button onClick={()=>toggleDone(key)} style={{width:30,height:30,borderRadius:8,flexShrink:0,background:isDone?"#4ade80":"transparent",border:`2px solid ${isDone?"#4ade80":"#334155"}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#080810",fontSize:15,fontWeight:800}}>{isDone&&"✓"}</button>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                                <span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:ts.tagBg,color:ts.dot,fontWeight:700}}>{ts.tag}</span>
                                <span style={{fontSize:12,color:"#64748b"}}>{DAY_LABELS[s.day]}</span>
                                {hasSessionOverride && <span style={{fontSize:10,padding:"1px 7px",borderRadius:7,background:ts.dot+"22",color:ts.dot,fontWeight:700}}>MODIFIÉ</span>}
                              </div>
                              <div style={{fontSize:15,fontWeight:700,color:isDone?"#4ade80":"#f1f5f9",textDecoration:isDone?"line-through":"none"}}>{s.label}</div>
                              <div style={{fontSize:13,color:"#64748b",marginTop:1}}>{s.detail}</div>
                            </div>
                            <button onClick={()=>setEditSession({weekNum:week.week, idx:i, key, session:s})} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,color:"#64748b",width:30,height:30,cursor:"pointer",fontSize:13,flexShrink:0}}>✏️</button>
                          </div>
                          <div style={{padding:"0 14px 10px",fontSize:12,color:"#475569",lineHeight:1.6}}>{s.pace}</div>
                          {s.note && (
                            <div style={{margin:"0 14px 10px",padding:"10px 12px",background:"#2a1700",border:"1px solid #fb923c55",borderRadius:8,fontSize:12,color:"#fed7aa",lineHeight:1.6}}>{s.note}</div>
                          )}
                          <div style={{margin:"0 14px 10px",padding:"8px 12px",background:"#0a1a28",border:"1px solid #60a5fa33",borderRadius:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:14}}>💧</span>
                            <span style={{fontSize:12,color:"#60a5fa",fontWeight:700}}>{calcSessionHydration(s,week.climate)} ml</span>
                            <span style={{fontSize:11,color:"#475569"}}>à boire pendant la séance{calcSessionHydration(s,week.climate)>=500?" — boisson maison conseillée":""}</span>
                          </div>
                          {anal && (
                            <button onClick={()=>setBilanModal(anal)} style={{width:"100%",textAlign:"left",padding:"10px 14px",background:"#0d2218",border:"none",borderTop:"1px solid #4ade8022",cursor:"pointer"}}>
                              <div style={{fontSize:11,color:"#4ade80",fontWeight:700,marginBottom:3}}>📊 Bilan du {anal.date}</div>
                              <div style={{fontSize:12,color:"#64748b",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",lineHeight:1.6}}>{anal.analysis.replace(/[✅⚠️📊🎯💧]/g,"").split("\n").filter(l=>l.trim())[0]}</div>
                            </button>
                          )}
                          <button onClick={()=>setStatsModal({session:s,key})} style={{width:"100%",padding:"14px",background:anal?"#0a1a28":"#10203a",border:"none",borderTop:`1px solid ${anal?"#60a5fa22":"#1e293b"}`,color:"#60a5fa",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                            📝 {anal ? "Nouvelle analyse" : "Saisir mes stats Garmin"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {!phaseFilter && (
            <div style={{marginTop:16,background:"linear-gradient(135deg,#1a0a2e,#0a1a2e)",border:"1px solid #7c3aed66",borderRadius:16,padding:"24px 18px",textAlign:"center"}}>
              <div style={{fontSize:32}}>🏁</div>
              <div style={{fontSize:22,fontWeight:800,color:"#f1f5f9",marginTop:8}}>MARATHON</div>
              <div style={{fontSize:13,color:"#7c3aed",marginTop:3,letterSpacing:3}}>DIMANCHE 1er NOVEMBRE 2026</div>
              <div style={{fontSize:36,fontWeight:800,color:"#f97316",marginTop:10}}>4:35:00</div>
            </div>
          )}
        </div>
      )}

      {tab==="hydra" && <HydrationTab />}
      {tab==="course" && <CourseTab />}
      {tab==="progress" && <ProgressionTab analyses={analyses} overrides={overrides} />}

      {tab==="bilans" && (
        <div style={{padding:"16px 14px 80px"}}>
          {Object.keys(analyses).length===0 ? (
            <div style={{textAlign:"center",padding:"60px 20px"}}>
              <div style={{fontSize:48,marginBottom:16}}>📝</div>
              <div style={{fontSize:16,color:"#64748b",fontWeight:600}}>Aucun bilan pour l'instant</div>
              <div style={{fontSize:13,color:"#334155",marginTop:8,lineHeight:1.7}}>Après une séance, ouvre la semaine et appuie sur "Saisir mes stats Garmin"</div>
            </div>
          ) : (
            PLAN.map(rawWeek=>{
              const week = getEffectiveWeek(rawWeek, overrides);
              const wa=week.sessions.map((rawSession,i)=>({s:getEffectiveSession(week.week,i,rawSession,overrides),anal:analyses[`${week.week}-${i}`]})).filter(x=>x.anal);
              if(!wa.length) return null;
              return (
                <div key={week.week} style={{marginBottom:20}}>
                  <div style={{fontSize:12,letterSpacing:2,color:phaseColor(week.phase),fontWeight:700,marginBottom:10}}>SEMAINE {week.week} · {week.date}</div>
                  {wa.map(({s,anal},i)=>(
                    <button key={i} onClick={()=>setBilanModal(anal)} style={{width:"100%",textAlign:"left",marginBottom:8,padding:"16px",background:"#0f172a",border:"1px solid #4ade8033",borderRadius:14,cursor:"pointer",display:"block"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9"}}>{s.label}</div>
                        <div style={{fontSize:12,color:"#4ade80"}}>{anal.date}</div>
                      </div>
                      {anal.stats && (
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                          {[
                            anal.stats.pace     && {v:`🏃 ${anal.stats.pace}/km`, strong:true},
                            anal.stats.hrMoy    && {v:`${anal.stats.hrMoy}bpm moy`},
                            anal.stats.distance && {v:`${anal.stats.distance}km`},
                            anal.stats.temp     && {v:`🌡️${anal.stats.temp}°C`},
                            anal.stats.feeling  && {v:`😓 ${anal.stats.feeling}/10`},
                          ].filter(Boolean).map((item,j)=>(<span key={j} style={{fontSize:12,padding:"3px 10px",background:item.strong?"#4ade8022":"#1e293b",border:item.strong?"1px solid #4ade8055":"none",borderRadius:8,color:item.strong?"#4ade80":"#94a3b8",fontWeight:item.strong?700:400}}>{item.v}</span>))}
                        </div>
                      )}
                      <div style={{fontSize:13,color:"#64748b",lineHeight:1.7,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                        {anal.analysis.replace(/[✅⚠️📊🎯💧]/g,"").split("\n").filter(l=>l.trim()).slice(0,2).join(" · ")}
                      </div>
                      <div style={{fontSize:12,color:"#4ade8088",marginTop:8}}>Lire le bilan complet →</div>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
