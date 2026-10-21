import { nameKey } from '../../../shared/price-list-import.js';

/**
 * pricing.js — Client-side pricing helpers.
 *
 * Single source of truth for product prices is the GM Price List (product_prices table).
 * Every portal calls setLivePrices(data) on load via GET /api/prices.
 * When the device is offline the latest prices are served from localStorage so
 * the branch POS works without a network connection.
 */

const PRICE_CACHE_KEY = 'dynapharm_prices_v1';

let _livePrices = null;

function _mapPrice(p) {
  return {
    id:          p.id,
    product_code: p.product_code ?? null,
    description: p.description,
    aliases: Array.isArray(p.aliases) ? [...p.aliases] : [],
    dp:          Number(p.dp)  || 0,
    cp:          Number(p.cp)  || 0,
    cif:         Number(p.cif) || 0,
    bv:          Number(p.bv)  || 0,
    is_package:  !!p.is_package,
  };
}

export function setLivePrices(prices) {
  if (!Array.isArray(prices)) return false;
  const mapped = prices.map(_mapPrice);
  const changed = _livePrices === null || JSON.stringify(_livePrices) !== JSON.stringify(mapped);
  _livePrices = mapped;
  // Persist even an empty list so a cleared catalogue cannot be restored from stale storage.
  try {
    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(_livePrices));
  } catch (_) {}
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new window.CustomEvent('dynapharm-prices-updated', { detail: mapped }));
  }
  return changed;
}

export function getLiveProductList() {
  if (_livePrices !== null) return _livePrices;
  // Offline fallback: restore the last known price list from localStorage
  try {
    const cached = localStorage.getItem(PRICE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        _livePrices = parsed;
        return _livePrices;
      }
    }
  } catch (_) {}
  return [];
}

export function pricesLoaded() {
  return getLiveProductList().length > 0;
}

export function findProductPrice(productName) {
  if (!productName) return null;
  const list = getLiveProductList();
  if (!list.length) return null;
  const normalizedKey = nameKey(productName);
  if (normalizedKey) {
    const identityMatches = list.filter(p =>
      [p.description, ...(Array.isArray(p.aliases) ? p.aliases : [])]
        .some(identity => nameKey(identity) === normalizedKey)
    );
    if (identityMatches.length === 1) return identityMatches[0];
    if (identityMatches.length > 1) return null;
  }
  const normalized = productName.trim().toUpperCase();
  let product = list.find(p => p.description.toUpperCase() === normalized);
  if (!product) {
    product = list.find(p => {
      const desc = p.description.toUpperCase();
      return desc.includes(normalized) || normalized.includes(desc);
    });
  }
  if (!product) {
    const words = normalized.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      product = list.find(p => {
        const desc = p.description.toUpperCase();
        return words.filter(w => desc.includes(w)).length >= Math.ceil(words.length * 0.6);
      });
    }
  }
  return product || null;
}

export function getProductPrice(product, isMember) {
  if (!product) return 0;
  return isMember ? (product.dp || 0) : (product.cp || 0);
}

export function getCIFPrice(productName) {
  const product = findProductPrice(productName);
  return product ? product.cif : 0;
}

export function getDPCPrice(productName) {
  const product = findProductPrice(productName);
  return product ? product.dp : 0;
}

export function getCPPrice(productName) {
  const product = findProductPrice(productName);
  return product ? product.cp : 0;
}

export function getBVPoints(productName) {
  const product = findProductPrice(productName);
  return product ? product.bv : 0;
}

export function getProductProfit(productName, campaignPrice) {
  const product = findProductPrice(productName);
  if (!product) return { cif: 0, dp: 0, profit: 0, margin: 0 };
  const sellingPrice = campaignPrice || product.dp;
  const profit = sellingPrice - product.cif;
  const margin = sellingPrice > 0 ? ((profit / sellingPrice) * 100) : 0;
  return { cif: product.cif, dp: product.dp, cp: product.cp, sellingPrice, profit, margin: Math.round(margin * 10) / 10 };
}

export function enrichProductsWithPricing(apiProducts) {
  return apiProducts.map(p => {
    const priceInfo = findProductPrice(p.name || p.description);
    if (priceInfo) {
      return { ...p, dp: priceInfo.dp, cp: priceInfo.cp, bv: priceInfo.bv, cif: priceInfo.cif, hasPricing: true };
    }
    return { ...p, dp: Number(p.price) || 0, cp: Number(p.price) || 0, bv: Number(p.bv_points) || 0, cif: 0, hasPricing: false };
  });
}

export function calculateCartTotals(cart, isMember) {
  let totalAmount = 0;
  let totalBV = 0;
  const items = cart.map(item => {
    const price = isMember
      ? (item.campaignDiscount ? item.dp : (item.memberPrice ?? item.dp ?? item.price ?? 0))
      : (item.cp ?? item.price ?? 0);
    const lineTotal = Math.round(price * item.qty * 100) / 100;
    const lineBV = (item.bv || 0) * item.qty;
    totalAmount += lineTotal;
    totalBV += lineBV;
    return { ...item, unitPrice: price, lineTotal, lineBV };
  });
  return { items, totalAmount, totalBV };
}

