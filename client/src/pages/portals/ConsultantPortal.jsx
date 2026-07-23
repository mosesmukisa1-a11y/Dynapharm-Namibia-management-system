import { useState, useEffect, useCallback, useRef, Component } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, formatDate, BRANCHES, BRANCH_DETAILS, COMPANY_INFO, getBranchId } from '../../lib/constants';
import { PACKAGE_DATABASE, BODY_SYSTEMS_DATABASE, RECOMMENDATION_DATABASE, findProductPrice, getLiveProductList, setLivePrices } from '../../lib/pricing';
import { Button, Input, Badge, LoadingSpinner, Modal, Alert, Textarea } from '../../components/ui';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', textAlign: 'center', color: '#991b1b' }}>
          <p style={{ fontWeight: 600, marginBottom: '10px' }}>Something went wrong loading this section.</p>
          <button onClick={() => this.setState({ hasError: false })} style={{ padding: '8px 18px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ConsultantPortal() {
  const [activeSection, setActiveSection] = useState('checkups');
  const [refreshKey, setRefreshKey] = useState(0);
  const navItems = [
    { id: 'checkups', label: 'Checkup Forms' },
    { id: 'clients', label: 'Clients' },
    { id: 'reports', label: 'Reports' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'training', label: '🎓 Training' },
    { id: 'staff', label: 'Staff Services' },
    { id: 'messages', label: '📨 My Messages' },
  ];

  const handleRefreshData = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)', borderRadius: '16px', padding: '28px 32px', marginBottom: '28px', color: '#fff', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <img src={COMPANY_INFO.logo} alt="Dynapharm" style={{ height: '52px', background: '#fff', borderRadius: '10px', padding: '6px' }} onError={e => { e.target.style.display = 'none'; }} />
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Consultant Portal</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.95rem' }}>Client management, checkup forms & reports</p>
        </div>
        <button onClick={handleRefreshData} style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', padding: '8px 18px', fontSize: '0.9rem', cursor: 'pointer' }}>Refresh Data</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px', borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            style={{
              padding: '10px 20px',
              fontSize: '0.95rem',
              fontWeight: 600,
              border: 'none',
              background: 'none',
              color: activeSection === item.id ? '#c41e3a' : '#64748b',
              borderBottom: activeSection === item.id ? '3px solid #c41e3a' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div>
        <ErrorBoundary key={`eb-${activeSection}-${refreshKey}`}>
          {activeSection === 'checkups' && <CheckupsSection key={`chk-${refreshKey}`} />}
          {activeSection === 'clients' && <ClientsSection key={`cli-${refreshKey}`} />}
          {activeSection === 'reports' && <ReportsSection key={`rep-${refreshKey}`} />}
          {activeSection === 'followups' && <FollowupsSection key={`fol-${refreshKey}`} />}
          {activeSection === 'analytics' && <AnalyticsSection key={`ana-${refreshKey}`} />}
          {activeSection === 'training' && <ConsultantTrainingSection key={`trn-${refreshKey}`} />}
          {activeSection === 'staff' && <StaffServicesSection key={`stf-${refreshKey}`} />}
          {activeSection === 'messages' && <StaffMessagesTab accentColor="#c41e3a" />}
        </ErrorBoundary>
      </div>
    </div>
  );
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function calcAge(dob) {
  if (!dob) return '';
  try {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age > 0 && age < 130 ? String(age) : '';
  } catch { return ''; }
}

/* Health benefits of each Dynapharm product — used to explain AI recommendations */
const PRODUCT_HEALTH_BENEFITS = {

  /* ── Core Nutritional Supplements ── */
  "SPIRULINA TABLET (100's)":    "60–70% complete protein with all essential amino acids, plus iron, B12, beta-carotene and phycocyanin — the richest plant source of iron, boosting red blood cell production, immunity, energy and cellular detoxification. Ideal for anaemia, fatigue, immune weakness and nutritional deficiency.",
  "BEE POLLEN CAPSULE (100's)":  "Nature's most complete food — contains 22 amino acids, 27 vitamins, 28 minerals, digestive enzymes and anti-inflammatory flavonoids. Enhances stamina, stimulates appetite, supports respiratory health, strengthens immunity and provides sustained all-day energy without stimulants.",
  "DYNA TONIC (780ml)":          "Premium traditional herbal energy tonic formulated to restore vitality, improve blood circulation, relieve chronic cough and respiratory weakness, stimulate appetite and replenish depleted energy. Particularly effective for post-illness recovery, anaemia and seasonal fatigue.",
  "GINSENG CAPSULE 9 x 10's":    "Panax ginseng with standardised ginsenosides — the premier adaptogen for combating mental and physical fatigue, sharpening concentration and working memory, improving insulin sensitivity (beneficial in diabetes), regulating cortisol and building physical endurance over time.",
  "YEEGANO CAPSULE 90'S":        "Ganoderma lucidum (Reishi mushroom) capsules — immune-modulating beta-glucans and triterpenoids adapt the body to physical and emotional stress, reduce inflammation, regulate blood pressure and provide deep restorative support for the nervous and immune systems.",

  /* ── Brain, Circulation & Cognitive Health ── */
  "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g": "Ginkgo biloba + Panax ginseng in a convenient coffee format — Ginkgo is the gold standard for cerebral vasodilation, sharpening memory, reducing brain fog, relieving vertigo and tinnitus, improving retinal circulation (blurred vision) and protecting neurons. Ginseng boosts cognitive energy. Ideal for memory loss, dizziness, concentration and early cognitive decline.",
  "YEEGINKGO TABLETS 90'S":      "Pure Ginkgo biloba extract tablets — for clients who prefer not to consume coffee. Dilates cerebral and peripheral blood vessels, improves oxygen delivery to the brain, relieves vertigo, headaches, tinnitus and visual disturbances. Proven to slow progression of age-related cognitive decline.",
  "YEEGARLIC CAPSULE 90'S":      "Concentrated garlic (Allium sativum) extract — allicin lowers LDL cholesterol and total cholesterol, reduces platelet aggregation (anti-clotting), lowers blood pressure (ACE inhibitory), fights bacterial and viral infections and supports liver function. A natural cardiovascular protector.",

  /* ── Cardiovascular & Circulation ── */
  "Blood Circulation Pack":      "Comprehensive cardiovascular bundle — improves blood flow, reduces viscosity, supports arterial elasticity, lowers clotting risk and enhances peripheral circulation. Designed for hypertension, heart disease, cold extremities, varicose veins and post-stroke recovery.",

  /* ── Digestive Health ── */
  "PRO- LSB TABLET 150's":       "Multi-strain probiotic formula — restores the gut microbiome after antibiotic use or illness, relieves IBS, bloating, constipation and chronic diarrhoea, strengthens the intestinal immune barrier (70% of immunity is gut-based) and improves nutrient absorption. The foundation of gut health.",
  "HIGH FIBER NUTRITION FOOD 30'sx25g": "Combined soluble and insoluble dietary fibre supplement — soluble fibre binds LDL cholesterol and slows glucose absorption (excellent for diabetes and high cholesterol), while insoluble fibre promotes regular bowel movement, prevents constipation and supports colon health. Also provides satiety for weight management.",
  "INSTANT GINSENG HONEY GINGER 500g": "Ginger is one of the most clinically proven anti-emetics — relieves nausea, motion sickness, morning sickness and gastric discomfort. Honey soothes the throat and mucosal lining. Ginseng provides immune support. Ideal for digestive complaints, sore throat and cold and flu recovery.",
  "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'": "Soy isoflavones (phytoestrogens) naturally mimic oestrogen — reducing menopausal hot flushes, regulating hormonal cycles and protecting bone density. Soy protein lowers LDL cholesterol. Ginger eases digestive discomfort. Excellent for menopause, PMS, hormonal imbalance and cholesterol management.",
  "Gastric Package":             "Complete digestive healing bundle — targets gastric ulcer, GERD, chronic indigestion and irritable bowel syndrome. Heals and seals the gut lining, restores beneficial bacteria, reduces acid and promotes long-term gastrointestinal wellness.",

  /* ── Immune, Respiratory & Anti-Viral ── */
  "DI NONI JUICE 1 L":           "Morinda citrifolia juice — contains proxeronine (converts to xeronine, which repairs cell receptors), scopoletin (vasodilatory and anti-inflammatory), anthraquinones (antimicrobial) and damnacanthal (anti-cancer). Documented benefits include immune modulation, blood pressure reduction, blood sugar regulation, liver support, anti-inflammation, kidney health and general disease prevention. One of the most versatile wellness products in the range.",
  "DYNA C- 100 TABLET 150's":    "High-potency Vitamin C 100mg — essential for collagen synthesis (skin, joints, gums, blood vessels), iron absorption (critical for anaemia), immune cell production (neutrophils and lymphocytes), adrenal function under stress and powerful antioxidant protection against free radical damage. Accelerates wound healing and reduces duration of common colds.",

  /* ── Joint & Musculoskeletal Health ── */
  "Healthy Joints Package":      "The complete joint rehabilitation bundle — combines glucosamine/chondroitin for cartilage rebuilding, marine collagen for lubrication, anti-inflammatory agents and topical pain relief. Clinically addresses osteoarthritis, rheumatoid arthritis, sports injuries, knee pain and general musculoskeletal degeneration.",
  "DYNA 'S' TABLET 120's":       "Glucosamine sulphate + chondroitin sulphate — the two most clinically validated compounds for osteoarthritis. Glucosamine stimulates new cartilage synthesis while chondroitin inhibits cartilage-destroying enzymes. Together they rebuild joint cartilage, improve lubrication and reduce chronic knee, hip and spinal joint pain. Requires 8–12 weeks of consistent use.",
  "SEA CUCUMBER JELLY (500ml)":  "Marine sea cucumber contains Type I collagen, chondroitin sulphate, glucosamine and holothurin (saponin with powerful anti-inflammatory properties). Promotes cartilage repair, joint lubrication, skin elasticity and collagen density. Also supports kidney health (traditional use) and wound healing. Holothurin inhibits cancer cell growth in studies.",
  "NUTMEG OINTMENT (2's x 20g)": "Topical analgesic containing myristicin and eugenol — applied directly to painful joints, muscles, the lower back or temples. Works as a counter-irritant, increasing local circulation and reducing inflammation on contact. Provides fast relief for arthritis, muscle pain, sports injuries and tension headaches.",
  "GOAT'S MILK TABLET 150'S":    "Goat's milk is highly bioavailable — easier to digest than cow's milk, rich in calcium, phosphorus, magnesium, vitamin D and complete protein. Supports bone density (osteoporosis prevention), muscle health, electrolyte balance and provides excellent nutrition for those with dairy sensitivities.",

  /* ── Liver & Detoxification ── */
  "MILK THISTLE TABLET 120's":   "Silymarin (silibinin) from milk thistle — the world's most researched hepatoprotective compound. Protects liver cells from toxin damage, stimulates regeneration of new liver cells, reduces liver enzyme levels (ALT/AST) in hepatitis and fatty liver, supports bile production and provides antioxidant defence. Essential for liver disease, alcohol damage, medication toxicity and general liver health.",
  "Cleansing And Detoxification Package": "Comprehensive full-body detoxification protocol — targets the liver, kidneys, colon and lymphatic system simultaneously. Eliminates accumulated environmental toxins, heavy metals, pesticide residues and metabolic waste. Restores systemic clarity, energy and immune function.",
  "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ML": "Liquid chlorophyll (structurally similar to haemoglobin) — oxygenates the blood, alkalises the body, binds and helps eliminate environmental toxins, deodorises from within and provides gentle energy from guarana. Excellent for detox protocols, blood building, digestive health and chronic fatigue.",
  "INSTANT WHEATGRASS W/ CHLOROPHYLL 20'S X 10G": "Young wheatgrass is one of the most alkaline, nutrient-dense foods — contains chlorophyll, vitamins A/C/E, B-vitamins, iron, calcium, selenium and enzymes. Alkalises the body, supports liver function, boosts red blood cell production, aids detoxification and provides deep cellular nutrition.",
  "DI LIQUID ALFALFA PLUS GUARANA (500ML)": "Alfalfa (Medicago sativa) — the most mineral-rich plant known, containing bioavailable iron, folic acid, calcium, vitamins K and D, and complete amino acids. Excellent for iron-deficiency anaemia, bone density, alkalising the body and natural energy. Guarana provides sustained mental alertness.",

  /* ── Sleep, Stress & Mental Wellbeing ── */
  "INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g": "Ganoderma (Reishi) + green tea L-theanine — the most calming combination in the range. L-theanine promotes alpha brain waves (calm focus without drowsiness), reduces cortisol and anxiety, while Ganoderma modulates the immune system, lowers blood pressure and reduces chronic stress. Ideal for insomnia, anxiety, stress and mood imbalance.",
  "GREEN TEA CAPSULE 60'S":      "Concentrated EGCG (epigallocatechin gallate) from green tea — the most potent natural antioxidant studied against cancer, cardiovascular disease and inflammation. L-theanine induces calm focus and better sleep. Thermogenic effect supports weight management. Lowers LDL cholesterol and stabilises blood sugar. Ideal for stress, anxiety, weight, cholesterol and cancer prevention.",

  /* ── Women's Health ── */
  "Womens Package":              "Comprehensive women's wellness bundle — addresses hormonal balance across all life stages (reproductive, perimenopausal, post-menopausal), supports bone density, skin elasticity, reproductive health and energy. Includes products specifically chosen for feminine health needs.",
  "HERBA WARISAN MAHARANI 6 x 10g": "Dynapharm's premium women's herbal formula — regulates oestrogen and progesterone balance, relieves PMS symptoms (cramps, mood swings, bloating), normalises irregular menstrual cycles, reduces menopausal hot flushes and night sweats, improves sleep quality and supports overall feminine vitality and reproductive wellness.",
  "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP": "Kacip Fatimah (Labisia pumila) — a powerful phytoestrogenic herb that regulates female hormones, enhances feminine vitality, improves vaginal health and supports bone density post-menopause. Combined with Type I/III collagen for skin elasticity and anti-ageing, and Ganoderma for immune support. The premium choice for women's anti-ageing and hormonal wellness.",

  /* ── Men's Health ── */
  "Mens Health Package":         "Comprehensive men's vitality bundle — addresses testosterone decline, prostate health, physical endurance, libido, muscle maintenance and masculine well-being. A complete programme for men at every life stage.",
  "INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'sx21g)": "Tongkat Ali (Eurycoma longifolia) stimulates LH (luteinising hormone), naturally raising free testosterone levels and improving sperm quality. Maca (Lepidium meyenii) is a proven adaptogen that enhances libido in both men and women, improves physical endurance, reduces stress-related testosterone suppression and supports fertility. The most effective natural male vitality combination.",
  "TONGKAT ALI CAPSULE 100'S":   "Concentrated Tongkat Ali (Eurycoma longifolia) extract — clinically shown to raise free testosterone by up to 37%, improve sperm motility and count, enhance sexual desire, build muscle mass, reduce cortisol-driven testosterone suppression and combat low energy in men. Stronger single-ingredient option for men with significant testosterone concerns.",
  "DYNA SERENOA TABLET 100's":   "Saw palmetto (Serenoa repens) 5α-reductase inhibitor — blocks the conversion of testosterone to DHT, the hormone responsible for prostate enlargement (BPH) and male pattern baldness. Clinically proven to reduce urinary frequency, urgency and incomplete bladder emptying associated with BPH. The natural alternative to pharmaceutical prostate medications.",

  /* ── Blood Sugar & Uric Acid ── */
  "NONI PLUS TEA 30's x 3g":     "Noni herbal tea — rich in antioxidants and anti-inflammatory compounds specifically beneficial for blood sugar regulation (reduces glucose spikes post-meal), uric acid reduction (prevents gout crystallisation), kidney cleansing (mild diuretic), immune support and general anti-inflammatory wellness. Excellent for gout, diabetes and kidney health.",

  /* ── Oral & Skin Health ── */
  "GANODERMA TOOTHPASTE (150g)": "Reishi (Ganoderma) infused toothpaste — antibacterial polysaccharides reduce oral bacteria, prevent plaque formation, reduce gum inflammation (gingivitis/periodontitis), soothe mouth ulcers and promote overall oral mucosal health. Fluoride-free. Can also be gargled for sore throat relief.",
  "E-VITA CREAM (50g)":          "Pure Vitamin E (tocopherol) cream — the most effective topical treatment for dry, damaged and inflamed skin. Vitamin E is a fat-soluble antioxidant that deeply repairs the lipid skin barrier, reduces redness in eczema and dermatitis, fades post-inflammatory hyperpigmentation (acne scars), prevents sun damage and promotes new skin cell formation. Suitable for all skin types.",

  /* ── Packages ── */
  "Weight Management Pack":      "Complete metabolic support programme — combines appetite regulation, fat metabolism enhancement, high-fibre nutrition for glucose stability, thermogenic metabolism boosting and complete plant protein for muscle preservation during weight loss. A structured, sustainable approach to healthy weight management.",
};

/* keyword map: symptom text fragment → RECOMMENDATION_DATABASE symptom key
   Order matters — more specific entries go before broader ones */
const SYMPTOM_KEYWORD_MAP = [
  /* ── Energy & Fatigue ── */
  { keys: ['fatigue','tired','exhaustion','lethargy','weak','weakness','no energy','low energy'], rec: 'fatigue' },

  /* ── Neurological ── */
  { keys: ['headache','migraine','head pain','head ache','tension headache'], rec: 'headache' },
  { keys: ['dizzy','dizziness','vertigo','lightheaded','giddy','spinning'], rec: 'dizziness' },
  { keys: ['vision','blurred','eye strain','eyesight','eye fatigue','poor sight'], rec: 'blurred_vision' },
  { keys: ['memory','brain fog','concentration','focus','cognitive','forgetful','confusion','alzheimer','dementia','mental clarity'], rec: 'confusion' },
  { keys: ['tinnitus','ringing in ear','ear noise'], rec: 'dizziness' },

  /* ── Digestive & Gut ── */
  { keys: ['nausea','vomit','sick to stomach','morning sickness','queasy'], rec: 'nausea' },
  { keys: ['constipat','irregular bowel','bowel movement','no bowel'], rec: 'constipation' },
  { keys: ['bloat','indigestion','heartburn','gastric','ulcer','ibs','stomach pain','stomach ache','loose stool','diarrhea','stomach upset'], rec: 'digestive_issues' },
  { keys: ['appetite','hunger','anorexia','not eating'], rec: 'loss_appetite' },

  /* ── Respiratory & Immune ── */
  { keys: ['cough','wheeze','wheezing','bronchitis','chronic cough'], rec: 'cough' },
  { keys: ['breath','breathless','asthma','short of breath','difficulty breathing','respiratory'], rec: 'shortness_breath' },
  { keys: ['sore throat','throat pain','tonsil','pharyngitis'], rec: 'sore_throat' },
  { keys: ['fever','temperature','chills','flu','cold','infection','allerg','sinusitis','immune'], rec: 'fever' },

  /* ── Musculoskeletal ── */
  { keys: ['joint pain','arthritis','stiff joint','joint stiffness','knee pain','hip pain'], rec: 'joint_pain' },
  { keys: ['muscle pain','muscle ache','muscle cramp','cramp','spasm','muscle stiffness'], rec: 'muscle_cramps' },
  { keys: ['back pain','lower back','neck pain','spine','lumbar','sciatica','herniated'], rec: 'lower_back' },
  { keys: ['bone','fracture','osteoporosis','brittle bone'], rec: 'muscle_cramps' },

  /* ── Cardiovascular ── */
  { keys: ['chest pain','palpitat','irregular heart','heart rate','heart pounding'], rec: 'chest_pain' },
  { keys: ['swelling','edema','swollen leg','puffy legs','puffy feet','water retention'], rec: 'swelling' },
  { keys: ['foot edema','ankle swelling','leg swelling','swollen feet'], rec: 'foot_edema' },
  { keys: ['cholesterol','ldl','hdl','triglyceride','high fat'], rec: 'cholesterol' },

  /* ── Skin & Hair ── */
  { keys: ['skin rash','rash','acne','eczema','dermatitis','hives','itching','psoriasis'], rec: 'skin_rash' },
  { keys: ['dry skin','dull skin','flaky skin','cracked skin','skin dryness','dehydrated skin'], rec: 'skin_dryness' },
  { keys: ['hair loss','hair fall','thinning hair','alopecia','brittle hair','hair breakage'], rec: 'hair_loss' },

  /* ── Metabolic ── */
  { keys: ['weight gain','weight loss','obesity','overweight','underweight','struggling with weight'], rec: 'weight_changes' },
  { keys: ['gout','uric acid','uric','painful toe','toe swelling'], rec: 'gout_uric' },

  /* ── Sleep & Mental Health ── */
  { keys: ['insomnia','cannot sleep','trouble sleeping','restless sleep','waking at night','poor sleep'], rec: 'insomnia' },
  { keys: ['anxiety','panic','anxious','nervous','worry','worrying'], rec: 'anxiety' },
  { keys: ['stress','stressed','overwhelmed','burnout'], rec: 'anxiety' },
  { keys: ['depressed','depression','mood swing','sad','hopeless','emotional'], rec: 'anxiety' },

  /* ── Liver, Kidney & Detox ── */
  { keys: ['liver','hepatitis','fatty liver','jaundice','liver pain'], rec: 'liver_issues' },
  { keys: ['kidney stone','renal failure','kidney disease','kidney pain'], rec: 'kidney_issues' },
  { keys: ['frequent urinat','urgent urination','urinary','bladder'], rec: 'kidney_issues' },
  { keys: ['detox','cleanse','toxin','cleansing','body cleanse'], rec: 'detox' },

  /* ── Oral Health ── */
  { keys: ['gum disease','gingivitis','oral','mouth ulcer','dental','bad breath','tooth pain'], rec: 'oral_health' },

  /* ── Hormonal & Reproductive ── */
  { keys: ['menstrual','period pain','pms','irregular period','heavy period','period cramp'], rec: 'menstrual' },
  { keys: ['menopause','hot flash','hot flush','night sweat','perimenopause','post-menopause'], rec: 'menopause' },
  { keys: ['hormonal','hormone imbalance','hormones'], rec: 'menstrual' },
  { keys: ['libido','sexual desire','low sex drive','erectile','impotence'], rec: 'libido' },
  { keys: ['fertility','infertile','conception','trying to conceive'], rec: 'libido' },
  { keys: ['prostate','bph','nocturia','frequent night urination in men'], rec: 'prostate' },

  /* ── Blood ── */
  { keys: ['anaemia','anemia','low blood','pale','iron deficiency','low haemoglobin','low hemoglobin'], rec: 'anaemia' },
];

/* map form system IDs → BODY_SYSTEMS_DATABASE keys */
const FORM_SYSTEM_TO_DB = {
  nervous: 'Nervous System',
  cardiovascular: 'Cardiovascular System',
  digestive: 'Digestive System',
  respiratory: 'Respiratory System',
  immune: 'Immune System',
  endocrine: 'Endocrine System',
  musculoskeletal: 'Musculoskeletal System',
  urinary: 'Urinary System',
  reproductive: 'Reproductive System',
  skin: 'Integumentary System (Skin, Hair, Nails)',
  integumentary: 'Integumentary System (Skin, Hair, Nails)',
  lymphatic: 'Lymphatic System',
  sensory: 'Sensory System (Eyes, Ears, Nose)',
};

/* keyword match symptom text → BODY_SYSTEMS_DATABASE symptom key */
const DB_SYMPTOM_KEYWORDS = {
  'Nervous System': {
    'Frequent headaches or migraines': ['headache','migraine','head pain'],
    'Difficulty concentrating or brain fog': ['focus','brain fog','concentrate','memory','confusion','cognitive'],
    'Tingling or numbness in limbs': ['numb','tingle','tingling'],
  },
  'Cardiovascular System': {
    'Palpitations or irregular heartbeat': ['palpitat','irregular heart','chest','heart rate'],
    'Shortness of breath': ['breath','breathless','short of breath'],
    'Cold hands and feet or fatigue': ['fatigue','tired','cold hands','cold feet','circulation'],
  },
  'Digestive System': {
    'Bloating and indigestion': ['bloat','indigestion','heartburn','gas'],
    'Constipation or diarrhea': ['constipat','diarrhea','bowel'],
    'Loss of appetite or heartburn': ['appetite','hunger','heartburn','stomach'],
  },
  'Respiratory System': {
    'Frequent cough or shortness of breath': ['cough','wheeze','breath','respiratory'],
    'Chest tightness': ['chest','tight'],
    'Low lung endurance': ['lung','endurance','asthma'],
  },
  'Immune System': {
    'Frequent colds or infections': ['cold','infection','flu','fever','allerg'],
    'Slow wound healing': ['wound','heal'],
    'Allergic reactions or fatigue': ['allerg','fatigue','tired'],
  },
  'Endocrine System': {
    'Weight fluctuations': ['weight','obesity','overweight','underweight'],
    'Mood swings or irritability': ['mood','irritab','anxiety','stress','depress'],
    'Irregular menstruation or libido changes': ['menstrual','menopause','libido','hormonal'],
  },
  'Musculoskeletal System': {
    'Muscle stiffness or pain': ['muscle','stiff','cramp','spasm'],
    'Joint aches': ['joint','arthritis','knees','aches'],
    'Back or neck discomfort': ['back','neck','spine','lumbar'],
  },
  'Urinary System': {
    'Frequent urination or urgency': ['urinat','bladder','frequent bathroom'],
    'Lower back pain': ['back pain','kidney','lumbar'],
    'Swelling in legs or feet': ['swelling','edema','swollen','puffy legs'],
  },
  'Reproductive System': {
    'Reduced sexual desire': ['libido','sexual desire','erectile'],
    'Irregular cycles or erectile issues': ['menstrual','irregular','erectile','cycle'],
    'Hormonal imbalances': ['hormonal','menopause','hormone'],
  },
  'Integumentary System (Skin, Hair, Nails)': {
    'Dry or dull skin': ['dry skin','dull skin','skin'],
    'Hair loss or brittleness': ['hair loss','hair','brittle'],
    'Acne or skin sensitivity': ['acne','rash','itch','eczema','skin sensitive'],
  },
  'Lymphatic System': {
    'Swollen lymph nodes': ['lymph','swollen gland'],
    'Puffy face or limbs': ['puffy','swelling','edema'],
    'Chronic fatigue': ['fatigue','tired','exhaustion','lethargy'],
  },
  'Sensory System (Eyes, Ears, Nose)': {
    'Eye fatigue or blurred vision': ['vision','eye','blurred','eyesight'],
    'Ringing in the ears (tinnitus)': ['ear','tinnitus','ringing'],
    'Sensitivity to light or sound': ['light','sound','sensitivity'],
  },
};

function autoPopulateBodyChecks(data) {
  const newSystems = {};
  const newChecks = {};
  const formSymptoms = data.symptoms && typeof data.symptoms === 'object' && !Array.isArray(data.symptoms)
    ? data.symptoms : {};

  /* 1. Map form system IDs → DB systems, then match symptom texts by keyword */
  Object.entries(formSymptoms).forEach(([formSysId, syms]) => {
    if (!Array.isArray(syms) || syms.length === 0) return;
    const dbSystemName = FORM_SYSTEM_TO_DB[formSysId.toLowerCase()] || null;
    syms.forEach(symptomText => {
      const lower = (symptomText || '').toLowerCase();
      /* Try exact DB system first, then all systems */
      const systemsToSearch = dbSystemName
        ? { [dbSystemName]: DB_SYMPTOM_KEYWORDS[dbSystemName] }
        : DB_SYMPTOM_KEYWORDS;
      Object.entries(systemsToSearch).forEach(([sysName, sympMap]) => {
        if (!sympMap) return;
        const sysId = sysName.replace(/[^a-zA-Z0-9]/g, '_');
        Object.entries(sympMap).forEach(([dbSymptom, kws]) => {
          if (kws.some(kw => lower.includes(kw))) {
            newSystems[sysId] = true;
            newChecks[`${sysId}__${dbSymptom}`] = true;
          }
        });
      });
    });
  });

  /* 2. Lifestyle auto-checks */
  const sleepHours = data.sleep_hours || data.sleepHours || '';
  const stressLevel = data.stress_level || data.stressLevel || '';
  const exerciseFreq = data.exercise_freq || data.exerciseFreq || '';
  const waterIntake = data.water_intake || data.waterIntake || '';
  if (sleepHours === '<5' || sleepHours === 'Less than 5' || sleepHours === '5-6' || sleepHours === '5–6') {
    const sysId = 'Nervous_System';
    newSystems[sysId] = true;
    newChecks[`${sysId}__Difficulty concentrating or brain fog`] = true;
  }
  if (parseInt(stressLevel) >= 7) {
    const sysId = 'Endocrine_System';
    newSystems[sysId] = true;
    newChecks[`${sysId}__Mood swings or irritability`] = true;
  }
  if (exerciseFreq === 'never' || exerciseFreq === 'None' || exerciseFreq === '1-2' || exerciseFreq === '1–2x per week') {
    const sysId = 'Cardiovascular_System';
    newSystems[sysId] = true;
    newChecks[`${sysId}__Cold hands and feet or fatigue`] = true;
  }
  if (waterIntake === 'less1' || waterIntake === 'Less than 1L/day') {
    const sysId = 'Urinary_System';
    newSystems[sysId] = true;
    newChecks[`${sysId}__Lower back pain`] = true;
  }
  return { newSystems, newChecks };
}

function generateRecommendations(client) {
  const recommendations = new Set();
  const reasonsMap = new Map();
  const addRec = (med, reason) => {
    recommendations.add(med);
    if (!reasonsMap.has(med)) reasonsMap.set(med, []);
    reasonsMap.get(med).push(reason);
  };

  /* 1. Direct key matches (legacy snake_case keys) */
  if (client.symptoms && client.symptoms.length > 0) {
    client.symptoms.forEach(s => {
      if (s !== 'none' && RECOMMENDATION_DATABASE.symptoms[s]) {
        RECOMMENDATION_DATABASE.symptoms[s].forEach(m => addRec(m, `Symptom: ${s.replace(/_/g, ' ')}`));
      }
    });
  }

  /* 2. Keyword match from raw symptom strings (full text from form) */
  const rawStrings = client.rawSymptomStrings || [];
  rawStrings.forEach(symptomText => {
    const lower = (symptomText || '').toLowerCase();
    SYMPTOM_KEYWORD_MAP.forEach(({ keys, rec }) => {
      if (keys.some(k => lower.includes(k))) {
        const meds = RECOMMENDATION_DATABASE.symptoms[rec];
        if (meds) meds.forEach(m => addRec(m, symptomText));
      }
    });
  });

  /* 3. Medical history */
  if (client.medicalHistory && Array.isArray(client.medicalHistory)) {
    client.medicalHistory.forEach(c => {
      if (c !== 'na' && RECOMMENDATION_DATABASE.medicalHistory[c]) {
        RECOMMENDATION_DATABASE.medicalHistory[c].forEach(m => addRec(m, `Medical History: ${c.replace(/([A-Z])/g, ' $1').trim()}`));
      }
    });
  }

  /* 4. Gender */
  const gender = (client.gender || '').toLowerCase();
  if (gender && RECOMMENDATION_DATABASE.gender[gender]) {
    RECOMMENDATION_DATABASE.gender[gender].forEach(m => addRec(m, `Gender-specific (${gender})`));
  }

  /* 5. Lifestyle */
  const sh = client.sleepHours || '';
  if (sh === '<5' || sh === '5-6' || sh === 'Less than 5' || sh === '5–6' || sh === 'less5' || sh === '56') {
    RECOMMENDATION_DATABASE.lifestyle.poorSleep.forEach(m => addRec(m, 'Poor sleep quality'));
  }
  if (parseInt(client.stressLevel) >= 7) {
    RECOMMENDATION_DATABASE.lifestyle.highStress.forEach(m => addRec(m, 'High stress level'));
  }
  const ef = client.exerciseFreq || '';
  if (ef === 'never' || ef === '1-2' || ef === 'None' || ef === '1–2x per week' || ef === 'rarely' || ef === 'sedentary') {
    RECOMMENDATION_DATABASE.lifestyle.lowExercise.forEach(m => addRec(m, 'Low physical activity'));
  }
  const wi = client.waterIntake || '';
  if (wi === 'less1' || wi === 'Less than 1L/day' || wi === 'less2' || wi === '1-2') {
    RECOMMENDATION_DATABASE.lifestyle.poorWater.forEach(m => addRec(m, 'Low water intake'));
  }
  /* Low fruit/vegetable intake (diet field) */
  const diet = (client.diet || client.dietType || '').toLowerCase();
  if (diet.includes('junk') || diet.includes('fast food') || diet.includes('processed') || diet.includes('poor') || diet.includes('unhealthy')) {
    RECOMMENDATION_DATABASE.lifestyle.lowFruitVeg.forEach(m => addRec(m, 'Poor diet — low in fruits and vegetables'));
  }

  /* 6. Age-based recommendations */
  const age = client.age ? parseInt(client.age) : 0;
  if (age >= 60) {
    RECOMMENDATION_DATABASE.age.elderly.forEach(m => addRec(m, 'Age 60+ — cognitive and joint protection'));
  } else if (age >= 40 && age < 60) {
    RECOMMENDATION_DATABASE.age.middleAge.forEach(m => addRec(m, 'Age 40–59 — preventive wellness support'));
  }

  /* 7. Fallback if nothing matched */
  if (recommendations.size === 0) {
    RECOMMENDATION_DATABASE.general.forEach(m => addRec(m, 'General wellness'));
  }
  return { recommendations, reasonsMap };
}

function useBranchStock(branchId) {
  // inStock = Set of lowercase product names confirmed to have qty > 0 at this branch.
  // loaded  = true once we've received at least one successful response.
  // When loaded=true, any product NOT in inStock is considered out of stock.
  const [stockState, setStockState] = useState({ inStock: new Set(), loaded: false });

  const fetchStock = useCallback(async () => {
    if (!branchId) return;
    try {
      const data = await api.get(`/stock/branch/${encodeURIComponent(branchId)}/inventory`);
      const inv = Array.isArray(data.inventory) ? data.inventory : [];
      // Aggregate by lowercase name so name-casing variations don't cause duplicates.
      const qtyMap = {};
      for (const row of inv) {
        const name = (row.productName || row.product_name || '').trim().toLowerCase();
        if (!name) continue;
        qtyMap[name] = (qtyMap[name] || 0) + Number(row.availableQty ?? row.closingQty ?? 0);
      }
      // Products with qty > 0 are confirmed in stock; everything else (q<=0 or absent) is OOS.
      const inStockNames = new Set(
        Object.entries(qtyMap).filter(([, q]) => q > 0).map(([n]) => n)
      );
      setStockState({ inStock: inStockNames, loaded: true });
    } catch {
      // fail silently — keep loaded:false so no OOS markers are shown on network error
    }
  }, [branchId]);

  useEffect(() => {
    fetchStock();
    const id = setInterval(fetchStock, 30000);
    return () => clearInterval(id);
  }, [fetchStock]);

  return stockState;
}

function PrescriptionEditModal({ report, onClose, onSaved }) {
  const { user } = useAuth();
  const { inStock: branchInStock, loaded: stockLoaded } = useBranchStock(user?.branch || '');
  const [meds, setMeds] = useState(() => {
    const existing = Array.isArray(report.prescriptions)
      ? report.prescriptions.map(p => typeof p === 'string' ? p : (p.product || p.name || ''))
      : Array.isArray(report.medicines)
        ? report.medicines.map(m => typeof m === 'string' ? m : (m.name || ''))
        : [];
    return new Set(existing.filter(Boolean));
  });
  const [notes, setNotes] = useState(report.diagnosis || report.recommendations || '');
  const [followUp, setFollowUp] = useState(
    report.follow_up_date ? String(report.follow_up_date).slice(0, 10) : ''
  );
  const [followUpNotes, setFollowUpNotes] = useState(report.follow_up_notes || '');
  const [medSearch, setMedSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleMed = (name) => setMeds(prev => {
    const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next;
  });

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const medicines = Array.from(meds).map(name => ({ name, dispensed: false }));
      const prescriptions = medicines.map(m => ({ product: m.name, quantity: 1 }));
      await api.reports.update(report.id, {
        diagnosis: notes, recommendations: notes,
        medicines, prescriptions,
        follow_up_date: followUp || null,
        follow_up_notes: followUpNotes || null,
      });
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save prescription');
    } finally {
      setSaving(false);
    }
  };

  const allProducts = getLiveProductList();
  const seenPkg = new Set();
  const packages = allProducts.filter(p => p.is_package && !seenPkg.has(p.description) && seenPkg.add(p.description));
  const pkgNames = new Set(packages.map(p => p.description));
  const seenProd = new Set();
  const products = allProducts.filter(p => !p.is_package && !pkgNames.has(p.description) && !seenProd.has(p.description) && seenProd.add(p.description));
  const q = (medSearch || '').toLowerCase();
  const visPkgs = q ? packages.filter(p => p.description.toLowerCase().includes(q)) : packages;
  const visProds = q ? products.filter(p => p.description.toLowerCase().includes(q)) : products;

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000001, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '900px', margin: '20px auto', background: 'white', borderRadius: '14px', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg,#c41e3a,#a01830)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>✏️ Edit Prescription</h3>
            <p style={{ margin: '3px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '0.83rem' }}>Report ID: {report.id} — {report.client_name || 'Unknown Patient'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '1.6rem', cursor: 'pointer', borderRadius: '6px', padding: '1px 10px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '24px' }}>
          {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem' }}>{error}</div>}

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: '#1e293b', fontSize: '0.9rem' }}>Consultant Notes &amp; Diagnosis</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              style={{ width: '100%', padding: '10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="Updated diagnosis and treatment notes..." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: '#1e293b', fontSize: '0.9rem' }}>Follow-up Date</label>
              <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: '#1e293b', fontSize: '0.9rem' }}>Follow-up Notes</label>
              <input value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)}
                placeholder="e.g. Review progress, adjust dosage..."
                style={{ width: '100%', padding: '9px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ border: '1px solid #e0e0e0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, color: '#1e293b', fontSize: '0.95rem' }}>Prescribed Products</h4>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{meds.size} selected</span>
            </div>
            <input type="text" placeholder="Search products…" value={medSearch} onChange={e => setMedSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', marginBottom: '8px', boxSizing: 'border-box' }} />
            {stockLoaded && (
              <div style={{ fontSize: '0.78rem', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 10px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔴</span> <span><strong>Red items</strong> are currently out of stock at your branch. You can still prescribe them — the branch will source stock before dispensing.</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '7px', maxHeight: '340px', overflowY: 'auto', marginBottom: '12px' }}>
              {visPkgs.map((pkg, idx) => {
                const isChecked = meds.has(pkg.description);
                const isOos = stockLoaded && !branchInStock.has((pkg.description || '').trim().toLowerCase());
                const bg = isOos ? (isChecked ? '#fef3c7' : '#fee2e2') : (isChecked ? '#dcfce7' : '#e8f5e9');
                const borderColor = isOos ? (isChecked ? '#d97706' : '#dc2626') : (isChecked ? '#16a34a' : '#27ae60');
                return (
                  <div key={`epkg-${idx}`} onClick={() => toggleMed(pkg.description)}
                    style={{ background: bg, borderLeft: `4px solid ${borderColor}`, padding: '9px 10px', borderRadius: '6px', display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isChecked} onChange={() => toggleMed(pkg.description)} style={{ marginTop: '3px', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                    <label style={{ cursor: 'pointer', flex: 1, fontSize: '0.87rem' }}>
                      <span style={{ fontWeight: 700, color: isOos ? (isChecked ? '#92400e' : '#991b1b') : '#166534' }}>📦 {pkg.description}</span>
                      {isOos && <span style={{ marginLeft: '6px', fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '4px', padding: '1px 5px' }}>OUT OF STOCK</span>}
                      <br /><small style={{ color: '#555' }}>Bundle · DP: N${pkg.dp}</small>
                    </label>
                  </div>
                );
              })}
              {visProds.map((product, idx) => {
                const isChecked = meds.has(product.description);
                const isOos = stockLoaded && !branchInStock.has((product.description || '').trim().toLowerCase());
                const bg = isOos ? (isChecked ? '#fffbeb' : '#fff5f5') : (isChecked ? '#f0fdf4' : 'white');
                const borderColor = isOos ? (isChecked ? '#fcd34d' : '#fca5a5') : (isChecked ? '#86efac' : '#f0f0f0');
                const borderWidth = isOos ? '1.5px' : '1px';
                return (
                  <div key={`eprod-${idx}`} onClick={() => toggleMed(product.description)}
                    style={{ padding: '8px 10px', borderRadius: '6px', display: 'flex', alignItems: 'flex-start', gap: '8px', border: `${borderWidth} solid ${borderColor}`, background: bg, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isChecked} onChange={() => toggleMed(product.description)} style={{ marginTop: '3px', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                    <label style={{ cursor: 'pointer', flex: 1, fontSize: '0.87rem' }}>
                      <span style={{ fontWeight: isChecked ? 600 : 400, color: isOos ? (isChecked ? '#92400e' : '#991b1b') : (isChecked ? '#166534' : '#1e293b') }}>
                        {product.description}
                        {isOos && <span style={{ marginLeft: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '4px', padding: '1px 5px' }}>OUT OF STOCK</span>}
                      </span>
                      <br /><small style={{ color: '#666' }}>DP: N${product.dp} · BV: {product.bv}</small>
                    </label>
                  </div>
                );
              })}
              {visPkgs.length + visProds.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '30px', color: '#9ca3af', fontSize: '0.9rem' }}>No products match "{medSearch}"</div>
              )}
            </div>
            {meds.size > 0 && (
              <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                <h4 style={{ margin: '0 0 8px', color: '#166534', fontSize: '0.88rem' }}>✅ Prescribed ({meds.size}):</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Array.from(meds).map((med, i) => (
                    <span key={i} style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '3px 10px', borderRadius: '20px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      {med}
                      <button onClick={() => toggleMed(med)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 700, fontSize: '1rem', padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={onClose} style={{ padding: '10px 22px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '10px 22px', background: saving ? '#9b1c2e' : '#c41e3a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: saving ? 0.7 : 1 }}>
              {saving ? '⏳ Saving...' : '💾 Save Prescription'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckupsSection() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [selectedCheckup, setSelectedCheckup] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailCheckup, setDetailCheckup] = useState(null);
  const [showEditCheckup, setShowEditCheckup] = useState(false);
  const [editCheckupData, setEditCheckupData] = useState({});
  const [editCheckupSaving, setEditCheckupSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [consultantNotes, setConsultantNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [selectedMedicines, setSelectedMedicines] = useState(new Set());
  const [medSearch, setMedSearch] = useState('');
  const [selectedSystems, setSelectedSystems] = useState({});
  const [selectedSymptomChecks, setSelectedSymptomChecks] = useState({});
  const [currentRecommendations, setCurrentRecommendations] = useState(null);
  const [reportRequired, setReportRequired] = useState(true);
  const [editPrescLoadingId, setEditPrescLoadingId] = useState(null);
  const [editPrescReport, setEditPrescReport] = useState(null);
  const { inStock: branchInStock, loaded: stockLoaded } = useBranchStock(user?.branch || '');
  const [branchViewFilter, setBranchViewFilter] = useState('');
  const [showBooking, setShowBooking] = useState(false);
  const [bookingForm, setBookingForm] = useState({ full_name: '', phone: '', dob: '', height: '', weight: '', date: '', time: '', branch: '', notes: '', membershipStatus: 'referred', referralName: '', referralNbNumber: '', nbNumber: '' });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingDistQuery, setBookingDistQuery] = useState('');
  const [bookingDistResults, setBookingDistResults] = useState([]);
  const [bookingDistLoading, setBookingDistLoading] = useState(false);
  const [bookingDistOpen, setBookingDistOpen] = useState(false);

  useEffect(() => {
    if (!bookingDistQuery.trim() || bookingDistQuery.length < 2) { setBookingDistResults([]); setBookingDistOpen(false); return; }
    setBookingDistLoading(true);
    api.distributors.search(bookingDistQuery)
      .then(data => {
        const list = Array.isArray(data) ? data : data.distributors || [];
        setBookingDistResults(list.slice(0, 10));
        setBookingDistOpen(list.length > 0);
      })
      .catch(() => setBookingDistResults([]))
      .finally(() => setBookingDistLoading(false));
  }, [bookingDistQuery]);

  const selectBookingDist = (d) => {
    const name = d.distributor_name || d.full_name || d.name || '';
    const nb = d.distributor_code || d.nb_number || '';
    setBookingForm(f => ({ ...f, referralName: name, referralNbNumber: nb }));
    setBookingDistQuery('');
    setBookingDistOpen(false);
  };

  const clearBookingReferral = () => {
    setBookingForm(f => ({ ...f, referralName: '', referralNbNumber: '' }));
    setBookingDistQuery('');
  };

  const consultantBranch = user?.branch || '';
  // All branches this consultant is assigned to (primary + multi-branch array)
  const consultantAllBranches = (() => {
    const extra = Array.isArray(user?.branches) ? user.branches : [];
    const all = [...new Set([...(consultantBranch ? [consultantBranch] : []), ...extra])];
    return all;
  })();

  const loadCheckups = useCallback(() => {
    setLoading(true);
    const todayStr = new Date().toISOString().slice(0, 10);
    // No branch param — backend now handles multi-branch filtering via user.branches
    api.appointments.list('type=Check')
      .then(async data => {
        const apts = Array.isArray(data) ? data : data.appointments || [];
        const toMark = apts.filter(a => {
          const s = (a.status || '').toLowerCase();
          return a.date < todayStr && ['pending', 'scheduled'].includes(s);
        });
        if (toMark.length > 0) {
          await Promise.all(toMark.map(a =>
            api.appointments.update(a.id, { status: 'no_show' }).catch(() => {})
          ));
          const refreshed = await api.appointments.list('type=Check');
          setAppointments(Array.isArray(refreshed) ? refreshed : refreshed.appointments || []);
        } else {
          setAppointments(apts);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!bookingForm.full_name || !bookingForm.phone || !bookingForm.date || !bookingForm.time || !bookingForm.branch) {
      setBookingError('Full name, phone, date, time and branch are required.');
      return;
    }
    setBookingSubmitting(true);
    setBookingError('');
    try {
      const isMember = bookingForm.membershipStatus === 'member';
      await api.appointments.create({
        full_name: bookingForm.full_name,
        phone: bookingForm.phone,
        date: bookingForm.date,
        time: bookingForm.time,
        branch: bookingForm.branch,
        type: 'Check',
        status: 'pending',
        notes: bookingForm.notes,
        data: {
          dob: bookingForm.dob || null,
          height: bookingForm.height || null,
          weight: bookingForm.weight || null,
          membershipStatus: bookingForm.membershipStatus,
          membership_status: bookingForm.membershipStatus,
          referralName: isMember ? '' : bookingForm.referralName,
          referral_name: isMember ? '' : bookingForm.referralName,
          referralNbNumber: isMember ? '' : bookingForm.referralNbNumber,
          referral_nb: isMember ? '' : bookingForm.referralNbNumber,
          nbNumber: isMember ? bookingForm.nbNumber : '',
          nb_number: isMember ? bookingForm.nbNumber : '',
        },
      });
      setShowBooking(false);
      setBookingForm({ full_name: '', phone: '', dob: '', height: '', weight: '', date: '', time: '', branch: '', notes: '', membershipStatus: 'referred', referralName: '', referralNbNumber: '', nbNumber: '' });
      setBookingDistQuery('');
      loadCheckups();
    } catch (err) {
      setBookingError(err.message || 'Failed to book appointment. Please try again.');
    }
    setBookingSubmitting(false);
  };

  useEffect(() => { loadCheckups(); }, [loadCheckups]);

  useEffect(() => {
    api.prices.list().then(data => {
      if (Array.isArray(data) && data.length > 0) setLivePrices(data);
    }).catch(() => {});
  }, []);

  const openReportModal = (apt) => {
    setSelectedCheckup(apt);
    setConsultantNotes('');
    setFollowUpNotes('');
    setSelectedMedicines(new Set());
    setMedSearch('');
    setSelectedSystems({});
    setSelectedSymptomChecks({});
    setReportRequired(true);
    setError('');
    const fd = new Date();
    fd.setDate(fd.getDate() + 14);
    setFollowUpDate(fd.toISOString().split('T')[0]);
    const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
    const rawSymptoms = data.symptoms;
    const flatSymptoms = Array.isArray(rawSymptoms)
      ? rawSymptoms
      : (rawSymptoms && typeof rawSymptoms === 'object')
        ? Object.values(rawSymptoms).flat()
        : [];
    /* All symptom strings from the form (for keyword-based matching) */
    const rawSymptomStrings = Array.isArray(rawSymptoms)
      ? rawSymptoms
      : (rawSymptoms && typeof rawSymptoms === 'object')
        ? Object.values(rawSymptoms).flat()
        : [];
    const client = {
      symptoms: flatSymptoms,
      rawSymptomStrings,
      medicalHistory: data.medical_history || data.medicalHistory || [],
      gender: data.gender || apt.gender || '',
      age: data.age || apt.age || calcAge(data.dob) || '',
      sleepHours: data.sleep_hours || data.sleepHours || '',
      stressLevel: data.stress_level || data.stressLevel || '',
      exerciseFreq: data.exercise_freq || data.exerciseFreq || '',
      waterIntake: data.water_intake || data.waterIntake || '',
    };
    const recs = generateRecommendations(client);
    setCurrentRecommendations(recs);
    /* Auto-populate body system checkboxes from form symptom data */
    const { newSystems, newChecks } = autoPopulateBodyChecks(data);
    setSelectedSystems(newSystems);
    setSelectedSymptomChecks(newChecks);
    setShowReport(true);
  };

  const toggleMedicine = (name) => {
    setSelectedMedicines(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const applyAllRecommendations = () => {
    if (!currentRecommendations) return;
    setSelectedMedicines(prev => {
      const next = new Set(prev);
      currentRecommendations.recommendations.forEach(m => next.add(m));
      return next;
    });
  };

  const selectRecommendedMedicine = (name) => {
    setSelectedMedicines(prev => { const next = new Set(prev); next.add(name); return next; });
  };

  const toggleSystemSymptom = (systemId, symptom) => {
    setSelectedSymptomChecks(prev => {
      const key = `${systemId}__${symptom}`;
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
  };

  const getLifestyleRecommendations = () => {
    const items = [];
    Object.entries(selectedSymptomChecks).forEach(([key]) => {
      const [sysId, symptom] = key.split('__');
      const systemName = Object.keys(BODY_SYSTEMS_DATABASE).find(n => n.replace(/[^a-zA-Z0-9]/g, '_') === sysId);
      if (systemName) {
        const rec = BODY_SYSTEMS_DATABASE[systemName].symptoms[symptom];
        if (rec) items.push({ system: systemName, symptom, recommendation: rec });
      }
    });
    return items;
  };

  const handleSaveReport = async () => {
    setSubmitting(true);
    setError('');
    const apt = selectedCheckup;
    if (!apt) { setError('No checkup selected'); setSubmitting(false); return; }
    const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
    const selectedSymptoms = getLifestyleRecommendations();
    const medicines = Array.from(selectedMedicines).map(name => ({ name, dispensed: false }));
    const rawMemberType = data.membershipStatus || data.membership_status || data.customer_type || 'referred';
    const membershipStatus = rawMemberType === 'member' ? 'member' : 'referred';
    const isMember = membershipStatus === 'member';
    const consultationFee = isMember ? 150 : 200;
    const referralName = !isMember ? (data.referral_name || data.referralName || 'Dynapharm Namibia') : null;
    const referralNb = !isMember ? (data.referral_nb || data.referralNB || 'NB005676') : null;
    const referralDistributor = isMember ? null : `${referralName} ${referralNb}`;
    try {
      await api.reports.create({
        client_name: apt.full_name || data.fullName || '',
        appointment_id: apt.id,
        diagnosis: consultantNotes,
        prescriptions: medicines.map(m => ({ product: m.name, quantity: 1 })),
        medicines,
        recommendations: consultantNotes,
        follow_up_date: followUpDate,
        follow_up_notes: followUpNotes,
        symptoms: selectedSymptoms,
        consultant: user?.full_name || user?.username || 'Consultant',
        membership_status: membershipStatus,
        consultation_fee: consultationFee,
        consultant_credit: 150,
        referral_credit: isMember ? 0 : 50,
        referral_distributor: referralDistributor,
        referral_name: referralName,
        referral_nb: referralNb,
        nb_number: isMember ? (data.referral_nb || data.nb_number || null) : null,
        report_required: reportRequired,
        branch: getBranchId(apt.branch || data.branch || user?.branch || ''),
      });
      try {
        await api.appointments.update(apt.id, { status: 'completed' });
      } catch (statusErr) {
        console.error('Failed to mark appointment as completed:', statusErr);
      }
      setShowReport(false);
      setSelectedCheckup(null);
      setSelectedMedicines(new Set());
      setMedSearch('');
      setSelectedSystems({});
      setSelectedSymptomChecks({});
      setConsultantNotes('');
      setFollowUpDate('');
      setFollowUpNotes('');
      setCurrentRecommendations(null);
      setReportRequired(true);
      setError('');
      loadCheckups();
    } catch (err) {
      setError(err.message || 'Failed to save report');
    }
    setSubmitting(false);
  };

  const printReport = () => {
    const apt = selectedCheckup;
    if (!apt) return;
    const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
    const meds = Array.from(selectedMedicines);
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const logo = window.location.origin + '/assets/dynapharm-logo.png';
    const heightVal = data.height || '';
    const weightVal = data.weight || '';
    let bmiDisplay = '';
    if (heightVal && weightVal) {
      const h = parseFloat(heightVal); const wkg = parseFloat(weightVal);
      if (h > 0 && wkg > 0) {
        const bmi = (wkg / ((h / 100) ** 2)).toFixed(1);
        const cat = parseFloat(bmi) < 18.5 ? 'Underweight' : parseFloat(bmi) < 25 ? 'Normal' : parseFloat(bmi) < 30 ? 'Overweight' : 'Obese';
        bmiDisplay = `${bmi} (${cat})`;
      }
    }
    const bmiStored = data.bmi ? `${data.bmi}${data.bmi_category ? ` (${data.bmi_category})` : ''}` : bmiDisplay;

    /* Presenting symptoms */
    const rawSym = data.symptoms;
    const flatSym = Array.isArray(rawSym) ? rawSym
      : (rawSym && typeof rawSym === 'object') ? Object.values(rawSym).flat() : [];
    const symptomsBySystem = (rawSym && typeof rawSym === 'object' && !Array.isArray(rawSym))
      ? rawSym : null;

    /* Lifestyle findings (body system checks the consultant confirmed) */
    const lifestyleRecs = getLifestyleRecommendations();

    /* AI product recommendations */
    const aiRecs = currentRecommendations
      ? Array.from(currentRecommendations.recommendations).map(med => ({
          med, reasons: [...new Set(currentRecommendations.reasonsMap.get(med) || [])],
        }))
      : [];

    /* Referral / membership */
    const rawMemberType = data.membershipStatus || data.membership_status || data.customer_type || 'referred';
    const isMember = rawMemberType === 'member';
    const referralName = data.referral_name || data.referralName || data.distributorName || '';
    const referralNB = data.referral_nb || data.referralNB || data.distributorNB || '';

    const w = window.open('', '_blank', 'width=900,height=750');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Health Report — ${esc(apt.full_name || '')}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Arial,sans-serif;padding:20px;color:#222;font-size:12px;line-height:1.4;}
  .header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:14px;}
  .logo{height:54px;background:#fff;border-radius:8px;padding:3px;}
  .company{font-size:1.2rem;font-weight:900;color:#c41e3a;}
  .subtitle{font-size:0.82rem;color:#555;margin-top:2px;}
  .report-title{font-size:0.95rem;font-weight:800;color:#7b0000;letter-spacing:1px;margin-top:3px;}
  h3{color:#c41e3a;border-bottom:2px solid #fecaca;padding-bottom:4px;margin:12px 0 8px;font-size:0.88rem;text-transform:uppercase;letter-spacing:0.5px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 14px;}
  .field{font-size:0.82rem;padding:2px 0;border-bottom:1px dotted #eee;}
  .section{margin:8px 0;padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;background:#fafafa;}
  .tag{padding:2px 8px;background:#e3f2fd;color:#1565c0;border-radius:20px;display:inline-block;margin:2px;font-size:0.76rem;font-weight:600;}
  .med{padding:4px 10px;background:#e8f5e9;border-radius:4px;display:inline-block;margin:3px 3px 3px 0;font-size:0.85rem;color:#166534;font-weight:700;border:1px solid #bbf7d0;}
  .lifestyle-item{margin-bottom:6px;padding:6px 10px;background:#e3f2fd;border-left:4px solid #2196f3;border-radius:5px;}
  .lifestyle-sym{font-weight:700;color:#1565c0;font-size:0.84rem;}
  .lifestyle-advice{font-size:0.8rem;color:#333;margin-top:2px;line-height:1.4;}
  .bmi-pill{display:inline-block;background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:4px 14px;font-weight:800;font-size:0.95rem;color:#15803d;}
  .sig-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:6px;}
  .sig-box{border-top:2px solid #333;padding-top:5px;min-width:160px;}
  .sig-label{font-size:0.76rem;color:#666;}
  .sig-name{font-weight:700;font-size:0.9rem;color:#1e293b;margin-top:3px;}
  .footer{margin-top:18px;border-top:2px solid #c41e3a;padding-top:8px;font-size:0.72rem;color:#888;display:flex;justify-content:space-between;}
  .confidential{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;}
  .section{page-break-inside:avoid;}
  @media print{body{padding:10px;} @page{size:A4;margin:10mm;}}
</style>
</head><body>

<div class="header">
  <img class="logo" src="${logo}" onerror="this.style.display='none'" />
  <div>
    <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
    <div class="subtitle">Health, Wealth &amp; Freedom</div>
    <div class="report-title">SUMMARY ANALYSIS HEALTH REPORT CARD</div>
  </div>
  <div style="margin-left:auto;text-align:right;">
    <div style="font-size:0.85rem;color:#555;">Ref: <strong>${esc(String(apt.id || ''))}</strong></div>
    <div style="font-size:0.85rem;color:#555;">Date: <strong>${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}</strong></div>
    <div style="margin-top:6px;display:inline-block;padding:4px 14px;border-radius:20px;font-size:0.8rem;font-weight:700;${reportRequired ? 'background:#fef2f2;color:#c41e3a;border:2px solid #fecaca;' : 'background:#f0fdf4;color:#166534;border:2px solid #bbf7d0;'}">
      ${reportRequired ? '⚠️ Report Required: YES' : '✓ Report Required: NO'}
    </div>
    <div style="margin-top:4px;"><span class="confidential">CONFIDENTIAL</span></div>
  </div>
</div>

<h3>Patient Details</h3>
<div class="section">
  <div class="grid3">
    <div class="field"><strong>Full Name:</strong> ${esc(apt.full_name || data.fullName || '')}</div>
    <div class="field"><strong>Gender:</strong> ${esc(data.gender || 'N/A')}</div>
    <div class="field"><strong>Date of Birth:</strong> ${esc(data.dob || 'N/A')}${data.dob ? ` (Age: ${calcAge(data.dob) || 'N/A'})` : ''}</div>
    <div class="field"><strong>Phone:</strong> ${esc(data.phone || apt.phone || 'N/A')}</div>
    <div class="field"><strong>Email:</strong> ${esc(data.email || apt.email || 'N/A')}</div>
    <div class="field"><strong>Branch:</strong> ${esc(data.branch || apt.branch || 'N/A')}</div>
    <div class="field"><strong>Height:</strong> ${heightVal ? esc(heightVal)+' cm' : 'N/A'}</div>
    <div class="field"><strong>Weight:</strong> ${weightVal ? esc(weightVal)+' kg' : 'N/A'}</div>
    <div class="field"><strong>Client Type:</strong> ${isMember ? '🏅 Registered Member' : '👤 Non-Member (Referred)'}</div>
  </div>
  ${bmiStored ? `<div style="margin-top:10px"><span class="bmi-pill">BMI: ${esc(bmiStored)}</span></div>` : ''}
  ${!isMember && referralName ? `<div style="margin-top:8px;font-size:0.88rem;color:#666;"><strong>Referred by:</strong> ${esc(referralName)}${referralNB ? ` (${esc(referralNB)})` : ''}</div>` : ''}
</div>

<h3>Lifestyle &amp; Health Profile</h3>
<div class="section">
  <div class="grid3">
    <div class="field"><strong>Primary Reason:</strong> ${esc(data.primary_reason || data.primaryReason || data.reason || 'N/A')}</div>
    <div class="field"><strong>Water Intake:</strong> ${esc(data.water_intake || data.waterIntake || 'N/A')}</div>
    <div class="field"><strong>Exercise Frequency:</strong> ${esc(data.exercise_freq || data.exerciseFreq || 'N/A')}</div>
    <div class="field"><strong>Sleep Hours:</strong> ${esc(data.sleep_hours || data.sleepHours || 'N/A')}</div>
    <div class="field"><strong>Stress Level:</strong> ${esc(data.stress_level || data.stressLevel || 'N/A')}/10</div>
    <div class="field"><strong>Medications:</strong> ${esc(data.current_medications || data.currentMedications || 'None')}</div>
    <div class="field"><strong>Allergies:</strong> ${esc(data.allergies || 'None')}</div>
    <div class="field"><strong>Medical History:</strong> ${(() => { const mh = data.medical_history || data.medicalHistory; return Array.isArray(mh) ? esc(mh.join(', ')) : esc(mh || 'None'); })()}</div>
  </div>
</div>

${flatSym.length > 0 ? `
<h3>Reported Symptoms</h3>
<div class="section">
  ${symptomsBySystem
    ? Object.entries(symptomsBySystem).filter(([,v]) => Array.isArray(v) && v.length > 0).map(([sys, syms]) =>
        `<div style="margin-bottom:6px;"><strong style="color:#374151;text-transform:capitalize;">${esc(sys)}:</strong> ${syms.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>`
      ).join('')
    : flatSym.map(s => `<span class="tag">${esc(s)}</span>`).join('')
  }
</div>` : ''}

${lifestyleRecs.length > 0 ? `
<h3>🌿 Healthy Lifestyle Recommendations</h3>
<div class="section">
  ${lifestyleRecs.map(item => `
    <div class="lifestyle-item">
      <div class="lifestyle-sym">✓ ${esc(item.symptom)} <span style="font-weight:400;font-size:0.8rem;color:#555;">(${esc(item.system)})</span></div>
      <div class="lifestyle-advice">${esc(item.recommendation)}</div>
    </div>`).join('')}
</div>` : ''}

${meds.length > 0 ? `
<h3>💊 Prescription / Recommended Products</h3>
<div class="section">
  ${meds.map(m => `<span class="med">✓ ${esc(m)}</span>`).join('')}
</div>` : ''}

${consultantNotes ? `
<h3>📋 Consultant's Notes &amp; Diagnosis</h3>
<div class="section" style="background:#fffbeb;border-color:#fcd34d;">
  <p style="margin:0;white-space:pre-wrap;">${esc(consultantNotes)}</p>
</div>` : ''}

<h3>Consultant &amp; Follow-up</h3>
<div class="section">
  <div class="sig-row">
    <div>
      <div class="sig-box">
        <div class="sig-label">Consulting Health Practitioner</div>
        <div class="sig-name">${esc(user?.full_name || user?.username || '')}</div>
        <div style="font-size:0.8rem;color:#555;margin-top:3px;">Tel: ${esc(user?.phone || '061-300877')}</div>
        <div style="font-size:0.8rem;color:#555;">Email: ${esc(user?.email || 'info@dynapharm.com.na')}</div>
      </div>
    </div>
    <div>
      <div class="sig-box">
        <div class="sig-label">Recommended Follow-up Date</div>
        <div class="sig-name" style="color:#c41e3a;font-size:1.1rem;">${followUpDate ? new Date(followUpDate).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}) : '________________'}</div>
        ${followUpNotes ? `<div style="font-size:0.82rem;color:#555;margin-top:4px;">${esc(followUpNotes)}</div>` : ''}
      </div>
    </div>
  </div>
</div>

<div class="footer">
  <span>Generated: ${new Date().toLocaleString('en-NA')} &nbsp;|&nbsp; Dynapharm International Namibia</span>
  <span>This report is confidential and intended solely for the named patient.</span>
</div>

<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`);
    w.document.close();
  };

  const openEditPrescription = async (apt) => {
    setEditPrescLoadingId(apt.id);
    try {
      const result = await api.reports.list({ appointment_id: apt.id });
      const reports = Array.isArray(result) ? result : (result?.reports || []);
      const report = reports[0] || null;
      if (!report) {
        alert('No consultation report found for this appointment. The consultant must create a report first before it can be edited.');
        return;
      }
      setEditPrescReport(report);
    } catch (err) {
      alert('Failed to load report: ' + (err.message || 'Unknown error'));
    } finally {
      setEditPrescLoadingId(null);
    }
  };

  const updateStatus = async (apt, newStatus) => {
    try {
      await api.appointments.update(apt.id, { status: newStatus });
      loadCheckups();
    } catch (err) {
      alert('Failed to update status: ' + (err.message || 'Unknown error'));
    }
  };

  const viewDetail = (apt) => {
    setDetailCheckup(apt);
    setShowDetail(true);
    setShowEditCheckup(false);
  };

  const openEditCheckup = (apt) => {
    const d = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
    setEditCheckupData({
      full_name: apt.full_name || '',
      phone: apt.phone || '',
      email: apt.email || '',
      gender: d.gender || '',
      dob: d.dob || '',
      height: d.height || '',
      weight: d.weight || '',
      primary_reason: d.primary_reason || d.primaryReason || '',
      water_intake: d.water_intake || d.waterIntake || '',
      exercise_freq: d.exercise_freq || d.exerciseFreq || '',
      sleep_hours: d.sleep_hours || d.sleepHours || '',
      stress_level: d.stress_level || d.stressLevel || '',
      current_medications: d.current_medications || d.currentMedications || d.medications || '',
      allergies: d.allergies || '',
      medical_history: Array.isArray(d.medical_history) ? d.medical_history.join(', ') : (d.medical_history || (Array.isArray(d.medicalHistory) ? d.medicalHistory.join(', ') : (d.medicalHistory || ''))),
      membershipStatus: d.membershipStatus || d.membership_status || d.customer_type || 'referred',
      referralName: d.referral_name || d.referralName || d.distributorName || '',
      referralNbNumber: d.referral_nb || d.referralNbNumber || d.distributorNB || '',
      nbNumber: d.nb_number || d.nbNumber || '',
    });
    setShowEditCheckup(true);
  };

  const saveEditCheckup = async () => {
    if (!detailCheckup) return;
    setEditCheckupSaving(true);
    try {
      const currentData = (() => { try { return typeof detailCheckup.data === 'string' ? JSON.parse(detailCheckup.data) : (detailCheckup.data || {}); } catch { return {}; } })();
      const mergedData = {
        ...currentData,
        gender: editCheckupData.gender,
        dob: editCheckupData.dob,
        height: editCheckupData.height,
        weight: editCheckupData.weight,
        primary_reason: editCheckupData.primary_reason,
        primaryReason: editCheckupData.primary_reason,
        water_intake: editCheckupData.water_intake,
        waterIntake: editCheckupData.water_intake,
        exercise_freq: editCheckupData.exercise_freq,
        exerciseFreq: editCheckupData.exercise_freq,
        sleep_hours: editCheckupData.sleep_hours,
        sleepHours: editCheckupData.sleep_hours,
        stress_level: editCheckupData.stress_level,
        stressLevel: editCheckupData.stress_level,
        current_medications: editCheckupData.current_medications,
        currentMedications: editCheckupData.current_medications,
        allergies: editCheckupData.allergies,
        medical_history: editCheckupData.medical_history,
        medicalHistory: editCheckupData.medical_history,
        membershipStatus: editCheckupData.membershipStatus,
        membership_status: editCheckupData.membershipStatus,
        referralName: editCheckupData.membershipStatus === 'member' ? '' : editCheckupData.referralName,
        referral_name: editCheckupData.membershipStatus === 'member' ? '' : editCheckupData.referralName,
        referralNbNumber: editCheckupData.membershipStatus === 'member' ? '' : editCheckupData.referralNbNumber,
        referral_nb: editCheckupData.membershipStatus === 'member' ? '' : editCheckupData.referralNbNumber,
        nbNumber: editCheckupData.membershipStatus === 'member' ? editCheckupData.nbNumber : '',
        nb_number: editCheckupData.membershipStatus === 'member' ? editCheckupData.nbNumber : '',
      };
      const updatedApt = {
        ...detailCheckup,
        full_name: editCheckupData.full_name,
        phone: editCheckupData.phone,
        email: editCheckupData.email,
        data: mergedData,
      };
      await api.appointments.update(detailCheckup.id, updatedApt);
      setAppointments(prev => prev.map(a => a.id === detailCheckup.id ? updatedApt : a));
      setDetailCheckup(updatedApt);
      setShowEditCheckup(false);
    } catch (err) {
      alert('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setEditCheckupSaving(false);
    }
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed') return '#22c55e';
    if (s === 'no_show') return '#f97316';
    if (s === 'walk-in') return '#f59e0b';
    if (s === 'checked_in' || s === 'in_progress') return '#8b5cf6';
    return '#3b82f6';
  };

  // Unique branch names from loaded appointments — used to populate branch filter
  const appointmentBranches = [...new Set(appointments.map(a => a.branch).filter(Boolean))].sort();

  // Apply branch filter first so tab counts reflect the selected branch
  const branchFiltered = branchViewFilter
    ? appointments.filter(a => (a.branch || '').toLowerCase().includes(branchViewFilter.toLowerCase()))
    : appointments;

  // Apply date filter so tab counts (Upcoming / Completed / No Show) reflect the chosen day
  const dateFiltered = dateFilter
    ? branchFiltered.filter(a => (a.date || '').slice(0, 10) === dateFilter)
    : branchFiltered;

  const upcoming = dateFiltered.filter(a => {
    const s = (a.status || '').toLowerCase();
    return !['completed', 'cancelled', 'no_show'].includes(s);
  });
  const completed = dateFiltered.filter(a => (a.status || '').toLowerCase() === 'completed');
  const noShows = dateFiltered.filter(a => (a.status || '').toLowerCase() === 'no_show');
  const baseFiltered = filter === 'completed' ? completed : filter === 'no_show' ? noShows : upcoming;
  const branchDisplayFiltered = searchQuery.trim()
    ? baseFiltered.filter(a => (a.full_name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : baseFiltered;

  const parseData = (apt) => {
    try {
      return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {});
    } catch { return {}; }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>Checkup Forms</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            {consultantAllBranches.length > 1
              ? `Showing clients across ${consultantAllBranches.length} assigned branches`
              : 'Forms submitted by clients to your branch'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setShowBooking(true); setBookingError(''); setBookingForm({ full_name: '', phone: '', date: new Date().toISOString().slice(0,10), time: '', branch: consultantBranch || '', notes: '' }); }}
            style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
            + Book Check-up
          </button>
          <button onClick={loadCheckups} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 16px', fontSize: '0.85rem', cursor: 'pointer' }}>Refresh</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilter('upcoming')}
          style={{ padding: '8px 20px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: filter === 'upcoming' ? '#c41e3a' : '#f1f5f9', color: filter === 'upcoming' ? '#fff' : '#64748b', transition: 'all 0.2s' }}
        >Upcoming ({upcoming.length})</button>
        <button
          onClick={() => setFilter('completed')}
          style={{ padding: '8px 20px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: filter === 'completed' ? '#c41e3a' : '#f1f5f9', color: filter === 'completed' ? '#fff' : '#64748b', transition: 'all 0.2s' }}
        >Completed ({completed.length})</button>
        <button
          onClick={() => setFilter('no_show')}
          style={{ padding: '8px 20px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: filter === 'no_show' ? 'none' : '1px solid #fed7aa', cursor: 'pointer', background: filter === 'no_show' ? '#f97316' : '#fff7ed', color: filter === 'no_show' ? '#fff' : '#c2410c', transition: 'all 0.2s' }}
        >No Show ({noShows.length})</button>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.95rem', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            placeholder="Search by client name…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 36px 9px 36px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', color: '#1e293b', outline: 'none', background: '#f8fafc', transition: 'border-color .15s' }}
            onFocus={e => e.target.style.borderColor = '#c41e3a'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#94a3b8', lineHeight: 1, padding: 2 }}>✕</button>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{ padding: '9px 14px', borderRadius: 10, border: `1.5px solid ${dateFilter ? '#c41e3a' : '#e2e8f0'}`, fontSize: '0.88rem', color: dateFilter ? '#1e293b' : '#94a3b8', background: dateFilter ? '#fff0f3' : '#f8fafc', cursor: 'pointer', minWidth: 155, outline: 'none' }}
          />
          {dateFilter && (
            <button onClick={() => setDateFilter('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1, padding: 2 }}>✕</button>
          )}
        </div>
        <select
          value={branchViewFilter}
          onChange={e => setBranchViewFilter(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', color: branchViewFilter ? '#1e293b' : '#94a3b8', background: branchViewFilter ? '#fff0f3' : '#f8fafc', cursor: 'pointer', minWidth: 160, borderColor: branchViewFilter ? '#c41e3a' : '#e2e8f0' }}>
          <option value="">All Branches ({appointmentBranches.length})</option>
          {appointmentBranches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>Loading checkup forms...</div>
      ) : branchDisplayFiltered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
          <p style={{ fontSize: '1.1rem' }}>
            {searchQuery.trim()
              ? `No ${filter === 'completed' ? 'completed' : filter === 'no_show' ? 'no-show' : 'upcoming'} clients match "${searchQuery.trim()}".`
              : dateFilter
                ? `No ${filter === 'completed' ? 'completed' : filter === 'no_show' ? 'no-show' : 'upcoming'} forms on ${new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${branchViewFilter ? ` at ${branchViewFilter}` : ''}.`
                : branchViewFilter
                  ? `No ${filter} clients at ${branchViewFilter}.`
                  : filter === 'completed' ? 'No completed forms yet.' : 'No upcoming checkup forms for your assigned branches.'}
          </p>
          {(searchQuery.trim() || dateFilter || branchViewFilter) && (
            <button onClick={() => { setSearchQuery(''); setDateFilter(''); setBranchViewFilter(''); }} style={{ marginTop: 8, padding: '6px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem' }}>Clear filters</button>
          )}
        </div>
      ) : (
        <div>
          {branchDisplayFiltered.map(apt => {
            const data = parseData(apt);
            const statusColor = getStatusColor(apt.status);
            const statusLabel = apt.status || 'pending';
            const sl = statusLabel.toLowerCase();
            const dateStr = apt.date ? new Date(apt.date).toLocaleDateString('en-GB') : '';
            const timeStr = apt.time ? apt.time.slice(0, 5) : '';

            // Extract "booked by" info from notes or data
            const bookedBy = (() => {
              if (apt.notes) {
                const m = apt.notes.match(/[Bb]ooked by distributor\s+(\S+)(?:\s*\(([^)]+)\))?/);
                if (m) return m[2] ? `${m[2]} (${m[1]})` : m[1];
                const m2 = apt.notes.match(/[Bb]ooked by ([^.—\n]+)/);
                if (m2) return m2[1].trim();
              }
              if (data.booking_source === 'distributor_portal') {
                const name = data.referral_name || apt._distributor_name || '';
                const nb = data.referral_nb || apt.client_reference || apt._distributor_code || '';
                return name ? `${name}${nb ? ` (${nb})` : ''}` : nb || 'Distributor Portal';
              }
              if (data.booking_source === 'front_desk') return 'Front Desk';
              // Fallback: bare NB code in client_reference — enrich with resolved name if available
              if (apt.client_reference) {
                const resolvedName = apt._distributor_name || '';
                return resolvedName
                  ? `${resolvedName} (${apt.client_reference})`
                  : apt.client_reference;
              }
              return null;
            })();

            return (
              <div key={apt.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderLeft: `4px solid ${statusColor}`, borderRadius: '10px', padding: '16px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1f2937', marginBottom: '4px' }}>{apt.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      {apt.phone || ''}{apt.email ? ` • ${apt.email}` : ''}
                    </div>
                    {bookedBy && (
                      <div style={{ fontSize: '0.82rem', color: '#7c3aed', marginTop: '4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 99, padding: '1px 8px', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.02em' }}>BOOKED BY</span>
                        <span>{bookedBy}</span>
                      </div>
                    )}
                    {apt.branch && consultantAllBranches.length > 1 && (
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>📍 {apt.branch}</div>
                    )}
                    {data.concern && <div style={{ fontSize: '0.85rem', color: '#374151', marginTop: '4px' }}><strong>Concern:</strong> {data.concern}</div>}
                    {data.distributorName && <div style={{ fontSize: '0.85rem', color: '#374151' }}><strong>Referred by:</strong> {data.distributorName} ({data.distributorNB || ''})</div>}
                    {data.conditions && data.conditions !== 'None' && <div style={{ fontSize: '0.85rem', color: '#374151' }}><strong>Conditions:</strong> {data.conditions}</div>}
                    {data.acknowledgedBy && <div style={{ fontSize: '0.82rem', color: '#059669', marginTop: '4px' }}>Acknowledged by: <strong>{data.acknowledgedBy}</strong> ({data.acknowledgedInitials || ''}) on {data.acknowledgedDate || ''}</div>}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '120px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{dateStr}{timeStr ? ` at ${timeStr}` : ''}</div>
                    <span style={{ display: 'inline-block', marginTop: '4px', padding: '3px 10px', background: `${statusColor}20`, color: statusColor, borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize' }}>{statusLabel}</span>
                  </div>
                </div>
                {sl === 'no_show' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                    <button onClick={() => viewDetail(apt)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>View Details</button>
                    <button onClick={() => updateStatus(apt, 'pending')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Restore to Pending</button>
                  </div>
                )}
                {sl !== 'completed' && sl !== 'cancelled' && sl !== 'no_show' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                    <button onClick={() => viewDetail(apt)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>View Details</button>
                    <button onClick={() => openReportModal(apt)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#c41e3a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Create Report</button>
                    {(sl === 'pending' || sl === 'walk-in') && <button onClick={() => updateStatus(apt, 'checked_in')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Check In</button>}
                    {sl === 'checked_in' && <button onClick={() => updateStatus(apt, 'in_progress')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Start Checkup</button>}
                    <button onClick={() => updateStatus(apt, 'completed')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Mark Complete</button>
                    <button onClick={() => updateStatus(apt, 'no_show')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#f97316', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Mark No Show</button>
                  </div>
                )}
                {sl === 'completed' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                    <button onClick={() => viewDetail(apt)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>View Details</button>
                    <button
                      onClick={() => openEditPrescription(apt)}
                      disabled={editPrescLoadingId === apt.id}
                      style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#c41e3a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: editPrescLoadingId === apt.id ? 0.6 : 1, fontWeight: 600 }}
                    >
                      {editPrescLoadingId === apt.id ? '⏳ Loading...' : '✏️ Edit Prescription'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editPrescReport && (
        <PrescriptionEditModal
          report={editPrescReport}
          onClose={() => setEditPrescReport(null)}
          onSaved={() => loadCheckups()}
        />
      )}

      {showDetail && detailCheckup && (
        <div onClick={e => { if (e.target === e.currentTarget) { setShowDetail(false); setShowEditCheckup(false); } }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 999999, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '700px', margin: '20px auto', background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, color: '#1f2937', fontSize: '1.1rem' }}>{showEditCheckup ? 'Edit Checkup Form' : 'Checkup Form Details'}</h3>
              <button onClick={() => { setShowDetail(false); setShowEditCheckup(false); }} style={{ padding: '8px 16px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: '24px' }}>
              {showEditCheckup ? (
                <CheckupEditForm form={editCheckupData} setForm={setEditCheckupData} />
              ) : (
                <CheckupDetailContent apt={detailCheckup} />
              )}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '2px solid #e5e7eb', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {showEditCheckup ? (
                <>
                  <button onClick={saveEditCheckup} disabled={editCheckupSaving} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: editCheckupSaving ? 0.6 : 1 }}>{editCheckupSaving ? 'Saving…' : '💾 Save Changes'}</button>
                  <button onClick={() => setShowEditCheckup(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => openEditCheckup(detailCheckup)} style={{ padding: '10px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>✏️ Edit Form</button>
                  {(detailCheckup.status || '').toLowerCase() !== 'completed' && (detailCheckup.status || '').toLowerCase() !== 'cancelled' && (
                    <button onClick={() => { setShowDetail(false); setShowEditCheckup(false); openReportModal(detailCheckup); }} style={{ padding: '10px 20px', background: '#c41e3a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Create Report & Prescription</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showReport && selectedCheckup && (() => {
        const apt = selectedCheckup;
        const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
        const rawSym = data.symptoms;
        const symptoms = (Array.isArray(rawSym) ? rawSym : (rawSym && typeof rawSym === 'object') ? Object.values(rawSym).flat() : []).filter(s => s !== 'none');
        const lifestyleRecs = getLifestyleRecommendations();
        return (
          <div onClick={e => { if (e.target === e.currentTarget) setShowReport(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 999999, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: '1000px', margin: '20px auto', background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowReport(false)} style={{ position: 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#666', zIndex: 10 }}>&times;</button>
              </div>

              <div style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)', padding: '20px 30px', textAlign: 'center', color: 'white', borderRadius: '12px 12px 0 0' }}>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>DYNAPHARM INTERNATIONAL NAMIBIA</h2>
                <p style={{ margin: '4px 0', opacity: 0.85, fontSize: '0.9rem' }}>Branch: {data.branch || user?.branch || ''}</p>
                <h3 style={{ margin: '8px 0 0', fontSize: '1.1rem' }}>Summary Analysis Report Card</h3>
              </div>

              <div style={{ padding: '24px 30px' }}>
                {error && <div style={{ background: '#fee', border: '1px solid #c00', color: '#c00', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>{error}</div>}

                <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                  <div><strong>Reference:</strong> {apt.id || 'N/A'}</div>
                  <div><strong>Name:</strong> {apt.full_name || data.fullName || ''}</div>
                  <div><strong>Age:</strong> {data.age || apt.age || calcAge(data.dob) || 'N/A'}</div>
                  <div><strong>Gender:</strong> {data.gender || ''}</div>
                  <div><strong>Phone:</strong> {data.phone || apt.phone || ''}</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>Consultant:</strong> {user?.full_name || user?.username || ''}</div>
                  <div><strong>Height:</strong> {data.height || 'N/A'}cm | <strong>Weight:</strong> {data.weight || 'N/A'}kg</div>
                </div>

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Presenting Symptoms</h3>
                  {symptoms.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {symptoms.map((s, i) => (
                        <span key={i} style={{ background: '#e3f2fd', color: '#1565c0', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 500 }}>{(s || '').toUpperCase().replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  ) : <p style={{ color: '#7f8c8d', fontStyle: 'italic', margin: 0 }}>No specific symptoms reported</p>}
                </div>

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Health Assessment</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px' }}>
                    <div><strong>Primary Reason:</strong> {data.primary_reason || data.primaryReason || data.reason || 'N/A'}</div>
                    <div><strong>Water Intake:</strong> {data.water_intake || data.waterIntake || 'Not specified'}</div>
                    <div><strong>Exercise:</strong> {data.exercise_freq || data.exerciseFreq || 'Not specified'}</div>
                    <div><strong>Sleep:</strong> {data.sleep_hours || data.sleepHours || 'Not specified'}</div>
                    <div><strong>Stress Level:</strong> {data.stress_level || data.stressLevel ? `${data.stress_level || data.stressLevel}/10` : 'Not specified'}</div>
                    <div><strong>Medications:</strong> {data.current_medications || data.currentMedications || 'None'}</div>
                    <div><strong>Allergies:</strong> {data.allergies || 'None'}</div>
                    <div><strong>Medical History:</strong> {Array.isArray(data.medical_history || data.medicalHistory) ? (data.medical_history || data.medicalHistory).join(', ') : (data.medical_history || data.medicalHistory || 'None')}</div>
                  </div>
                </div>

                <div style={{ background: '#e3f2fd', borderLeft: '5px solid #2196f3', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ color: '#2196f3', margin: '0 0 8px', fontSize: '1rem' }}>🩺 ABOUT THE PROBLEMS OF SUB-HEALTH TRENDS</h3>
                  <p style={{ marginBottom: '15px', color: '#666', fontSize: '0.9rem' }}>Select the body system(s) and symptoms affecting the patient to view lifestyle recommendations:</p>
                  <div style={{ display: 'grid', gap: '12px', marginBottom: '15px' }}>
                    {Object.entries(BODY_SYSTEMS_DATABASE).map(([systemName, system]) => {
                      const sysId = systemName.replace(/[^a-zA-Z0-9]/g, '_');
                      const isOpen = selectedSystems[sysId];
                      return (
                        <div key={sysId} style={{ background: 'white', border: '2px solid #e0e0e0', borderRadius: '8px', padding: '12px', transition: 'all 0.3s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setSelectedSystems(p => ({ ...p, [sysId]: !p[sysId] }))}>
                            <input type="checkbox" checked={!!isOpen} readOnly style={{ width: '18px', height: '18px', marginRight: '10px', cursor: 'pointer' }} />
                            <h4 style={{ color: '#2196f3', margin: 0, flex: 1, fontSize: '1rem' }}>{systemName}</h4>
                            <span style={{ fontSize: '1.1rem', color: '#2196f3' }}>{isOpen ? '▲' : '▼'}</span>
                          </div>
                          {isOpen && (
                            <div style={{ marginTop: '10px', paddingLeft: '28px' }}>
                              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '6px', fontWeight: 600 }}>Common Symptoms:</p>
                              {Object.keys(system.symptoms).map((symptom, si) => {
                                const key = `${sysId}__${symptom}`;
                                return (
                                  <label key={si} style={{ display: 'block', padding: '4px 0', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    <input type="checkbox" checked={!!selectedSymptomChecks[key]} onChange={() => toggleSystemSymptom(sysId, symptom)} style={{ marginRight: '8px' }} />
                                    {symptom}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {lifestyleRecs.length > 0 && (
                    <div style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '2px solid #2196f3' }}>
                      <h4 style={{ color: '#2196f3', marginBottom: '15px', fontSize: '1.1rem' }}>📋 Healthy Lifestyle Recommendations</h4>
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {lifestyleRecs.map((item, i) => (
                          <div key={i} style={{ background: '#e3f2fd', padding: '10px 14px', borderRadius: '8px', borderLeft: '4px solid #2196f3' }}>
                            <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
                              <span style={{ fontSize: '1.1rem', color: '#2196f3' }}>✓</span>
                              <div style={{ flex: 1 }}>
                                <strong style={{ color: '#1976d2', fontSize: '0.9rem' }}>{item.symptom}</strong>
                                <span style={{ color: '#666', fontSize: '0.8rem', marginLeft: '8px' }}>({item.system})</span>
                                <p style={{ margin: '4px 0 0', color: '#555', lineHeight: 1.5, fontSize: '0.85rem' }}>{item.recommendation}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {currentRecommendations && (
                  <div style={{ background: '#e8f5e9', borderLeft: '5px solid #27ae60', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                    <h3 style={{ color: '#27ae60', margin: '0 0 4px', fontSize: '1rem' }}>🎯 Product Recommendations</h3>
                    <p style={{ marginBottom: '12px', color: '#555', fontSize: '0.85rem' }}>
                      Matched to this client's reported symptoms, medical history, lifestyle and gender. Each product's Dynapharm health benefit is shown below.
                    </p>
                    <div style={{ background: 'white', borderRadius: '8px', border: '2px solid #27ae60', overflow: 'hidden' }}>
                      {Array.from(currentRecommendations.recommendations).map((medicine, i) => {
                        const reasons = currentRecommendations.reasonsMap.get(medicine) || [];
                        const uniqueReasons = [...new Set(reasons)];
                        const benefit = PRODUCT_HEALTH_BENEFITS[medicine] || null;
                        const isAdded = selectedMedicines.has(medicine);
                        const recArr = Array.from(currentRecommendations.recommendations);
                        return (
                          <div key={i} style={{ padding: '12px 14px', borderBottom: i < recArr.length - 1 ? '1px solid #e8f5e9' : 'none', background: isAdded ? '#f0fdf4' : 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                  <strong style={{ color: '#166534', fontSize: '0.95rem' }}>{medicine}</strong>
                                  {isAdded && <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#16a34a', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>✓ Prescribed</span>}
                                </div>
                                {benefit && (
                                  <p style={{ margin: '0 0 6px', fontSize: '0.82rem', color: '#374151', lineHeight: 1.5 }}>
                                    <span style={{ color: '#16a34a', fontWeight: 700 }}>Health Benefit: </span>{benefit}
                                  </p>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {uniqueReasons.map((r, ri) => (
                                    <span key={ri} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      <span style={{ opacity: 0.7 }}>↳</span> {r}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <button
                                onClick={() => selectRecommendedMedicine(medicine)}
                                style={{ flexShrink: 0, padding: '6px 14px', fontSize: '0.82rem', background: isAdded ? '#16a34a' : '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                              >
                                {isAdded ? '✓ Added' : '+ Prescribe'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={applyAllRecommendations} style={{ marginTop: '10px', width: '100%', padding: '10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                      ✅ Prescribe All Recommended Products
                    </button>
                  </div>
                )}

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Consultant's Notes & Diagnosis</h3>
                  <textarea value={consultantNotes} onChange={e => setConsultantNotes(e.target.value)} rows={5} style={{ width: '100%', padding: '10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', resize: 'vertical', boxSizing: 'border-box' }} placeholder="Enter diagnosis and treatment notes..." />
                  {consultantNotes && (
                    <div style={{ marginTop: '8px', background: '#f8f9fa', padding: '10px', borderRadius: '6px' }}>
                      <h4 style={{ margin: '0 0 5px', fontSize: '0.9rem', color: '#2c3e50' }}>Diagnosis & Treatment Notes:</h4>
                      <div style={{ color: '#555', fontSize: '0.9rem' }}>{consultantNotes}</div>
                    </div>
                  )}
                </div>

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Follow-up Information</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem', fontWeight: 500 }}>Recommended Follow-up Date:</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '2px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem', fontWeight: 500 }}>Follow-up Notes (Optional):</label>
                      <input type="text" value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g., Review progress, adjust dosage..." style={{ width: '100%', padding: '8px', border: '2px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>

                {(() => {
                  const allProducts = getLiveProductList();
                  const seenPkg = new Set();
                  const dedupPackages = allProducts.filter(p => p.is_package && !seenPkg.has(p.description) && seenPkg.add(p.description));
                  const pkgNames = new Set(dedupPackages.map(p => p.description));
                  const seenProd = new Set();
                  const dedupProducts = allProducts.filter(p => !p.is_package && !pkgNames.has(p.description) && !seenProd.has(p.description) && seenProd.add(p.description));
                  const medSearchLower = (medSearch || '').toLowerCase();
                  const filteredPkgs = medSearchLower ? dedupPackages.filter(p => p.description.toLowerCase().includes(medSearchLower)) : dedupPackages;
                  const filteredProds = medSearchLower ? dedupProducts.filter(p => p.description.toLowerCase().includes(medSearchLower)) : dedupProducts;
                  const totalVisible = filteredPkgs.length + filteredProds.length;
                  return (
                    <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#2c3e50' }}>Prescription &amp; Medicine Selection</h3>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{totalVisible} products · {selectedMedicines.size} selected</span>
                      </div>
                      <input
                        type="text"
                        placeholder="Search products…"
                        value={medSearch}
                        onChange={e => setMedSearch(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', marginBottom: '8px', boxSizing: 'border-box' }}
                      />
                      {stockLoaded && (
                        <div style={{ fontSize: '0.78rem', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 10px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🔴</span> <span><strong>Red items</strong> are currently out of stock at your branch. You can still prescribe them — the branch will source stock before dispensing.</span>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px', maxHeight: '420px', overflowY: 'auto', marginBottom: '12px' }}>
                        {filteredPkgs.map((pkg, idx) => {
                          const staticEntry = PACKAGE_DATABASE[pkg.description];
                          const isChecked = selectedMedicines.has(pkg.description);
                          const isOos = stockLoaded && !branchInStock.has((pkg.description || '').trim().toLowerCase());
                          const bg = isOos ? (isChecked ? '#fef3c7' : '#fee2e2') : (isChecked ? '#dcfce7' : '#e8f5e9');
                          const borderColor = isOos ? (isChecked ? '#d97706' : '#dc2626') : (isChecked ? '#16a34a' : '#27ae60');
                          return (
                            <div key={`pkg-${idx}`} style={{ background: bg, borderLeft: `4px solid ${borderColor}`, padding: '10px', borderRadius: '6px', display: 'flex', alignItems: 'start', gap: '8px', cursor: 'pointer' }} onClick={() => toggleMedicine(pkg.description)}>
                              <input type="checkbox" checked={isChecked} onChange={() => toggleMedicine(pkg.description)} style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                              <label style={{ cursor: 'pointer', flex: 1 }}>
                                <span style={{ fontWeight: 'bold', color: isOos ? (isChecked ? '#92400e' : '#991b1b') : '#166534' }}>📦 {pkg.description}</span>
                                {isOos && <span style={{ marginLeft: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '4px', padding: '1px 5px' }}>OUT OF STOCK</span>}
                                <br /><small style={{ color: '#555' }}>{staticEntry ? `${staticEntry.products.length}-product bundle` : 'Bundle'} · DP: N${pkg.dp} · CP: N${pkg.cp} · BV: {pkg.bv}</small>
                                {staticEntry && <><br /><small style={{ fontSize: '0.72rem', color: '#888' }}>Contains: {staticEntry.products.map(p => p.name).join(', ')}</small></>}
                              </label>
                            </div>
                          );
                        })}
                        {filteredProds.map((product, idx) => {
                          const isChecked = selectedMedicines.has(product.description);
                          const isOos = stockLoaded && !branchInStock.has((product.description || '').trim().toLowerCase());
                          const bg = isOos ? (isChecked ? '#fffbeb' : '#fff5f5') : (isChecked ? '#f0fdf4' : 'white');
                          const borderColor = isOos ? (isChecked ? '#fcd34d' : '#fca5a5') : (isChecked ? '#86efac' : '#f0f0f0');
                          const borderWidth = isOos ? '1.5px' : '1px';
                          return (
                            <div key={`prod-${idx}`} style={{ padding: '8px 10px', borderRadius: '6px', display: 'flex', alignItems: 'start', gap: '8px', border: `${borderWidth} solid ${borderColor}`, background: bg, cursor: 'pointer' }} onClick={() => toggleMedicine(product.description)}>
                              <input type="checkbox" checked={isChecked} onChange={() => toggleMedicine(product.description)} style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                              <label style={{ cursor: 'pointer', flex: 1 }}>
                                <span style={{ fontWeight: isChecked ? 600 : 400, color: isOos ? (isChecked ? '#92400e' : '#991b1b') : (isChecked ? '#166534' : '#1e293b') }}>
                                  {product.description}
                                  {isOos && <span style={{ marginLeft: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '4px', padding: '1px 5px' }}>OUT OF STOCK</span>}
                                </span>
                                <br /><small style={{ color: '#666', fontSize: '0.82rem' }}>DP: N${product.dp} · CP: N${product.cp} · BV: {product.bv}</small>
                              </label>
                            </div>
                          );
                        })}
                        {totalVisible === 0 && (
                          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '30px', color: '#9ca3af', fontSize: '0.9rem' }}>No products match "{medSearch}"</div>
                        )}
                      </div>
                      {selectedMedicines.size > 0 && (
                        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                          <h4 style={{ margin: '0 0 8px', color: '#166534', fontSize: '0.9rem' }}>✅ Prescribed ({selectedMedicines.size}):</h4>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {Array.from(selectedMedicines).map((med, i) => (
                              <span key={i} style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '3px 10px', borderRadius: '20px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                {med}
                                <button onClick={() => toggleMedicine(med)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 700, fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>×</button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px', color: '#2c3e50' }}>Consultant Signature</h4>
                        <div style={{ borderBottom: '2px solid #333', width: '200px', marginBottom: '4px' }}></div>
                        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{user?.full_name || user?.username || ''}</p>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                          <p style={{ margin: 0 }}>Tel: {user?.phone || '061-300877'}</p>
                          <p style={{ margin: 0 }}>Email: {user?.email || 'info@dynapharm.com.na'}</p>
                        </div>
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 4px', color: '#2c3e50' }}>Follow-up Date</h4>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#c41e3a' }}>
                          {followUpDate ? new Date(followUpDate).toLocaleDateString('en-GB') : '________________'}
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#666' }}>Next appointment recommended</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'white', border: '2px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#2c3e50' }}>Report Required Flag</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#374151', fontWeight: 500 }}>Report Required:</span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setReportRequired(true)}
                        style={{ padding: '7px 20px', borderRadius: '6px', border: '2px solid', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', background: reportRequired ? '#c41e3a' : '#fff', color: reportRequired ? '#fff' : '#c41e3a', borderColor: '#c41e3a', transition: 'all 0.2s' }}
                      >Yes</button>
                      <button
                        type="button"
                        onClick={() => setReportRequired(false)}
                        style={{ padding: '7px 20px', borderRadius: '6px', border: '2px solid', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', background: !reportRequired ? '#6b7280' : '#fff', color: !reportRequired ? '#fff' : '#6b7280', borderColor: '#6b7280', transition: 'all 0.2s' }}
                      >No</button>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: reportRequired ? '#c41e3a' : '#6b7280', fontWeight: 600 }}>
                      {reportRequired ? '⚠️ Report required for dispensing' : '✓ No report required'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div></div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleSaveReport} disabled={submitting} style={{ padding: '10px 20px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: submitting ? 0.6 : 1 }}>
                      {submitting ? '⏳ Saving...' : '💾 Save Report'}
                    </button>
                    <button onClick={handleSaveReport} disabled={submitting} style={{ padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: submitting ? 0.6 : 1 }}>
                      ✅ Finalize & E-Sign
                    </button>
                    <button onClick={printReport} style={{ padding: '10px 20px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                      🖨️ Print
                    </button>
                    <button onClick={() => setShowReport(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                      📄 Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Book Check-up Appointment Modal ─────────────────────── */}
      {showBooking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>Book Health Check-up</h3>
              <button onClick={() => setShowBooking(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>✕</button>
            </div>
            {bookingError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.84rem', color: '#991b1b' }}>{bookingError}</div>
            )}
            <form onSubmit={handleBookAppointment}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Full Name *</label>
                  <input value={bookingForm.full_name} onChange={e => setBookingForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Client full name" required style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Phone *</label>
                  <input value={bookingForm.phone} onChange={e => setBookingForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. 0812345678" type="tel" required style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Date of Birth</label>
                  <input type="text" value={bookingForm.dob} onChange={e => setBookingForm(f => ({ ...f, dob: e.target.value }))} placeholder="DD/MM/YYYY" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Height (cm)</label>
                  <input type="text" value={bookingForm.height} onChange={e => setBookingForm(f => ({ ...f, height: e.target.value }))} placeholder="e.g. 170" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Weight (kg)</label>
                  <input type="text" value={bookingForm.weight} onChange={e => setBookingForm(f => ({ ...f, weight: e.target.value }))} placeholder="e.g. 65" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Date *</label>
                  <input type="date" value={bookingForm.date} onChange={e => setBookingForm(f => ({ ...f, date: e.target.value }))} required style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Time *</label>
                  <input type="time" value={bookingForm.time} onChange={e => setBookingForm(f => ({ ...f, time: e.target.value }))} required style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Branch *</label>
                  <select value={bookingForm.branch} onChange={e => setBookingForm(f => ({ ...f, branch: e.target.value }))} required style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', background: '#fff' }}>
                    <option value="">Select branch…</option>
                    {BRANCH_DETAILS.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', paddingTop: 10, marginTop: 4 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Client Type</label>
                  <select value={bookingForm.membershipStatus} onChange={e => setBookingForm(f => ({ ...f, membershipStatus: e.target.value }))} style={{ width: '100%', maxWidth: 280, boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', background: '#fff' }}>
                    <option value="referred">🤝 Non-Member (Referred)</option>
                    <option value="member">🏅 Registered Member</option>
                  </select>
                </div>
                {bookingForm.membershipStatus === 'member' ? (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Member NB Number</label>
                    <input style={{ width: '100%', maxWidth: 320, boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} placeholder="e.g. NB001234" value={bookingForm.nbNumber} onChange={e => setBookingForm(f => ({ ...f, nbNumber: e.target.value }))} />
                  </div>
                ) : (
                  <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Referring Distributor</label>
                    {bookingForm.referralName ? (
                      <div style={{ padding: '9px 12px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#166534', fontSize: '0.88rem' }}>{bookingForm.referralName}</div>
                          {bookingForm.referralNbNumber && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>NB: {bookingForm.referralNbNumber}</div>}
                        </div>
                        <button type="button" onClick={clearBookingReferral} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1.05rem', fontWeight: 700 }}>✕</button>
                      </div>
                    ) : (
                      <>
                        <input style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem' }} placeholder="Type name or NB number to search distributors…" value={bookingDistQuery} onChange={e => setBookingDistQuery(e.target.value)} autoComplete="off" />
                        {bookingDistLoading && <span style={{ position: 'absolute', right: 12, top: 34, fontSize: '0.78rem', color: '#6b7280' }}>Searching…</span>}
                        {bookingDistOpen && bookingDistResults.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 9999, maxHeight: 220, overflowY: 'auto' }}>
                            {bookingDistResults.map((d, i) => {
                              const nm = d.distributor_name || d.full_name || d.name || '';
                              const nb = d.distributor_code || d.nb_number || '';
                              return (
                                <div key={i} onClick={() => selectBookingDist(d)}
                                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.88rem' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{nm}</span>
                                  {nb && <span style={{ marginLeft: 8, color: '#64748b', fontSize: '0.8rem' }}>{nb}</span>}
                                  {d.branch && <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: '0.75rem' }}>{d.branch}</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Notes (optional)</label>
                  <textarea value={bookingForm.notes} onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes…" rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setShowBooking(false)} style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: 10, background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Cancel</button>
                <button type="submit" disabled={bookingSubmitting} style={{ padding: '10px 24px', border: 'none', borderRadius: 10, background: bookingSubmitting ? '#94a3b8' : 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', cursor: bookingSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                  {bookingSubmitting ? 'Booking…' : '✓ Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckupEditForm({ form, setForm }) {
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '3px' };
  const grp = { marginBottom: '10px' };

  const memberStatus = form.membershipStatus || 'referred';
  const isMember = memberStatus === 'member';

  const [distQuery, setDistQuery] = useState('');
  const [distResults, setDistResults] = useState([]);
  const [distLoading, setDistLoading] = useState(false);
  const [distOpen, setDistOpen] = useState(false);

  useEffect(() => {
    if (!distQuery.trim() || distQuery.length < 2) { setDistResults([]); setDistOpen(false); return; }
    setDistLoading(true);
    api.distributors.search(distQuery)
      .then(data => {
        const list = Array.isArray(data) ? data : data.distributors || [];
        setDistResults(list.slice(0, 10));
        setDistOpen(list.length > 0);
      })
      .catch(() => setDistResults([]))
      .finally(() => setDistLoading(false));
  }, [distQuery]);

  const selectDist = (d) => {
    const name = d.distributor_name || d.full_name || d.name || '';
    const nb = d.distributor_code || d.nb_number || '';
    upd('referralName', name);
    upd('referralNbNumber', nb);
    setDistQuery('');
    setDistOpen(false);
  };

  const clearReferral = () => { upd('referralName', ''); upd('referralNbNumber', ''); setDistQuery(''); };

  return (
    <div>
      <h4 style={{ color: '#c41e3a', marginBottom: '12px', fontSize: '0.95rem' }}>Personal Details</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={grp}><label style={lbl}>Full Name</label><input style={inp} value={form.full_name || ''} onChange={e => upd('full_name', e.target.value)} /></div>
        <div style={grp}><label style={lbl}>Phone</label><input style={inp} value={form.phone || ''} onChange={e => upd('phone', e.target.value)} /></div>
        <div style={grp}><label style={lbl}>Email</label><input style={inp} value={form.email || ''} onChange={e => upd('email', e.target.value)} /></div>
        <div style={grp}><label style={lbl}>Date of Birth</label><input type="date" style={inp} value={form.dob || ''} onChange={e => upd('dob', e.target.value)} /></div>
        <div style={grp}>
          <label style={lbl}>Gender</label>
          <select style={inp} value={form.gender || ''} onChange={e => upd('gender', e.target.value)}>
            <option value="">Select</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        </div>
        <div style={grp}><label style={lbl}>Height (cm)</label><input type="number" style={inp} value={form.height || ''} onChange={e => upd('height', e.target.value)} /></div>
        <div style={grp}><label style={lbl}>Weight (kg)</label><input type="number" style={inp} value={form.weight || ''} onChange={e => upd('weight', e.target.value)} /></div>
      </div>

      <h4 style={{ color: '#c41e3a', marginBottom: '12px', fontSize: '0.95rem', borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>Client Type / Referral</h4>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ ...grp, marginBottom: '12px' }}>
          <label style={lbl}>Membership Status</label>
          <select style={{ ...inp, maxWidth: '260px' }} value={memberStatus} onChange={e => upd('membershipStatus', e.target.value)}>
            <option value="referred">🤝 Non-Member (Referred)</option>
            <option value="member">🏅 Registered Member</option>
          </select>
        </div>

        {isMember ? (
          <div style={grp}>
            <label style={lbl}>Member NB Number</label>
            <input style={{ ...inp, maxWidth: '320px' }} placeholder="e.g. NB001234" value={form.nbNumber || ''} onChange={e => upd('nbNumber', e.target.value)} />
          </div>
        ) : (
          <div style={{ position: 'relative', maxWidth: '480px' }}>
            <label style={lbl}>Referring Distributor</label>
            {form.referralName ? (
              <div style={{ padding: '9px 12px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#166534', fontSize: '0.9rem' }}>{form.referralName}</div>
                  {form.referralNbNumber && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>NB: {form.referralNbNumber}</div>}
                </div>
                <button type="button" onClick={clearReferral} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1.05rem', fontWeight: 700 }}>✕</button>
              </div>
            ) : (
              <>
                <input style={inp} placeholder="Type name or NB number to search distributors..." value={distQuery} onChange={e => setDistQuery(e.target.value)} autoComplete="off" />
                {distLoading && <span style={{ position: 'absolute', right: '10px', top: '34px', fontSize: '0.8rem', color: '#6b7280' }}>Searching…</span>}
                {distOpen && distResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999, maxHeight: '220px', overflowY: 'auto' }}>
                    {distResults.map((d, i) => {
                      const dName = d.distributor_name || d.full_name || d.name || '';
                      const dNb = d.distributor_code || d.nb_number || '';
                      return (
                        <div key={i} onClick={() => selectDist(d)}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.88rem' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{dName}</span>
                          {dNb && <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '0.8rem' }}>{dNb}</span>}
                          {d.branch && <span style={{ marginLeft: '8px', color: '#9ca3af', fontSize: '0.78rem' }}>{d.branch}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <h4 style={{ color: '#c41e3a', marginBottom: '12px', fontSize: '0.95rem', borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>Health Assessment</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ ...grp, gridColumn: '1 / -1' }}><label style={lbl}>Primary Reason for Visit</label><input style={inp} placeholder="e.g. Weight management, Joint pain..." value={form.primary_reason || ''} onChange={e => upd('primary_reason', e.target.value)} /></div>
        <div style={grp}>
          <label style={lbl}>Water Intake</label>
          <select style={inp} value={form.water_intake || ''} onChange={e => upd('water_intake', e.target.value)}>
            <option value="">Select</option><option value="less1">Less than 1L/day</option><option value="1-2">1–2 L/day</option><option value="2-3">2–3 L/day</option><option value="3+">3+ L/day</option>
          </select>
        </div>
        <div style={grp}>
          <label style={lbl}>Exercise Frequency</label>
          <select style={inp} value={form.exercise_freq || ''} onChange={e => upd('exercise_freq', e.target.value)}>
            <option value="">Select</option><option value="never">Never</option><option value="1-2">1–2×/week</option><option value="3-4">3–4×/week</option><option value="5+">5+×/week</option>
          </select>
        </div>
        <div style={grp}>
          <label style={lbl}>Sleep (hours/night)</label>
          <select style={inp} value={form.sleep_hours || ''} onChange={e => upd('sleep_hours', e.target.value)}>
            <option value="">Select</option><option value="<5">&lt;5 hrs</option><option value="5-6">5–6 hrs</option><option value="7-8">7–8 hrs</option><option value="8+">8+ hrs</option>
          </select>
        </div>
        <div style={grp}>
          <label style={lbl}>Stress Level (1–10)</label>
          <select style={inp} value={form.stress_level || ''} onChange={e => upd('stress_level', e.target.value)}>
            <option value="">Select</option>
            {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ ...grp, gridColumn: '1 / -1' }}><label style={lbl}>Current Medications</label><input style={inp} placeholder="List any medications..." value={form.current_medications || ''} onChange={e => upd('current_medications', e.target.value)} /></div>
        <div style={{ ...grp, gridColumn: '1 / -1' }}><label style={lbl}>Allergies</label><input style={inp} placeholder="Known allergies..." value={form.allergies || ''} onChange={e => upd('allergies', e.target.value)} /></div>
        <div style={{ ...grp, gridColumn: '1 / -1' }}><label style={lbl}>Medical History (comma-separated)</label><input style={inp} placeholder="e.g. Diabetes, Hypertension..." value={form.medical_history || ''} onChange={e => upd('medical_history', e.target.value)} /></div>
      </div>
    </div>
  );
}

function CheckupDetailContent({ apt }) {
  const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
  const visitType = (apt.status || '').toLowerCase() === 'walk-in' ? 'Walk-in' : 'Book Appointment';
  const dateStr = apt.date ? new Date(apt.date).toLocaleDateString('en-GB') : '';
  const timeStr = apt.time ? apt.time.slice(0, 5) : '';
  const rawType = data.membershipStatus || data.membership_status || data.customer_type || data.clientType || 'referred';
  const clientType = rawType === 'member' ? '🏅 Registered Member (Distributor)' : '👤 Non-Member (Referred)';

  const bmi = data.bmi || (() => {
    const h = parseFloat(data.height); const w = parseFloat(data.weight);
    return h && w ? (w / ((h / 100) ** 2)).toFixed(1) : null;
  })();
  const bmiCat = data.bmi_category || (bmi ? (parseFloat(bmi) < 18.5 ? 'Underweight' : parseFloat(bmi) < 25 ? 'Normal' : parseFloat(bmi) < 30 ? 'Overweight' : 'Obese') : '');

  const primaryReason = data.primary_reason || data.primaryReason || data.concern || '';
  const waterIntake = data.water_intake || data.waterIntake || '';
  const exerciseFreq = data.exercise_freq || data.exerciseFreq || '';
  const sleepHours = data.sleep_hours || data.sleepHours || '';
  const stressLevel = data.stress_level || data.stressLevel || '';
  const medications = data.current_medications || data.currentMedications || data.medications || '';
  const allergies = data.allergies || '';
  const medicalHistory = Array.isArray(data.medical_history) ? data.medical_history.join(', ') : (data.medical_history || (Array.isArray(data.medicalHistory) ? data.medicalHistory.join(', ') : (data.medicalHistory || '')));

  const rawSym = data.symptoms;
  const symptomsObj = rawSym && typeof rawSym === 'object' && !Array.isArray(rawSym) ? rawSym : {};
  const symptomsList = Array.isArray(rawSym) ? rawSym : Object.values(symptomsObj).flat();

  const fieldStyle = { marginBottom: '8px', fontSize: '0.9rem', color: '#374151' };
  const labelStyle = { fontWeight: 600, color: '#1e293b' };
  const sectionStyle = { marginBottom: '20px' };
  const sectionTitleStyle = { fontSize: '1rem', fontWeight: 700, color: '#c41e3a', marginBottom: '12px', paddingBottom: '6px', borderBottom: '2px solid #fee2e2' };

  return (
    <div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Visit Information</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={fieldStyle}><span style={labelStyle}>Visit Type:</span> {visitType}</div>
          <div style={fieldStyle}><span style={labelStyle}>Branch:</span> {apt.branch || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Date:</span> {dateStr || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Time:</span> {timeStr || 'N/A'}</div>
        </div>
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Personal Information</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={fieldStyle}><span style={labelStyle}>Full Name:</span> {apt.full_name || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Phone:</span> {apt.phone || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Email:</span> {apt.email || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Gender:</span> {data.gender || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Date of Birth:</span> {data.dob || 'N/A'}</div>
          {data.height && <div style={fieldStyle}><span style={labelStyle}>Height:</span> {data.height} cm</div>}
          {data.weight && <div style={fieldStyle}><span style={labelStyle}>Weight:</span> {data.weight} kg</div>}
          {bmi && (
            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <span style={labelStyle}>BMI:</span>{' '}
              <span style={{ fontWeight: 700, color: parseFloat(bmi) < 18.5 ? '#2563eb' : parseFloat(bmi) < 25 ? '#16a34a' : parseFloat(bmi) < 30 ? '#d97706' : '#dc2626' }}>
                {bmi} — {bmiCat}
              </span>
            </div>
          )}
        </div>
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Client Type</h4>
        <div style={fieldStyle}><span style={labelStyle}>Type:</span> {clientType}</div>
        {rawType !== 'member' && (
          <div style={fieldStyle}><span style={labelStyle}>Referred By:</span> {data.referral_name || data.referralName || data.distributorName || 'Dynapharm Namibia'} ({data.referral_nb || data.referralNB || data.distributorNB || 'NB005676'})</div>
        )}
        {rawType === 'member' && (data.referral_nb || data.nb_number) && (
          <div style={fieldStyle}><span style={labelStyle}>NB Number:</span> {data.referral_nb || data.nb_number}</div>
        )}
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Health Assessment</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Primary Reason:</span> {primaryReason || <em style={{ color: '#9ca3af' }}>Not provided</em>}</div>
          <div style={fieldStyle}><span style={labelStyle}>Water Intake:</span> {waterIntake || <em style={{ color: '#9ca3af' }}>Not specified</em>}</div>
          <div style={fieldStyle}><span style={labelStyle}>Exercise:</span> {exerciseFreq || <em style={{ color: '#9ca3af' }}>Not specified</em>}</div>
          <div style={fieldStyle}><span style={labelStyle}>Sleep:</span> {sleepHours ? `${sleepHours} hrs/night` : <em style={{ color: '#9ca3af' }}>Not specified</em>}</div>
          <div style={fieldStyle}><span style={labelStyle}>Stress Level:</span> {stressLevel ? `${stressLevel}/10` : <em style={{ color: '#9ca3af' }}>Not specified</em>}</div>
          <div style={fieldStyle}><span style={labelStyle}>Medications:</span> {medications || <em style={{ color: '#9ca3af' }}>None</em>}</div>
          <div style={fieldStyle}><span style={labelStyle}>Allergies:</span> {allergies || <em style={{ color: '#9ca3af' }}>None</em>}</div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Medical History:</span> {medicalHistory || <em style={{ color: '#9ca3af' }}>None</em>}</div>
        </div>
      </div>
      {symptomsList.length > 0 && (
        <div style={sectionStyle}>
          <h4 style={sectionTitleStyle}>Reported Symptoms</h4>
          {Object.keys(symptomsObj).length > 0 ? (
            Object.entries(symptomsObj).map(([sys, syms]) => Array.isArray(syms) && syms.length > 0 ? (
              <div key={sys} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>{sys}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {syms.map((s, i) => <span key={i} style={{ background: '#fee2e2', color: '#c41e3a', padding: '3px 10px', borderRadius: '12px', fontSize: '0.82rem' }}>{s}</span>)}
                </div>
              </div>
            ) : null)
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {symptomsList.map((s, i) => <span key={i} style={{ background: '#fee2e2', color: '#c41e3a', padding: '3px 10px', borderRadius: '12px', fontSize: '0.82rem' }}>{s}</span>)}
            </div>
          )}
        </div>
      )}
      {data.acknowledgedBy && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
          <div style={{ fontSize: '0.85rem', color: '#059669' }}>
            <strong>Acknowledged by:</strong> {data.acknowledgedBy} ({data.acknowledgedInitials || ''}) on {data.acknowledgedDate || ''}
          </div>
        </div>
      )}
    </div>
  );
}

function ClientsSection() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [referralModal, setReferralModal] = useState(null);

  useEffect(() => {
    api.clients.list()
      .then(data => setClients(Array.isArray(data) ? data : data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showAllClients = () => { setSearch(''); setBranchFilter(''); };

  const filtered = clients.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      const match = (c.full_name || c.fullName || c.name || '').toLowerCase().includes(q)
        || (c.phone || '').includes(q)
        || (c.reference || c.referenceNumber || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (branchFilter && (c.branch || '') !== branchFilter) return false;
    return true;
  }).sort((a, b) => new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0));

  const openClientDetails = (client, edit = false) => {
    setSelectedClient(client);
    setEditMode(edit);
    if (edit) {
      setEditForm({ ...client });
    }
  };

  const handleSaveClient = async () => {
    try {
      await api.clients.update(selectedClient.id, editForm);
      setClients(prev => prev.map(c => c.id === selectedClient.id ? { ...c, ...editForm } : c));
      setEditMode(false);
      setSelectedClient({ ...selectedClient, ...editForm });
    } catch (err) {
      alert('Failed to save: ' + (err.message || 'Unknown error'));
    }
  };

  const printClientDetails = (client) => {
    const w = window.open('', '_blank', 'width=850,height=700');
    if (!w) return;
    const name = client.full_name || client.fullName || client.name || '';
    const memberStatus = client.membershipStatus || client.membership_status || 'referred';
    const symptoms = Array.isArray(client.symptoms) ? client.symptoms : [];
    const medHistory = Array.isArray(client.medicalHistory) ? client.medicalHistory.join(', ') : (client.medicalHistory || client.medical_history || 'None');
    const e = (v) => escHtml(String(v || ''));
    w.document.write(`<!DOCTYPE html><html><head><title>Client Form — ${e(name)}</title>
    <style>
      @media print { body{margin:0;} @page{size:A4;margin:14mm;} .no-print{display:none;} }
      * { box-sizing:border-box; }
      body { font-family:Arial,sans-serif; font-size:12px; color:#1e293b; margin:20px; line-height:1.5; }
      .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #c41e3a; padding-bottom:12px; margin-bottom:18px; }
      .logo-area h2 { color:#c41e3a; font-size:18px; margin:0; }
      .logo-area p { color:#64748b; font-size:11px; margin:2px 0 0; }
      .ref-box { text-align:right; }
      .ref-box .ref-num { font-size:20px; font-weight:900; color:#1e293b; }
      .ref-box .ref-label { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; }
      .section { margin-bottom:16px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
      .section-title { background:#1e3a5f; color:white; padding:7px 14px; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
      .section-body { padding:12px 14px; }
      .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; }
      .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 20px; }
      .field { margin-bottom:5px; }
      .field-label { font-size:10px; color:#94a3b8; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
      .field-value { font-size:12px; color:#1e293b; font-weight:600; }
      .tag { display:inline-block; padding:2px 10px; background:#fee2e2; color:#c41e3a; border-radius:12px; font-size:11px; margin:2px 3px 2px 0; }
      .badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; }
      .badge-member { background:#dcfce7; color:#16a34a; }
      .badge-referred { background:#fef9c3; color:#b45309; }
      .sig-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; margin-top:30px; }
      .sig-line { border-top:1px solid #aaa; padding-top:4px; font-size:10px; color:#666; text-align:center; }
      .print-btn { background:#1e3a5f; color:white; border:none; padding:9px 20px; border-radius:7px; font-size:12px; cursor:pointer; margin-bottom:14px; }
    </style></head><body>
    <button class="no-print print-btn" onclick="window.print()">🖨️ Print Form</button>
    <div class="header">
      <div class="logo-area">
        <h2>Dynapharm International Namibia</h2>
        <p>Health · Wealth · Freedom</p>
        ${client.branch ? `<p style="color:#c41e3a;font-weight:600;margin-top:4px;">${e(client.branch)} Branch</p>` : ''}
      </div>
      <div class="ref-box">
        <div class="ref-label">Client Reference</div>
        <div class="ref-num">${e(client.reference || client.referenceNumber || client.id || 'N/A')}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">Registered: ${client.timestamp ? new Date(client.timestamp).toLocaleDateString('en-GB') : (client.created_at ? new Date(client.created_at).toLocaleDateString('en-GB') : 'N/A')}</div>
        <div style="margin-top:6px;"><span class="badge ${memberStatus === 'member' ? 'badge-member' : 'badge-referred'}">${memberStatus === 'member' ? '🏅 Registered Member' : '🤝 Referred Client'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Personal Information</div>
      <div class="section-body">
        <div class="grid2">
          <div class="field"><div class="field-label">Full Name</div><div class="field-value">${e(name)}</div></div>
          <div class="field"><div class="field-label">Namibian ID (NB#)</div><div class="field-value">${e(client.nbNumber || client.nb_number || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Date of Birth</div><div class="field-value">${e(client.dob || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Age</div><div class="field-value">${e(client.age || 'Not provided')} ${client.age ? 'years' : ''}</div></div>
          <div class="field"><div class="field-label">Gender</div><div class="field-value">${e(client.gender || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Phone</div><div class="field-value">${e(client.phone || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Email</div><div class="field-value">${e(client.email || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Height</div><div class="field-value">${e(client.height || 'Not provided')} ${client.height ? 'cm' : ''}</div></div>
          <div class="field"><div class="field-label">Weight</div><div class="field-value">${e(client.weight || 'Not provided')} ${client.weight ? 'kg' : ''}</div></div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Member / Referral Information</div>
      <div class="section-body">
        <div class="grid2">
          ${memberStatus === 'member' ? `
          <div class="field"><div class="field-label">Member ID</div><div class="field-value">${e(client.memberId || client.member_id || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Member Since</div><div class="field-value">${e(client.memberSince || client.member_since || 'Not provided')}</div></div>
          ` : `
          <div class="field"><div class="field-label">Referred By</div><div class="field-value">${e(client.referralName || client.referral_name || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Referral NB#</div><div class="field-value">${e(client.referralNbNumber || client.referral_nb || 'Not provided')}</div></div>
          `}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Health Assessment</div>
      <div class="section-body">
        <div class="grid3" style="margin-bottom:10px;">
          <div class="field"><div class="field-label">Primary Reason for Visit</div><div class="field-value">${e(client.primaryReason || client.primary_reason || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Water Intake</div><div class="field-value">${e(client.waterIntake || client.water_intake || 'Not specified')}</div></div>
          <div class="field"><div class="field-label">Exercise Frequency</div><div class="field-value">${e(client.exerciseFreq || client.exercise_freq || 'Not specified')}</div></div>
          <div class="field"><div class="field-label">Sleep (hours/night)</div><div class="field-value">${e(client.sleepHours || client.sleep_hours || 'Not specified')}</div></div>
          <div class="field"><div class="field-label">Stress Level (1–10)</div><div class="field-value">${e(client.stressLevel || client.stress_level || 'Not specified')}${(client.stressLevel || client.stress_level) ? '/10' : ''}</div></div>
          <div class="field"><div class="field-label">Current Medications</div><div class="field-value">${e(client.currentMedications || client.medications || 'None')}</div></div>
          <div class="field"><div class="field-label">Allergies</div><div class="field-value">${e(client.allergies || 'None')}</div></div>
        </div>
        <div class="field"><div class="field-label">Medical History</div><div class="field-value">${e(medHistory)}</div></div>
        ${symptoms.length > 0 ? `<div style="margin-top:10px;"><div class="field-label" style="margin-bottom:6px;">Symptoms / Complaints</div><div>${symptoms.map(s => `<span class="tag">${e(s)}</span>`).join('')}</div></div>` : ''}
      </div>
    </div>

    <div class="sig-grid">
      <div class="sig-line">Client Signature: ___________________</div>
      <div class="sig-line">Consultant: ___________________</div>
      <div class="sig-line">Date: ___________________</div>
    </div>

    </body></html>`);
    w.document.close();
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: '#1e293b' }}>Client Search</h3>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input
          type="text"
          placeholder="Search by name, phone, or reference..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}
        />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}>
          <option value="">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <button onClick={() => {}} style={{ background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Search</button>
        <button onClick={showAllClients} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Show All</button>
      </div>
      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
          <h3>📋 No clients found</h3>
          <p>{branchFilter ? 'No clients registered for the selected branch.' : 'Clients will appear here once they register through the client portal.'}</p>
        </div>
      ) : (
        <div>
          {filtered.map(c => {
            const name = c.full_name || c.fullName || c.name || 'Unknown';
            const ref = c.reference || c.referenceNumber || '';
            const memberStatus = c.membershipStatus || c.membership_status || 'referred';
            return (
              <div key={c.id} className="client-card" style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '12px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                  <div>
                    <h4 style={{ color: '#c41e3a', marginBottom: '5px', margin: 0, fontSize: '1rem', fontWeight: 600 }}>{name}</h4>
                    <p style={{ color: '#7f8c8d', fontSize: '0.9rem', margin: '2px 0 0' }}>Reference: {ref}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ background: memberStatus === 'member' ? '#e8f5e9' : '#fff3cd', color: memberStatus === 'member' ? '#27ae60' : '#f39c12', padding: '4px 8px', borderRadius: '3px', fontSize: '0.8rem' }}>
                      {memberStatus === 'member' ? '👤 Member' : '🤝 Referred'}
                    </span>
                    {c.branch && <span style={{ background: '#e8f5e9', color: '#27ae60', padding: '4px 8px', borderRadius: '3px', fontSize: '0.8rem', marginLeft: '5px' }}>{c.branch}</span>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '15px' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}><strong>📞 Phone:</strong> {c.phone || 'N/A'}</p>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}><strong>🎂 DOB:</strong> {c.dob || 'Not provided'}</p>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}><strong>⚧ Gender:</strong> {c.gender || 'Not provided'}</p>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}><strong>📧 Email:</strong> {c.email || 'Not provided'}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => openClientDetails(c, false)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>👁️ View Details</button>
                  <button onClick={() => openClientDetails(c, true)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>✏️ Edit</button>
                  <button onClick={() => printClientDetails(c)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🖨️ Print</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {referralModal && (
        <ReferralEditModal
          client={referralModal}
          onClose={() => setReferralModal(null)}
          onSaved={(updated) => {
            setClients(prev => prev.map(c => c.id === referralModal.id ? { ...c, ...updated } : c));
            setSelectedClient(prev => prev ? { ...prev, ...updated } : prev);
            setReferralModal(null);
          }}
        />
      )}
      {selectedClient && (
        <div onClick={e => { if (e.target === e.currentTarget) { setSelectedClient(null); setEditMode(false); } }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999999, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '900px', margin: '20px auto', background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, color: '#1f2937', fontSize: '1.1rem' }}>{editMode ? 'Edit Client Details' : 'Client Details'} - {selectedClient.reference || selectedClient.referenceNumber || ''}</h3>
              <button onClick={() => { setSelectedClient(null); setEditMode(false); }} style={{ padding: '8px 16px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '24px' }}>
              {editMode ? (
                <ClientEditForm form={editForm} setForm={setEditForm} />
              ) : (
                <ClientViewDetails client={selectedClient} />
              )}
            </div>
            <div style={{ textAlign: 'center', padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {editMode ? (
                <>
                  <button onClick={handleSaveClient} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>💾 Save Changes</button>
                  <button onClick={() => setEditMode(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>❌ Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => setReferralModal(selectedClient)} style={{ padding: '10px 20px', background: '#c41e3a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>🔗 Edit Referral</button>
                  <button onClick={() => { setEditForm({ ...selectedClient }); setEditMode(true); }} style={{ padding: '10px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>✏️ Edit Details</button>
                  <button onClick={() => printClientDetails(selectedClient)} style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>🖨️ Print Details</button>
                  <button onClick={() => { setSelectedClient(null); setEditMode(false); }} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Close</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientViewDetails({ client }) {
  const name = client.full_name || client.fullName || client.name || '';
  const memberStatus = client.membershipStatus || client.membership_status || 'referred';
  const symptoms = Array.isArray(client.symptoms) ? client.symptoms : [];

  const sectionStyle = { marginBottom: '20px', background: '#f8f9fa', padding: '16px', borderRadius: '8px' };
  const sectionTitleStyle = { fontSize: '1rem', fontWeight: 600, color: '#2c3e50', marginBottom: '12px' };
  const gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' };
  const fieldStyle = { fontSize: '0.9rem', color: '#374151', margin: 0 };

  return (
    <div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Personal Information</h4>
        <div style={gridStyle}>
          <div style={fieldStyle}><strong>Full Name:</strong> {name}</div>
          <div style={fieldStyle}><strong>Namibian ID:</strong> {client.nbNumber || client.nb_number || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Date of Birth:</strong> {client.dob || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Age:</strong> {client.age || 'Not provided'} years</div>
          <div style={fieldStyle}><strong>Gender:</strong> {client.gender || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Phone:</strong> {client.phone || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Email:</strong> {client.email || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Height:</strong> {client.height || 'Not provided'} cm</div>
          <div style={fieldStyle}><strong>Weight:</strong> {client.weight || 'Not provided'} kg</div>
        </div>
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Member/Referral Information</h4>
        <div style={gridStyle}>
          <div style={fieldStyle}><strong>Membership Status:</strong> {memberStatus === 'member' ? 'Registered Member' : 'Referred by Member'}</div>
          {memberStatus === 'member' ? (
            <>
              <div style={fieldStyle}><strong>Member ID:</strong> {client.memberId || client.member_id || 'Not provided'}</div>
              <div style={fieldStyle}><strong>Member Since:</strong> {client.memberSince || client.member_since || 'Not provided'}</div>
            </>
          ) : (
            <>
              <div style={fieldStyle}><strong>Referred by:</strong> {client.referralName || client.referral_name || 'Not provided'}</div>
              <div style={fieldStyle}><strong>Referral NB:</strong> {client.referralNbNumber || client.referral_nb || 'Not provided'}</div>
            </>
          )}
        </div>
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Health Assessment</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div style={fieldStyle}><strong>Primary Reason:</strong> {client.primaryReason || client.primary_reason || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Water Intake:</strong> {client.waterIntake || client.water_intake || 'Not specified'}</div>
          <div style={fieldStyle}><strong>Exercise:</strong> {client.exerciseFreq || client.exercise_freq || 'Not specified'}</div>
          <div style={fieldStyle}><strong>Sleep:</strong> {client.sleepHours || client.sleep_hours ? `${client.sleepHours || client.sleep_hours} hrs/night` : 'Not specified'}</div>
          <div style={fieldStyle}><strong>Stress Level:</strong> {client.stressLevel || client.stress_level ? `${client.stressLevel || client.stress_level}/10` : 'Not specified'}</div>
          <div style={fieldStyle}><strong>Current Medications:</strong> {client.currentMedications || client.medications || 'None'}</div>
          <div style={fieldStyle}><strong>Allergies:</strong> {client.allergies || 'None'}</div>
        </div>
        <div style={fieldStyle}><strong>Medical History:</strong> {Array.isArray(client.medicalHistory) ? client.medicalHistory.join(', ') : (client.medicalHistory || client.medical_history || 'None')}</div>
      </div>
      {symptoms.length > 0 && (
        <div style={sectionStyle}>
          <h4 style={sectionTitleStyle}>Symptoms</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {symptoms.map((s, i) => (
              <span key={i} style={{ display: 'inline-block', padding: '4px 12px', background: '#fee2e2', color: '#c41e3a', borderRadius: '16px', fontSize: '0.85rem' }}>{s}</span>
            ))}
          </div>
        </div>
      )}
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Registration Details</h4>
        <div style={gridStyle}>
          <div style={fieldStyle}><strong>Registration Date:</strong> {client.timestamp ? new Date(client.timestamp).toLocaleDateString('en-GB') : (client.created_at ? new Date(client.created_at).toLocaleDateString('en-GB') : 'N/A')}</div>
          <div style={fieldStyle}><strong>Branch:</strong> {client.branch || 'N/A'}</div>
          <div style={fieldStyle}><strong>Signature:</strong> {client.signature || 'Not signed'}</div>
        </div>
        {client.edited_by_consultant && (
          <div style={{ marginTop: '10px', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '0.85rem', color: '#1d4ed8' }}>
            ✏️ <strong>Edited by consultant:</strong> {client.edited_by_consultant_name || 'Consultant'}
            {client.edited_by_consultant_at && <span style={{ marginLeft: '8px', color: '#64748b' }}>{new Date(client.edited_by_consultant_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ReferralEditModal({ client, onClose, onSaved }) {
  const iStyle = { width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' };
  const lStyle = { display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 5 };

  const [membership, setMembership] = useState(client.membershipStatus || client.membership_status || 'referred');
  const [referralName, setReferralName] = useState(client.referralName || client.referral_name || '');
  const [referralNb, setReferralNb] = useState(client.referralNbNumber || client.referral_nb || '');
  const [nbNumber, setNbNumber] = useState(client.nbNumber || client.nb_number || '');
  const [distQuery, setDistQuery] = useState('');
  const [distResults, setDistResults] = useState([]);
  const [distLoading, setDistLoading] = useState(false);
  const [distOpen, setDistOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveAlert, setSaveAlert] = useState(null);

  const isMember = membership === 'member';

  useEffect(() => {
    if (!distQuery.trim() || distQuery.length < 2) { setDistResults([]); setDistOpen(false); return; }
    setDistLoading(true);
    api.distributors.search(distQuery)
      .then(d => { const list = Array.isArray(d) ? d : d.distributors || []; setDistResults(list.slice(0, 10)); setDistOpen(list.length > 0); })
      .catch(() => setDistResults([]))
      .finally(() => setDistLoading(false));
  }, [distQuery]);

  const selectDist = (d) => {
    const nm = d.distributor_name || d.full_name || d.name || '';
    const nb = d.distributor_code || d.nb_number || '';
    setReferralName(nm); setReferralNb(nb);
    setDistQuery(''); setDistOpen(false);
  };

  const clearReferral = () => { setReferralName(''); setReferralNb(''); setDistQuery(''); };

  const handleSave = async () => {
    setSaving(true); setSaveAlert(null);
    try {
      const payload = {
        membershipStatus: membership, membership_status: membership,
        referralName:    isMember ? '' : referralName,
        referral_name:   isMember ? '' : referralName,
        referralNbNumber: isMember ? '' : referralNb,
        referral_nb:     isMember ? '' : referralNb,
        nbNumber:        isMember ? nbNumber : '',
        nb_number:       isMember ? nbNumber : '',
      };
      await api.clients.update(client.id, payload);
      onSaved(payload);
    } catch (err) {
      setSaveAlert(err.message || 'Save failed — please try again');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000001, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '18px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', opacity: 0.7, marginBottom: 4, textTransform: 'uppercase' }}>Edit Referral Details</div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{client.full_name || client.fullName || client.name}</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: 2 }}>{client.reference || client.referenceNumber || client.id}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', padding: '7px 14px', cursor: 'pointer', fontSize: '1rem', fontWeight: 700 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Membership toggle */}
          <div style={{ marginBottom: 18 }}>
            <label style={lStyle}>Client Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ v: 'referred', label: '🤝 Non-Member (Referred)' }, { v: 'member', label: '🏅 Registered Member' }].map(opt => (
                <button key={opt.v} onClick={() => setMembership(opt.v)}
                  style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: membership === opt.v ? '2px solid #c41e3a' : '1.5px solid #d1d5db', background: membership === opt.v ? '#fff0f3' : '#f8fafc', color: membership === opt.v ? '#c41e3a' : '#374151', fontWeight: membership === opt.v ? 700 : 500, fontSize: '0.83rem', cursor: 'pointer' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Referral distributor (non-member) */}
          {!isMember && (
            <div style={{ marginBottom: 16 }}>
              <label style={lStyle}>Referring Distributor</label>
              {referralName ? (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#166534', fontSize: '0.92rem' }}>{referralName}</div>
                    {referralNb && <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>NB: {referralNb}</div>}
                  </div>
                  <button onClick={clearReferral} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1.1rem', fontWeight: 700 }}>✕</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input style={iStyle} placeholder="Type name or NB number to search…"
                    value={distQuery} onChange={e => setDistQuery(e.target.value)} autoComplete="off" />
                  {distLoading && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', color: '#6b7280' }}>Searching…</span>}
                  {distOpen && distResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 9999, maxHeight: 220, overflowY: 'auto' }}>
                      {distResults.map((d, i) => {
                        const nm = d.distributor_name || d.full_name || d.name || '';
                        const nb = d.distributor_code || d.nb_number || '';
                        return (
                          <div key={i} onClick={() => selectDist(d)}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.88rem' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{nm}</span>
                            {nb && <span style={{ marginLeft: 8, color: '#64748b', fontSize: '0.8rem' }}>{nb}</span>}
                            {d.branch && <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: '0.75rem' }}>{d.branch}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#6b7280' }}>
                Search by distributor name or NB number, then select from the list.
              </div>
            </div>
          )}

          {/* Member NB number */}
          {isMember && (
            <div style={{ marginBottom: 16 }}>
              <label style={lStyle}>Member NB Number</label>
              <input style={{ ...iStyle, maxWidth: 280 }} placeholder="e.g. NB001234"
                value={nbNumber} onChange={e => setNbNumber(e.target.value)} />
            </div>
          )}

          {saveAlert && (
            <div style={{ padding: '9px 12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.84rem', marginBottom: 4 }}>
              ⚠️ {saveAlert}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', border: '1.5px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: saving ? '#9ca3af' : '#c41e3a', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
            {saving ? 'Saving…' : '✓ Save Referral'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientEditForm({ form, setForm }) {
  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' };
  const groupStyle = { marginBottom: '12px' };
  const sectionHeadStyle = { color: '#2c3e50', marginBottom: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' };

  const memberStatus = form.membershipStatus || form.membership_status || 'referred';
  const isMember = memberStatus === 'member';

  const [distQuery, setDistQuery] = useState('');
  const [distResults, setDistResults] = useState([]);
  const [distLoading, setDistLoading] = useState(false);
  const [distOpen, setDistOpen] = useState(false);

  useEffect(() => {
    if (!distQuery.trim() || distQuery.length < 2) { setDistResults([]); setDistOpen(false); return; }
    setDistLoading(true);
    api.distributors.search(distQuery)
      .then(data => {
        const list = Array.isArray(data) ? data : data.distributors || [];
        setDistResults(list.slice(0, 10));
        setDistOpen(list.length > 0);
      })
      .catch(() => setDistResults([]))
      .finally(() => setDistLoading(false));
  }, [distQuery]);

  const selectDist = (d) => {
    const name = d.distributor_name || d.full_name || d.name || '';
    const nb = d.distributor_code || d.nb_number || '';
    update('referralName', name);
    update('referral_name', name);
    update('referralNbNumber', nb);
    update('referral_nb', nb);
    setDistQuery(`${name}${nb ? ` (${nb})` : ''}`);
    setDistOpen(false);
  };

  return (
    <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
      <h4 style={{ color: '#2c3e50', marginBottom: '16px' }}>Personal Information</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div style={groupStyle}>
          <label style={labelStyle}>Full Name *</label>
          <input style={inputStyle} value={form.full_name || form.fullName || form.name || ''} onChange={e => update('full_name', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Namibian ID Number</label>
          <input style={inputStyle} value={form.nbNumber || form.nb_number || ''} onChange={e => update('nbNumber', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Date of Birth</label>
          <input type="date" style={inputStyle} value={form.dob || ''} onChange={e => update('dob', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Gender</label>
          <select style={inputStyle} value={form.gender || ''} onChange={e => update('gender', e.target.value)}>
            <option value="">— Select —</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Phone *</label>
          <input style={inputStyle} value={form.phone || ''} onChange={e => update('phone', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} value={form.email || ''} onChange={e => update('email', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Height (cm)</label>
          <input style={inputStyle} value={form.height || ''} onChange={e => update('height', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Weight (kg)</label>
          <input style={inputStyle} value={form.weight || ''} onChange={e => update('weight', e.target.value)} />
        </div>
      </div>

      <h4 style={sectionHeadStyle}>Member / Referral Information</h4>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ ...groupStyle, marginBottom: '16px' }}>
          <label style={labelStyle}>Membership Status</label>
          <select style={{ ...inputStyle, maxWidth: '260px' }}
            value={memberStatus}
            onChange={e => { update('membershipStatus', e.target.value); update('membership_status', e.target.value); }}>
            <option value="referred">🤝 Non-Member (Referred)</option>
            <option value="member">🏅 Registered Member</option>
          </select>
        </div>

        {isMember ? (
          <div style={groupStyle}>
            <label style={labelStyle}>Member NB Number</label>
            <input style={{ ...inputStyle, maxWidth: '320px' }}
              placeholder="e.g. NB001234"
              value={form.nbNumber || form.nb_number || ''}
              onChange={e => { update('nbNumber', e.target.value); update('nb_number', e.target.value); }} />
          </div>
        ) : (
          <div style={{ position: 'relative', maxWidth: '480px' }}>
            <label style={labelStyle}>Referral (Distributor)</label>
            <input
              style={inputStyle}
              placeholder="Type name or NB number to search distributors..."
              value={distQuery || (form.referralName || form.referral_name
                ? `${form.referralName || form.referral_name}${form.referralNbNumber || form.referral_nb ? ` (${form.referralNbNumber || form.referral_nb})` : ''}`
                : '')}
              onChange={e => { setDistQuery(e.target.value); if (!e.target.value) { update('referralName', ''); update('referral_name', ''); update('referralNbNumber', ''); update('referral_nb', ''); } }}
            />
            {distLoading && <span style={{ position: 'absolute', right: '10px', top: '34px', fontSize: '0.8rem', color: '#6b7280' }}>Searching…</span>}
            {distOpen && distResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999, maxHeight: '220px', overflowY: 'auto' }}>
                {distResults.map((d, i) => {
                  const dName = d.distributor_name || d.full_name || d.name || '';
                  const dNb = d.distributor_code || d.nb_number || '';
                  return (
                    <div key={i}
                      onClick={() => selectDist(d)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.88rem' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <span style={{ fontWeight: 700, color: '#1e293b' }}>{dName}</span>
                      {dNb && <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '0.8rem' }}>{dNb}</span>}
                      {d.branch && <span style={{ marginLeft: '8px', color: '#9ca3af', fontSize: '0.78rem' }}>{d.branch}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {(form.referralName || form.referral_name) && !distOpen && (
              <div style={{ marginTop: '6px', fontSize: '0.82rem', color: '#16a34a' }}>
                ✓ Selected: <strong>{form.referralName || form.referral_name}</strong>
                {(form.referralNbNumber || form.referral_nb) && <span style={{ color: '#6b7280', marginLeft: '6px' }}>({form.referralNbNumber || form.referral_nb})</span>}
              </div>
            )}
          </div>
        )}
      </div>

      <h4 style={sectionHeadStyle}>Health Assessment</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={groupStyle}>
          <label style={labelStyle}>Primary Reason for Visit</label>
          <input style={inputStyle} placeholder="e.g. Weight management, Joint pain..." value={form.primaryReason || form.primary_reason || ''} onChange={e => update('primaryReason', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Water Intake</label>
          <select style={inputStyle} value={form.waterIntake || form.water_intake || ''} onChange={e => update('waterIntake', e.target.value)}>
            <option value="">— Select —</option>
            <option value="Less than 1L/day">Less than 1L/day</option>
            <option value="1–2L/day">1–2L/day</option>
            <option value="2–3L/day">2–3L/day</option>
            <option value="More than 3L/day">More than 3L/day</option>
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Exercise Frequency</label>
          <select style={inputStyle} value={form.exerciseFreq || form.exercise_freq || ''} onChange={e => update('exerciseFreq', e.target.value)}>
            <option value="">— Select —</option>
            <option value="None">None</option>
            <option value="1–2x per week">1–2x per week</option>
            <option value="3–4x per week">3–4x per week</option>
            <option value="Daily">Daily</option>
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Sleep (hours per night)</label>
          <select style={inputStyle} value={form.sleepHours || form.sleep_hours || ''} onChange={e => update('sleepHours', e.target.value)}>
            <option value="">— Select —</option>
            <option value="Less than 5">Less than 5 hours</option>
            <option value="5–6">5–6 hours</option>
            <option value="6–7">6–7 hours</option>
            <option value="7–8">7–8 hours</option>
            <option value="More than 8">More than 8 hours</option>
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Stress Level (1 = Low, 10 = Very High)</label>
          <select style={inputStyle} value={form.stressLevel || form.stress_level || ''} onChange={e => update('stressLevel', e.target.value)}>
            <option value="">— Select —</option>
            {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} — {n <= 3 ? 'Low' : n <= 6 ? 'Moderate' : n <= 8 ? 'High' : 'Very High'}</option>)}
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Current Medications</label>
          <input style={inputStyle} placeholder="e.g. Metformin 500mg, Aspirin..." value={form.currentMedications || form.medications || ''} onChange={e => update('currentMedications', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Allergies</label>
          <input style={inputStyle} placeholder="e.g. Penicillin, Peanuts..." value={form.allergies || ''} onChange={e => update('allergies', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Medical History</label>
          <input style={inputStyle} placeholder="e.g. Diabetes, Hypertension, Asthma..." value={Array.isArray(form.medicalHistory) ? form.medicalHistory.join(', ') : (form.medicalHistory || form.medical_history || '')} onChange={e => update('medicalHistory', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function printReportFromDB(r) {
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const logo = window.location.origin + '/assets/dynapharm-logo.png';
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-NA', { day:'2-digit', month:'long', year:'numeric' }) : '';
  const fmtDateTime = d => d ? new Date(d).toLocaleString('en-NA', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  const isMember = (r.membership_status || '') === 'member';
  const symptoms = Array.isArray(r.symptoms) ? r.symptoms : [];
  const prescriptions = Array.isArray(r.prescriptions) ? r.prescriptions : (Array.isArray(r.medicines) ? r.medicines.map(m => ({ product: m.name || m, quantity: m.quantity || 1 })) : []);
  const reportReq = r.report_required !== false;

  const sympHtml = symptoms.length > 0
    ? symptoms.map(s => `
        <div class="lifestyle-item">
          <div class="lifestyle-sym">${esc(s.system)} — ${esc(s.symptom)}</div>
          <div class="lifestyle-advice">${esc(s.recommendation)}</div>
        </div>`).join('')
    : '<p style="color:#7f8c8d;font-style:italic;margin:0">No specific body system findings recorded.</p>';

  const rxHtml = prescriptions.length > 0
    ? prescriptions.map(p => {
        const name = typeof p === 'string' ? p : (p.product || p.name || '');
        const qty = typeof p === 'object' ? (p.quantity || 1) : 1;
        return `<span class="med">${esc(name)} ×${qty}</span>`;
      }).join('')
    : '<p style="color:#7f8c8d;font-style:italic;margin:0">No products prescribed.</p>';

  const w = window.open('', '_blank', 'width=920,height=780');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Health Report — ${esc(r.client_name || '')}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Arial,sans-serif;padding:22px;color:#222;font-size:12px;line-height:1.45;}
  .header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:14px;}
  .logo{height:54px;background:#fff;border-radius:8px;padding:3px;}
  .company{font-size:1.2rem;font-weight:900;color:#c41e3a;}
  .subtitle{font-size:0.82rem;color:#555;margin-top:2px;}
  .report-title{font-size:0.95rem;font-weight:800;color:#7b0000;letter-spacing:1px;margin-top:3px;}
  h3{color:#c41e3a;border-bottom:2px solid #fecaca;padding-bottom:4px;margin:12px 0 8px;font-size:0.88rem;text-transform:uppercase;letter-spacing:0.5px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 14px;}
  .field{font-size:0.82rem;padding:2px 0;border-bottom:1px dotted #eee;}
  .section{margin:8px 0;padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;background:#fafafa;page-break-inside:avoid;}
  .med{padding:4px 10px;background:#e8f5e9;border-radius:4px;display:inline-block;margin:3px 3px 3px 0;font-size:0.85rem;color:#166534;font-weight:700;border:1px solid #bbf7d0;}
  .lifestyle-item{margin-bottom:6px;padding:6px 10px;background:#e3f2fd;border-left:4px solid #2196f3;border-radius:5px;}
  .lifestyle-sym{font-weight:700;color:#1565c0;font-size:0.84rem;}
  .lifestyle-advice{font-size:0.8rem;color:#333;margin-top:2px;line-height:1.4;}
  .sig-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:6px;}
  .sig-box{border-top:2px solid #333;padding-top:5px;}
  .sig-label{font-size:0.76rem;color:#666;}
  .sig-name{font-weight:700;font-size:0.9rem;color:#1e293b;margin-top:3px;}
  .footer{margin-top:18px;border-top:2px solid #c41e3a;padding-top:8px;font-size:0.72rem;color:#888;display:flex;justify-content:space-between;}
  .confidential{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;}
  .req-badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:0.8rem;font-weight:700;${reportReq ? 'background:#fef2f2;color:#c41e3a;border:2px solid #fecaca;' : 'background:#f0fdf4;color:#166534;border:2px solid #bbf7d0;'}}
  .print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;}
  @media print{.print-btn{display:none;} body{padding:10px;} @page{size:A4;margin:10mm;}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print</button>

<div class="header">
  <img class="logo" src="${logo}" onerror="this.style.display='none'" />
  <div>
    <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
    <div class="subtitle">Health &amp; Wellness Division</div>
    <div class="report-title">SUMMARY ANALYSIS HEALTH REPORT CARD</div>
  </div>
  <div style="margin-left:auto;text-align:right;font-size:0.78rem;color:#64748b;line-height:1.7;">
    <div><b>Report ID:</b> ${esc(r.id)}</div>
    <div><b>Date:</b> ${fmtDateTime(r.created_at)}</div>
    <div><b>Branch:</b> ${esc(r.branch || 'N/A')}</div>
    <div style="margin-top:4px"><span class="req-badge">${reportReq ? '⚠️ Report Required: YES' : '✓ Report Required: NO'}</span></div>
  </div>
</div>

<div class="section">
  <h3>Patient Information</h3>
  <div class="grid3">
    <div class="field"><b>Full Name:</b> ${esc(r.client_name || 'N/A')}</div>
    <div class="field"><b>NB Number:</b> ${esc(r.nb_number || 'N/A')}</div>
    <div class="field"><b>Membership:</b> ${isMember ? '✓ Member' : 'Non-Member / Referred'}</div>
    ${!isMember ? `
    <div class="field"><b>Referral Name:</b> ${esc(r.referral_name || 'N/A')}</div>
    <div class="field"><b>Referral NB:</b> ${esc(r.referral_nb || 'N/A')}</div>` : ''}
    <div class="field"><b>Consultation Fee:</b> N$ ${esc(r.consultation_fee || 'N/A')}</div>
  </div>
</div>

${symptoms.length > 0 ? `
<div class="section">
  <h3>Body System Findings &amp; Recommendations</h3>
  ${sympHtml}
</div>` : ''}

<div class="section">
  <h3>Consultant Notes &amp; Diagnosis</h3>
  <p style="margin:0;white-space:pre-wrap;font-size:0.85rem;color:#1e293b">${esc(r.diagnosis || r.recommendations || 'No notes recorded.')}</p>
</div>

<div class="section">
  <h3>Prescribed Products</h3>
  ${rxHtml}
</div>

${r.follow_up_date ? `
<div class="section">
  <h3>Follow-up</h3>
  <div class="grid2">
    <div class="field"><b>Follow-up Date:</b> ${fmtDate(r.follow_up_date)}</div>
    ${r.follow_up_notes ? `<div class="field"><b>Notes:</b> ${esc(r.follow_up_notes)}</div>` : ''}
  </div>
</div>` : ''}

<div class="section" style="margin-top:16px;">
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-label">Consultant Signature</div>
      <div class="sig-name">${esc(r.consultant || 'Dynapharm Consultant')}</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Patient / Guardian Signature</div>
      <div class="sig-name">&nbsp;</div>
    </div>
  </div>
</div>

<div class="footer">
  <span class="confidential">🔒 CONFIDENTIAL</span>
  <span>This report is confidential and intended solely for the named patient.</span>
  <span>Dynapharm International Namibia — Printed ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}</span>
</div>
</body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); } catch {} }, 400);
}

function ReportsSection() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [editReport, setEditReport] = useState(null);

  const loadReports = useCallback(() => {
    setLoading(true);
    api.reports.list()
      .then(data => setReports(Array.isArray(data) ? data : data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const filtered = reports.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.client_name || '').toLowerCase().includes(q)
      || (r.id || '').toString().toLowerCase().includes(q)
      || (r.consultant || '').toLowerCase().includes(q)
      || (r.nb_number || '').toLowerCase().includes(q);
  });

  const isMember = r => (r.membership_status || '') === 'member';

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>My Created Reports</h3>
        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input
          type="text"
          placeholder="Search by client name, NB number, report ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}
        />
        <button onClick={() => setSearch('')} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', fontSize: '0.88rem' }}>Clear</button>
        <button onClick={loadReports} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', fontSize: '0.88rem' }}>↺ Refresh</button>
      </div>

      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📋</div>
          <h3 style={{ margin: '0 0 6px', color: '#475569' }}>No reports found</h3>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>Try a different search term or refresh the list.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(r => {
            const prx = Array.isArray(r.prescriptions) ? r.prescriptions : [];
            const reportReq = r.report_required !== false;
            return (
              <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 18px', background: '#fafafa', transition: 'box-shadow 0.2s' }}
                onMouseOver={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
                onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>{r.client_name || 'Unknown Patient'}</h4>
                      {isMember(r)
                        ? <span style={{ padding: '1px 8px', background: '#dbeafe', color: '#1d4ed8', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700 }}>Member</span>
                        : <span style={{ padding: '1px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700 }}>Referred</span>}
                      {reportReq && <span style={{ padding: '1px 8px', background: '#fef2f2', color: '#c41e3a', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, border: '1px solid #fecaca' }}>⚠ Report Required</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '5px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>📅 {r.created_at ? new Date(r.created_at).toLocaleString('en-NA', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'N/A'}</span>
                      {r.nb_number && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>🪪 {r.nb_number}</span>}
                      {r.consultant && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>👤 {r.consultant}</span>}
                      {r.branch && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>🏥 {r.branch}</span>}
                    </div>
                    {r.diagnosis && (
                      <p style={{ margin: '8px 0 0', fontSize: '0.83rem', color: '#475569', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {r.diagnosis}
                      </p>
                    )}
                    {prx.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {prx.slice(0, 5).map((p, i) => (
                          <span key={i} style={{ padding: '2px 10px', background: '#e8f5e9', color: '#166534', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #bbf7d0' }}>
                            {typeof p === 'string' ? p : `${p.product} ×${p.quantity || 1}`}
                          </span>
                        ))}
                        {prx.length > 5 && <span style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '2px 6px' }}>+{prx.length - 5} more</span>}
                      </div>
                    )}
                    {r.follow_up_date && (
                      <div style={{ marginTop: '8px', display: 'inline-block', padding: '3px 10px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, border: '1px solid #bfdbfe' }}>
                        📆 Follow-up: {new Date(r.follow_up_date).toLocaleDateString('en-NA', { day:'2-digit', month:'short', year:'numeric' })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '110px' }}>
                    <button
                      onClick={() => setSelectedReport(r)}
                      style={{ padding: '8px 14px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, cursor: 'pointer', fontSize: '0.83rem' }}
                    >
                      👁 View Report
                    </button>
                    <button
                      onClick={() => setEditReport(r)}
                      style={{ padding: '8px 14px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, cursor: 'pointer', fontSize: '0.83rem' }}
                    >
                      ✏️ Edit Rx
                    </button>
                    <button
                      onClick={() => printReportFromDB(r)}
                      style={{ padding: '8px 14px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, cursor: 'pointer', fontSize: '0.83rem' }}
                    >
                      🖨️ Print / PDF
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedReport && (
        <div onClick={e => { if (e.target === e.currentTarget) setSelectedReport(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 999999, overflowY: 'auto', padding: '30px 16px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '780px', width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.35)', overflow: 'hidden', fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#222' }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#7b0000,#c41e3a)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src="/assets/dynapharm-logo.png" alt="logo" style={{ height: '44px', background: '#fff', borderRadius: '8px', padding: '3px' }} onError={e => e.target.style.display = 'none'} />
                <div>
                  <div style={{ color: '#fff', fontWeight: 900, fontSize: '1rem', letterSpacing: '0.5px' }}>DYNAPHARM INTERNATIONAL NAMIBIA</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', marginTop: '2px' }}>SUMMARY ANALYSIS HEALTH REPORT CARD</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => printReportFromDB(selectedReport)}
                  style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', backdropFilter: 'blur(4px)' }}>
                  🖨️ Print / PDF
                </button>
                <button onClick={() => setSelectedReport(null)}
                  style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>
                  ×
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Report meta + required badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  <b style={{ color: '#1e293b' }}>Report ID:</b> {selectedReport.id}
                  &nbsp;&nbsp;|&nbsp;&nbsp;<b style={{ color: '#1e293b' }}>Date:</b> {selectedReport.created_at ? new Date(selectedReport.created_at).toLocaleString('en-NA', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'N/A'}
                  &nbsp;&nbsp;|&nbsp;&nbsp;<b style={{ color: '#1e293b' }}>Branch:</b> {selectedReport.branch || 'N/A'}
                </div>
                {selectedReport.report_required !== false
                  ? <span style={{ padding: '3px 12px', background: '#fef2f2', color: '#c41e3a', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, border: '1px solid #fecaca' }}>⚠️ Report Required: YES</span>
                  : <span style={{ padding: '3px 12px', background: '#f0fdf4', color: '#166534', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, border: '1px solid #bbf7d0' }}>✓ Report Required: NO</span>}
              </div>

              {/* Patient info */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '9px', padding: '14px 18px', background: '#fafafa' }}>
                <div style={{ fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.5px', borderBottom: '2px solid #fecaca', paddingBottom: '5px', marginBottom: '10px' }}>Patient Information</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '8px 20px' }}>
                  {[
                    ['Full Name', selectedReport.client_name],
                    ['NB Number', selectedReport.nb_number],
                    ['Membership', (selectedReport.membership_status || '') === 'member' ? '✓ Member' : 'Non-Member / Referred'],
                    ['Consultant', selectedReport.consultant],
                    ...((selectedReport.membership_status || '') !== 'member'
                      ? [['Referral Name', selectedReport.referral_name], ['Referral NB', selectedReport.referral_nb]]
                      : []),
                    ['Consultation Fee', selectedReport.consultation_fee ? `N$ ${selectedReport.consultation_fee}` : null],
                  ].filter(([, v]) => v).map(([label, val], i) => (
                    <div key={i} style={{ borderBottom: '1px dotted #e5e7eb', paddingBottom: '4px' }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: '0.88rem', color: '#1e293b', fontWeight: 600, marginTop: '1px' }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Body system findings */}
              {Array.isArray(selectedReport.symptoms) && selectedReport.symptoms.length > 0 && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '9px', padding: '14px 18px', background: '#fafafa' }}>
                  <div style={{ fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.5px', borderBottom: '2px solid #fecaca', paddingBottom: '5px', marginBottom: '10px' }}>Body System Findings &amp; Recommendations</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedReport.symptoms.map((s, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: '#e3f2fd', borderLeft: '4px solid #2196f3', borderRadius: '6px' }}>
                        <div style={{ fontWeight: 700, color: '#1565c0', fontSize: '0.85rem' }}>{s.system} — {s.symptom}</div>
                        <div style={{ fontSize: '0.8rem', color: '#333', marginTop: '3px', lineHeight: 1.45 }}>{s.recommendation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnosis / notes */}
              {(selectedReport.diagnosis || selectedReport.recommendations) && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '9px', padding: '14px 18px', background: '#fafafa' }}>
                  <div style={{ fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.5px', borderBottom: '2px solid #fecaca', paddingBottom: '5px', marginBottom: '10px' }}>Consultant Notes &amp; Diagnosis</div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.55 }}>{selectedReport.diagnosis || selectedReport.recommendations}</p>
                </div>
              )}

              {/* Prescribed products */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '9px', padding: '14px 18px', background: '#fafafa' }}>
                <div style={{ fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.5px', borderBottom: '2px solid #fecaca', paddingBottom: '5px', marginBottom: '10px' }}>Prescribed Products</div>
                {(() => {
                  const prx = Array.isArray(selectedReport.prescriptions) ? selectedReport.prescriptions
                    : Array.isArray(selectedReport.medicines) ? selectedReport.medicines.map(m => ({ product: m.name || m, quantity: m.quantity || 1 }))
                    : [];
                  return prx.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {prx.map((p, i) => {
                        const name = typeof p === 'string' ? p : (p.product || p.name || '');
                        const qty = typeof p === 'object' ? (p.quantity || 1) : 1;
                        return <span key={i} style={{ padding: '5px 12px', background: '#e8f5e9', color: '#166534', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, border: '1px solid #bbf7d0' }}>{name} ×{qty}</span>;
                      })}
                    </div>
                  ) : <p style={{ margin: 0, color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>No products prescribed.</p>;
                })()}
              </div>

              {/* Follow-up */}
              {selectedReport.follow_up_date && (
                <div style={{ border: '1px solid #bfdbfe', borderRadius: '9px', padding: '14px 18px', background: '#eff6ff' }}>
                  <div style={{ fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.5px', marginBottom: '8px' }}>Follow-up Appointment</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 600 }}>Date</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>{new Date(selectedReport.follow_up_date).toLocaleDateString('en-NA', { day:'2-digit', month:'long', year:'numeric' })}</div>
                    </div>
                    {selectedReport.follow_up_notes && (
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 600 }}>Notes</div>
                        <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>{selectedReport.follow_up_notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Signature row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '4px' }}>
                {[['Consultant Signature', selectedReport.consultant || 'Dynapharm Consultant'], ['Patient / Guardian Signature', '']].map(([label, name], i) => (
                  <div key={i} style={{ borderTop: '2px solid #374151', paddingTop: '6px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginTop: '4px', minHeight: '22px' }}>{name}</div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ borderTop: '2px solid #c41e3a', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '0.72rem', color: '#94a3b8' }}>
                <span style={{ padding: '2px 10px', background: '#fef2f2', color: '#991b1b', borderRadius: '20px', fontWeight: 700, border: '1px solid #fecaca' }}>🔒 CONFIDENTIAL</span>
                <span>This report is confidential and intended solely for the named patient.</span>
                <span>Dynapharm International Namibia</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {editReport && (
        <PrescriptionEditModal
          report={editReport}
          onClose={() => setEditReport(null)}
          onSaved={() => { loadReports(); setEditReport(null); }}
        />
      )}
    </div>
  );
}

function FollowUpReportModal({ parentReport, onClose, onSaved }) {
  const { user } = useAuth();
  const [diagnosis, setDiagnosis] = useState('');
  const [meds, setMeds] = useState(new Set());
  const [medSearch, setMedSearch] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [nextFollowUpNotes, setNextFollowUpNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleMed = (name) => setMeds(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const allProducts = getLiveProductList();
  const seenPkg = new Set();
  const packages = allProducts.filter(p => p.is_package && !seenPkg.has(p.description) && seenPkg.add(p.description));
  const pkgNames = new Set(packages.map(p => p.description));
  const seenProd = new Set();
  const products = allProducts.filter(p => !p.is_package && !pkgNames.has(p.description) && !seenProd.has(p.description) && seenProd.add(p.description));
  const q = (medSearch || '').toLowerCase();
  const visPkgs = q ? packages.filter(p => p.description.toLowerCase().includes(q)) : packages;
  const visProds = q ? products.filter(p => p.description.toLowerCase().includes(q)) : products;

  const handleSave = async () => {
    if (!diagnosis.trim()) { setError('Please enter a diagnosis / consultant notes.'); return; }
    setSaving(true); setError('');
    try {
      const medicines = Array.from(meds).map(name => ({ name, dispensed: false }));
      const prescriptions = medicines.map(m => ({ product: m.name, quantity: 1 }));
      await api.reports.create({
        client_name: parentReport.client_name || '',
        diagnosis,
        recommendations: diagnosis,
        prescriptions,
        medicines,
        follow_up_date: nextFollowUpDate || null,
        follow_up_notes: nextFollowUpNotes || null,
        symptoms: [],
        consultant: user?.full_name || user?.username || 'Consultant',
        membership_status: parentReport.membership_status || 'referred',
        consultation_fee: 150,
        consultant_credit: 150,
        referral_credit: 0,
        report_required: true,
        branch: parentReport.branch || user?.branch || '',
        parent_report_id: parentReport.id,
        nb_number: parentReport.nb_number || null,
        referral_name: parentReport.referral_name || null,
        referral_nb: parentReport.referral_nb || null,
      });
      api.reports.update(parentReport.id, { id: parentReport.id, follow_up_done: true }).catch(() => {});
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  const buildPrintData = () => ({
    client_name: parentReport.client_name || '',
    branch: parentReport.branch || user?.branch || '',
    consultant: user?.full_name || user?.username || 'Consultant',
    consultant_phone: user?.phone || user?.mobile || null,
    consultant_email: user?.email || null,
    membership_status: parentReport.membership_status || 'referred',
    consultation_fee: 150,
    nb_number: parentReport.nb_number || null,
    referral_name: parentReport.referral_name || null,
    referral_nb: parentReport.referral_nb || null,
    diagnosis,
    prescriptions: Array.from(meds).map(name => ({ product: name, quantity: 1 })),
    follow_up_date: nextFollowUpDate || null,
    follow_up_notes: nextFollowUpNotes || null,
    created_at: new Date().toISOString(),
    id: null,
    report_required: true,
    prev_diagnosis: parentReport.diagnosis || null,
    prev_follow_up_date: parentReport.follow_up_date || null,
  });

  const printFollowUpReport = (overrideId) => {
    const r = buildPrintData();
    if (overrideId) r.id = overrideId;
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const logo = window.location.origin + '/assets/dynapharm-logo.png';
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-NA', { day:'2-digit', month:'long', year:'numeric' }) : '';
    const fmtDateTime = d => d ? new Date(d).toLocaleString('en-NA', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    const isMem = (r.membership_status || '') === 'member';
    const rxHtml = r.prescriptions.length > 0
      ? r.prescriptions.map(p => `<span class="med">${esc(p.product)} ×${p.quantity || 1}</span>`).join('')
      : '<p style="color:#7f8c8d;font-style:italic;margin:0">No products prescribed.</p>';

    const w = window.open('', '_blank', 'width=920,height=780');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Follow-up Report — ${esc(r.client_name)}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Arial,sans-serif;padding:22px;color:#222;font-size:12px;line-height:1.45;}
  .header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1d4ed8;padding-bottom:10px;margin-bottom:14px;}
  .logo{height:54px;background:#fff;border-radius:8px;padding:3px;}
  .company{font-size:1.2rem;font-weight:900;color:#1d4ed8;}
  .subtitle{font-size:0.82rem;color:#555;margin-top:2px;}
  .report-title{font-size:0.95rem;font-weight:800;color:#1e3a8a;letter-spacing:1px;margin-top:3px;}
  .followup-badge{display:inline-block;background:#dbeafe;color:#1e40af;border:2px solid #93c5fd;border-radius:20px;padding:3px 14px;font-size:0.8rem;font-weight:800;margin-top:4px;letter-spacing:0.5px;}
  h3{color:#1d4ed8;border-bottom:2px solid #bfdbfe;padding-bottom:4px;margin:12px 0 8px;font-size:0.88rem;text-transform:uppercase;letter-spacing:0.5px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 14px;}
  .field{font-size:0.82rem;padding:2px 0;border-bottom:1px dotted #eee;}
  .section{margin:8px 0;padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;background:#fafafa;page-break-inside:avoid;}
  .prev-section{margin:8px 0;padding:8px 12px;border:1px solid #e2e8f0;border-radius:7px;background:#f8fafc;page-break-inside:avoid;}
  .med{padding:4px 10px;background:#e8f5e9;border-radius:4px;display:inline-block;margin:3px 3px 3px 0;font-size:0.85rem;color:#166534;font-weight:700;border:1px solid #bbf7d0;}
  .sig-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:6px;}
  .sig-box{border-top:2px solid #333;padding-top:5px;}
  .sig-label{font-size:0.76rem;color:#666;}
  .sig-name{font-weight:700;font-size:0.9rem;color:#1e293b;margin-top:3px;}
  .footer{margin-top:18px;border-top:2px solid #1d4ed8;padding-top:8px;font-size:0.72rem;color:#888;display:flex;justify-content:space-between;}
  .confidential{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;}
  .print-btn{position:fixed;top:12px;right:12px;background:#1d4ed8;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.9rem;}
  @media print{.print-btn{display:none;} body{padding:10px;} @page{size:A4;margin:10mm;}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print</button>

<div class="header">
  <img class="logo" src="${logo}" onerror="this.style.display='none'" />
  <div>
    <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
    <div class="subtitle">Health &amp; Wellness Division</div>
    <div class="report-title">FOLLOW-UP CONSULTATION REPORT</div>
    <div class="followup-badge">🔄 FOLLOW-UP VISIT</div>
  </div>
  <div style="margin-left:auto;text-align:right;font-size:0.78rem;color:#64748b;line-height:1.7;">
    ${r.id ? `<div><b>Report ID:</b> ${esc(r.id)}</div>` : ''}
    <div><b>Date:</b> ${fmtDateTime(r.created_at)}</div>
    <div><b>Branch:</b> ${esc(r.branch || 'N/A')}</div>
    <div><b>Consultant:</b> ${esc(r.consultant)}</div>
    ${r.consultant_phone ? `<div><b>Phone:</b> ${esc(r.consultant_phone)}</div>` : ''}
    ${r.consultant_email ? `<div><b>Email:</b> ${esc(r.consultant_email)}</div>` : ''}
  </div>
</div>

<div class="section">
  <h3>Patient Information</h3>
  <div class="grid3">
    <div class="field"><b>Full Name:</b> ${esc(r.client_name || 'N/A')}</div>
    <div class="field"><b>Membership:</b> ${isMem ? '✓ Member' : 'Non-Member / Referred'}</div>
    <div class="field"><b>Consultation Fee:</b> N$ ${esc(r.consultation_fee || 'N/A')}</div>
    ${r.nb_number ? `<div class="field"><b>NB Number:</b> ${esc(r.nb_number)}</div>` : ''}
    ${!isMem && r.referral_name ? `<div class="field"><b>Referral Name:</b> ${esc(r.referral_name)}</div>` : ''}
    ${!isMem && r.referral_nb ? `<div class="field"><b>Referral NB:</b> ${esc(r.referral_nb)}</div>` : ''}
  </div>
</div>

${r.prev_diagnosis || r.prev_follow_up_date ? `
<div class="prev-section">
  <h3 style="color:#64748b;border-color:#e2e8f0;">Previous Visit Reference</h3>
  <div class="grid2">
    ${r.prev_follow_up_date ? `<div class="field"><b>Scheduled Follow-up Date:</b> ${fmtDate(r.prev_follow_up_date)}</div>` : ''}
    ${r.prev_diagnosis ? `<div class="field" style="grid-column:1/-1"><b>Previous Diagnosis:</b> ${esc(r.prev_diagnosis)}</div>` : ''}
  </div>
</div>` : ''}

<div class="section">
  <h3>Consultant Notes &amp; Diagnosis</h3>
  <p style="margin:0;white-space:pre-wrap;font-size:0.85rem;color:#1e293b">${esc(r.diagnosis || 'No notes recorded.')}</p>
</div>

<div class="section">
  <h3>Prescribed Products</h3>
  ${rxHtml}
</div>

${r.follow_up_date ? `
<div class="section">
  <h3>Next Follow-up</h3>
  <div class="grid2">
    <div class="field"><b>Next Follow-up Date:</b> ${fmtDate(r.follow_up_date)}</div>
    ${r.follow_up_notes ? `<div class="field"><b>Notes:</b> ${esc(r.follow_up_notes)}</div>` : ''}
  </div>
</div>` : ''}

<div class="section" style="margin-top:16px;">
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-label">Consultant Signature</div>
      <div class="sig-name">${esc(r.consultant)}</div>
      ${r.consultant_phone ? `<div class="sig-label" style="margin-top:3px;">📞 ${esc(r.consultant_phone)}</div>` : ''}
      ${r.consultant_email ? `<div class="sig-label">✉️ ${esc(r.consultant_email)}</div>` : ''}
    </div>
    <div class="sig-box">
      <div class="sig-label">Patient / Guardian Signature</div>
      <div class="sig-name">&nbsp;</div>
    </div>
  </div>
</div>

<div class="footer">
  <span class="confidential">🔒 CONFIDENTIAL</span>
  <span>This report is confidential and intended solely for the named patient.</span>
  <span>Dynapharm International Namibia — Printed ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}</span>
</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { try { w.focus(); } catch {} }, 400);
  };

  const handleSaveAndPrint = async () => {
    if (!diagnosis.trim()) { setError('Please enter a diagnosis / consultant notes.'); return; }
    setSaving(true); setError('');
    try {
      const medicines = Array.from(meds).map(name => ({ name, dispensed: false }));
      const prescriptions = medicines.map(m => ({ product: m.name, quantity: 1 }));
      const created = await api.reports.create({
        client_name: parentReport.client_name || '',
        diagnosis,
        recommendations: diagnosis,
        prescriptions,
        medicines,
        follow_up_date: nextFollowUpDate || null,
        follow_up_notes: nextFollowUpNotes || null,
        symptoms: [],
        consultant: user?.full_name || user?.username || 'Consultant',
        membership_status: parentReport.membership_status || 'referred',
        consultation_fee: 150,
        consultant_credit: 150,
        referral_credit: 0,
        report_required: true,
        branch: parentReport.branch || user?.branch || '',
        parent_report_id: parentReport.id,
        nb_number: parentReport.nb_number || null,
        referral_name: parentReport.referral_name || null,
        referral_nb: parentReport.referral_nb || null,
      });
      const savedId = created?.id || created?.report?.id || null;
      printFollowUpReport(savedId);
      api.reports.update(parentReport.id, { id: parentReport.id, follow_up_done: true }).catch(() => {});
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000001, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '900px', margin: '20px auto', background: 'white', borderRadius: '14px', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>📝 Follow-up Report</h3>
            <p style={{ margin: '3px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '0.83rem' }}>Patient: {parentReport.client_name || 'Unknown'} · Original follow-up: {formatDate(parentReport.follow_up_date)}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '1.6rem', cursor: 'pointer', borderRadius: '6px', padding: '1px 10px', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '24px' }}>
          {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem' }}>{error}</div>}

          {/* Previous report reference */}
          {parentReport.diagnosis && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Previous Diagnosis (for reference)</p>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151' }}>{parentReport.diagnosis}</p>
            </div>
          )}

          {/* New Diagnosis / Notes */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: '#1e293b', fontSize: '0.9rem' }}>Consultant Notes &amp; Diagnosis *</label>
            <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={4}
              style={{ width: '100%', padding: '10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="Enter new diagnosis, progress notes, treatment updates..." />
          </div>

          {/* Medicine picker */}
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, color: '#1e293b', fontSize: '0.95rem' }}>Prescribed Products</h4>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{meds.size} selected</span>
            </div>
            <input type="text" placeholder="Search products…" value={medSearch} onChange={e => setMedSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', marginBottom: '10px', boxSizing: 'border-box' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '7px', maxHeight: '300px', overflowY: 'auto', marginBottom: '12px' }}>
              {visPkgs.map((pkg, idx) => {
                const isChecked = meds.has(pkg.description);
                return (
                  <div key={`fpkg-${idx}`} onClick={() => toggleMed(pkg.description)}
                    style={{ background: isChecked ? '#dcfce7' : '#e8f5e9', borderLeft: `4px solid ${isChecked ? '#16a34a' : '#27ae60'}`, padding: '9px 10px', borderRadius: '6px', display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isChecked} readOnly style={{ marginTop: '3px', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                    <label style={{ cursor: 'pointer', flex: 1, fontSize: '0.87rem' }}>
                      <span style={{ fontWeight: 700, color: '#166534' }}>📦 {pkg.description}</span>
                      <br /><small style={{ color: '#555' }}>Bundle · DP: N${pkg.dp}</small>
                    </label>
                  </div>
                );
              })}
              {visProds.map((product, idx) => {
                const isChecked = meds.has(product.description);
                return (
                  <div key={`fprod-${idx}`} onClick={() => toggleMed(product.description)}
                    style={{ padding: '8px 10px', borderRadius: '6px', display: 'flex', alignItems: 'flex-start', gap: '8px', border: `1px solid ${isChecked ? '#86efac' : '#f0f0f0'}`, background: isChecked ? '#f0fdf4' : 'white', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isChecked} readOnly style={{ marginTop: '3px', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                    <label style={{ cursor: 'pointer', flex: 1, fontSize: '0.87rem' }}>
                      <span style={{ fontWeight: isChecked ? 600 : 400, color: isChecked ? '#166534' : '#1e293b' }}>{product.description}</span>
                      <br /><small style={{ color: '#666' }}>DP: N${product.dp} · BV: {product.bv}</small>
                    </label>
                  </div>
                );
              })}
              {visPkgs.length + visProds.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '30px', color: '#9ca3af', fontSize: '0.9rem' }}>No products match "{medSearch}"</div>
              )}
            </div>
            {meds.size > 0 && (
              <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                <h4 style={{ margin: '0 0 8px', color: '#166534', fontSize: '0.88rem' }}>✅ Prescribed ({meds.size}):</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Array.from(meds).map((med, i) => (
                    <span key={i} style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '3px 10px', borderRadius: '20px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      {med}
                      <button onClick={() => toggleMed(med)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 700, fontSize: '1rem', padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Next follow-up */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: '#1e293b', fontSize: '0.9rem' }}>Next Follow-up Date <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
              <input type="date" value={nextFollowUpDate} onChange={e => setNextFollowUpDate(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: '#1e293b', fontSize: '0.9rem' }}>Next Follow-up Notes <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
              <input value={nextFollowUpNotes} onChange={e => setNextFollowUpNotes(e.target.value)}
                placeholder="e.g. Review progress, adjust dosage..."
                style={{ width: '100%', padding: '9px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
          </div>

          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.9rem', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => printFollowUpReport()}
              style={{ padding: '10px 22px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
              🖨️ Print / PDF
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={onClose} style={{ padding: '10px 22px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
              <button onClick={handleSaveAndPrint} disabled={saving}
                style={{ padding: '10px 22px', background: saving ? '#065f46' : '#059669', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: saving ? 0.7 : 1 }}>
                {saving ? '⏳ Saving...' : '💾 Save & Print'}
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '10px 26px', background: saving ? '#1e40af' : '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: saving ? 0.7 : 1 }}>
                {saving ? '⏳ Saving...' : '💾 Save Only'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FollowupsSection() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [reportingFor, setReportingFor] = useState(null);

  const loadFollowups = useCallback(() => {
    setLoading(true);
    api.reports.list()
      .then(data => {
        const all = Array.isArray(data) ? data : data.reports || [];
        setReports(all.filter(r => r.follow_up_date && !r.follow_up_done));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFollowups(); }, [loadFollowups]);

  const filtered = dateFilter ? reports.filter(r => (r.follow_up_date || '').slice(0, 10) === dateFilter) : reports;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      {reportingFor && (
        <FollowUpReportModal
          parentReport={reportingFor}
          onClose={() => setReportingFor(null)}
          onSaved={() => { setReportingFor(null); loadFollowups(); }}
        />
      )}
      <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: '#1e293b' }}>Upcoming Follow-ups</h3>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }} />
        <button onClick={() => setDateFilter('')} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Show All</button>
        <button onClick={loadFollowups} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Refresh</button>
      </div>
      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
          <h3>📅 No follow-ups found</h3>
          <p>Follow-ups from reports will appear here.</p>
        </div>
      ) : (
        <div>
          {filtered.map(r => {
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = r.follow_up_date < today;
            const isDueToday = (r.follow_up_date || '').slice(0, 10) === today;
            return (
              <div key={r.id} className="follow-up-card" style={{ border: `1px solid ${isOverdue ? '#fecaca' : isDueToday ? '#fde68a' : '#e5e7eb'}`, borderLeft: `4px solid ${isOverdue ? '#dc2626' : isDueToday ? '#f59e0b' : '#3b82f6'}`, borderRadius: '10px', padding: '14px 18px', marginBottom: '10px', background: isOverdue ? '#fef2f2' : isDueToday ? '#fffbeb' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div className="follow-up-details">
                    <h4 style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{r.client_name || 'Patient'}</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: isOverdue ? '#dc2626' : '#64748b' }}>
                      {isOverdue ? '⚠️ Overdue: ' : isDueToday ? '📍 Due Today: ' : '📅 Due: '}{formatDate(r.follow_up_date)}
                    </p>
                    {r.follow_up_notes && <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>{r.follow_up_notes}</p>}
                    {r.diagnosis && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>Previous: {r.diagnosis.length > 80 ? r.diagnosis.slice(0, 80) + '…' : r.diagnosis}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setReportingFor(r)}
                      style={{ padding: '7px 16px', fontSize: '0.85rem', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                      📝 Write Report
                    </button>
                    <button
                      onClick={() => setReports(prev => prev.filter(x => x.id !== r.id))}
                      style={{ padding: '7px 14px', fontSize: '0.85rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                      ✅ Done
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AnalyticsSection() {
  const [clients, setClients] = useState([]);
  const [reports, setReports] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('month');

  const loadAnalytics = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.clients.list().then(d => Array.isArray(d) ? d : d.clients || []).catch(() => []),
      api.reports.list().then(d => Array.isArray(d) ? d : d.reports || []).catch(() => []),
      api.appointments.list().then(d => Array.isArray(d) ? d : d.appointments || []).catch(() => []),
    ]).then(([c, r, a]) => {
      setClients(c);
      setReports(r);
      setAppointments(a);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const totalClients = clients.length;
  const totalReports = reports.length;
  const followUpsDue = reports.filter(r => r.follow_up_date && r.follow_up_date >= new Date().toISOString().slice(0, 10)).length;
  const memberClients = clients.filter(c => (c.membershipStatus || c.membership_status) === 'member').length;
  const referredClients = totalClients - memberClients;
  const conversionRate = totalClients > 0 ? Math.round((memberClients / totalClients) * 100) : 0;
  const memberPercentage = totalClients > 0 ? Math.round((memberClients / totalClients) * 100) : 0;
  const referredPercentage = totalClients > 0 ? Math.round((referredClients / totalClients) * 100) : 0;

  const completedFollowUps = reports.filter(r => r.follow_up_date && r.status === 'completed').length;
  const totalFollowUps = reports.filter(r => r.follow_up_date).length;
  const followUpCompleteRate = totalFollowUps > 0 ? Math.round((completedFollowUps / totalFollowUps) * 100) : 0;
  const pendingFollowUps = totalFollowUps - completedFollowUps;

  const printAnalytics = () => {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Performance Analytics</title><style>body{font-family:Arial,sans-serif;padding:20px;} h2{color:#c41e3a;} .metric{display:inline-block;margin:10px;padding:20px;border:1px solid #ddd;border-radius:8px;text-align:center;min-width:150px;} .metric h3{margin:0;font-size:28px;} .metric p{margin:4px 0 0;color:#666;}</style></head><body>`);
    w.document.write(`<h2>Consultant Performance Analytics</h2><p>Timeframe: ${timeframe}</p>`);
    w.document.write(`<div class="metric"><h3 style="color:#3498db;">${totalClients}</h3><p>Total Clients</p></div>`);
    w.document.write(`<div class="metric"><h3 style="color:#27ae60;">${totalReports}</h3><p>Reports Created</p></div>`);
    w.document.write(`<div class="metric"><h3 style="color:#e74c3c;">${followUpsDue}</h3><p>Follow-ups Due</p></div>`);
    w.document.write(`<div class="metric"><h3 style="color:#f39c12;">${conversionRate}%</h3><p>Member Conversion</p></div>`);
    w.document.write(`</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: '#1e293b' }}>Performance Analytics</h3>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="all">All Time</option>
        </select>
        <button onClick={loadAnalytics} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Refresh</button>
        <button onClick={printAnalytics} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Print Report</button>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #3498db', textAlign: 'center' }}>
              <h3 style={{ color: '#3498db', fontSize: '28pt', marginBottom: '5px', margin: 0 }}>{totalClients}</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 0' }}>Total Clients</p>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #27ae60', textAlign: 'center' }}>
              <h3 style={{ color: '#27ae60', fontSize: '28pt', marginBottom: '5px', margin: 0 }}>{totalReports}</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 0' }}>Reports Created</p>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #e74c3c', textAlign: 'center' }}>
              <h3 style={{ color: '#e74c3c', fontSize: '28pt', marginBottom: '5px', margin: 0 }}>{followUpsDue}</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 0' }}>Follow-ups Due</p>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #f39c12', textAlign: 'center' }}>
              <h3 style={{ color: '#f39c12', fontSize: '28pt', marginBottom: '5px', margin: 0 }}>{conversionRate}%</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 0' }}>Member Conversion</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '2px solid #ddd' }}>
              <h4 style={{ color: '#2c3e50', marginBottom: '15px', margin: '0 0 15px' }}>👥 Client Distribution</h4>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Registered Members:</span>
                  <strong style={{ color: '#27ae60' }}>{memberClients}</strong>
                </div>
                <div style={{ background: '#e8f5e9', height: '10px', borderRadius: '5px' }}>
                  <div style={{ background: '#27ae60', height: '100%', width: `${memberPercentage}%`, borderRadius: '5px' }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Referred Clients:</span>
                  <strong style={{ color: '#f39c12' }}>{referredClients}</strong>
                </div>
                <div style={{ background: '#fff3cd', height: '10px', borderRadius: '5px' }}>
                  <div style={{ background: '#f39c12', height: '100%', width: `${referredPercentage}%`, borderRadius: '5px' }}></div>
                </div>
              </div>
            </div>

            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '2px solid #ddd' }}>
              <h4 style={{ color: '#2c3e50', marginBottom: '15px', margin: '0 0 15px' }}>📅 Follow-up Compliance</h4>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Completed Follow-ups:</span>
                  <strong style={{ color: '#27ae60' }}>{completedFollowUps}</strong>
                </div>
                <div style={{ background: '#e8f5e9', height: '10px', borderRadius: '5px' }}>
                  <div style={{ background: '#27ae60', height: '100%', width: `${followUpCompleteRate}%`, borderRadius: '5px' }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Pending Follow-ups:</span>
                  <strong style={{ color: '#e74c3c' }}>{pendingFollowUps}</strong>
                </div>
                <div style={{ background: '#fee2e2', height: '10px', borderRadius: '5px' }}>
                  <div style={{ background: '#e74c3c', height: '100%', width: `${totalFollowUps > 0 ? Math.round((pendingFollowUps / totalFollowUps) * 100) : 0}%`, borderRadius: '5px' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffServicesSection() {
  return <StaffServicesTab accentColor="#6d28d9" />;
}

function _OldStaffServicesSection_unused_IGNORE() {
  const [leaveModal, setLeaveModal] = useState(false);
  const [cashModal, setCashModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: '', startDate: '', endDate: '', reason: '', urgent: false });
  const [cashForm, setCashForm] = useState({ amount: '', purpose: '', urgent: false });
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [cashRequests, setCashRequests] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);

  const loadLeaveRequests = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const res = await fetch('/api/leave-requests', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLeaveRequests(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLeaveLoading(false);
  }, []);

  const loadCashRequests = useCallback(async () => {
    setCashLoading(true);
    try {
      const res = await fetch('/api/cash-requests', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCashRequests(Array.isArray(data) ? data : []);
      }
    } catch {}
    setCashLoading(false);
  }, []);

  useEffect(() => {
    loadLeaveRequests();
    loadCashRequests();
  }, [loadLeaveRequests, loadCashRequests]);

  const submitLeave = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(leaveForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error');
      }
      setLeaveModal(false);
      setLeaveForm({ type: '', startDate: '', endDate: '', reason: '', urgent: false });
      alert('Leave request submitted successfully!');
      loadLeaveRequests();
    } catch (err) {
      alert('Failed to submit leave request: ' + (err.message || 'Unknown error'));
    }
  };

  const submitCash = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/cash-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cashForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error');
      }
      setCashModal(false);
      setCashForm({ amount: '', purpose: '', urgent: false });
      alert('Cash request submitted successfully!');
      loadCashRequests();
    } catch (err) {
      alert('Failed to submit cash request: ' + (err.message || 'Unknown error'));
    }
  };

  const getStatusBadgeColor = (status) => {
    if (status === 'Approved') return '#27ae60';
    if (status === 'Rejected') return '#e74c3c';
    return '#f39c12';
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', background: '#f0fdf4', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📅</div>
            <div>
              <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>Leave Management</h4>
              <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.8rem' }}>Book time off and check approval status</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setLeaveModal(true)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Request Leave</button>
            <button onClick={loadLeaveRequests} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>My Requests</button>
          </div>
          <div style={{ marginTop: '15px' }}>
            {leaveLoading ? <p style={{ color: '#64748b' }}>Loading leave requests...</p> : leaveRequests.length === 0 ? (
              <p style={{ color: '#666' }}>No leave requests yet.</p>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {leaveRequests.map((req, i) => {
                  const status = req.status || 'Pending';
                  const badge = getStatusBadgeColor(status);
                  return (
                    <div key={i} style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>{req.type || 'Leave'}</strong>
                        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: `${badge}20`, color: badge }}>{status}</span>
                      </div>
                      <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#6b7280' }}>{req.startDate || ''} → {req.endDate || ''}</p>
                      {req.reason && <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#94a3b8' }}>{req.reason}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>💵</div>
            <div>
              <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>Cash Support</h4>
              <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.8rem' }}>Request petty cash or reimbursements</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setCashModal(true)} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Request Cash</button>
            <button onClick={loadCashRequests} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>My Requests</button>
          </div>
          <div style={{ marginTop: '15px' }}>
            {cashLoading ? <p style={{ color: '#64748b' }}>Loading cash requests...</p> : cashRequests.length === 0 ? (
              <p style={{ color: '#666' }}>No cash requests yet.</p>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {cashRequests.map((req, i) => {
                  const status = req.status || 'Pending';
                  const badge = getStatusBadgeColor(status);
                  return (
                    <div key={i} style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>N$ {req.amount || '0'}</strong>
                        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: `${badge}20`, color: badge }}>{status}</span>
                      </div>
                      {req.purpose && <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#6b7280' }}>{req.purpose}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {leaveModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setLeaveModal(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', maxWidth: '500px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#1f2937' }}>📅 Request Leave</h3>
              <button onClick={() => setLeaveModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            <form onSubmit={submitLeave} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Leave Type</label>
                <select required value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}>
                  <option value="">Select Leave Type</option>
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick Leave</option>
                  <option value="personal">Personal</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Start Date</label>
                <input type="date" required value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>End Date</label>
                <input type="date" required value={leaveForm.endDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Reason</label>
                <textarea required value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={leaveForm.urgent} onChange={e => setLeaveForm(f => ({ ...f, urgent: e.target.checked }))} />
                  Mark as urgent
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>📅 Submit Request</button>
                <button type="button" onClick={() => setLeaveModal(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cashModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setCashModal(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', maxWidth: '500px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#1f2937' }}>💵 Request Cash</h3>
              <button onClick={() => setCashModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            <form onSubmit={submitCash} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Amount Needed (N$)</label>
                <input type="number" step="0.01" min="1" required value={cashForm.amount} onChange={e => setCashForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Purpose</label>
                <textarea required value={cashForm.purpose} onChange={e => setCashForm(f => ({ ...f, purpose: e.target.value }))} rows={3} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={cashForm.urgent} onChange={e => setCashForm(f => ({ ...f, urgent: e.target.checked }))} />
                  Mark as urgent
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Submit Request</button>
                <button type="button" onClick={() => setCashModal(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── CONSULTANT TRAINING SECTION ─────────────────────────── */
const CONSULT_PLATFORMS = [
  { id: 'zoom',       label: 'Zoom',           icon: '🎥', color: '#2D8CFF', bg: '#eff6ff' },
  { id: 'teams',      label: 'Teams',          icon: '💼', color: '#5b5ea6', bg: '#f5f3ff' },
  { id: 'meet',       label: 'Google Meet',    icon: '📹', color: '#0F9D58', bg: '#f0fdf4' },
  { id: 'webex',      label: 'Cisco Webex',    icon: '🌐', color: '#00A0D1', bg: '#ecfeff' },
  { id: 'skype',      label: 'Skype',          icon: '💬', color: '#00AFF0', bg: '#eff6ff' },
  { id: 'goto',       label: 'GoTo Meeting',   icon: '🖥️', color: '#f97316', bg: '#fff7ed' },
  { id: 'whatsapp',   label: 'WhatsApp',       icon: '📱', color: '#25D366', bg: '#f0fdf4' },
  { id: 'youtube',    label: 'YouTube Live',    icon: '▶️', color: '#FF0000', bg: '#fff5f5' },
  { id: 'facebook',   label: 'Facebook Live',   icon: '📘', color: '#1877F2', bg: '#eff6ff' },
  { id: 'telegram',   label: 'Telegram',        icon: '✈️', color: '#2AABEE', bg: '#f0f9ff' },
  { id: 'campaign',   label: 'Campaign Event',  icon: '🎯', color: '#c41e3a', bg: '#fff0f3' },
  { id: 'in_person',  label: 'In-Person',      icon: '📍', color: '#64748b', bg: '#f8fafc' },
];

function consultGetPlatform(id) {
  return CONSULT_PLATFORMS.find(p => p.id === id) || CONSULT_PLATFORMS[CONSULT_PLATFORMS.length - 1];
}

function ConsultantTrainingSection() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    api.get('/training-schedules')
      .then(d => setSchedules(Array.isArray(d) ? d : []))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, []);

  const AUDIENCE_FOR_CONSULTANT = ['all', 'consultants', 'all_staff'];
  let events = schedules.filter(s => AUDIENCE_FOR_CONSULTANT.includes(s.target_audience || 'all'));
  if (!showPast) events = events.filter(s => new Date(s.date) >= new Date(new Date().toDateString()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', borderRadius: 14, padding: '20px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 40 }}>🎓</span>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Online Training Sessions</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>Click &ldquo;Join Meeting&rdquo; to attend your scheduled training</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#64748b', cursor: 'pointer' }}>
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
          Show past sessions
        </label>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>{events.length} session{events.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 14, border: '2px dashed #e2e8f0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <p style={{ fontWeight: 600, color: '#374151', margin: 0 }}>No upcoming training sessions</p>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: 6 }}>Sessions will appear here when scheduled for consultants.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map(s => {
            const platform = consultGetPlatform(s.platform || 'in_person');
            const isOnline = s.platform && s.platform !== 'in_person';
            const isPast = new Date(s.date) < new Date(new Date().toDateString());
            return (
              <div key={s.id} style={{ borderRadius: 12, border: `2px solid ${isOnline ? platform.color + '44' : '#e2e8f0'}`, overflow: 'hidden', opacity: isPast ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: platform.bg, color: platform.color, fontSize: '0.8rem', fontWeight: 700 }}>
                  <span style={{ fontSize: '1.1rem' }}>{platform.icon}</span>
                  <span>{platform.label}</span>
                  {s.target_audience === 'consultants' && <span style={{ marginLeft: 'auto' }}>🩺 Consultants</span>}
                  {s.target_audience === 'all_staff' && <span style={{ marginLeft: 'auto' }}>👥 All Staff</span>}
                  {s.target_audience === 'all' && <span style={{ marginLeft: 'auto' }}>🌍 Everyone</span>}
                </div>
                <div style={{ padding: '16px', background: '#fff', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 52, background: platform.bg, borderRadius: 10, padding: '6px 4px', textAlign: 'center', border: `2px solid ${platform.color}33` }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: platform.color }}>
                      {new Date(s.date).toLocaleDateString('en', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1f2937', lineHeight: 1.1 }}>{new Date(s.date).getDate()}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1f2937' }}>{s.title}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 16px', marginTop: 4 }}>
                      {s.time && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>🕐 {s.time}</span>}
                      {s.location && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>📍 {s.location}</span>}
                      {s.trainer && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>👤 {s.trainer}</span>}
                    </div>
                    {s.description && <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>{s.description}</p>}
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: isPast ? '#f1f5f9' : '#ede9fe', color: isPast ? '#64748b' : '#7c3aed' }}>
                      {isPast ? 'Past' : 'Upcoming'}
                    </span>
                    {isOnline && s.meeting_link && !isPast && (
                      <a href={s.meeting_link} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: platform.color, color: '#fff', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
                        🔗 Join Meeting
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
