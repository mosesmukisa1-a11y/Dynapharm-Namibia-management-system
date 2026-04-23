/**
 * pricing.js — Client-side pricing helpers.
 *
 * Single source of truth for product prices is the GM Price List (product_prices table).
 * Every portal calls setLivePrices(data) on load via GET /api/prices.
 * getLiveProductList() returns [] until prices are loaded — never falls back to
 * hardcoded data, ensuring all figures always match the live database.
 */

let _livePrices = null;

export function setLivePrices(prices) {
  if (Array.isArray(prices) && prices.length > 0) {
    _livePrices = prices.map(p => ({
      id:          p.id,
      description: p.description,
      dp:          Number(p.dp)  || 0,
      cp:          Number(p.cp)  || 0,
      cif:         Number(p.cif) || 0,
      bv:          Number(p.bv)  || 0,
    }));
  }
}

export function getLiveProductList() {
  return _livePrices || [];
}

export function pricesLoaded() {
  return _livePrices !== null && _livePrices.length > 0;
}

export function findProductPrice(productName) {
  if (!productName) return null;
  const list = getLiveProductList();
  if (!list.length) return null;
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
      ? (item.memberPrice != null ? item.memberPrice : (item.dp || item.price || 0))
      : (item.cp || item.price || 0);
    const lineTotal = price * item.qty;
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
  return Object.entries(PACKAGE_DATABASE).map(([name, pkg], idx) => {
    const liveOverride = liveList.find(p => p.description?.toLowerCase() === name.toLowerCase());
    return {
      id:          `pkg-${idx}-${name.replace(/\s+/g, '-').toLowerCase()}`,
      name,
      description: name,
      dp:          liveOverride ? Number(liveOverride.dp)  || pkg.price.dp  : pkg.price.dp,
      cp:          liveOverride ? Number(liveOverride.cp)  || pkg.price.cp  : pkg.price.cp,
      bv:          liveOverride ? Number(liveOverride.bv)  || pkg.price.bv  : pkg.price.bv,
      cif:         0,
      price:       liveOverride ? Number(liveOverride.cp)  || pkg.price.cp  : pkg.price.cp,
      isPackage:   true,
      components:  pkg.products,
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
    const isPackage = PACKAGE_DATABASE[med.name];
    let dp = 0, cp = 0, bv = 0;
    if (isPackage) {
      dp = isPackage.price.dp; cp = isPackage.price.cp; bv = isPackage.price.bv;
    } else {
      const p = findProductPrice(med.name);
      if (p) { dp = p.dp; cp = p.cp; bv = p.bv; }
    }
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
    fatigue:          ["SPIRULINA TABLET (100's)", "DYNA TONIC (780ml)", "BEE POLLEN CAPSULE (100's)", "GINSENG CAPSULE 9 x 10's", "Yeeginako Tabs 90's , 30's"],
    headache:         ["DYNA C- 100 TABLET 150's", "SPIRULINA TABLET (100's)", "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "NUTMEG OINTMENT (2's x 20g)"],
    nausea:           ["INSTANT GINSENG HONEY GINGER 500g", "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'", "DI NONI JUICE 1 L", "SPIRULINA TABLET (100's)"],
    dizziness:        ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)"],
    shortness_breath: ["SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)", "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g"],
    blurred_vision:   ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "DYNA C- 100 TABLET 150's", "SPIRULINA TABLET (100's)"],
    joint_pain:       ['Healthy Joints Package', "NUTMEG OINTMENT (2's x 20g)", "DYNA 'S' TABLET 120's", "SEA CUCUMBER JELLY (500ml)"],
    cough:            ["DYNA TONIC (780ml)", "DI NONI JUICE 1 L", "SPIRULINA TABLET (100's)"],
    digestive_issues: ["SPIRULINA TABLET (100's)", "PRO- LSB TABLET 150's", 'Gastric Package', "HIGH FIBER NUTRITION FOOD 30'sx25g"],
    loss_appetite:    ["SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)", "DYNA TONIC (780ml)"],
    fever:            ["DYNA C- 100 TABLET 150's", "SPIRULINA TABLET (100's)", "DI NONI JUICE 1 L"],
    sore_throat:      ["GANODERMA TOOTHPASTE (150g)", "DI NONI JUICE 1 L", "DYNA C- 100 TABLET 150's"],
    skin_rash:        ["E-VITA CREAM (50g)", "SPIRULINA TABLET (100's)", "DYNA C- 100 TABLET 150's"],
    chest_pain:       ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", 'Blood Circulation Pack', "DI NONI JUICE 1 L"],
    lower_back:       ["NUTMEG OINTMENT (2's x 20g)", 'Healthy Joints Package', "SEA CUCUMBER JELLY (500ml)"],
    weight_changes:   ['Weight Management Pack', "SPIRULINA TABLET (100's)", "HIGH FIBER NUTRITION FOOD 30'sx25g"],
    insomnia:         ["INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "SPIRULINA TABLET (100's)", "HERBA WARISAN MAHARANI 6 x 10g"],
    confusion:        ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)"],
    foot_edema:       ['Blood Circulation Pack', "SPIRULINA TABLET (100's)"],
    swelling:         ['Blood Circulation Pack', "SPIRULINA TABLET (100's)", "SEA CUCUMBER JELLY (500ml)"]
  },
  medicalHistory: {
    highBloodPressure: ['Blood Circulation Pack', "SPIRULINA TABLET (100's)", "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "DI NONI JUICE 1 L"],
    diabetes:          ["SPIRULINA TABLET (100's)", "DI NONI JUICE 1 L", "NONI PLUS TEA 30's x 3g", 'Cleansing And Detoxification Package'],
    heartDisease:      ['Blood Circulation Pack', "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "SPIRULINA TABLET (100's)", "DI NONI JUICE 1 L"],
    asthma:            ["SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)", "DI NONI JUICE 1 L"],
    digestiveDisorders:['Gastric Package', "SPIRULINA TABLET (100's)", "PRO- LSB TABLET 150's", "HIGH FIBER NUTRITION FOOD 30'sx25g"],
    thyroid:           ["SPIRULINA TABLET (100's)", 'Cleansing And Detoxification Package', "SEA CUCUMBER JELLY (500ml)"],
    kidneyLiver:       ['Cleansing And Detoxification Package', "SPIRULINA TABLET (100's)", "MILK THISTLE TABLET 120's"],
    chronicFatigue:    ["SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)", "DYNA TONIC (780ml)", "GINSENG CAPSULE 9 x 10's"],
    arthritis:         ['Healthy Joints Package', "NUTMEG OINTMENT (2's x 20g)", "SEA CUCUMBER JELLY (500ml)", "SPIRULINA TABLET (100's)"],
    skinConditions:    ["E-VITA CREAM (50g)", "SPIRULINA TABLET (100's)", "DYNA C- 100 TABLET 150's", 'Cleansing And Detoxification Package'],
    mentalHealth:      ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "SPIRULINA TABLET (100's)", "INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g"],
    autoimmune:        ["SPIRULINA TABLET (100's)", 'Cleansing And Detoxification Package', "DI NONI JUICE 1 L"],
    cancer:            ["SPIRULINA TABLET (100's)", "DI NONI JUICE 1 L", 'Blood Circulation Pack']
  },
  gender: {
    female: ['Womens Package', "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP", "HERBA WARISAN MAHARANI 6 x 10g"],
    male:   ['Mens Health Package', "INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'sx21g)", "DYNA SERENOA TABLET 100's"]
  },
  lifestyle: {
    poorSleep:    ["INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", "HERBA WARISAN MAHARANI 6 x 10g", "SPIRULINA TABLET (100's)"],
    highStress:   ["INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", "SPIRULINA TABLET (100's)", "INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g"],
    lowExercise:  ["SPIRULINA TABLET (100's)", "BEE POLLEN CAPSULE (100's)", 'Blood Circulation Pack'],
    poorWater:    ["HIGH FIBER NUTRITION FOOD 30'sx25g", "SPIRULINA TABLET (100's)"]
  },
  age: {
    elderly: ['Womens Package', 'Mens Health Package', "SPIRULINA TABLET (100's)", "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g"]
  },
  general: ["SPIRULINA TABLET (100's)", "DYNA C- 100 TABLET 150's", "BEE POLLEN CAPSULE (100's)"]
};

export const PRICE_LIST = [];