export function generateReceiptNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 5).replace(':', '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RCP-${date}-${time}-${rand}`;
}

import PACKAGE_DATA from '../../../shared/package-data.json';
export const PACKAGE_DATABASE = PACKAGE_DATA;

export function getPackagesForPOS() {
  const liveList = getLiveProductList();
  return liveList
    .filter(p => p.is_package)
    .map((p, idx) => {
      const key = (p.description || '').toLowerCase();
      const staticEntry = Object.entries(PACKAGE_DATABASE).find(([n]) => n.toLowerCase() === key);
      return {
        id:         `pkg-${idx}-${(p.description || '').replace(/\s+/g, '-').toLowerCase()}`,
        name:        p.description,
        description: p.description,
        dp:          Number(p.dp)  || 0,
        cp:          Number(p.cp)  || 0,
        bv:          Number(p.bv)  || 0,
        cif:         Number(p.cif) || 0,
        price:       Number(p.cp)  || 0,
        isPackage:   true,
        components:  staticEntry ? staticEntry[1].products : [],
        hasPricing:  true,
      };
    });
}

/* ── Health Check / Consultation services ──────────────────────────────────── */
export const CHECKUP_SERVICES = [
  {
    id: 'checkup-standard',
    name: 'Full Body Check Up',
    description: 'Full Body Check Up',
    isCheckup: true,
    checkupType: 'standard',
    cp: 200,
    dp: 150,
    memberPrice: 150,
    cashbackPerUnit: 50,
    consultantEarns: 150,
    bv: 0,
    hasPricing: true,
    isService: true,
  },
  {
    id: 'checkup-report',
    name: 'Full Body Check Up (With Report)',
    description: 'Full Body Check Up (With Report)',
    isCheckup: true,
    checkupType: 'report',
    cp: 250,
    dp: 200,
    memberPrice: 150,
    cashbackPerUnit: 50,
    consultantEarns: 200,
    bv: 0,
    hasPricing: true,
    isService: true,
  },
];

export function getConsultationFee(membershipStatus) {
  const isMember = membershipStatus === 'member';
  return {
    total:           isMember ? 150 : 200,
    consultantCredit: 150,
    referralCredit:  isMember ? 0 : 50,
    isMember,
    label: isMember ? 'Member Consultation Fee' : 'Non-Member Consultation Fee',
    note:  isMember
      ? 'N$150 credited to consultant'
      : 'N$50 to referral distributor, N$150 credited to consultant',
  };
}

export function calculatePrescriptionTotals(medicines, membershipStatus) {
  const fee = getConsultationFee(membershipStatus);
  const totals = {
    total:       { dp: 0, cp: 0, bv: 0 },
    dispensed:   { dp: 0, cp: 0, bv: 0 },
    paid:        { dp: 0, cp: 0, bv: 0 },
    outstanding: { dp: 0, cp: 0, bv: 0 },
    pending:     { dp: 0, cp: 0, bv: 0 },
    consultationFee: fee,
  };
  if (!medicines || !medicines.length) return totals;
  medicines.forEach(med => {
    let dp = 0, cp = 0, bv = 0;
    const p = findProductPrice(med.name);
    if (p) { dp = p.dp; cp = p.cp; bv = p.bv; }
    totals.total.dp += dp; totals.total.cp += cp; totals.total.bv += bv;
    if (med.dispensed) {
      totals.dispensed.dp += dp; totals.dispensed.cp += cp; totals.dispensed.bv += bv;
      if (med.paid) { totals.paid.dp += dp; totals.paid.cp += cp; totals.paid.bv += bv; }
      else { totals.outstanding.dp += dp; totals.outstanding.cp += cp; totals.outstanding.bv += bv; }
    } else {
      totals.pending.dp += dp; totals.pending.cp += cp; totals.pending.bv += bv;
    }
  });
  return totals;
}

