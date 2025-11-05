// Dynapharm Data Injection Script
// This script will inject your local data directly into the deployed system

const LOCAL_DATA = {
    clients: [
        // Your clients data will be inserted here
    ],
    users: [
        {
            "id": "USR001",
            "username": "admin",
            "password": "walker33",
            "fullName": "Administrator",
            "email": "admin@dynapharm.com.na",
            "phone": "061-300877",
            "role": "admin",
            "branch": "townshop",
            "branches": ["townshop"]
        },
        {
            "id": "USR1759829667953",
            "username": "moses",
            "password": "walker33",
            "fullName": "MOSES MUKISA",
            "email": "mosesmukisa1@gmail.com",
            "phone": "0817317160",
            "role": "consultant",
            "branch": "townshop",
            "branches": ["townshop", "khomasdal", "katima", "outapi", "ondangwa", "okongo", "okahao", "nkurenkuru", "swakopmund", "hochland-park", "rundu", "gobabis", "walvisbay", "eenhana", "otjiwarongo"],
            "createdAt": "2025-10-07T09:34:27.953Z"
        },
        {
            "id": "USR1759829814781",
            "username": "Geneva",
            "password": "Pearl_11",
            "fullName": "Jennifer Joseph",
            "email": "shange1124@gmail.com",
            "phone": "0852803618",
            "role": "consultant",
            "branch": "townshop",
            "branches": ["townshop", "khomasdal", "katima", "outapi", "ondangwa", "okongo", "okahao", "nkurenkuru", "swakopmund", "hochland-park", "rundu", "gobabis", "walvisbay", "eenhana", "otjiwarongo"],
            "createdAt": "2025-10-07T09:36:54.781Z"
        },
        {
            "id": "USR1759830625722",
            "username": "NAEM",
            "password": "PASSWORD",
            "fullName": "NAEM HANGULA",
            "email": "naemhangula4@gmail.com",
            "phone": "0817499757",
            "role": "dispenser",
            "branch": "townshop",
            "branches": ["townshop"],
            "createdAt": "2025-10-07T09:50:25.722Z"
        },
        {
            "id": "USR1759928153488",
            "username": "GEINGOS",
            "password": "ALBERTO99",
            "fullName": "HILMA C",
            "email": "geingoshilma@gmail",
            "phone": "0814137106",
            "role": "consultant",
            "branch": "townshop",
            "branches": ["townshop", "khomasdal", "katima", "outapi", "ondangwa", "okongo", "okahao", "nkurenkuru", "swakopmund", "hochland-park", "rundu", "gobabis", "walvisbay", "eenhana", "otjiwarongo"],
            "createdAt": "2025-10-08T12:55:53.488Z"
        }
    ],
    branches: [
        {"id": "townshop", "name": "TOWNSHOP (Head Office)", "location": "Shop No.1 Continental Building Independence Avenue - Windhoek", "phone": "814683999"},
        {"id": "khomasdal", "name": "KHOMASDAL DPC", "location": "Shop No.2 Khomasdal Funky Town - Windhoek", "phone": "814682991"},
        {"id": "katima", "name": "KATIMA DPC", "location": "Opposite Open Market Hospital Road, Katima", "phone": "817375818"},
        {"id": "outapi", "name": "OUTAPI DPC", "location": "Okasilili Location in Christmas Building, Next Tolemeka Garage Main Road Oshakati - Outapi", "phone": "814685886"},
        {"id": "ondangwa", "name": "ONDANGWA DPC", "location": "Shop No.3 Woerman Block Oluno, Opposite Fresco, Cash and Carry Entrance Ondangwa", "phone": "814685882"},
        {"id": "okongo", "name": "OKONGO DPC", "location": "Handongo Festus Erf 333 Okongo Village Council", "phone": "814684935"},
        {"id": "okahao", "name": "OKAHAO DPC", "location": "Iteka complex opposite Pep store Okahao - Oshakati main road", "phone": "814683963"},
        {"id": "nkurenkuru", "name": "NKURENKURU DPC", "location": "Total Service Station, Next to Oluno Bar - Nkurenkuru", "phone": "814684939"},
        {"id": "swakopmund", "name": "SWAKOPMUND DPC", "location": "Opposite Mondesa Usave Swakopmund", "phone": "814686806"},
        {"id": "hochland-park", "name": "HOCHLAND PARK", "location": "House No.2 Robin Road, Taubern Glain Street, Next to OK Food Windhoek", "phone": "813207195"},
        {"id": "rundu", "name": "RUNDU DPC", "location": "Shop No.6 Fish Building opposite, Dr. Romanus Kampungi Stadium", "phone": "814050125"},
        {"id": "gobabis", "name": "GOBABIS", "location": "Shop No. Church Street Woerman Complex Gobabis", "phone": "814685905"},
        {"id": "walvisbay", "name": "WALVISBAY", "location": "Shop No.6 Pelican Mall Shop Sam Nujoma Avenue", "phone": "814685894"},
        {"id": "eenhana", "name": "EENHANA", "location": "Shop No.3 Tangi Complex, Next to Namibia Funeral Supply, Dimo Amaambo Street Eenhana", "phone": "814682049"},
        {"id": "otjiwarongo", "name": "OTJIWARONGO DPC", "location": "Erindi Complex next to Spar", "phone": "814681997"}
    ],
    reports: [
        {
                "id": "RPT1759830407708",
                "clientId": "CLT-NGHISHIDIMBWA-NB96061001371-1759828718144",
                "clientInfo": {
                        "fullName": "Nghishidimbwa Mathias Nghipangelwa",
                        "phone": "0816716038",
                        "email": "",
                        "nbNumber": "NB96061001371"
                },
                "consultant": "Jennifer Joseph",
                "consultantInfo": {
                        "fullName": "Jennifer Joseph",
                        "email": "shange1124@gmail.com",
                        "phone": "0852803618"
                },
                "notes": "~Try to take in more zinc .\nReduce carbonated drinks.\nReduce Stress .",
                "prescription": "Dyna Tonic 780ml, Ginali Capsule 100's, Tongkat Ali & Maca - C, Tongkat Ali Caps 100 S, Yeeginako Tabs 90's , 30's",
                "medicines": [
                        {
                                "name": "Dyna Tonic 780ml",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 600,
                                        "cp": 710,
                                        "bv": 120,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.722Z"
                                }
                        },
                        {
                                "name": "Ginali Capsule 100's",
                                "dispensed": true,
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-07T09:51:59.749Z",
                                "paid": true,
                                "paidBy": "NAEM HANGULA",
                                "paidAt": "2025-10-07T09:54:23.067Z",
                                "currentPrice": {
                                        "dp": 403,
                                        "cp": 493,
                                        "bv": 80,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.722Z"
                                }
                        },
                        {
                                "name": "Tongkat Ali & Maca - C",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 250,
                                        "cp": 300,
                                        "bv": 38,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.722Z"
                                }
                        },
                        {
                                "name": "Tongkat Ali Caps 100 S",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 400,
                                        "cp": 490,
                                        "bv": 80,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.722Z"
                                }
                        },
                        {
                                "name": "Yeeginako Tabs 90's , 30's",
                                "dispensed": true,
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-07T09:51:55.005Z",
                                "paid": true,
                                "paidBy": "NAEM HANGULA",
                                "paidAt": "2025-10-07T09:54:27.781Z",
                                "currentPrice": {
                                        "dp": 364,
                                        "cp": 454,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.722Z"
                                }
                        }
                ],
                "followUpDate": "2025-10-21",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-07T09:46:47.708Z",
                "dispensed": false
        },
        {
                "id": "RPT1759834647793",
                "clientId": "CLT-MWAREWANGEPO-NBN/A-1759832656098",
                "clientInfo": {
                        "fullName": "Mwarewangepo Munyaradzi Gwinyayi",
                        "phone": "0816432344",
                        "email": "m.g.mwarewangepo@gmail.com",
                        "nbNumber": "N/A"
                },
                "consultant": "Jennifer Joseph",
                "consultantInfo": {
                        "fullName": "Jennifer Joseph",
                        "email": "shange1124@gmail.com",
                        "phone": "0852803618"
                },
                "notes": "High Uric Acid and Liver fat .\nHigh Cholesterol.\nLow Insulin.\n(Maintain a healthier Lifestyle)",
                "prescription": "Di Liquid Alpha Alpha 500ml, Dyna Tonic 780ml, Green Tea Capsule 60's, Milk Thistle Tablet 120's, Tongkat Ali Coffee, Yeeginako Tabs 90's , 30's",
                "medicines": [
                        {
                                "name": "Di Liquid Alpha Alpha 500ml",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 430,
                                        "cp": 530,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.728Z"
                                }
                        },
                        {
                                "name": "Dyna Tonic 780ml",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 600,
                                        "cp": 710,
                                        "bv": 120,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.728Z"
                                }
                        },
                        {
                                "name": "Green Tea Capsule 60's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 344,
                                        "cp": 430,
                                        "bv": 85,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.728Z"
                                }
                        },
                        {
                                "name": "Milk Thistle Tablet 120's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 500,
                                        "cp": 592,
                                        "bv": 125,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.728Z"
                                }
                        },
                        {
                                "name": "Tongkat Ali Coffee",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 260,
                                        "cp": 320,
                                        "bv": 38,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.728Z"
                                }
                        },
                        {
                                "name": "Yeeginako Tabs 90's , 30's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 364,
                                        "cp": 454,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.728Z"
                                }
                        }
                ],
                "followUpDate": "2025-11-07",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-07T10:57:27.793Z",
                "dispensed": false
        },
        {
                "id": "RPT1759837456161",
                "clientId": "CLT-KAUANDENGE-NB80010910204-1759835675309",
                "clientInfo": {
                        "fullName": "Kauandenge Erenfried",
                        "phone": "0812337395",
                        "email": "Erenfriedkauandenge@gmail.com",
                        "nbNumber": "80010910204"
                },
                "consultant": "Jennifer Joseph",
                "consultantInfo": {
                        "fullName": "Jennifer Joseph",
                        "email": "shange1124@gmail.com",
                        "phone": "0852803618"
                },
                "notes": "Hypertension (BP:/120, P:88).\nHigh Cholesterol.\nNB:Please exercise more,quit beer ,Eat more green leafy vegetables.",
                "prescription": "Di Liquid Alpha Alpha 500ml, Dyna Tonic 780ml, Ginseng Capsule, Milk Thistle Tablet 120's, Yeegarlic 90's, Yeeginako Tabs 90's , 30's",
                "medicines": [
                        {
                                "name": "Di Liquid Alpha Alpha 500ml",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 430,
                                        "cp": 530,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.733Z"
                                }
                        },
                        {
                                "name": "Dyna Tonic 780ml",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 600,
                                        "cp": 710,
                                        "bv": 120,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.733Z"
                                }
                        },
                        {
                                "name": "Ginseng Capsule",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 546,
                                        "cp": 655,
                                        "bv": 115,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.734Z"
                                }
                        },
                        {
                                "name": "Milk Thistle Tablet 120's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 500,
                                        "cp": 592,
                                        "bv": 125,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.734Z"
                                }
                        },
                        {
                                "name": "Yeegarlic 90's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 300,
                                        "cp": 390,
                                        "bv": 64,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.734Z"
                                }
                        },
                        {
                                "name": "Yeeginako Tabs 90's , 30's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 364,
                                        "cp": 454,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.734Z"
                                }
                        }
                ],
                "followUpDate": "2025-11-07",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-07T11:44:16.161Z",
                "dispensed": false
        },
        {
                "id": "RPT1759840685965",
                "clientId": "CLT-JEROME-NB07083000452-1759833199954",
                "clientInfo": {
                        "fullName": "JEROME JOSEPH",
                        "phone": "0814803618",
                        "email": "jjoseph@gmail.com",
                        "nbNumber": "07083000452"
                },
                "consultant": "MOSES MUKISA",
                "consultantInfo": {
                        "fullName": "MOSES MUKISA",
                        "email": "mosesmukisa1@gmail.com",
                        "phone": "0817317160"
                },
                "notes": "",
                "prescription": "Gano & Green Tea - C, Blood Circulation Package",
                "medicines": [
                        {
                                "name": "Gano & Green Tea - C",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 260,
                                        "cp": 320,
                                        "bv": 38,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.737Z"
                                }
                        },
                        {
                                "name": "Blood Circulation Pack",
                                "dispensed": false,
                                "packageStatus": {
                                        "YEEGINKGO TABLET 90's": "not_given",
                                        "YEEGARLIC CAPSULE 90's": "not_given"
                                },
                                "currentPrice": {
                                        "dp": 3290,
                                        "cp": 3854,
                                        "bv": 657,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.737Z"
                                }
                        }
                ],
                "symptoms": [
                        "headache",
                        "poor_concentration",
                        "shortness_breath",
                        "fatigue",
                        "bloating",
                        "loss_appetite",
                        "chest_tightness",
                        "slow_healing",
                        "mood_swings",
                        "back_neck_pain",
                        "lower_back_pain",
                        "erectile_issues",
                        "hair_loss"
                ],
                "subHealthAnalysis": {
                        "affectedSystems": [],
                        "systemAnalysis": "\n                        <div style=\"background: #e3f2fd; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\ud83e\udde0</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #2196f3;\">Nervous System</h4>\n                                    <span style=\"background: #ff9800; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Moderate Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Controls all body functions and reactions. Sub-health often results from stress, poor sleep, or overwork.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">HEADACHE</span><span style=\"background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">POOR CONCENTRATION</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #ffebee; padding: 15px; border-radius: 8px; border-left: 4px solid #f44336; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\u2764\ufe0f</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #f44336;\">Cardiovascular System</h4>\n                                    <span style=\"background: #ff9800; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Moderate Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Maintains blood circulation and oxygen supply. Modern sedentary habits weaken its efficiency.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #f44336; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">SHORTNESS BREATH</span><span style=\"background: #f44336; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">FATIGUE</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #f3e5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #9c27b0; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\ud83d\udd04</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #9c27b0;\">Digestive System</h4>\n                                    <span style=\"background: #ff9800; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Moderate Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Responsible for nutrient absorption and waste elimination. Highly affected by poor diet and stress.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #9c27b0; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">BLOATING</span><span style=\"background: #9c27b0; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">LOSS APPETITE</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #e8f5e8; padding: 15px; border-radius: 8px; border-left: 4px solid #4caf50; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\ud83e\udec1</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #4caf50;\">Respiratory System</h4>\n                                    <span style=\"background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Low Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Ensures oxygen intake and carbon dioxide removal. Air pollution and smoking are key stressors.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #4caf50; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">CHEST TIGHTNESS</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #ff9800; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\ud83d\udee1\ufe0f</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #ff9800;\">Immune System</h4>\n                                    <span style=\"background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Low Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Defends the body from infections and diseases. Sub-health reduces its efficiency.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #ff9800; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">SLOW HEALING</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #fce4ec; padding: 15px; border-radius: 8px; border-left: 4px solid #e91e63; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\u2696\ufe0f</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #e91e63;\">Endocrine System (Hormonal Balance)</h4>\n                                    <span style=\"background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Low Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Regulates hormones and metabolism. Stress and irregular sleep often disrupt it.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #e91e63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">MOOD SWINGS</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #e0f2f1; padding: 15px; border-radius: 8px; border-left: 4px solid #009688; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\ud83e\uddb4</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #009688;\">Musculoskeletal System</h4>\n                                    <span style=\"background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Low Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Provides structural support and movement. Lack of physical activity and poor posture lead to sub-health issues.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #009688; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">BACK NECK PAIN</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #e3f2fd; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\ud83d\udca7</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #2196f3;\">Urinary System</h4>\n                                    <span style=\"background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Low Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Filters waste from the blood and maintains fluid balance. Dehydration and poor diet affect it.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">LOWER BACK PAIN</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #f3e5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #9c27b0; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\ud83d\udc65</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #9c27b0;\">Reproductive System (Male Focus)</h4>\n                                    <span style=\"background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Low Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Reproductive health reflects overall hormonal and physical balance. Sub-health can reduce fertility and vitality.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #9c27b0; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">ERECTILE ISSUES</span>\n                                </div>\n                            </div>\n                        </div>\n                    \n                        <div style=\"background: #fff8e1; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 15px;\">\n                            <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                <span style=\"font-size: 1.5em; margin-right: 10px;\">\u2728</span>\n                                <div>\n                                    <h4 style=\"margin: 0; color: #ffc107;\">Integumentary System (Skin, Hair, Nails)</h4>\n                                    <span style=\"background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;\">\n                                        Low Priority\n                                    </span>\n                                </div>\n                            </div>\n                            <p style=\"margin: 8px 0; color: #666; font-size: 0.9em;\">Body's largest organ system, showing external signs of internal imbalance.</p>\n                            <div style=\"margin-top: 10px;\">\n                                <strong>Affected Areas:</strong>\n                                <div style=\"margin-top: 5px;\">\n                                    <span style=\"background: #ffc107; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;\">HAIR LOSS</span>\n                                </div>\n                            </div>\n                        </div>\n                    ",
                        "recommendations": "\n                            <div style=\"background: #e3f2fd; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\ud83e\udde0</span>\n                                    <h4 style=\"margin: 0; color: #2196f3;\">Nervous System</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Maintain a <strong>fixed sleep schedule</strong> and avoid late-night screen exposure.</li><li style=\"margin-bottom: 5px;\">Practice <strong>stress management</strong> through meditation, prayer, or quiet time.</li><li style=\"margin-bottom: 5px;\">Eat foods rich in <strong>omega-3, B-vitamins, and magnesium</strong> (fish, eggs, nuts, greens).</li><li style=\"margin-bottom: 5px;\">Take <strong>mental breaks</strong> from continuous digital use.</li><li style=\"margin-bottom: 5px;\">Engage in <strong>creative or social activities</strong> to refresh the mind.</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #ffebee; padding: 15px; border-radius: 8px; border-left: 4px solid #f44336; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\u2764\ufe0f</span>\n                                    <h4 style=\"margin: 0; color: #f44336;\">Cardiovascular System</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Exercise moderately (walking, cycling, swimming) <strong>at least 4 times weekly</strong>.</li><li style=\"margin-bottom: 5px;\">Eat a <strong>heart-friendly diet</strong>: fruits, vegetables, fish, olive oil, and whole grains.</li><li style=\"margin-bottom: 5px;\">Avoid smoking and reduce fried and salty foods.</li><li style=\"margin-bottom: 5px;\">Maintain healthy blood pressure and cholesterol.</li><li style=\"margin-bottom: 5px;\">Manage stress through breathing exercises or yoga.</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #f3e5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #9c27b0; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\ud83d\udd04</span>\n                                    <h4 style=\"margin: 0; color: #9c27b0;\">Digestive System</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Eat <strong>smaller, regular meals</strong> and chew food thoroughly.</li><li style=\"margin-bottom: 5px;\">Increase <strong>fiber and water</strong> intake.</li><li style=\"margin-bottom: 5px;\">Avoid late dinners and processed foods.</li><li style=\"margin-bottom: 5px;\">Add <strong>probiotics</strong> (yogurt, fermented vegetables).</li><li style=\"margin-bottom: 5px;\">Limit alcohol and sugary drinks that disturb digestion.</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #e8f5e8; padding: 15px; border-radius: 8px; border-left: 4px solid #4caf50; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\ud83e\udec1</span>\n                                    <h4 style=\"margin: 0; color: #4caf50;\">Respiratory System</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Avoid smoking and polluted environments.</li><li style=\"margin-bottom: 5px;\">Practice <strong>deep breathing</strong> or aerobic exercises to expand lung capacity.</li><li style=\"margin-bottom: 5px;\">Keep indoor air fresh with plants and ventilation.</li><li style=\"margin-bottom: 5px;\">Maintain ideal weight to reduce breathing strain.</li><li style=\"margin-bottom: 5px;\">Use <strong>steam inhalation or saline spray</strong> to clear airways.</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #ff9800; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\ud83d\udee1\ufe0f</span>\n                                    <h4 style=\"margin: 0; color: #ff9800;\">Immune System</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Sleep well and rest after strenuous work.</li><li style=\"margin-bottom: 5px;\">Eat <strong>immune-boosting foods</strong> (garlic, citrus, mushrooms, green vegetables).</li><li style=\"margin-bottom: 5px;\">Reduce sugar and refined food intake.</li><li style=\"margin-bottom: 5px;\">Exercise regularly but avoid over-training.</li><li style=\"margin-bottom: 5px;\">Take <strong>vitamin C, D, and zinc supplements</strong> when needed.</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #fce4ec; padding: 15px; border-radius: 8px; border-left: 4px solid #e91e63; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\u2696\ufe0f</span>\n                                    <h4 style=\"margin: 0; color: #e91e63;\">Endocrine System (Hormonal Balance)</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Maintain <strong>consistent sleep and meal times</strong>.</li><li style=\"margin-bottom: 5px;\">Avoid refined sugar and excessive alcohol.</li><li style=\"margin-bottom: 5px;\">Manage stress; high cortisol disrupts testosterone.</li><li style=\"margin-bottom: 5px;\">Include <strong>protein, zinc, and healthy fats</strong> (eggs, seeds, fish).</li><li style=\"margin-bottom: 5px;\">Exercise regularly, focusing on <strong>strength training</strong> to boost hormones.</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #e0f2f1; padding: 15px; border-radius: 8px; border-left: 4px solid #009688; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\ud83e\uddb4</span>\n                                    <h4 style=\"margin: 0; color: #009688;\">Musculoskeletal System</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Perform <strong>daily stretching and strength exercises</strong>.</li><li style=\"margin-bottom: 5px;\">Use ergonomic chairs and correct sitting posture.</li><li style=\"margin-bottom: 5px;\">Ensure <strong>adequate calcium, vitamin D, and magnesium</strong> intake.</li><li style=\"margin-bottom: 5px;\">Get body massages or engage in yoga.</li><li style=\"margin-bottom: 5px;\">Stay active; avoid sitting for long hours.</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #e3f2fd; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\ud83d\udca7</span>\n                                    <h4 style=\"margin: 0; color: #2196f3;\">Urinary System</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Drink <strong>1.5\u20132 liters of clean water daily</strong>.</li><li style=\"margin-bottom: 5px;\">Avoid holding urine for long.</li><li style=\"margin-bottom: 5px;\">Limit caffeine and alcohol.</li><li style=\"margin-bottom: 5px;\">Keep genital hygiene; avoid excessive salt and spicy foods.</li><li style=\"margin-bottom: 5px;\">Support kidney health with <strong>herbal teas</strong> (corn silk, dandelion).</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #f3e5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #9c27b0; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\ud83d\udc65</span>\n                                    <h4 style=\"margin: 0; color: #9c27b0;\">Reproductive System (Male Focus)</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Sleep 7\u20138 hours to allow testosterone recovery.</li><li style=\"margin-bottom: 5px;\">Eat <strong>zinc-rich foods</strong> (oysters, nuts, eggs) and antioxidants (tomatoes, berries).</li><li style=\"margin-bottom: 5px;\">Avoid tight clothing and excessive heat near the groin.</li><li style=\"margin-bottom: 5px;\">Exercise regularly; avoid obesity and smoking.</li><li style=\"margin-bottom: 5px;\">Manage stress and maintain healthy emotional relationships.</li>\n                                </ul>\n                            </div>\n                        \n                            <div style=\"background: #fff8e1; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 15px;\">\n                                <div style=\"display: flex; align-items: center; margin-bottom: 10px;\">\n                                    <span style=\"font-size: 1.2em; margin-right: 8px;\">\u2728</span>\n                                    <h4 style=\"margin: 0; color: #ffc107;\">Integumentary System (Skin, Hair, Nails)</h4>\n                                </div>\n                                <div style=\"margin-bottom: 10px;\">\n                                    <strong style=\"color: #2c3e50;\">Healthy Lifestyle Recommendations:</strong>\n                                </div>\n                                <ul style=\"margin: 0; padding-left: 20px; color: #555;\">\n                                    <li style=\"margin-bottom: 5px;\">Drink <strong>plenty of water</strong> and eat fruits high in vitamins A, C, and E.</li><li style=\"margin-bottom: 5px;\">Use mild soaps and keep skin moisturized.</li><li style=\"margin-bottom: 5px;\">Sleep early to allow skin regeneration.</li><li style=\"margin-bottom: 5px;\">Avoid smoking and excess alcohol.</li><li style=\"margin-bottom: 5px;\">Include <strong>collagen and protein-rich foods</strong> (fish, soy, eggs).</li>\n                                </ul>\n                            </div>\n                        \n                    <div style=\"margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;\">\n                        <div style=\"display: flex; align-items: center; margin-bottom: 8px;\">\n                            <span style=\"font-size: 1.2em; margin-right: 8px;\">\u26a0\ufe0f</span>\n                            <strong style=\"color: #856404;\">Sub-Health Analysis Summary</strong>\n                        </div>\n                        <p style=\"margin: 0; color: #856404; font-size: 0.9em;\">\n                            10 body system(s) showing sub-health trends. Focus on implementing the recommendations above for comprehensive wellness improvement. Consider a holistic approach addressing the most affected systems first.\n                        </p>\n                    </div>\n                ",
                        "analysisTimestamp": "2025-10-07T12:38:05.965Z"
                },
                "followUpDate": "2025-10-21",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-07T12:38:05.965Z",
                "dispensed": false
        },
        {
                "id": "RPT1759845804625",
                "clientId": "CLT-HERMAN-NBNB011114-1759844161976",
                "clientInfo": {
                        "fullName": "HERMAN OTTO JACOBES",
                        "phone": "0812959041",
                        "email": "dynapharmnamibia@gmail.com",
                        "nbNumber": "NB011114"
                },
                "consultant": "MOSES MUKISA",
                "consultantInfo": {
                        "fullName": "MOSES MUKISA",
                        "email": "mosesmukisa1@gmail.com",
                        "phone": "0817317160"
                },
                "notes": "Stop smoking and drinking Alcohol. Drink more water ",
                "prescription": "Gano & Green Tea - C, Blood Circulation Package",
                "medicines": [
                        {
                                "name": "Gano & Green Tea - C",
                                "dispensed": true,
                                "price": 0,
                                "dp": 0,
                                "bv": 0,
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-09T09:22:07.278Z",
                                "currentPrice": {
                                        "dp": 260,
                                        "cp": 320,
                                        "bv": 38,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.743Z"
                                }
                        },
                        {
                                "name": "Blood Circulation Pack",
                                "dispensed": true,
                                "price": 0,
                                "dp": 0,
                                "bv": 0,
                                "packageStatus": {
                                        "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ml": "given",
                                        "DYNA TONIC 780ml": "given",
                                        "YEE YANG YEN TABLET 90's": "given",
                                        "YEEGINKGO TABLET 90's": "given",
                                        "GINSENG CAPSULE 9 x 10's": "given",
                                        "YEEGARLIC CAPSULE 90's": "given",
                                        "INSTANT COFFEE W/ TONGKAT ALI 20's x 21g": "given",
                                        "YEEGANO CAPSULE 90's": "given"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-09T09:22:57.526Z",
                                "currentPrice": {
                                        "dp": 3290,
                                        "cp": 3854,
                                        "bv": 657,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.743Z"
                                }
                        }
                ],
                "symptoms": [
                        "headache",
                        "dizziness",
                        "insomnia",
                        "palpitations",
                        "shortness_breath",
                        "cough",
                        "chest_tightness",
                        "low_lung_endurance",
                        "eye_fatigue",
                        "tinnitus"
                ],
                "subHealthAnalysis": {
                        "affectedSystems": [],
                        "systemStatus": {},
                        "totalSystemsAffected": 0,
                        "timestamp": "2025-10-07T14:03:24.625Z"
                },
                "followUpDate": "2025-11-07",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-07T14:03:24.625Z",
                "dispensed": false,
                "status": "pending_dispensing"
        },
        {
                "id": "RPT1759916564293",
                "clientId": "CLT-NGATJIZEKO-NBNb-1759915857564",
                "clientInfo": {
                        "fullName": "Ngatjizeko Theodor",
                        "phone": "0817644224",
                        "email": "tngatjizeko28@gmail.com",
                        "nbNumber": "Nb"
                },
                "consultant": "MOSES MUKISA",
                "consultantInfo": {
                        "fullName": "MOSES MUKISA",
                        "email": "mosesmukisa1@gmail.com",
                        "phone": "0817317160"
                },
                "notes": "exercise more (cardio exercises )\navoid consumption of carbonated drinks \nsleep more and drink more warm water ",
                "prescription": "Blood Circulation Package",
                "medicines": [
                        {
                                "name": "Blood Circulation Pack",
                                "dispensed": false,
                                "packageStatus": {
                                        "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ml": "given"
                                },
                                "currentPrice": {
                                        "dp": 3290,
                                        "cp": 3854,
                                        "bv": 657,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.748Z"
                                }
                        }
                ],
                "followUpDate": "2025-11-07",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-08T09:42:44.293Z",
                "dispensed": false
        },
        {
                "id": "RPT1759922228373",
                "clientId": "CLT-GWESU-NBNB0631297150942-1759921485554",
                "clientInfo": {
                        "fullName": "Gwesu Munyaradzi",
                        "phone": "081351233",
                        "email": "munyanic2010@gmail.com",
                        "nbNumber": "NB0631297150942"
                },
                "consultant": "MOSES MUKISA",
                "consultantInfo": {
                        "fullName": "MOSES MUKISA",
                        "email": "mosesmukisa1@gmail.com",
                        "phone": "0817317160"
                },
                "notes": "BP. 153/98 ps100bm\navoid consumption of animal fat(milk,cheese,yogurt,butter,meat etc)\ncardial exercises (walking , jogging ,cycling ) ",
                "prescription": "Blood Circulation Package",
                "medicines": [
                        {
                                "name": "Blood Circulation Pack",
                                "dispensed": true,
                                "packageStatus": {
                                        "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ml": "given",
                                        "DYNA TONIC 780ml": "given",
                                        "YEE YANG YEN TABLET 90's": "given",
                                        "YEEGINKGO TABLET 90's": "given",
                                        "GINSENG CAPSULE 9 x 10's": "given",
                                        "YEEGANO CAPSULE 90's": "given",
                                        "YEEGARLIC CAPSULE 90's": "given",
                                        "INSTANT COFFEE W/ TONGKAT ALI 20's x 21g": "given"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-09T08:42:56.783Z",
                                "currentPrice": {
                                        "dp": 3290,
                                        "cp": 3854,
                                        "bv": 657,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.752Z"
                                }
                        }
                ],
                "followUpDate": "2025-11-07",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-08T11:17:08.373Z",
                "dispensed": false
        },
        {
                "id": "RPT1759996024947",
                "clientId": "CLT-AMASIA-NB88101000755-1759992170364",
                "clientInfo": {
                        "fullName": "Amasia N Iileka",
                        "phone": "0815672716",
                        "email": "amasiaileka@gmail.com",
                        "nbNumber": "88101000755"
                },
                "consultant": "MOSES MUKISA",
                "consultantInfo": {
                        "fullName": "MOSES MUKISA",
                        "email": "mosesmukisa1@gmail.com",
                        "phone": "0817317160"
                },
                "notes": "Adopt to cardio exercises and stretches.\nvisit a chiropractor  ",
                "prescription": "Ginali Capsule 100's, Noni 1 Ltr, Nutmeg Ointment 2 X 20g, Tongkat Ali Coffee, Yeegano Caps 90's",
                "medicines": [
                        {
                                "name": "Ginali Capsule 100's",
                                "dispensed": true,
                                "paid": false,
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-09T08:03:21.389Z",
                                "currentPrice": {
                                        "dp": 403,
                                        "cp": 493,
                                        "bv": 80,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.758Z"
                                }
                        },
                        {
                                "name": "Noni 1 Ltr",
                                "dispensed": false,
                                "paid": false
                        },
                        {
                                "name": "Nutmeg Ointment 2 X 20g",
                                "dispensed": true,
                                "paid": false,
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-09T07:59:49.494Z",
                                "currentPrice": {
                                        "dp": 180,
                                        "cp": 234,
                                        "bv": 19.5,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.758Z"
                                }
                        },
                        {
                                "name": "Tongkat Ali Coffee",
                                "dispensed": true,
                                "paid": false,
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-09T07:59:56.654Z",
                                "currentPrice": {
                                        "dp": 260,
                                        "cp": 320,
                                        "bv": 38,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.758Z"
                                }
                        },
                        {
                                "name": "Yeegano Caps 90's",
                                "dispensed": true,
                                "paid": false,
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-09T08:03:17.701Z",
                                "currentPrice": {
                                        "dp": 195,
                                        "cp": 254,
                                        "bv": 27,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.758Z"
                                }
                        }
                ],
                "followUpDate": "2025-10-31",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-09T07:47:04.947Z",
                "lastModified": "2025-10-09T08:48:11.139Z",
                "dispensed": false
        },
        {
                "id": "RPT1759997141926",
                "clientId": "CLT-PETRUS-NB54040300645-1759994851719",
                "clientInfo": {
                        "fullName": "Petrus Tsitsilia",
                        "phone": "0818129298",
                        "email": "thresialeonard@gmail.com",
                        "nbNumber": "54040300645"
                },
                "consultant": "MOSES MUKISA",
                "consultantInfo": {
                        "fullName": "MOSES MUKISA",
                        "email": "mosesmukisa1@gmail.com",
                        "phone": "0817317160"
                },
                "notes": "Minmize consumption consumption of animal fat.\nminmize alcahol consumption \nAdot to Hot water therapy \n",
                "prescription": "Elderly Package (Female)",
                "medicines": [
                        {
                                "name": "Elderly Package (Female)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 3801,
                                        "cp": 4475,
                                        "bv": 779.5,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.764Z"
                                },
                                "packageStatus": {
                                        "NUTMEG OINTMENT 2 x 20g": "given"
                                }
                        }
                ],
                "followUpDate": "2025-10-31",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-09T08:05:41.926Z",
                "dispensed": false
        },
        {
                "id": "RPT1759998887609",
                "clientId": "CLT-MWAMBO-NB58110700365-1759997280974",
                "clientInfo": {
                        "fullName": "Mwambo Nyama Maria",
                        "phone": "0813985792",
                        "email": "ndumbperry@gmail.com",
                        "nbNumber": "58110700365"
                },
                "consultant": "MOSES MUKISA",
                "consultantInfo": {
                        "fullName": "MOSES MUKISA",
                        "email": "mosesmukisa1@gmail.com",
                        "phone": "0817317160"
                },
                "notes": "Drink more warm water , and avoid carbonated drinks. \n\n",
                "prescription": "Elderly Package (Female)",
                "medicines": [
                        {
                                "name": "Elderly Package (Female)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 3801,
                                        "cp": 4475,
                                        "bv": 779.5,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.768Z"
                                },
                                "packageStatus": {}
                        }
                ],
                "followUpDate": "2025-10-23",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-09T08:34:47.609Z",
                "dispensed": false
        },
        {
                "id": "RPT1759999428502",
                "clientId": "CLT-HELIVI-NB90072900962-1759998742790",
                "clientInfo": {
                        "fullName": "HELIVI NAMUPALA SHIMI",
                        "phone": "0816615812",
                        "email": "shimihelvi@gmail.com",
                        "nbNumber": "90072900962"
                },
                "consultant": "MOSES MUKISA",
                "consultantInfo": {
                        "fullName": "MOSES MUKISA",
                        "email": "mosesmukisa1@gmail.com",
                        "phone": "0817317160"
                },
                "notes": "Adopt to more cardio exercises \ndrink more water \n",
                "prescription": "Womens Package",
                "medicines": [
                        {
                                "name": "Womens Package",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 2543,
                                        "cp": 2950,
                                        "bv": 481,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.773Z"
                                },
                                "packageStatus": {
                                        "GAMAT FEMININE WASH (2)": "given",
                                        "HERBA WARISAN MAHARANI 6 x 10g": "given"
                                }
                        }
                ],
                "symptoms": [
                        {
                                "system": "Reproductive System",
                                "symptom": "Reduced sexual desire",
                                "recommendation": "Eat zinc- and vitamin E-rich foods (nuts, seeds, eggs) and manage stress through proper rest."
                        },
                        {
                                "system": "Reproductive System",
                                "symptom": "Irregular cycles or erectile issues",
                                "recommendation": "Exercise to improve circulation and avoid excessive alcohol, smoking, and processed fats."
                        },
                        {
                                "system": "Reproductive System",
                                "symptom": "Hormonal imbalances",
                                "recommendation": "Ensure proper rest, eat hormone-supportive foods, and maintain a regular exercise routine."
                        }
                ],
                "followUpDate": "2025-11-23",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-09T08:43:48.502Z",
                "dispensed": false
        },
        {
                "id": "RPT1760013293404",
                "clientId": "CLT-IYAMBO-NB87032300650-1760012033988",
                "clientInfo": {
                        "fullName": "Iyambo Fillemon",
                        "phone": "0814572099",
                        "email": "pomwenerejoice@gmail.com",
                        "nbNumber": "87032300650"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "REDUCE SPICY FOOD DRINK ALOT OF WATER ",
                "prescription": "Gastric Package",
                "medicines": [
                        {
                                "name": "Gastric Package",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 2054,
                                        "cp": 2432,
                                        "bv": 381,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.777Z"
                                },
                                "packageStatus": {}
                        }
                ],
                "symptoms": [
                        {
                                "system": "Digestive System",
                                "symptom": "Constipation or diarrhea",
                                "recommendation": "Increase fiber and water intake; reduce processed foods."
                        }
                ],
                "followUpDate": "2025-10-23",
                "followUpNotes": "23 11 TO CHANGES",
                "pdf": null,
                "timestamp": "2025-10-09T12:34:53.404Z",
                "dispensed": false
        },
        {
                "id": "RPT1760013850186",
                "clientId": "CLT-IYAMBO-NB87032300650-1760012033988",
                "clientInfo": {
                        "fullName": "Iyambo Fillemon",
                        "phone": "0814572099",
                        "email": "pomwenerejoice@gmail.com",
                        "nbNumber": "87032300650"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "DRINK WATER REDUCE SPICY",
                "prescription": "Gastric Package",
                "medicines": [
                        {
                                "name": "Gastric Package",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 2054,
                                        "cp": 2432,
                                        "bv": 381,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.781Z"
                                },
                                "packageStatus": {}
                        }
                ],
                "symptoms": [
                        {
                                "system": "Digestive System",
                                "symptom": "Bloating and indigestion",
                                "recommendation": "Eat meals on time and chew slowly to aid digestion."
                        },
                        {
                                "system": "Digestive System",
                                "symptom": "Constipation or diarrhea",
                                "recommendation": "Increase fiber and water intake; reduce processed foods."
                        }
                ],
                "followUpDate": "2025-10-23",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-09T12:44:10.186Z",
                "dispensed": false
        },
        {
                "id": "RPT1760015685057",
                "clientId": "CLT-NAKALEKE-NB801110010632-1760007765521",
                "clientInfo": {
                        "fullName": "Nakaleke Johanna",
                        "phone": "0813346918",
                        "email": "jonnynakaleke@gmail.com",
                        "nbNumber": "801110010632"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "REDUCE STRESS MAINTAIN REST",
                "prescription": "Blood Circulation Pack",
                "medicines": [
                        {
                                "name": "Blood Circulation Pack",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 3290,
                                        "cp": 3854,
                                        "bv": 657,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.785Z"
                                },
                                "packageStatus": {}
                        }
                ],
                "symptoms": [
                        {
                                "system": "Reproductive System",
                                "symptom": "Hormonal imbalances",
                                "recommendation": "Ensure proper rest, eat hormone-supportive foods, and maintain a regular exercise routine."
                        }
                ],
                "followUpDate": "2025-10-23",
                "followUpNotes": "TO SEE NEW PROGRESS",
                "pdf": null,
                "timestamp": "2025-10-09T13:14:45.057Z",
                "dispensed": false
        },
        {
                "id": "RPT1760016287537",
                "clientId": "CLT-MWINGA-NB80052810526-1760005460677",
                "clientInfo": {
                        "fullName": "Mwinga Matruda",
                        "phone": "0814140601",
                        "email": "mwinga@gmail.com",
                        "nbNumber": "80052810526"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "MAINTAIN STRESS THROUGH RELAXATION GETTING REGULAR EXERCISE",
                "prescription": "Womens Package",
                "medicines": [
                        {
                                "name": "Womens Package",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 2543,
                                        "cp": 2950,
                                        "bv": 481,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-09T14:37:05.789Z"
                                },
                                "packageStatus": {}
                        }
                ],
                "symptoms": [],
                "followUpDate": "2025-10-23",
                "followUpNotes": "23 NOVEMBER 2025",
                "pdf": null,
                "timestamp": "2025-10-09T13:24:47.537Z",
                "dispensed": false
        },
        {
                "id": "RPT1760017995671",
                "clientId": "CLT-MWINGA-NB80052810526-1760005460677",
                "clientInfo": {
                        "fullName": "Mwinga Matruda",
                        "phone": "0814140601",
                        "email": "mwinga@gmail.com",
                        "nbNumber": "80052810526"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "DRINK ENOUGH FLUID, REDUCE SPICY AND SODA DRINKS,AVOID DUSTY PLACES",
                "prescription": "BEE POLEN CAPSULE (30's), DI LIQUID ALFALFA PLUS GUARANA (500ml, DYNA TONIC (780ml), GOAT'S MILK TABLET 150's, SEA CUCUMBER JELLY (500ml), YEEGANO CAPSULE 90's, YEEGARLIC CAPSULE 90's",
                "medicines": [
                        {
                                "name": "BEE POLEN CAPSULE (30's)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 182,
                                        "cp": 237,
                                        "bv": 32,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.793Z"
                                }
                        },
                        {
                                "name": "DI LIQUID ALFALFA PLUS GUARANA (500ml",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 430,
                                        "cp": 530,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.793Z"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T07:27:34.834Z"
                        },
                        {
                                "name": "DYNA TONIC (780ml)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 600,
                                        "cp": 710,
                                        "bv": 120,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.793Z"
                                }
                        },
                        {
                                "name": "GOAT'S MILK TABLET 150's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 286,
                                        "cp": 372,
                                        "bv": 48,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.793Z"
                                }
                        },
                        {
                                "name": "SEA CUCUMBER JELLY (500ml)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 533,
                                        "cp": 633,
                                        "bv": 110,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.793Z"
                                }
                        },
                        {
                                "name": "YEEGANO CAPSULE 90's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 364,
                                        "cp": 454,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.793Z"
                                }
                        },
                        {
                                "name": "YEEGARLIC CAPSULE 90's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 300,
                                        "cp": 390,
                                        "bv": 64,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-09T14:37:05.793Z"
                                }
                        }
                ],
                "symptoms": [],
                "followUpDate": "2025-10-23",
                "followUpNotes": "TO MANAGE PROGRESS",
                "pdf": null,
                "timestamp": "2025-10-09T13:53:15.671Z",
                "dispensed": false
        },
        {
                "id": "RPT1760083250995",
                "clientId": "CLT-BALIE-NB71010110780-1760081902894",
                "clientInfo": {
                        "fullName": "Balie Rebekka",
                        "phone": "0813450408",
                        "email": "dynapharmnamibia@gmail.com",
                        "nbNumber": "71010110780"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "AVOID DUSTY PLACES,DRINK ENOUGH ,EAT VEGGIES",
                "prescription": "BEE POLLEN CAPSULE (100's), D.I. INSTANT GOAT'S MILK POWDER PREMIX 20's x 21g, DI LIQUID ALFALFA PLUS GUARANA (500ml, DYNA TONIC (780ml), DYNA-RH CAPSULE 100's, SEA CUCUMBER JELLY (500ml), SPIRULINA TABLET (300's), Yeeginako Tabs 90's , 30's",
                "medicines": [
                        {
                                "name": "BEE POLLEN CAPSULE (100's)",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 320,
                                        "cp": 390,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:00:50.995Z"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T08:14:17.426Z"
                        },
                        {
                                "name": "D.I. INSTANT GOAT'S MILK POWDER PREMIX 20's x 21g",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 325,
                                        "cp": 400,
                                        "bv": 43,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:00:50.995Z"
                                }
                        },
                        {
                                "name": "DI LIQUID ALFALFA PLUS GUARANA (500ml",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 430,
                                        "cp": 530,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:00:50.995Z"
                                }
                        },
                        {
                                "name": "DYNA TONIC (780ml)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 600,
                                        "cp": 710,
                                        "bv": 120,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:00:50.995Z"
                                }
                        },
                        {
                                "name": "DYNA-RH CAPSULE 100's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 300,
                                        "cp": 390,
                                        "bv": 60,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:00:50.995Z"
                                }
                        },
                        {
                                "name": "SEA CUCUMBER JELLY (500ml)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 533,
                                        "cp": 633,
                                        "bv": 110,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:00:50.995Z"
                                }
                        },
                        {
                                "name": "SPIRULINA TABLET (300's)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 351,
                                        "cp": 456,
                                        "bv": 64,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:00:50.995Z"
                                }
                        },
                        {
                                "name": "Yeeginako Tabs 90's , 30's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 364,
                                        "cp": 454,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:00:50.995Z"
                                }
                        }
                ],
                "symptoms": [
                        {
                                "system": "Cardiovascular System",
                                "symptom": "Palpitations or irregular heartbeat",
                                "recommendation": "Practice relaxation techniques to reduce stress-induced hypertension and engage in light aerobic exercise."
                        },
                        {
                                "system": "Cardiovascular System",
                                "symptom": "Shortness of breath",
                                "recommendation": "Engage in aerobic exercise (walking, swimming, cycling) for at least 30 minutes, 4\u20135 times weekly."
                        },
                        {
                                "system": "Digestive System",
                                "symptom": "Bloating and indigestion",
                                "recommendation": "Eat meals on time and chew slowly to aid digestion."
                        },
                        {
                                "system": "Digestive System",
                                "symptom": "Loss of appetite or heartburn",
                                "recommendation": "Avoid late-night eating and use probiotic-rich foods (yogurt, fermented vegetables) to maintain gut health."
                        },
                        {
                                "system": "Respiratory System",
                                "symptom": "Chest tightness",
                                "recommendation": "Avoid smoking and dusty environments; keep indoor air fresh with plants or ventilation."
                        },
                        {
                                "system": "Respiratory System",
                                "symptom": "Low lung endurance",
                                "recommendation": "Strengthen lungs through light aerobic activity or yoga."
                        },
                        {
                                "system": "Urinary System",
                                "symptom": "Frequent urination or urgency",
                                "recommendation": "Limit salt and caffeine intake; avoid holding urine for long periods."
                        },
                        {
                                "system": "Urinary System",
                                "symptom": "Lower back pain",
                                "recommendation": "Drink 1.5\u20132 liters of water daily to flush toxins and maintain kidney health."
                        }
                ],
                "followUpDate": "2025-10-24",
                "followUpNotes": "TO SEE PROGRESS OF THE MEDCATION",
                "pdf": null,
                "timestamp": "2025-10-10T08:00:50.995Z",
                "dispensed": false
        },
        {
                "id": "RPT1760084806534",
                "clientId": "CLT-KANKAMENI-NB79112910217-1760082464630",
                "clientInfo": {
                        "fullName": "Kankameni Samuel eelu",
                        "phone": "0811491107",
                        "email": "dynapharmnamibia@gmail.com",
                        "nbNumber": "79112910217"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "AVOID SITTING MORE HOURS, EXECRISE NEEDED",
                "prescription": "DI NONI JUICE 1 L, DYNA SERENOA TABLET 100's, GINALI CAPSULE 100's, GREEN TEA CAPSULE 60's, INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'sx21g), YEEGANO CAPSULE 90's",
                "medicines": [
                        {
                                "name": "DI NONI JUICE 1 L",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 750,
                                        "cp": 950,
                                        "bv": 175,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:26:46.534Z"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T08:46:38.331Z"
                        },
                        {
                                "name": "DYNA SERENOA TABLET 100's",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 520,
                                        "cp": 620,
                                        "bv": 115,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:26:46.534Z"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T08:46:42.903Z"
                        },
                        {
                                "name": "GINALI CAPSULE 100's",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 403,
                                        "cp": 493,
                                        "bv": 80,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:26:46.534Z"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T08:46:46.857Z"
                        },
                        {
                                "name": "GREEN TEA CAPSULE 60's",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 344,
                                        "cp": 430,
                                        "bv": 85,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:26:46.534Z"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T08:46:51.450Z"
                        },
                        {
                                "name": "INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'sx21g)",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 250,
                                        "cp": 300,
                                        "bv": 38,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:26:46.534Z"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T08:46:56.258Z"
                        },
                        {
                                "name": "YEEGANO CAPSULE 90's",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 364,
                                        "cp": 454,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-10T08:26:46.534Z"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T08:47:00.483Z"
                        }
                ],
                "symptoms": [
                        {
                                "system": "Urinary System",
                                "symptom": "Swelling in legs or feet",
                                "recommendation": "Limit salt intake, stay hydrated, and elevate legs when resting."
                        },
                        {
                                "system": "Reproductive System",
                                "symptom": "Irregular cycles or erectile issues",
                                "recommendation": "Exercise to improve circulation and avoid excessive alcohol, smoking, and processed fats."
                        }
                ],
                "followUpDate": "2025-10-24",
                "followUpNotes": "15 NOVEMBER TO PROGRESS",
                "pdf": null,
                "timestamp": "2025-10-10T08:26:46.534Z",
                "dispensed": false
        },
        {
                "id": "RPT1760086496805",
                "clientId": "CLT-EISEB-NB99101100319-1760085115356",
                "clientInfo": {
                        "fullName": "EISEB Marion Mackenzie",
                        "phone": "0818369443",
                        "email": "dynapharmnamibia@gmail.com",
                        "nbNumber": "99101100319"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "",
                "prescription": "Mens Health Package",
                "medicines": [
                        {
                                "name": "Mens Health Package",
                                "dispensed": true,
                                "currentPrice": {
                                        "dp": 2033,
                                        "cp": 2362,
                                        "bv": 388,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-10T08:54:56.805Z"
                                },
                                "packageStatus": {
                                        "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ml": "given",
                                        "DYNA SERENOA TABLET 100's": "given",
                                        "GINALI CAPSULE 100's": "given",
                                        "INSTANT COFFEE W/ TONGKAT ALI 20's x 21g": "given",
                                        "YEEGINKGO TABLET 90's": "given"
                                },
                                "dispensedBy": "NAEM HANGULA",
                                "dispensedAt": "2025-10-10T09:06:17.730Z"
                        }
                ],
                "symptoms": [
                        {
                                "system": "Cardiovascular System",
                                "symptom": "Palpitations or irregular heartbeat",
                                "recommendation": "Practice relaxation techniques to reduce stress-induced hypertension and engage in light aerobic exercise."
                        }
                ],
                "followUpDate": "2025-10-24",
                "followUpNotes": "TO SEE PROGRESS",
                "pdf": null,
                "timestamp": "2025-10-10T08:54:56.805Z",
                "dispensed": false
        },
        {
                "id": "RPT1760087121940",
                "clientId": "CLT-EISEB-NB99101100319-1760085115356",
                "clientInfo": {
                        "fullName": "EISEB Marion Mackenzie",
                        "phone": "0818369443",
                        "email": "dynapharmnamibia@gmail.com",
                        "nbNumber": "99101100319"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "AVOID TO MUCH INTAKE OF NICOTNE",
                "prescription": "Mens Health Package",
                "medicines": [
                        {
                                "name": "Mens Health Package",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 2033,
                                        "cp": 2362,
                                        "bv": 388,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-10T09:05:21.940Z"
                                },
                                "packageStatus": {}
                        }
                ],
                "symptoms": [
                        {
                                "system": "Reproductive System",
                                "symptom": "Reduced sexual desire",
                                "recommendation": "Eat zinc- and vitamin E-rich foods (nuts, seeds, eggs) and manage stress through proper rest."
                        }
                ],
                "followUpDate": "2025-10-24",
                "followUpNotes": "TO PROGRESS",
                "pdf": null,
                "timestamp": "2025-10-10T09:05:21.940Z",
                "dispensed": false
        },
        {
                "id": "RPT1760351997498",
                "clientId": "CLT-NANSES-NB91102300087-1760350491604",
                "clientInfo": {
                        "fullName": "NANSES ALIEN GERTHY",
                        "phone": "0818831447",
                        "email": "Kabistro@gmail.com",
                        "nbNumber": "91102300087"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "DIET  REDUCE INTAKE OF SATURATED AND TRANS FAT,REGULAR EXERCISE  AT VEGGIIES",
                "prescription": "Cleansing And Detoxification Package",
                "medicines": [
                        {
                                "name": "Cleansing And Detoxification Package",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 2183,
                                        "cp": 2596,
                                        "bv": 447,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-13T10:39:57.498Z"
                                },
                                "packageStatus": {}
                        }
                ],
                "symptoms": [
                        {
                                "system": "Nervous System",
                                "symptom": "Headaches and dizziness",
                                "recommendation": "Practice stress-management techniques like meditation, prayer, or deep breathing."
                        },
                        {
                                "system": "Digestive System",
                                "symptom": "Bloating and indigestion",
                                "recommendation": "Eat meals on time and chew slowly to aid digestion."
                        },
                        {
                                "system": "Digestive System",
                                "symptom": "Constipation or diarrhea",
                                "recommendation": "Increase fiber and water intake; reduce processed foods."
                        },
                        {
                                "system": "Endocrine System",
                                "symptom": "Weight fluctuations",
                                "recommendation": "Keep consistent sleep and meal times to stabilize hormones and engage in regular moderate exercise."
                        },
                        {
                                "system": "Urinary System",
                                "symptom": "Lower back pain",
                                "recommendation": "Drink 1.5\u20132 liters of water daily to flush toxins and maintain kidney health."
                        }
                ],
                "followUpDate": "2025-10-27",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-13T10:39:57.498Z",
                "dispensed": false
        },
        {
                "id": "RPT1760354605682",
                "clientId": "CLT-HASHEELA-NB00041300556-1760351526340",
                "clientInfo": {
                        "fullName": "Hasheela Wilma-Ngonyofi",
                        "phone": "0815572970",
                        "email": "dynapharmnamibia@gmail.com",
                        "nbNumber": "00041300556"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "EAT BALANCED DIET RICH,WHOLE GRAIN",
                "prescription": "Gastric Package, HERBA WARISAN MAHARANI 6 x 10g",
                "medicines": [
                        {
                                "name": "Gastric Package",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 2054,
                                        "cp": 2432,
                                        "bv": 381,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-13T11:23:25.682Z"
                                },
                                "packageStatus": {}
                        },
                        {
                                "name": "HERBA WARISAN MAHARANI 6 x 10g",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 520,
                                        "cp": 620,
                                        "bv": 110,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T11:23:25.682Z"
                                }
                        }
                ],
                "symptoms": [
                        {
                                "system": "Digestive System",
                                "symptom": "Bloating and indigestion",
                                "recommendation": "Eat meals on time and chew slowly to aid digestion."
                        },
                        {
                                "system": "Digestive System",
                                "symptom": "Loss of appetite or heartburn",
                                "recommendation": "Avoid late-night eating and use probiotic-rich foods (yogurt, fermented vegetables) to maintain gut health."
                        },
                        {
                                "system": "Reproductive System",
                                "symptom": "Reduced sexual desire",
                                "recommendation": "Eat zinc- and vitamin E-rich foods (nuts, seeds, eggs) and manage stress through proper rest."
                        },
                        {
                                "system": "Reproductive System",
                                "symptom": "Hormonal imbalances",
                                "recommendation": "Ensure proper rest, eat hormone-supportive foods, and maintain a regular exercise routine."
                        }
                ],
                "followUpDate": "2025-10-27",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-13T11:23:25.682Z",
                "dispensed": false
        },
        {
                "id": "RPT1760355839456",
                "clientId": "CLT-KAMBONDE-NB00111000912-1760352132905",
                "clientInfo": {
                        "fullName": "Kambonde Ester Ndapandula",
                        "phone": "0815526522",
                        "email": "ndapandulakam00@gmail.com",
                        "nbNumber": "00111000912"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "EAT FOOD HIGH FIBER MANAGE YOGA",
                "prescription": "Womens Package",
                "medicines": [
                        {
                                "name": "Womens Package",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 2543,
                                        "cp": 2950,
                                        "bv": 481,
                                        "isPackage": true,
                                        "updatedAt": "2025-10-13T11:43:59.456Z"
                                },
                                "packageStatus": {}
                        }
                ],
                "symptoms": [],
                "followUpDate": "2025-10-27",
                "followUpNotes": "TO SEE PROGRESS",
                "pdf": null,
                "timestamp": "2025-10-13T11:43:59.456Z",
                "dispensed": false
        },
        {
                "id": "RPT1760357127457",
                "clientId": "CLT-KATOOLE-NB76091510479-1760353153030",
                "clientInfo": {
                        "fullName": "Katoole Hilma",
                        "phone": "0817275372",
                        "email": "dynapharmnamibia@gmail.com",
                        "nbNumber": "76091510479"
                },
                "consultant": "HILMA C",
                "consultantInfo": {
                        "fullName": "HILMA C",
                        "email": "geingoshilma@gmail",
                        "phone": "0814137106"
                },
                "notes": "REDUCE STRESS AND KEGEL",
                "prescription": "BEE POLLEN CAPSULE (100's), DI LIQUID ALFALFA PLUS GUARANA (500ml, DYNA TONIC (780ml), GREEN TEA CAPSULE 60's, Nano Home Feminine Wash Kacip Fatimah 60ml, SEA CUCUMBER JELLY (500ml), SPIRULINA TABLET (300's), YEEGINKGO TABLETS 90's",
                "medicines": [
                        {
                                "name": "BEE POLLEN CAPSULE (100's)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 320,
                                        "cp": 390,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T12:05:27.457Z"
                                }
                        },
                        {
                                "name": "DI LIQUID ALFALFA PLUS GUARANA (500ml",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 430,
                                        "cp": 530,
                                        "bv": 75,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T12:05:27.457Z"
                                }
                        },
                        {
                                "name": "DYNA TONIC (780ml)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 600,
                                        "cp": 710,
                                        "bv": 120,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T12:05:27.457Z"
                                }
                        },
                        {
                                "name": "GREEN TEA CAPSULE 60's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 344,
                                        "cp": 430,
                                        "bv": 85,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T12:05:27.457Z"
                                }
                        },
                        {
                                "name": "Nano Home Feminine Wash Kacip Fatimah 60ml",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 100,
                                        "cp": 130,
                                        "bv": 11.5,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T12:05:27.457Z"
                                }
                        },
                        {
                                "name": "SEA CUCUMBER JELLY (500ml)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 533,
                                        "cp": 633,
                                        "bv": 110,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T12:05:27.457Z"
                                }
                        },
                        {
                                "name": "SPIRULINA TABLET (300's)",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 351,
                                        "cp": 456,
                                        "bv": 64,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T12:05:27.457Z"
                                }
                        },
                        {
                                "name": "YEEGINKGO TABLETS 90's",
                                "dispensed": false,
                                "currentPrice": {
                                        "dp": 420,
                                        "cp": 500,
                                        "bv": 80,
                                        "isPackage": false,
                                        "updatedAt": "2025-10-13T12:05:27.457Z"
                                }
                        }
                ],
                "symptoms": [
                        {
                                "system": "Cardiovascular System",
                                "symptom": "Palpitations or irregular heartbeat",
                                "recommendation": "Practice relaxation techniques to reduce stress-induced hypertension and engage in light aerobic exercise."
                        },
                        {
                                "system": "Endocrine System",
                                "symptom": "Weight fluctuations",
                                "recommendation": "Keep consistent sleep and meal times to stabilize hormones and engage in regular moderate exercise."
                        },
                        {
                                "system": "Urinary System",
                                "symptom": "Frequent urination or urgency",
                                "recommendation": "Limit salt and caffeine intake; avoid holding urine for long periods."
                        },
                        {
                                "system": "Urinary System",
                                "symptom": "Lower back pain",
                                "recommendation": "Drink 1.5\u20132 liters of water daily to flush toxins and maintain kidney health."
                        },
                        {
                                "system": "Reproductive System",
                                "symptom": "Reduced sexual desire",
                                "recommendation": "Eat zinc- and vitamin E-rich foods (nuts, seeds, eggs) and manage stress through proper rest."
                        },
                        {
                                "system": "Reproductive System",
                                "symptom": "Irregular cycles or erectile issues",
                                "recommendation": "Exercise to improve circulation and avoid excessive alcohol, smoking, and processed fats."
                        }
                ],
                "followUpDate": "2025-10-27",
                "followUpNotes": "",
                "pdf": null,
                "timestamp": "2025-10-13T12:05:27.457Z",
                "dispensed": false
        }
]
};