/* ── Body systems & recommendation databases (used by ConsultantPortal) ─────── */
export const BODY_SYSTEMS_DATABASE = {
  'Nervous System': {
    symptoms: {
      'Frequent headaches or migraines': 'Include omega-3 fatty acids (fish, flaxseed) in your diet and practice mindfulness meditation daily.',
      'Difficulty concentrating or brain fog': 'Practice deep breathing exercises to improve focus and circulation.',
      'Tingling or numbness in limbs': 'Ensure adequate B-vitamin intake through whole grains, eggs, and leafy greens.'
    }
  },
  'Cardiovascular System': {
    symptoms: {
      'Palpitations or irregular heartbeat': 'Practice relaxation techniques to reduce stress-induced hypertension and engage in light aerobic exercise.',
      'Shortness of breath': 'Engage in aerobic exercise (walking, swimming, cycling) for at least 30 minutes, 4–5 times weekly.',
      'Cold hands and feet or fatigue': 'Eat a balanced diet rich in fruits, vegetables, and healthy fats (olive oil, avocados) to improve circulation.'
    }
  },
  'Digestive System': {
    symptoms: {
      'Bloating and indigestion': 'Eat meals on time and chew slowly to aid digestion.',
      'Constipation or diarrhea': 'Increase fiber and water intake; reduce processed foods.',
      'Loss of appetite or heartburn': 'Avoid late-night eating and use probiotic-rich foods (yogurt, fermented vegetables) to maintain gut health.'
    }
  },
  'Respiratory System': {
    symptoms: {
      'Frequent cough or shortness of breath': 'Practice deep breathing exercises and outdoor walks in clean air.',
      'Chest tightness': 'Avoid smoking and dusty environments; keep indoor air fresh with plants or ventilation.',
      'Low lung endurance': 'Strengthen lungs through light aerobic activity or yoga.'
    }
  },
  'Immune System': {
    symptoms: {
      'Frequent colds or infections': 'Eat immune-boosting foods (citrus fruits, garlic, mushrooms) and sleep adequately.',
      'Slow wound healing': 'Maintain personal hygiene, stay hydrated, and ensure adequate rest.',
      'Allergic reactions or fatigue': 'Exercise moderately to stimulate immune response and avoid chronic stress.'
    }
  },
  'Endocrine System': {
    symptoms: {
      'Weight fluctuations': 'Keep consistent sleep and meal times to stabilize hormones and engage in regular moderate exercise.',
      'Mood swings or irritability': 'Reduce sugar, alcohol, and processed food intake to balance hormones.',
      'Irregular menstruation or libido changes': 'Consume hormone-supportive foods like soy, flaxseed, and whole grains.'
    }
  },
  'Musculoskeletal System': {
    symptoms: {
      'Muscle stiffness or pain': 'Stretch daily and maintain good posture throughout the day.',
      'Joint aches': 'Engage in strength and flexibility training with adequate calcium, magnesium, and vitamin D intake.',
      'Back or neck discomfort': 'Avoid prolonged sitting — stand or walk every hour and maintain proper posture.'
    }
  },
  'Urinary System': {
    symptoms: {
      'Frequent urination or urgency': 'Limit salt and caffeine intake; avoid holding urine for long periods.',
      'Lower back pain': 'Drink 1.5–2 liters of water daily to flush toxins and maintain kidney health.',
      'Swelling in legs or feet': 'Limit salt intake, stay hydrated, and elevate legs when resting.'
    }
  },
  'Reproductive System': {
    symptoms: {
      'Reduced sexual desire': 'Eat zinc- and vitamin E-rich foods (nuts, seeds, eggs) and manage stress through proper rest.',
      'Irregular cycles or erectile issues': 'Exercise to improve circulation and avoid excessive alcohol, smoking, and processed fats.',
      'Hormonal imbalances': 'Ensure proper rest, eat hormone-supportive foods, and maintain a regular exercise routine.'
    }
  },
  'Integumentary System (Skin, Hair, Nails)': {
    symptoms: {
      'Dry or dull skin': 'Drink plenty of water and consume antioxidant-rich foods (berries, green tea).',
      'Hair loss or brittleness': 'Get enough sleep to support skin and hair repair, and ensure adequate protein intake.',
      'Acne or skin sensitivity': 'Keep the skin clean and moisturized; avoid excessive sun exposure and use natural skincare.'
    }
  },
  'Lymphatic System': {
    symptoms: {
      'Swollen lymph nodes': 'Engage in light exercise and massage to improve lymph circulation.',
      'Puffy face or limbs': 'Stay hydrated, avoid heavy oily foods, and include detoxifying foods like lemon and ginger.',
      'Chronic fatigue': 'Maintain proper posture, avoid tight clothing that blocks flow, and get adequate rest.'
    }
  },
  'Sensory System (Eyes, Ears, Nose)': {
    symptoms: {
      'Eye fatigue or blurred vision': 'Take screen breaks every 30–40 minutes and do simple eye relaxation exercises (palming, distant focusing).',
      'Ringing in the ears (tinnitus)': 'Avoid loud noise exposure, maintain ear hygiene, and ensure adequate magnesium intake.',
      'Sensitivity to light or sound': 'Maintain good lighting while working or reading and eat foods rich in vitamin A and lutein (carrots, spinach).'
    }
  }
};

export const RECOMMENDATION_DATABASE = {
  symptoms: {

    /* ── ENERGY & FATIGUE ─────────────────────────────────────── */
    // Dyna Tonic restores vitality; Bee Pollen & Ginseng combat physical/mental fatigue;
    // Alfalfa builds blood; Spirulina provides complete protein & iron; Yeegano adapts the body
    fatigue:           ["DYNA TONIC (780ml)", "BEE POLLEN CAPSULE (100's)", "GINSENG CAPSULE 9 x 10's", "DI LIQUID ALFALFA PLUS GUARANA (500ML)", "SPIRULINA TABLET (100's)", "YEEGANO CAPSULE 90'S"],

    /* ── NEUROLOGICAL ─────────────────────────────────────────── */
    // Ginkgo improves cerebral blood flow; Nutmeg Ointment topical headache relief;
    // Vitamin C helps vascular tension headache; Yeeginkgo tablet form for non-coffee drinkers
    headache:          ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "NUTMEG OINTMENT (2's x 20g)", "YEEGINKGO TABLETS 90'S", "DYNA C- 100 TABLET 150's", "SPIRULINA TABLET (100's)"],

    // Ginkgo dilates cerebral vessels; Circulation Pack improves peripheral flow; Noni anti-inflammatory
    dizziness:         ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "YEEGINKGO TABLETS 90'S", "Blood Circulation Pack", "DI NONI JUICE 1 L", "SPIRULINA TABLET (100's)"],

    // Ginkgo improves retinal/cerebral circulation; Vitamin C supports eye collagen; Spirulina provides lutein precursors
    blurred_vision:    ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "YEEGINKGO TABLETS 90'S", "DYNA C- 100 TABLET 150's", "SPIRULINA TABLET (100's)", "DI NONI JUICE 1 L"],

    // Ginkgo sharpens memory & cerebral circulation; Ginseng regulates acetylcholine; Bee Pollen improves neural nutrition
    confusion:         ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "YEEGINKGO TABLETS 90'S", "GINSENG CAPSULE 9 x 10's", "BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)"],

    /* ── DIGESTIVE & GUT ──────────────────────────────────────── */
    // Ginger (Ginseng Honey Ginger & Soybean with Ginger) are proven anti-emetics; Pro-LSB restores gut flora
    nausea:            ["INSTANT GINSENG HONEY GINGER 500g", "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'", "PRO- LSB TABLET 150's", "DI NONI JUICE 1 L"],

    // Pro-LSB restores microbiome; Gastric Package heals gut lining; High Fiber regulates motility; Noni anti-inflammatory
    digestive_issues:  ["PRO- LSB TABLET 150's", "Gastric Package", "HIGH FIBER NUTRITION FOOD 30'sx25g", "INSTANT GINSENG HONEY GINGER 500g", "DI NONI JUICE 1 L"],

    // High Fiber promotes bowel movement; Pro-LSB softens stool via microbiome; Chlorophyll/Wheatgrass alkalise colon
    constipation:      ["HIGH FIBER NUTRITION FOOD 30'sx25g", "PRO- LSB TABLET 150's", "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ML", "INSTANT WHEATGRASS W/ CHLOROPHYLL 20'S X 10G", "DI NONI JUICE 1 L"],

    // Bee Pollen stimulates appetite enzymes; Dyna Tonic warms digestion; Ginger soothes stomach; Spirulina protein foundation
    loss_appetite:     ["BEE POLLEN CAPSULE (100's)", "DYNA TONIC (780ml)", "INSTANT GINSENG HONEY GINGER 500g", "SPIRULINA TABLET (100's)"],

    /* ── RESPIRATORY & IMMUNE ─────────────────────────────────── */
    // Dyna Tonic is a proven respiratory tonic; Noni and Bee Pollen reduce airway inflammation; Vitamin C immune boost
    cough:             ["DYNA TONIC (780ml)", "DI NONI JUICE 1 L", "INSTANT GINSENG HONEY GINGER 500g", "BEE POLLEN CAPSULE (100's)", "DYNA C- 100 TABLET 150's"],

    // Bee Pollen opens airways; Spirulina phycocyanin reduces inflammation; Dyna Tonic expectorant
    shortness_breath:  ["BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)", "DYNA TONIC (780ml)", "DI NONI JUICE 1 L"],

    // Ganoderma Toothpaste for local throat relief; Ginger honey soothes; Noni antimicrobial; Vitamin C accelerates healing
    sore_throat:       ["GANODERMA TOOTHPASTE (150g)", "INSTANT GINSENG HONEY GINGER 500g", "DI NONI JUICE 1 L", "DYNA C- 100 TABLET 150's", "BEE POLLEN CAPSULE (100's)"],

    // Vitamin C is the primary immune nutrient; Noni has documented immunomodulatory alkaloids; Bee Pollen antiviral flavonoids
    fever:             ["DYNA C- 100 TABLET 150's", "DI NONI JUICE 1 L", "BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)"],

    /* ── MUSCULOSKELETAL ──────────────────────────────────────── */
    // Joint Package is the complete bundle; Dyna S (glucosamine+chondroitin) rebuilds cartilage; Sea Cucumber marine collagen;
    // Nutmeg topical analgesic; Noni reduces systemic inflammation
    joint_pain:        ["Healthy Joints Package", "DYNA 'S' TABLET 120's", "SEA CUCUMBER JELLY (500ml)", "NUTMEG OINTMENT (2's x 20g)", "DI NONI JUICE 1 L"],

    // Sea Cucumber magnesium & minerals relieve cramps; Nutmeg Ointment topical; Goat Milk calcium/electrolytes
    muscle_cramps:     ["SEA CUCUMBER JELLY (500ml)", "NUTMEG OINTMENT (2's x 20g)", "GOAT'S MILK TABLET 150'S", "DYNA 'S' TABLET 120's", "SPIRULINA TABLET (100's)"],

    // Nutmeg Ointment counter-irritant analgesic; Joint Package supports spine; Dyna S cartilage repair; Sea Cucumber anti-inflammatory
    lower_back:        ["NUTMEG OINTMENT (2's x 20g)", "Healthy Joints Package", "DYNA 'S' TABLET 120's", "SEA CUCUMBER JELLY (500ml)"],

    /* ── CARDIOVASCULAR ───────────────────────────────────────── */
    // Circulation Pack is primary; Ginkgo dilates arteries; Yeegarlic (allicin) lowers LDL and platelet aggregation; Noni scopoletin vasodilatory
    chest_pain:        ["Blood Circulation Pack", "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "YEEGARLIC CAPSULE 90'S", "DI NONI JUICE 1 L", "SPIRULINA TABLET (100's)"],

    // Circulation Pack addresses root cause; Sea Cucumber anti-inflammatory; Noni reduces fluid retention
    swelling:          ["Blood Circulation Pack", "SEA CUCUMBER JELLY (500ml)", "DI NONI JUICE 1 L", "NONI PLUS TEA 30's x 3g", "SPIRULINA TABLET (100's)"],

    // Circulation Pack primary; Noni Tea diuretic/renal support; Sea Cucumber anti-inflammatory
    foot_edema:        ["Blood Circulation Pack", "SEA CUCUMBER JELLY (500ml)", "NONI PLUS TEA 30's x 3g", "DI NONI JUICE 1 L"],

    // Yeegarlic allicin proven to lower LDL; High Fiber binds bile acids; Noni reduces oxidised LDL; Green Tea EGCG
    cholesterol:       ["YEEGARLIC CAPSULE 90'S", "HIGH FIBER NUTRITION FOOD 30'sx25g", "DI NONI JUICE 1 L", "GREEN TEA CAPSULE 60'S", "Blood Circulation Pack"],

    /* ── SKIN & HAIR ──────────────────────────────────────────── */
    // E-Vita topical Vit E anti-inflammatory; Noni internal antioxidant; Vitamin C collagen building; Spirulina iron/B-vitamins
    skin_rash:         ["E-VITA CREAM (50g)", "DI NONI JUICE 1 L", "DYNA C- 100 TABLET 150's", "GREEN TEA CAPSULE 60'S", "SPIRULINA TABLET (100's)"],

    // E-Vita primary for dryness; Sea Cucumber marine collagen for elasticity; Collagen+Kacip coffee (women); Vitamin C supports skin barrier
    skin_dryness:      ["E-VITA CREAM (50g)", "SEA CUCUMBER JELLY (500ml)", "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP", "DYNA C- 100 TABLET 150's", "SPIRULINA TABLET (100's)"],

    // Spirulina iron+B12 for follicle health; Bee Pollen amino acids for keratin; Sea Cucumber collagen; Goat Milk calcium
    hair_loss:         ["SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)", "SEA CUCUMBER JELLY (500ml)", "GOAT'S MILK TABLET 150'S", "DYNA C- 100 TABLET 150's"],

    /* ── METABOLIC ────────────────────────────────────────────── */
    // Weight Pack full protocol; High Fiber satiety + blocks fat; Green Tea thermogenic EGCG; Soybean plant protein
    weight_changes:    ["Weight Management Pack", "HIGH FIBER NUTRITION FOOD 30'sx25g", "GREEN TEA CAPSULE 60'S", "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'", "INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g"],

    // Noni Tea reduces uric acid crystallisation; Sea Cucumber anti-inflammatory (holothurin); Detox Package clears urate
    gout_uric:         ["NONI PLUS TEA 30's x 3g", "DI NONI JUICE 1 L", "SEA CUCUMBER JELLY (500ml)", "Cleansing And Detoxification Package"],

    /* ── SLEEP & MENTAL HEALTH ────────────────────────────────── */
    // Gano+Green Tea has L-theanine — calming without sedation; Green Tea Capsule pure EGCG+theanine;
    // Herba Warisan improves women's sleep; Bee Pollen reduces cortisol
    insomnia:          ["INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "GREEN TEA CAPSULE 60'S", "HERBA WARISAN MAHARANI 6 x 10g", "BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)"],

    // Gano+Green Tea L-theanine is calming; Ginseng modulates HPA axis (stress); Bee Pollen adaptogen; Spirulina magnesium
    anxiety:           ["INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "GREEN TEA CAPSULE 60'S", "GINSENG CAPSULE 9 x 10's", "BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)"],

    /* ── LIVER & KIDNEY & DETOX ───────────────────────────────── */
    // Milk Thistle silymarin — the gold standard for liver cell protection and regeneration
    liver_issues:      ["MILK THISTLE TABLET 120's", "Cleansing And Detoxification Package", "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ML", "DI NONI JUICE 1 L", "SPIRULINA TABLET (100's)"],

    // Noni Tea diuretic + reduces renal inflammation; Sea Cucumber traditional kidney tonic; Detox Package full renal cleanse
    kidney_issues:     ["NONI PLUS TEA 30's x 3g", "DI NONI JUICE 1 L", "SEA CUCUMBER JELLY (500ml)", "Cleansing And Detoxification Package"],

    // Detox Package complete; Milk Thistle liver; Chlorophyll binds & eliminates toxins; Wheatgrass alkalises and oxygenates
    detox:             ["Cleansing And Detoxification Package", "MILK THISTLE TABLET 120's", "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ML", "INSTANT WHEATGRASS W/ CHLOROPHYLL 20'S X 10G", "DI NONI JUICE 1 L"],

    /* ── ORAL HEALTH ──────────────────────────────────────────── */
    // Ganoderma Toothpaste — primary; Noni internal antimicrobial; Vitamin C heals gums
    oral_health:       ["GANODERMA TOOTHPASTE (150g)", "DI NONI JUICE 1 L", "DYNA C- 100 TABLET 150's", "SPIRULINA TABLET (100's)"],

    /* ── HORMONAL & REPRODUCTIVE ──────────────────────────────── */
    // Herba Warisan — Dynapharm's dedicated women's cycle formula; Soybean phytoestrogens regulate hormonal rhythm;
    // Collagen+Kacip for hormonal + skin support
    menstrual:         ["HERBA WARISAN MAHARANI 6 x 10g", "Womens Package", "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'", "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP", "DI NONI JUICE 1 L"],

    // Herba Warisan alleviates hot flushes & night sweats; Soybean isoflavones mimic oestrogen; Collagen+Kacip anti-aging; Sea Cucumber bone support
    menopause:         ["HERBA WARISAN MAHARANI 6 x 10g", "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'", "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP", "SEA CUCUMBER JELLY (500ml)", "Womens Package"],

    // Tongkat Ali + Maca — the primary combination for male libido; Ginseng (both genders); Noni supports hormonal balance
    libido:            ["INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'sx21g)", "TONGKAT ALI CAPSULE 100'S", "GINSENG CAPSULE 9 x 10's", "DI NONI JUICE 1 L"],

    // Serenoa (Saw Palmetto) — clinically proven 5α-reductase inhibitor for BPH; Men's Package full protocol; Noni anti-inflammatory
    prostate:          ["DYNA SERENOA TABLET 100's", "Mens Health Package", "DI NONI JUICE 1 L", "NONI PLUS TEA 30's x 3g", "YEEGARLIC CAPSULE 90'S"],

    /* ── BLOOD & NUTRITION ────────────────────────────────────── */
    // Spirulina highest plant source of iron + B12; Alfalfa rich in iron, chlorophyll, folic acid;
    // Dyna Tonic traditional blood tonic; Bee Pollen complete amino acids; Vitamin C enhances iron absorption
    anaemia:           ["SPIRULINA TABLET (100's)", "DI LIQUID ALFALFA PLUS GUARANA (500ML)", "DYNA TONIC (780ml)", "BEE POLLEN CAPSULE (100's)", "DYNA C- 100 TABLET 150's"],
  },

  medicalHistory: {
    // Scopoletin in Noni is a proven vasodilator; Yeegarlic allicin lowers BP; Gano+Green Tea calming anti-hypertensive
    highBloodPressure: ["Blood Circulation Pack", "YEEGARLIC CAPSULE 90'S", "DI NONI JUICE 1 L", "INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "NONI PLUS TEA 30's x 3g", "SPIRULINA TABLET (100's)"],

    // Noni Plus Tea regulates blood sugar; Ginseng improves insulin sensitivity; High Fiber slows glucose absorption; Milk Thistle fixes insulin resistance via liver
    diabetes:          ["NONI PLUS TEA 30's x 3g", "DI NONI JUICE 1 L", "GINSENG CAPSULE 9 x 10's", "HIGH FIBER NUTRITION FOOD 30'sx25g", "MILK THISTLE TABLET 120's", "SPIRULINA TABLET (100's)"],

    // Circulation Pack — primary; Ginkgo prevents clot; Yeegarlic (allicin) anti-platelet; Noni maintains arterial elasticity
    heartDisease:      ["Blood Circulation Pack", "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "YEEGARLIC CAPSULE 90'S", "DI NONI JUICE 1 L", "SPIRULINA TABLET (100's)"],

    // Bee Pollen (paradoxically reduces allergy sensitivity & opens airways); Spirulina anti-inflammatory; Dyna Tonic bronchodilatory; Noni reduces airway cytokines
    asthma:            ["BEE POLLEN CAPSULE (100's)", "DYNA TONIC (780ml)", "SPIRULINA TABLET (100's)", "DI NONI JUICE 1 L", "DYNA C- 100 TABLET 150's"],

    // Gastric Package complete digestive protocol; Pro-LSB essential microbiome restoration; High Fiber bulk/regulate; Ginger soothing
    digestiveDisorders:["Gastric Package", "PRO- LSB TABLET 150's", "HIGH FIBER NUTRITION FOOD 30'sx25g", "INSTANT GINSENG HONEY GINGER 500g", "DI NONI JUICE 1 L"],

    // Spirulina provides iodine + selenium for thyroid; Detox Package removes goitrogenic toxins; Milk Thistle aids thyroid hormone conversion (T4→T3 via liver)
    thyroid:           ["Cleansing And Detoxification Package", "SPIRULINA TABLET (100's)", "MILK THISTLE TABLET 120's", "SEA CUCUMBER JELLY (500ml)"],

    // Milk Thistle silymarin — gold standard hepatoprotective; Detox Package; Chlorophyll alkalises and binds toxins; Noni Tea renal cleanse
    kidneyLiver:       ["MILK THISTLE TABLET 120's", "Cleansing And Detoxification Package", "NONI PLUS TEA 30's x 3g", "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ML", "DI NONI JUICE 1 L"],

    // Bee Pollen is the most complete energy food; Ginseng HPA axis adaptogen; Dyna Tonic; Alfalfa iron & B-vitamins; Yeegano Ganoderma adaptogen
    chronicFatigue:    ["BEE POLLEN CAPSULE (100's)", "GINSENG CAPSULE 9 x 10's", "DYNA TONIC (780ml)", "DI LIQUID ALFALFA PLUS GUARANA (500ML)", "YEEGANO CAPSULE 90'S", "SPIRULINA TABLET (100's)"],

    // Joint Package complete; Dyna S (glucosamine+chondroitin) primary; Sea Cucumber marine collagen + saponins; Nutmeg Ointment topical; Noni systemic anti-inflammatory
    arthritis:         ["Healthy Joints Package", "DYNA 'S' TABLET 120's", "SEA CUCUMBER JELLY (500ml)", "NUTMEG OINTMENT (2's x 20g)", "DI NONI JUICE 1 L"],

    // E-Vita cream topical; Noni antifungal + antibacterial internally; Vitamin C collagen heals skin; Green Tea EGCG anti-inflammatory
    skinConditions:    ["E-VITA CREAM (50g)", "DI NONI JUICE 1 L", "DYNA C- 100 TABLET 150's", "GREEN TEA CAPSULE 60'S", "Cleansing And Detoxification Package"],

    // Ginkgo+Ginseng cognitive; Gano+Green Tea calming/stress; Bee Pollen neural nutrition; Spirulina magnesium
    mentalHealth:      ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "GINSENG CAPSULE 9 x 10's", "BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)"],

    // Detox Package clears accumulated immune complexes; Noni immunomodulatory (proxeronine); Sea Cucumber anti-inflammatory saponins
    autoimmune:        ["Cleansing And Detoxification Package", "DI NONI JUICE 1 L", "SEA CUCUMBER JELLY (500ml)", "SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)"],

    // Spirulina phycocyanin anti-cancer; Noni xeronine supports cell repair; Milk Thistle liver protection (chemo support); Green Tea EGCG documented anti-cancer
    cancer:            ["SPIRULINA TABLET (100's)", "DI NONI JUICE 1 L", "MILK THISTLE TABLET 120's", "GREEN TEA CAPSULE 60'S", "Cleansing And Detoxification Package"],

    // Ginkgo prevents clot reformation; Circulation Pack maintains blood flow; Yeegarlic anti-platelet; Spirulina iron
    stroke:            ["Blood Circulation Pack", "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "YEEGINKGO TABLETS 90'S", "YEEGARLIC CAPSULE 90'S", "SPIRULINA TABLET (100's)"],

    // Yeegarlic allicin #1 natural LDL-lowering; High Fiber binds bile acids; Green Tea EGCG; Noni reduces oxidised LDL
    highCholesterol:   ["YEEGARLIC CAPSULE 90'S", "HIGH FIBER NUTRITION FOOD 30'sx25g", "GREEN TEA CAPSULE 60'S", "DI NONI JUICE 1 L", "Blood Circulation Pack"],

    // Noni Tea reduces uric acid crystallisation; Sea Cucumber anti-inflammatory; Detox Package clears urate; Noni reduces purine inflammation
    gout:              ["NONI PLUS TEA 30's x 3g", "DI NONI JUICE 1 L", "SEA CUCUMBER JELLY (500ml)", "Cleansing And Detoxification Package"],

    // Weight Pack comprehensive; High Fiber caloric dilution + satiety; Green Tea thermogenic; Soybean plant protein reduces cravings
    obesity:           ["Weight Management Pack", "HIGH FIBER NUTRITION FOOD 30'sx25g", "GREEN TEA CAPSULE 60'S", "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'"],

    // Spirulina highest plant iron + B12; Alfalfa iron, folic acid, chlorophyll; Dyna Tonic blood tonic; Vitamin C enhances iron absorption
    anaemia:           ["SPIRULINA TABLET (100's)", "DI LIQUID ALFALFA PLUS GUARANA (500ML)", "DYNA TONIC (780ml)", "BEE POLLEN CAPSULE (100's)", "DYNA C- 100 TABLET 150's"],

    // Goat Milk bioavailable calcium; Sea Cucumber Type I collagen + glucosamine for bone matrix; Soybean isoflavones preserve bone density; Joint Package
    osteoporosis:      ["GOAT'S MILK TABLET 150'S", "SEA CUCUMBER JELLY (500ml)", "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'", "Healthy Joints Package", "DYNA 'S' TABLET 120's"],
  },

  gender: {
    // Women's Package complete; Collagen+Kacip for skin & hormonal; Herba Warisan for cycle health; Sea Cucumber collagen
    female: ["Womens Package", "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP", "HERBA WARISAN MAHARANI 6 x 10g", "SEA CUCUMBER JELLY (500ml)"],
    // Men's Package complete; Tongkat Ali capsule (stronger) testosterone; Serenoa prostate; Tongkat+Maca coffee for energy+libido
    male:   ["Mens Health Package", "TONGKAT ALI CAPSULE 100'S", "DYNA SERENOA TABLET 100's", "INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'sx21g)"],
  },

  lifestyle: {
    // L-theanine in Gano+Green Tea for sleep onset; Green Tea Capsule concentrated; Bee Pollen reduces cortisol; Spirulina magnesium
    poorSleep:    ["INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "GREEN TEA CAPSULE 60'S", "BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)"],
    // Gano+Green Tea calms HPA axis; Ginseng adaptogen; Bee Pollen; Spirulina magnesium reduces cortisol
    highStress:   ["INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "GINSENG CAPSULE 9 x 10's", "BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)"],
    // Circulation Pack — sedentary lifestyle causes pooling; Alfalfa blood building; Spirulina
    lowExercise:  ["Blood Circulation Pack", "DI LIQUID ALFALFA PLUS GUARANA (500ML)", "SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)"],
    // High Fiber needs water to work; Chlorophyll alkalises; Noni Tea kidney flush; Spirulina requires hydration
    poorWater:    ["HIGH FIBER NUTRITION FOOD 30'sx25g", "NONI PLUS TEA 30's x 3g", "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ML", "SPIRULINA TABLET (100's)"],
    // Vitamin C (fruit equivalent); Noni antioxidant; Bee Pollen; Spirulina micronutrient density
    lowFruitVeg:  ["DYNA C- 100 TABLET 150's", "DI NONI JUICE 1 L", "SPIRULINA TABLET (100's)", "INSTANT WHEATGRASS W/ CHLOROPHYLL 20'S X 10G"],
  },

  age: {
    // Ginkgo cognitive protection; Yeeginkgo tablet option; Sea Cucumber joint + skin collagen; Dyna S cartilage; Spirulina complete protein
    elderly:    ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "YEEGINKGO TABLETS 90'S", "SEA CUCUMBER JELLY (500ml)", "DYNA 'S' TABLET 120's", "SPIRULINA TABLET (100's)"],
    // Gano+Green Tea oxidative stress; Bee Pollen cellular repair; Spirulina baseline nutrition; Circulation Pack preventive
    middleAge:  ["INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "BEE POLLEN CAPSULE (100's)", "SPIRULINA TABLET (100's)", "Blood Circulation Pack"],
  },

  general: ["SPIRULINA TABLET (100's)", "DYNA C- 100 TABLET 150's", "BEE POLLEN CAPSULE (100's)", "DI NONI JUICE 1 L"],
};

export const PRICE_LIST = [];

/**
 * buildCatalogFromPriceList — The single function used by the public shop
 * and distributor portal to build their product catalog.
 *
 * Only products present in the GM price list (product_prices table) appear.
 * DB product metadata (images, category, SKU) is merged in where available.
 * Products with no DP price are excluded (GM hasn't priced them).
 *
 * @param {Array} priceData  — response from GET /api/prices
 * @param {Array} prodData   — response from GET /api/products (optional, for images/category)
 * @returns {Array}          — display-ready product objects
 */
export function buildCatalogFromPriceList(priceData, prodData = []) {
  const priceList = (Array.isArray(priceData) ? priceData : []).filter(p => !p.is_package);
  const dbProds   = Array.isArray(prodData) ? prodData : prodData?.products || [];

  const dbByName = new Map(
    dbProds.map(p => [(p.name || p.description || '').toUpperCase().trim(), p])
  );

  return priceList
    .map(p => {
      const key = (p.description || '').toUpperCase().trim();
      const db  = dbByName.get(key);
      return {
        id:          db?.id || String(p.id),
        name:        p.description,
        description: db?.description || p.description,
        category:    db?.category || 'General',
        images:      db?.images   || [],
        dp:          Number(p.dp)  || 0,
        cp:          Number(p.cp)  || 0,
        cif:         Number(p.cif) || 0,
        bv:          Number(p.bv)  || 0,
        hasPricing:  true,
        sku:         db?.sku || '',
      };
    })
    .filter(p => p.dp > 0 || p.cp > 0);
}