// Function to inject data into localStorage
function injectData() {
    try {
        // Store data in localStorage with correct keys
        localStorage.setItem('dyna_clients', JSON.stringify(LOCAL_DATA.clients));
        localStorage.setItem('dyna_users', JSON.stringify(LOCAL_DATA.users));
        localStorage.setItem('dyna_branches', JSON.stringify(LOCAL_DATA.branches));
        localStorage.setItem('dyna_reports', JSON.stringify(LOCAL_DATA.reports));
        
        console.log('✅ Data injected successfully!');
        console.log(`📊 Clients: ${LOCAL_DATA.clients.length}`);
        console.log(`👥 Users: ${LOCAL_DATA.users.length}`);
        console.log(`🏢 Branches: ${LOCAL_DATA.branches.length}`);
        console.log(`📋 Reports: ${LOCAL_DATA.reports.length}`);
        
        return true;
    } catch (error) {
        console.error('❌ Error injecting data:', error);
        return false;
    }
}

// Function to verify data injection
function verifyData() {
    try {
        const clients = JSON.parse(localStorage.getItem('dyna_clients') || '[]');
        const users = JSON.parse(localStorage.getItem('dyna_users') || '[]');
        const branches = JSON.parse(localStorage.getItem('dyna_branches') || '[]');
        const reports = JSON.parse(localStorage.getItem('dyna_reports') || '[]');
        
        console.log('📊 Data Verification:');
        console.log(`Clients: ${clients.length}`);
        console.log(`Users: ${users.length}`);
        console.log(`Branches: ${branches.length}`);
        console.log(`Reports: ${reports.length}`);
        
        return {
            clients: clients.length,
            users: users.length,
            branches: branches.length,
            reports: reports.length
        };
    } catch (error) {
        console.error('❌ Error verifying data:', error);
        return null;
    }
}

// Auto-inject data when script loads
if (typeof window !== 'undefined') {
    console.log('🚀 Dynapharm Data Injection Script Loaded');
    console.log('💾 Auto-injecting data...');
    
    if (injectData()) {
        console.log('✅ Data injection completed successfully!');
        console.log('🔄 Refreshing page to apply changes...');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

// Export functions for manual use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { injectData, verifyData, LOCAL_DATA };
}
